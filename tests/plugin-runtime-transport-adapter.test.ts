import type { HostApiEvent } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';

import type { PluginRuntimeSessionMessageEvent, PluginRuntimeSessionMessagePort } from '../src/app/plugins/runtime';
import {
  attachPluginRuntimeTransport,
  createPluginRuntimeTransportPostResponseOutcome,
  type PluginRuntimeTransportHandler,
  type PluginRuntimeTransportHandlerResult,
  unavailablePluginRuntimeTransportHandler,
} from '../src/app/plugins/runtime';

class FakePort implements PluginRuntimeSessionMessagePort {
  onmessage: ((event: PluginRuntimeSessionMessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly close = rs.fn();
  readonly postMessage = rs.fn();
  readonly start = rs.fn();
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  emitError() {
    this.onmessageerror?.();
  }
}

const identity = Object.freeze({
  entry_id: 'entry_0123456789abcdef',
  plugin_id: 'com.acme.workspace',
  version: '1.2.3',
  page_id: 'home',
  expected_origin: 'https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '7',
  granted_permission_ids: Object.freeze(['clipboard.read']),
});
const request = (id: string, method = 'ui.close', params: unknown = {}) => ({
  contract_version: '0.1.0',
  type: 'lensx.plugin_transport.request',
  request_id: id,
  request: { method, params },
});

describe('Host-private Plugin Runtime transport adapter', () => {
  test('injects only frozen lease identity and returns Contract-valid out-of-order results', async () => {
    const port = new FakePort();
    const completions = new Map<string, (value: PluginRuntimeTransportHandlerResult) => void>();
    const handler = rs.fn<PluginRuntimeTransportHandler>(({ request: value }) => {
      if (value.method !== 'storage.get') throw new Error('unexpected method');
      return new Promise((resolve) => completions.set(value.params.key, resolve));
    });
    attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
    port.emit(request('request_0000000000000001', 'storage.get', { key: 'first' }));
    port.emit(request('request_0000000000000002', 'storage.get', { key: 'second' }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ identity, request: { method: 'storage.get' } });
    expect(handler.mock.calls[0]?.[0]).not.toHaveProperty('origin');
    expect(handler.mock.calls[0]?.[0]).not.toHaveProperty('port');
    completions.get('second')?.({ method: 'storage.get', result: { found: false } });
    completions.get('first')?.({ method: 'storage.get', result: { found: true, value: 'first' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(port.postMessage.mock.calls.map(([value]) => (value as { request_id: string }).request_id)).toEqual([
      'request_0000000000000002',
      'request_0000000000000001',
    ]);
  });

  test('blocks identity injection, stale Ports, duplicate IDs, and invalid frames before the handler', () => {
    for (const value of [
      { ...request('request_0000000000000001'), plugin_id: 'com.forged' },
      { ...request('request_0000000000000001'), grant: 'clipboard.read' },
      { ...request('request_0000000000000001'), path: '/private/plugin' },
    ]) {
      const port = new FakePort();
      const handler = rs.fn<PluginRuntimeTransportHandler>();
      attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
      port.emit(value);
      expect(handler).not.toHaveBeenCalled();
      expect(port.close).toHaveBeenCalledTimes(1);
    }

    const stalePort = new FakePort();
    const staleHandler = rs.fn<PluginRuntimeTransportHandler>();
    attachPluginRuntimeTransport({
      handler: staleHandler,
      isCurrent: () => false,
      lease: { identity, port: stalePort },
    });
    stalePort.emit(request('request_0000000000000001'));
    expect(staleHandler).not.toHaveBeenCalled();
    expect(stalePort.close).toHaveBeenCalledTimes(1);
  });

  test('propagates cancellation once and suppresses late handler completion', async () => {
    const port = new FakePort();
    let signal: AbortSignal | undefined;
    let complete: ((value: PluginRuntimeTransportHandlerResult) => void) | undefined;
    const handler: PluginRuntimeTransportHandler = (input) => {
      signal = input.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    };
    attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
    port.emit(request('request_0000000000000001'));
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_0000000000000001',
    });
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_0000000000000001',
    });
    expect(signal?.aborted).toBe(true);
    complete?.({ method: 'ui.close', result: { accepted: true } });
    await Promise.resolve();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  test('delivers and terminals a valid response before running one private post-response effect', async () => {
    const order: string[] = [];
    const port = new FakePort();
    port.postMessage.mockImplementation(() => order.push('response'));
    const effect = rs.fn(() => order.push('effect'));
    const adapter = attachPluginRuntimeTransport({
      handler: () =>
        createPluginRuntimeTransportPostResponseOutcome({ method: 'ui.close', result: { accepted: true } }, effect),
      isCurrent: () => true,
      lease: { identity, port },
    });

    port.emit(request('request_0000000000000001'));
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['response', 'effect']);
    expect(effect).toHaveBeenCalledTimes(1);
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_0000000000000001',
    });
    adapter.dispose();
    adapter.dispose();
    expect(effect).toHaveBeenCalledTimes(1);
  });

  test('suppresses a post-response effect when cancellation or currentness wins before settlement', async () => {
    for (const makeStale of [false, true]) {
      const port = new FakePort();
      const effect = rs.fn();
      let current = true;
      let complete: ((value: PluginRuntimeTransportHandlerResult) => void) | undefined;
      attachPluginRuntimeTransport({
        handler: () => new Promise((resolve) => (complete = resolve)),
        isCurrent: () => current,
        lease: { identity, port },
      });
      port.emit(request('request_0000000000000001'));
      if (makeStale) current = false;
      else
        port.emit({
          contract_version: '0.1.0',
          type: 'lensx.plugin_transport.cancel',
          request_id: 'request_0000000000000001',
        });
      complete?.(
        createPluginRuntimeTransportPostResponseOutcome({ method: 'ui.close', result: { accepted: true } }, effect),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(port.postMessage).not.toHaveBeenCalled();
      expect(effect).not.toHaveBeenCalled();
    }
  });

  test('emits only valid events and converges handler, codec, messageerror, and cleanup failures safely', async () => {
    const port = new FakePort();
    const disconnect = rs.fn();
    const adapter = attachPluginRuntimeTransport({
      handler: unavailablePluginRuntimeTransportHandler,
      isCurrent: () => true,
      lease: { identity, port },
      onDisconnect: disconnect,
    });
    port.emit(request('request_0000000000000001'));
    await Promise.resolve();
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 'unavailable', message: 'The Host API is unavailable.' } }),
    );
    const event: HostApiEvent = {
      event: 'runtime.context_changed',
      payload: { capabilities: [], hostApiVersion: '0.1.0', locale: 'zh-CN', theme: 'dark' },
    };
    expect(adapter.emit(event)).toBe(true);
    expect(adapter.emit({ ...event, payload: { ...event.payload, identity: 'private' } } as never)).toBe(false);
    adapter.disconnect();
    adapter.dispose();
    port.emitError();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toMatch(/\/private\/|stack|payload.*private/u);
  });

  test('terminates on handler throw, invalid output, and method/result mismatch without leaking details', async () => {
    for (const handler of [
      (() => {
        throw new Error('/private/plugin payload stack');
      }) satisfies PluginRuntimeTransportHandler,
      (() => ({ method: 'actions.open', result: { opened: true } })) satisfies PluginRuntimeTransportHandler,
      (() => ({ private: 'Host object' }) as never) satisfies PluginRuntimeTransportHandler,
    ]) {
      const port = new FakePort();
      attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
      port.emit(request('request_0000000000000001'));
      await Promise.resolve();
      await Promise.resolve();
      expect(port.close).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(port.postMessage.mock.calls)).not.toMatch(/\/private\/|payload|stack|Host object/u);
    }
  });
});
