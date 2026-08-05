import { describe, expect, test } from '@rstest/core';

import { createDeferred, FakePluginSdkTransport, PluginTestCancellationController } from '../src/index.js';

describe('Fake Plugin SDK transport', () => {
  test('connects with fresh valid contexts and keeps instances isolated', async () => {
    const first = new FakePluginSdkTransport();
    const second = new FakePluginSdkTransport();
    const firstSignal = new PluginTestCancellationController();
    const secondSignal = new PluginTestCancellationController();

    const firstContext = await first.connect({ signal: firstSignal });
    const nextFirstContext = await first.connect({ signal: firstSignal });
    await second.connect({ signal: secondSignal });

    expect(firstContext).not.toBe(nextFirstContext);
    expect(first.observation.connectAttempts).toBe(2);
    expect(second.observation.connectAttempts).toBe(1);
    expect(first.observation.connectSignals).toEqual([firstSignal, firstSignal]);
    expect(second.observation.connectSignals).toEqual([secondSignal]);
    expect(Object.isFrozen(first.observation)).toBe(true);
    expect(Object.isFrozen(first.observation.connectSignals)).toBe(true);
  });

  test('records semantic requests and signals without retaining handler failures', async () => {
    const signal = new PluginTestCancellationController();
    const privateFailure = new Error('private transport stack');
    const fake = new FakePluginSdkTransport({
      request: async () => {
        throw privateFailure;
      },
    });

    await expect(fake.request({ method: 'ui.close', params: {}, signal })).rejects.toBe(privateFailure);
    expect(fake.observation.requests).toEqual([{ method: 'ui.close', params: {}, signal }]);
    expect(JSON.stringify(fake.observation)).not.toContain('private transport stack');
  });

  test('emits abstract events, unsubscribes idempotently, disconnects once, and disposes predictably', () => {
    const fake = new FakePluginSdkTransport();
    const events: unknown[] = [];
    let disconnects = 0;
    const unsubscribe = fake.subscribe('runtime.context_changed', (payload) => events.push(payload));
    fake.onDisconnect(() => {
      disconnects += 1;
    });

    fake.emit('runtime.context_changed', { value: 1 });
    unsubscribe();
    unsubscribe();
    fake.emit('runtime.context_changed', { value: 2 });
    fake.disconnect();
    fake.disconnect();
    fake.dispose();
    fake.dispose();

    expect(events).toEqual([{ value: 1 }]);
    expect(disconnects).toBe(1);
    expect(fake.observation).toMatchObject({
      disconnectCalls: 2,
      disconnectListenerCount: 0,
      disposeCalls: 1,
      subscriptions: [{ active: false, event: 'runtime.context_changed' }],
    });
  });

  test('allows handlers to remain pending and exposes their structured cancellation signal', async () => {
    const pending = createDeferred<unknown>();
    let receivedSignal: unknown;
    const fake = new FakePluginSdkTransport({
      connect: ({ signal }) => {
        receivedSignal = signal;
        return pending.promise;
      },
    });
    const signal = new PluginTestCancellationController();
    const result = fake.connect({ signal });
    await Promise.resolve();

    expect(receivedSignal).toBe(signal);
    signal.abort();
    pending.resolve({ late: true });
    await expect(result).resolves.toEqual({ late: true });
  });
});
