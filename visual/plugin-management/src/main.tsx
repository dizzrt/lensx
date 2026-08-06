import '@douyinfe/semi-ui/dist/css/semi.min.css';
import '../../../src/styles/global.less';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import validRegistrationCases from '../../../fixtures/plugin-registration-contract/valid/cases.json';
import { AppProviders } from '../../../src/app/AppProviders';
import { PluginManagementSettings } from '../../../src/app/pages/PluginManagementSettings';
import type { PluginManagementService, PluginManagementViewModel } from '../../../src/app/plugins/management';
import { parsePluginRegistrationDetailResponse } from '../../../src/app/plugins/registration';
import './visual.less';

const params = new URLSearchParams(window.location.search);
const locale = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const state = params.get('state') ?? 'healthy';

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
  source: 'external' as const,
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
const healthyView = (): PluginManagementViewModel =>
  Object.freeze({
    state: 'ready',
    revision: '8',
    entries: Object.freeze([entry]),
    selected_entry_id: entry.entry_id,
    detail: Object.freeze({
      kind: 'registered',
      entry_id: entry.entry_id,
      manifest,
      source: 'external',
      enabled: entry.enabled,
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
        }),
        Object.freeze({
          permission_id: 'lensx.filesystem.read_selected',
          requested: true,
          supported: false,
          granted: false,
          effective: 'unsupported',
          methods: Object.freeze([]),
        }),
      ]),
      diagnostics: Object.freeze([]),
    }),
    operations,
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
            removed_permission_ids: Object.freeze(['clipboard.read']),
          }),
        }
      : {}),
  });

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
  install: async () => undefined,
  setEnabled: async () => undefined,
  prepareReplacement: async () => undefined,
  commitReplacement: async () => undefined,
  cancelReplacement: async () => undefined,
  uninstall: async () => undefined,
  clearData: async () => undefined,
  destroy: async () => undefined,
});

const VisualFixture = () => {
  useEffect(() => {
    if (state === 'uninstall' || state === 'clear') {
      document
        .querySelector<HTMLButtonElement>(
          `[data-plugin-management-action="${state === 'clear' ? 'clear-data' : 'uninstall'}"]`,
        )
        ?.click();
    }
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
