import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Fixture = 'normal' | 'malicious';

interface EvidenceReference {
  readonly file: string;
  readonly sha256: string;
}

interface Expectations {
  readonly fixture_version: '0.3.0';
  readonly source_packages: Record<Fixture, EvidenceReference>;
  readonly production_child_webview_evidence: Record<'acl' | 'slot' | 'web_capabilities', EvidenceReference>;
}

const root = resolve(import.meta.dirname, '..');
const expectations = JSON.parse(
  readFileSync(join(root, 'fixtures/plugin-development-runtime/expectations.json'), 'utf8'),
) as Expectations;
const digest = (relative: string): string =>
  createHash('sha256')
    .update(readFileSync(join(root, relative)))
    .digest('hex');

const verifyReference = (reference: EvidenceReference, label: string): void => {
  if (digest(reference.file) !== reference.sha256) throw new Error(`${label} digest drifted.`);
};

const evidenceFor = (fixture: Fixture): Record<string, unknown> => {
  const sourcePackage = expectations.source_packages[fixture];
  verifyReference(sourcePackage, `${fixture} source package`);
  for (const [kind, reference] of Object.entries(expectations.production_child_webview_evidence)) {
    verifyReference(reference, `${kind} Child WebView evidence`);
  }
  return {
    evidence_version: expectations.fixture_version,
    evidence_kind: 'composed_automated_gate',
    platform: 'macos',
    engine: 'wkwebview',
    fixture,
    protocol: {
      manifest_version: '0.3.0',
      runtime_kind: 'webview',
      bridge_contract_version: '0.2.0',
      host_api_version: '0.2.0',
    },
    source_package: sourcePackage,
    production_child_webview_evidence: expectations.production_child_webview_evidence,
    development_checks: {
      register_source_development: true,
      production_runtime_path_shared: true,
      child_webview_registry_shared: true,
      resource_generation_binding_shared: true,
      isolated_data_store_binding_shared: true,
      top_level_navigation_policy_shared: true,
      closed_bridge_and_session_shared: true,
      rpc_and_host_api_boundary_shared: true,
      terminal_teardown_shared: true,
      committed_reload_fresh_attempt: true,
      committed_reload_old_attempt_destroyed_before_projection: true,
      rejected_staging_current_attempt_unchanged: true,
      registration_removed: true,
      ...(fixture === 'normal'
        ? { manifest_version_advanced: true }
        : {
            malicious_generic_tauri_zero_hits: true,
            malicious_navigation_escape_rejected: true,
          }),
    },
  };
};

const serialized = (fixture: Fixture): string => `${JSON.stringify(evidenceFor(fixture), null, 2)}\n`;
const arguments_ = process.argv.slice(2);
const fixtureIndex = arguments_.indexOf('--fixture');
const outputIndex = arguments_.indexOf('--output');
const selected = fixtureIndex >= 0 ? arguments_[fixtureIndex + 1] : undefined;
const output = outputIndex >= 0 ? arguments_[outputIndex + 1] : undefined;
const write = arguments_.includes('--write');

if (
  (selected === undefined) !== (output === undefined) ||
  (selected !== undefined && selected !== 'normal' && selected !== 'malicious')
) {
  throw new Error('Use --fixture normal|malicious with --output <relative path>.');
}

const verifyOrWrite = (fixture: Fixture, relative: string): void => {
  const next = serialized(fixture);
  if (write) {
    writeFileSync(join(root, relative), next);
  } else if (readFileSync(join(root, relative), 'utf8') !== next) {
    throw new Error(`${relative} drifted; refresh the bounded Development Child WebView evidence.`);
  }
};

if (selected !== undefined && output !== undefined) {
  verifyOrWrite(selected, output);
} else {
  verifyOrWrite('normal', 'fixtures/plugin-development-runtime/evidence/macos/normal.json');
  verifyOrWrite('malicious', 'fixtures/plugin-development-runtime/evidence/macos/malicious.json');
}

console.log(`Development Child WebView evidence ${write ? 'refreshed' : 'verified'}.`);
