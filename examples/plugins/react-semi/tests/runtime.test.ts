import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { describe, expect, test } from '@rstest/core';

import { createReactPluginRuntime, type ReactPluginRuntimeState } from '../src/runtime.js';

const waitForState = async (
  states: readonly ReactPluginRuntimeState[],
  predicate: (state: ReactPluginRuntimeState) => boolean,
): Promise<void> => {
  const deadline = Date.now() + 500;
  while (!states.some(predicate)) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for React template Runtime state.');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

describe('React template Runtime controller', () => {
  test('publishes ready and full context replacement through the real SDK', async () => {
    const fake = new FakePluginSdkTransport();
    const states: ReactPluginRuntimeState[] = [];
    const runtime = createReactPluginRuntime(
      () => fake,
      (state) => states.push(state),
    );
    await waitForState(states, (state) => state.kind === 'ready');
    const replacement = createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' });
    fake.emit('runtime.context_changed', replacement);
    expect(states.at(-1)).toEqual({ kind: 'ready', context: replacement });
    await runtime.dispose();
    await runtime.dispose();
    expect(fake.observation.disposeCalls).toBe(1);
  });

  test('replaces failed attempts and ignores a late initialization callback', async () => {
    const deferred = createDeferred<unknown>();
    const stale = new FakePluginSdkTransport({ connect: () => deferred.promise });
    const current = new FakePluginSdkTransport({
      connect: async () => createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }),
    });
    const transports = [stale, current];
    const states: ReactPluginRuntimeState[] = [];
    const runtime = createReactPluginRuntime(
      () => {
        const next = transports.shift();
        if (next === undefined) throw new Error('Unexpected extra React Runtime attempt.');
        return next;
      },
      (state) => states.push(state),
    );
    await waitForState(states, (state) => state.kind === 'loading');
    await runtime.retry();
    await waitForState(states, (state) => state.kind === 'ready');
    deferred.resolve(createPluginRuntimeContextFixture());
    await Promise.resolve();
    expect(states.at(-1)).toEqual({
      kind: 'ready',
      context: createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }),
    });
    expect(stale.observation.disposeCalls).toBe(1);
    await runtime.dispose();
  });

  test('uses bounded error state for failure and disconnect', async () => {
    const failed = new FakePluginSdkTransport({ connect: async () => Promise.reject(new Error('/private/path')) });
    const states: ReactPluginRuntimeState[] = [];
    const runtime = createReactPluginRuntime(
      () => failed,
      (state) => states.push(state),
    );
    await waitForState(states, (state) => state.kind === 'error');
    expect(states.at(-1)).toEqual({ kind: 'error', context: undefined });
    expect(JSON.stringify(states)).not.toContain('/private/path');
    expect(failed.observation.connectAttempts).toBe(1);
    await runtime.dispose();
  });
});
