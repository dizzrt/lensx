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
  PluginRuntimeSlot,
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
  resource_generation: '0123456789abcdef0123456789abcdef',
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
  readonly create?: ReturnType<typeof rs.fn>;
  readonly destroy?: ReturnType<typeof rs.fn>;
  readonly locale?: 'en-US' | 'zh-CN';
  readonly isCurrent?: ReturnType<typeof rs.fn>;
  readonly waitReadiness?: ReturnType<typeof rs.fn>;
  readonly resolve?: ReturnType<typeof rs.fn>;
  readonly subscribeInvalidation?: (listener: () => void) => () => void;
  readonly strict?: boolean;
}) => {
  const create = options.create ?? rs.fn(async () => ({ attemptId: 'attempt_0123456789abcdef' as const }));
  const updateSlot = rs.fn(async () => undefined);
  const readReadiness = rs.fn(async () => ({ status: 'ready' as const }));
  const waitReadiness = options.waitReadiness ?? rs.fn(async () => ({ status: 'ready' as const }));
  const setVisible = rs.fn(async () => undefined);
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
    resolve: options.resolve ?? rs.fn(async () => descriptor),
    ...(options.isCurrent ? { isCurrent: options.isCurrent } : {}),
    ...(options.subscribeInvalidation ? { subscribeInvalidation: options.subscribeInvalidation } : {}),
  };
  const content = (
    <AppProviders initialLocale={options.locale}>
      <PluginRuntimeSlot
        activePage={activePage}
        lifecycleService={createPluginRuntimeLifecycleService()}
        pageResolution={pageResolution}
        pageTitle={options.locale === 'zh-CN' ? '工作区主页' : 'Workspace Home'}
        presentationController={presentationController}
        resolver={resolver}
      />
    </AppProviders>
  );
  const view = render(options.strict ? <StrictMode>{content}</StrictMode> : content);
  return { ...view, create, destroy, resolver, setVisible, updateSlot, waitReadiness };
};

describe('PluginRuntimeSlot', () => {
  test('renders one non-authoritative Host slot with loading chrome and no iframe', async () => {
    const view = renderSlot({});
    await waitFor(() => expect(view.create).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll('[data-plugin-runtime-slot="true"]')).toHaveLength(1);
    expect(document.querySelector('iframe')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull();
    expect(view.setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, true);
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
    await waitFor(() => expect(view.setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, false));
    await waitFor(() => expect(view.destroy).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }));
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
    await waitFor(() => expect(view.setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, true));
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
    expect(view.setVisible.mock.calls).not.toContainEqual([{ attemptId: 'attempt_0123456789abcdef' }, true]);
    await waitFor(() => expect(view.destroy.mock.calls.length).toBe(view.create.mock.calls.length));
  });

  test('recomputes physical bounds and scale on the same current presentation', async () => {
    const originalScale = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    try {
      const view = renderSlot({});
      await waitFor(() => expect(view.setVisible).toHaveBeenCalledTimes(1));
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
      fireEvent(window, new Event('resize'));
      await waitFor(() =>
        expect(view.updateSlot).toHaveBeenCalledWith(
          { attemptId: 'attempt_0123456789abcdef' },
          2,
          { x: 40, y: 80, width: 600, height: 400 },
          2n,
        ),
      );
      expect(view.create).toHaveBeenCalledTimes(1);
    } finally {
      if (originalScale) Object.defineProperty(window, 'devicePixelRatio', originalScale);
    }
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
    expect(view.setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, false);
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
    await waitFor(() => expect(view.setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, true));
    act(() => invalidate?.());
    await waitFor(() => expect(view.destroy).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This plugin page could not be loaded');
    expect(view.setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, false);
  });

  test('explicit retry terminates the failed attempt and creates one fresh presentation', async () => {
    let sequence = 0;
    const create = rs.fn(async () => {
      sequence += 1;
      return { attemptId: `attempt_${sequence.toString(16).padStart(16, '0')}` as `attempt_${string}` };
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
    expect(view.destroy).toHaveBeenCalledWith({ attemptId: 'attempt_0000000000000001' });
    expect(view.setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0000000000000002' }, true);
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
});
