import { createPluginSdk } from '@lensx/plugin-sdk';
import { expect, test } from '@rstest/core';
import { createPluginRuntimeContextFixture, FakePluginSdkTransport } from '../src/index.js';

test('public Testkit exercises current activation delivery and cleanup with the real SDK', async () => {
  const seen: number[] = [];
  const fake = new FakePluginSdkTransport({
    connect: () => createPluginRuntimeContextFixture({ capabilities: ['actions.subscribe_activations'] }),
    request: () => ({
      method: 'actions.subscribe_activations',
      result: { activations: [{ actionId: 'open', invocationId: 1, source: 'shortcut' }] },
    }),
  });
  const sdk = createPluginSdk({
    transport: fake,
    onShortcutActivated: ({ invocationId }) => {
      seen.push(invocationId);
    },
  });
  await sdk.initialize();
  fake.emit('actions.activated', { actionId: 'open', invocationId: 2, source: 'normal' });
  fake.emit('actions.activated', { actionId: 'open', invocationId: 3, source: 'shortcut' });
  expect(seen).toEqual([1, 3]);
  expect(sdk.activation).toEqual({ actionId: 'open', invocationId: 3, source: 'shortcut' });
  await sdk.dispose();
  fake.emit('actions.activated', { actionId: 'open', invocationId: 4, source: 'shortcut' });
  expect(seen).toEqual([1, 3]);
  expect(fake.observation.subscriptions.every(({ active }) => !active)).toBe(true);
});
