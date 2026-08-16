import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
const json = (relative: string): Record<string, unknown> => JSON.parse(read(relative)) as Record<string, unknown>;
const fail = (message: string): never => {
  throw new Error(`Development Child WebView evidence failed: ${message}`);
};
const object = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
};

const acl = json('fixtures/plugin-child-webview-acl/evidence/macos.json');
const aclProfiles = acl.profiles;
if (acl.corpus_version !== 'native-host-escape-v1' || !Array.isArray(aclProfiles) || aclProfiles.length !== 3) {
  fail('production ACL source-parity evidence drifted');
}
const developmentAclProfile = aclProfiles.find(
  (profile) =>
    typeof profile === 'object' && profile !== null && !Array.isArray(profile) && profile.source === 'development',
);
const developmentAcl = object(developmentAclProfile, 'development ACL profile');
const authority = object(developmentAcl.authority, 'development ACL authority');
if (
  authority.created !== true ||
  authority.destroyed !== true ||
  authority.tauri_globals_absent !== true ||
  authority.tauri_core_handler_hits !== 0 ||
  authority.tauri_plugin_handler_hits !== 0 ||
  authority.app_command_handler_hits !== 0 ||
  authority.global_event_handler_hits !== 0 ||
  authority.lensx_bridge_ready_hits !== 1
) {
  fail('production ACL evidence no longer proves closed Host authority');
}
const slot = json('fixtures/plugin-child-webview-slot/evidence/macos.json');
for (const key of [
  'created',
  'retina_bounds_scale_correct',
  'resize_converged',
  'host_overlay_visible_after_child_hidden',
  'keyboard_focus_reached_plugin_input',
  'keyboard_input_observed',
  'ime_composition_observed',
  'destroyed',
]) {
  if (slot[key] !== true) fail(`production slot evidence failed ${key}`);
}
const webCapabilities = json('fixtures/plugin-child-webview-web-capabilities/evidence/macos.json');
if (
  webCapabilities.created !== true ||
  webCapabilities.distinct_origins !== true ||
  webCapabilities.distinct_data_store_identifiers !== true ||
  webCapabilities.cross_plugin_storage_denied !== true ||
  webCapabilities.old_generation_storage_denied !== true
) {
  fail('production Web capability evidence drifted');
}
for (const generation of ['first_generation', 'second_generation']) {
  const facts = object(webCapabilities[generation], generation);
  for (const [key, value] of Object.entries(facts)) {
    if (key !== 'phase' && value !== true) fail(`${generation} failed ${key}`);
  }
}

const requiredCommonChecks = [
  'register_source_development',
  'production_runtime_path_shared',
  'child_webview_registry_shared',
  'resource_generation_binding_shared',
  'isolated_data_store_binding_shared',
  'top_level_navigation_policy_shared',
  'closed_bridge_and_session_shared',
  'rpc_and_host_api_boundary_shared',
  'terminal_teardown_shared',
  'committed_reload_fresh_attempt',
  'committed_reload_old_attempt_destroyed_before_projection',
  'rejected_staging_current_attempt_unchanged',
  'registration_removed',
] as const;
const forbiddenEvidenceKey =
  /^(?:url|origin|nonce|token|payload|path|stack|exception|source_directory|snapshot_identity)$/iu;
const visit = (value: unknown, label: string): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visit(item, `${label}/${index}`);
    });
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenEvidenceKey.test(key)) fail(`${label} contains forbidden key ${key}`);
    visit(child, `${label}/${key}`);
  }
};
for (const fixture of ['normal', 'malicious'] as const) {
  const evidence = json(`fixtures/plugin-development-runtime/evidence/macos/${fixture}.json`);
  visit(evidence, fixture);
  if (
    evidence.evidence_version !== '0.3.0' ||
    evidence.evidence_kind !== 'composed_automated_gate' ||
    evidence.platform !== 'macos' ||
    evidence.engine !== 'wkwebview' ||
    evidence.fixture !== fixture
  ) {
    fail(`${fixture} evidence identity drifted`);
  }
  const protocol = object(evidence.protocol, `${fixture} protocol`);
  if (
    protocol.manifest_version !== '0.4.0' ||
    protocol.runtime_kind !== 'webview' ||
    protocol.bridge_contract_version !== '0.2.0' ||
    protocol.host_api_version !== '0.2.0'
  ) {
    fail(`${fixture} protocol drifted`);
  }
  const checks = object(evidence.development_checks, `${fixture} checks`);
  for (const check of requiredCommonChecks) if (checks[check] !== true) fail(`${fixture} failed ${check}`);
  const fixtureChecks =
    fixture === 'normal'
      ? ['manifest_version_advanced']
      : ['malicious_generic_tauri_zero_hits', 'malicious_navigation_escape_rejected'];
  for (const check of fixtureChecks) if (checks[check] !== true) fail(`${fixture} failed ${check}`);
  if (Object.values(checks).some((value) => value !== true)) fail(`${fixture} contains a failed check`);
}

const resolver = read('src/app/plugins/runtime/resolver.ts');
if (resolver.includes('PluginSource') || resolver.includes('entry.source')) {
  fail('production Runtime resolver branches on plugin source provenance');
}
const childService = read('src-tauri/src/plugin_child_webview_service.rs');
if (childService.includes('PluginSource')) fail('native Child WebView service branches on plugin source provenance');
const resolverTests = read('tests/plugin-runtime-resolver.test.ts');
if (!resolverTests.includes('same production descriptor path for external and development registrations')) {
  fail('source-neutral production Runtime regression is missing');
}
const developmentService = read('src/app/plugins/development/service.ts');
const nativeReload = developmentService.indexOf('const result = await adapter.reload');
const oldAttemptTeardown = developmentService.indexOf(
  'await surfaceProjection.quiesceProvider(entry.plugin_id)',
  nativeReload,
);
const nextProjection = developmentService.indexOf(
  'await converge(result.revision, result.plugin_id)',
  oldAttemptTeardown,
);
if (nativeReload < 0 || oldAttemptTeardown < nativeReload || nextProjection < oldAttemptTeardown) {
  fail('committed reload does not teardown the old attempt before new projection');
}
const developmentTests = read('tests/plugin-development-service.test.ts');
for (const marker of [
  'stages reload before quiescing the old Child WebView',
  'leaves the current Child WebView untouched after failed staging',
]) {
  if (!developmentTests.includes(marker)) fail(`frontend reload regression is missing ${marker}`);
}
const nativeDevelopment = read('src-tauri/src/plugin_development.rs');
if (!nativeDevelopment.includes('rejected_legacy_reload_keeps_the_current_snapshot_and_registration')) {
  fail('native rejected-staging currentness regression is missing');
}
const smoke = read('examples/plugins/development-mode-smoke/src/main.ts');
if (!smoke.includes('@lensx/plugin-sdk/webview') || !smoke.includes('createPluginWebviewTransport')) {
  fail('Development Mode smoke does not use the public WebView transport');
}
for (const legacy of ['@lensx/plugin-sdk/iframe', 'createPluginIframeTransport', 'MessageChannel']) {
  if (smoke.includes(legacy)) fail(`Development Mode smoke retains ${legacy}`);
}

console.log('Checked source-neutral Development Mode Child WebView, reload atomicity, and bounded macOS evidence.');
