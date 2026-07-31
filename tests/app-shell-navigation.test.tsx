import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  LauncherActionDispatcher,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import type { LauncherSurfaceController } from '../src/app/launcher/surface';
import { AppNavigationService, HostPageCatalog } from '../src/app/navigation';

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
}: {
  navigationService: AppNavigationService;
  actionService?: LauncherActionService;
  renderPage?: React.ComponentProps<typeof App>['renderPage'];
  initialLocale?: 'en-US' | 'zh-CN';
  initialThemeMode?: 'light' | 'dark';
  surfaceController?: LauncherSurfaceController;
}) =>
  render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App
        actionService={actionService}
        activationSource={inertActivationSource}
        navigationService={navigationService}
        renderPage={renderPage}
        surfaceController={surfaceController}
      />
    </AppProviders>,
  );

describe('App Shell page navigation', () => {
  test('derives home, search, and page states and restores focus after closing the page', async () => {
    const navigationService = createNavigationService();
    renderShell({ navigationService });

    expect(
      screen.getByText('Search for an action to get started.').closest('[data-presentation-state]'),
    ).toHaveAttribute('data-presentation-state', 'home');
    const input = screen.getByRole('combobox', { name: 'Launcher query' });

    fireEvent.change(input, { target: { value: 'settings' } });
    expect(screen.getByRole('option', { name: /Open settings/ }).closest('[data-presentation-state]')).toHaveAttribute(
      'data-presentation-state',
      'search',
    );
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Trusted settings content')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Opened by Open settings')).toBeInTheDocument();
    expect(screen.getByText('Trusted settings content').closest('[data-presentation-state]')).toHaveAttribute(
      'data-presentation-state',
      'page',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close settings and return home' }));
    const restoredInput = await screen.findByRole('combobox', { name: 'Launcher query' });
    expect(restoredInput).toHaveValue('');
    expect(restoredInput).toHaveFocus();
    expect(screen.getByText('Search for an action to get started.')).toBeInTheDocument();
  });

  test('requests fixed presentation heights by state without resizing for result-count changes', async () => {
    const navigationService = createNavigationService();
    const setPresentationState = rs.fn(async (_state: 'home' | 'page' | 'search') => undefined);
    renderShell({
      navigationService,
      surfaceController: { setPresentationState },
    });

    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith('home'));
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'settings' } });
    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith('search'));
    const callsAfterEnteringSearch = setPresentationState.mock.calls.length;

    fireEvent.change(input, { target: { value: 'preferences settings' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /Open settings/ })).toBeInTheDocument());
    expect(setPresentationState).toHaveBeenCalledTimes(callsAfterEnteringSearch);

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith('page'));

    fireEvent.click(screen.getByRole('button', { name: 'Close settings and return home' }));
    await waitFor(() => expect(setPresentationState).toHaveBeenLastCalledWith('home'));
    expect(setPresentationState.mock.calls.map(([state]) => state)).toEqual(['home', 'search', 'page', 'home']);
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
    expect(screen.getByText('由“打开设置”打开')).toBeInTheDocument();
    expect(screen.queryByText(/sensitive page implementation detail/)).not.toBeInTheDocument();
    expect(document.body).toHaveAttribute('theme-mode', 'dark');

    fireEvent.click(screen.getByRole('button', { name: '关闭设置并返回主页' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '启动器查询' })).toHaveFocus());
    consoleError.mockRestore();
  });
});
