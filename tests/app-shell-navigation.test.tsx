import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  LauncherActionDispatcher,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import {
  EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  type LauncherActionCollectionsClient,
} from '../src/app/launcher/collections';
import type { LauncherSurfaceController, LauncherSurfaceTarget } from '../src/app/launcher/surface';
import { AppNavigationService, HostPageCatalog } from '../src/app/navigation';
import type { PluginRuntimeLifecycleService } from '../src/app/plugins/runtime';

const inertActivationSource = {
  subscribe: async () => () => undefined,
};

const settingsTarget = {
  owner_id: 'lensx.core',
  page_id: 'settings',
};

const createNavigationService = (enabled = true) =>
  new AppNavigationService(
    new HostPageCatalog([
      {
        ...settingsTarget,
        enabled,
      },
    ]),
  );

const createOpenPageActionService = (
  navigationService: AppNavigationService,
  target = settingsTarget,
): LauncherActionService => {
  const registry = new LauncherActionRegistry();
  const result = registry.register({
    descriptor: {
      action_id: 'lensx.core.open_settings',
      owner_id: 'lensx.core',
      title: { 'en-US': 'Open settings' },
      description: { 'en-US': 'View and change lensX preferences' },
      default_keywords: { 'en-US': ['settings'] },
      enabled: true,
    },
    executor: () => {
      navigationService.openPage(target, 'lensx.core.open_settings');
    },
  });
  if (!result.ok) {
    throw new Error('Test settings Action registration failed.');
  }

  return {
    registry,
    dispatcher: new LauncherActionDispatcher(registry),
  };
};

const renderShell = ({
  navigationService,
  actionService = createOpenPageActionService(navigationService),
  renderPage = () => <div>Trusted settings content</div>,
  initialLocale = 'en-US',
  initialThemeMode = 'light',
  surfaceController,
  pluginRuntimeLifecycleService,
  collectionsClient = {
    read: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
    recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
    setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  },
}: {
  navigationService: AppNavigationService;
  actionService?: LauncherActionService;
  renderPage?: React.ComponentProps<typeof App>['renderPage'];
  initialLocale?: 'en-US' | 'zh-CN';
  initialThemeMode?: 'light' | 'dark';
  surfaceController?: LauncherSurfaceController;
  pluginRuntimeLifecycleService?: PluginRuntimeLifecycleService;
  collectionsClient?: LauncherActionCollectionsClient;
}) =>
  render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App
        actionService={actionService}
        activationSource={inertActivationSource}
        collectionsClient={collectionsClient}
        navigationService={navigationService}
        pluginRuntimeLifecycleService={pluginRuntimeLifecycleService}
        renderPage={renderPage}
        surfaceController={surfaceController}
      />
    </AppProviders>,
  );

describe('App Shell page navigation', () => {
  test('routes Host reload and root teardown through the Runtime terminal coordinator', async () => {
    const terminateCurrent = rs.fn(async () => undefined);
    const lifecycleService: PluginRuntimeLifecycleService = {
      start: rs.fn(async () => undefined),
      terminateCurrent,
      dispose: rs.fn(async () => undefined),
    };
    const view = renderShell({
      navigationService: createNavigationService(),
      pluginRuntimeLifecycleService: lifecycleService,
    });
    fireEvent(window, new Event('beforeunload'));
    fireEvent(window, new Event('pagehide'));
    expect(terminateCurrent).toHaveBeenNthCalledWith(1, 'host_reload');
    expect(terminateCurrent).toHaveBeenNthCalledWith(2, 'host_reload');
    view.unmount();
    expect(terminateCurrent).toHaveBeenNthCalledWith(3, 'app_teardown');
  });

  test('derives home, search, and page states and restores focus after closing the page', async () => {
    const navigationService = createNavigationService();
    renderShell({ navigationService });

    expect(screen.getByRole('region', { name: 'Recent' }).closest('[data-presentation-state]')).toHaveAttribute(
      'data-presentation-state',
      'home',
    );
    expect(screen.getByRole('region', { name: 'Pinned' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(document.querySelector('.launcher-avatar')).not.toHaveAttribute('tabindex');
    const input = screen.getByRole('combobox', { name: 'Launcher query' });

    fireEvent.change(input, { target: { value: 'settings' } });
    expect(screen.getByRole('option', { name: /Open settings/ }).closest('[data-presentation-state]')).toHaveAttribute(
      'data-presentation-state',
      'search',
    );
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Trusted settings content')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const pageContext = screen.getByRole('region', { name: 'lensX: Open settings' });
    expect(pageContext).toBeInTheDocument();
    expect(pageContext.querySelector('[data-owner-icon-token]')).toHaveAttribute(
      'data-owner-icon-token',
      'lensx-owner',
    );
    expect(document.body).not.toHaveAttribute('theme-mode');
    expect(screen.getByText('Trusted settings content').closest('[data-presentation-state]')).toHaveAttribute(
      'data-presentation-state',
      'page',
    );
    expect(pageContext.closest('.launcher-surface')).toHaveAttribute('data-page-layout', 'settings-split');
    expect(pageContext.closest('.launcher-surface')?.querySelector('.launcher-body')).toHaveAttribute(
      'data-page-layout',
      'settings-split',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close settings and return home' }));
    const restoredInput = await screen.findByRole('combobox', { name: 'Launcher query' });
    expect(restoredInput).toHaveValue('');
    expect(restoredInput).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
    expect(restoredInput.closest('.launcher-surface')).not.toHaveAttribute('data-page-layout');
  });

  test('does not leak the settings split modifier to another resolved Host page', async () => {
    const notesTarget = { owner_id: 'lensx.core', page_id: 'notes' };
    const navigationService = new AppNavigationService(
      new HostPageCatalog([{ ...notesTarget, enabled: true, title: { 'en-US': 'Notes' } }]),
    );
    renderShell({ navigationService });

    act(() => navigationService.openPage(notesTarget, 'lensx.core.open_notes'));

    const pageContent = await screen.findByText('Trusted settings content');
    expect(pageContent.closest('.launcher-surface')).not.toHaveAttribute('data-page-layout');
    expect(pageContent.closest('.launcher-surface')?.querySelector('.launcher-body')).not.toHaveAttribute(
      'data-page-layout',
    );
  });

  test('requests fixed tagged Host presentation targets without resizing for result-count changes', async () => {
    const navigationService = createNavigationService();
    const setPresentationState = rs.fn(async (_target: LauncherSurfaceTarget) => undefined);
    renderShell({
      navigationService,
      surfaceController: { setPresentationState },
    });

    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith({ kind: 'home' }));
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'settings' } });
    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith({ kind: 'search' }));
    const callsAfterEnteringSearch = setPresentationState.mock.calls.length;

    fireEvent.change(input, { target: { value: 'preferences settings' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /Open settings/ })).toBeInTheDocument());
    expect(setPresentationState).toHaveBeenCalledTimes(callsAfterEnteringSearch);

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith({ kind: 'host_page' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close settings and return home' }));
    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith({ kind: 'home' }));
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual([
      'home',
      'search',
      'host_page',
      'home',
    ]);
  });

  test('keeps the current search and selection when page preflight fails', async () => {
    const navigationService = createNavigationService();
    const actionService = createOpenPageActionService(navigationService, {
      owner_id: 'lensx.core',
      page_id: 'missing',
    });
    renderShell({ navigationService, actionService });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });

    fireEvent.change(input, { target: { value: 'settings' } });
    const option = screen.getByRole('option', { name: /Open settings/ });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('The action could not be completed.')).toBeInTheDocument();
    expect(input).toHaveValue('settings');
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Trusted settings content')).not.toBeInTheDocument();
  });

  test('isolates active-page render failures while retaining localized navigation and theme', async () => {
    const navigationService = createNavigationService();
    const consoleError = rs.spyOn(console, 'error').mockImplementation(() => undefined);
    const BrokenPage = () => {
      throw new Error('sensitive page implementation detail');
    };
    renderShell({
      navigationService,
      renderPage: () => <BrokenPage />,
      initialLocale: 'zh-CN',
      initialThemeMode: 'dark',
    });
    const input = screen.getByRole('combobox', { name: '启动器查询' });

    fireEvent.change(input, { target: { value: 'settings' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('无法显示此页面');
    expect(screen.getByRole('button', { name: '关闭设置并返回主页' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'lensX: Open settings' })).toBeInTheDocument();
    expect(screen.queryByText(/sensitive page implementation detail/)).not.toBeInTheDocument();
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
    expect(screen.getByRole('alert').closest('.launcher-surface')).toHaveAttribute(
      'data-page-layout',
      'settings-split',
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭设置并返回主页' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '启动器查询' })).toHaveFocus());
    consoleError.mockRestore();
  });

  test('uses the localized page fallback when the opening Action is no longer in the Registry', async () => {
    const navigationService = createNavigationService();
    renderShell({ navigationService });

    act(() => navigationService.openPage(settingsTarget, 'lensx.core.missing_action'));

    expect(await screen.findByRole('region', { name: 'lensX: Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close settings and return home' })).toBeInTheDocument();
  });
});
