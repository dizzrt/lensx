import { createPluginSdk, PluginSdkError } from '@lensx/plugin-sdk';
import { describe, expect, test } from '@rstest/core';

import {
  createDeferred,
  createPluginRuntimeContextFixture,
  FakePluginSdkTransport,
  PluginTestCancellationController,
} from '../src/index.js';

describe('real Plugin SDK lifecycle through the public Testkit', () => {
  test('initializes, publishes state, and disposes idempotently', async () => {
    const fake = new FakePluginSdkTransport();
    const client = createPluginSdk({ transport: fake });
    const states: string[] = [];
    client.subscribeState((state) => states.push(state));

    await expect(client.initialize()).resolves.toEqual(createPluginRuntimeContextFixture());
    expect(client.state).toBe('ready');
    expect(fake.observation.connectAttempts).toBe(1);
    const firstDispose = client.dispose();
    const secondDispose = client.dispose();
    expect(secondDispose).toBe(firstDispose);
    await firstDispose;
    expect(client.state).toBe('disposed');
    expect(fake.observation.disposeCalls).toBe(1);
    expect(states).toEqual(['initializing', 'ready', 'disposed']);
  });

  test('uses real SDK errors for invalid and incompatible context', async () => {
    const fake = new FakePluginSdkTransport();
    const client = createPluginSdk({ transport: fake });
    fake.setConnectHandler(async () => ({ ...createPluginRuntimeContextFixture(), locale: 'invalid' }));
    await expect(client.initialize()).rejects.toMatchObject({ code: 'invalid_runtime_context' });
    expect(client.state).toBe('idle');

    fake.setConnectHandler(async () => createPluginRuntimeContextFixture({ hostApiVersion: '0.3.0' }));
    await expect(client.initialize()).rejects.toMatchObject({ code: 'incompatible_host_api' });
    expect(client.state).toBe('idle');
  });

  test('maps private transport failures safely and supports explicit retry', async () => {
    const fake = new FakePluginSdkTransport({
      connect: async () => {
        throw new Error('private stack and Host object');
      },
    });
    const client = createPluginSdk({ transport: fake });

    await expect(client.initialize()).rejects.toEqual(new PluginSdkError('transport_failure'));
    expect(client.state).toBe('idle');
    fake.setConnectHandler(async () => createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }));
    await expect(client.initialize()).resolves.toMatchObject({ locale: 'zh-CN', theme: 'dark' });
    expect(fake.observation.connectAttempts).toBe(2);
  });

  test('cancels and times out pending initialization and ignores late completion', async () => {
    const cancellation = new PluginTestCancellationController();
    const cancelledConnection = createDeferred<unknown>();
    const cancelledFake = new FakePluginSdkTransport({ connect: () => cancelledConnection.promise });
    const cancelledClient = createPluginSdk({ transport: cancelledFake });
    const cancelledInitialization = cancelledClient.initialize({ signal: cancellation.signal });
    await Promise.resolve();
    cancellation.abort();

    await expect(cancelledInitialization).rejects.toMatchObject({ code: 'cancelled' });
    expect(cancelledFake.observation.connectSignals[0]?.aborted).toBe(true);
    cancelledConnection.resolve(createPluginRuntimeContextFixture());
    await Promise.resolve();
    expect(cancelledClient.state).toBe('idle');

    const timedOutConnection = createDeferred<unknown>();
    const timedOutFake = new FakePluginSdkTransport({ connect: () => timedOutConnection.promise });
    const timedOutClient = createPluginSdk({ transport: timedOutFake, timeoutMs: 5 });
    await expect(timedOutClient.initialize()).rejects.toMatchObject({ code: 'timeout' });
    expect(timedOutFake.observation.connectSignals[0]?.aborted).toBe(true);
    timedOutConnection.resolve(createPluginRuntimeContextFixture());
    await Promise.resolve();
    expect(timedOutClient.state).toBe('idle');
  });

  test('makes Host disconnect terminal during pending initialization and ignores late results', async () => {
    const connection = createDeferred<unknown>();
    const fake = new FakePluginSdkTransport({ connect: () => connection.promise });
    const client = createPluginSdk({ transport: fake });
    const states: string[] = [];
    client.subscribeState((state) => states.push(state));
    const initialization = client.initialize();
    await Promise.resolve();

    fake.disconnect();
    await expect(initialization).rejects.toMatchObject({ code: 'disconnected' });
    expect(fake.observation.connectSignals[0]?.aborted).toBe(true);
    connection.resolve(createPluginRuntimeContextFixture());
    await Promise.resolve();
    expect(client.state).toBe('disconnected');
    expect(states).toEqual(['initializing', 'disconnected']);
  });

  test('drives typed requests, Host errors, context events, and request cancellation without exposing wire controls', async () => {
    const pending = createDeferred<unknown>();
    const fake = new FakePluginSdkTransport({
      connect: async () => createPluginRuntimeContextFixture({ capabilities: ['storage.get', 'ui.close'] }),
      request: (request) => {
        if (request.method === 'ui.close') {
          throw { code: 'unavailable', message: 'The Host API is unavailable.' };
        }
        return pending.promise;
      },
    });
    const client = createPluginSdk({ transport: fake });
    await client.initialize();
    const operation = client.request({ method: 'storage.get', params: { key: 'example' } });
    pending.resolve({ method: 'storage.get', result: { found: true, value: 'value' } });
    await expect(operation).resolves.toEqual({ found: true, value: 'value' });
    await expect(client.request({ method: 'ui.close', params: {} })).rejects.toEqual({
      code: 'unavailable',
      message: 'The Host API is unavailable.',
    });

    const observed: unknown[] = [];
    client.subscribe('runtime.context_changed', (event) => observed.push([client.context, event]));
    fake.emit('runtime.context_changed', createPluginRuntimeContextFixture({ capabilities: [], theme: 'dark' }));
    expect(observed).toEqual([[client.context, { event: 'runtime.context_changed', payload: client.context }]]);
    expect(fake.observation).not.toHaveProperty('origin');
    expect(fake.observation).not.toHaveProperty('port');
    expect(fake.observation).not.toHaveProperty('identity');
    expect(fake.observation).not.toHaveProperty('bridge');
    expect(fake.observation).not.toHaveProperty('sourceLabel');
    expect(fake.observation).not.toHaveProperty('nativeHandle');
    expect(fake.observation).not.toHaveProperty('resourceGeneration');
  });
});
