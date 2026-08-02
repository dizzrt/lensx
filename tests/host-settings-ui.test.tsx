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
import { type AppPreferences, type AppPreferencesClient, AppPreferencesError } from '../src/app/preferences';

const inertActivationSource = {
  subscribe: async () => () => undefined,
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
  preferencesClient,
  initialLocale = 'en-US',
  initialThemeMode = 'light',
}: {
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
  const input = screen.getByRole('combobox', { name: 'Launcher query' });
  fireEvent.change(input, { target: { value: 'settings' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('region', { name: 'lensX: Open settings' });
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

  test('provides accessible first-level navigation and the scoped plugin empty state', async () => {
    renderSettingsApp({
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openSettingsWithKeyboard();
    const pluginsTab = screen.getByRole('tab', { name: 'Plugins' });

    pluginsTab.focus();
    fireEvent.keyDown(pluginsTab, { key: 'Enter' });

    await waitFor(() => expect(pluginsTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('heading', { level: 3, name: 'No plugins to manage' })).toBeInTheDocument();
    expect(screen.getByText('Plugin management is not available in this version.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install|enable|disable|uninstall/i })).not.toBeInTheDocument();
  });
});
