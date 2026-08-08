import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const fail = (message: string): never => {
  throw new Error(`Plugin Development Runtime evidence failed: ${message}`);
};
const readJson = (relative: string): unknown => JSON.parse(readFileSync(join(root, relative), 'utf8'));
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const exactKeys = (value: Record<string, unknown>, expected: readonly string[], label: string): void => {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(keys)) fail(`${label} keys drifted`);
};

const expectations = record(
  readJson('fixtures/plugin-development-runtime/expectations.json'),
  'development fixture expectations',
);
if (expectations.fixture_version !== '0.1.0') fail('fixture version drifted');
const sourcePackages = record(expectations.source_packages, 'source packages');
for (const kind of ['normal', 'malicious'] as const) {
  const source = record(sourcePackages[kind], `${kind} source package`);
  if (typeof source.file !== 'string' || typeof source.sha256 !== 'string') fail(`${kind} source facts drifted`);
  const digest = createHash('sha256')
    .update(readFileSync(join(root, source.file)))
    .digest('hex');
  if (digest !== source.sha256) fail(`${kind} source package digest drifted`);
}
const transitions = record(expectations.development_transitions, 'development transitions');
if (
  JSON.stringify(transitions.normal) !==
    JSON.stringify(['register', 'open', 'reload', 'manifest_version_advance', 'remove']) ||
  JSON.stringify(transitions.malicious) !==
    JSON.stringify(['register', 'open', 'reload', 'malicious_policy_matrix', 'remove'])
) {
  fail('development transition matrix drifted');
}
const manifestVersionAdvance = record(expectations.manifest_version_advance, 'manifest version advance');
if (manifestVersionAdvance.plugin_id_unchanged !== true || manifestVersionAdvance.version !== '1.1.0') {
  fail('manifest version advance fixture drifted');
}

const commonChecks = [
  'fresh_runtime_handshake',
  'host_api_boundary_shared',
  'old_port_inert',
  'policy_profile_shared',
  'register_source_development',
  'registration_removed',
  'reload_old_scope_revoked',
  'reload_revision_advanced',
  'reload_scope_changed',
  'remove_scope_revoked',
] as const;
const fixtureChecks = {
  normal: [...commonChecks, 'manifest_version_advanced'],
  malicious: [...commonChecks, 'malicious_browser_attempts_rejected', 'malicious_privileged_handler_zero_hits'],
} as const;
const forbiddenEvidenceKey =
  /^(?:url|origin|nonce|token|payload|path|stack|exception|source_directory|snapshot_identity)$/iu;
const visitEvidence = (value: unknown, label: string): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visitEvidence(item, `${label}/${index}`);
    });
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenEvidenceKey.test(key)) fail(`${label} contains forbidden field ${key}`);
    visitEvidence(item, `${label}/${key}`);
  }
};

const sharedProfile = record(expectations.shared_runtime_profile, 'shared Runtime profile');
for (const kind of ['normal', 'malicious'] as const) {
  const development = record(
    readJson(`fixtures/plugin-development-runtime/evidence/macos/${kind}.json`),
    `${kind} development evidence`,
  );
  const external = record(
    readJson(`fixtures/plugin-runtime-session/evidence/macos/${kind}.json`),
    `${kind} external evidence`,
  );
  visitEvidence(development, `${kind} development evidence`);
  if (
    development.evidence_version !== '0.1.0' ||
    development.os !== 'macos' ||
    development.engine !== 'wkwebview' ||
    development.fixture !== kind
  ) {
    fail(`${kind} evidence identity drifted`);
  }
  for (const key of ['sandbox', 'permissions_policy', 'referrer_policy'] as const) {
    if (development[key] !== sharedProfile[key] || development[key] !== external[key]) {
      fail(`${kind} ${key} differs between development and external Runtime`);
    }
  }
  for (const key of [
    'plugin_csp_native_get_head_verified',
    'plugin_csp_translated_get_head_verified',
    'resource_service_path_verified',
    'tauri_bootstrap_absent',
    'session_contract_version',
    'transport_contract_version',
    'host_api_dispatcher_version',
    'worker_teardown_observed',
  ] as const) {
    if (development[key] !== external[key]) fail(`${kind} ${key} parity drifted`);
  }
  if (JSON.stringify(development.csp_checks) !== JSON.stringify(external.csp_checks)) {
    fail(`${kind} CSP matrix differs between development and external Runtime`);
  }
  const checks = record(development.development_checks, `${kind} development checks`);
  exactKeys(checks, fixtureChecks[kind], `${kind} development checks`);
  if (Object.values(checks).some((passed) => passed !== true)) fail(`${kind} contains a failed development check`);
  if (development.privileged_handler_hits !== 0) fail(`${kind} reached the privileged harness handler`);
}

const lifecycleEvidence = record(
  readJson('fixtures/plugin-runtime-security-lifecycle/evidence/macos/runtime-security-lifecycle.json'),
  'Runtime lifecycle evidence',
);
const lifecycleChecks = record(lifecycleEvidence.checks, 'Runtime lifecycle checks');
if (lifecycleChecks.source_independent_deadline_breaker_profile !== true) {
  fail('external/development deadline and breaker profile parity is not proven');
}

const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
const library = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
if (!cargo.includes('plugin-development-runtime-harness = ["plugin-development-mode"]')) {
  fail('harness-only Cargo feature drifted');
}
if (!library.includes('pub mod plugin_development_runtime_harness;')) {
  fail('harness façade composition drifted');
}

console.log('Checked canonical Plugin Development Runtime fixtures and bounded macOS WKWebView evidence.');
