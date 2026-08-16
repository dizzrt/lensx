import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const json = (path: string): Record<string, unknown> => JSON.parse(read(path)) as Record<string, unknown>;
const failures: string[] = [];
const requireText = (path: string, marker: string): void => {
  if (!read(path).includes(marker)) failures.push(`${path}: missing ${marker}`);
};
const forbidText = (path: string, marker: string): void => {
  if (read(path).includes(marker)) failures.push(`${path}: contains removed marker ${marker}`);
};

const manifestSchema = json('packages/plugin-contract/schema/manifest.schema.json');
const hostApiSchema = json('packages/plugin-contract/schema/host-api.schema.json');
if (manifestSchema.$id !== 'https://lensx.app/schemas/plugin/manifest-0.4.0.schema.json')
  failures.push('Manifest Schema id is not 0.4.0.');
if (hostApiSchema.$id !== 'https://lensx.dev/schemas/plugin-host-api-0.2.0.schema.json')
  failures.push('Host API Schema id is not 0.2.0.');

for (const path of [
  'packages/plugin-contract/schema/manifest.schema.json',
  'packages/plugin-contract/src/generated/plugin-manifest-input.ts',
  'packages/plugin-contract/src/types.ts',
  'packages/plugin-contract/src/validate.ts',
  'src-tauri/src/plugin_manifest.rs',
]) {
  forbidText(path, 'requested_permissions');
  forbidText(path, 'required_permissions');
  forbidText(path, 'PermissionRequest');
}

for (const path of [
  'packages/plugin-contract/schema/host-api.schema.json',
  'packages/plugin-contract/src/generated/plugin-host-api-input.ts',
  'packages/plugin-contract/src/host-api-types.ts',
  'packages/plugin-contract/src/host-api.ts',
  'packages/plugin-contract/src/index.ts',
  'src-tauri/src/plugin_host_api_contract.rs',
]) {
  forbidText(path, 'HostApiPermission');
  forbidText(path, 'clipboard.read');
  forbidText(path, 'clipboard.write');
  forbidText(path, 'permission_denied');
}

const publicRuntimeBoundaryFiles = [
  'packages/plugin-contract/schema/host-api.schema.json',
  'packages/plugin-contract/src/generated/plugin-host-api-input.ts',
  'packages/plugin-contract/src/host-api-types.ts',
  'packages/plugin-contract/src/host-api.ts',
  'packages/plugin-sdk/src/client.ts',
  'packages/plugin-sdk/src/context.ts',
  'packages/plugin-sdk/src/index.ts',
  'packages/plugin-sdk/src/types.ts',
  'packages/plugin-sdk/src/webview.ts',
  'packages/plugin-sdk/src/internal/transport-contract.ts',
  'packages/plugin-sdk/src/internal/webview-bridge-contract.ts',
  'packages/plugin-testkit/src/context.ts',
  'packages/plugin-testkit/src/fake-transport.ts',
  'packages/plugin-testkit/src/index.ts',
];
for (const path of publicRuntimeBoundaryFiles) {
  for (const marker of [
    'setSize',
    'setResizable',
    'getCurrentWindow',
    'nativeHandle',
    'native_handle',
    'window_position',
    'window_monitor',
    'window_constraints',
    'maximize_window',
    'fullscreen_window',
  ]) {
    forbidText(path, marker);
  }
}

requireText('packages/plugin-contract/src/constants.ts', "PLUGIN_MANIFEST_VERSION = '0.4.0'");
requireText('packages/plugin-contract/src/constants.ts', "PLUGIN_HOST_API_VERSION = '0.2.0'");
requireText('src-tauri/src/plugin_manifest.rs', 'PLUGIN_HOST_API_VERSION: &str = "0.2.0"');
requireText('packages/plugin-sdk/src/constants.ts', "PLUGIN_SDK_VERSION = '0.3.0'");
requireText('packages/plugin-sdk/src/constants.ts', '<0.3.0');
requireText('packages/plugin-sdk/src/semver.ts', "parseSemVer('0.3.0')");

for (const path of [
  'packages/plugin-contract/package.json',
  'packages/plugin-testkit/package.json',
  'packages/plugin-cli/package.json',
  'packages/plugin-ui/package.json',
]) {
  if (json(path).version !== '0.2.0') failures.push(`${path}: package version is not 0.2.0.`);
}
if (json('packages/plugin-sdk/package.json').version !== '0.3.0') {
  failures.push('packages/plugin-sdk/package.json: package version is not 0.3.0.');
}

for (const path of ['examples/plugin-contract-consumer/manifest.json']) {
  const manifest = json(path);
  const runtime = manifest.runtime as { kind?: unknown } | undefined;
  const compatibility = manifest.compatibility as
    | { host_api?: { min_version?: unknown; max_version_exclusive?: unknown } }
    | undefined;
  if (manifest.manifest_version !== '0.4.0') failures.push(`${path}: Manifest version is not 0.4.0.`);
  if (runtime?.kind !== 'webview') failures.push(`${path}: Runtime kind is not webview.`);
  if (compatibility?.host_api?.min_version !== '0.2.0' || compatibility.host_api.max_version_exclusive !== '0.3.0')
    failures.push(`${path}: Host API range is not [0.2.0, 0.3.0).`);
}

for (const path of [
  'examples/plugins/framework-neutral/manifest.json',
  'examples/plugins/react-semi/manifest.json',
  'examples/plugins/development-mode-smoke/manifests/initial.json',
  'examples/plugins/development-mode-smoke/manifests/reload.json',
  'packages/plugin-cli/templates/framework-neutral/manifest.json',
  'packages/plugin-cli/templates/react-semi/manifest.json',
]) {
  const manifest = json(path);
  const compatibility = manifest.compatibility as
    | { host_api?: { min_version?: unknown; max_version_exclusive?: unknown } }
    | undefined;
  const runtime = manifest.runtime as { kind?: unknown } | undefined;
  if (manifest.manifest_version !== '0.4.0') failures.push(`${path}: Manifest version is not 0.4.0.`);
  if (runtime?.kind !== 'webview') failures.push(`${path}: Runtime kind is not webview.`);
  if (compatibility?.host_api?.min_version !== '0.2.0' || compatibility.host_api.max_version_exclusive !== '0.3.0')
    failures.push(`${path}: Host API range is not [0.2.0, 0.3.0).`);
  const serialized = JSON.stringify(manifest);
  for (const marker of ['requested_permissions', 'required_permissions', 'granted_permission_ids'])
    if (serialized.includes(marker)) failures.push(`${path}: contains removed field ${marker}.`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('Manifest Contract 0.4.0 and Host API 0.2.0 drift checks passed.');
