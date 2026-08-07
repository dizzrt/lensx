import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@rstest/core';
import {
  hasPluginDevelopmentModeCapability,
  PLUGIN_DEVELOPMENT_MODE_BUILD_CAPABILITY,
} from '../src/app/plugins/development';

describe('Plugin Development Mode build capability', () => {
  test('fails closed when the ordinary frontend build does not opt in', () => {
    expect(PLUGIN_DEVELOPMENT_MODE_BUILD_CAPABILITY).toBe(false);
    expect(hasPluginDevelopmentModeCapability(false)).toBe(false);
    expect(hasPluginDevelopmentModeCapability(true)).toBe(false);
  });

  test('keeps native feature, managed state, commands, and dedicated startup coupled', () => {
    const cargo = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
    const nativeComposition = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
    const rootPackage = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const buildConfig = readFileSync(new URL('../rsbuild.config.ts', import.meta.url), 'utf8');
    const productionComposition = readFileSync(
      new URL('../src/app/plugins/lifecycle/production.ts', import.meta.url),
      'utf8',
    );
    const enabledArtifactGate = readFileSync(
      new URL('../scripts/check-plugin-development-mode-enabled-artifact.ts', import.meta.url),
      'utf8',
    );

    expect(cargo).toContain('default = []');
    expect(cargo).toContain('plugin-development-mode = []');
    expect(nativeComposition).toContain('#[cfg(feature = "plugin-development-mode")]');
    expect(nativeComposition).toContain('#[cfg(not(feature = "plugin-development-mode"))]');
    expect(rootPackage).toContain('LENSX_PLUGIN_DEVELOPMENT_MODE=1 tauri dev --features plugin-development-mode');
    expect(buildConfig).toContain("'src/app/plugins/development/composition-disabled.ts'");
    expect(buildConfig).toContain("'src/app/plugins/development/composition-enabled.ts'");
    expect(productionComposition).toContain("from '@/app/plugins/development/composition'");
    expect(productionComposition).not.toContain("from '../development'");
    expect(enabledArtifactGate).toContain('Feature-enabled frontend artifacts do not contain');
  });
});
