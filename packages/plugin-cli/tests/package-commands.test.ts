import { chmod, mkdir, mkdtemp, readdir, readFile, rm, truncate, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { PluginManifestInput } from '@lensx/plugin-contract';
import { afterEach, describe, expect, test } from '@rstest/core';
import { inspectPluginPackageFile, packPluginProject } from '../src/package-commands.ts';
import {
  buildCanonicalChecksums,
  compressCanonicalTar,
  createCanonicalTar,
  inspectPluginPackage,
  PLUGIN_PACKAGE_CHECKSUMS_PATH,
  PLUGIN_PACKAGE_LIMITS,
  packPluginPackage,
} from '../src/package-format/index.ts';

const roots: string[] = [];
const baseManifest = JSON.parse(
  await readFile(resolve(import.meta.dirname, '../../plugin-contract/tests/fixtures/base.json'), 'utf8'),
) as PluginManifestInput;

const makeRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-cli-pack-'));
  roots.push(root);
  return root;
};

const payloadFiles = (manifest: unknown = baseManifest) => [
  { path: 'manifest.json', bytes: Buffer.from(`${JSON.stringify(manifest)}\n`) },
  { path: 'dist/plugin.html', bytes: Buffer.from('<!doctype html><title>plugin</title>') },
  { path: 'assets/plugin-icon.svg', bytes: Buffer.from('<svg/>') },
  { path: 'assets/home.svg', bytes: Buffer.from('<svg><path/></svg>') },
];

const writeDist = async (root: string, manifest: unknown = baseManifest) => {
  for (const file of payloadFiles(manifest)) {
    const path = resolve(root, 'dist', file.path);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, file.bytes);
  }
};

const writeProject = async (input: { withDist?: boolean; build?: string } = {}) => {
  const root = await makeRoot();
  await writeFile(
    resolve(root, 'package.json'),
    `${JSON.stringify({
      name: 'pack-example',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.17.0',
      scripts: {
        build: input.build ?? 'node build.mjs',
        typecheck: 'node --check build.mjs',
        test: 'node --test',
        check: 'node --check build.mjs',
      },
      dependencies: { '@lensx/plugin-sdk': '^0.2.0' },
      devDependencies: { '@lensx/plugin-contract': '^0.2.0' },
    })}\n`,
  );
  await mkdir(resolve(root, 'src'));
  await writeFile(resolve(root, 'src/index.ts'), "import '@lensx/plugin-sdk';\n");
  await writeFile(
    resolve(root, 'build.mjs'),
    "import { cp, readFile, writeFile } from 'node:fs/promises'; let count = 0; try { count = Number(await readFile('build-count', 'utf8')); } catch {} await writeFile('build-count', String(count + 1)); await cp('payload', 'dist', { recursive: true });\n",
  );
  if (input.withDist !== false) await writeDist(root);
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('transactional plugin packing', () => {
  test('runs build by default and commits a versioned summary only after self-inspection', async () => {
    const project = await writeProject({ withDist: false });
    await mkdir(resolve(project, 'payload'));
    for (const file of payloadFiles()) {
      const path = resolve(project, 'payload', file.path);
      await mkdir(resolve(path, '..'), { recursive: true });
      await writeFile(path, file.bytes);
    }
    const summary = await packPluginProject({ cwd: project, noBuild: false, json: true });
    const artifact = resolve(project, 'artifacts/com.acme.workspace-1.2.0.lxp');
    expect(summary).toMatchObject({
      summary_version: '1',
      plugin_id: 'com.acme.workspace',
      version: '1.2.0',
      runtime_kind: 'webview',
      package_protocol: '0.1.0',
      output: 'artifacts/com.acme.workspace-1.2.0.lxp',
      package_digest: { algorithm: 'sha256', value: expect.stringMatching(/^[0-9a-f]{64}$/u) },
      page_presentations: [
        { page_id: 'home', initial_size: { width: 800, height: 600 }, resizable: true },
        { page_id: 'open_project', initial_size: { width: 650, height: 600 }, resizable: false },
      ],
    });
    expect(await readFile(resolve(project, 'build-count'), 'utf8')).toBe('1');
    expect((await inspectPluginPackage(await readFile(artifact))).status).toBe('compatible');
  });

  test('no-build never executes project code and repeat packs ignore source metadata', async () => {
    const project = await writeProject();
    const first = await packPluginProject({ cwd: project, noBuild: true, json: true });
    const artifact = resolve(project, 'artifacts/com.acme.workspace-1.2.0.lxp');
    const firstBytes = await readFile(artifact);
    await chmod(resolve(project, 'dist/dist/plugin.html'), 0o600);
    await utimes(resolve(project, 'dist/dist/plugin.html'), new Date(10), new Date(20));
    const second = await packPluginProject({ cwd: project, noBuild: true, json: true });
    expect(await readFile(artifact)).toEqual(firstBytes);
    expect(second.package_digest).toEqual(first.package_digest);
    expect(await readdir(project)).not.toContain('build-count');
    expect(await readdir(resolve(project, 'artifacts'))).toEqual(['com.acme.workspace-1.2.0.lxp']);
  });

  test('rejects dist output and preserves an existing target when commit fails', async () => {
    const project = await writeProject();
    await expect(
      packPluginProject({ cwd: project, output: 'dist/output.lxp', noBuild: true, json: true }),
    ).rejects.toMatchObject({ status: 'usage_error' });

    const output = resolve(project, 'existing.lxp');
    await writeFile(output, 'existing');
    await expect(
      packPluginProject({
        cwd: project,
        output: 'existing.lxp',
        noBuild: true,
        json: true,
        beforeCommit: () => {
          throw new Error('injected');
        },
      }),
    ).rejects.toMatchObject({ status: 'operational_error' });
    expect(await readFile(output, 'utf8')).toBe('existing');
    expect((await readdir(project)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  test('does not expose an incompatible payload as a successful artifact', async () => {
    const incompatible = structuredClone(baseManifest);
    incompatible.compatibility.host_api = { min_version: '0.3.0', max_version_exclusive: '0.4.0' };
    const project = await writeProject();
    await writeDist(project, incompatible);
    await expect(packPluginProject({ cwd: project, noBuild: true, json: true })).rejects.toMatchObject({
      status: 'incompatible',
    });
    expect(await readdir(project)).not.toContain('artifacts');
  });

  test('rejects legacy iframe authoring without building or committing an artifact', async () => {
    const legacy = {
      ...structuredClone(baseManifest),
      manifest_version: '0.2.0',
      runtime: { ...baseManifest.runtime, kind: 'iframe' },
    };
    const project = await writeProject();
    await writeDist(project, legacy);
    await writeFile(resolve(project, 'manifest.json'), `${JSON.stringify(legacy)}\n`);
    await expect(packPluginProject({ cwd: project, noBuild: false, json: true })).rejects.toMatchObject({
      status: 'incompatible',
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'CLI_LEGACY_IFRAME_RUNTIME' })]),
    });
    expect(await readdir(project)).not.toEqual(expect.arrayContaining(['artifacts', 'build-count']));
  });
});

describe('read-only package inspection', () => {
  test('reports safe compatible and incompatible facts without filesystem mutation', async () => {
    const root = await makeRoot();
    const compatible = await packPluginPackage(payloadFiles());
    const incompatibleManifest = structuredClone(baseManifest);
    incompatibleManifest.compatibility.lensx = { min_version: '0.2.0', max_version_exclusive: '0.3.0' };
    const incompatible = await packPluginPackage(payloadFiles(incompatibleManifest));
    await writeFile(resolve(root, 'compatible.lxp'), compatible.bytes);
    await writeFile(resolve(root, 'incompatible.lxp'), incompatible.bytes);
    const before = await readdir(root);
    await expect(inspectPluginPackageFile(root, 'compatible.lxp')).resolves.toMatchObject({
      status: 'compatible',
      result: {
        file: 'compatible.lxp',
        plugin_id: 'com.acme.workspace',
        runtime_kind: 'webview',
        page_presentations: [
          { page_id: 'home', initial_size: { width: 800, height: 600 }, resizable: true },
          { page_id: 'open_project', initial_size: { width: 650, height: 600 }, resizable: false },
        ],
      },
    });
    await expect(inspectPluginPackageFile(root, 'incompatible.lxp')).resolves.toMatchObject({ status: 'incompatible' });
    expect(await readdir(root)).toEqual(before);
  });

  test('suppresses partial facts for corrupt packages and rejects oversized input before reading it', async () => {
    const root = await makeRoot();
    await writeFile(resolve(root, 'corrupt.lxp'), 'not zstandard');
    const corrupt = inspectPluginPackageFile(root, 'corrupt.lxp');
    await expect(corrupt).rejects.toMatchObject({ status: 'invalid' });

    const oversized = resolve(root, 'oversized.lxp');
    await writeFile(oversized, '');
    await truncate(oversized, PLUGIN_PACKAGE_LIMITS.compressedBytes + 1);
    await expect(inspectPluginPackageFile(root, 'oversized.lxp')).rejects.toMatchObject({
      status: 'invalid',
      diagnostics: [expect.objectContaining({ code: 'CLI_PACKAGE_COMPRESSED_SIZE_EXCEEDED' })],
    });
  });

  test('classifies a legacy iframe package with bounded migration guidance and no partial facts', async () => {
    const root = await makeRoot();
    const legacy = {
      ...structuredClone(baseManifest),
      manifest_version: '0.2.0',
      runtime: { ...baseManifest.runtime, kind: 'iframe' },
    };
    const files = payloadFiles(legacy);
    const bytes = await compressCanonicalTar(
      createCanonicalTar([
        ...files,
        { path: PLUGIN_PACKAGE_CHECKSUMS_PATH, bytes: buildCanonicalChecksums(files).bytes },
      ]),
    );
    await writeFile(resolve(root, 'legacy.lxp'), bytes);
    await expect(inspectPluginPackageFile(root, 'legacy.lxp')).rejects.toMatchObject({
      status: 'incompatible',
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'CLI_LEGACY_IFRAME_RUNTIME' })]),
    });
    expect(await readdir(root)).toEqual(['legacy.lxp']);
  });
});
