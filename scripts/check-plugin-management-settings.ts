import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Management Settings drift: ${message}`);
};

const component = read('src/app/pages/PluginManagementSettings.tsx');
const facade = read('src/app/plugins/management/service.ts');
const production = read('src/app/plugins/lifecycle/production.ts');
const bootstrap = read('src/app/AppBootstrap.tsx');
const rust = read('src-tauri/src/plugin_data_management.rs');
const storage = read('src-tauri/src/plugin_scoped_storage.rs');
const styles = read('src/styles/global.less');
const roadmap = read('plugin-roadmap.md');

for (const marker of [
  'useSyncExternalStore',
  'plugin-management-surface',
  'data-plugin-management-action="clear-data"',
  'data-plugin-management-action="uninstall"',
  'settings.plugins.trust.description',
  'aria-live',
]) {
  if (!component.includes(marker)) fail(`management component is missing ${marker}`);
}
if (component.includes('@tauri-apps/') || component.includes('invoke(')) {
  fail('React management component crosses the private desktop boundary');
}
for (const marker of [
  'expected_revision',
  'prepareReplacement',
  'commitReplacement',
  'cancelReplacement',
  'prepareInstallation',
  'commitInstallation',
  'selectionTarget',
  'cleanup_pending',
]) {
  if (!facade.includes(marker)) fail(`management facade is missing ${marker}`);
}
for (const marker of [
  'createPluginManagementService',
  'createPluginDataManagementService',
  'createPluginReplacementService',
]) {
  if (!production.includes(marker)) fail(`production composition is missing ${marker}`);
}
if (!production.includes('await managementService.destroy()')) {
  fail('production composition teardown does not destroy the management service');
}
for (const marker of ['useProductionPluginLifecycleComposition', 'void next.initialize()', 'void next.destroy()']) {
  if (!bootstrap.includes(marker)) fail(`StrictMode-safe composition ownership is missing ${marker}`);
}
if (!production.includes('await surfaceProjectionService.destroy()')) {
  fail('production composition teardown does not destroy the Registration projection');
}
if (component.includes('service.initialize()')) {
  fail('the management component must not initialize an injected root service');
}

for (const marker of ['clear_plugin_data_inner', 'PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION', 'acquire_data_boundary']) {
  if (!rust.includes(marker) && !storage.includes(marker)) fail(`Rust data clear is missing ${marker}`);
}
for (const marker of [
  '.launcher-surface[data-page-layout="settings-split"]',
  '.settings-navigation',
  'width: 152px',
  '.settings-content',
  '.settings-preference-select.semi-select',
  'flex: 0 0 168px',
  '.plugin-management-surface',
  "[aria-current='true']",
  "[aria-current='page']",
  'var(--semi-color-border)',
  'var(--semi-color-focus-border)',
  'overflow: auto',
  'overflow-y: auto',
]) {
  if (!styles.includes(marker)) fail(`management styles are missing ${marker}`);
}
const settingsNavigationMenuRules = styles.match(
  /\.settings-navigation-menu\.semi-navigation\s*\{(?<rules>[\s\S]*?)^\}/mu,
)?.groups?.rules;
if (!settingsNavigationMenuRules) {
  fail('settings navigation menu styles are missing');
}
for (const marker of ['width: 100%', 'min-width: 0', 'border-right: 0']) {
  if (!settingsNavigationMenuRules.includes(marker)) {
    fail(`settings navigation menu does not override the Semi Nav default with ${marker}`);
  }
}
if (!roadmap.includes('- [x] **Task 6.1：新增插件管理设置页面**')) {
  fail('Roadmap Task 6.1 completion drifted');
}

for (const [path, marker] of [
  ['docs/en/architecture/extension-platform.md', '## Shipped Host-Private Plugin Management Settings'],
  ['docs/zh/architecture/extension-platform.md', '## 已交付的 Host 私有插件管理设置'],
  ['docs/en/development/frontend-guidelines.md', '### Plugin Management Surface'],
  ['docs/zh/development/frontend-guidelines.md', '### 插件管理表面'],
  ['docs/en/development/validation.md', '## Plugin Management Settings Validation'],
  ['docs/zh/development/validation.md', '## Plugin Management Settings 验证'],
] as const) {
  if (!read(path).includes(marker)) fail(`${path} is missing ${marker}`);
}

for (const publicFile of [
  'packages/plugin-contract/src/index.ts',
  'packages/plugin-sdk/src/index.ts',
  'packages/plugin-testkit/src/index.ts',
  'packages/plugin-ui/src/index.ts',
]) {
  const source = read(publicFile);
  for (const forbidden of ['PluginManagementService', 'PluginDataManagement', 'clear_plugin_data']) {
    if (source.includes(forbidden)) fail(`${publicFile} exposes ${forbidden}`);
  }
}

console.log('Checked management facade, private boundaries, App composition, semantic UI states, and docs.');
