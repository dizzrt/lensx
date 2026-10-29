import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { describe, expect, test } from '@rstest/core';

import { type ConfigLensRuntimeState, createConfigLensRuntime } from '../src/runtime.js';

const waitFor = async (states: readonly ConfigLensRuntimeState[], kind: ConfigLensRuntimeState['kind']) => {
  const deadline = Date.now() + 500;
  while (!states.some((state) => state.kind === kind)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${kind}.`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

describe('ConfigLens SDK lifecycle', () => {
  test('publishes ready, full context replacement, disconnect and idempotent cleanup', async () => {
    const fake = new FakePluginSdkTransport();
    const states: ConfigLensRuntimeState[] = [];
    const runtime = createConfigLensRuntime(
      () => fake,
      (state) => states.push(state),
    );
    await waitFor(states, 'ready');
    const replacement = createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' });
    fake.emit('runtime.context_changed', replacement);
    expect(states.at(-1)).toEqual({ kind: 'ready', context: replacement });
    fake.disconnect();
    expect(states.at(-1)).toEqual({ kind: 'error', context: replacement });
    await runtime.dispose();
    await runtime.dispose();
    expect(fake.observation.disposeCalls).toBe(1);
  });

  test('explicit retry supersedes a failed or late attempt without exposing errors', async () => {
    const deferred = createDeferred<unknown>();
    const stale = new FakePluginSdkTransport({ connect: () => deferred.promise });
    const current = new FakePluginSdkTransport({
      connect: async () => createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }),
    });
    const transports = [stale, current];
    const states: ConfigLensRuntimeState[] = [];
    const runtime = createConfigLensRuntime(
      () => {
        const next = transports.shift();
        if (next === undefined) throw new Error('Unexpected transport attempt.');
        return next;
      },
      (state) => states.push(state),
    );
    await waitFor(states, 'loading');
    await runtime.retry();
    await waitFor(states, 'ready');
    deferred.resolve(createPluginRuntimeContextFixture());
    await Promise.resolve();
    expect(states.at(-1)).toEqual({
      kind: 'ready',
      context: createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }),
    });
    expect(JSON.stringify(states)).not.toContain('/private');
    await runtime.dispose();
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
  const states: ConfigLensRuntimeState[] = [];
  const runtime = createConfigLensRuntime(
    () => fake,
    (state) => states.push(state),
  );
  await waitFor(states, 'ready');
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
