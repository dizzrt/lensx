import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import fixtureManifest from '../fixtures/frame-aware-webview-navigation/cases.json' with { type: 'json' };
import evidenceSchema from '../tools/frame-aware-webview-harness/evidence.schema.json' with { type: 'json' };

const rootDir = join(import.meta.dirname, '..');
const sourceRoot = join(rootDir, 'src-tauri/target/frame-aware-webview-harness');
const evidenceRoot = join(rootDir, 'fixtures/frame-aware-webview-navigation/evidence/macos');
const writeMode = process.argv.includes('--write');
const validateEvidence = new Ajv2020({ allErrors: true, strict: true }).compile(evidenceSchema);

type Observation = {
  case_id: string;
  event: string;
  outcome: string;
  native_frame_class: string;
  decision: string;
  precommit_outcome: string;
  host_bootstrap_available: boolean;
  descendant_bootstrap_absent: boolean;
  handler_hit_count: number;
  navigation_callback_hits: number;
  popup_callback_hits: number;
  download_callback_hits: number;
};

type Evidence = {
  evidence_version: string;
  run: {
    os: string;
    engine: string;
    tauri_revision: string;
    wry_revision: string;
    bundle_shape: string;
    lease_lifecycle_verified: boolean;
  };
  observations: Observation[];
};

const failures: string[] = [];
const expectedFiles = fixtureManifest.cases.map(({ case_id }) => `${case_id}.json`).sort();

if (writeMode) {
  mkdirSync(evidenceRoot, { recursive: true });
  for (const { case_id } of fixtureManifest.cases) {
    const source = join(sourceRoot, `macos-${case_id}.json`);
    if (!existsSync(source)) throw new Error(`Missing real WKWebView evidence for ${case_id}.`);
    const parsed = JSON.parse(readFileSync(source, 'utf8')) as unknown;
    writeFileSync(join(evidenceRoot, `${case_id}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
  }
  console.log(`Promoted ${expectedFiles.length} macOS WKWebView evidence files.`);
}

const actualFiles = existsSync(evidenceRoot)
  ? readdirSync(evidenceRoot)
      .filter((name) => name.endsWith('.json'))
      .sort()
  : [];
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  failures.push(`evidence files differ: expected ${expectedFiles.join(', ')}, received ${actualFiles.join(', ')}`);
}

for (const fixture of fixtureManifest.cases) {
  const path = join(evidenceRoot, `${fixture.case_id}.json`);
  if (!existsSync(path)) continue;
  let evidence: Evidence;
  try {
    evidence = JSON.parse(readFileSync(path, 'utf8')) as Evidence;
  } catch {
    failures.push(`${fixture.case_id}: invalid JSON`);
    continue;
  }
  if (!validateEvidence(evidence)) {
    failures.push(`${fixture.case_id}: schema rejected`);
    continue;
  }
  if (
    evidence.run.os !== 'macos' ||
    evidence.run.engine !== 'wkwebview' ||
    evidence.run.tauri_revision !== '2.11.5' ||
    evidence.run.wry_revision !== '0.55.1' ||
    evidence.run.bundle_shape !== 'native_custom_protocol' ||
    !evidence.run.lease_lifecycle_verified
  ) {
    failures.push(`${fixture.case_id}: locked run facts differ`);
  }
  if (evidence.observations.some(({ handler_hit_count }) => handler_hit_count !== 0)) {
    failures.push(`${fixture.case_id}: descendant invoke reached the Rust handler`);
  }
  if (evidence.observations.some(({ native_frame_class }) => native_frame_class === 'unknown')) {
    failures.push(`${fixture.case_id}: native frame classification is unknown`);
  }
  const host = evidence.observations.find(({ case_id }) => case_id === 'host-main-bootstrap');
  if (
    host === undefined ||
    host.native_frame_class !== 'main' ||
    host.decision !== 'allow_main_app' ||
    !host.host_bootstrap_available
  ) {
    failures.push(`${fixture.case_id}: Host main-frame bootstrap evidence is incomplete`);
  }
  const selected = evidence.observations.filter(({ case_id }) => case_id === fixture.case_id);
  const terminal = selected.at(-1);
  if (terminal === undefined) {
    failures.push(`${fixture.case_id}: selected observation is missing`);
    continue;
  }
  if (
    fixture.frame_class === 'descendant' &&
    selected.some(({ descendant_bootstrap_absent }) => !descendant_bootstrap_absent)
  ) {
    failures.push(`${fixture.case_id}: descendant bootstrap was observable`);
  }
  if (fixture.operation === 'observe_bootstrap') {
    const expectedDecision = fixture.frame_class === 'main' ? 'allow_main_app' : 'allow_active_plugin_document';
    if (terminal.decision !== expectedDecision || terminal.precommit_outcome !== 'committed') {
      failures.push(`${fixture.case_id}: expected document was not committed`);
    }
  } else if (fixture.operation === 'invoke') {
    if (terminal.event !== 'invoke_finished' || terminal.outcome !== 'unavailable') {
      failures.push(`${fixture.case_id}: descendant invoke was not unavailable`);
    }
  } else if (fixture.operation === 'download') {
    if (terminal.decision !== 'deny' || terminal.download_callback_hits < 1) {
      failures.push(`${fixture.case_id}: download deny hook was not observed`);
    }
  } else if (fixture.operation === 'popup' || fixture.operation === 'targeted_context') {
    if (terminal.decision !== 'deny' || terminal.popup_callback_hits < 1) {
      failures.push(`${fixture.case_id}: new-window deny hook was not observed`);
    }
  } else {
    const preflightBlocked = ['dangerous_file', 'dangerous_javascript', 'dangerous_blob'].includes(fixture.target_ref);
    const expectedDecision = preflightBlocked ? 'blocked_by_webview' : 'deny';
    const expectedCallbacks = preflightBlocked ? 2 : 3;
    if (
      terminal.decision !== expectedDecision ||
      terminal.precommit_outcome !== 'rejected' ||
      terminal.outcome !== 'retained' ||
      terminal.navigation_callback_hits !== expectedCallbacks
    ) {
      failures.push(`${fixture.case_id}: self-navigation rejection evidence differs`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(
    `macOS frame-aware WebView evidence matrix failed:\n${failures.map((item) => `- ${item}`).join('\n')}`,
  );
}

console.log(`Checked ${expectedFiles.length} macOS WKWebView evidence cases.`);
