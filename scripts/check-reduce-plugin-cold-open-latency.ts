import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveOpenSpecChangeRoot } from './openspec-change-path.ts';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`reduce-plugin-cold-open-latency drift: ${message}`);
};
const changeName = 'reduce-plugin-cold-open-latency';
const activeChangeRoot = `openspec/changes/${changeName}`;
const archiveRoot = 'openspec/changes/archive';
const changeCandidates = [
  ...(existsSync(join(root, activeChangeRoot)) ? [activeChangeRoot] : []),
  ...(existsSync(join(root, archiveRoot))
    ? readdirSync(join(root, archiveRoot), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${archiveRoot}/${entry.name}`)
    : []),
];
const changeRoot = resolveOpenSpecChangeRoot(changeName, changeCandidates);
if (changeRoot === undefined) fail(`missing active or archived ${changeName} artifacts`);

for (const path of [
  'src-tauri/src/config_lens_cold_open_harness.rs',
  'src-tauri/src/plugin_runtime_stage.rs',
  'src/app/plugins/runtime/stageMetrics.ts',
  'plugins/config-lens/src/mount.tsx',
  'plugins/config-lens/src/startup.css',
  'scripts/config-lens-cold-open-metrics.ts',
  'tests/plugin-runtime-stage-metrics.test.ts',
]) {
  if (!existsSync(join(root, path))) fail(`missing ${path}`);
}

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
if (!slot.includes('waitReadiness') || /setTimeout[\s\S]{0,120}readReadiness/u.test(slot)) {
  fail('product presentation no longer uses one async readiness wait');
}
const resource = read('src-tauri/src/plugin_resource_service.rs');
for (const marker of [
  'MAX_VERIFIED_CACHE_BYTES: usize = 32 * 1024 * 1024',
  'MAX_VERIFIED_CACHE_ENTRIES: usize = 256',
  'DevelopmentPayloadSeal',
  'development_payload_seal',
  'generation_change_during_read_discards_late_bytes_and_revokes_cache',
  'active_entry_revocation_clears_scope_authority_and_all_cached_generations',
  'revoke_entry_eligibility',
]) {
  if (!resource.includes(marker)) fail(`Resource cache is missing ${marker}`);
}
const bootstrap = read('plugins/config-lens/src/main.tsx');
const sdk = bootstrap.indexOf('createPluginSdk({');
const mount = bootstrap.indexOf("import('./mount.js')");
if (sdk < 0 || mount < sdk) fail('ConfigLens SDK bootstrap no longer precedes lazy UI mount');
const packageCheck = read('plugins/config-lens/scripts/check.mjs');
for (const marker of ['256 * 1024', '64 * 1024', 'chunk-modules.json']) {
  if (!packageCheck.includes(marker)) fail(`ConfigLens initial-graph gate is missing ${marker}`);
}
for (const [path, markers] of [
  ['docs/en/architecture/plugin-child-webview-runtime.md', ['250', '500', '1000', '100', '50']],
  ['docs/zh/architecture/plugin-child-webview-runtime.md', ['250', '500', '1000', '100', '50']],
  ['docs/en/development/config-lens.md', ['256 KiB', '64 KiB', '500 ms', '1000 ms']],
  ['docs/zh/development/config-lens.md', ['256 KiB', '64 KiB', '500 ms', '1000 ms']],
  ['docs/en/architecture/extension-platform.md', ['32 MiB', '256 entries', 'metadata seal']],
  ['docs/zh/architecture/extension-platform.md', ['32 MiB', '256 entries', 'metadata seal']],
] as const) {
  const source = read(path);
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${path} is missing maintained budget ${marker}`);
  }
}
for (const capability of ['plugin-child-webview-runtime', 'plugin-resource-service', 'official-config-lens-plugin']) {
  const source = read(`${changeRoot}/specs/${capability}/spec.md`);
  if (/iframe container|current iframe|retained iframe/iu.test(source)) {
    fail(`${capability} delta reintroduced an iframe container requirement`);
  }
}

console.log('Checked async readiness, verified-byte cache, ConfigLens bootstrap, real evidence, docs, and deltas.');
