import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from '@rstest/core';

import {
  assertCandidateInspectionAgreement,
  canonicalJson,
  type OfficialPluginCandidateManifest,
  type OfficialPluginReleaseRecord,
  validateCandidateManifest,
  validateReleaseRecord,
  verifyCandidateDirectory,
} from '../scripts/official-plugin-release/candidate.ts';
import { validateOfficialPluginContract } from '../scripts/official-plugin-release/contract.ts';
import { createOfficialPluginReleasePlan } from '../scripts/official-plugin-release/planner.ts';
import {
  type GitHubReleaseApi,
  publishCandidateDirectory,
  type ReleaseAsset,
  type ReleaseState,
} from '../scripts/official-plugin-release/release.ts';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

interface FixtureMutation {
  readonly codeowners?: string;
  readonly manifest?: (value: Record<string, unknown>) => void;
  readonly metadata?: (value: Record<string, unknown>) => void;
  readonly omitChangelog?: boolean;
  readonly omitTest?: boolean;
}

const writeJson = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const createContractFixture = (
  plugins: readonly string[],
  mutations: Readonly<Record<string, FixtureMutation>> = {},
): string => {
  const root = mkdtempSync(join(tmpdir(), 'lensx-official-contract-'));
  mkdirSync(join(root, '.github'), { recursive: true });
  mkdirSync(join(root, 'plugins', 'official'), { recursive: true });
  writeJson(join(root, 'package.json'), { name: 'fixture-host', private: true });
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*\n  - plugins/official/*\n  - examples/plugins/*\nlinkWorkspacePackages: true\n',
  );
  const ownerLines: string[] = [];
  for (const slug of plugins) {
    const mutation = mutations[slug] ?? {};
    const directory = join(root, 'plugins', 'official', slug);
    mkdirSync(join(directory, 'tests'), { recursive: true });
    const metadata: Record<string, unknown> = {
      name: `@fixture/${slug}`,
      version: '1.0.0',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.17.0',
      engines: { node: '>=24 <25', pnpm: '>=11 <12' },
      scripts: {
        build: 'fixture',
        typecheck: 'fixture',
        test: 'fixture',
        check: 'fixture',
        'test:e2e': 'fixture',
      },
    };
    const manifest: Record<string, unknown> = {
      manifest_version: '0.2.0',
      plugin_id: `dev.lensx.fixture.${slug}`,
      version: '1.0.0',
    };
    mutation.metadata?.(metadata);
    mutation.manifest?.(manifest);
    writeJson(join(directory, 'package.json'), metadata);
    writeJson(join(directory, 'manifest.json'), manifest);
    if (!mutation.omitChangelog) writeFileSync(join(directory, 'CHANGELOG.md'), '# Changelog\n');
    if (!mutation.omitTest)
      writeFileSync(join(directory, 'tests', 'plugin.test.ts'), "test('fixture', () => undefined);\n");
    ownerLines.push(`/plugins/official/${slug}/ @lensx/${slug}-maintainers`);
  }
  const explicit = Object.values(mutations).find((value) => value.codeowners !== undefined)?.codeowners;
  writeFileSync(join(root, '.github', 'CODEOWNERS'), explicit ?? `${ownerLines.join('\n')}\n`);
  return root;
};

const withFixture = async (root: string, body: () => void | Promise<void>): Promise<void> => {
  try {
    await body();
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};

describe('official plugin release contract', () => {
  test('discovers the real ConfigLens member with its ordinary external-consumer identity', () => {
    const root = join(import.meta.dirname, '..');
    const result = validateOfficialPluginContract(root);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.members.map(({ packageName, pluginId, slug, version }) => ({ packageName, pluginId, slug, version })),
    ).toEqual([
      {
        packageName: '@lensx/official-config-lens',
        pluginId: 'dev.lensx.config-lens',
        slug: 'config-lens',
        version: '0.1.0',
      },
    ]);
  });

  test('committed case inventory covers zero, one, two, metadata, ownership, tests, and dependency failures', () => {
    const cases = JSON.parse(
      readFileSync(join(import.meta.dirname, 'fixtures/official-plugin-release/cases.json'), 'utf8'),
    ) as {
      valid: string[];
      invalid: string[];
    };
    expect(cases.valid).toEqual(['empty', 'single', 'double']);
    expect(cases.invalid).toEqual(
      expect.arrayContaining([
        'identity-drift',
        'version-drift',
        'missing-script',
        'missing-test',
        'missing-changelog',
        'missing-owner',
        'wildcard-owner',
        'duplicate-owner',
        'unknown-owner',
        'tauri-dependency',
      ]),
    );
  });

  test.each([[[]], [['alpha']], [['alpha', 'beta']]])('accepts valid direct official members: %j', async (plugins) => {
    const root = createContractFixture(plugins);
    await withFixture(root, () => {
      const result = validateOfficialPluginContract(root);
      expect(result.diagnostics).toEqual([]);
      expect(result.members.map((member) => member.slug)).toEqual(plugins);
    });
  });

  test.each([
    [
      'package-public',
      {
        metadata: (value: Record<string, unknown>) => {
          value.private = false;
        },
      },
      'package-public',
    ],
    [
      'version-drift',
      {
        manifest: (value: Record<string, unknown>) => {
          value.version = '1.0.1';
        },
      },
      'source-version-drift',
    ],
    [
      'identity-drift',
      {
        manifest: (value: Record<string, unknown>) => {
          value.plugin_id = '';
        },
      },
      'plugin-id-invalid',
    ],
    [
      'missing-script',
      { metadata: (value: Record<string, unknown>) => delete (value.scripts as Record<string, unknown>)['test:e2e'] },
      'script-missing',
    ],
    ['missing-test', { omitTest: true }, 'test-missing'],
    ['missing-changelog', { omitChangelog: true }, 'changelog-missing'],
    ['missing-owner', { codeowners: '' }, 'codeowner-missing'],
    ['wildcard-owner', { codeowners: '/plugins/official/* @lensx/all\n' }, 'codeowner-pattern-invalid'],
    [
      'duplicate-owner',
      { codeowners: '/plugins/official/alpha/ @lensx/one\n/plugins/official/alpha/ @lensx/two\n' },
      'codeowner-conflict',
    ],
    [
      'unknown-owner',
      { codeowners: '/plugins/official/alpha/ @lensx/one\n/plugins/official/ghost/ @lensx/ghost\n' },
      'codeowner-unknown-plugin',
    ],
    [
      'tauri-dependency',
      { metadata: (value: Record<string, unknown>) => (value.dependencies = { '@tauri-apps/api': '^2' }) },
      'plugin-tauri-dependency',
    ],
  ] as const)('rejects %s with stable safe diagnostics', async (_name, mutation, expectedCode) => {
    const root = createContractFixture(['alpha'], { alpha: mutation });
    await withFixture(root, () => {
      const diagnostics = validateOfficialPluginContract(root).diagnostics;
      expect(diagnostics.some((item) => item.code === `official-release/${expectedCode}`)).toBe(true);
      const serialized = JSON.stringify(diagnostics);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain('SECRET_FIXTURE_VALUE');
    });
  });
});

describe('official plugin path and Changeset planner', () => {
  test('selects only the real ConfigLens release unit for a plugin-local path', () => {
    const root = join(import.meta.dirname, '..');
    const plan = createOfficialPluginReleasePlan({
      baseCommit: 'a'.repeat(40),
      changedPaths: ['plugins/official/config-lens/src/App.tsx'],
      headCommit: 'b'.repeat(40),
      members: validateOfficialPluginContract(root).members,
      rootDir: root,
    });
    expect(plan.validate.map(({ slug }) => slug)).toEqual(['config-lens']);
    expect(plan.release.map(({ bump, package_name, plugin_id }) => ({ bump, package_name, plugin_id }))).toEqual([
      {
        bump: 'patch',
        package_name: '@lensx/official-config-lens',
        plugin_id: 'dev.lensx.config-lens',
      },
    ]);
  });

  test('keeps plugin-local release units independent and output deterministic', async () => {
    const root = createContractFixture(['alpha', 'beta']);
    mkdirSync(join(root, '.changeset'), { recursive: true });
    writeFileSync(join(root, '.changeset', 'alpha.md'), '---\n"@fixture/alpha": patch\n---\n\nAlpha fix.\n');
    await withFixture(root, () => {
      const members = validateOfficialPluginContract(root).members;
      const input = {
        baseCommit: 'a'.repeat(40),
        changedPaths: ['plugins/official/alpha/src/main.ts', 'plugins/official/alpha/src/main.ts'],
        headCommit: 'b'.repeat(40),
        members,
        rootDir: root,
      };
      const first = createOfficialPluginReleasePlan(input);
      const second = createOfficialPluginReleasePlan({ ...input, changedPaths: [...input.changedPaths].reverse() });
      expect(first).toEqual(second);
      expect(first.validate.map((entry) => entry.slug)).toEqual(['alpha']);
      expect(first.release.map((entry) => [entry.slug, entry.bump])).toEqual([['alpha', 'patch']]);
      expect(first.changed_paths).toEqual(['plugins/official/alpha/src/main.ts']);
    });
  });

  test('folds multiple matching Changesets into the same independent release unit', async () => {
    const root = createContractFixture(['alpha', 'beta']);
    mkdirSync(join(root, '.changeset'), { recursive: true });
    writeFileSync(join(root, '.changeset', 'alpha-one.md'), '---\n"@fixture/alpha": patch\n---\n\nAlpha fix one.\n');
    writeFileSync(join(root, '.changeset', 'alpha-two.md'), '---\n"@fixture/alpha": patch\n---\n\nAlpha fix two.\n');
    await withFixture(root, () => {
      const plan = createOfficialPluginReleasePlan({
        baseCommit: 'a'.repeat(40),
        changedPaths: ['plugins/official/alpha/src/main.ts'],
        headCommit: 'b'.repeat(40),
        members: validateOfficialPluginContract(root).members,
        rootDir: root,
      });
      expect(plan.release).toEqual([
        {
          bump: 'patch',
          changesets: ['alpha-one', 'alpha-two'],
          package_name: '@fixture/alpha',
          plugin_id: 'dev.lensx.fixture.alpha',
          slug: 'alpha',
          version: '1.0.0',
        },
      ]);
      expect(plan.validate.map((entry) => entry.slug)).toEqual(['alpha']);
    });
  });

  test('shared changes validate all without inventing release intent and unrelated changes no-op', async () => {
    const root = createContractFixture(['alpha', 'beta']);
    mkdirSync(join(root, '.changeset'), { recursive: true });
    await withFixture(root, () => {
      const members = validateOfficialPluginContract(root).members;
      const shared = createOfficialPluginReleasePlan({
        baseCommit: 'a'.repeat(40),
        changedPaths: ['packages/plugin-sdk/src/index.ts'],
        headCommit: 'b'.repeat(40),
        members,
        rootDir: root,
      });
      expect(shared.validate.map((entry) => entry.slug)).toEqual(['alpha', 'beta']);
      expect(shared.release).toEqual([]);
      const unrelated = createOfficialPluginReleasePlan({
        baseCommit: 'a'.repeat(40),
        changedPaths: ['docs/en/index.md'],
        headCommit: 'b'.repeat(40),
        members,
        rootDir: root,
      });
      expect(unrelated.noop).toBe(true);
    });
  });

  test('rejects missing, unknown, empty, and conflicting Changeset intent', async () => {
    const root = createContractFixture(['alpha']);
    mkdirSync(join(root, '.changeset'), { recursive: true });
    await withFixture(root, () => {
      const members = validateOfficialPluginContract(root).members;
      expect(() =>
        createOfficialPluginReleasePlan({
          baseCommit: 'a'.repeat(40),
          changedPaths: ['plugins/official/alpha/src/main.ts'],
          headCommit: 'b'.repeat(40),
          members,
          rootDir: root,
        }),
      ).toThrow(/changeset-missing/u);
      writeFileSync(join(root, '.changeset', 'bad.md'), '---\n"@fixture/ghost": invalid\n---\n\n');
      expect(() =>
        createOfficialPluginReleasePlan({
          baseCommit: 'a'.repeat(40),
          changedPaths: ['plugins/official/alpha/src/main.ts'],
          headCommit: 'b'.repeat(40),
          members,
          rootDir: root,
        }),
      ).toThrow(/changeset-/u);
    });
  });
});

const createCandidate = (pluginId = 'dev.lensx.fixture.alpha', version = '1.0.0'): string => {
  const directory = mkdtempSync(join(tmpdir(), 'lensx-official-candidate-'));
  const artifactName = `${pluginId}-${version}.lxp`;
  const artifactBytes = Buffer.from('candidate-package-bytes');
  const artifact = { name: artifactName, sha256: sha256(artifactBytes), size: artifactBytes.length };
  const record: OfficialPluginReleaseRecord = {
    artifact,
    plugin_id: pluginId,
    release_tag: `official/${pluginId}/v${version}`,
    repository: 'https://github.com/lensx-dev/lensx',
    schema_version: 1,
    source_commit: 'a'.repeat(40),
    source_ref: 'refs/heads/main',
    version,
    workflow_run_url: 'https://github.com/lensx-dev/lensx/actions/runs/1',
  };
  const checksumName = `${artifactName}.sha256`;
  const checksumBytes = Buffer.from(`${artifact.sha256}  ${artifactName}\n`);
  const recordName = `${pluginId}-${version}.release.json`;
  const recordBytes = Buffer.from(canonicalJson(record));
  const candidate: OfficialPluginCandidateManifest = {
    artifact,
    checksum: { name: checksumName, sha256: sha256(checksumBytes) },
    plugin_id: pluginId,
    release_record: { name: recordName, sha256: sha256(recordBytes) },
    schema_version: 1,
    version,
  };
  writeFileSync(join(directory, artifactName), artifactBytes);
  writeFileSync(join(directory, checksumName), checksumBytes);
  writeFileSync(join(directory, recordName), recordBytes);
  writeFileSync(join(directory, 'candidate.json'), canonicalJson(candidate));
  return directory;
};

class MockReleaseApi implements GitHubReleaseApi {
  readonly assets = new Map<number, { fact: ReleaseAsset; bytes: Uint8Array }>();
  readonly releases = new Map<string, ReleaseState>();
  readonly tags = new Map<string, string>();
  nextAssetId = 10;
  nextReleaseId = 1;
  failUpload = false;
  corruptDownloads = false;
  published: number[] = [];

  async getTagCommit(tag: string) {
    return this.tags.get(tag);
  }
  async createTag(tag: string, commit: string) {
    this.tags.set(tag, commit);
  }
  async getRelease(tag: string) {
    return this.releases.get(tag);
  }
  async createDraft(tag: string) {
    const state = { assets: [], draft: true, id: this.nextReleaseId++, tag };
    this.releases.set(tag, state);
    return state;
  }
  async listReleaseTags() {
    return [...this.releases.keys()].sort();
  }
  async listAssets(releaseId: number) {
    return [...this.assets.values()]
      .map((value) => value.fact)
      .filter((asset) => Math.floor(asset.id / 1000) === releaseId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }
  async uploadAsset(releaseId: number, name: string, bytes: Uint8Array) {
    if (this.failUpload) throw new Error('mock upload failure');
    const fact = { id: releaseId * 1000 + this.nextAssetId++, name, size: bytes.length };
    this.assets.set(fact.id, { bytes: new Uint8Array(bytes), fact });
    return fact;
  }
  async downloadAsset(asset: ReleaseAsset) {
    const value = this.assets.get(asset.id);
    if (value === undefined) throw new Error('mock missing asset');
    return this.corruptDownloads ? new Uint8Array([...value.bytes, 0]) : value.bytes;
  }
  async publish(releaseId: number) {
    this.published.push(releaseId);
    for (const [tag, release] of this.releases) {
      if (release.id === releaseId) this.releases.set(tag, { ...release, draft: false });
    }
  }
}

describe('candidate and release records', () => {
  test('accepts only canonical schema version 1 data and rejects authority injection', () => {
    const directory = createCandidate();
    try {
      const candidate = JSON.parse(readFileSync(join(directory, 'candidate.json'), 'utf8')) as unknown;
      const recordPath = join(directory, 'dev.lensx.fixture.alpha-1.0.0.release.json');
      const record = JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>;
      expect(validateCandidateManifest(candidate)).toBe(true);
      expect(validateReleaseRecord(record)).toBe(true);
      expect(validateReleaseRecord({ ...record, signature: 'not-authority' })).toBe(false);
      expect(validateReleaseRecord({ ...record, official: true })).toBe(false);
      expect(validateReleaseRecord({ ...record, grant: ['all'] })).toBe(false);
      expect(validateReleaseRecord({ ...record, permission: ['all'] })).toBe(false);
      expect(validateReleaseRecord({ ...record, authorization: true })).toBe(false);
      expect(validateReleaseRecord({ ...record, secret: 'SECRET_FIXTURE_VALUE' })).toBe(false);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test('rejects handoff byte changes, stale records, and inspector disagreement', () => {
    const directory = createCandidate();
    try {
      const candidate = verifyCandidateDirectory(directory);
      writeFileSync(join(directory, candidate.artifact.name), 'changed-after-handoff');
      expect(() => verifyCandidateDirectory(directory)).toThrow(/candidate-artifact-drift/u);
      expect(() =>
        assertCandidateInspectionAgreement({
          digest: 'a'.repeat(64),
          pluginId: candidate.plugin_id,
          rust: {
            digest: 'b'.repeat(64),
            installer_prepared: true,
            plugin_id: candidate.plugin_id,
            version: candidate.version,
          },
          typescript: {
            package_digest: { value: 'a'.repeat(64) },
            plugin_id: candidate.plugin_id,
            version: candidate.version,
          },
          version: candidate.version,
        }),
      ).toThrow(/inspection-drift/u);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }

    const staleDirectory = createCandidate();
    try {
      const candidate = verifyCandidateDirectory(staleDirectory);
      const recordPath = join(staleDirectory, candidate.release_record.name);
      const record = JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>;
      writeFileSync(recordPath, canonicalJson({ ...record, version: '9.9.9' }));
      expect(() => verifyCandidateDirectory(staleDirectory)).toThrow(/release-record-invalid/u);
    } finally {
      rmSync(staleDirectory, { force: true, recursive: true });
    }
  });

  test('publishes draft assets atomically and treats exact retry as idempotent', async () => {
    const directory = createCandidate();
    const api = new MockReleaseApi();
    await withFixture(directory, async () => {
      await expect(publishCandidateDirectory(directory, 'a'.repeat(40), api)).resolves.toMatchObject({
        status: 'published',
      });
      await expect(publishCandidateDirectory(directory, 'a'.repeat(40), api)).resolves.toMatchObject({
        status: 'idempotent',
      });
      expect(api.published).toEqual([1]);
      expect(await api.listAssets(1)).toHaveLength(3);
    });
  });

  test('fails closed on tag, asset, upload, readback, and SemVer conflicts without changing public history', async () => {
    const directory = createCandidate();
    await withFixture(directory, async () => {
      const tagConflict = new MockReleaseApi();
      tagConflict.tags.set('official/dev.lensx.fixture.alpha/v1.0.0', 'b'.repeat(40));
      await expect(publishCandidateDirectory(directory, 'a'.repeat(40), tagConflict)).rejects.toThrow(
        /tag-commit-conflict/u,
      );

      const uploadFailure = new MockReleaseApi();
      uploadFailure.failUpload = true;
      await expect(publishCandidateDirectory(directory, 'a'.repeat(40), uploadFailure)).rejects.toThrow(
        /mock upload failure/u,
      );
      expect([...uploadFailure.releases.values()][0]?.draft).toBe(true);
      expect(uploadFailure.published).toEqual([]);

      const readbackFailure = new MockReleaseApi();
      readbackFailure.corruptDownloads = true;
      await expect(publishCandidateDirectory(directory, 'a'.repeat(40), readbackFailure)).rejects.toThrow(
        /asset-digest-conflict/u,
      );
      expect([...readbackFailure.releases.values()][0]?.draft).toBe(true);
      expect(readbackFailure.published).toEqual([]);

      const assetConflict = new MockReleaseApi();
      await publishCandidateDirectory(directory, 'a'.repeat(40), assetConflict);
      const firstAsset = [...assetConflict.assets.values()][0];
      if (firstAsset === undefined) throw new Error('expected uploaded asset');
      assetConflict.assets.set(firstAsset.fact.id, { ...firstAsset, bytes: Buffer.from('conflicting-public-bytes') });
      const assetCount = assetConflict.assets.size;
      await expect(publishCandidateDirectory(directory, 'a'.repeat(40), assetConflict)).rejects.toThrow(
        /asset-digest-conflict/u,
      );
      expect(assetConflict.assets.size).toBe(assetCount);
      expect(assetConflict.published).toEqual([1]);

      const rollback = new MockReleaseApi();
      rollback.releases.set('official/dev.lensx.fixture.alpha/v2.0.0', {
        assets: [],
        draft: false,
        id: 9,
        tag: 'official/dev.lensx.fixture.alpha/v2.0.0',
      });
      await expect(publishCandidateDirectory(directory, 'a'.repeat(40), rollback)).rejects.toThrow(/semver-rollback/u);
    });
  });

  test('keeps multiple plugin release failures independent', async () => {
    const alpha = createCandidate('dev.lensx.fixture.alpha');
    const beta = createCandidate('dev.lensx.fixture.beta');
    const alphaApi = new MockReleaseApi();
    const betaApi = new MockReleaseApi();
    betaApi.failUpload = true;
    try {
      await expect(publishCandidateDirectory(alpha, 'a'.repeat(40), alphaApi)).resolves.toMatchObject({
        status: 'published',
      });
      await expect(publishCandidateDirectory(beta, 'a'.repeat(40), betaApi)).rejects.toThrow();
      expect(alphaApi.published).toEqual([1]);
      expect(betaApi.published).toEqual([]);
    } finally {
      rmSync(alpha, { force: true, recursive: true });
      rmSync(beta, { force: true, recursive: true });
    }
  });
});
