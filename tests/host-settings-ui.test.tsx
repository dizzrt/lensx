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
  openPermissionConfirmation = rs.fn();
  confirmPermissionDecision = rs.fn(async () => undefined);
  cancelPermissionDecision = rs.fn();
  deferPreparedPermissions = rs.fn();
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
    permissions: Object.freeze([
      Object.freeze({
        permission_id: 'clipboard.read',
        requested: true,
        supported: true,
        granted: true,
        effective: 'granted',
        methods: Object.freeze(['clipboard.read']),
        prompt: Object.freeze({
          permission_id: 'clipboard.read',
          host_name: Object.freeze({ 'en-US': 'Read clipboard text', 'zh-CN': '读取剪贴板文本' }),
          host_risk_description: Object.freeze({
            'en-US': 'Can read clipboard text.',
            'zh-CN': '可以读取剪贴板文本。',
          }),
          risk: 'sensitive',
          supported: true,
          requested: true,
          persisted_grant: true,
          effective: 'granted',
          publisher_unverified: true,
          grant_available: false,
          revoke_available: true,
        }),
      }),
    ]),
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

  test('renders the empty management surface and routes installation through the shared facade', async () => {
    const managementService = new ControlledManagementService(emptyManagementView);
    renderSettingsApp({
      managementService,
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsTab();
    expect(screen.getByRole('heading', { level: 3, name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByText('No plugins are installed.')).toBeInTheDocument();
    const install = screen.getByRole('button', { name: 'Install from file' });
    install.focus();
    fireEvent.keyDown(install, { key: 'Enter' });
    fireEvent.click(install);
    expect(managementService.prepareInstallation).toHaveBeenCalledTimes(1);
  });

  test('keeps prepared sensitive permissions off, confirms one choice, and permits zero-grant install', async () => {
    const permission =
      healthyManagementView.detail.kind === 'registered'
        ? healthyManagementView.detail.permissions[0]?.prompt
        : undefined;
    if (!permission) throw new Error('healthy permission prompt is required');
    const preparedView: PluginManagementViewModel = Object.freeze({
      ...emptyManagementView,
      confirmation: Object.freeze({
        kind: 'installation',
        candidate: Object.freeze({
          plugin_id: healthyEntry.plugin_id,
          version: healthyEntry.version,
          display_name: healthyEntry.display.name,
          publisher: healthyManifest.publisher,
          permissions: Object.freeze([
            Object.freeze({
              ...permission,
              persisted_grant: false,
              effective: 'not_granted',
              grant_available: true,
              revoke_available: false,
            }),
            Object.freeze({
              ...permission,
              permission_id: 'host.future',
              supported: false,
              effective: 'unsupported',
              grant_available: false,
              revoke_available: false,
            }),
          ]),
          publisher_unverified: true,
        }),
        selected_permission_ids: Object.freeze([]),
      }),
    });
    const managementService = new ControlledManagementService(preparedView);
    managementService.cancelPermissionDecision.mockImplementation(() => managementService.publish(preparedView));
    renderSettingsApp({
      managementService,
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsTab();
    const installDialog = await screen.findByRole('dialog', { name: 'Review plugin permissions' });
    expect(within(installDialog).getByText('Publisher unverified')).toBeInTheDocument();
    const [supported, unsupported] = within(installDialog).getAllByRole('checkbox');
    expect(supported).not.toBeChecked();
    expect(unsupported).toBeDisabled();
    const supportedControl = document.getElementById('plugin-installation-permission-clipboard.read');
    if (!supportedControl) throw new Error('supported installation permission control is required');
    fireEvent.click(supportedControl);
    expect(managementService.openPermissionConfirmation).toHaveBeenCalledWith('clipboard.read', true);
    managementService.publish(
      Object.freeze({
        ...preparedView,
        permission_confirmation: Object.freeze({ context: 'installation', action: 'grant', permission }),
      }),
    );
    const permissionDialog = await screen.findByRole('dialog', { name: 'Allow sensitive permission?' });
    expect(within(permissionDialog).getByText('Can read clipboard text.')).toBeInTheDocument();
    fireEvent.click(within(permissionDialog).getByRole('button', { name: 'cancel' }));
    const restoredInstallDialog = await screen.findByRole('dialog', { name: 'Review plugin permissions' });
    const restoredSupported = within(restoredInstallDialog).getAllByRole('checkbox')[0];
    await waitFor(() => expect(restoredSupported).toHaveFocus());
    fireEvent.click(
      within(restoredInstallDialog).getByRole('button', { name: 'Decide later and install without grants' }),
    );
    expect(managementService.deferPreparedPermissions).toHaveBeenCalledTimes(1);
    expect(managementService.commitInstallation).toHaveBeenCalledTimes(1);
  });

  test('shows healthy facts and read-only permissions and routes lifecycle actions', async () => {
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
    await openPluginsTab();
    expect(screen.getByText(healthyManifest.plugin_id)).toBeInTheDocument();
    expect(screen.getByText('Review Host risk and grant or revoke one permission at a time.')).toBeInTheDocument();
    expect(screen.getByText('Read clipboard text')).toBeInTheDocument();
    expect(screen.getByText('Granted')).toBeInTheDocument();
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
          added_permission_ids: Object.freeze(['clipboard.write']),
          removed_permission_ids: Object.freeze([]),
          retained_permissions: Object.freeze([]),
          added_permissions: Object.freeze([]),
          removed_permissions: Object.freeze([]),
          selected_permission_ids: Object.freeze([]),
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

  test('confirms a settings revoke, explains immediate Runtime impact, and restores its trigger', async () => {
    const managementService = new ControlledManagementService(healthyManagementView);
    managementService.openPermissionConfirmation.mockImplementation((permissionId, granted) => {
      const prompt =
        healthyManagementView.detail.kind === 'registered'
          ? healthyManagementView.detail.permissions.find((item) => item.permission_id === permissionId)?.prompt
          : undefined;
      if (!prompt || granted) return;
      managementService.publish(
        Object.freeze({
          ...healthyManagementView,
          permission_confirmation: Object.freeze({ context: 'settings', action: 'revoke', permission: prompt }),
        }),
      );
    });
    managementService.cancelPermissionDecision.mockImplementation(() =>
      managementService.publish(healthyManagementView),
    );
    renderSettingsApp({
      managementService,
      preferencesClient: {
        read: async () => ({ theme_mode: 'light', locale: 'en-US' }),
        write: async (preferences) => preferences,
      },
    });
    await openPluginsTab();
    const revoke = screen.getByRole('button', { name: 'Revoke' });
    revoke.focus();
    fireEvent.click(revoke);
    const revokeDialog = await screen.findByRole('dialog', { name: 'Revoke permission?' });
    expect(within(revokeDialog).getByText(/takes effect immediately/iu)).toBeInTheDocument();
    fireEvent.click(within(revokeDialog).getByRole('button', { name: 'cancel' }));
    await waitFor(() => expect(revoke).toHaveFocus());
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
    await openPluginsTab();
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
    await openPluginsTab();
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
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
    await openPluginsTab();

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
