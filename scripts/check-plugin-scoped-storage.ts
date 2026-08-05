import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Scoped Storage drift: ${message}`);
};

const rust = read('src-tauri/src/plugin_scoped_storage.rs');
const installer = read('src-tauri/src/plugin_installer.rs');
const desktop = read('src/app/plugins/storage/desktop.ts');
const parser = read('src/app/plugins/storage/parse.ts');
const dispatcher = read('src/app/plugins/runtime/host-api-dispatcher.ts');
const app = read('src/App.tsx');
const lib = read('src-tauri/src/lib.rs');
const consumer = read('examples/plugin-testkit-consumer/consumer.ts');

for (const marker of [
  'storage-v1.json',
  'MAX_VALUE_BYTES',
  'MAX_ENTRIES',
  'MAX_USAGE_BYTES',
  'MAX_JSON_DEPTH',
  'create_new(true)',
  'sync_all()',
  'fs::rename',
  'acquire_data_boundary',
  'read_storage_plugin_key',
]) {
  if (!rust.includes(marker)) fail(`Rust storage core is missing ${marker}`);
}
if (!installer.includes('pub(crate) fn acquire_data_boundary')) {
  fail('Installer does not expose the shared data commit boundary');
}
if (!lib.includes('plugin_scoped_storage::plugin_scoped_storage')) fail('Tauri command is not registered');
if (!lib.includes('setup_plugin_scoped_storage')) fail('managed storage state is not installed');
if (!desktop.includes("from '@tauri-apps/api/core'")) fail('desktop provider does not own the Tauri invoke');
if (!parser.includes('validateHostApiResult')) fail('desktop boundary does not revalidate public results');
if (!dispatcher.includes('storage.execute')) fail('Dispatcher does not route to the scoped provider');
if (!app.includes('desktopPluginScopedStorageProviderFactory')) fail('production App does not install storage');

for (const method of ['storage.delete', 'storage.get', 'storage.get_quota', 'storage.list', 'storage.set']) {
  if (!consumer.includes(`method: '${method}'`)) fail(`public consumer does not call ${method}`);
}

for (const publicFile of [
  'packages/plugin-contract/src/index.ts',
  'packages/plugin-sdk/src/index.ts',
  'packages/plugin-sdk/src/iframe.ts',
  'packages/plugin-testkit/src/index.ts',
]) {
  const source = read(publicFile);
  for (const forbidden of ['PluginScopedStorage', 'storage-v1.json', 'plugin_scoped_storage', '@tauri-apps/']) {
    if (source.includes(forbidden)) fail(`${publicFile} exposes ${forbidden}`);
  }
}

for (const [path, marker] of [
  ['docs/en/architecture/extension-platform.md', '## Shipped Plugin-Scoped Storage'],
  ['docs/zh/architecture/extension-platform.md', '## 已交付的插件 Scoped Storage'],
  ['docs/en/development/validation.md', '## Plugin Scoped Storage Validation'],
  ['docs/zh/development/validation.md', '## Plugin Scoped Storage 验证'],
  ['docs/en/development/plugin-workspace.md', 'pnpm run check:plugin-scoped-storage'],
  ['docs/zh/development/plugin-workspace.md', 'pnpm run check:plugin-scoped-storage'],
] as const) {
  if (!read(path).includes(marker)) fail(`${path} is missing ${marker}`);
}

const roadmap = read('plugin-roadmap.md');
if (!roadmap.includes('**Task 5.4：提供插件私有存储**')) fail('Roadmap Task 5.4 is missing');
if (!roadmap.includes('add-plugin-scoped-storage')) fail('Roadmap change mapping is missing');
if (!roadmap.includes('- [x] **Task 5.5：实现 Plugin Permission Management**')) {
  fail('Roadmap Task 5.5 completion drifted');
}
if (!roadmap.includes('- [ ] **Task 5.6：校验 RPC 输入、输出与资源限制**')) {
  fail('Roadmap Task 5.6 was completed before its change was archived');
}

for (const unsafe of ['eprintln!', 'println!', 'dbg!']) {
  if (rust.includes(unsafe)) fail(`storage source contains unsafe diagnostic output ${unsafe}`);
}
for (const fixed of [
  'A plugin storage namespace is unavailable.',
  'Plugin storage request failed.',
  'Plugin storage is unavailable.',
]) {
  if (!rust.includes(fixed)) fail(`bounded diagnostic is missing ${fixed}`);
}

console.log(
  'Checked storage contract, Rust durability/lifecycle wiring, production provider, public boundaries, diagnostics, and bilingual docs.',
);
