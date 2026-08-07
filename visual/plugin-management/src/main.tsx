import '@douyinfe/semi-ui/dist/css/semi.min.css';
import '../../../src/styles/global.less';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import validRegistrationCases from '../../../fixtures/plugin-registration-contract/valid/cases.json';
import { AppProviders } from '../../../src/app/AppProviders';
import { PluginManagementSettings } from '../../../src/app/pages/PluginManagementSettings';
import type { PluginManagementService, PluginManagementViewModel } from '../../../src/app/plugins/management';
import type { PluginPermissionPromptItem } from '../../../src/app/plugins/permission';
import { parsePluginRegistrationDetailResponse } from '../../../src/app/plugins/registration';
import './visual.less';

const params = new URLSearchParams(window.location.search);
const locale = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const state = params.get('state') ?? 'healthy';
const developmentState = state.startsWith('development-');
const parsedDetail = parsePluginRegistrationDetailResponse(
  structuredClone(validRegistrationCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (parsedDetail.detail.kind !== 'registered') throw new Error('healthy detail fixture is required');
const manifest = {
  ...structuredClone(parsedDetail.detail.manifest),
  display: {
    ...structuredClone(parsedDetail.detail.manifest.display),
    name: {
      'en-US': 'Workspace Tools with a deliberately long visual acceptance name',
      'zh-CN': '用于视觉验收的超长工作区工具插件名称',
    },
  },
};
const entry = Object.freeze({
  kind: 'registered' as const,
  entry_id: 'entry_0000000000000201',
  plugin_id: manifest.plugin_id,
  version: manifest.version,
  display: manifest.display,
  source: developmentState ? ('development' as const) : ('external' as const),
  enabled: state !== 'clear' && state !== 'uninstall',
  compatibility: Object.freeze({ lensx: true, host_api: true }),
  runtime: Object.freeze({ kind: 'inactive' as const }),
});
const operations = Object.freeze({
  install: true,
  enable: !entry.enabled,
  disable: entry.enabled,
  replace: true,
  uninstall: true,
  clear_data: !entry.enabled,
  retry: true,
});
const prompt = (
  permissionId: string,
  effective: PluginPermissionPromptItem['effective'],
  options: { supported?: boolean; granted?: boolean; long?: boolean } = {},
): PluginPermissionPromptItem =>
  Object.freeze({
    permission_id: permissionId,
    host_name: Object.freeze({
      'en-US':
        permissionId === 'clipboard.write'
          ? 'Write clipboard text'
          : permissionId === 'clipboard.read'
            ? 'Read clipboard text'
            : 'Unsupported permission',
      'zh-CN':
        permissionId === 'clipboard.write'
          ? '写入剪贴板文本'
          : permissionId === 'clipboard.read'
            ? '读取剪贴板文本'
            : '不支持的权限',
    }),
    host_risk_description: Object.freeze({
      'en-US': options.long
        ? 'This deliberately long Host-owned risk explanation verifies scrolling, wrapping, focus, and readable contrast inside the fixed native viewport without disclosing any package or filesystem evidence.'.repeat(
            3,
          )
        : 'This permission can access clipboard text and requires an explicit decision.',
      'zh-CN': options.long
        ? '这段特意加长的 Host 风险说明用于验证固定原生视口中的滚动、换行、焦点与可读对比度，并且不会披露任何插件包或文件系统证据。'.repeat(
            3,
          )
        : '此权限可以访问剪贴板文本，必须由用户明确决定。',
    }),
    risk: options.supported === false ? 'unknown' : 'sensitive',
    supported: options.supported !== false,
    requested: true,
    persisted_grant: options.granted === true,
    effective,
    author_reason: Object.freeze({
      'en-US': options.long
        ? 'A long plugin-provided reason remains visually separate from Host risk. '.repeat(8)
        : 'Use clipboard text for the selected workflow.',
      'zh-CN': options.long
        ? '较长的插件提供原因始终与 Host 风险说明分开展示。'.repeat(8)
        : '在用户选择的工作流中使用剪贴板文本。',
    }),
    publisher_unverified: true,
    grant_available: effective === 'not_granted' && options.supported !== false,
    revoke_available: options.granted === true,
  });
const granted = prompt('clipboard.read', 'granted', { granted: true });
const notGranted = prompt('clipboard.write', 'not_granted');
const unsupported = prompt('future.permission', 'unsupported', { supported: false });
const permissionView = (item: PluginPermissionPromptItem) =>
  Object.freeze({
    permission_id: item.permission_id,
    requested: item.requested,
    supported: item.supported,
    granted: item.persisted_grant,
    effective: item.effective,
    methods: Object.freeze(item.supported ? [item.permission_id] : []),
    reason: item.author_reason,
    prompt: item,
  });
const installationConfirmation = (items: readonly PluginPermissionPromptItem[]) =>
  Object.freeze({
    kind: 'installation' as const,
    candidate: Object.freeze({
      plugin_id: 'com.acme.workspace',
      version: '2.0.0',
      display_name: manifest.display.name,
      publisher: Object.freeze({
        author: 'Acme verified official publisher claim',
        homepage: 'https://example.com',
        repository: 'https://example.com/repository',
      }),
      publisher_unverified: true as const,
      permissions: Object.freeze(items),
    }),
    selected_permission_ids: Object.freeze([]),
  });

const healthyView = (): PluginManagementViewModel => {
  const items =
    state === 'settings-not-granted'
      ? [notGranted]
      : state === 'settings-unsupported'
        ? [unsupported]
        : state === 'partial-grant'
          ? [granted, notGranted]
          : [granted, unsupported];
  return Object.freeze({
    state: 'ready',
    revision: '8',
    entries: Object.freeze([entry]),
    selected_entry_id: entry.entry_id,
    detail: Object.freeze({
      kind: 'registered',
      entry_id: entry.entry_id,
      manifest,
      source: entry.source,
      enabled: entry.enabled,
      compatibility: Object.freeze({ lensx: true, host_api: true }),
      runtime: Object.freeze({ kind: 'inactive' }),
      permissions: Object.freeze(items.map(permissionView)),
      diagnostics: Object.freeze([]),
    }),
    operations,
    ...(developmentState
      ? {
          development: Object.freeze({
            visible: true,
            enabled: true,
            ...(state === 'development-pending' ? { pending: 'reload' as const } : {}),
            ...(state === 'development-error'
              ? { feedback: Object.freeze({ kind: 'error' as const, code: 'source_changed' as const }) }
              : {}),
          }),
        }
      : {}),
    ...(state === 'prepared-install' ? { confirmation: installationConfirmation([notGranted]) } : {}),
    ...(state === 'zero-grant' ? { confirmation: installationConfirmation([]) } : {}),
    ...(state === 'all-sensitive'
      ? { confirmation: installationConfirmation([prompt('clipboard.read', 'not_granted'), notGranted]) }
      : {}),
    ...(state === 'long-reason'
      ? { confirmation: installationConfirmation([prompt('clipboard.read', 'not_granted', { long: true })]) }
      : {}),
    ...(state === 'replacement'
      ? {
          confirmation: Object.freeze({
            kind: 'replacement' as const,
            entry_id: entry.entry_id,
            expected_revision: '8',
            current_version: '1.0.0',
            candidate_version: '2.0.0',
            classification: 'upgrade' as const,
            added_permission_ids: Object.freeze(['clipboard.write']),
            removed_permission_ids: Object.freeze(['future.permission']),
            retained_permissions: Object.freeze([granted]),
            added_permissions: Object.freeze([notGranted]),
            removed_permissions: Object.freeze([unsupported]),
            selected_permission_ids: Object.freeze([]),
            publisher_unverified: true as const,
          }),
        }
      : {}),
    ...(state === 'revoke'
      ? {
          permission_confirmation: Object.freeze({
            context: 'settings' as const,
            action: 'revoke' as const,
            permission: granted,
          }),
        }
      : {}),
    ...(state === 'partial-grant'
      ? {
          feedback: Object.freeze({
            kind: 'error' as const,
            code: 'install_permissions_partial' as const,
            plugin_id: entry.plugin_id,
            version: entry.version,
          }),
        }
      : {}),
    ...(state === 'conflict' ? { feedback: Object.freeze({ kind: 'error' as const, code: 'conflict' as const }) } : {}),
  });
};

const view: PluginManagementViewModel =
  state === 'empty'
    ? Object.freeze({
        state: 'empty',
        revision: '1',
        entries: Object.freeze([]),
        detail: Object.freeze({ kind: 'none' }),
        operations: Object.freeze({ ...operations, enable: false, disable: false, replace: false, uninstall: false }),
      })
    : state === 'quarantined'
      ? Object.freeze({
          state: 'ready',
          revision: '7',
          entries: Object.freeze([
            Object.freeze({
              kind: 'quarantined' as const,
              entry_id: 'entry_0000000000000202',
              plugin_id: 'com.acme.quarantined',
              diagnostic: Object.freeze({
                code: 'corrupt_record',
                phase: 'recover',
                message: 'Plugin record is invalid.',
              }),
            }),
          ]),
          selected_entry_id: 'entry_0000000000000202',
          detail: Object.freeze({
            kind: 'quarantined',
            entry_id: 'entry_0000000000000202',
            plugin_id: 'com.acme.quarantined',
            diagnostic: Object.freeze({
              code: 'corrupt_record',
              phase: 'recover',
              message: 'Plugin record is invalid.',
            }),
          }),
          operations: Object.freeze({
            ...operations,
            enable: false,
            disable: false,
            replace: false,
            clear_data: false,
          }),
        })
      : state === 'degraded'
        ? Object.freeze({
            state: 'degraded',
            revision: '9',
            entries: Object.freeze([]),
            detail: Object.freeze({ kind: 'none' }),
            operations: Object.freeze({
              ...operations,
              install: false,
              enable: false,
              disable: false,
              replace: false,
              uninstall: false,
              clear_data: false,
            }),
            diagnostic: Object.freeze({ code: 'unavailable', phase: 'initialize', message: 'Unavailable.' }),
          })
        : healthyView();

const service: PluginManagementService = Object.freeze({
  current: () => view,
  subscribe: () => () => undefined,
  initialize: async () => undefined,
  refresh: async () => undefined,
  select: async () => undefined,
  prepareInstallation: async () => undefined,
  commitInstallation: async () => undefined,
  cancelInstallation: async () => undefined,
  setEnabled: async () => undefined,
  prepareReplacement: async () => undefined,
  commitReplacement: async () => undefined,
  cancelReplacement: async () => undefined,
  openPermissionConfirmation: () => undefined,
  confirmPermissionDecision: async () => undefined,
  cancelPermissionDecision: () => undefined,
  deferPreparedPermissions: () => undefined,
  uninstall: async () => undefined,
  clearData: async () => undefined,
  setDevelopmentMode: async () => undefined,
  registerDevelopmentDirectory: async () => undefined,
  reloadDevelopmentEntry: async () => undefined,
  removeDevelopmentEntry: async () => undefined,
  destroy: async () => undefined,
});

const VisualFixture = () => {
  useEffect(() => {
    if (state === 'uninstall' || state === 'clear' || state === 'development-reload' || state === 'development-remove')
      document
        .querySelector<HTMLButtonElement>(
          state.startsWith('development-')
            ? `#plugin-${state}`
            : `[data-plugin-management-action="${state === 'clear' ? 'clear-data' : 'uninstall'}"]`,
        )
        ?.click();
    requestAnimationFrame(() => {
      const surface = document.querySelector<HTMLElement>('.plugin-management-surface');
      const selected = document.querySelector<HTMLElement>('.plugin-management-entry[aria-current="true"]');
      if (!surface) return;
      const surfaceStyle = getComputedStyle(surface);
      document.body.dataset.visualCheck = 'passed';
      document.body.dataset.surfaceDisplay = surfaceStyle.display;
      document.body.dataset.surfaceBorder = surfaceStyle.borderTopStyle;
      document.body.dataset.selectedBackground = selected ? getComputedStyle(selected).backgroundColor : 'none';
      document.body.dataset.state = state;
    });
  }, []);
  return (
    <main className="plugin-management-visual-shell">
      <PluginManagementSettings service={service} />
    </main>
  );
};

createRoot(document.getElementById('root') as HTMLElement).render(
  <AppProviders initialLocale={locale} initialThemeMode={theme}>
    <VisualFixture />
  </AppProviders>,
);
