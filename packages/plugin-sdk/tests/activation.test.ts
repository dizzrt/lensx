import type { PluginActionActivation } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';
import { createPluginSdk } from '../src/index.js';
import {
  deferred,
  FakeCancellationSignal,
  FakePluginSdkTransport,
  validRuntimeContext,
} from './fixtures/fake-transport.js';

const activation = (invocationId: number, source: 'normal' | 'shortcut' = 'shortcut'): PluginActionActivation => ({
  actionId: 'open',
  invocationId,
  source,
});
const batch = (activations: readonly PluginActionActivation[]) => ({
  method: 'actions.subscribe_activations',
  result: { activations },
});
const fixture = () => {
  const transport = new FakePluginSdkTransport();
  transport.connectImplementation = async () =>
    validRuntimeContext(['actions.get_activation', 'actions.subscribe_activations', 'storage.get']);
  transport.requestImplementation = async () => batch([]);
  return transport;
};
const tick = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

describe('SDK action activation', () => {
  test('merges early events with the initial batch, orders and deduplicates before ready callbacks', async () => {
    const transport = fixture();
    const pending = deferred<unknown>();
    transport.requestImplementation = () => pending.promise;
    const seen: number[] = [];
    const client = createPluginSdk({
      transport,
      onShortcutActivated: (value) => {
        expect(client.state).toBe('ready');
        expect(client.activation).toEqual(value);
        expect(Object.isFrozen(value)).toBe(true);
        seen.push(value.invocationId);
      },
    });
    expect(client.activation).toBeUndefined();
    const initialize = client.initialize();
    expect(client.initialize()).toBe(initialize);
    await tick();
    transport.emit('actions.activated', activation(3));
    transport.emit('actions.activated', activation(2, 'normal'));
    expect(seen).toEqual([]);
    pending.resolve(batch([activation(1), activation(2, 'normal')]));
    await initialize;
    expect(seen).toEqual([1, 3]);
    transport.emit('actions.activated', activation(3));
    transport.emit('actions.activated', activation(4, 'normal'));
    expect(seen).toEqual([1, 3]);
    expect(client.activation).toEqual(activation(4, 'normal'));
    await client.dispose();
  });

  test('callback can request after ready; throwing and rejected callbacks do not block subsequent calls', async () => {
    const transport = fixture();
    transport.requestImplementation = async ({ method }) =>
      method === 'actions.subscribe_activations'
        ? batch([activation(1)])
        : { method: 'storage.get', result: { found: false } };
    const seen: number[] = [];
    const client = createPluginSdk({
      transport,
      onShortcutActivated: (value) => {
        seen.push(value.invocationId);
        if (value.invocationId === 1)
          return client.request({ method: 'storage.get', params: { key: 'x' } }).then(() => undefined);
        if (value.invocationId === 2) throw new Error('private business failure');
        return Promise.reject(new Error('private async business failure'));
      },
    });
    await client.initialize();
    for (let id = 2; id < 5; id += 1) transport.emit('actions.activated', activation(id));
    await tick();
    expect(client.state).toBe('ready');
    expect(seen).toEqual([1, 2, 3, 4]);
    await client.dispose();
  });

  test('no callback consumes an unbounded sequence with only a current snapshot', async () => {
    const transport = fixture();
    const client = createPluginSdk({ transport });
    await client.initialize();
    for (let id = 1; id <= 1000; id += 1) transport.emit('actions.activated', activation(id));
    expect(client.state).toBe('ready');
    expect(client.activation?.invocationId).toBe(1000);
    await client.dispose();
    expect(client.activation).toBeUndefined();
  });

  test('missing activation capability remains ready without requesting a subscription', async () => {
    const transport = new FakePluginSdkTransport();
    const client = createPluginSdk({
      transport,
      onShortcutActivated: () => {
        throw new Error('not called');
      },
    });
    await client.initialize();
    expect(client.activation).toBeNull();
    expect(transport.requestSignals).toHaveLength(0);
    await expect(client.request({ method: 'actions.get_activation', params: {} })).rejects.toMatchObject({
      code: 'invalid_argument',
    });
    await client.dispose();
  });

  test.each([
    'timeout',
    'cancelled',
    'invalid',
    'disconnected',
    'overflow',
  ] as const)('terminates an activation attempt on %s and disposes once', async (failure) => {
    const transport = fixture();
    const pending = deferred<unknown>();
    transport.requestImplementation = () => pending.promise;
    const signal = new FakeCancellationSignal();
    const seen: number[] = [];
    const client = createPluginSdk({
      transport,
      timeoutMs: failure === 'timeout' ? 20 : 1000,
      onShortcutActivated: (value) => {
        seen.push(value.invocationId);
      },
    });
    const initialize = client.initialize({ signal });
    const rejected = expect(initialize).rejects.toBeDefined();
    await tick();
    if (failure === 'cancelled') signal.abort();
    if (failure === 'invalid')
      pending.resolve({
        method: 'actions.subscribe_activations',
        result: { activations: [{ ...activation(1), private: true }] },
      });
    if (failure === 'disconnected') transport.disconnect();
    if (failure === 'overflow') for (let id = 1; id <= 65; id += 1) transport.emit('actions.activated', activation(id));
    await rejected;
    expect(client.state).toBe('disconnected');
    expect(client.activation).toBeUndefined();
    pending.resolve(batch([activation(1)]));
    await tick();
    expect(seen).toEqual([]);
    await expect(client.initialize()).rejects.toMatchObject({ code: 'disconnected' });
    await client.dispose();
    await client.dispose();
    expect(transport.disposeCalls).toBe(1);
  });

  test('allows exactly 64 distinct initialization calls, ignores duplicate delivery and releases tails on disposal', async () => {
    const transport = fixture();
    const pending = deferred<unknown>();
    transport.requestImplementation = () => pending.promise;
    const seen: number[] = [];
    const client = createPluginSdk({
      transport,
      onShortcutActivated: (value) => {
        seen.push(value.invocationId);
        if (value.invocationId === 2) void client.dispose();
      },
    });
    const initialize = client.initialize();
    await tick();
    for (let id = 33; id <= 64; id += 1) transport.emit('actions.activated', activation(id));
    pending.resolve(batch(Array.from({ length: 32 }, (_, index) => activation(index + 1))));
    await initialize;
    expect(seen).toEqual([1, 2]);
    transport.emit('actions.activated', activation(65));
    expect(seen).toEqual([1, 2]);
    expect(client.activation).toBeUndefined();
    await client.dispose();
  });
});

test('starts later activations without awaiting business promises and isolates rejection after disposal', async () => {
  const transport = fixture();
  const business = deferred<void>();
  const seen: number[] = [];
  const sdk = createPluginSdk({
    transport,
    onShortcutActivated: ({ invocationId }) => {
      seen.push(invocationId);
      return business.promise;
    },
  });
  await sdk.initialize();
  transport.emit('actions.activated', activation(1));
  transport.emit('actions.activated', activation(2));
  expect(seen).toEqual([1, 2]);
  await sdk.dispose();
  business.reject(new Error('private late business rejection'));
  transport.emit('actions.activated', activation(3));
  await tick();
  expect(seen).toEqual([1, 2]);
  expect(sdk.state).toBe('disposed');
});

test('releases a listener that synchronously terminates the SDK while subscribe installs it', async () => {
  const transport = fixture();
  let released = 0;
  transport.subscribe = (_event, listener) => {
    listener({ actionId: 'open', invocationId: 0, source: 'shortcut' });
    return () => {
      released += 1;
    };
  };
  const sdk = createPluginSdk({ transport });
  await expect(sdk.initialize()).rejects.toMatchObject({ code: 'disconnected' });
  expect(sdk.state).toBe('disconnected');
  expect(released).toBe(1);
  expect(transport.requestSignals).toHaveLength(0);
  await sdk.dispose();
  expect(released).toBe(1);
  expect(transport.disposeCalls).toBe(1);
});
