import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  createDefaultLauncherActionService,
  OPEN_SETTINGS_ACTION_ID,
  searchLauncherActions,
} from '../src/app/launcher/actions';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import { AppNavigationService, HostPageCatalog } from '../src/app/navigation';
import {
  createLocalPluginInstallationClient,
  type LocalPluginInstallationClient,
  LocalPluginInstallationError,
} from '../src/app/plugins/installation';
import { type AppPreferences, type AppPreferencesClient, AppPreferencesError } from '../src/app/preferences';

const inertActivationSource = {
  subscribe: async () => () => undefined,
};

const cancelledInstallationClient: LocalPluginInstallationClient = {
  install: async () => ({ status: 'cancelled', contract_version: '0.1.0' }),
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const createNavigationService = () =>
  new AppNavigationService(
    new HostPageCatalog([
      {
        owner_id: 'lensx.core',
        page_id: 'settings',
        enabled: true,
      },
    ]),
  );

const renderSettingsApp = ({
  installationClient = cancelledInstallationClient,
  preferencesClient,
  initialLocale = 'en-US',
  initialThemeMode = 'light',
}: {
  installationClient?: LocalPluginInstallationClient;
  preferencesClient: AppPreferencesClient;
  initialLocale?: 'en-US' | 'zh-CN';
  initialThemeMode?: 'light' | 'dark';
}) => {
  const navigationService = createNavigationService();
  const actionService = createDefaultLauncherActionService({ hideLauncher: async () => undefined }, navigationService);
  const rendered = render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App
        actionService={actionService}
        activationSource={inertActivationSource}
        collectionsClient={{
          read: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
          recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
          setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
        }}
        installationClient={installationClient}
        navigationService={navigationService}
        preferencesClient={preferencesClient}
      />
    </AppProviders>,
  );

  return {
    ...rendered,
    actionService,
  };
};

const openSettingsWithKeyboard = async () => {
  const input = screen.getByRole('combobox', { name: /Launcher query|启动器查询/iu });
  fireEvent.change(input, {
    target: { value: input.getAttribute('aria-label') === '启动器查询' ? '设置' : 'settings' },
  });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('region', { name: /lensX: (?:Open settings|打开设置)/iu });
};

const openPluginsTab = async () => {
  await openSettingsWithKeyboard();
  const pluginsTab = screen.getByRole('tab', { name: /plugins|插件/iu });
  pluginsTab.focus();
  fireEvent.keyDown(pluginsTab, { key: 'Enter' });
  fireEvent.click(pluginsTab);
  await waitFor(() => expect(pluginsTab).toHaveAttribute('aria-selected', 'true'));
};

describe('Host settings surface', () => {
  test('searches and executes the localized Host Action into the trusted single-window page', async () => {
    const preferencesClient: AppPreferencesClient = {
      read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
      write: async (preferences) => preferences,
    };
    const { actionService } = renderSettingsApp({ preferencesClient });

    expect(
      searchLauncherActions({
        query: 'preferences',
        locale: 'en-US',
        snapshot: actionService.registry.snapshot(),
        limit: 8,
      }).map(({ action_id: actionId }) => actionId),
    ).toContain(OPEN_SETTINGS_ACTION_ID);
    expect(
      searchLauncherActions({
        query: '设置',
        locale: 'zh-CN',
        snapshot: actionService.registry.snapshot(),
        limit: 8,
      }).map(({ action_id: actionId }) => actionId),
    ).toContain(OPEN_SETTINGS_ACTION_ID);

    await openSettingsWithKeyboard();

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preferences' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Close settings and return home' })).toBeInTheDocument();
    expect(document.querySelector('[data-owner-icon-token]')).toHaveAttribute('data-owner-icon-token', 'lensx-owner');
  });

  test('persists complete snapshots serially and updates root theme and locale only after confirmation', async () => {
    let resolveWrite: (preferences: AppPreferences) => void = () => undefined;
    const firstWrite = new Promise<AppPreferences>((resolve) => {
      resolveWrite = resolve;
    });
    const write = rs
      .fn<(preferences: AppPreferences) => Promise<AppPreferences>>()
      .mockImplementationOnce(async () => firstWrite)
      .mockImplementation(async (preferences) => preferences);
    renderSettingsApp({
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write,
      },
    });
    await openSettingsWithKeyboard();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith({ theme_mode: 'dark', locale: 'en-US' }));
    expect(document.body).not.toHaveAttribute('theme-mode');
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Simplified Chinese' })).toBeDisabled();

    resolveWrite({ theme_mode: 'dark', locale: 'en-US' });
    await waitFor(() => expect(document.body).toHaveAttribute('theme-mode', 'dark'));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Simplified Chinese' }));
    await waitFor(() => expect(write).toHaveBeenLastCalledWith({ theme_mode: 'dark', locale: 'zh-CN' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'zh-CN'));
    expect(screen.getByRole('region', { name: 'lensX: 打开设置' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '简体中文' })).toBeChecked();
  });

  test('retains confirmed values and shows localized safe feedback when persistence fails', async () => {
    const write = rs.fn(async () => {
      throw new AppPreferencesError({
        code: 'preferences_write_failed',
        operation: 'write',
        message: 'Application preferences could not be saved.',
      });
    });
    renderSettingsApp({
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write,
      },
    });
    await openSettingsWithKeyboard();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(
      await screen.findByText('The preference could not be saved. Your previous value is still active.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    expect(document.body).not.toHaveAttribute('theme-mode');
  });

  test('provides accessible first-level navigation and the scoped local installation entry', async () => {
    renderSettingsApp({
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsTab();
    expect(screen.getByRole('heading', { level: 3, name: 'Plugins' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Choose a compatible .lxp package on this Mac to install. Plugin management actions are not available yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install from file' })).toBeEnabled();
    expect(screen.queryByText('Local plugins')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enable|disable|uninstall/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('prevents re-entry while pending, announces cancellation, and restores keyboard focus', async () => {
    const request = deferred<Awaited<ReturnType<LocalPluginInstallationClient['install']>>>();
    const install = rs.fn(async () => request.promise);
    renderSettingsApp({
      installationClient: { install },
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsTab();
    const button = screen.getByRole('button', { name: 'Install from file' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(install).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Installing…' })).toBeDisabled();
    expect(screen.getByText('Installing…', { selector: '.settings-installation-status' })).toBeInTheDocument();

    request.resolve({ status: 'cancelled', contract_version: '0.1.0' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install from file' })).toHaveFocus());
    expect(screen.getByText('No plugin was selected.')).toBeInTheDocument();
  });

  test('announces safe success and failure states, permits retry, and exposes no management facts', async () => {
    const install = rs
      .fn<LocalPluginInstallationClient['install']>()
      .mockRejectedValueOnce(
        new LocalPluginInstallationError({
          contract_version: '0.1.0',
          code: 'busy',
          operation: 'commit',
          message: 'Another plugin installation is in progress.',
        }),
      )
      .mockResolvedValue({
        status: 'installed',
        contract_version: '0.1.0',
        plugin_id: 'com.acme.workspace',
        version: '1.2.3',
        revision: '7',
      });
    renderSettingsApp({
      installationClient: { install },
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsTab();
    const button = screen.getByRole('button', { name: 'Install from file' });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another plugin installation is in progress. Try again shortly.',
    );

    fireEvent.click(button);
    expect(await screen.findByText('Installed com.acme.workspace version 1.2.3.')).toBeInTheDocument();
    expect(install).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/sha256|\/Users\/|installation path/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enable|disable|uninstall/i })).not.toBeInTheDocument();
  });

  test('localizes malformed-boundary feedback and remains readable in Simplified Chinese dark mode', async () => {
    renderSettingsApp({
      installationClient: createLocalPluginInstallationClient(async () => ({
        status: 'installed',
        path: '/Users/private/plugin.lxp',
        package_digest: 'secret',
      })),
      initialLocale: 'zh-CN',
      initialThemeMode: 'dark',
      preferencesClient: {
        read: async () => ({ theme_mode: 'dark', locale: 'zh-CN' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsTab();
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
    expect(screen.getByRole('heading', { level: 3, name: '插件' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '从本地安装' });
    expect(screen.queryByText('本地插件')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('lensX 收到了无效的安装响应。');
    expect(document.body).not.toHaveTextContent('/Users/private/plugin.lxp');
    expect(document.body).not.toHaveTextContent('secret');
  });
});
