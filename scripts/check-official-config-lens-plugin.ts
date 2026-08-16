import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildOfficialPluginCandidate, verifyCandidateDirectory } from './official-plugin-release/candidate.ts';
import { validateOfficialPluginContract } from './official-plugin-release/contract.ts';

const root = join(import.meta.dirname, '..');
const run = (
  command: string,
  arguments_: readonly string[],
  environment?: Readonly<Record<string, string>>,
): string => {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: environment === undefined ? process.env : { ...process.env, ...environment },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  }
  if (result.stdout.trim() !== '') console.log(result.stdout.trim());
  return result.stdout.trim();
};

const writeJson = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const contract = validateOfficialPluginContract(root);
if (contract.diagnostics.length > 0) {
  throw new Error(`ConfigLens official contract failed: ${JSON.stringify(contract.diagnostics)}`);
}
const member = contract.members.find(({ slug }) => slug === 'config-lens');
if (member === undefined || contract.members.length !== 1) {
  throw new Error('ConfigLens must be the single current real official plugin member.');
}

run('pnpm', ['--dir', member.rootDir, 'run', 'visual']);
run('pnpm', ['--dir', member.rootDir, 'exec', 'rsbuild', 'build', '-c', 'wkwebview/rsbuild.config.ts']);
run('node', ['--experimental-strip-types', 'scripts/check-official-config-lens-wkwebview-evidence.ts']);
run('pnpm', ['run', 'check:official-config-lens-cold-open']);
run('cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'config_lens_wkwebview_harness']);
run('pnpm', ['--dir', 'packages/plugin-cli', 'run', 'build']);
run('node', ['--experimental-strip-types', 'scripts/official-plugin-release.ts', 'docs']);

const temporary = mkdtempSync(join(tmpdir(), 'lensx-config-lens-candidate-'));
const outputDir = join(temporary, 'candidate');
try {
  const candidate = buildOfficialPluginCandidate({
    member,
    outputDir,
    repository: 'https://github.com/lensx-dev/lensx',
    rootDir: root,
    sourceCommit: 'a'.repeat(40),
    sourceRef: 'refs/heads/main',
    workflowRunUrl: 'https://github.com/lensx-dev/lensx/actions/runs/1',
  });
  const verified = verifyCandidateDirectory(outputDir);
  if (
    candidate.plugin_id !== 'dev.lensx.config-lens' ||
    candidate.version !== '0.1.0' ||
    candidate.artifact.size > 8 * 1024 * 1024 ||
    JSON.stringify(candidate) !== JSON.stringify(verified)
  ) {
    throw new Error('ConfigLens candidate identity or digest-fixed handoff drifted.');
  }
  const replacementRoot = join(temporary, 'replacement-project');
  mkdirSync(replacementRoot, { recursive: true });
  cpSync(join(member.rootDir, 'dist'), join(replacementRoot, 'dist'), { recursive: true });
  copyFileSync(join(member.rootDir, 'manifest.json'), join(replacementRoot, 'manifest.json'));
  copyFileSync(join(member.rootDir, 'package.json'), join(replacementRoot, 'package.json'));
  for (const path of [
    join(replacementRoot, 'manifest.json'),
    join(replacementRoot, 'dist', 'manifest.json'),
    join(replacementRoot, 'package.json'),
  ]) {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    value.version = '0.1.1';
    writeJson(path, value);
  }
  const replacementPath = join(temporary, 'dev.lensx.config-lens-0.1.1.lxp');
  const cli = join(root, 'packages/plugin-cli/dist/src/bin.js');
  run('node', [cli, 'pack', '--project', replacementRoot, '--output', replacementPath, '--no-build', '--json']);
  run('node', [cli, 'inspect', replacementPath, '--json']);
  run('cargo', [
    'run',
    '--quiet',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--example',
    'official_plugin_candidate_inspector',
    '--',
    replacementPath,
  ]);
  const candidatePath = join(outputDir, candidate.artifact.name);
  const replacementBytes = readFileSync(replacementPath);
  const replacementDigest = createHash('sha256').update(replacementBytes).digest('hex');
  if (replacementBytes.length > 8 * 1024 * 1024 || replacementDigest === candidate.artifact.sha256) {
    throw new Error('ConfigLens replacement package budget or independent-byte proof failed.');
  }
  run('pnpm', ['exec', 'rstest', 'run', 'tests/official-plugin-runtime-e2e.test.tsx'], {
    LENSX_OFFICIAL_CANDIDATE_DIGEST: candidate.artifact.sha256,
    LENSX_OFFICIAL_CANDIDATE_PATH: candidatePath,
    LENSX_OFFICIAL_CANDIDATE_PLUGIN_ID: candidate.plugin_id,
    LENSX_OFFICIAL_CANDIDATE_VERSION: candidate.version,
    LENSX_OFFICIAL_REPLACEMENT_DIGEST: replacementDigest,
    LENSX_OFFICIAL_REPLACEMENT_PATH: replacementPath,
    LENSX_OFFICIAL_REPLACEMENT_VERSION: '0.1.1',
  });
} finally {
  rmSync(temporary, { force: true, recursive: true });
}

console.log('ConfigLens official package, visual, WKWebView, candidate, installation, and Runtime gate passed.');
