import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { validatePluginManifest } from '@lensx/plugin-contract';
import { afterEach, describe, expect, test } from '@rstest/core';

import { createPluginProject } from '../src/create.ts';

const temporaryDirectories: string[] = [];
const temporaryRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-cli-create-'));
  temporaryDirectories.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('create plugin project', () => {
  test.each([
    'framework-neutral',
    'react-semi',
  ] as const)('creates a complete %s project from packaged assets', async (template) => {
    const root = await temporaryRoot();
    const result = await createPluginProject({
      cwd: root,
      target: 'example-plugin',
      template,
      pluginId: `com.example.${template.replace('-', '_')}`,
      name: 'Example Plugin',
    });
    const target = resolve(root, 'example-plugin');
    const metadata = JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(resolve(target, 'manifest.json'), 'utf8'));

    expect(result).toEqual({
      target: 'example-plugin',
      template,
      plugin_id: `com.example.${template.replace('-', '_')}`,
      package_name: 'example-plugin',
    });
    expect(metadata).toMatchObject({
      name: 'example-plugin',
      private: true,
      scripts: expect.objectContaining({
        build: expect.any(String),
        typecheck: expect.any(String),
        test: expect.any(String),
        check: expect.any(String),
      }),
    });
    expect(manifest).toMatchObject({
      plugin_id: result.plugin_id,
      display: { name: { 'en-US': 'Example Plugin', 'zh-CN': 'Example Plugin' } },
      requested_permissions: [],
    });
    expect(validatePluginManifest(manifest).status).toBe('valid');
    expect(await readdir(target)).toEqual(expect.arrayContaining(['manifest.json', 'package.json', 'src', 'tests']));
    for (const forbidden of ['.git', 'node_modules', 'dist', 'artifacts']) {
      expect(await readdir(target)).not.toContain(forbidden);
    }
  });

  test('accepts an existing empty directory and commits atomically', async () => {
    const root = await temporaryRoot();
    await mkdir(resolve(root, 'empty'));
    await createPluginProject({
      cwd: root,
      target: 'empty',
      template: 'framework-neutral',
      pluginId: 'com.example.empty',
      name: 'Empty',
    });
    await expect(readFile(resolve(root, 'empty/manifest.json'), 'utf8')).resolves.toContain('com.example.empty');
  });

  test('preserves a non-empty target and rejects unsafe substitutions', async () => {
    const root = await temporaryRoot();
    await mkdir(resolve(root, 'occupied'));
    await writeFile(resolve(root, 'occupied/user.txt'), 'mine');
    await expect(
      createPluginProject({
        cwd: root,
        target: 'occupied',
        template: 'framework-neutral',
        pluginId: 'com.example.occupied',
        name: 'Occupied',
      }),
    ).rejects.toMatchObject({ status: 'usage_error' });
    await expect(readFile(resolve(root, 'occupied/user.txt'), 'utf8')).resolves.toBe('mine');
    await expect(
      createPluginProject({
        cwd: root,
        target: 'invalid',
        template: 'framework-neutral',
        pluginId: 'INVALID',
        name: 'Invalid',
      }),
    ).rejects.toMatchObject({ status: 'usage_error' });
    await expect(readdir(root)).resolves.not.toContain('invalid');
  });

  test('cleans staging after replacement failure or interruption', async () => {
    const root = await temporaryRoot();
    await expect(
      createPluginProject({
        cwd: root,
        target: 'failure',
        template: 'react-semi',
        pluginId: 'com.example.failure',
        name: 'Failure',
        beforeCommit: () => {
          throw new Error('injected');
        },
      }),
    ).rejects.toMatchObject({ status: 'operational_error' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      createPluginProject({
        cwd: root,
        target: 'aborted',
        template: 'framework-neutral',
        pluginId: 'com.example.aborted',
        name: 'Aborted',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ status: 'operational_error' });
    expect((await readdir(root)).filter((name) => name.includes('lensx-staging'))).toEqual([]);
    expect(await readdir(root)).not.toEqual(expect.arrayContaining(['failure', 'aborted']));
  });

  test('implementation has no network, package installation, Git, process execution, or checkout path dependency', async () => {
    const source = await readFile(resolve(import.meta.dirname, '../src/create.ts'), 'utf8');
    for (const marker of [
      'node:http',
      'node:https',
      'node:net',
      'node:child_process',
      'pnpm install',
      'git init',
      '/Users/',
      'examples/plugins',
    ]) {
      expect(source).not.toContain(marker);
    }
  });
});
