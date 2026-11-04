import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { AppProviders } from '../src/app/AppProviders';
import type { ActivePage, PageResolution } from '../src/app/navigation';
import {
  createPluginRuntimeLifecycleService,
  type PluginChildWebviewPresentationController,
  type PluginPageRuntimeDescriptor,
  type PluginPageRuntimeResolver,
  type PluginRuntimeLifecycleService,
  PluginRuntimeSlot,
} from '../src/app/plugins/runtime';
import { MAIN_PLUGIN_CHILD_WEBVIEW_OWNER } from '../src/app/plugins/runtime/pluginChildWebviewOwner';
import {
  createLatestPluginChildWebviewSlotUpdateQueue,
  type PluginChildWebviewSlotUpdate,
} from '../src/app/plugins/runtime/pluginChildWebviewSlot';

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
    route: '/route-probe',
    title: { 'en-US': 'Workspace Home' },
  },
};
const descriptor: PluginPageRuntimeDescriptor = Object.freeze({
  runtime_key: 'runtime-1',
  entry_url:
    'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html',
  host_fragment: '/route-probe',
  entry_id: 'entry_0123456789abcdef',
  plugin_id: activePage.owner_id,
  version: '1.2.3',
  page_id: activePage.page_id,
  expected_origin: 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '1',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '7',
});

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 20, top: 40, right: 320, bottom: 240, width: 300, height: 200 }) as DOMRect;
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

const renderSlot = (options: {
  readonly lifecycleService?: PluginRuntimeLifecycleService;
  readonly admit?: PluginPageRuntimeResolver['admit'];
  readonly create?: ReturnType<typeof rs.fn>;
  readonly destroy?: ReturnType<typeof rs.fn>;
  readonly locale?: 'en-US' | 'zh-CN';
  readonly theme?: 'light' | 'dark';
  readonly isCurrent?: ReturnType<typeof rs.fn>;
  readonly waitReadiness?: ReturnType<typeof rs.fn>;
  readonly setVisible?: ReturnType<typeof rs.fn>;
  readonly resolve?: ReturnType<typeof rs.fn>;
  readonly subscribeInvalidation?: (listener: () => void) => () => void;
  readonly strict?: boolean;
  readonly updateSlot?: ReturnType<typeof rs.fn>;
}) => {
  const create =
    options.create ??
    rs.fn(async () => ({
      attemptId: 'attempt_0123456789abcdef' as const,
      entryUrl: descriptor.entry_url,
      resourceGeneration: descriptor.resource_generation,
      owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
    }));
  const updateSlot = options.updateSlot ?? rs.fn(async () => undefined);
  const readReadiness = rs.fn(async () => ({ status: 'ready' as const }));
  const waitReadiness = options.waitReadiness ?? rs.fn(async () => ({ status: 'ready' as const }));
  const setVisible = options.setVisible ?? rs.fn(async () => undefined);
  const destroy = options.destroy ?? rs.fn(async () => true);
  const presentationController: PluginChildWebviewPresentationController = {
    create,
    updateSlot,
    readReadiness,
    waitReadiness,
    setVisible,
    destroy,
  };
  const resolver: PluginPageRuntimeResolver = {
    ...(options.admit ? { admit: options.admit } : {}),
    resolve: options.resolve ?? rs.fn(async () => descriptor),
    ...(options.isCurrent ? { isCurrent: options.isCurrent } : {}),
    ...(options.subscribeInvalidation ? { subscribeInvalidation: options.subscribeInvalidation } : {}),
  };
  const lifecycleService = options.lifecycleService ?? createPluginRuntimeLifecycleService();
  const content = (
    <AppProviders initialLocale={options.locale} initialThemeMode={options.theme}>
      <PluginRuntimeSlot
        activePage={activePage}
        lifecycleService={lifecycleService}
        pageResolution={pageResolution}
        pageTitle={options.locale === 'zh-CN' ? '工作区主页' : 'Workspace Home'}
        presentationController={presentationController}
        resolver={resolver}
      />
    </AppProviders>
  );
  const view = render(options.strict ? <StrictMode>{content}</StrictMode> : content);
  return { ...view, create, destroy, resolver, setVisible, updateSlot, waitReadiness, lifecycleService };
};

describe('PluginRuntimeSlot', () => {
  test('renders one non-authoritative Host slot with loading chrome and no iframe', async () => {
    const view = renderSlot({});
    await waitFor(() => expect(view.create).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll('[data-plugin-runtime-slot="true"]')).toHaveLength(1);
    expect(document.querySelector('iframe')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull();
    expect(view.setVisible).toHaveBeenCalledWith(
      {
        attemptId: 'attempt_0123456789abcdef',
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      },
      true,
    );
    expect(view.create).toHaveBeenCalledWith({
      identity: {
        entryId: descriptor.entry_id,
        pluginId: descriptor.plugin_id,
        version: descriptor.version,
        pageId: descriptor.page_id,
        expectedRevision: descriptor.registration_revision,
      },
      scaleFactor: window.devicePixelRatio,
      physicalBounds: { x: 20, y: 40, width: 300, height: 200 },
      presentationRevision: 1n,
    });
    view.unmount();
    await waitFor(() =>
      expect(view.setVisible).toHaveBeenCalledWith(
        {
          attemptId: 'attempt_0123456789abcdef',
          entryUrl: descriptor.entry_url,
          resourceGeneration: descriptor.resource_generation,
          owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        },
        false,
      ),
    );
    await waitFor(() =>
      expect(view.destroy).toHaveBeenCalledWith({
        attemptId: 'attempt_0123456789abcdef',
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      }),
    );
  });

  test('unmount after ownership transfer releases only main presentation and retains Runtime invalidation', async () => {
    let invalidate: (() => void) | undefined;
    let current = true;
    const unsubscribe = rs.fn();
    const view = renderSlot({
      isCurrent: rs.fn(async () => current),
      subscribeInvalidation: (listener) => {
        invalidate = listener;
        return unsubscribe;
      },
    });
    await waitFor(() => expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull());
    const instance = view.lifecycleService.getCurrent();
    if (!instance) throw new Error('runtime should exist');
    const nativeOwner = { windowLabel: 'plugin-window-0000000000000001', ownershipRevision: 2n };
    const releaseRuntime = rs.fn(async () => {
      await view.destroy({ attemptId: 'attempt_0123456789abcdef', owner: nativeOwner });
    });
    await act(async () => {
      await view.lifecycleService.transfer(instance.key, instance.currentOwner(), 'detached-1', releaseRuntime);
    });
    const oldUpdates = view.updateSlot.mock.calls.length;
    view.unmount();
    fireEvent(window, new Event('resize'));
    expect(view.updateSlot).toHaveBeenCalledTimes(oldUpdates);
    expect(view.destroy).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(instance.isCurrent()).toBe(true);
    const next = await view.lifecycleService.start({ targetKey: 'same-plugin-page', onFailure: rs.fn() });
    expect(next?.isCurrent()).toBe(true);
    expect(instance.isCurrent()).toBe(true);
    await act(async () => {
      current = false;
      invalidate?.();
    });
    await waitFor(() => expect(releaseRuntime).toHaveBeenCalledTimes(1));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(instance.isCurrent()).toBe(false);
    expect(next?.isCurrent()).toBe(true);
    expect(view.create).toHaveBeenCalledTimes(1);
    expect(view.destroy).toHaveBeenCalledExactlyOnceWith({ attemptId: 'attempt_0123456789abcdef', owner: nativeOwner });
    await view.lifecycleService.dispose();
  });

  test('reads admission but never resolves resources or creates a native instance during aggregate cooldown', async () => {
    const lifecycleService = createPluginRuntimeLifecycleService();
    const trustedIdentity = { entryId: descriptor.entry_id, generation: descriptor.resource_generation };
    for (let index = 0; index < 3; index++) {
      const instance = await lifecycleService.start({
        targetKey: `other-page-${index}`,
        trustedIdentity,
        onFailure: rs.fn(),
      });
      if (!instance) throw new Error('instance should start');
      await instance.fail('runtime_load_timeout');
    }
    const admit = rs.fn(async () => ({
      entryId: descriptor.entry_id,
      generation: descriptor.resource_generation,
      revision: descriptor.registration_revision,
    }));
    const view = renderSlot({ admit, lifecycleService });
    expect(await screen.findByRole('alert')).toHaveAttribute('data-runtime-failure-code', 'runtime_crash_loop');
    expect(admit).toHaveBeenCalledTimes(1);
    expect(view.resolver.resolve).not.toHaveBeenCalled();
    expect(view.create).not.toHaveBeenCalled();
    view.unmount();
    await lifecycleService.dispose();
  });

  test('bounds admission and ignores late completion after timeout or presentation cancellation', async () => {
    rs.useFakeTimers();
    try {
      let complete!: (value: { entryId: string; generation: string; revision: string }) => void;
      let signal: AbortSignal | undefined;
      const admit = rs.fn((_request, incomingSignal?: AbortSignal) => {
        signal = incomingSignal;
        return new Promise<{ entryId: string; generation: string; revision: string }>((resolve) => {
          complete = resolve;
        });
      });
      const view = renderSlot({ admit });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await rs.advanceTimersByTimeAsync(10_000);
      });
      expect(screen.getByRole('alert')).toHaveAttribute('data-runtime-failure-code', 'runtime_unavailable');
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        complete({
          entryId: descriptor.entry_id,
          generation: descriptor.resource_generation,
          revision: descriptor.registration_revision,
        });
      });
      expect(view.resolver.resolve).not.toHaveBeenCalled();
      expect(view.create).not.toHaveBeenCalled();
      view.unmount();
      const cancelled = renderSlot({ admit });
      await act(async () => {
        await Promise.resolve();
      });
      cancelled.unmount();
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        complete({
          entryId: descriptor.entry_id,
          generation: descriptor.resource_generation,
          revision: descriptor.registration_revision,
        });
      });
      expect(cancelled.resolver.resolve).not.toHaveBeenCalled();
      expect(cancelled.create).not.toHaveBeenCalled();
    } finally {
      rs.useRealTimers();
    }
  });

  test('keeps a rejected admission bounded even when the provider rejects without an error value', async () => {
    const view = renderSlot({ admit: async () => Promise.reject(undefined) });
    expect(await screen.findByRole('alert')).toHaveAttribute('data-runtime-failure-code', 'runtime_unavailable');
    expect(view.resolver.resolve).not.toHaveBeenCalled();
    view.unmount();
  });

  test('reconciles the authoritative native scope once before readiness and revalidates that same retained descriptor', async () => {
    const entryUrl = descriptor.entry_url.replaceAll(
      '0123456789abcdef0123456789abcdef',
      'fedcba9876543210fedcba9876543210',
    );
    let invalidate: (() => void) | undefined;
    const isCurrent = rs.fn(async () => true);
    const view = renderSlot({
      create: rs.fn(async () => ({
        attemptId: 'attempt_0123456789abcdef',
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        entryUrl,
        resourceGeneration: descriptor.resource_generation,
      })),
      isCurrent,
      subscribeInvalidation: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    });
    await waitFor(() => expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull());
    await act(async () => {
      invalidate?.();
    });
    expect(isCurrent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entry_url: entryUrl,
        expected_origin: 'lensx-plugin://fedcba9876543210fedcba9876543210.runtime.localhost',
        resource_generation: descriptor.resource_generation,
      }),
    );
    expect(view.create).toHaveBeenCalledTimes(1);
    expect(view.resolver.resolve).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test.each([
    { entryUrl: descriptor.entry_url, resourceGeneration: '2' },
    { entryUrl: 'file:///private/plugin.html', resourceGeneration: descriptor.resource_generation },
  ])('destroys a created instance before reporting mismatched native metadata %s', async (metadata) => {
    const view = renderSlot({
      create: rs.fn(async () => ({
        attemptId: 'attempt_0123456789abcdef',
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        ...metadata,
      })),
    });
    expect(await screen.findByRole('alert')).toHaveAttribute('data-runtime-failure-code', 'runtime_unavailable');
    expect(view.destroy).toHaveBeenCalledTimes(1);
    expect(view.setVisible.mock.calls.some(([, visible]) => visible === true)).toBe(false);
    expect(view.lifecycleService.getCurrent()).toBeUndefined();
    view.unmount();
  });

  test('keeps the native view hidden behind loading until current Session ready', async () => {
    let publishReady: ((value: { status: 'ready' }) => void) | undefined;
    const waitReadiness = rs.fn(
      () =>
        new Promise<{ status: 'ready' }>((resolve) => {
          publishReady = resolve;
        }),
    );
    const view = renderSlot({ waitReadiness });
    await waitFor(() => expect(view.create).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Loading the plugin page…');
    expect(view.setVisible).not.toHaveBeenCalled();
    await act(async () => publishReady?.({ status: 'ready' }));
    await waitFor(() =>
      expect(view.setVisible).toHaveBeenCalledWith(
        {
          attemptId: 'attempt_0123456789abcdef',
          entryUrl: descriptor.entry_url,
          resourceGeneration: descriptor.resource_generation,
          owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        },
        true,
      ),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull();
  });

  test('ignores a late readiness completion after StrictMode unmount and tears down every created attempt', async () => {
    const completions: Array<(value: { status: 'ready' }) => void> = [];
    const waitReadiness = rs.fn(
      () =>
        new Promise<{ status: 'ready' }>((resolve) => {
          completions.push(resolve);
        }),
    );
    const view = renderSlot({ strict: true, waitReadiness });
    await waitFor(() => expect(view.create.mock.calls.length).toBeGreaterThan(0));
    view.unmount();
    await act(async () => {
      for (const complete of completions) complete({ status: 'ready' });
      await Promise.resolve();
    });
    expect(view.setVisible.mock.calls).not.toContainEqual([
      {
        attemptId: 'attempt_0123456789abcdef',
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      },
      true,
    ]);
    await waitFor(() => expect(view.destroy.mock.calls.length).toBe(view.create.mock.calls.length));
  });

  test('recomputes physical bounds and scale on the same current presentation', async () => {
    const originalScale = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    try {
      const view = renderSlot({});
      await waitFor(() => expect(view.setVisible).toHaveBeenCalledTimes(1));
      for (const [index, scale] of [1, 2, 1.25].entries()) {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: scale });
        fireEvent(window, new Event('resize'));
        await waitFor(() =>
          expect(view.updateSlot).toHaveBeenCalledWith(
            {
              attemptId: 'attempt_0123456789abcdef',
              entryUrl: descriptor.entry_url,
              resourceGeneration: descriptor.resource_generation,
              owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
            },
            scale,
            { x: 20 * scale, y: 40 * scale, width: 300 * scale, height: 200 * scale },
            BigInt(index + 2),
          ),
        );
      }
      expect(view.create).toHaveBeenCalledTimes(1);
      const callsBeforeUnmount = view.updateSlot.mock.calls.length;
      view.unmount();
      fireEvent(window, new Event('resize'));
      expect(view.updateSlot).toHaveBeenCalledTimes(callsBeforeUnmount);
    } finally {
      if (originalScale) Object.defineProperty(window, 'devicePixelRatio', originalScale);
    }
  });

  test('coalesces a resize burst while preserving the latest revision and serial order', async () => {
    let releaseFirst: (() => void) | undefined;
    const sent: bigint[] = [];
    const send = rs.fn(async (update: PluginChildWebviewSlotUpdate) => {
      sent.push(update.presentationRevision);
      if (update.presentationRevision === 2n) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
    });
    const onFailure = rs.fn();
    const queue = createLatestPluginChildWebviewSlotUpdateQueue(send, onFailure);
    const update = (presentationRevision: bigint): PluginChildWebviewSlotUpdate => ({
      attemptId: 'attempt_0123456789abcdef',
      owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      scaleFactor: 2,
      physicalBounds: { x: 20, y: 40, width: 600, height: 400 },
      presentationRevision,
    });

    queue.enqueue(update(2n));
    queue.enqueue(update(3n));
    queue.enqueue(update(4n));
    await waitFor(() => expect(sent).toEqual([2n]));
    releaseFirst?.();
    await queue.drain();
    expect(sent).toEqual([2n, 4n]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  test('fails a queued update once and makes later stale observations inert', async () => {
    const onFailure = rs.fn();
    const send = rs.fn(async () => {
      throw new Error('private native failure');
    });
    const queue = createLatestPluginChildWebviewSlotUpdateQueue(send, onFailure);
    const update: PluginChildWebviewSlotUpdate = {
      attemptId: 'attempt_0123456789abcdef',
      owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      scaleFactor: 1,
      physicalBounds: { x: 10, y: 20, width: 300, height: 200 },
      presentationRevision: 2n,
    };
    queue.enqueue(update);
    await queue.drain();
    queue.enqueue({ ...update, presentationRevision: 3n });
    await queue.drain();
    expect(send).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  test('destroys the native view before exposing terminal Host feedback', async () => {
    let finishDestroy: ((value: boolean) => void) | undefined;
    const destroy = rs.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishDestroy = resolve;
        }),
    );
    const view = renderSlot({
      destroy,
      waitReadiness: rs.fn(async () => ({ status: 'failed' as const, failureCode: 'runtime_load_timeout' as const })),
    });
    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => finishDestroy?.(true));
    expect(await screen.findByRole('alert')).toHaveTextContent('This plugin page could not be loaded');
    expect(view.setVisible).toHaveBeenCalledWith(
      {
        attemptId: 'attempt_0123456789abcdef',
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      },
      false,
    );
  });

  test('converges disable, replacement, upgrade, and development invalidation on terminal teardown', async () => {
    let invalidate: (() => void) | undefined;
    const view = renderSlot({
      isCurrent: rs.fn(async () => false),
      subscribeInvalidation: (listener) => {
        invalidate = listener;
        return () => {
          invalidate = undefined;
        };
      },
    });
    await waitFor(() =>
      expect(view.setVisible).toHaveBeenCalledWith(
        {
          attemptId: 'attempt_0123456789abcdef',
          entryUrl: descriptor.entry_url,
          resourceGeneration: descriptor.resource_generation,
          owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        },
        true,
      ),
    );
    act(() => invalidate?.());
    await waitFor(() =>
      expect(view.destroy).toHaveBeenCalledWith({
        attemptId: 'attempt_0123456789abcdef',
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('This plugin page could not be loaded');
    expect(view.setVisible).toHaveBeenCalledWith(
      {
        attemptId: 'attempt_0123456789abcdef',
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      },
      false,
    );
  });

  test('explicit retry terminates the failed attempt and creates one fresh presentation', async () => {
    let sequence = 0;
    const create = rs.fn(async () => {
      sequence += 1;
      return {
        attemptId: `attempt_${sequence.toString(16).padStart(16, '0')}` as `attempt_${string}`,
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
      };
    });
    const waitReadiness = rs.fn(async () =>
      sequence === 1
        ? { status: 'failed' as const, failureCode: 'runtime_session_disconnected' as const }
        : { status: 'ready' as const },
    );
    const view = renderSlot({ create, waitReadiness });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(view.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull());
    expect(view.destroy).toHaveBeenCalledWith({
      attemptId: 'attempt_0000000000000001',
      owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      entryUrl: descriptor.entry_url,
      resourceGeneration: descriptor.resource_generation,
    });
    expect(view.setVisible).toHaveBeenCalledWith(
      {
        attemptId: 'attempt_0000000000000002',
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        entryUrl: descriptor.entry_url,
        resourceGeneration: descriptor.resource_generation,
      },
      true,
    );
  });

  test('keeps terminal retry and localized Host-owned error presentation', async () => {
    const view = renderSlot({
      locale: 'zh-CN',
      resolve: rs.fn(async () => {
        throw new Error('private');
      }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载此插件页面');
    expect(document.querySelector('iframe')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await waitFor(() => expect(view.resolver.resolve).toHaveBeenCalledTimes(2));
  });

  test.each([
    ['en-US', 'light', 'This plugin page could not be loaded', 'Retry'],
    ['en-US', 'dark', 'This plugin page could not be loaded', 'Retry'],
    ['zh-CN', 'light', '无法加载此插件页面', '重试'],
    ['zh-CN', 'dark', '无法加载此插件页面', '重试'],
  ] as const)('keeps a rejected native reveal failed and supports bounded retry in %s/%s', async (locale, theme, failureText, retryText) => {
    let rejectReveal = true;
    const visibility: boolean[] = [];
    const view = renderSlot({
      locale,
      theme,
      setVisible: rs.fn(async (_presentation, visible: boolean) => {
        visibility.push(visible);
        if (visible && rejectReveal) throw new Error('private NSWindow/contentView clipping failure');
      }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(failureText);
    expect(document.querySelector('[data-runtime-state="ready"]')).toBeNull();
    expect(screen.queryByText(/NSWindow|contentView|clipping failure/u)).not.toBeInTheDocument();
    expect(visibility).toEqual([true, false]);
    expect(view.destroy).toHaveBeenCalledTimes(1);
    const retry = screen.getByRole('button', { name: retryText });
    expect(retry).toHaveFocus();
    if (theme === 'dark') expect(document.body).toHaveAttribute('theme-mode', 'dark');
    else expect(document.body).not.toHaveAttribute('theme-mode');
    rejectReveal = false;
    fireEvent.click(retry);
    await waitFor(() => expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull());
    expect(view.create).toHaveBeenCalledTimes(2);
    expect(view.resolver.resolve).toHaveBeenCalledTimes(2);
    expect(visibility).toEqual([true, false, true]);
    expect(document.querySelector('[data-plugin-runtime-slot="true"]')).not.toHaveAttribute('tabindex');
  });
});
