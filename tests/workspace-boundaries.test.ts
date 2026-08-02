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
  test('accepts the real Contract to SDK public dependency and package exports', () => {
    expect(checkWorkspaceBoundaries(repositoryRoot)).toEqual([]);
  });

  test('accepts public package exports for official and example plugins', () => {
    expect(checkWorkspaceBoundaries(fixtureRoot('valid'))).toEqual([]);
  });

  test('rejects private Host imports for official and example plugins', () => {
    const diagnostics = checkWorkspaceBoundaries(fixtureRoot('invalid'));
    const privateImports = diagnostics.filter((item) => item.ruleId === WORKSPACE_BOUNDARY_RULES.hostPrivateImport);

    expect(privateImports.map((item) => item.file)).toEqual([
      'examples/plugins/bad/src/index.ts',
      'plugins/official/bad/src/index.ts',
    ]);
    expect(privateImports.every((item) => item.specifier === '@/app/private')).toBe(true);
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
