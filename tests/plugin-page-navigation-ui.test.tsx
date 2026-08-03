import { describe, expect, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import { useAppLocale } from '../src/app/i18n';
import {
  createDefaultLauncherActionService,
  LauncherActionDispatcher,
  LauncherActionRegistry,
} from '../src/app/launcher/actions';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import { AppNavigationService, PageRegistry } from '../src/app/navigation';
import {
  type PluginRegistrationDesktopAdapter,
  type PluginRegistrationSnapshot,
  parsePluginRegistrationDetailResponse,
} from '../src/app/plugins/registration';
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
  granted_permission_ids: ['lensx.filesystem.read_selected'],
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
  contract_version: '0.1.0',
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
    readDetail: async () => ({ contract_version: '0.1.0', revision: '1', detail }),
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

const renderPluginComposition = () => {
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
  render(
    <AppProviders>
      <TestProviderControls />
      <App
        actionService={actionService}
        activationSource={{ subscribe: async () => () => undefined }}
        collectionsClient={collectionsClient}
        navigationService={navigationService}
        surfaceProjectionService={projection}
      />
    </AppProviders>,
  );
  return { actionService, navigationService, pageRegistry };
};

describe('Plugin Page navigation UI', () => {
  test('navigates a real projected Action to the localized Runtime-free placeholder and resolves current metadata', async () => {
    const { actionService, pageRegistry } = renderPluginComposition();
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    await waitFor(() => expect(actionService.registry.get(`${pluginId}.open_project`)).toBeDefined());

    fireEvent.change(input, { target: { value: 'Launch Workspace' } });
    const option = await screen.findByRole('option', { name: /Launch Workspace/u });
    fireEvent.click(option);

    const placeholder = await screen.findByRole('region', { name: 'Open Project' });
    expect(placeholder).toHaveTextContent('Open Project');
    expect(placeholder).toHaveTextContent(
      'This plugin page is registered, but its isolated runtime is not available yet.',
    );
    const context = screen.getByRole('region', { name: 'Workspace Tools: Launch Workspace' });
    expect(context.querySelector('[data-owner-icon-token]')).toHaveAttribute('data-owner-icon-token', 'owner-fallback');
    expect(within(placeholder).queryByRole('button')).not.toBeInTheDocument();
    expect(placeholder).not.toHaveTextContent(/manage|permission|retry|iframe|Tauri/u);
    expect(document.body.innerHTML).not.toContain('/open-project');

    act(() => {
      actionService.registry.replaceProviderBatch(pluginId, []);
    });
    expect(await screen.findByRole('region', { name: 'Workspace Tools: Open Project' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chinese' }));
    expect(await screen.findByRole('region', { name: '工作区工具: 打开项目' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '打开项目' })).toHaveTextContent('隔离运行时尚不可用');
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.body).toHaveAttribute('theme-mode', 'dark');

    act(() => {
      pageRegistry.replaceProviderBatch(pluginId, []);
    });
    const restoredInput = await screen.findByRole('combobox', { name: '启动器查询' });
    await waitFor(() => expect(restoredInput).toHaveFocus());
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
