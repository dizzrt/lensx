import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { describe, expect, test } from '@rstest/core';

import { createFrameworkNeutralRuntime, type FrameworkNeutralRuntimeState } from '../src/runtime.js';

const waitForState = async (
  states: readonly FrameworkNeutralRuntimeState[],
  predicate: (state: FrameworkNeutralRuntimeState) => boolean,
): Promise<void> => {
  const deadline = Date.now() + 500;
  while (!states.some(predicate)) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for template Runtime state.');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

describe('framework-neutral Runtime controller', () => {
  test('initializes the real SDK, replaces the complete context, disconnects, and disposes idempotently', async () => {
    const fake = new FakePluginSdkTransport({
      connect: async () => createPluginRuntimeContextFixture({ capabilities: ['runtime.get_context'] }),
    });
    const states: FrameworkNeutralRuntimeState[] = [];
    const runtime = createFrameworkNeutralRuntime({
      createTransport: () => fake,
      render: (state) => states.push(state),
    });
    await waitForState(states, (state) => state.kind === 'ready');
    expect(states.at(-1)).toEqual({
      kind: 'ready',
      context: createPluginRuntimeContextFixture({ capabilities: ['runtime.get_context'] }),
    });

    const replacement = createPluginRuntimeContextFixture({ capabilities: [], locale: 'zh-CN', theme: 'dark' });
    fake.emit('runtime.context_changed', replacement);
    expect(states.at(-1)).toEqual({ kind: 'ready', context: replacement });
    fake.disconnect();
    expect(states.at(-1)).toEqual({ kind: 'error', context: replacement });

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();
    await Promise.all([firstDispose, secondDispose]);
    expect(fake.observation.disposeCalls).toBe(1);
    expect(fake.observation.subscriptions.every(({ active }) => !active)).toBe(true);
  });

  test('uses a fresh transport for explicit retry and ignores late callbacks from the replaced attempt', async () => {
    const pending = createDeferred<unknown>();
    const failed = new FakePluginSdkTransport({ connect: () => pending.promise });
    const recovered = new FakePluginSdkTransport({
      connect: async () => createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }),
    });
    const transports = [failed, recovered];
    const states: FrameworkNeutralRuntimeState[] = [];
    const runtime = createFrameworkNeutralRuntime({
      createTransport: () => {
        const next = transports.shift();
        if (next === undefined) throw new Error('Unexpected extra template Runtime attempt.');
        return next;
      },
      render: (state) => states.push(state),
    });
    await waitForState(states, (state) => state.kind === 'loading');
    await runtime.retry();
    await waitForState(states, (state) => state.kind === 'ready');
    pending.resolve(createPluginRuntimeContextFixture());
    await Promise.resolve();

    expect(states.at(-1)).toEqual({
      kind: 'ready',
      context: createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }),
    });
    expect(failed.observation.disposeCalls).toBe(1);
    await runtime.dispose();
    expect(recovered.observation.disposeCalls).toBe(1);
  });

  test('renders a bounded error for a private initialization failure and never retries automatically', async () => {
    const fake = new FakePluginSdkTransport({ connect: async () => Promise.reject(new Error('/private/path')) });
    const states: FrameworkNeutralRuntimeState[] = [];
    const runtime = createFrameworkNeutralRuntime({
      createTransport: () => fake,
      render: (state) => states.push(state),
    });
    await waitForState(states, (state) => state.kind === 'error');
    expect(states.at(-1)).toEqual({ kind: 'error', context: undefined });
    expect(JSON.stringify(states)).not.toContain('/private/path');
    expect(fake.observation.connectAttempts).toBe(1);
    await runtime.dispose();
  });
});
