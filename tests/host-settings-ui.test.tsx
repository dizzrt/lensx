import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import validRegistrationCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  createDefaultLauncherActionService,
  OPEN_SETTINGS_ACTION_ID,
  searchLauncherActions,
} from '../src/app/launcher/actions';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import { AppNavigationService, HostPageCatalog } from '../src/app/navigation';
import type { PluginManagementService, PluginManagementViewModel } from '../src/app/plugins/management';
import { inertPluginManagementService } from '../src/app/plugins/management';
import { parsePluginRegistrationDetailResponse } from '../src/app/plugins/registration';
import { type AppPreferences, type AppPreferencesClient, AppPreferencesError } from '../src/app/preferences';

const inertActivationSource = {
  subscribe: async () => () => undefined,
};

const parsedRegistrationDetail = parsePluginRegistrationDetailResponse(
  structuredClone(validRegistrationCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (parsedRegistrationDetail.detail.kind !== 'registered') throw new Error('healthy detail fixture is required');
const healthyManifest = parsedRegistrationDetail.detail.manifest;

const availableOperations = Object.freeze({
  install: true,
  enable: false,
  disable: true,
  replace: true,
  uninstall: true,
  clear_data: false,
  retry: true,
});

class ControlledManagementService implements PluginManagementService {
  private readonly listeners = new Set<(view: PluginManagementViewModel) => void>();
  view: PluginManagementViewModel;

  constructor(view: PluginManagementViewModel) {
    this.view = view;
  }

  current = () => this.view;
  subscribe = (listener: (view: PluginManagementViewModel) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  publish(view: PluginManagementViewModel) {
    this.view = view;
    for (const listener of this.listeners) listener(view);
  }
  initialize = rs.fn(async () => undefined);
  refresh = rs.fn(async () => undefined);
  select = rs.fn(async () => undefined);
  prepareInstallation = rs.fn(async () => undefined);
  commitInstallation = rs.fn(async () => undefined);
  cancelInstallation = rs.fn(async () => undefined);
  setEnabled = rs.fn(async () => undefined);
  prepareReplacement = rs.fn(async () => undefined);
  commitReplacement = rs.fn(async () => undefined);
  cancelReplacement = rs.fn(async () => undefined);
  uninstall = rs.fn(async () => undefined);
  clearData = rs.fn(async () => undefined);
  setDevelopmentMode = rs.fn(async () => undefined);
  registerDevelopmentDirectory = rs.fn(async () => undefined);
  reloadDevelopmentEntry = rs.fn(async () => undefined);
  removeDevelopmentEntry = rs.fn(async () => undefined);
  destroy = rs.fn(async () => undefined);
}

const emptyManagementView: PluginManagementViewModel = Object.freeze({
  state: 'empty',
  revision: '1',
  entries: Object.freeze([]),
  detail: Object.freeze({ kind: 'none' }),
  operations: Object.freeze({
    ...availableOperations,
    enable: false,
    disable: false,
    replace: false,
    uninstall: false,
  }),
});

const healthyEntry = Object.freeze({
  kind: 'registered' as const,
  entry_id: 'entry_0000000000000101',
  plugin_id: healthyManifest.plugin_id,
  version: healthyManifest.version,
  display: healthyManifest.display,
  source: 'external' as const,
  enabled: true,
  compatibility: Object.freeze({ lensx: true, host_api: true }),
  runtime: Object.freeze({ kind: 'inactive' as const }),
});

const healthyManagementView: PluginManagementViewModel = Object.freeze({
  state: 'ready',
  revision: '2',
  entries: Object.freeze([healthyEntry]),
  selected_entry_id: healthyEntry.entry_id,
  detail: Object.freeze({
    kind: 'registered',
    entry_id: healthyEntry.entry_id,
    manifest: healthyManifest,
    source: 'external',
    enabled: true,
    compatibility: Object.freeze({ lensx: true, host_api: true }),
    runtime: Object.freeze({ kind: 'inactive' }),
    diagnostics: Object.freeze([]),
  }),
  operations: availableOperations,
});

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
  managementService = inertPluginManagementService,
  preferencesClient,
  initialLocale = 'en-US',
  initialThemeMode = 'light',
}: {
  managementService?: PluginManagementService;
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
        pluginManagementService={managementService}
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

const openPluginsSection = async () => {
  await openSettingsWithKeyboard();
  const pluginsItem = screen.getByRole('menuitem', { name: /plugins|插件/iu });
  pluginsItem.focus();
  fireEvent.keyDown(pluginsItem, { code: 'Enter', key: 'Enter' });
  await waitFor(() => expect(pluginsItem).toHaveAttribute('aria-current', 'page'));
};

const openPreferenceSelect = async (comboboxName: string) => {
  const combobox = screen.getByRole('combobox', { name: comboboxName });
  combobox.focus();
  fireEvent.click(combobox);
  await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));
  return screen.findByRole('listbox');
};

const selectPreferenceOption = async (comboboxName: string, optionName: string) => {
  const listbox = await openPreferenceSelect(comboboxName);
  fireEvent.click(within(listbox).getByRole('option', { name: optionName }));
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
    const settingsNavigation = screen.getByRole('navigation', { name: 'Settings' });
    const preferencesItem = within(settingsNavigation).getByRole('menuitem', { name: 'Preferences' });
    const pluginsItem = within(settingsNavigation).getByRole('menuitem', { name: 'Plugins' });
    expect(preferencesItem).toHaveAttribute('aria-current', 'page');
    expect(pluginsItem).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 3, name: 'Preferences' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Plugins' })).not.toBeInTheDocument();
    const themeSelect = screen.getByRole('combobox', { name: 'Color theme' });
    const languageSelect = screen.getByRole('combobox', { name: 'Language' });
    expect(themeSelect).toHaveTextContent('Light');
    expect(themeSelect).toHaveAttribute('aria-expanded', 'false');
    expect(languageSelect).toHaveTextContent('English');
    expect(languageSelect).toHaveAttribute('aria-expanded', 'false');
    const languageOptions = await openPreferenceSelect('Language');
    expect(within(languageOptions).getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(within(languageOptions).getByRole('option', { name: '简体中文' })).toBeInTheDocument();
    fireEvent.click(within(languageOptions).getByRole('option', { name: 'English' }));
    const closeSettings = screen.getByRole('button', { name: 'Close settings and return home' });
    const settingsSurface = settingsNavigation.closest('.launcher-surface');
    expect(settingsSurface).toHaveAttribute('data-page-layout', 'settings-split');
    expect(settingsSurface?.querySelector('.launcher-body')).toHaveAttribute('data-page-layout', 'settings-split');
    expect(settingsSurface?.querySelector('.settings-navigation')).toHaveClass('settings-navigation');
    expect(settingsSurface?.querySelector('.settings-content')).toHaveClass('min-h-0', 'min-w-0', 'flex-1');
    expect(document.querySelector('[data-owner-icon-token]')).toHaveAttribute('data-owner-icon-token', 'lensx-owner');

    pluginsItem.focus();
    fireEvent.keyDown(pluginsItem, { code: 'Enter', key: 'Enter' });
    await waitFor(() => expect(pluginsItem).toHaveAttribute('aria-current', 'page'));
    expect(pluginsItem).toHaveFocus();
    expect(screen.getByRole('heading', { level: 3, name: 'Plugins' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Preferences' })).not.toBeInTheDocument();

    fireEvent.click(preferencesItem);
    await waitFor(() => expect(preferencesItem).toHaveAttribute('aria-current', 'page'));
    expect(screen.getByRole('heading', { level: 3, name: 'Preferences' })).toBeInTheDocument();

    fireEvent.click(closeSettings);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Launcher query' })).toHaveFocus());
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

    await selectPreferenceOption('Color theme', 'Dark');
    await waitFor(() => expect(write).toHaveBeenCalledWith({ theme_mode: 'dark', locale: 'en-US' }));
    expect(document.body).not.toHaveAttribute('theme-mode');
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveAttribute('aria-disabled', 'true');

    resolveWrite({ theme_mode: 'dark', locale: 'en-US' });
    await waitFor(() => expect(document.body).toHaveAttribute('theme-mode', 'dark'));
    expect(screen.getByRole('combobox', { name: 'Color theme' })).toHaveTextContent('Dark');

    await selectPreferenceOption('Language', '简体中文');
    await waitFor(() => expect(write).toHaveBeenLastCalledWith({ theme_mode: 'dark', locale: 'zh-CN' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'zh-CN'));
    expect(screen.getByRole('region', { name: 'lensX: 打开设置' })).toBeInTheDocument();
    const localizedNavigation = screen.getByRole('navigation', { name: '设置' });
    expect(within(localizedNavigation).getByRole('menuitem', { name: '偏好' })).toHaveAttribute('aria-current', 'page');
    expect(within(localizedNavigation).getByRole('menuitem', { name: '插件' })).toBeInTheDocument();
    const localizedLanguageSelect = screen.getByRole('combobox', { name: '语言' });
    expect(localizedLanguageSelect).toHaveTextContent('简体中文');
    const localizedLanguageOptions = await openPreferenceSelect('语言');
    expect(within(localizedLanguageOptions).getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(within(localizedLanguageOptions).getByRole('option', { name: '简体中文' })).toBeInTheDocument();
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

    await selectPreferenceOption('Color theme', 'Dark');

    expect(
      await screen.findByText('The preference could not be saved. Your previous value is still active.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Color theme' })).toHaveTextContent('Light');
    expect(screen.queryByRole('option', { name: 'Dark' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveAttribute('theme-mode');
  });

  test('renders the empty management surface and routes installation through the shared facade', async () => {
    const managementService = new ControlledManagementService(emptyManagementView);
    renderSettingsApp({
      managementService,
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsSection();
    expect(screen.getByRole('heading', { level: 3, name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByText('No plugins are installed.')).toBeInTheDocument();
    const install = screen.getByRole('button', { name: 'Install from file' });
    install.focus();
    fireEvent.keyDown(install, { key: 'Enter' });
    fireEvent.click(install);
    expect(managementService.prepareInstallation).toHaveBeenCalledTimes(1);
  });

  test('shows healthy facts and routes lifecycle actions', async () => {
    const secondEntry = Object.freeze({
      ...healthyEntry,
      entry_id: 'entry_0000000000000103',
      plugin_id: 'com.acme.second',
      display: Object.freeze({
        ...healthyEntry.display,
        name: Object.freeze({ 'en-US': 'Second Plugin', 'zh-CN': '第二个插件' }),
      }),
    });
    const listView = Object.freeze({ ...healthyManagementView, entries: Object.freeze([healthyEntry, secondEntry]) });
    const managementService = new ControlledManagementService(listView);
    renderSettingsApp({
      managementService,
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsSection();
    expect(screen.getByText(healthyManifest.plugin_id)).toBeInTheDocument();
    const firstEntry = document.getElementById(`plugin-management-entry-${healthyEntry.entry_id}`) as HTMLElement;
    const secondEntryButton = document.getElementById(`plugin-management-entry-${secondEntry.entry_id}`) as HTMLElement;
    firstEntry.focus();
    fireEvent.keyDown(firstEntry, { key: 'ArrowDown' });
    await waitFor(() => expect(managementService.select).toHaveBeenCalledWith(secondEntry.entry_id));
    await waitFor(() => expect(secondEntryButton).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(managementService.setEnabled).toHaveBeenCalledWith(false);
    const replace = screen.getByRole('button', { name: 'Replace from file' });
    replace.focus();
    fireEvent.keyDown(replace, { key: 'Enter' });
    fireEvent.click(replace);
    expect(managementService.prepareReplacement).toHaveBeenCalledTimes(1);
    managementService.cancelReplacement.mockImplementation(async () => {
      managementService.publish(listView);
    });
    managementService.publish(
      Object.freeze({
        ...listView,
        confirmation: Object.freeze({
          kind: 'replacement',
          entry_id: healthyEntry.entry_id,
          expected_revision: '2',
          current_version: '1.0.0',
          candidate_version: '2.0.0',
          classification: 'upgrade',
          publisher_unverified: true,
        }),
      }),
    );
    const replacementDialog = await screen.findByRole('dialog', { name: 'Confirm replacement' });
    const cancel = within(replacementDialog).getByRole('button', { name: 'cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Enter' });
    fireEvent.click(cancel);
    await waitFor(() => expect(replace).toHaveFocus());
  });

  test('requires explicit dangerous confirmations, defaults uninstall to retain data, and restores focus', async () => {
    const disabledView: PluginManagementViewModel = Object.freeze({
      ...healthyManagementView,
      detail: Object.freeze({ ...healthyManagementView.detail, enabled: false }),
      entries: Object.freeze([Object.freeze({ ...healthyEntry, enabled: false })]),
      operations: Object.freeze({ ...availableOperations, disable: false, enable: true, clear_data: true }),
    });
    const managementService = new ControlledManagementService(disabledView);
    managementService.uninstall.mockImplementation(async () => {
      managementService.publish(emptyManagementView);
    });
    renderSettingsApp({
      managementService,
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsSection();
    const clear = screen.getByRole('button', { name: 'Clear data' });
    clear.focus();
    fireEvent.click(clear);
    expect(await screen.findByRole('dialog', { name: 'Clear plugin data' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    await waitFor(() => expect(clear).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }));
    const uninstallDialog = await waitFor(() => {
      const activeDialog = document.querySelector<HTMLElement>('.semi-modal-content-animate-show');
      expect(activeDialog).toHaveTextContent('Uninstall plugin');
      return activeDialog as HTMLElement;
    });
    expect(within(uninstallDialog).getByRole('radio', { name: 'Retain data' })).toBeChecked();
    const confirm = within(uninstallDialog).getByRole('button', { name: 'confirm' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Enter' });
    fireEvent.click(confirm);
    expect(managementService.uninstall).toHaveBeenCalledWith('retain_data');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install from file' })).toHaveFocus());
  });

  test('renders quarantine, degraded retry, safe feedback, and Chinese dark mode without raw diagnostics', async () => {
    const quarantineEntry = Object.freeze({
      kind: 'quarantined' as const,
      entry_id: 'entry_0000000000000102',
      plugin_id: 'com.acme.quarantine',
      diagnostic: Object.freeze({ code: 'corrupt_record', phase: 'recover', message: '/private/raw/record.json' }),
    });
    const managementService = new ControlledManagementService(
      Object.freeze({
        state: 'ready',
        revision: '3',
        entries: Object.freeze([quarantineEntry]),
        selected_entry_id: quarantineEntry.entry_id,
        detail: Object.freeze({ ...quarantineEntry }),
        operations: Object.freeze({
          ...availableOperations,
          enable: false,
          disable: false,
          replace: false,
          clear_data: false,
        }),
        feedback: Object.freeze({ kind: 'error', code: 'cleanup_pending' }),
      }),
    );
    renderSettingsApp({
      managementService,
      initialLocale: 'zh-CN',
      initialThemeMode: 'dark',
      preferencesClient: {
        read: async () => ({ theme_mode: 'dark', locale: 'zh-CN' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsSection();
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
    const navigation = screen.getByRole('navigation', { name: '设置' });
    expect(within(navigation).getByRole('menuitem', { name: '插件' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('.settings-content')).toHaveAttribute('data-settings-section', 'plugins');
    expect(document.querySelector('.plugin-management-surface')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '插件' })).toBeInTheDocument();
    expect(screen.getByText('插件记录已损坏。')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('/private/raw/record.json');

    managementService.publish(
      Object.freeze({
        state: 'degraded',
        revision: '4',
        entries: Object.freeze([]),
        detail: Object.freeze({ kind: 'none' }),
        operations: Object.freeze({ ...availableOperations, install: false, retry: true }),
        diagnostic: Object.freeze({ code: 'unavailable', phase: 'initialize', message: 'raw native stack' }),
      }),
    );
    expect(await screen.findByText('插件管理不可用')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: '重试' });
    retry.focus();
    fireEvent.keyDown(retry, { key: 'Enter' });
    fireEvent.click(retry);
    expect(managementService.refresh).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent('raw native stack');
  });

  test('gates development controls, exposes text safety labels, and confirms reload and retain-data removal', async () => {
    const developmentEntry = Object.freeze({ ...healthyEntry, source: 'development' as const });
    const managementService = new ControlledManagementService(
      Object.freeze({
        state: 'ready',
        revision: '7',
        entries: Object.freeze([developmentEntry]),
        selected_entry_id: developmentEntry.entry_id,
        detail: Object.freeze({ ...healthyManagementView.detail, source: 'development' as const }),
        operations: Object.freeze({ ...availableOperations, replace: false, uninstall: false }),
        development: Object.freeze({ visible: true, enabled: true }),
      }),
    );
    renderSettingsApp({
      managementService,
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsSection();

    expect(screen.getByText('Plugin Development Mode')).toBeInTheDocument();
    expect(screen.getAllByText('Unpacked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unsigned').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Uninstall' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Enable Plugin Development Mode for this process' }));
    expect(managementService.setDevelopmentMode).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Register development directory' }));
    expect(managementService.registerDevelopmentDirectory).toHaveBeenCalledTimes(1);

    const reload = screen.getByRole('button', { name: 'Reload from directory' });
    reload.focus();
    fireEvent.click(reload);
    const reloadDialog = screen.getByRole('dialog', { name: 'Reload development plugin?' });
    fireEvent.click(within(reloadDialog).getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(managementService.reloadDevelopmentEntry).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Remove development entry' }));
    const removeDialog = screen.getByRole('dialog', { name: 'Remove development entry?' });
    expect(
      within(removeDialog).getByText(/Plugin data and Launcher collections will be retained/u),
    ).toBeInTheDocument();
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(managementService.removeDevelopmentEntry).toHaveBeenCalledTimes(1));
  });
});
