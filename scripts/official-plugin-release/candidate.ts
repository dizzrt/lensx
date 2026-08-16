import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { OfficialPluginMember } from './types.ts';
import { OFFICIAL_RELEASE_SCHEMA_VERSION } from './types.ts';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/u;

export interface ReleaseArtifactFact {
  readonly name: string;
  readonly sha256: string;
  readonly size: number;
}

export interface OfficialPluginReleaseRecord {
  readonly artifact: ReleaseArtifactFact;
  readonly plugin_id: string;
  readonly release_tag: string;
  readonly repository: string;
  readonly runtime_evidence: OfficialPluginRuntimeEvidence;
  readonly schema_version: typeof OFFICIAL_RELEASE_SCHEMA_VERSION;
  readonly source_commit: string;
  readonly source_ref: string;
  readonly version: string;
  readonly workflow_run_url: string;
}

export interface OfficialPluginRuntimeEvidence {
  readonly protocol: 'webview';
  readonly installation_committed: true;
  readonly native_loaded: true;
  readonly bridge_ready: true;
  readonly sdk_ready: true;
  readonly representative_interaction: true;
  readonly closed: true;
  readonly zero_residual: true;
}

const VERIFIED_WEBVIEW_RUNTIME_EVIDENCE: OfficialPluginRuntimeEvidence = Object.freeze({
  protocol: 'webview',
  installation_committed: true,
  native_loaded: true,
  bridge_ready: true,
  sdk_ready: true,
  representative_interaction: true,
  closed: true,
  zero_residual: true,
});

export interface OfficialPluginCandidateManifest {
  readonly artifact: ReleaseArtifactFact;
  readonly checksum: { readonly name: string; readonly sha256: string };
  readonly plugin_id: string;
  readonly release_record: { readonly name: string; readonly sha256: string };
  readonly schema_version: typeof OFFICIAL_RELEASE_SCHEMA_VERSION;
  readonly version: string;
}

export interface BuildOfficialPluginCandidateInput {
  readonly member: OfficialPluginMember;
  readonly outputDir: string;
  readonly repository: string;
  readonly rootDir: string;
  readonly sourceCommit: string;
  readonly sourceRef: string;
  readonly toolingRootDir?: string;
  readonly workflowRunUrl: string;
}

export const assertCandidateInspectionAgreement = ({
  digest,
  pluginId,
  rust,
  typescript,
  version,
}: {
  readonly digest: string;
  readonly pluginId: string;
  readonly rust: Readonly<Record<string, unknown>>;
  readonly typescript: Readonly<Record<string, unknown>>;
  readonly version: string;
}): void => {
  if (
    typescript.plugin_id !== pluginId ||
    typescript.version !== version ||
    typescript.runtime_kind !== 'webview' ||
    (typescript.package_digest as { value?: unknown } | undefined)?.value !== digest ||
    rust.plugin_id !== pluginId ||
    rust.version !== version ||
    rust.runtime_kind !== 'webview' ||
    rust.digest !== digest ||
    rust.installer_prepared !== true ||
    rust.installation_committed !== true ||
    rust.registration_count !== 1 ||
    rust.inspection_cleanup_completed !== true
  ) {
    throw new Error('[official-release/inspection-drift] TypeScript, Rust, installation, and metadata facts disagree.');
  }
};

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
};

export const canonicalJson = (value: unknown): string => `${JSON.stringify(canonicalValue(value))}\n`;

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

const isArtifact = (value: unknown): value is ReleaseArtifactFact =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  exactKeys(value as Record<string, unknown>, ['name', 'sha256', 'size']) &&
  typeof (value as ReleaseArtifactFact).name === 'string' &&
  basenameSafe((value as ReleaseArtifactFact).name) &&
  typeof (value as ReleaseArtifactFact).size === 'number' &&
  Number.isSafeInteger((value as ReleaseArtifactFact).size) &&
  (value as ReleaseArtifactFact).size > 0 &&
  SHA256.test((value as ReleaseArtifactFact).sha256);

const basenameSafe = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 240 &&
  !value.includes('/') &&
  !value.includes('\\') &&
  value !== '.' &&
  value !== '..';

const isVerifiedWebviewRuntimeEvidence = (value: unknown): value is OfficialPluginRuntimeEvidence => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  return (
    exactKeys(evidence, [
      'protocol',
      'installation_committed',
      'native_loaded',
      'bridge_ready',
      'sdk_ready',
      'representative_interaction',
      'closed',
      'zero_residual',
    ]) &&
    evidence.protocol === 'webview' &&
    evidence.installation_committed === true &&
    evidence.native_loaded === true &&
    evidence.bridge_ready === true &&
    evidence.sdk_ready === true &&
    evidence.representative_interaction === true &&
    evidence.closed === true &&
    evidence.zero_residual === true
  );
};

export const validateReleaseRecord = (value: unknown): value is OfficialPluginReleaseRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    !exactKeys(record, [
      'artifact',
      'plugin_id',
      'release_tag',
      'repository',
      'runtime_evidence',
      'schema_version',
      'source_commit',
      'source_ref',
      'version',
      'workflow_run_url',
    ]) ||
    record.schema_version !== OFFICIAL_RELEASE_SCHEMA_VERSION ||
    typeof record.plugin_id !== 'string' ||
    typeof record.version !== 'string' ||
    !isArtifact(record.artifact) ||
    typeof record.repository !== 'string' ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(record.repository) ||
    typeof record.source_commit !== 'string' ||
    !COMMIT.test(record.source_commit) ||
    typeof record.source_ref !== 'string' ||
    !SAFE_REF.test(record.source_ref) ||
    typeof record.workflow_run_url !== 'string' ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[1-9]\d*$/u.test(
      record.workflow_run_url,
    ) ||
    record.release_tag !== `official/${record.plugin_id}/v${record.version}` ||
    !isVerifiedWebviewRuntimeEvidence(record.runtime_evidence)
  ) {
    return false;
  }
  const expectedName = `${record.plugin_id}-${record.version}.lxp`;
  return (record.artifact as ReleaseArtifactFact).name === expectedName;
};

export const validateCandidateManifest = (value: unknown): value is OfficialPluginCandidateManifest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    !exactKeys(candidate, ['artifact', 'checksum', 'plugin_id', 'release_record', 'schema_version', 'version']) ||
    candidate.schema_version !== OFFICIAL_RELEASE_SCHEMA_VERSION ||
    typeof candidate.plugin_id !== 'string' ||
    typeof candidate.version !== 'string' ||
    !isArtifact(candidate.artifact)
  ) {
    return false;
  }
  const checksum = candidate.checksum;
  const releaseRecord = candidate.release_record;
  if (
    typeof checksum !== 'object' ||
    checksum === null ||
    Array.isArray(checksum) ||
    !exactKeys(checksum as Record<string, unknown>, ['name', 'sha256']) ||
    !basenameSafe((checksum as { name: string }).name) ||
    !SHA256.test((checksum as { sha256: string }).sha256) ||
    typeof releaseRecord !== 'object' ||
    releaseRecord === null ||
    Array.isArray(releaseRecord) ||
    !exactKeys(releaseRecord as Record<string, unknown>, ['name', 'sha256']) ||
    !basenameSafe((releaseRecord as { name: string }).name) ||
    !SHA256.test((releaseRecord as { sha256: string }).sha256)
  ) {
    return false;
  }
  const prefix = `${candidate.plugin_id}-${candidate.version}`;
  return (
    (candidate.artifact as ReleaseArtifactFact).name === `${prefix}.lxp` &&
    (checksum as { name: string }).name === `${prefix}.lxp.sha256` &&
    (releaseRecord as { name: string }).name === `${prefix}.release.json`
  );
};

const run = (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  environment?: Readonly<Record<string, string>>,
): string => {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: environment === undefined ? process.env : { ...process.env, ...environment },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `[official-release/command-failed] ${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
};

const parseCliResult = (output: string, expectedStatus: string): Record<string, unknown> => {
  const value = JSON.parse(output) as Record<string, unknown>;
  if (value.status !== expectedStatus || typeof value.result !== 'object' || value.result === null) {
    throw new Error('[official-release/cli-result-invalid] Public CLI returned an unexpected result.');
  }
  return value.result as Record<string, unknown>;
};

export const verifyCandidateDirectory = (directory: string): OfficialPluginCandidateManifest => {
  const candidatePath = join(directory, 'candidate.json');
  const candidateBytes = readFileSync(candidatePath);
  const candidate = JSON.parse(candidateBytes.toString('utf8')) as unknown;
  if (!validateCandidateManifest(candidate) || canonicalJson(candidate) !== candidateBytes.toString('utf8')) {
    throw new Error('[official-release/candidate-invalid] Candidate manifest is invalid or non-canonical.');
  }
  const artifactPath = join(directory, candidate.artifact.name);
  const artifactBytes = readFileSync(artifactPath);
  if (artifactBytes.length !== candidate.artifact.size || sha256(artifactBytes) !== candidate.artifact.sha256) {
    throw new Error('[official-release/candidate-artifact-drift] Candidate bytes do not match the manifest.');
  }
  const checksumBytes = readFileSync(join(directory, candidate.checksum.name));
  if (
    sha256(checksumBytes) !== candidate.checksum.sha256 ||
    checksumBytes.toString('utf8') !== `${candidate.artifact.sha256}  ${candidate.artifact.name}\n`
  ) {
    throw new Error('[official-release/checksum-invalid] Candidate checksum is invalid.');
  }
  const recordBytes = readFileSync(join(directory, candidate.release_record.name));
  const record = JSON.parse(recordBytes.toString('utf8')) as unknown;
  if (
    sha256(recordBytes) !== candidate.release_record.sha256 ||
    !validateReleaseRecord(record) ||
    canonicalJson(record) !== recordBytes.toString('utf8') ||
    record.plugin_id !== candidate.plugin_id ||
    record.version !== candidate.version ||
    JSON.stringify(record.artifact) !== JSON.stringify(candidate.artifact)
  ) {
    throw new Error('[official-release/release-record-invalid] Release record is invalid or stale.');
  }
  return candidate;
};

export const buildOfficialPluginCandidate = (
  input: BuildOfficialPluginCandidateInput,
): OfficialPluginCandidateManifest => {
  const root = resolve(input.rootDir);
  const toolingRoot = resolve(input.toolingRootDir ?? input.rootDir);
  const outputDir = resolve(input.outputDir);
  const staging = join(dirname(outputDir), `.${input.member.slug}-${process.pid}.candidate.tmp`);
  rmSync(staging, { force: true, recursive: true });
  mkdirSync(staging, { recursive: true });
  try {
    for (const lifecycle of ['build', 'typecheck', 'test', 'check', 'test:e2e']) {
      run('pnpm', ['--dir', input.member.rootDir, 'run', lifecycle], root);
    }
    const cli = join(toolingRoot, 'packages', 'plugin-cli', 'dist', 'src', 'bin.js');
    for (const command of ['build', 'validate']) {
      run('node', [cli, command, '--project', input.member.relativePath, '--json'], root);
    }
    const firstPath = join(staging, 'first.lxp');
    const secondPath = join(staging, 'second.lxp');
    const first = parseCliResult(
      run(
        'node',
        [cli, 'pack', '--project', input.member.relativePath, '--output', firstPath, '--no-build', '--json'],
        root,
      ),
      'success',
    );
    parseCliResult(
      run(
        'node',
        [cli, 'pack', '--project', input.member.relativePath, '--output', secondPath, '--no-build', '--json'],
        root,
      ),
      'success',
    );
    const firstBytes = readFileSync(firstPath);
    const secondBytes = readFileSync(secondPath);
    if (!firstBytes.equals(secondBytes)) {
      throw new Error('[official-release/non-deterministic-pack] Repeated public CLI packs produced different bytes.');
    }
    const inspect = parseCliResult(run('node', [cli, 'inspect', firstPath, '--json'], root), 'compatible');
    const digest = sha256(firstBytes);
    if (first.plugin_id !== input.member.pluginId || first.version !== input.member.version) {
      throw new Error('[official-release/pack-metadata-drift] Public CLI pack facts do not match official metadata.');
    }

    const rustOutput = run(
      'cargo',
      [
        'run',
        '--quiet',
        '--manifest-path',
        join(toolingRoot, 'src-tauri', 'Cargo.toml'),
        '--example',
        'official_plugin_candidate_inspector',
        '--',
        firstPath,
      ],
      toolingRoot,
    );
    const rust = JSON.parse(rustOutput) as Record<string, unknown>;
    assertCandidateInspectionAgreement({
      digest,
      pluginId: input.member.pluginId,
      rust,
      typescript: inspect,
      version: input.member.version,
    });

    run(
      'pnpm',
      [
        'exec',
        'rstest',
        'run',
        'tests/official-plugin-runtime-e2e.test.tsx',
        'tests/plugin-runtime-slot.test.tsx',
        'tests/plugin-lifecycle-service.test.ts',
        'tests/plugin-replacement-service.test.ts',
      ],
      toolingRoot,
      {
        LENSX_OFFICIAL_CANDIDATE_DIGEST: digest,
        LENSX_OFFICIAL_CANDIDATE_PATH: firstPath,
        LENSX_OFFICIAL_CANDIDATE_PLUGIN_ID: input.member.pluginId,
        LENSX_OFFICIAL_CANDIDATE_VERSION: input.member.version,
      },
    );

    const artifactName = `${input.member.pluginId}-${input.member.version}.lxp`;
    const checksumName = `${artifactName}.sha256`;
    const recordName = `${input.member.pluginId}-${input.member.version}.release.json`;
    const artifact: ReleaseArtifactFact = { name: artifactName, sha256: digest, size: firstBytes.length };
    const record: OfficialPluginReleaseRecord = {
      artifact,
      plugin_id: input.member.pluginId,
      release_tag: `official/${input.member.pluginId}/v${input.member.version}`,
      repository: input.repository,
      runtime_evidence: VERIFIED_WEBVIEW_RUNTIME_EVIDENCE,
      schema_version: OFFICIAL_RELEASE_SCHEMA_VERSION,
      source_commit: input.sourceCommit,
      source_ref: input.sourceRef,
      version: input.member.version,
      workflow_run_url: input.workflowRunUrl,
    };
    if (!validateReleaseRecord(record))
      throw new Error('[official-release/release-context-invalid] Release context is invalid.');
    const checksumBytes = Buffer.from(`${digest}  ${artifactName}\n`);
    const recordBytes = Buffer.from(canonicalJson(record));
    const candidate: OfficialPluginCandidateManifest = {
      artifact,
      checksum: { name: checksumName, sha256: sha256(checksumBytes) },
      plugin_id: input.member.pluginId,
      release_record: { name: recordName, sha256: sha256(recordBytes) },
      schema_version: OFFICIAL_RELEASE_SCHEMA_VERSION,
      version: input.member.version,
    };
    copyFileSync(firstPath, join(staging, artifactName));
    writeFileSync(join(staging, checksumName), checksumBytes, { mode: 0o600 });
    writeFileSync(join(staging, recordName), recordBytes, { mode: 0o600 });
    writeFileSync(join(staging, 'candidate.json'), canonicalJson(candidate), { mode: 0o600 });
    verifyCandidateDirectory(staging);
    rmSync(outputDir, { force: true, recursive: true });
    renameSync(staging, outputDir);
    return candidate;
  } catch (error) {
    rmSync(staging, { force: true, recursive: true });
    throw error;
  }
};
