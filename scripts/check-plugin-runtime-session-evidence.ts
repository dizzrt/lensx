import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const evidenceRoot = join(root, 'fixtures/plugin-runtime-session/evidence/macos');
const fixtures = ['normal', 'malicious', 'replacement'] as const;
const sessionBooleanKeys = [
  'exact_target_window',
  'exact_target_origin',
  'message_port_transferred',
  'nonce_single_use',
  'ready_observed',
  'disconnect_observed',
  'dispose_observed',
  'retry_old_port_invalid',
  'replacement_old_port_invalid',
  'unrelated_registration_stable',
  'window_forgery_ignored',
  'transport_roundtrip',
  'transport_result_error_event',
  'transport_out_of_order',
  'transport_cancel_observed',
  'transport_pending_terminated',
  'transport_cleanup_zero_handler_hits',
] as const;
const forbiddenValue =
  /(?:lensx-plugin:\/\/|runtime\.localhost|\/Users\/|\/private\/|entry_[0-9a-f]|[0-9a-f]{32}|lensx\.plugin_runtime\.(?:bootstrap|ready))/u;

const fail = (message: string): never => {
  throw new Error(`Invalid Plugin Runtime Session evidence: ${message}`);
};

for (const fixture of fixtures) {
  const raw = readFileSync(join(evidenceRoot, `${fixture}.json`), 'utf8');
  if (forbiddenValue.test(raw)) fail(`${fixture} contains a private URL, token, identity, wire value, or path`);
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (
    value.evidence_version !== '0.1.0' ||
    value.session_contract_version !== '0.1.0' ||
    value.transport_contract_version !== '0.1.0' ||
    value.os !== 'macos' ||
    value.engine !== 'wkwebview' ||
    value.fixture !== fixture ||
    value.bundle_shape !== 'canonical_lxp_plugin_resource_service' ||
    value.resource_service_path_verified !== true ||
    value.plugin_csp_native_get_head_verified !== true ||
    value.plugin_csp_translated_get_head_verified !== true ||
    value.privileged_handler_hits !== 0
  ) {
    fail(`${fixture} platform, package, contract, or privilege facts drifted`);
  }
  for (const key of sessionBooleanKeys) {
    if (value[key] !== true) fail(`${fixture}.${key} did not pass`);
  }
  const cspChecks = value.csp_checks;
  if (
    typeof cspChecks !== 'object' ||
    cspChecks === null ||
    Array.isArray(cspChecks) ||
    Object.values(cspChecks).some((result) => result !== true)
  ) {
    fail(`${fixture} CSP checks are invalid`);
  }
  if (!Array.isArray(value.resource_paths) || value.resource_paths.some((item) => typeof item !== 'string')) {
    fail(`${fixture} resource summary is invalid`);
  }
}

console.log(`Checked ${fixtures.length} bounded macOS Plugin Runtime Session evidence records.`);
