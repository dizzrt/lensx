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

    fake.setConnectHandler(async () => createPluginRuntimeContextFixture({ hostApiVersion: '0.2.0' }));
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
});
