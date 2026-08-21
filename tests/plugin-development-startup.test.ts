import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@rstest/core';
import { createRsbuildConfig } from '../rsbuild.config';

import {
  applyPluginDevelopmentChildExit,
  createPluginDevelopmentLaunch,
  PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV,
  parsePluginDevelopmentArguments,
} from '../scripts/dev-plugin-development-mode.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

describe('plugin development startup wrapper', () => {
  test('uses the direct repository plugins directory by default', () => {
    const launch = createPluginDevelopmentLaunch([], repositoryRoot);
    expect(launch).toEqual({
      command: 'pnpm',
      arguments: ['exec', 'tauri', 'dev', '--features', 'plugin-development-mode'],
      cwd: repositoryRoot,
      environment: {
        LENSX_PLUGIN_DEVELOPMENT_MODE: '1',
        [PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV]: resolve(repositoryRoot, 'plugins'),
      },
    });
  });

  test.each([
    ['relative path', ['--plugins-root', 'custom plugins'], resolve(repositoryRoot, 'custom plugins')],
    ['absolute path', ['--plugins-root', '/tmp/lensx plugins'], '/tmp/lensx plugins'],
  ])('normalizes a custom root with %s', (_label, arguments_, expected) => {
    expect(parsePluginDevelopmentArguments(arguments_, repositoryRoot).pluginsRoot).toBe(expected);
  });

  test.each([
    [['--unknown'], 'unknown-argument'],
    [['--plugins-root'], 'missing-plugins-root'],
    [['--plugins-root', '--other'], 'missing-plugins-root'],
    [['--plugins-root', 'one', '--plugins-root', 'two'], 'duplicate-plugins-root'],
  ])('rejects invalid arguments %j', (arguments_, code) => {
    expect(() => parsePluginDevelopmentArguments(arguments_, repositoryRoot)).toThrow(code);
  });

  test('propagates child exit codes and signals without conflating them', () => {
    const exitCodes: number[] = [];
    const signals: NodeJS.Signals[] = [];
    applyPluginDevelopmentChildExit(7, null, {
      setExitCode: (value) => exitCodes.push(value),
      relaySignal: (value) => signals.push(value),
    });
    applyPluginDevelopmentChildExit(null, 'SIGTERM', {
      setExitCode: (value) => exitCodes.push(value),
      relaySignal: (value) => signals.push(value),
    });
    expect(exitCodes).toEqual([7]);
    expect(signals).toEqual(['SIGTERM']);
  });

  test('keeps the startup root out of Rsbuild defines and ordinary dev', () => {
    const rsbuild = readFileSync(resolve(repositoryRoot, 'rsbuild.config.ts'), 'utf8');
    const metadata = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(rsbuild).not.toContain(PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV);
    expect(metadata.scripts.dev).not.toContain(PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV);
    expect(metadata.scripts['dev:plugin-development-mode']).toContain('dev-plugin-development-mode.mjs');
  });

  test('keeps Host HMR independent from workspace package dist rebuilds', () => {
    const devAlias = createRsbuildConfig({ command: 'dev' }).resolve?.alias as Record<string, string>;
    const buildAlias = createRsbuildConfig({ command: 'build' }).resolve?.alias as Record<string, string>;

    expect(devAlias['@lensx/plugin-contract$']).toBe(resolve(repositoryRoot, 'packages/plugin-contract/src/index.ts'));
    expect(buildAlias).not.toHaveProperty('@lensx/plugin-contract$');
  });
});
