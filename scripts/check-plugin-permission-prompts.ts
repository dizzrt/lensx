import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin permission prompts drift: ${message}`);
};
const installation = read('src/app/plugins/installation/types.ts');
const installer = read('src-tauri/src/plugin_installer.rs');
const prompt = read('src/app/plugins/permission/prompt.ts');
const management = read('src/app/plugins/management/service.ts');
const component = read('src/app/pages/PluginManagementSettings.tsx');
const runtime = [
  'src/app/plugins/runtime/session-service.ts',
  'src/app/plugins/runtime/transport-adapter.ts',
  'src/app/plugins/runtime/host-api-dispatcher.ts',
]
  .map(read)
  .join('\n');

for (const marker of [
  '0.2.0',
  'PREPARE_LOCAL_PLUGIN_INSTALLATION_COMMAND',
  'COMMIT_LOCAL_PLUGIN_INSTALLATION_COMMAND',
  'CANCEL_LOCAL_PLUGIN_INSTALLATION_COMMAND',
])
  if (!installation.includes(marker)) fail(`installation contract is missing ${marker}`);
for (const marker of [
  'prepare_local_plugin_installation',
  'commit_local_plugin_installation',
  'cancel_local_plugin_installation',
  'commit_prepared_installation',
  'validate_extracted_payload',
])
  if (!installer.includes(marker)) fail(`Rust preparation lifecycle is missing ${marker}`);
if (installer.includes('pub async fn install_local_plugin'))
  fail('legacy select-and-immediately-install command remains');
for (const marker of [
  'publisher_unverified',
  'host_risk_description',
  'grant_available',
  'deriveReplacementPermissionPrompt',
])
  if (!prompt.includes(marker)) fail(`prompt derivation is missing ${marker}`);
for (const marker of [
  'applyConfirmedGrants',
  'setGrant',
  'permission_confirmation',
  'install_permissions_partial',
  'permission_revoked',
])
  if (!management.includes(marker)) fail(`management orchestration is missing ${marker}`);
for (const marker of ['Checkbox', 'publisherUnverified', 'laterAndInstall', 'revokeImpact', 'aria-live'])
  if (!component.includes(marker)) fail(`permission UI is missing ${marker}`);
if (component.includes('@tauri-apps/') || component.includes('invoke('))
  fail('React permission UI crosses the private desktop boundary');
for (const forbidden of [
  'PluginPermissionPrompt',
  'LocalPluginInstallationCandidate',
  'prepare_local_plugin_installation',
  'set_plugin_permission_grant',
]) {
  for (const publicFile of [
    'packages/plugin-contract/src/index.ts',
    'packages/plugin-sdk/src/index.ts',
    'packages/plugin-ui/src/index.ts',
    'packages/plugin-testkit/src/index.ts',
  ]) {
    if (read(publicFile).includes(forbidden)) fail(`${publicFile} exposes ${forbidden}`);
  }
}
for (const forbidden of ['permission/prompt', 'PluginPermissionPrompt', 'openPermissionConfirmation', 'setGrant('])
  if (runtime.includes(forbidden)) fail(`plugin-driven Runtime gained prompt authority through ${forbidden}`);
for (const [path, marker] of [
  ['docs/en/architecture/extension-platform.md', 'Host-Private Plugin Permission Prompts'],
  ['docs/zh/architecture/extension-platform.md', 'Host 私有插件权限提示'],
  ['docs/en/development/frontend-guidelines.md', 'Host Permission Prompts'],
  ['docs/zh/development/frontend-guidelines.md', 'Host 权限提示'],
  ['docs/en/development/validation.md', 'Plugin Permission Prompts Validation'],
  ['docs/zh/development/validation.md', 'Plugin Permission Prompts 验证'],
] as const)
  if (!read(path).includes(marker)) fail(`${path} is missing ${marker}`);

console.log(
  'Checked installation 0.2.0, Host prompt authority, management orchestration, Runtime negatives, public boundaries, UI, and docs.',
);
