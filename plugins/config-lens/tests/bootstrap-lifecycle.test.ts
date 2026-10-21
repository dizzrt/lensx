import { expect, rs, test } from '@rstest/core';
import { fireEvent, waitFor } from '@testing-library/react';

const state = rs.hoisted(() => ({
  clients: [] as { initialize: () => Promise<unknown>; dispose: () => Promise<void> }[],
  mounts: [] as { mounted: boolean }[],
  disposeWorkers: rs.fn(),
}));
rs.mock('@lensx/plugin-sdk', () => ({ createPluginSdk: () => state.clients.shift() }));
rs.mock('@lensx/plugin-sdk/webview', () => ({ createPluginWebviewTransport: () => ({}) }));
rs.mock('../src/editor/monaco.js', () => ({
  loadMonaco: async () => ({}),
  disposeMonacoWorkers: state.disposeWorkers,
}));
rs.mock('../src/mount.js', () => ({
  mountConfigLens: () => {
    const mount = { mounted: true };
    state.mounts.push(mount);
    return () => {
      mount.mounted = false;
    };
  },
}));

test('a slow old SDK disposal cannot terminate resources created by a newer retry', async () => {
  document.body.innerHTML =
    '<div id="root"></div><section id="config-lens-startup"></section><button id="config-lens-startup-retry"></button>';
  let finishOld: (() => void) | undefined;
  state.clients.push(
    {
      initialize: async () => ({ locale: 'en-US' }),
      dispose: () =>
        new Promise<void>((resolve) => {
          finishOld = resolve;
        }),
    },
    { initialize: async () => ({ locale: 'zh-CN' }), dispose: async () => undefined },
  );
  await import('../src/main.js');
  await waitFor(() => expect(state.mounts).toHaveLength(1));
  const retry = document.getElementById('config-lens-startup-retry');
  if (retry === null) throw new Error('Missing retry');
  fireEvent.click(retry);
  await waitFor(() => expect(finishOld).toBeDefined());
  expect(state.mounts[0]?.mounted).toBe(false);
  fireEvent.click(retry);
  await waitFor(() => expect(state.mounts).toHaveLength(2));
  const disposals = state.disposeWorkers.mock.calls.length;
  finishOld?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(state.mounts[1]?.mounted).toBe(true);
  expect(state.disposeWorkers).toHaveBeenCalledTimes(disposals);
  window.dispatchEvent(new Event('pagehide'));
  expect(state.mounts[1]?.mounted).toBe(false);
  expect(state.disposeWorkers).toHaveBeenCalledTimes(disposals + 1);
});
