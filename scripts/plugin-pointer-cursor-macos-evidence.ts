import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

import pointerFixture from '../fixtures/plugin-pointer-cursor/cases.json' with { type: 'json' };
import pointerSchema from '../tools/plugin-pointer-cursor-harness/evidence.schema.json' with { type: 'json' };
import {
  type AppKitCursorOracleEvidence,
  assertPointerCursorEvidencePrivacy,
  decidePointerCursorAttribution,
  POINTER_CURSOR_CASE_IDS,
  POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS,
  POINTER_CURSOR_EVIDENCE_VERSION,
  POINTER_CURSOR_HOST_CONTROL_CASE_ID,
  POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID,
  POINTER_CURSOR_REQUIRED_CONSECUTIVE_IBEAM,
  POINTER_CURSOR_SNAPSHOT_OFFSETS_MS,
  type PointerCursorAttribution,
  type PointerCursorCaseEvidence,
  type PointerCursorCaseId,
  summarizeAppKitCursorOracle,
  summarizePointerCursorCase,
  validateAppKitCursorOracleEvidence,
  validateHostParticipationControlPair,
  validateHostParticipationControlSet,
  validatePointerCursorCaseEvidence,
} from './plugin-pointer-cursor-evidence.ts';

const root = join(import.meta.dirname, '..');
const committedPath = join(root, 'fixtures/plugin-pointer-cursor/evidence/macos.json');
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(pointerSchema);

if (
  pointerFixture.fixture_version !== POINTER_CURSOR_EVIDENCE_VERSION ||
  pointerFixture.web_establishment.maximum_event_count !== POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS ||
  pointerFixture.web_establishment.required_consecutive_ibeam !== POINTER_CURSOR_REQUIRED_CONSECUTIVE_IBEAM ||
  pointerFixture.web_establishment.points.length !== POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS ||
  pointerFixture.web_establishment.snapshot_offsets_ms.join(',') !== POINTER_CURSOR_SNAPSHOT_OFFSETS_MS.join(',')
) {
  throw new Error('pointer cursor fixture and evidence contract versions drifted');
}

interface PointerCursorEvidence {
  readonly evidence_version: typeof POINTER_CURSOR_EVIDENCE_VERSION;
  readonly attribution: PointerCursorAttribution;
  readonly oracle: readonly AppKitCursorOracleEvidence[];
  readonly cases: readonly PointerCursorCaseEvidence[];
  readonly host_participation_controls: readonly PointerCursorCaseEvidence[];
  readonly host_seeded_controls: readonly PointerCursorCaseEvidence[];
}

interface RawProductHarness {
  readonly pointer_oracle?: unknown;
  readonly pointer_cases?: unknown;
  readonly pointer_host_controls?: unknown;
  readonly pointer_host_seeded_controls?: unknown;
}

const run = (command: string, arguments_: readonly string[]): void => {
  const result = spawnSync(command, arguments_, { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`pointer cursor evidence producer failed: ${command}`);
};

const validateEvidence = (value: unknown): PointerCursorEvidence => {
  if (!validateSchema(value)) {
    const diagnostics = (validateSchema.errors ?? [])
      .map(({ instancePath, keyword }) => `${instancePath || '/'}:${keyword}`)
      .join(', ');
    throw new Error(`pointer cursor evidence schema rejected (${diagnostics})`);
  }
  const evidence = value as PointerCursorEvidence;
  if (
    evidence.oracle.some((candidate) => !validateAppKitCursorOracleEvidence(candidate)) ||
    !summarizeAppKitCursorOracle(evidence.oracle).stable
  ) {
    throw new Error('pointer cursor evidence contains an invalid or unstable AppKit oracle');
  }
  if (
    evidence.host_seeded_controls.some(
      (candidate) =>
        candidate.case_id !== POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID ||
        !validatePointerCursorCaseEvidence(candidate),
    )
  ) {
    throw new Error('pointer cursor evidence contains an invalid seeded Host participation control');
  }
  const grouped = Object.fromEntries(
    POINTER_CURSOR_CASE_IDS.map((caseId) => [
      caseId,
      evidence.cases.filter((candidate) => candidate.case_id === caseId),
    ]),
  ) as Record<PointerCursorCaseId, PointerCursorCaseEvidence[]>;
  if (evidence.cases.some((candidate) => !validatePointerCursorCaseEvidence(candidate))) {
    throw new Error('pointer cursor evidence contains an invalid bounded case');
  }
  if (
    evidence.host_participation_controls.some(
      (candidate) =>
        candidate.case_id !== POINTER_CURSOR_HOST_CONTROL_CASE_ID || !validatePointerCursorCaseEvidence(candidate),
    )
  ) {
    throw new Error('pointer cursor evidence contains an invalid Host participation control');
  }
  const expectedRegions = pointerFixture.trajectory.map(({ region }) => region);
  for (const candidate of [
    ...evidence.cases,
    ...evidence.host_participation_controls,
    ...evidence.host_seeded_controls,
  ]) {
    const actualRegions = candidate.samples.map(({ semantic_region }) => semantic_region);
    if (
      (candidate.establishment.established
        ? actualRegions.join('\n') !== expectedRegions.join('\n')
        : actualRegions.length !== 0) ||
      candidate.environment.tauri_version !== '2.11.5' ||
      candidate.environment.wry_version !== '0.55.1'
    ) {
      throw new Error(
        `${candidate.case_id}: trajectory or pinned native environment drifted: ${JSON.stringify({
          repetition: candidate.repetition,
          expected_regions: expectedRegions,
          actual_regions: actualRegions,
          tauri_version: candidate.environment.tauri_version,
          wry_version: candidate.environment.wry_version,
        })}`,
      );
    }
  }
  const summaries = Object.fromEntries(
    POINTER_CURSOR_CASE_IDS.map((caseId) => [caseId, summarizePointerCursorCase(caseId, grouped[caseId])]),
  ) as Record<PointerCursorCaseId, ReturnType<typeof summarizePointerCursorCase>>;
  const hostControl = summarizePointerCursorCase(
    POINTER_CURSOR_HOST_CONTROL_CASE_ID,
    evidence.host_participation_controls,
  );
  const hostSeededControl = summarizePointerCursorCase(
    POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID,
    evidence.host_seeded_controls,
  );
  const productionRuns = grouped['production-config-lens'];
  for (const [index, control] of evidence.host_participation_controls.entries()) {
    const normal = productionRuns[index];
    const seeded = evidence.host_seeded_controls[index];
    if (
      normal === undefined ||
      seeded === undefined ||
      !validateHostParticipationControlPair(normal, control) ||
      !validateHostParticipationControlSet(normal, control, seeded)
    ) {
      throw new Error('Host participation control did not retain the production Child identity');
    }
  }
  const attribution = decidePointerCursorAttribution(
    summarizeAppKitCursorOracle(evidence.oracle),
    summaries,
    hostControl,
    hostSeededControl,
  );
  if (attribution !== evidence.attribution) throw new Error('pointer cursor attribution does not match current cases');
  assertPointerCursorEvidencePrivacy(JSON.stringify(evidence));
  return evidence;
};

const runRequested = process.argv.includes('--run');
const writeRequested = process.argv.includes('--write');
if (writeRequested && !runRequested) throw new Error('--write requires --run');

let evidence: PointerCursorEvidence;
if (runRequested) {
  if (
    process.platform !== 'darwin' ||
    !['dedicated_session', 'operator_approved_quiescent_desktop'].includes(
      process.env.LENSX_MACOS_CURSOR_EXECUTION_MODE ?? '',
    ) ||
    process.env.LENSX_MACOS_CURSOR_OPERATOR_APPROVED !== '1'
  ) {
    throw new Error('real cursor evidence requires an approved macOS graphical execution mode');
  }
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'lensx-plugin-pointer-cursor-'));
  try {
    run('pnpm', ['--dir', 'plugins/config-lens', 'run', 'build']);
    run('pnpm', [
      '--dir',
      'plugins/config-lens',
      'exec',
      'rsbuild',
      'build',
      '--config',
      'wkwebview/rsbuild.config.ts',
    ]);
    const rawOutput = join(temporaryRoot, 'raw-product-harness.json');
    run('cargo', [
      'run',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '--example',
      'config_lens_cold_open_harness',
      '--features',
      'config-lens-cold-open-harness',
      '--',
      '--profile',
      'release_like',
      '--candidate',
      join(root, 'plugins/config-lens/dist'),
      '--root',
      join(temporaryRoot, 'product-profile'),
      '--output',
      rawOutput,
      '--samples',
      '2',
      '--cursor-repetitions',
      '2',
    ]);
    if (!existsSync(rawOutput)) {
      throw new Error('product harness stopped before emitting bounded cursor evidence');
    }
    const raw = JSON.parse(readFileSync(rawOutput, 'utf8')) as RawProductHarness;
    if (!Array.isArray(raw.pointer_oracle) || raw.pointer_oracle.length !== 2) {
      throw new Error('product harness did not emit the complete repeated D0 AppKit oracle');
    }
    if (!Array.isArray(raw.pointer_cases) || raw.pointer_cases.length !== 8) {
      throw new Error('product harness did not emit the complete repeated D1/A/B/C cursor matrix');
    }
    if (!Array.isArray(raw.pointer_host_controls) || raw.pointer_host_controls.length !== 2) {
      throw new Error('product harness did not emit the repeated Host participation control');
    }
    if (!Array.isArray(raw.pointer_host_seeded_controls) || raw.pointer_host_seeded_controls.length !== 2) {
      throw new Error('product harness did not emit the repeated seeded Host participation control');
    }
    const oracle = raw.pointer_oracle as AppKitCursorOracleEvidence[];
    const cases = raw.pointer_cases as PointerCursorCaseEvidence[];
    const hostParticipationControls = raw.pointer_host_controls as PointerCursorCaseEvidence[];
    const hostSeededControls = raw.pointer_host_seeded_controls as PointerCursorCaseEvidence[];
    const grouped = Object.fromEntries(
      POINTER_CURSOR_CASE_IDS.map((caseId) => [caseId, cases.filter((candidate) => candidate.case_id === caseId)]),
    ) as Record<PointerCursorCaseId, PointerCursorCaseEvidence[]>;
    const summaries = Object.fromEntries(
      POINTER_CURSOR_CASE_IDS.map((caseId) => [caseId, summarizePointerCursorCase(caseId, grouped[caseId])]),
    ) as Record<PointerCursorCaseId, ReturnType<typeof summarizePointerCursorCase>>;
    evidence = validateEvidence({
      evidence_version: POINTER_CURSOR_EVIDENCE_VERSION,
      attribution: decidePointerCursorAttribution(
        summarizeAppKitCursorOracle(oracle),
        summaries,
        summarizePointerCursorCase(POINTER_CURSOR_HOST_CONTROL_CASE_ID, hostParticipationControls),
        summarizePointerCursorCase(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID, hostSeededControls),
      ),
      oracle,
      cases,
      host_participation_controls: hostParticipationControls,
      host_seeded_controls: hostSeededControls,
    });
    if (writeRequested) {
      mkdirSync(join(root, 'fixtures/plugin-pointer-cursor/evidence'), { recursive: true });
      writeFileSync(committedPath, `${JSON.stringify(evidence, null, 2)}\n`);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
} else {
  if (!existsSync(committedPath)) throw new Error('committed real macOS cursor evidence is missing');
  evidence = validateEvidence(JSON.parse(readFileSync(committedPath, 'utf8')) as unknown);
}

console.log(`Checked repeated native cursor matrix; attribution=${evidence.attribution}.`);
