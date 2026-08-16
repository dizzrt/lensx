import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildOfficialPluginCandidate, verifyCandidateDirectory } from './candidate.ts';
import { validateOfficialPluginContract } from './contract.ts';
import { createOfficialPluginReleasePlan } from './planner.ts';
import { versionOfficialPlugins } from './version.ts';

const run = (command: string, arguments_: readonly string[], cwd: string): void => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `[official-release/dry-run-command-failed] ${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`,
    );
  }
};

const writeJson = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const copyPublicPackages = (toolingRoot: string, fixtureRoot: string): void => {
  for (const name of ['plugin-contract', 'plugin-sdk', 'plugin-testkit']) {
    cpSync(join(toolingRoot, 'packages', name), join(fixtureRoot, 'packages', name), {
      recursive: true,
      filter: (path) => !['dist', 'node_modules'].includes(path.split('/').at(-1) ?? ''),
    });
  }
};

const copyPlugin = (toolingRoot: string, fixtureRoot: string, slug: string): void => {
  const source = join(toolingRoot, 'examples', 'plugins', 'framework-neutral');
  const target = join(fixtureRoot, 'plugins', 'official', slug);
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !['artifacts', 'dist', 'node_modules'].includes(path.split('/').at(-1) ?? ''),
  });
  const metadata = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as Record<string, unknown>;
  metadata.name = `@fixture/official-${slug}`;
  metadata.version = '1.0.0';
  metadata.packageManager = 'pnpm@11.17.0';
  metadata.engines = { node: '>=24 <25', pnpm: '>=11 <12' };
  metadata.dependencies = { '@lensx/plugin-sdk': '^0.3.0' };
  metadata.devDependencies = {
    ...(metadata.devDependencies as Record<string, string>),
    '@lensx/plugin-contract': '^0.2.0',
    '@lensx/plugin-testkit': '^0.2.0',
  };
  (metadata.scripts as Record<string, string>)['test:e2e'] = 'rstest run tests/runtime.test.ts';
  writeJson(join(target, 'package.json'), metadata);
  const manifest = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  manifest.plugin_id = `dev.lensx.fixture.${slug}`;
  manifest.version = '1.0.0';
  writeJson(join(target, 'manifest.json'), manifest);
  const manifestTestPath = join(target, 'tests', 'manifest.test.ts');
  writeFileSync(
    manifestTestPath,
    readFileSync(manifestTestPath, 'utf8').replace('dev.lensx.template.framework-neutral', `dev.lensx.fixture.${slug}`),
  );
  writeFileSync(join(target, 'CHANGELOG.md'), '# Changelog\n');
};

export interface OfficialPluginDryRunEvidence {
  readonly artifact: string;
  readonly beta_version: string;
  readonly candidate_sha256: string;
  readonly release_slugs: readonly string[];
  readonly root_version: string;
  readonly runtime_protocol: 'webview';
  readonly selected_slugs: readonly string[];
  readonly versioned_alpha: string;
  readonly zero_residual_teardown: true;
}

export const runOfficialPluginReleaseDryRun = (rootDir: string): OfficialPluginDryRunEvidence => {
  const toolingRoot = resolve(rootDir);
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'lensx-official-release-dry-run-'));
  try {
    mkdirSync(join(fixtureRoot, '.changeset'), { recursive: true });
    mkdirSync(join(fixtureRoot, '.github'), { recursive: true });
    mkdirSync(join(fixtureRoot, 'packages'), { recursive: true });
    mkdirSync(join(fixtureRoot, 'plugins', 'official'), { recursive: true });
    writeJson(join(fixtureRoot, 'package.json'), {
      name: 'official-release-dry-run-host',
      version: '0.0.0',
      private: true,
      packageManager: 'pnpm@11.17.0',
      devDependencies: { '@changesets/cli': '2.31.1' },
    });
    writeFileSync(
      join(fixtureRoot, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n  - plugins/official/*\n  - examples/plugins/*\nlinkWorkspacePackages: true\n',
    );
    writeJson(join(fixtureRoot, '.changeset', 'config.json'), {
      $schema: 'https://unpkg.com/@changesets/config@3.1.4/schema.json',
      changelog: '@changesets/cli/changelog',
      commit: false,
      fixed: [],
      linked: [],
      access: 'restricted',
      baseBranch: 'main',
      updateInternalDependencies: 'patch',
      ignore: [],
      privatePackages: { version: true, tag: false },
    });
    writeFileSync(
      join(fixtureRoot, '.github', 'CODEOWNERS'),
      '/plugins/official/alpha/ @lensx/alpha-maintainers\n/plugins/official/beta/ @lensx/beta-maintainers\n',
    );
    copyPlugin(toolingRoot, fixtureRoot, 'alpha');
    copyPlugin(toolingRoot, fixtureRoot, 'beta');
    copyPublicPackages(toolingRoot, fixtureRoot);
    run('pnpm', ['install', '--ignore-scripts'], fixtureRoot);
    for (const name of ['plugin-contract', 'plugin-sdk', 'plugin-testkit']) {
      run('pnpm', ['--dir', join(fixtureRoot, 'packages', name), 'run', 'build'], fixtureRoot);
    }

    const initial = validateOfficialPluginContract(fixtureRoot);
    if (initial.diagnostics.length > 0) {
      throw new Error(initial.diagnostics.map((item) => `[${item.code}] ${item.path}: ${item.message}`).join('\n'));
    }
    writeFileSync(
      join(fixtureRoot, '.changeset', 'alpha-release.md'),
      '---\n"@fixture/official-alpha": patch\n---\n\nExercise one independent official plugin release.\n',
    );
    const plan = createOfficialPluginReleasePlan({
      baseCommit: 'a'.repeat(40),
      changedPaths: ['plugins/official/alpha/src/main.ts', '.changeset/alpha-release.md'],
      headCommit: 'b'.repeat(40),
      members: initial.members,
      rootDir: fixtureRoot,
    });
    if (plan.release.map((entry) => entry.slug).join(',') !== 'alpha') {
      throw new Error('[official-release/dry-run-plan-invalid] Dry-run release selection was not independent.');
    }
    versionOfficialPlugins(fixtureRoot);
    const after = validateOfficialPluginContract(fixtureRoot);
    if (after.diagnostics.length > 0) {
      throw new Error(after.diagnostics.map((item) => `[${item.code}] ${item.path}: ${item.message}`).join('\n'));
    }
    const alpha = after.members.find((member) => member.slug === 'alpha');
    const beta = after.members.find((member) => member.slug === 'beta');
    if (alpha === undefined || beta === undefined || alpha.version !== '1.0.1' || beta.version !== '1.0.0') {
      throw new Error('[official-release/dry-run-version-drift] Dry-run changed the wrong release unit.');
    }
    const rootMetadata = JSON.parse(readFileSync(join(fixtureRoot, 'package.json'), 'utf8')) as { version: string };
    if (rootMetadata.version !== '0.0.0') {
      throw new Error('[official-release/dry-run-host-version-drift] Dry-run changed the desktop application version.');
    }
    run('pnpm', ['--dir', join(toolingRoot, 'packages', 'plugin-cli'), 'run', 'build'], toolingRoot);
    const candidateDir = join(fixtureRoot, 'candidate-alpha');
    const candidate = buildOfficialPluginCandidate({
      member: alpha,
      outputDir: candidateDir,
      repository: 'https://github.com/lensx-dev/lensx',
      rootDir: fixtureRoot,
      sourceCommit: 'b'.repeat(40),
      sourceRef: 'refs/heads/main',
      toolingRootDir: toolingRoot,
      workflowRunUrl: 'https://github.com/lensx-dev/lensx/actions/runs/1',
    });
    verifyCandidateDirectory(candidateDir);
    const releaseRecord = JSON.parse(readFileSync(join(candidateDir, candidate.release_record.name), 'utf8')) as {
      runtime_evidence: { protocol: 'webview'; zero_residual: true };
    };
    return {
      artifact: candidate.artifact.name,
      beta_version: beta.version,
      candidate_sha256: candidate.artifact.sha256,
      release_slugs: plan.release.map((entry) => entry.slug),
      root_version: rootMetadata.version,
      runtime_protocol: releaseRecord.runtime_evidence.protocol,
      selected_slugs: plan.validate.map((entry) => entry.slug),
      versioned_alpha: alpha.version,
      zero_residual_teardown: releaseRecord.runtime_evidence.zero_residual,
    };
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
};
