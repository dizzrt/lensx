import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@rstest/core';
import { createRsbuildConfig } from '../rsbuild.config';

import {
  createDevelopmentLauncherPlan,
  PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV,
  parsePluginDevelopmentArguments,
} from '../scripts/development-launcher.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

describe('plugin development startup wrapper', () => {
  test('uses the direct repository plugins directory by default', () => {
    const launch = createDevelopmentLauncherPlan({ mode: 'plugin-development', cwd: repositoryRoot });
    expect(launch).toMatchObject({
      mode: 'plugin-development',
      repositoryRoot,
      environment: {
        LENSX_PLUGIN_DEVELOPMENT_MODE: '1',
        [PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV]: resolve(repositoryRoot, 'plugins'),
      },
      tauriArguments: ['--features', 'plugin-development-mode'],
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
    try {
      parsePluginDevelopmentArguments(arguments_, repositoryRoot);
      throw new Error('expected argument parsing to fail');
    } catch (error) {
      expect(error).toMatchObject({ code });
    }
  });

  test('keeps the startup root out of Rsbuild defines and ordinary dev', () => {
    const rsbuild = readFileSync(resolve(repositoryRoot, 'rsbuild.config.ts'), 'utf8');
    const metadata = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(rsbuild).not.toContain(PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV);
    expect(metadata.scripts.dev).not.toContain(PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV);
    expect(metadata.scripts['app:dev']).toContain('development-launcher.mjs');
    expect(metadata.scripts['dev:plugin-development-mode']).toContain('dev-plugin-development-mode.mjs');
  });

  test('keeps Host HMR independent from workspace package dist rebuilds', () => {
    const devAlias = createRsbuildConfig({ command: 'dev' }).resolve?.alias as Record<string, string>;
    const buildAlias = createRsbuildConfig({ command: 'build' }).resolve?.alias as Record<string, string>;

    expect(devAlias['@lensx/plugin-contract$']).toBe(resolve(repositoryRoot, 'packages/plugin-contract/src/index.ts'));
    expect(buildAlias).not.toHaveProperty('@lensx/plugin-contract$');
  });
});
