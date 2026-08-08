import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const evidenceRoot = join(root, 'fixtures/plugin-iframe-runtime/evidence/macos');
const fixtures = ['normal', 'malicious', 'replacement'] as const;
const expectedKeys = [
  'evidence_version',
  'os',
  'os_version',
  'engine',
  'engine_version',
  'tauri_revision',
  'wry_revision',
  'fixture',
  'bundle_shape',
  'resource_service_path_verified',
  'plugin_csp_native_get_head_verified',
  'plugin_csp_translated_get_head_verified',
  'csp_checks',
  'sandbox',
  'permissions_policy',
  'referrer_policy',
  'origin_non_opaque',
  'origin_serialization_verified',
  'storage_initially_absent',
  'storage_roundtrip',
  'host_storage_unchanged',
  'parent_dom_denied',
  'frame_element_absent',
  'host_storage_denied',
  'route_fragment_loaded',
  'css_loaded',
  'image_loaded',
  'classic_script_loaded',
  'es_module_loaded',
  'module_graph_loaded',
  'tauri_bootstrap_absent',
  'privileged_handler_hits',
  'navigation_callback_hits',
  'popup_callback_hits',
  'download_callback_hits',
  'resource_paths',
  'malicious_attempts_rejected',
] as const;
const requiredTrue = [
  'resource_service_path_verified',
  'plugin_csp_native_get_head_verified',
  'plugin_csp_translated_get_head_verified',
  'origin_non_opaque',
  'origin_serialization_verified',
  'storage_initially_absent',
  'storage_roundtrip',
  'host_storage_unchanged',
  'parent_dom_denied',
  'frame_element_absent',
  'host_storage_denied',
  'route_fragment_loaded',
  'tauri_bootstrap_absent',
  'malicious_attempts_rejected',
] as const;
const forbiddenValue =
  /(?:lensx-plugin:\/\/|runtime\.localhost|matrix-|\/Users\/|\/private\/|entry_[0-9a-f]|[0-9a-f]{32})/u;

const fail = (message: string): never => {
  throw new Error(`Invalid isolated-origin evidence: ${message}`);
};

for (const fixture of fixtures) {
  const raw = readFileSync(join(evidenceRoot, `${fixture}.json`), 'utf8');
  if (forbiddenValue.test(raw)) fail(`${fixture} contains a raw URL, token, identity, or local path`);
  const value = JSON.parse(raw) as Record<string, unknown>;
  const fixtureKeys = expectedKeys.flatMap((key) => (key === 'csp_checks' ? [key, 'unsupported_evidence'] : [key]));
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(fixtureKeys)) fail(`${fixture} field set drifted`);
  if (
    value.evidence_version !== '0.1.0' ||
    value.os !== 'macos' ||
    typeof value.os_version !== 'string' ||
    !/^[0-9]+(?:\.[0-9]+)+$/u.test(value.os_version) ||
    value.engine !== 'wkwebview' ||
    typeof value.engine_version !== 'string' ||
    !/^[0-9]+(?:\.[0-9]+)+$/u.test(value.engine_version) ||
    value.tauri_revision !== '2.11.5' ||
    value.wry_revision !== '0.55.1' ||
    value.fixture !== fixture ||
    value.bundle_shape !== 'canonical_lxp_plugin_resource_service' ||
    value.sandbox !== 'allow-scripts allow-same-origin' ||
    value.referrer_policy !== 'no-referrer'
  ) {
    fail(`${fixture} platform or policy facts drifted`);
  }
  for (const key of requiredTrue) {
    if (value[key] !== true) fail(`${fixture}.${key} did not pass`);
  }
  const expectedCspChecks =
    fixture === 'malicious'
      ? ['base_blocked', 'eval_blocked', 'form_blocked', 'inline_script_blocked', 'object_blocked']
      : [
          'active_worker_started',
          'author_csp_can_narrow',
          'blob_content_allowed',
          'blob_worker_allowed',
          'classic_script_allowed',
          'data_content_allowed',
          'data_worker_allowed',
          'es_module_allowed',
          'fetch_allowed',
          'fetch_connection_churn',
          'image_allowed',
          'indexeddb_roundtrip',
          'package_worker_allowed',
          'remote_module_allowed',
          'style_allowed',
          'wasm_allowed',
          'websocket_constructed',
          'worker_message_burst',
          'worker_message_roundtrip',
        ];
  const cspChecks = value.csp_checks;
  if (
    typeof cspChecks !== 'object' ||
    cspChecks === null ||
    Array.isArray(cspChecks) ||
    JSON.stringify(Object.keys(cspChecks)) !== JSON.stringify(expectedCspChecks) ||
    expectedCspChecks.some((key) => (cspChecks as Record<string, unknown>)[key] !== true)
  ) {
    fail(`${fixture} CSP matrix drifted`);
  }
  if (
    value.privileged_handler_hits !== 0 ||
    typeof value.navigation_callback_hits !== 'number' ||
    value.navigation_callback_hits < 2 ||
    value.popup_callback_hits !== 0 ||
    value.download_callback_hits !== 0
  ) {
    fail(`${fixture} callback counts drifted`);
  }
  const resources = value.resource_paths;
  if (!Array.isArray(resources) || resources.some((item) => typeof item !== 'string')) {
    fail(`${fixture} resource path summary is invalid`);
  }
  if (fixture !== 'malicious') {
    const unsupported = value.unsupported_evidence as Record<string, unknown> | undefined;
    if (
      unsupported?.service_worker !== 'not_available_for_scoped_custom-scheme-runtime' ||
      !['unsupported_by_target_webview', 'not_in_runtime_baseline'].includes(String(unsupported?.shared_worker))
    ) {
      fail(`${fixture} unsupported browser evidence drifted`);
    }
    for (const key of [
      'css_loaded',
      'image_loaded',
      'classic_script_loaded',
      'es_module_loaded',
      'module_graph_loaded',
    ]) {
      if (value[key] !== true) fail(`${fixture}.${key} did not pass`);
    }
    for (const path of ['dist/index.html', 'dist/module.js', 'dist/module-dependency.js']) {
      if (!resources.includes(path)) fail(`${fixture} did not request ${path}`);
    }
  } else if (JSON.stringify(value.unsupported_evidence) !== '{}') {
    fail('malicious fixture must not claim unsupported open-Web evidence');
  }
}

console.log(`Checked ${fixtures.length} bounded macOS isolated-origin evidence records.`);
