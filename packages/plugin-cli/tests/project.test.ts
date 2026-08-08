import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import type { PluginManifestInput } from '@lensx/plugin-contract';
import { afterEach, describe, expect, test } from '@rstest/core';

import { PLUGIN_PACKAGE_LIMITS } from '../src/package-format/index.ts';
import { buildPluginProject, resolvePluginProject, validatePluginProject } from '../src/project.ts';

const roots: string[] = [];
const baseManifest = JSON.parse(
  await readFile(resolve(import.meta.dirname, '../../plugin-contract/tests/fixtures/base.json'), 'utf8'),
) as PluginManifestInput;

const makeRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-cli-project-'));
  roots.push(root);
  return root;
};

const metadata = (build = 'node build.mjs') => ({
  name: 'example-plugin',
  private: true,
  type: 'module',
  packageManager: 'pnpm@11.17.0',
  scripts: { build, typecheck: 'node --check build.mjs', test: 'node --test', check: 'node --check build.mjs' },
  dependencies: { '@lensx/plugin-sdk': '^0.2.0' },
  devDependencies: { '@lensx/plugin-contract': '^0.2.0' },
});

const writePayload = async (root: string, manifest: unknown = baseManifest) => {
  await mkdir(resolve(root, 'dist/dist'), { recursive: true });
  await mkdir(resolve(root, 'dist/assets'), { recursive: true });
  await writeFile(resolve(root, 'dist/manifest.json'), `${JSON.stringify(manifest)}\n`);
  await writeFile(resolve(root, 'dist/dist/plugin.html'), '<!doctype html><title>plugin</title>');
  await writeFile(resolve(root, 'dist/assets/plugin-icon.svg'), '<svg/>');
  await writeFile(resolve(root, 'dist/assets/home.svg'), '<svg><path/></svg>');
};

const writeProject = async (input: { build?: string; manifest?: unknown; withDist?: boolean } = {}) => {
  const root = await makeRoot();
  await writeFile(resolve(root, 'package.json'), `${JSON.stringify(metadata(input.build), null, 2)}\n`);
  await mkdir(resolve(root, 'src'));
  await writeFile(
    resolve(root, 'src/index.ts'),
    "import { createPluginSdk } from '@lensx/plugin-sdk';\nvoid createPluginSdk;\n",
  );
  if (input.withDist !== false) await writePayload(root, input.manifest);
  return root;
};

const bytesSnapshot = async (root: string) => {
  const values: Array<[string, string]> = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) values.push([relative(root, path), (await readFile(path)).toString('base64')]);
    }
  };
  await visit(root);
  return values.sort(([left], [right]) => left.localeCompare(right));
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('plugin project discovery and build', () => {
  test('uses only the explicit project or cwd and validates supported metadata', async () => {
    const project = await writeProject();
    await expect(resolvePluginProject(project)).resolves.toMatchObject({ root: project, callerPath: '.' });
    await expect(resolvePluginProject(resolve(project, 'src'))).rejects.toMatchObject({ status: 'usage_error' });
  });

  test('runs pnpm build without shell composition and checks the output postcondition', async () => {
    const project = await writeProject({ withDist: false });
    await mkdir(resolve(project, 'payload'));
    await writePayload(resolve(project, 'payload'));
    await writeFile(
      resolve(project, 'build.mjs'),
      "import { cp } from 'node:fs/promises'; await cp('payload/dist', 'dist', { recursive: true });\n",
    );
    await expect(buildPluginProject({ cwd: project, json: true })).resolves.toEqual({ project: '.', dist: 'dist' });
    await expect(lstat(resolve(project, 'dist/manifest.json'))).resolves.toMatchObject({ size: expect.any(Number) });
  });

  test.each([
    ['missing script', undefined],
    ['recursive script', 'lensx-plugin build'],
  ])('rejects %s before executing project code', async (_name, build) => {
    const project = await writeProject({ withDist: false });
    const packageJson = metadata();
    if (build === undefined) delete (packageJson.scripts as Record<string, string>).build;
    else packageJson.scripts.build = build;
    await writeFile(resolve(project, 'package.json'), `${JSON.stringify(packageJson)}\n`);
    await expect(buildPluginProject({ cwd: project, json: true })).rejects.toMatchObject({ status: 'usage_error' });
    await expect(readdir(project)).resolves.not.toContain('dist');
  });

  test.each([
    ['non-zero', 'node --eval "process.exit(7)"'],
    ['signal', 'node --eval "process.kill(process.pid, \'SIGTERM\')"'],
    ['missing output', 'node --eval "process.stdout.write(\'done\')"'],
  ])('classifies %s build failures as operational', async (_name, build) => {
    const project = await writeProject({ build, withDist: false });
    await expect(buildPluginProject({ cwd: project, json: true })).rejects.toMatchObject({
      status: 'operational_error',
    });
  });
});

describe('read-only plugin project validation', () => {
  test('validates a compatible payload without changing project bytes', async () => {
    const project = await writeProject();
    const before = await bytesSnapshot(project);
    const result = await validatePluginProject(project);
    expect(result.inspection.status).toBe('compatible');
    expect(result.inspection.manifest.plugin_id).toBe('com.acme.workspace');
    expect(await bytesSnapshot(project)).toEqual(before);
    expect(await readdir(project)).not.toEqual(expect.arrayContaining(['artifacts']));
  });

  test('keeps valid-but-incompatible distinct from invalid', async () => {
    const incompatible = structuredClone(baseManifest);
    incompatible.compatibility.lensx = { min_version: '0.2.0', max_version_exclusive: '0.3.0' };
    const project = await writeProject({ manifest: incompatible });
    expect((await validatePluginProject(project)).inspection.status).toBe('incompatible');
  });

  test.each([
    'missing',
    'empty',
    'missing-manifest',
  ] as const)('rejects %s dist output without building', async (kind) => {
    const project = await writeProject({ withDist: false });
    if (kind !== 'missing') await mkdir(resolve(project, 'dist'));
    if (kind === 'missing-manifest') await writeFile(resolve(project, 'dist/file.txt'), 'x');
    await expect(validatePluginProject(project)).rejects.toMatchObject({ status: 'invalid' });
    await expect(readdir(project)).resolves.not.toContain('artifacts');
  });

  test('rejects Host-private source imports', async () => {
    const project = await writeProject();
    await writeFile(resolve(project, 'src/private.ts'), "import '@/app/private';\n");
    await expect(validatePluginProject(project)).rejects.toMatchObject({
      status: 'invalid',
      diagnostics: [expect.objectContaining({ code: 'CLI_PROJECT_IMPORT_INVALID' })],
    });
  });

  test('rejects unresolved resources, symlinks, unsafe paths, and over-limit files', async () => {
    const resourceProject = await writeProject();
    await rm(resolve(resourceProject, 'dist/dist/plugin.html'));
    await expect(validatePluginProject(resourceProject)).rejects.toMatchObject({ status: 'invalid' });

    const symlinkProject = await writeProject();
    await symlink(resolve(symlinkProject, 'package.json'), resolve(symlinkProject, 'dist/link'));
    await expect(validatePluginProject(symlinkProject)).rejects.toMatchObject({ status: 'invalid' });

    const pathProject = await writeProject();
    await writeFile(resolve(pathProject, 'dist/CON.txt'), 'reserved');
    await expect(validatePluginProject(pathProject)).rejects.toMatchObject({ status: 'invalid' });

    const limitProject = await writeProject();
    const large = resolve(limitProject, 'dist/large.bin');
    await writeFile(large, '');
    await truncate(large, PLUGIN_PACKAGE_LIMITS.fileBytes + 1);
    await expect(validatePluginProject(limitProject)).rejects.toMatchObject({ status: 'invalid' });
  });
});
