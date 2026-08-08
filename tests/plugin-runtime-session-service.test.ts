import { describe, expect, rs, test } from '@rstest/core';
import type {
  PluginRuntimeScheduler,
  PluginRuntimeSessionAdapters,
  PluginRuntimeSessionMessageChannel,
  PluginRuntimeSessionMessageEvent,
  PluginRuntimeSessionMessagePort,
} from '../src/app/plugins/runtime';
import {
  createPluginRuntimeSessionService,
  PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS,
} from '../src/app/plugins/runtime';

const nonce = '0123456789abcdef0123456789abcdef';
const secondNonce = 'fedcba9876543210fedcba9876543210';
const identity = Object.freeze({
  entry_id: 'entry_0123456789abcdef',
  plugin_id: 'com.acme.workspace',
  version: '1.2.3',
  page_id: 'home',
  expected_origin: 'https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '7',
});

class FakePort implements PluginRuntimeSessionMessagePort {
  onmessage: ((event: PluginRuntimeSessionMessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly start = rs.fn();
  readonly close = rs.fn();
  readonly postMessage = rs.fn();

  emit(data: unknown) {
    this.onmessage?.({ data });
  }

  emitError() {
    this.onmessageerror?.();
  }
}

class VirtualScheduler implements PluginRuntimeScheduler {
  readonly callbacks = new Map<number, () => void>();
  #sequence = 0;
  readonly now = () => 0;
  readonly setTimeout = (callback: () => void) => {
    const handle = ++this.#sequence;
    this.callbacks.set(handle, callback);
    return handle;
  };
  readonly clearTimeout = (handle: unknown) => {
    if (typeof handle === 'number') this.callbacks.delete(handle);
  };
  expireAll() {
    for (const [handle, callback] of [...this.callbacks]) {
      this.callbacks.delete(handle);
      callback();
    }
  }
}

const harness = (nonces: readonly string[] = [nonce], scheduler?: PluginRuntimeScheduler) => {
  const channels: PluginRuntimeSessionMessageChannel[] = [];
  let nonceIndex = 0;
  const adapters: PluginRuntimeSessionAdapters = {
    createNonce: () => nonces[nonceIndex++] ?? secondNonce,
    createMessageChannel: () => {
      const channel = { port1: new FakePort(), port2: new FakePort() };
      channels.push(channel);
      return channel;
    },
  };
  const postMessage = rs.fn();
  const service = createPluginRuntimeSessionService(adapters, scheduler);
  const start = () =>
    service.start({
      identity,
      targetWindow: { postMessage },
      targetOrigin: identity.expected_origin,
    });
  return { channels, postMessage, service, start };
};

const acknowledgement = (value = nonce) => ({
  contract_version: '0.1.0',
  type: 'lensx.plugin_runtime.ready',
  nonce: value,
});

describe('PluginRuntimeSessionService', () => {
  test('transfers one child Port to the exact target and publishes ready only after one exact acknowledgement', () => {
    const current = harness();
    const session = current.start();
    const channel = current.channels[0] as { port1: FakePort; port2: FakePort };
    expect(session.snapshot()).toMatchObject({ state: 'awaiting_handshake', identity });
    expect(session.snapshot()).not.toHaveProperty('lease');
    expect(channel.port1.start).toHaveBeenCalledTimes(1);
    expect(current.postMessage).toHaveBeenCalledTimes(1);
    expect(current.postMessage).toHaveBeenCalledWith(
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.bootstrap', nonce },
      identity.expected_origin,
      [channel.port2],
    );

    channel.port1.emit(acknowledgement());
    const ready = session.snapshot();
    expect(ready.state).toBe('ready');
    expect(ready.lease).toEqual({ identity: ready.identity, port: channel.port1 });
    expect(Object.isFrozen(ready)).toBe(true);
    expect(Object.isFrozen(ready.lease)).toBe(true);
    expect(ready).not.toHaveProperty('nonce');
  });

  test.each([
    ['wrong nonce', acknowledgement(secondNonce)],
    ['unknown version', { ...acknowledgement(), contract_version: '0.2.0' }],
    ['extra identity', { ...acknowledgement(), plugin_id: identity.plugin_id }],
    ['wrong type', { ...acknowledgement(), nonce: 42 }],
  ])('fails closed for %s without exposing private values', (_name, payload) => {
    const current = harness();
    const session = current.start();
    const channel = current.channels[0] as { port1: FakePort; port2: FakePort };
    channel.port1.emit(payload);
    const result = session.snapshot();
    expect(result).toMatchObject({ state: 'disconnected', error_code: 'invalid_acknowledgement' });
    expect(result).not.toHaveProperty('lease');
    expect(JSON.stringify(result.error_code)).not.toContain(nonce);
    expect(channel.port1.close).toHaveBeenCalledTimes(1);
    expect(channel.port2.close).toHaveBeenCalledTimes(1);
  });

  test('rejects replay, Port errors, cross-Session late events, and Host disconnect', () => {
    const current = harness([nonce, secondNonce]);
    const first = current.start();
    const firstChannel = current.channels[0] as { port1: FakePort; port2: FakePort };
    firstChannel.port1.emit(acknowledgement());
    firstChannel.port1.emit(acknowledgement());
    expect(first.snapshot()).toMatchObject({ state: 'disconnected', error_code: 'invalid_acknowledgement' });

    const second = current.start();
    const secondChannel = current.channels[1] as { port1: FakePort; port2: FakePort };
    firstChannel.port1.emit(acknowledgement(secondNonce));
    expect(second.snapshot().state).toBe('awaiting_handshake');
    secondChannel.port1.emit(acknowledgement(secondNonce));
    expect(second.snapshot().state).toBe('ready');
    secondChannel.port1.emitError();
    expect(second.snapshot()).toMatchObject({ state: 'disconnected', error_code: 'port_disconnected' });

    const third = current.start();
    current.service.disconnect();
    expect(third.snapshot().state).toBe('disconnected');
  });

  test('keeps one active Session and makes competing cleanup and late acknowledgement idempotent', () => {
    const current = harness([nonce, secondNonce]);
    const first = current.start();
    const firstChannel = current.channels[0] as { port1: FakePort; port2: FakePort };
    const second = current.start();
    expect(first.snapshot().state).toBe('disposed');
    expect(current.service.current()).toBe(second);
    expect(firstChannel.port1.close).toHaveBeenCalledTimes(1);
    expect(firstChannel.port2.close).toHaveBeenCalledTimes(1);

    firstChannel.port1.emit(acknowledgement());
    first.dispose();
    first.dispose();
    expect(first.snapshot().state).toBe('disposed');
    expect(firstChannel.port1.close).toHaveBeenCalledTimes(1);
    expect(second.snapshot().state).toBe('awaiting_handshake');

    second.dispose();
    second.dispose();
    expect(second.snapshot().state).toBe('disposed');
    expect(current.service.current()).toBeUndefined();
  });

  test('rejects target-origin mismatch and postMessage failure with bounded errors', () => {
    const current = harness();
    expect(() =>
      current.service.start({
        identity,
        targetWindow: { postMessage: current.postMessage },
        targetOrigin: 'https://wrong.invalid',
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_identity' }));

    current.postMessage.mockImplementation(() => {
      throw new Error(`private ${nonce} ${identity.entry_id}`);
    });
    expect(() => current.start()).toThrow(expect.objectContaining({ code: 'bootstrap_failed' }));
    expect(current.channels[0]?.port1.close).toHaveBeenCalledTimes(1);
    expect(current.channels[0]?.port2.close).toHaveBeenCalledTimes(1);
  });

  test('starts the fixed deadline only after bootstrap, clears it on ready, and fails a never-acknowledged Session', async () => {
    expect(PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS).toBe(5_000);
    const scheduler = new VirtualScheduler();
    const fail = rs.fn(async () => undefined);
    const current = harness([nonce, secondNonce], scheduler);
    const session = current.service.start({
      identity,
      targetWindow: { postMessage: current.postMessage },
      targetOrigin: identity.expected_origin,
      owningAttempt: { isCurrent: () => true, fail },
    });
    expect(scheduler.callbacks.size).toBe(1);
    scheduler.expireAll();
    expect(session.snapshot()).toMatchObject({ state: 'disconnected', error_code: 'handshake_timeout' });
    expect(fail).toHaveBeenCalledWith('runtime_handshake_timeout');

    const ready = current.service.start({
      identity: { ...identity, runtime_attempt_key: 'attempt-2' },
      targetWindow: { postMessage: current.postMessage },
      targetOrigin: identity.expected_origin,
      owningAttempt: { isCurrent: () => true, fail },
    });
    const second = current.channels[1] as { port1: FakePort; port2: FakePort };
    second.port1.emit(acknowledgement(secondNonce));
    expect(ready.snapshot().state).toBe('ready');
    expect(scheduler.callbacks.size).toBe(0);
    scheduler.expireAll();
    expect(ready.snapshot().state).toBe('ready');
  });
});
