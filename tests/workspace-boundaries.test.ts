import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@rstest/core';

import {
  checkWorkspaceBoundaries,
  formatWorkspaceBoundaryDiagnostic,
  WORKSPACE_BOUNDARY_RULES,
} from '../scripts/check-workspace-boundaries.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtureRoot = (name: string): string =>
  fileURLToPath(new URL(`fixtures/workspace-boundaries/${name}`, import.meta.url));

describe('workspace boundary checker', () => {
  test('accepts the real Contract to SDK to Testkit and optional UI public dependency directions', () => {
    expect(checkWorkspaceBoundaries(repositoryRoot)).toEqual([]);
  });

  test('rejects Plugin Contract and SDK reverse dependencies on Plugin Testkit', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('testkit-reverse'));
    const reverseDependencies = diagnostics.filter(
      (item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.testkitReverseDependency,
    );

    expect(reverseDependencies.map((item) => item.file)).toEqual([
      'packages/plugin-contract/package.json',
      'packages/plugin-contract/src/index.ts',
      'packages/plugin-sdk/package.json',
      'packages/plugin-sdk/src/index.ts',
    ]);
    expect(reverseDependencies.every((item) => item.specifier === '@lensx/plugin-testkit')).toBe(true);
  });

  test('rejects a Plugin SDK reverse dependency on Plugin UI', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('sdk-ui-reverse'));
    const reverseDependencies = diagnostics.filter(
      (item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.sdkUiReverseDependency,
    );

    expect(reverseDependencies.map((item) => item.file)).toEqual([
      'packages/plugin-sdk/package.json',
      'packages/plugin-sdk/src/index.ts',
    ]);
    expect(reverseDependencies.every((item) => item.specifier === '@lensx/plugin-ui')).toBe(true);
  });

  test('accepts public package exports for official and example plugins', () => {
    expect(checkWorkspaceBoundaries(fixtureRoot('valid'))).toEqual([]);
  });

  test('rejects Host imports of official plugin packages or source paths', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid')).filter(
      (item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostOfficialPluginSourceImport,
    );

    expect(diagnostics.map((item) => [item.file, item.specifier])).toEqual([
      ['src/app/official.ts', '../../plugins/official/bad/src/index'],
      ['src/app/official.ts', '@fixture/official-bad'],
    ]);
  });

  test('keeps both project templates on ordinary SemVer and resolves them to current workspace packages', () => {
    const templates = [
      ['framework-neutral', ['@lensx/plugin-contract', '@lensx/plugin-sdk', '@lensx/plugin-testkit']],
      ['react-semi', ['@lensx/plugin-contract', '@lensx/plugin-sdk', '@lensx/plugin-testkit', '@lensx/plugin-ui']],
    ] as const;

    for (const [template, packageNames] of templates) {
      const templateRoot = resolve(repositoryRoot, 'examples/plugins', template);
      const metadata = JSON.parse(readFileSync(resolve(templateRoot, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      expect(Object.keys(metadata.scripts ?? {})).toEqual(
        expect.arrayContaining(['build', 'typecheck', 'test', 'check']),
      );
      for (const packageName of packageNames) {
        const version = metadata.dependencies?.[packageName] ?? metadata.devDependencies?.[packageName];
        const packageRoot = resolve(repositoryRoot, 'packages', packageName.replace('@lensx/plugin-', 'plugin-'));
        const packageMetadata = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
          version: string;
        };
        expect(version).toBe(`^${packageMetadata.version}`);
        expect(realpathSync(resolve(templateRoot, 'node_modules', packageName))).toBe(packageRoot);
      }
    }
  });

  test('rejects private Host imports for official and example plugins', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const privateImports = diagnostics.filter(
      (item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport && item.specifier === '@/app/private',
    );

    expect(privateImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(privateImports.every((item) => item.specifier === '@/app/private')).toBe(true);
  });

  test('rejects imports of the workspace-private package-format tool', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const packageFormatImports = diagnostics.filter((item) => item.specifier.includes('tools/plugin-package-format'));

    expect(packageFormatImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(packageFormatImports.every((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport)).toBe(true);
  });

  test('rejects Host-private Registration types, adapters, and event entry points', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const registrationImports = diagnostics.filter((item) => item.specifier.includes('/plugins/registration'));

    expect(registrationImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'examples/plugins/bad/src/index.ts',
      'examples/plugins/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(
      registrationImports.every(
        (item) =>
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport ||
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostTauriAdapter,
      ),
    ).toBe(true);
  });

  test('rejects Host-private Plugin Development Mode frontend and native entry points', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const developmentImports = diagnostics.filter(
      (item) => item.specifier.includes('/plugins/development') || item.specifier.includes('plugin_development.rs'),
    );

    expect(developmentImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'examples/plugins/bad/src/index.ts',
      'packages/public/src/index.ts',
      'packages/public/src/index.ts',
      'plugins/official/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(developmentImports.every((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport)).toBe(true);
  });

  test('rejects Host-private local installation contracts and adapters', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const installationImports = diagnostics.filter((item) => item.specifier.includes('/plugins/installation'));

    expect(installationImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'examples/plugins/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(
      installationImports.every(
        (item) =>
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport ||
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostTauriAdapter,
      ),
    ).toBe(true);
  });

  test('rejects Host-private Resource Contract, adapter, and command entry points for every plugin consumer kind', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const resourceImports = diagnostics.filter((item) => item.specifier.includes('/plugins/resource'));

    expect(resourceImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'examples/plugins/bad/src/index.ts',
      'examples/plugins/bad/src/index.ts',
      'packages/public/src/index.ts',
      'packages/public/src/index.ts',
      'packages/public/src/index.ts',
      'plugins/official/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(
      resourceImports.every(
        (item) =>
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport ||
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostTauriAdapter,
      ),
    ).toBe(true);
  });

  test('rejects direct imports of Host-private Rust Resource Contract and service paths', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const rustResourceImports = diagnostics.filter((item) => item.specifier.includes('src-tauri/src/plugin_resource'));

    expect(rustResourceImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'examples/plugins/bad/src/index.ts',
      'packages/public/src/index.ts',
      'packages/public/src/index.ts',
      'plugins/official/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(rustResourceImports.every((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport)).toBe(true);
  });

  test('rejects Host-private Runtime resolver, Child WebView presentation, and native authority boundary', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const runtimeImports = diagnostics.filter(
      (item) =>
        item.specifier.includes('/plugins/runtime') || item.specifier.includes('plugin_child_webview_presentation.rs'),
    );

    expect(runtimeImports).toHaveLength(21);
    expect(
      runtimeImports.every(
        (item) =>
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport ||
          item.ruleId === WORKSPACE_BOUNDARY_RULES.hostTauriAdapter,
      ),
    ).toBe(true);
  });

  test('rejects isolated-origin parser and native Child WebView internals for every plugin consumer kind', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const isolatedOriginImports = diagnostics.filter(
      (item) =>
        item.specifier.includes('plugin_resource_url') ||
        item.specifier.includes('plugin_child_webview_adapter') ||
        item.specifier.includes('plugin_child_webview_service'),
    );

    expect(isolatedOriginImports).toHaveLength(9);
    expect(isolatedOriginImports.every((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport)).toBe(
      true,
    );
  });

  test('rejects frame-aware policy, dependency patch, and harness internals for every plugin consumer kind', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const frameAwareImports = diagnostics.filter(
      (item) =>
        item.specifier.includes('frame_aware_navigation_policy') ||
        item.specifier.includes('vendor/frame-aware-navigation') ||
        item.specifier.includes('frame-aware-webview'),
    );

    expect(frameAwareImports).toHaveLength(9);
    expect(frameAwareImports.every((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport)).toBe(true);
  });

  test('rejects Tauri imports for official and example plugins', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const tauriImports = diagnostics.filter((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.pluginTauriImport);

    expect(tauriImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(tauriImports.every((item) => item.specifier === '@tauri-apps/api/core')).toBe(true);
  });

  test('treats the CLI as a Node authoring tool rather than a plugin Runtime dependency', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const runtimeImports = diagnostics.filter(
      (item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.pluginAuthoringToolRuntimeImport,
    );

    expect(runtimeImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(runtimeImports.every((item) => item.specifier === '@lensx/plugin-cli')).toBe(true);
  });

  test('rejects Host adapters, internal styles, and cross-member source paths', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));

    expect(diagnostics.some((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostTauriAdapter)).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostInternalStyle)).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.crossMemberRelativeImport)).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.undeclaredPackageExport)).toBe(true);
  });

  test('rejects private package dependencies and missing lifecycle scripts', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));

    expect(diagnostics.some((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateDependency)).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.pluginTauriDependency)).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.requiredLifecycleScript)).toBe(true);
  });

  test('formats deterministic diagnostics with rule, file, and reference', () => {
    const firstDiagnostic = checkWorkspaceBoundaries(fixtureRoot('invalid'))[0];

    expect(firstDiagnostic).toBeDefined();
    if (firstDiagnostic === undefined) {
      throw new Error('Expected at least one workspace boundary diagnostic.');
    }
    expect(formatWorkspaceBoundaryDiagnostic(firstDiagnostic)).toMatch(/^\[workspace\/[a-z-]+\] [^:]+: ".+" - .+$/u);
  });
});
