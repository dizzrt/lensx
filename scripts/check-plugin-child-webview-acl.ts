import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const tauriBuilder = read('vendor/frame-aware-navigation/tauri/src/webview/mod.rs');
const tauriManager = read('vendor/frame-aware-navigation/tauri/src/manager/webview.rs');
const runtime = read('vendor/frame-aware-navigation/tauri-runtime/src/webview.rs');
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const presentation = read('src-tauri/src/plugin_child_webview_presentation.rs');
const harness = read('src-tauri/examples/plugin_child_webview_acl_harness.rs');
const drift = read('scripts/frame-aware-navigation-dependency-drift.ts');
const evidence = JSON.parse(read('fixtures/plugin-child-webview-acl/evidence/macos.json')) as Record<string, unknown>;

for (const marker of [
  'pub fn isolated_ipc_handler',
  'pub fn isolated_uri_scheme_protocols',
  'pending.restricted_uri_scheme_protocols',
]) {
  if (!tauriBuilder.includes(marker)) failures.push(`vendored Tauri builder is missing ${marker}.`);
}
for (const marker of [
  'let isolated_ipc = pending.ipc_handler.is_some()',
  'if !isolated_ipc && !registered_scheme_protocols.contains(&"tauri".into())',
  'if !isolated_ipc && !registered_scheme_protocols.contains(&"ipc".into())',
  'if pending.ipc_handler.is_none()',
]) {
  if (!tauriManager.includes(marker)) failures.push(`vendored Tauri manager is missing ${marker}.`);
}
if (!runtime.includes('pub restricted_uri_scheme_protocols: Option<HashSet<String>>')) {
  failures.push('vendored Tauri runtime is missing the per-WebView URI protocol allowlist.');
}
for (const path of ['tauri/src/manager/webview.rs', 'tauri/src/webview/mod.rs', 'tauri-runtime/src/webview.rs']) {
  if (!drift.includes(`'${path}'`)) failures.push(`dependency drift manifest is missing ${path}.`);
}
for (const marker of [
  '.isolated_uri_scheme_protocols([expected_url.scheme()])',
  '.isolated_ipc_handler(',
  'classify_acl_command',
  'is_bridge_ready',
]) {
  if (!adapter.includes(marker)) failures.push(`private Child WebView adapter is missing ${marker}.`);
}
for (const command of [
  'plugin:app|version',
  'plugin:lensx-acl-probe|probe',
  'lensx_acl_probe',
  'plugin:event|emit',
  'plugin:window|hide',
  'plugin:webview|set_webview_position',
]) {
  if (!harness.includes(command)) failures.push(`ACL harness is missing ${command}.`);
}

for (const source of ['official', 'external', 'development']) {
  if (!harness.includes(`source: '${source}'`.replaceAll("'", '"'))) {
    failures.push(`ACL source-parity harness is missing ${source}.`);
  }
}
for (const forbiddenAuthorityInput of ['publisher', 'repository', 'provenance', 'release_metadata']) {
  if (adapter.includes(forbiddenAuthorityInput) || presentation.includes(forbiddenAuthorityInput)) {
    failures.push(`Child WebView authority input depends on audit metadata ${forbiddenAuthorityInput}.`);
  }
}

const exactAuthority: Record<string, unknown> = {
  created: true,
  tauri_globals_absent: true,
  tauri_core_handler_hits: 0,
  tauri_plugin_handler_hits: 0,
  app_command_handler_hits: 0,
  global_event_handler_hits: 0,
  window_authority_unchanged: true,
  webview_authority_unchanged: true,
  rejected_tauri_envelopes: 6,
  lensx_bridge_ready_hits: 1,
  native_source_identity_mismatch_hits: 0,
  malformed_carriers_rejected: 3,
  destroyed: true,
};
const profiles = [
  {
    source: 'official',
    publisher: 'lensX Official',
    repository: 'https://github.com/lensx-dev/lensx',
    provenance: 'trusted-publisher-attestation',
    release_metadata: 'verified-release-sidecar',
    authority: exactAuthority,
  },
  {
    source: 'external',
    publisher: 'Community Publisher',
    repository: 'https://example.com/community/plugin',
    provenance: 'community-package',
    release_metadata: 'none',
    authority: exactAuthority,
  },
  {
    source: 'development',
    publisher: 'Local Developer',
    repository: 'https://example.com/local/plugin',
    provenance: 'local-development-directory',
    release_metadata: 'unreleased',
    authority: exactAuthority,
  },
];
const exactEvidence = { corpus_version: 'native-host-escape-v1', profiles };
if (JSON.stringify(evidence) !== JSON.stringify(exactEvidence)) {
  failures.push('committed macOS ACL evidence is missing source-independent zero-authority results.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Child WebView isolated IPC and source-independent real macOS ACL evidence passed.');
