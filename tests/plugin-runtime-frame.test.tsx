import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProviders } from '../src/app/AppProviders';
import type { ActivePage, PageResolution } from '../src/app/navigation';
import {
  createPluginRuntimeLifecycleService,
  PLUGIN_RUNTIME_IFRAME_SANDBOX,
  PLUGIN_RUNTIME_LOAD_DEADLINE_MS,
  PLUGIN_RUNTIME_PERMISSIONS_POLICY,
  PLUGIN_RUNTIME_REFERRER_POLICY,
  PLUGIN_RUNTIME_RESOLUTION_DEADLINE_MS,
  type PluginHostApiDispatcherFactory,
  type PluginPageRuntimeDescriptor,
  PluginRuntimeFrame,
  type PluginRuntimeLifecycleService,
  type PluginRuntimeScheduler,
  type PluginRuntimeSessionMessagePort,
  type PluginRuntimeSessionService,
  type PluginRuntimeSessionSnapshot,
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
  entry_id: 'entry_0123456789abcdef',
  plugin_id: activePage.owner_id,
  version: '1.2.3',
  page_id: activePage.page_id,
  expected_origin: 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '7',
  granted_permission_ids: [],
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
  readonly sessionService?: PluginRuntimeSessionService;
  readonly lifecycleService?: PluginRuntimeLifecycleService;
  readonly hostApiDispatcherFactory?: PluginHostApiDispatcherFactory;
}) => {
  const resolver = options?.resolver ?? { resolve: rs.fn(async () => descriptor) };
  const navigationAdapter = options?.navigationAdapter ?? {
    activate: rs.fn(async () => ({ lease_id: '0000000000000001' })),
    dispose: rs.fn(async () => true),
  };
  const sessionService =
    options?.sessionService ??
    ({
      start: rs.fn(({ identity }) => ({
        snapshot: () => ({ state: 'awaiting_handshake' as const, identity }),
        subscribe: (
          listener: (snapshot: { readonly state: 'awaiting_handshake'; readonly identity: typeof identity }) => void,
        ) => {
          listener({ state: 'awaiting_handshake', identity });
          return () => undefined;
        },
        disconnect: () => undefined,
        dispose: () => undefined,
      })),
      current: () => undefined,
      disconnect: () => undefined,
      dispose: () => undefined,
    } as unknown as PluginRuntimeSessionService);
  const view = render(
    <AppProviders initialLocale={options?.locale}>
      <PluginRuntimeFrame
        activePage={activePage}
        hostApiDispatcherFactory={options?.hostApiDispatcherFactory}
        navigationAdapter={navigationAdapter}
        lifecycleService={options?.lifecycleService}
        pageResolution={pageResolution}
        pageTitle={options?.locale === 'zh-CN' ? '工作区主页' : 'Workspace Home'}
        resolver={resolver}
        sessionService={sessionService}
      />
    </AppProviders>,
  );
  return { ...view, navigationAdapter, resolver, sessionService };
};

class ManualScheduler implements PluginRuntimeScheduler {
  #now = 0;
  #sequence = 0;
  readonly callbacks = new Map<number, { readonly at: number; readonly callback: () => void }>();
  readonly now = () => this.#now;
  readonly setTimeout = (callback: () => void, delayMs: number) => {
    const handle = ++this.#sequence;
    this.callbacks.set(handle, { at: this.#now + delayMs, callback });
    return handle;
  };
  readonly clearTimeout = (handle: unknown) => {
    if (typeof handle === 'number') this.callbacks.delete(handle);
  };
  advance(milliseconds: number) {
    this.#now += milliseconds;
    for (const [handle, timer] of [...this.callbacks]) {
      if (timer.at <= this.#now && this.callbacks.delete(handle)) timer.callback();
    }
  }
}

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
    expect(view.sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: {
          entry_id: descriptor.entry_id,
          plugin_id: descriptor.plugin_id,
          version: descriptor.version,
          page_id: descriptor.page_id,
          expected_origin: descriptor.expected_origin,
          resource_generation: descriptor.resource_generation,
          runtime_attempt_key: descriptor.runtime_attempt_key,
          registration_revision: descriptor.registration_revision,
          granted_permission_ids: descriptor.granted_permission_ids,
        },
        targetWindow: (iframe as HTMLIFrameElement).contentWindow,
        targetOrigin: descriptor.expected_origin,
        owningAttempt: expect.objectContaining({ key: 1 }),
      }),
    );
    fireEvent.load(iframe as HTMLIFrameElement);
    expect(view.sessionService.start).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(navigationAdapter.dispose).toHaveBeenCalledWith({ lease_id: '0000000000000001' }));
  });

  test('binds one injected Host API Dispatcher to the ready lease and disposes it with the Runtime', async () => {
    const port: PluginRuntimeSessionMessagePort = {
      onmessage: null,
      onmessageerror: null,
      close: rs.fn(),
      postMessage: rs.fn(),
      start: rs.fn(),
    };
    const detachEmitter = rs.fn();
    const disposeBinding = rs.fn();
    const binding = {
      handler: rs.fn(() => ({ code: 'unavailable' as const, message: 'The Host API is unavailable.' })),
      attachEmitter: rs.fn(() => detachEmitter),
      dispose: disposeBinding,
    };
    const hostApiDispatcherFactory = { create: rs.fn(() => binding) };
    const sessionService: PluginRuntimeSessionService = {
      start: rs.fn((input) => {
        const leaseCleanup = input.consumeReadyLease?.({ identity: input.identity, port });
        let disposed = false;
        return {
          snapshot: () => ({
            state: 'ready' as const,
            identity: input.identity,
            lease: { identity: input.identity, port },
          }),
          subscribe: (listener: (snapshot: PluginRuntimeSessionSnapshot) => void) => {
            listener({ state: 'ready', identity: input.identity, lease: { identity: input.identity, port } });
            return () => undefined;
          },
          disconnect: () => undefined,
          dispose: () => {
            if (disposed) return;
            disposed = true;
            leaseCleanup?.();
          },
        };
      }),
      current: () => undefined,
      disconnect: () => undefined,
      dispose: () => undefined,
    };
    const view = renderFrame({ hostApiDispatcherFactory, sessionService });
    const iframe = (await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull()).then(() =>
      document.querySelector('iframe'),
    )) as HTMLIFrameElement;
    fireEvent.load(iframe);

    expect(hostApiDispatcherFactory.create).toHaveBeenCalledTimes(1);
    expect(hostApiDispatcherFactory.create).toHaveBeenCalledWith({
      identity: expect.objectContaining({ plugin_id: descriptor.plugin_id, page_id: descriptor.page_id }),
      isCurrent: expect.any(Function),
    });
    expect(binding.attachEmitter).toHaveBeenCalledTimes(1);
    expect(port.start).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(disposeBinding).toHaveBeenCalledTimes(1));
    expect(detachEmitter).toHaveBeenCalledTimes(1);
    expect(port.close).toHaveBeenCalledTimes(1);
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

  test('keeps the iframe for unrelated invalidation and revokes it when current facts diverge', async () => {
    const invalidationListeners = new Set<() => void>();
    let current = true;
    const resolver = {
      resolve: rs.fn(async () => descriptor),
      isCurrent: rs.fn(async () => current),
      subscribeInvalidation: (listener: () => void) => {
        invalidationListeners.add(listener);
        return () => invalidationListeners.delete(listener);
      },
    };
    const sessionDispose = rs.fn();
    const sessionService = {
      start: rs.fn(({ identity }) => ({
        snapshot: () => ({ state: 'awaiting_handshake' as const, identity }),
        subscribe: () => () => undefined,
        disconnect: () => undefined,
        dispose: sessionDispose,
      })),
      current: () => undefined,
      disconnect: () => undefined,
      dispose: () => undefined,
    } as unknown as PluginRuntimeSessionService;
    const view = renderFrame({ resolver, sessionService });
    const iframe = (await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull()).then(() =>
      document.querySelector('iframe'),
    )) as HTMLIFrameElement;
    fireEvent.load(iframe);

    await act(async () => {
      for (const listener of invalidationListeners) listener();
      await Promise.resolve();
    });
    expect(resolver.isCurrent).toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBe(iframe);
    expect(sessionDispose).not.toHaveBeenCalled();
    expect(view.navigationAdapter.dispose).not.toHaveBeenCalled();

    current = false;
    await act(async () => {
      for (const listener of invalidationListeners) listener();
      await Promise.resolve();
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('This plugin page could not be loaded');
    expect(document.querySelector('iframe')).toBeNull();
    expect(sessionDispose).toHaveBeenCalledTimes(1);
    expect(view.navigationAdapter.dispose).toHaveBeenCalledTimes(1);
  });

  test('bounds a stalled resource resolution and makes its late completion inert', async () => {
    const scheduler = new ManualScheduler();
    const lifecycleService = createPluginRuntimeLifecycleService({ scheduler });
    const resolution = deferred<PluginPageRuntimeDescriptor>();
    const resolver = { resolve: rs.fn(() => resolution.promise) };
    const view = renderFrame({ lifecycleService, resolver });
    await waitFor(() => expect(resolver.resolve).toHaveBeenCalledTimes(1));

    await act(async () => scheduler.advance(PLUGIN_RUNTIME_RESOLUTION_DEADLINE_MS));
    expect(await screen.findByRole('alert')).toHaveAttribute('data-runtime-failure-code', 'runtime_unavailable');
    expect(document.querySelector('iframe')).toBeNull();
    expect(view.navigationAdapter.activate).not.toHaveBeenCalled();

    await act(async () => resolution.resolve(descriptor));
    expect(view.navigationAdapter.activate).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('bounds stalled native navigation activation and disposes a late lease', async () => {
    const scheduler = new ManualScheduler();
    const lifecycleService = createPluginRuntimeLifecycleService({ scheduler });
    const activation = deferred<{ lease_id: string }>();
    const navigationAdapter = {
      activate: rs.fn(() => activation.promise),
      dispose: rs.fn(async () => true),
    };
    renderFrame({ lifecycleService, navigationAdapter });
    await waitFor(() => expect(navigationAdapter.activate).toHaveBeenCalledTimes(1));

    await act(async () => scheduler.advance(PLUGIN_RUNTIME_RESOLUTION_DEADLINE_MS));
    expect(await screen.findByRole('alert')).toHaveAttribute('data-runtime-failure-code', 'runtime_unavailable');
    expect(document.querySelector('iframe')).toBeNull();

    await act(async () => activation.resolve({ lease_id: '0000000000000001' }));
    await waitFor(() => expect(navigationAdapter.dispose).toHaveBeenCalledWith({ lease_id: '0000000000000001' }));
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('enforces the load deadline, removes the iframe and lease, and ignores a late load', async () => {
    const scheduler = new ManualScheduler();
    const lifecycleService = createPluginRuntimeLifecycleService({ scheduler });
    const view = renderFrame({ lifecycleService });
    const iframe = (await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull()).then(() =>
      document.querySelector('iframe'),
    )) as HTMLIFrameElement;
    await act(async () => scheduler.advance(PLUGIN_RUNTIME_LOAD_DEADLINE_MS));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not finish loading in time');
    expect(screen.getByRole('alert')).toHaveAttribute('data-runtime-failure-code', 'runtime_load_timeout');
    expect(document.querySelector('iframe')).toBeNull();
    await waitFor(() => expect(view.navigationAdapter.dispose).toHaveBeenCalledTimes(1));
    fireEvent.load(iframe);
    expect(view.sessionService.start).not.toHaveBeenCalled();
  });

  test.each([
    ['runtime_handshake_timeout', '未能及时完成安全握手'],
    ['runtime_session_disconnected', '意外断开'],
    ['runtime_security_policy_failure', '安全策略已停止'],
    ['runtime_crash_loop', '已连续失败'],
  ] as const)('shows bounded localized %s feedback without private diagnostics', async (failureCode, copy) => {
    const lifecycleService: PluginRuntimeLifecycleService = {
      start: async ({ onFailure }) => {
        onFailure(failureCode);
        return undefined;
      },
      terminateCurrent: async () => undefined,
      dispose: async () => undefined,
    };
    renderFrame({ lifecycleService, locale: 'zh-CN' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy);
    expect(alert).toHaveAttribute('data-runtime-failure-code', failureCode);
    expect(alert).not.toHaveTextContent(/(?:lensx-plugin:\/\/|runtime\.localhost|nonce|\/private\/)/u);
    expect(screen.getByRole('button', { name: '重试' })).toHaveFocus();
  });
});
