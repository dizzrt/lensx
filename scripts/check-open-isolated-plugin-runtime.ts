import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validationRegistry } from './validation/catalog.ts';
import { planGates } from './validation/runner.ts';

const root = join(import.meta.dirname, '..');
const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Open isolated Plugin Runtime gate failed: ${message}`);
};

for (const removed of [
  'src-tauri/src/plugin_permission.rs',
  'src-tauri/src/plugin_text_clipboard.rs',
  'src-tauri/examples/plugin_permission_native_smoke.rs',
  'src/app/plugins/permission',
  'tests/plugin-permission-management.test.ts',
  'tests/plugin-permission-prompts.test.ts',
]) {
  if (existsSync(join(root, removed))) fail(`removed permission authority remains at ${removed}`);
}

const productionSources = [
  'src-tauri/src/lib.rs',
  'src-tauri/src/plugin_installer.rs',
  'src-tauri/src/plugin_development.rs',
  'src-tauri/src/plugin_host_api_contract.rs',
  'src/app/plugins/lifecycle/production.ts',
  'src/app/plugins/management/service.ts',
  'src/app/plugins/runtime/host-api-dispatcher.ts',
  'src-tauri/src/plugin_child_webview_service.rs',
  'src/app/plugins/runtime/resolver.ts',
  'src/app/pages/PluginManagementSettings.tsx',
];
const forbiddenProduction = [
  'requested_permissions',
  'required_permissions',
  'granted_permission_ids',
  'clipboard.read',
  'clipboard.write',
  'PluginPermission',
  'permission_confirmation',
  'set_plugin_permission_grant',
  'plugin_text_clipboard',
];
for (const path of productionSources) {
  const source = read(path);
  for (const marker of forbiddenProduction) {
    if (source.includes(marker)) fail(`${path} retains ${marker}`);
  }
}

const packageMetadata = read('package.json');
for (const obsoleteScript of [
  'check:plugin-permission-management',
  'check:plugin-permission-management:native',
  'check:plugin-permission-prompts',
]) {
  if (packageMetadata.includes(obsoleteScript)) fail(`obsolete root script remains: ${obsoleteScript}`);
}

const focusedPlan = planGates(validationRegistry, ['open-isolated-plugin-runtime']);
for (const requiredStage of [
  'plugin-contract',
  'plugin-host-api-dispatcher',
  'plugin-registration-contract',
  'local-plugin-installation',
  'plugin-resource-service',
  'plugin-child-webview-runtime',
  'plugin-child-webview-session',
  'plugin-rpc-validation',
  'plugin-development-runtime-evidence',
]) {
  if (!focusedPlan.gateIds.includes(requiredStage)) fail(`focused gate composition omitted ${requiredStage}`);
}

const publicIndexes = [
  'packages/plugin-contract/src/index.ts',
  'packages/plugin-sdk/src/index.ts',
  'packages/plugin-testkit/src/index.ts',
  'packages/plugin-ui/src/index.ts',
];
for (const path of publicIndexes) {
  const source = read(path);
  for (const marker of ['HostApiPermission', 'PluginPermission', 'clipboard.read', 'clipboard.write']) {
    if (source.includes(marker)) fail(`${path} exposes ${marker}`);
  }
}

const runtimePolicy = read('src-tauri/src/plugin_runtime_security_policy.rs');
for (const required of [
  "script-src 'self' https: data: blob: 'wasm-unsafe-eval'",
  "connect-src 'self' https: wss:",
  "worker-src 'self' https: data: blob:",
  "object-src 'none'",
  'frame-ancestors tauri://localhost',
]) {
  if (!runtimePolicy.includes(required)) fail(`plugin response policy is missing ${required}`);
}
const hostConfig = read('src-tauri/tauri.conf.json');
if (!hostConfig.includes("default-src 'self'; script-src 'self'")) fail('Host main CSP drifted');
if (hostConfig.includes("worker-src 'self' https:")) fail('Plugin CSP leaked into the Host main document');

const fixtureGenerator = read('scripts/plugin-webview-runtime-fixtures.ts');
for (const proof of [
  'top_level_document',
  'public_webview_bridge',
  'dedicated_worker',
  'origin_storage',
  'generic_tauri_envelopes',
  'native_command_escape',
  'malformed_bridge_carrier',
]) {
  if (!fixtureGenerator.includes(proof)) fail(`canonical open-Web fixture is missing ${proof}`);
}

console.log(
  'Checked open Web policy, removed permission authority, public boundaries, and canonical Child WebView fixture coverage.',
);
