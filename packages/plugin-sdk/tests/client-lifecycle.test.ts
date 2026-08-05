import { describe, expect, test } from '@rstest/core';

import { createPluginSdk, PluginSdkError } from '../src/index.js';
import {
  deferred,
  FakeCancellationSignal,
  FakePluginSdkTransport,
  validRuntimeContext,
} from './fixtures/fake-transport.js';

describe('Plugin SDK client lifecycle', () => {
  test('keeps clients, state subscriptions, context, and disposal isolated', async () => {
    const firstTransport = new FakePluginSdkTransport();
    const secondTransport = new FakePluginSdkTransport();
    firstTransport.connectImplementation = async () => validRuntimeContext(['actions.open']);
    secondTransport.connectImplementation = async () => ({
      ...validRuntimeContext(['storage.get']),
      locale: 'zh-CN',
      theme: 'dark',
    });
    const first = createPluginSdk({ transport: firstTransport });
    const second = createPluginSdk({ transport: secondTransport });
    const firstStates: string[] = [];
    first.subscribeState((state) => firstStates.push(state));

    await expect(first.initialize()).resolves.toMatchObject({ capabilities: ['actions.open'] });
    await expect(second.initialize()).resolves.toMatchObject({ capabilities: ['storage.get'], locale: 'zh-CN' });
    expect(firstStates).toEqual(['initializing', 'ready']);
    expect(first.state).toBe('ready');
    expect(second.state).toBe('ready');

    await first.dispose();
    expect(first.state).toBe('disposed');
    expect(second.state).toBe('ready');
    expect(firstTransport.disposeCalls).toBe(1);
    expect(secondTransport.disposeCalls).toBe(0);
  });

  test('merges concurrent initialization into one transport connection', async () => {
    const transport = new FakePluginSdkTransport();
    const connection = deferred<unknown>();
    transport.connectImplementation = () => connection.promise;
    const client = createPluginSdk({ transport });

    const first = client.initialize();
    const second = client.initialize();
    expect(second).toBe(first);
    expect(transport.connectCalls).toBe(0);
    connection.resolve(validRuntimeContext());
    await expect(first).resolves.toMatchObject({ hostApiVersion: '0.1.0' });
    expect(transport.connectCalls).toBe(1);
  });

  test('returns to idle after cancellation, timeout, and transport failure, then retries explicitly', async () => {
    for (const failure of ['cancelled', 'timeout', 'transport_failure'] as const) {
      const transport = new FakePluginSdkTransport();
      const client = createPluginSdk({ transport, timeoutMs: failure === 'timeout' ? 5 : 100 });
      const callerSignal = new FakeCancellationSignal();
      if (failure === 'transport_failure') {
        transport.connectImplementation = async () => {
          throw new Error('private failure');
        };
      } else {
        transport.connectImplementation = () => new Promise(() => undefined);
      }

      const firstAttempt = client.initialize(failure === 'cancelled' ? { signal: callerSignal } : undefined);
      if (failure === 'cancelled') {
        callerSignal.abort();
      }
      await expect(firstAttempt).rejects.toMatchObject({ code: failure });
      expect(client.state).toBe('idle');
      expect(transport.connectCalls).toBe(1);

      transport.connectImplementation = async () => validRuntimeContext();
      await expect(client.initialize()).resolves.toMatchObject({ locale: 'en-US' });
      expect(client.state).toBe('ready');
      expect(transport.connectCalls).toBe(2);
    }
  });

  test('rejects invalid and incompatible context without publishing a partial snapshot', async () => {
    const transport = new FakePluginSdkTransport();
    const client = createPluginSdk({ transport });
    transport.connectImplementation = async () => ({ ...validRuntimeContext(), locale: 'invalid' });

    await expect(client.initialize()).rejects.toMatchObject({ code: 'invalid_runtime_context' });
    expect(client.state).toBe('idle');
    expect(client.context).toBeUndefined();

    transport.connectImplementation = async () => ({ ...validRuntimeContext(), hostApiVersion: '0.2.0' });
    await expect(client.initialize()).rejects.toMatchObject({ code: 'incompatible_host_api' });
    expect(client.state).toBe('idle');
    expect(client.context).toBeUndefined();
  });

  test('rejects invalid cancellation input before connecting and contains transport cleanup failures', async () => {
    const transport = new FakePluginSdkTransport();
    transport.onDisconnect = () => () => {
      throw new Error('private unsubscribe failure');
    };
    const client = createPluginSdk({ transport });

    await expect(client.initialize({ signal: { aborted: false } as never })).rejects.toMatchObject({
      code: 'invalid_argument',
      message: 'An SDK argument is invalid.',
    });
    expect(client.state).toBe('idle');
    expect(transport.connectCalls).toBe(0);

    transport.connectImplementation = async () => {
      throw new Error('private connect failure');
    };
    await expect(client.initialize()).rejects.toMatchObject({
      code: 'transport_failure',
      message: 'The SDK transport operation failed.',
    });
    expect(client.state).toBe('idle');
    await expect(client.dispose()).resolves.toBeUndefined();
    expect(transport.disposeCalls).toBe(1);
  });

  test('disconnects terminally, aborts initialization, and ignores late results', async () => {
    const transport = new FakePluginSdkTransport();
    const connection = deferred<unknown>();
    transport.connectImplementation = () => connection.promise;
    const client = createPluginSdk({ transport });
    const states: string[] = [];
    client.subscribeState((state) => states.push(state));
    const initialization = client.initialize();
    await Promise.resolve();

    transport.disconnect();
    await expect(initialization).rejects.toMatchObject({ code: 'disconnected' });
    expect(transport.connectSignals[0]?.aborted).toBe(true);
    expect(client.state).toBe('disconnected');
    expect(client.context).toBeUndefined();
    connection.resolve(validRuntimeContext());
    await Promise.resolve();
    expect(client.state).toBe('disconnected');
    expect(states).toEqual(['initializing', 'disconnected']);
    await expect(client.initialize()).rejects.toMatchObject({ code: 'disconnected' });
  });

  test('unsubscribes state idempotently and disposes exactly once', async () => {
    const transport = new FakePluginSdkTransport();
    const client = createPluginSdk({ transport });
    const states: string[] = [];
    const unsubscribe = client.subscribeState((state) => states.push(state));
    unsubscribe();
    unsubscribe();

    await client.initialize();
    expect(states).toEqual([]);
    const firstDispose = client.dispose();
    const secondDispose = client.dispose();
    expect(secondDispose).toBe(firstDispose);
    await expect(firstDispose).resolves.toBeUndefined();
    expect(transport.disposeCalls).toBe(1);
    expect(client.state).toBe('disposed');
    expect(client.context).toBeUndefined();
    await expect(client.initialize()).rejects.toBeInstanceOf(PluginSdkError);
    await expect(client.initialize()).rejects.toMatchObject({ code: 'disposed' });
  });
});
