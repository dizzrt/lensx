import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps, StrictMode } from 'react';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import { useAppLocale } from '../src/app/i18n';
import {
  createDefaultLauncherActionService,
  LauncherActionDispatcher,
  LauncherActionRegistry,
} from '../src/app/launcher/actions';
import type {
  LauncherActivationErrorListener,
  LauncherActivationListener,
  LauncherActivationPayload,
  LauncherActivationSource,
} from '../src/app/launcher/activation';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import type { LauncherSurfaceController, LauncherSurfaceTarget } from '../src/app/launcher/surface';
import { AppNavigationService, type PageProviderBatch, PageRegistry } from '../src/app/navigation';
import {
  type PluginRegistrationDesktopAdapter,
  type PluginRegistrationSnapshot,
  parsePluginRegistrationDetailResponse,
} from '../src/app/plugins/registration';
import {
  createPluginRuntimeLifecycleService,
  type PluginChildWebviewPresentationController,
  type PluginPageRuntimeDescriptor,
} from '../src/app/plugins/runtime';
import { createPluginSurfaceProjectionService } from '../src/app/plugins/surfaces';
import { useAppTheme } from '../src/app/theme';

const parsed = parsePluginRegistrationDetailResponse(
  structuredClone(validCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (parsed.detail.kind !== 'registered') {
  throw new Error('Healthy detail fixture must contain a registered plugin.');
}
const detail = {
  ...parsed.detail,
  manifest: {
    ...parsed.detail.manifest,
    contributes: {
      ...parsed.detail.manifest.contributes,
      actions: parsed.detail.manifest.contributes.actions.map((action) => ({
        ...action,
        title: { 'en-US': 'Launch Workspace', 'zh-CN': '启动工作区' },
      })),
    },
  },
};
const pluginId = detail.manifest.plugin_id;
const snapshot: PluginRegistrationSnapshot = {
  contract_version: '0.3.0',
  revision: '1',
  availability: { kind: 'available' },
  entries: [
    {
      kind: 'registered',
      entry_id: detail.entry_id,
      plugin_id: pluginId,
      version: detail.manifest.version,
      display: detail.manifest.display,
      source: detail.source,
      enabled: detail.enabled,
      compatibility: detail.compatibility,
      runtime: detail.runtime,
    },
  ],
};

const createAdapter = (): PluginRegistrationDesktopAdapter => {
  const listeners = new Set<(value: PluginRegistrationSnapshot) => void>();
  return {
    initialize: async () => snapshot,
    refresh: async () => snapshot,
    readDetail: async () => ({ contract_version: '0.3.0', revision: '1', detail }),
    handleLauncherActivation: async () => snapshot,
    recoverListener: async () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy: async () => {
      listeners.clear();
    },
  };
};

const collectionsClient = {
  read: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
};

const runtimeDescriptor: PluginPageRuntimeDescriptor = Object.freeze({
  runtime_key: 'project-runtime-1',
  entry_url:
    'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e6578616d706c652e776f726b7370616365/1.2.3/index.html',
  host_fragment: '/open-project',
  entry_id: detail.entry_id,
  plugin_id: pluginId,
  version: detail.manifest.version,
  page_id: 'open_project',
  expected_origin: 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '1',
});

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 10, top: 20, right: 410, bottom: 320, width: 400, height: 300 }) as DOMRect;
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

const TestProviderControls = () => {
  const { setLocale } = useAppLocale();
  const { setThemeMode } = useAppTheme();
  return (
    <aside aria-label="test provider controls">
      <button onClick={() => setLocale('zh-CN')} type="button">
        Chinese
      </button>
      <button onClick={() => setThemeMode('dark')} type="button">
        Dark
      </button>
    </aside>
  );
};

class TestLauncherActivationSource implements LauncherActivationSource {
  readonly listeners = new Set<LauncherActivationListener>();

  subscribe = async (listener: LauncherActivationListener, _onError: LauncherActivationErrorListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  emit(payload: LauncherActivationPayload) {
    for (const listener of this.listeners) listener(payload);
  }
}

const renderPluginComposition = (
  options: {
    readonly activationSource?: TestLauncherActivationSource;
    readonly destroy?: ReturnType<typeof rs.fn>;
    readonly strictMode?: boolean;
    readonly renderPage?: ComponentProps<typeof App>['renderPage'];
    readonly surfaceController?: LauncherSurfaceController;
  } = {},
) => {
  const pageRegistry = new PageRegistry([
    { owner_id: 'lensx.core', page_id: 'settings', enabled: true, title: { 'en-US': 'Settings' } },
  ]);
  const navigationService = new AppNavigationService(pageRegistry);
  const actionService = createDefaultLauncherActionService({ hideLauncher: async () => undefined }, navigationService);
  const projection = createPluginSurfaceProjectionService({
    registrationAdapter: createAdapter(),
    actionRegistry: actionService.registry,
    pageRegistry,
    navigationService,
  });
  const pluginRuntimeResolver = { resolve: rs.fn(async () => runtimeDescriptor) };
  const pluginChildWebviewPresentationController: PluginChildWebviewPresentationController = {
    create: rs.fn(async () => ({ attemptId: 'attempt_0123456789abcdef' as const })),
    updateSlot: rs.fn(async () => undefined),
    readReadiness: rs.fn(async () => ({ status: 'ready' as const })),
    waitReadiness: rs.fn(async () => ({ status: 'ready' as const })),
    setVisible: rs.fn(async () => undefined),
    destroy: options.destroy ?? rs.fn(async () => true),
  };
  const pluginRuntimeLifecycleService = createPluginRuntimeLifecycleService();
  const activationSource = options.activationSource ?? new TestLauncherActivationSource();
  void projection.initialize();
  const view = (
    <AppProviders>
      <TestProviderControls />
      <App
        actionService={actionService}
        activationSource={activationSource}
        collectionsClient={collectionsClient}
        navigationService={navigationService}
        pluginChildWebviewPresentationController={pluginChildWebviewPresentationController}
        pluginRuntimeLifecycleService={pluginRuntimeLifecycleService}
        pluginRuntimeResolver={pluginRuntimeResolver}
        renderPage={options.renderPage}
        surfaceController={options.surfaceController}
        surfaceProjectionService={projection}
      />
    </AppProviders>
  );
  render(options.strictMode ? <StrictMode>{view}</StrictMode> : view);
  return {
    actionService,
    activationSource,
    navigationService,
    pageRegistry,
    pluginChildWebviewPresentationController,
    pluginRuntimeResolver,
    projection,
    surfaceController: options.surfaceController,
  };
};

describe('Plugin Page navigation UI', () => {
  test('opens the isolated Runtime after the StrictMode setup-cleanup-setup replay', async () => {
    const { actionService, navigationService, pluginChildWebviewPresentationController } = renderPluginComposition({
      strictMode: true,
    });
    await waitFor(() => expect(actionService.registry.get(`${pluginId}.open_project`)).toBeDefined());

    act(() => navigationService.openPage({ owner_id: pluginId, page_id: 'open_project' }, `${pluginId}.open_project`));

    await waitFor(() => expect(document.querySelectorAll('[data-plugin-runtime-slot="true"]')).toHaveLength(1));
    expect(document.querySelector('iframe')).toBeNull();
    await waitFor(() => expect(pluginChildWebviewPresentationController.create).toHaveBeenCalledTimes(1));
  });

  test('selects one edge-to-edge Page body layout from plugin provider kind only', async () => {
    const view = renderPluginComposition({ renderPage: (page) => <div>Current page {page.page_id}</div> });
    const launcherBody = () => document.querySelector('.launcher-body');

    expect(launcherBody()).not.toHaveAttribute('data-page-layout');
    fireEvent.change(screen.getByRole('combobox', { name: 'Launcher query' }), {
      target: { value: 'no matching action' },
    });
    expect(launcherBody()).not.toHaveAttribute('data-page-layout');

    await waitFor(() => expect(view.pageRegistry.lookup({ owner_id: pluginId, page_id: 'home' })).toBeDefined());
    act(() => view.navigationService.openPage({ owner_id: pluginId, page_id: 'home' }, `${pluginId}.open_project`));
    expect(await screen.findByText('Current page home')).toBeInTheDocument();
    expect(launcherBody()).toHaveAttribute('data-page-layout', 'plugin-edge-to-edge');

    const configLensId = 'dev.lensx.config-lens';
    const configLensBatch: PageProviderBatch = {
      provider: {
        kind: 'plugin',
        owner_id: configLensId,
        display_name: { 'en-US': 'ConfigLens' },
      },
      pages: [
        {
          owner_id: configLensId,
          page_id: 'main',
          title: { 'en-US': 'ConfigLens' },
          route: '/',
          presentation: { initial_size: { width: 800, height: 600 }, resizable: true },
          available: true,
        },
      ],
    };
    expect(view.pageRegistry.replaceProviderBatch(configLensId, configLensBatch).ok).toBe(true);
    act(() => view.navigationService.openPage({ owner_id: configLensId, page_id: 'main' }, `${configLensId}.open`));
    expect(await screen.findByText('Current page main')).toBeInTheDocument();
    expect(launcherBody()).toHaveAttribute('data-page-layout', 'plugin-edge-to-edge');

    act(() => view.navigationService.openPage({ owner_id: 'lensx.core', page_id: 'settings' }, 'lensx.core.settings'));
    expect(await screen.findByText('Current page settings')).toBeInTheDocument();
    expect(launcherBody()).toHaveAttribute('data-page-layout', 'settings-split');

    fireEvent.click(screen.getByRole('button', { name: 'Close settings and return home' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Launcher query' })).toBeInTheDocument());
    expect(launcherBody()).not.toHaveAttribute('data-page-layout');
  });

  test('keeps one current Runtime across shortcut activation refresh and replaces it only after a real close', async () => {
    const activationSource = new TestLauncherActivationSource();
    const setPresentationState = rs.fn(async (_target: LauncherSurfaceTarget) => undefined);
    const view = renderPluginComposition({ activationSource, surfaceController: { setPresentationState } });
    await waitFor(() => expect(view.actionService.registry.get(`${pluginId}.open_project`)).toBeDefined());
    await waitFor(() => expect(activationSource.listeners.size).toBe(1));

    act(() =>
      view.navigationService.openPage({ owner_id: pluginId, page_id: 'open_project' }, `${pluginId}.open_project`),
    );
    const slot = await waitFor(() => {
      const current = document.querySelector('[data-plugin-runtime-slot="true"]');
      expect(current).not.toBeNull();
      return current;
    });
    await waitFor(() =>
      expect(setPresentationState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'plugin_page',
          page_attempt_id: 'page_attempt_1',
        }),
      ),
    );
    const surfaceCallsBeforeRestore = setPresentationState.mock.calls.length;

    await act(async () => {
      activationSource.emit({ reason: 'global_shortcut' });
      await view.projection.whenIdle();
      await Promise.resolve();
    });

    await waitFor(() => expect(document.querySelector('[data-plugin-runtime-slot="true"]')).toBe(slot));
    expect(view.pluginRuntimeResolver.resolve).toHaveBeenCalledTimes(1);
    expect(view.pluginChildWebviewPresentationController.create).toHaveBeenCalledTimes(1);
    expect(view.pluginChildWebviewPresentationController.destroy).not.toHaveBeenCalled();
    expect(setPresentationState).toHaveBeenCalledTimes(surfaceCallsBeforeRestore);
    expect(document.body).not.toHaveTextContent('Loading the plugin page');

    fireEvent.click(screen.getByRole('button', { name: 'Close page and return home' }));
    await waitFor(() => expect(document.querySelector('[data-plugin-runtime-slot="true"]')).toBeNull());
    await waitFor(() =>
      expect(view.pluginChildWebviewPresentationController.destroy).toHaveBeenCalledWith({
        attemptId: 'attempt_0123456789abcdef',
      }),
    );

    act(() =>
      view.navigationService.openPage({ owner_id: pluginId, page_id: 'open_project' }, `${pluginId}.open_project`),
    );
    const reopenedSlot = await waitFor(() => {
      const current = document.querySelector('[data-plugin-runtime-slot="true"]');
      expect(current).not.toBeNull();
      return current;
    });
    expect(reopenedSlot).not.toBe(slot);
    expect(view.pluginRuntimeResolver.resolve).toHaveBeenCalledTimes(2);
    expect(view.pluginChildWebviewPresentationController.create).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(setPresentationState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'plugin_page',
          page_attempt_id: 'page_attempt_2',
        }),
      ),
    );
  });

  test('applies independent custom and fixed plugin targets across A to B without inheritance', async () => {
    const setPresentationState = rs.fn(async (_target: LauncherSurfaceTarget) => undefined);
    const view = renderPluginComposition({
      surfaceController: { setPresentationState },
      renderPage: (page) => <div>{page.page_id}</div>,
    });
    await waitFor(() => expect(view.pageRegistry.lookup({ owner_id: pluginId, page_id: 'home' })).toBeDefined());

    act(() => view.navigationService.openPage({ owner_id: pluginId, page_id: 'home' }, `${pluginId}.open_project`));
    await waitFor(() =>
      expect(setPresentationState).toHaveBeenLastCalledWith({
        kind: 'plugin_page',
        owner_id: pluginId,
        page_id: 'home',
        page_attempt_id: 'page_attempt_1',
        initial_size: { width: 800, height: 600 },
        resizable: true,
      }),
    );

    act(() =>
      view.navigationService.openPage({ owner_id: pluginId, page_id: 'open_project' }, `${pluginId}.open_project`),
    );
    await waitFor(() =>
      expect(setPresentationState).toHaveBeenLastCalledWith({
        kind: 'plugin_page',
        owner_id: pluginId,
        page_id: 'open_project',
        page_attempt_id: 'page_attempt_2',
        initial_size: { width: 650, height: 600 },
        resizable: false,
      }),
    );
  });

  test('retains active App state when the native surface transition fails', async () => {
    const consoleError = rs.spyOn(console, 'error').mockImplementation(() => undefined);
    const setPresentationState = rs.fn(async (target: LauncherSurfaceTarget) => {
      if (target.kind === 'plugin_page') throw new Error('private native transition detail');
    });
    const view = renderPluginComposition({
      surfaceController: { setPresentationState },
      renderPage: (page) => <div>Current page {page.page_id}</div>,
    });
    await waitFor(() => expect(view.pageRegistry.lookup({ owner_id: pluginId, page_id: 'home' })).toBeDefined());

    act(() => view.navigationService.openPage({ owner_id: pluginId, page_id: 'home' }, `${pluginId}.open_project`));
    expect(await screen.findByText('Current page home')).toBeInTheDocument();
    await waitFor(() =>
      expect(setPresentationState).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'plugin_page' })),
    );
    expect(screen.getByRole('button', { name: 'Close page and return home' })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  test('navigates a projected Action to one native Runtime slot and resolves current metadata', async () => {
    const { actionService, pageRegistry, pluginChildWebviewPresentationController, pluginRuntimeResolver } =
      renderPluginComposition();
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    await waitFor(() => expect(actionService.registry.get(`${pluginId}.open_project`)).toBeDefined());

    fireEvent.change(input, { target: { value: 'Launch Workspace' } });
    const option = await screen.findByRole('option', { name: /Launch Workspace/u });
    fireEvent.click(option);

    await waitFor(() => expect(document.querySelectorAll('[data-plugin-runtime-slot="true"]')).toHaveLength(1));
    expect(document.querySelector('iframe')).toBeNull();
    expect(pluginRuntimeResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 0, activePage: expect.objectContaining({ owner_id: pluginId }) }),
    );
    await waitFor(() =>
      expect(pluginChildWebviewPresentationController.create).toHaveBeenCalledWith({
        identity: {
          entryId: runtimeDescriptor.entry_id,
          pluginId: runtimeDescriptor.plugin_id,
          version: runtimeDescriptor.version,
          pageId: runtimeDescriptor.page_id,
          expectedRevision: runtimeDescriptor.registration_revision,
        },
        scaleFactor: window.devicePixelRatio,
        physicalBounds: { x: 10, y: 20, width: 400, height: 300 },
        presentationRevision: 1n,
      }),
    );
    const context = screen.getByRole('region', { name: 'Workspace Tools: Launch Workspace' });
    expect(context.querySelector('[data-owner-icon-token]')).toHaveAttribute('data-owner-icon-token', 'owner-fallback');
    expect(document.querySelectorAll('[data-plugin-runtime-slot="true"]')).toHaveLength(1);

    act(() => {
      actionService.registry.replaceProviderBatch(pluginId, []);
    });
    expect(await screen.findByRole('region', { name: 'Workspace Tools: Open Project' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chinese' }));
    expect(await screen.findByRole('region', { name: '工作区工具: 打开项目' })).toBeInTheDocument();
    expect(document.querySelector('[data-plugin-runtime-slot="true"]')?.parentElement).toHaveAttribute(
      'aria-label',
      '打开项目',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.body).toHaveAttribute('theme-mode', 'dark');

    act(() => {
      pageRegistry.replaceProviderBatch(pluginId, []);
    });
    const restoredInput = await screen.findByRole('combobox', { name: '启动器查询' });
    await waitFor(() => expect(restoredInput).toHaveFocus());
    await waitFor(() =>
      expect(pluginChildWebviewPresentationController.destroy).toHaveBeenCalledWith({
        attemptId: 'attempt_0123456789abcdef',
      }),
    );
    expect(document.querySelector('[data-plugin-runtime-slot="true"]')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('supports keyboard-synthesized and pointer close while restoring the Launcher input', async () => {
    const { actionService, navigationService } = renderPluginComposition();
    await waitFor(() => expect(actionService.registry.get(`${pluginId}.open_project`)).toBeDefined());
    const actionId = `${pluginId}.open_project`;

    act(() => navigationService.openPage({ owner_id: pluginId, page_id: 'open_project' }, actionId));
    const keyboardClose = await screen.findByRole('button', { name: 'Close page and return home' });
    keyboardClose.focus();
    fireEvent.click(keyboardClose, { detail: 0 });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Launcher query' })).toHaveFocus());

    act(() => navigationService.openPage({ owner_id: pluginId, page_id: 'open_project' }, actionId));
    fireEvent.click(await screen.findByRole('button', { name: 'Close page and return home' }), { detail: 1 });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Launcher query' })).toHaveFocus());
  });

  test('returns Home and restores input focus before deferred Child teardown completes', async () => {
    let finishDestroy: ((value: boolean) => void) | undefined;
    const destroy = rs.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishDestroy = resolve;
        }),
    );
    const submittedTargets: LauncherSurfaceTarget[] = [];
    const surfaceController = {
      setPresentationState: rs.fn(async (target: LauncherSurfaceTarget) => {
        submittedTargets.push(target);
      }),
    };
    const view = renderPluginComposition({ destroy, surfaceController });
    await waitFor(() => expect(view.actionService.registry.get(`${pluginId}.open_project`)).toBeDefined());

    act(() =>
      view.navigationService.openPage({ owner_id: pluginId, page_id: 'open_project' }, `${pluginId}.open_project`),
    );
    await waitFor(() =>
      expect(submittedTargets).toContainEqual({
        kind: 'plugin_page',
        owner_id: pluginId,
        page_id: 'open_project',
        page_attempt_id: 'page_attempt_1',
        initial_size: { width: 650, height: 600 },
        resizable: false,
      }),
    );
    await waitFor(() => expect(view.pluginChildWebviewPresentationController.create).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Close page and return home' }));

    await waitFor(() => expect(destroy).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }));
    expect(finishDestroy).toBeDefined();
    await waitFor(() => expect(submittedTargets.at(-1)).toEqual({ kind: 'home' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Launcher query' })).toHaveFocus());
    expect(document.querySelector('[data-plugin-runtime-slot="true"]')).toBeNull();

    await act(async () => finishDestroy?.(true));
  });

  test('does not render Settings for an unresolved non-Host owner', async () => {
    const pageRegistry = new PageRegistry([
      { owner_id: 'lensx.core', page_id: 'settings', enabled: true, title: { 'en-US': 'Settings' } },
    ]);
    const navigationService = new AppNavigationService(pageRegistry);
    const actionRegistry = new LauncherActionRegistry();
    render(
      <AppProviders>
        <App
          actionService={{ registry: actionRegistry, dispatcher: new LauncherActionDispatcher(actionRegistry) }}
          activationSource={{ subscribe: async () => () => undefined }}
          collectionsClient={collectionsClient}
          navigationService={navigationService}
        />
      </AppProviders>,
    );

    expect(() =>
      navigationService.openPage({ owner_id: 'com.unknown.plugin', page_id: 'home' }, 'unknown.open'),
    ).toThrow(expect.objectContaining({ code: 'page_unavailable' }));
    expect(screen.queryByText('Color theme')).not.toBeInTheDocument();
  });
});
