import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { describe, expect, test } from '@rstest/core';
import { createTranslationRuntime, type RuntimeState } from '../src/runtime.js';

const flush = async () => {
  for (let index = 0; index < 20; index++) await Promise.resolve();
};
describe('Translation SDK bootstrap', () => {
  test('initializes once, replaces full Context and cleans up disconnect subscriptions', async () => {
    const fake = new FakePluginSdkTransport();
    const states: RuntimeState[] = [];
    const runtime = createTranslationRuntime(
      () => fake,
      (state) => states.push(state),
    );
    await flush();
    expect(states.at(-1)?.kind).toBe('ready');
    expect(fake.observation.connectAttempts).toBe(1);
    const next = createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark', capabilities: ['storage.get'] });
    fake.emit('runtime.context_changed', next);
    expect(states.at(-1)).toMatchObject({ kind: 'ready', context: next, attempt: 1 });
    fake.disconnect();
    await flush();
    expect(states.at(-1)).toEqual({ kind: 'error', context: next });
    const count = states.length;
    fake.emit('runtime.context_changed', createPluginRuntimeContextFixture());
    await runtime.dispose();
    await runtime.dispose();
    expect(states).toHaveLength(count);
    expect(fake.observation.disposeCalls).toBe(1);
  });
  test('retries failed initialization with a fresh SDK and discards a late attempt', async () => {
    const late = createDeferred<unknown>();
    const first = new FakePluginSdkTransport({ connect: () => late.promise });
    const failed = new FakePluginSdkTransport({ connect: () => Promise.reject(new Error('sensitive exception')) });
    const fresh = new FakePluginSdkTransport();
    const transports = [first, failed, fresh];
    const states: RuntimeState[] = [];
    const runtime = createTranslationRuntime(
      () => {
        const transport = transports.shift();
        if (!transport) throw new Error('extra client');
        return transport;
      },
      (state) => states.push(state),
    );
    await flush();
    await runtime.retry();
    expect(states.at(-1)?.kind).toBe('error');
    await runtime.retry();
    expect(states.at(-1)).toMatchObject({ kind: 'ready', attempt: 3 });
    late.resolve(createPluginRuntimeContextFixture({ locale: 'zh-CN' }));
    await flush();
    expect(states.at(-1)).toMatchObject({ kind: 'ready', context: { locale: 'en-US' } });
    await runtime.dispose();
    for (const fake of [first, failed, fresh]) expect(fake.observation.disposeCalls).toBe(1);
  });
});

test('repeated shortcut activation keeps the existing runtime without extra business requests', async () => {
  const fake = new FakePluginSdkTransport({
    connect: () => createPluginRuntimeContextFixture({ capabilities: ['actions.subscribe_activations'] }),
    request: () => ({
      method: 'actions.subscribe_activations',
      result: { activations: [{ actionId: 'open', invocationId: 1, source: 'shortcut' }] },
    }),
  });
  const states: RuntimeState[] = [];
  const runtime = createTranslationRuntime(
    () => fake,
    (state) => states.push(state),
  );
  await flush();
  expect(states.at(-1)?.kind).toBe('ready');
  const ready = states.at(-1);
  const count = states.length;
  for (let id = 2; id <= 70; id += 1) {
    fake.emit('actions.activated', { actionId: 'open', invocationId: id, source: 'shortcut' });
  }
  expect(states).toHaveLength(count);
  expect(states.at(-1)).toBe(ready);
  expect(fake.observation.connectAttempts).toBe(1);
  expect(fake.observation.requests.map(({ method }) => method)).toEqual(['actions.subscribe_activations']);
  await runtime.dispose();
});
