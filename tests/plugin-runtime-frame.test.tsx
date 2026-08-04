import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProviders } from '../src/app/AppProviders';
import type { ActivePage, PageResolution } from '../src/app/navigation';
import {
  PLUGIN_RUNTIME_IFRAME_SANDBOX,
  PLUGIN_RUNTIME_PERMISSIONS_POLICY,
  PLUGIN_RUNTIME_REFERRER_POLICY,
  type PluginPageRuntimeDescriptor,
  PluginRuntimeFrame,
  reducePluginRuntimeFrameState,
} from '../src/app/plugins/runtime';

const activePage: ActivePage = {
  owner_id: 'com.acme.workspace',
  page_id: 'home',
  opened_by_action_id: 'com.acme.workspace.open',
};
const pageResolution: PageResolution = {
  provider: { kind: 'plugin', owner_id: activePage.owner_id, display_name: { 'en-US': 'Workspace' } },
  page: {
    owner_id: activePage.owner_id,
    page_id: activePage.page_id,
    available: true,
    required_permission_ids: [],
    route: '/route-probe',
    title: { 'en-US': 'Workspace Home' },
  },
};
const descriptor: PluginPageRuntimeDescriptor = Object.freeze({
  runtime_key: 'runtime-1',
  entry_url:
    'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html',
  host_fragment: '/route-probe',
  iframe_src:
    'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html#/route-probe',
  plugin_id: activePage.owner_id,
  version: '1.2.3',
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const renderFrame = (options?: {
  readonly resolver?: { resolve: ReturnType<typeof rs.fn> };
  readonly navigationAdapter?: {
    activate: ReturnType<typeof rs.fn>;
    dispose: ReturnType<typeof rs.fn>;
  };
  readonly locale?: 'en-US' | 'zh-CN';
}) => {
  const resolver = options?.resolver ?? { resolve: rs.fn(async () => descriptor) };
  const navigationAdapter = options?.navigationAdapter ?? {
    activate: rs.fn(async () => ({ lease_id: '0000000000000001' })),
    dispose: rs.fn(async () => true),
  };
  const view = render(
    <AppProviders initialLocale={options?.locale}>
      <PluginRuntimeFrame
        activePage={activePage}
        navigationAdapter={navigationAdapter}
        pageResolution={pageResolution}
        pageTitle={options?.locale === 'zh-CN' ? '工作区主页' : 'Workspace Home'}
        resolver={resolver}
      />
    </AppProviders>,
  );
  return { ...view, navigationAdapter, resolver };
};

describe('PluginRuntimeFrame', () => {
  test('mounts exactly one iframe only after exact lease activation and treats load as loaded, not ready', async () => {
    const resolve = deferred<PluginPageRuntimeDescriptor>();
    const activation = deferred<{ lease_id: string }>();
    const resolver = { resolve: rs.fn(() => resolve.promise) };
    const navigationAdapter = {
      activate: rs.fn(() => activation.promise),
      dispose: rs.fn(async () => true),
    };
    const view = renderFrame({ resolver, navigationAdapter });
    expect(screen.getByRole('status', { name: 'Workspace Home' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('iframe')).toBeNull();

    await act(async () => resolve.resolve(descriptor));
    expect(navigationAdapter.activate).toHaveBeenCalledWith({
      entry_url: descriptor.entry_url,
      host_fragment: descriptor.host_fragment,
    });
    expect(document.querySelector('iframe')).toBeNull();

    await act(async () => activation.resolve({ lease_id: '0000000000000001' }));
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(iframe).toHaveAttribute('sandbox', PLUGIN_RUNTIME_IFRAME_SANDBOX);
    expect(iframe).toHaveAttribute('allow', PLUGIN_RUNTIME_PERMISSIONS_POLICY);
    expect(iframe).toHaveAttribute('referrerpolicy', PLUGIN_RUNTIME_REFERRER_POLICY);
    expect(iframe).toHaveAttribute('src', descriptor.iframe_src);
    expect(iframe).toHaveAttribute('title', 'Workspace Home plugin runtime');
    expect(screen.getByRole('status')).toHaveTextContent('Loading the plugin page');

    fireEvent.load(iframe as HTMLIFrameElement);
    expect(document.querySelector('[data-runtime-state="loaded"]')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/ready/u);

    view.unmount();
    await waitFor(() => expect(navigationAdapter.dispose).toHaveBeenCalledWith({ lease_id: '0000000000000001' }));
  });

  test('renders a localized safe failure and explicit retry starts a fresh attempt', async () => {
    const resolver = {
      resolve: rs
        .fn()
        .mockRejectedValueOnce(new Error('/private/secret/path'))
        .mockResolvedValueOnce({ ...descriptor, runtime_key: 'runtime-2' }),
    };
    renderFrame({ resolver, locale: 'zh-CN' });
    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载此插件页面');
    expect(document.body).not.toHaveTextContent('/private/secret/path');
    const retry = screen.getByRole('button', { name: '重试' });
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    await waitFor(() => expect(resolver.resolve).toHaveBeenLastCalledWith({ activePage, pageResolution, attempt: 1 }));
    await waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(1));
  });

  test('rejects an invalid or shared-origin descriptor before native activation', async () => {
    const navigationAdapter = {
      activate: rs.fn(async () => ({ lease_id: '0000000000000001' })),
      dispose: rs.fn(async () => true),
    };
    renderFrame({
      resolver: {
        resolve: rs.fn(async () => ({
          ...descriptor,
          entry_url: 'lensx-plugin://localhost/v1/index.html',
          iframe_src: 'lensx-plugin://localhost/v1/index.html#/route-probe',
        })),
      },
      navigationAdapter,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('This plugin page could not be loaded');
    expect(navigationAdapter.activate).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('cancels late resolution without activation and disposes a lease won after cancellation', async () => {
    const lateResolve = deferred<PluginPageRuntimeDescriptor>();
    const resolver = { resolve: rs.fn(() => lateResolve.promise) };
    const navigationAdapter = {
      activate: rs.fn(async () => ({ lease_id: '0000000000000001' })),
      dispose: rs.fn(async () => true),
    };
    const first = renderFrame({ resolver, navigationAdapter });
    first.unmount();
    await act(async () => lateResolve.resolve(descriptor));
    expect(navigationAdapter.activate).not.toHaveBeenCalled();

    const activation = deferred<{ lease_id: string }>();
    const second = renderFrame({
      resolver: { resolve: rs.fn(async () => descriptor) },
      navigationAdapter: {
        activate: rs.fn(() => activation.promise),
        dispose: navigationAdapter.dispose,
      },
    });
    await waitFor(() => expect(document.querySelector('iframe')).toBeNull());
    second.unmount();
    await act(async () => activation.resolve({ lease_id: '0000000000000002' }));
    await waitFor(() => expect(navigationAdapter.dispose).toHaveBeenCalledWith({ lease_id: '0000000000000002' }));
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('state machine ignores late load events after replacement/disposal', () => {
    const loading = reducePluginRuntimeFrameState({ status: 'resolving' }, { type: 'mount', descriptor });
    expect(reducePluginRuntimeFrameState(loading, { type: 'load', runtimeKey: 'stale' })).toBe(loading);
    expect(reducePluginRuntimeFrameState(loading, { type: 'load', runtimeKey: descriptor.runtime_key })).toMatchObject({
      status: 'loaded',
    });
    expect(reducePluginRuntimeFrameState(loading, { type: 'dispose' })).toEqual({ status: 'disposed' });
  });
});
