import { access, chmod, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';

import { describe, expect, test } from '@rstest/core';

import {
  cleanInstallEnvironment,
  cleanWorkspaceInputs,
  inspectCleanInstallEntry,
  isWithinDirectory,
  requireCleanCliEnvelope,
  requireCleanCommandSuccess,
  requireCleanInstallLog,
  resolveCleanInstallEnvironment,
  shouldCopyCleanSource,
  withCleanInstallDirectory,
} from '../scripts/plugin-cli-clean-install.ts';

const members = [
  'packages/plugin-contract',
  'packages/plugin-cli',
  'packages/plugin-sdk',
  'packages/plugin-testkit',
  'packages/plugin-ui',
  'plugins/translation',
  'plugins/config-lens',
  'examples/plugins/framework-neutral',
  'examples/plugins/react-semi',
  'examples/plugins/development-mode-smoke',
];

describe('CLI clean source workspace inputs', () => {
  test('copies real workspace metadata and every member manifest with the required build inputs', () => {
    expect(cleanWorkspaceInputs(members)).toEqual([
      'examples/plugins/development-mode-smoke/package.json',
      'examples/plugins/framework-neutral',
      'examples/plugins/react-semi',
      'package.json',
      'packages/plugin-cli',
      'packages/plugin-contract',
      'packages/plugin-sdk/package.json',
      'packages/plugin-testkit/package.json',
      'packages/plugin-ui/package.json',
      'plugins/config-lens/package.json',
      'plugins/translation/package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ]);
  });

  test('fails when the real consumer or canonical template is missing', () => {
    for (const missing of ['plugins/translation', 'examples/plugins/react-semi']) {
      expect(() => cleanWorkspaceInputs(members.filter((member) => member !== missing))).toThrow(missing);
    }
  });

  test.each(['../other', '/outside', 'packages/../outside', 'packages/.cache'])('rejects unsafe member %s', (path) => {
    expect(() => cleanWorkspaceInputs([...members, path])).toThrow('unsupported workspace member');
  });

  test.each([
    'node_modules',
    'dist',
    '.build',
    'target',
    '.git',
    '.cache',
    '.pnpm-store',
    'coverage',
    'artifacts',
  ])('excludes %s at every depth', (name) => {
    expect(shouldCopyCleanSource(`${name}/file`)).toBe(false);
    expect(shouldCopyCleanSource(`packages/plugin-cli/templates/${name}/file`)).toBe(false);
  });

  test('includes the new source bin and templates without requiring committed-file enumeration', () => {
    expect(shouldCopyCleanSource('packages/plugin-cli/bin/lensx-plugin.mjs')).toBe(true);
    expect(shouldCopyCleanSource('packages/plugin-cli/templates/framework-neutral/src/main.ts')).toBe(true);
    expect(shouldCopyCleanSource('packages/plugin-contract/tsconfig.tsbuildinfo')).toBe(false);
    expect(shouldCopyCleanSource('../outside')).toBe(false);
    expect(shouldCopyCleanSource('/outside')).toBe(false);
  });

  test('uses directory boundaries instead of prefix matching', () => {
    expect(isWithinDirectory('/checkout', '/checkout/packages')).toBe(true);
    expect(isWithinDirectory('/checkout', '/checkout')).toBe(true);
    expect(isWithinDirectory('/checkout', '/checkout-neighbor')).toBe(false);
    expect(isWithinDirectory('/checkout', '/checkout/../outside')).toBe(false);
  });

  test('removes checkout and dependency executable paths and inherited NODE_PATH without mutating the input', () => {
    const environment = {
      PATH: [
        '/checkout/node_modules/.bin',
        '/alias/node_modules/.bin',
        '/checkout/bin',
        '',
        '.',
        '/usr/bin',
        '/checkout-neighbor/bin',
      ].join(delimiter),
      NODE_PATH: '/checkout/node_modules',
      KEEP: 'present',
    };
    expect(cleanInstallEnvironment(environment, '/checkout')).toEqual({
      PATH: ['/usr/bin', '/checkout-neighbor/bin'].join(delimiter),
      KEEP: 'present',
    });
    expect(environment.NODE_PATH).toBe('/checkout/node_modules');
  });

  test('resolves PATH aliases before rejecting checkout tools without starting a subprocess', async () => {
    await withCleanInstallDirectory(tmpdir(), async (directory) => {
      const checkout = resolve(directory, 'checkout');
      const bin = resolve(checkout, 'node_modules/.bin');
      const alias = resolve(directory, 'tool-alias');
      const tools = resolve(directory, 'tools');
      await mkdir(bin, { recursive: true });
      await mkdir(tools);
      await symlink(bin, alias);
      expect(
        await resolveCleanInstallEnvironment({ PATH: [alias, tools].join(delimiter), NODE_PATH: bin }, checkout),
      ).toEqual({ PATH: tools });
    });
  });
});

describe('CLI clean installation result checks', () => {
  test('keeps command failures distinct from successful output', () => {
    expect(() => requireCleanCommandSuccess('install', { error: new Error('ENOENT'), status: 0 })).toThrow(
      'install failed: ENOENT',
    );
    expect(() => requireCleanCommandSuccess('build', { signal: 'SIGTERM', status: null })).toThrow(
      'build failed: SIGTERM',
    );
    expect(() => requireCleanCommandSuccess('validate', { status: 1, stderr: 'rejected' })).toThrow('stderr: rejected');
    expect(() => requireCleanCommandSuccess('create', { status: null })).toThrow('status null');
    expect(requireCleanCommandSuccess('help', { status: 0, stdout: 'help' })).toBe('help');
  });

  test.each([
    'WARN Failed to create bin lensx-plugin: ENOENT',
    'WARN @lensx/plugin-cli: no such file or directory',
    'WARN missing lensx-plugin install target',
  ])('rejects a missing install-entry warning: %s', (output) => {
    expect(() => requireCleanInstallLog(output)).toThrow('public CLI entry warning');
  });

  test('accepts successful installation output', () => {
    expect(() => requireCleanInstallLog('Added @lensx/plugin-cli\nDone')).not.toThrow();
  });

  test.each(['create', 'validate'] as const)('requires the existing %s JSON protocol', (command) => {
    const envelope = {
      schema_version: '1',
      command,
      status: command === 'create' ? 'success' : 'compatible',
      result: { runtime_kind: 'webview' },
    };
    expect(requireCleanCliEnvelope(`${JSON.stringify(envelope)}\n`, command)).toEqual(envelope);
    for (const stdout of ['', 'not JSON', '{}\n{}']) {
      expect(() => requireCleanCliEnvelope(stdout, command)).toThrow('expected one JSON document');
    }
    for (const value of [
      null,
      [],
      {},
      { ...envelope, command: 'inspect' },
      { ...envelope, schema_version: '2' },
      { ...envelope, status: 'invalid' },
      { ...envelope, result: {} },
    ]) {
      expect(() => requireCleanCliEnvelope(JSON.stringify(value), command)).toThrow('unexpected CLI result');
    }
  });
});

describe('CLI first-install entry and cleanup boundaries without subprocesses', () => {
  const writeShim = async (workspace: string, target: string): Promise<string> => {
    const command = resolve(workspace, 'plugins/translation/node_modules/.bin/lensx-plugin');
    await mkdir(resolve(command, '..'), { recursive: true });
    await writeFile(command, `#!/bin/sh\n# cmd-shim-target=${target}\n`);
    await chmod(command, 0o755);
    return command;
  };

  test('accepts and records an executable shim pointing at the source entry without dist', async () => {
    let directory = '';
    await withCleanInstallDirectory(tmpdir(), async (workspace) => {
      directory = workspace;
      const target = resolve(workspace, 'packages/plugin-cli/bin/lensx-plugin.mjs');
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, '#!/usr/bin/env node\n');
      const command = await writeShim(workspace, target);
      const recorded = await inspectCleanInstallEntry(workspace, 'Installed');
      expect(recorded.target).toBe(await realpath(target));
      expect(recorded.bytes).toEqual(await readFile(command));
      expect(recorded.ino).toBeGreaterThan(0);
    });
    await expect(access(directory)).rejects.toThrow();
  });

  test('rejects the old missing dist target immediately after installation and cleans on failure', async () => {
    let directory = '';
    await expect(
      withCleanInstallDirectory(tmpdir(), async (workspace) => {
        directory = workspace;
        await writeShim(workspace, resolve(workspace, 'packages/plugin-cli/dist/src/bin.js'));
        await inspectCleanInstallEntry(workspace, 'Installed');
      }),
    ).rejects.toThrow('missing install target');
    await expect(access(directory)).rejects.toThrow();
  });

  test('rejects missing shims and prebuilt outputs', async () => {
    await withCleanInstallDirectory(tmpdir(), async (workspace) => {
      await expect(inspectCleanInstallEntry(workspace, '')).rejects.toThrow('did not create the consumer CLI entry');
      await mkdir(resolve(workspace, 'packages/plugin-cli/dist'), { recursive: true });
      await expect(inspectCleanInstallEntry(workspace, '')).rejects.toThrow('unexpected output');
    });
  });

  test.each(['install', 'build', 'command'])('cleans the workspace after a %s-stage failure', async (stage) => {
    let directory = '';
    await expect(
      withCleanInstallDirectory(tmpdir(), async (workspace) => {
        directory = workspace;
        await writeFile(resolve(workspace, 'stage'), stage);
        throw new Error(`${stage} failed`);
      }),
    ).rejects.toThrow(`${stage} failed`);
    await expect(access(directory)).rejects.toThrow();
  });
});
