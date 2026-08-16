import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Host API Dispatcher drift: ${message}`);
};

const dispatcher = read('src/app/plugins/runtime/host-api-dispatcher.ts');
const adapter = read('src/app/plugins/runtime/transport-adapter.ts');
const childDispatcher = read('src/app/plugins/runtime/child-webview-host-dispatcher.ts');
const app = read('src/App.tsx');

for (const method of [
  'actions.open',
  'runtime.get_context',
  'storage.delete',
  'storage.get',
  'storage.get_quota',
  'storage.list',
  'storage.set',
  'ui.close',
]) {
  if (!dispatcher.includes(`'${method}'`)) fail(`closed provider table is missing ${method}`);
}
for (const forbidden of ['@lensx/plugin-sdk', '@tauri-apps/', 'invoke(', 'window.__TAURI__']) {
  if (dispatcher.includes(forbidden))
    fail(`Host-private Dispatcher contains forbidden dependency surface ${forbidden}`);
}
if (!adapter.includes('createPluginRuntimeTransportPostResponseOutcome')) {
  fail('Host adapter does not own the private post-response outcome');
}
if (!childDispatcher.includes('factory.create')) {
  fail('Child WebView Host dispatcher does not create an authority binding');
}
if (!app.includes('createPluginHostApiDispatcherFactory'))
  fail('App does not compose the production Dispatcher factory');
if (!app.includes('desktopPluginScopedStorageProviderFactory'))
  fail('App does not compose the production scoped-storage provider');
if (!app.includes('startPluginChildWebviewHostDispatcherDesktopAdapter(effectivePluginHostApiDispatcherFactory)')) {
  fail('App does not start the production Child WebView Host dispatcher');
}

const publicPackages = ['packages/plugin-contract', 'packages/plugin-sdk'];
for (const packagePath of publicPackages) {
  const metadata = JSON.parse(read(`${packagePath}/package.json`)) as {
    dependencies?: Record<string, string>;
    exports?: Record<string, unknown> | string;
  };
  const dependencies = Object.keys(metadata.dependencies ?? {});
  if (packagePath.endsWith('plugin-contract') && dependencies.length > 1) {
    fail('Contract gained an unexpected Runtime dependency');
  }
  if (
    packagePath.endsWith('plugin-sdk') &&
    (dependencies.length !== 1 || dependencies[0] !== '@lensx/plugin-contract')
  ) {
    fail('SDK Runtime dependencies are no longer Contract-only');
  }
}

const contractMetadata = JSON.parse(read('packages/plugin-contract/package.json')) as {
  exports?: Record<string, unknown>;
};
const sdkMetadata = JSON.parse(read('packages/plugin-sdk/package.json')) as { exports?: Record<string, unknown> };
if (
  Object.keys(contractMetadata.exports ?? {}).join('\0') !==
  '.\0./schema\0./manifest.schema.json\0./host-api-schema\0./host-api.schema.json'
) {
  fail('Contract public exports changed');
}
if (Object.keys(sdkMetadata.exports ?? {}).join('\0') !== '.\0./webview') fail('SDK public exports changed');

for (const publicSource of [
  read('packages/plugin-contract/src/index.ts'),
  read('packages/plugin-sdk/src/index.ts'),
  read('packages/plugin-sdk/src/webview.ts'),
]) {
  for (const privateName of [
    'PluginHostApiDispatcher',
    'PluginRuntimeTransportPostResponseOutcome',
    'AppNavigationService',
    'LauncherActionService',
    'PluginScopedStorage',
    'plugin_scoped_storage',
  ]) {
    if (publicSource.includes(privateName)) fail(`public source exposes ${privateName}`);
  }
}

const englishArchitecture = read('docs/en/architecture/extension-platform.md');
const chineseArchitecture = read('docs/zh/architecture/extension-platform.md');
const englishWorkspace = read('docs/en/development/plugin-workspace.md');
const chineseWorkspace = read('docs/zh/development/plugin-workspace.md');
const englishValidation = read('docs/en/development/validation.md');
const chineseValidation = read('docs/zh/development/validation.md');
for (const [source, marker] of [
  [englishArchitecture, '## Shipped Host-Private Plugin Host API Dispatcher'],
  [chineseArchitecture, '## 已交付的 Host 私有 Plugin Host API Dispatcher'],
  [englishWorkspace, 'pnpm run check:plugin-host-api-dispatcher'],
  [chineseWorkspace, 'pnpm run check:plugin-host-api-dispatcher'],
  [englishValidation, '## Plugin Host API Dispatcher Validation'],
  [chineseValidation, '## Plugin Host API Dispatcher 验证'],
] as const) {
  if (!source.includes(marker)) fail(`bilingual documentation is missing ${marker}`);
}
for (const obsolete of [
  'production handler remains `unavailable`',
  'production still has no executable Host API',
  'production `unavailable`',
]) {
  if (`${englishArchitecture}\n${englishWorkspace}\n${englishValidation}`.includes(obsolete)) {
    fail(`obsolete shipped-state claim remains: ${obsolete}`);
  }
}

const roadmap = read('plugin-roadmap.md');
if (!roadmap.includes('**Task 5.3：实现 Host API Dispatcher**')) fail('Roadmap Task 5.3 is missing');
if (!roadmap.includes('[implement-plugin-host-api-v1](openspec/changes/archive/')) {
  fail('Roadmap Task 5.3 archived change mapping drifted');
}
if (!roadmap.includes('- [x] **Task 5.5：实现 Plugin Permission Management**')) {
  fail('Roadmap Task 5.5 completion drifted');
}
if (!roadmap.includes('- [x] **Task 5.6：校验 RPC 输入、输出与资源限制**')) {
  fail('Roadmap Task 5.6 completion drifted');
}
read('openspec/changes/archive/2026-08-05-validate-plugin-rpc-contracts/proposal.md');

console.log('Checked Dispatcher providers, production wiring, private outcomes, public exports, and dependencies.');
