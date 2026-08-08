import { expect, rs, test } from '@rstest/core';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { AppProviders } from '../src/app/AppProviders';
import type { ActivePage, PageResolution } from '../src/app/navigation';
import {
  PLUGIN_RUNTIME_IFRAME_SANDBOX,
  type PluginPageRuntimeDescriptor,
  PluginRuntimeFrame,
  type PluginRuntimeSessionService,
} from '../src/app/plugins/runtime';

test('official candidate opens through the same open Runtime and closed Host boundary', async () => {
  const pluginId = process.env.LENSX_OFFICIAL_CANDIDATE_PLUGIN_ID ?? 'dev.lensx.fixture.alpha';
  const version = process.env.LENSX_OFFICIAL_CANDIDATE_VERSION ?? '1.0.0';
  const activePage: ActivePage = {
    owner_id: pluginId,
    page_id: 'main',
    opened_by_action_id: `${pluginId}.open`,
  };
  const pageResolution: PageResolution = {
    provider: { kind: 'plugin', owner_id: pluginId, display_name: { 'en-US': 'Official fixture' } },
    page: {
      owner_id: pluginId,
      page_id: 'main',
      available: true,
      route: '/',
      title: { 'en-US': 'Official fixture' },
    },
  };
  const origin = 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost';
  const descriptor: PluginPageRuntimeDescriptor = {
    runtime_key: 'official-candidate-runtime',
    entry_url: `${origin}/v1/0123456789abcdef0123456789abcdef/plugin/${version}/index.html`,
    host_fragment: '/',
    iframe_src: `${origin}/v1/0123456789abcdef0123456789abcdef/plugin/${version}/index.html#/`,
    entry_id: 'entry_0123456789abcdef',
    plugin_id: pluginId,
    version,
    page_id: 'main',
    expected_origin: origin,
    resource_generation: '0123456789abcdef0123456789abcdef',
    runtime_attempt_key: 'official-candidate-attempt',
    registration_revision: '1',
  };
  const disposeSession = rs.fn();
  const sessionService = {
    start: rs.fn(({ identity }) => ({
      snapshot: () => ({ state: 'ready' as const, identity }),
      subscribe: (listener: (snapshot: { state: 'ready'; identity: typeof identity }) => void) => {
        listener({ state: 'ready', identity });
        return () => undefined;
      },
      disconnect: () => undefined,
      dispose: disposeSession,
    })),
    current: () => undefined,
    disconnect: () => undefined,
    dispose: () => undefined,
  } as unknown as PluginRuntimeSessionService;
  const navigationAdapter = {
    activate: rs.fn(async () => ({ lease_id: '0000000000000001' })),
    dispose: rs.fn(async () => true),
  };
  const view = render(
    <AppProviders>
      <PluginRuntimeFrame
        activePage={activePage}
        navigationAdapter={navigationAdapter}
        pageResolution={pageResolution}
        pageTitle="Official fixture"
        resolver={{ resolve: async () => descriptor }}
        sessionService={sessionService}
      />
    </AppProviders>,
  );
  const iframe = await waitFor(() => {
    const value = document.querySelector('iframe');
    expect(value).not.toBeNull();
    return value as HTMLIFrameElement;
  });
  expect(iframe).toHaveAttribute('sandbox', PLUGIN_RUNTIME_IFRAME_SANDBOX);
  fireEvent.load(iframe);
  expect(sessionService.start).toHaveBeenCalledWith(
    expect.objectContaining({
      targetOrigin: origin,
    }),
  );
  view.unmount();
  await waitFor(() => expect(navigationAdapter.dispose).toHaveBeenCalledTimes(1));
  expect(disposeSession).toHaveBeenCalledTimes(1);
});
