import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from '@rstest/core';

import { validatePackedPackage } from '../scripts/package-validation.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const readJson = <Value>(path: string): Value => JSON.parse(readFileSync(path, 'utf8')) as Value;

interface PackageMetadata {
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  files?: string[];
  scripts?: Record<string, string>;
}

describe('Plugin Testkit public package boundary', () => {
  test('declares one root export, two public Runtime dependencies, and meaningful lifecycle scripts', () => {
    const metadata = readJson<PackageMetadata>(resolve(packageRoot, 'package.json'));

    expect(Object.keys(metadata.exports ?? {})).toEqual(['.']);
    expect(metadata.files).toEqual(['dist', 'LICENSE', 'README.md']);
    expect(metadata.dependencies).toEqual({
      '@lensx/plugin-contract': 'workspace:*',
      '@lensx/plugin-sdk': 'workspace:*',
    });
    for (const script of ['build', 'typecheck', 'test', 'check', 'test:pack']) {
      expect(metadata.scripts?.[script]).toBeTruthy();
      expect(metadata.scripts?.[script]).not.toMatch(/^echo\b/u);
    }
  });

  test('Runtime source has no Host, framework, Tauri, DOM, Node filesystem, runner, or wire leaks', () => {
    const runtimeSources = ['async.ts', 'context.ts', 'fake-transport.ts', 'index.ts', 'json.ts', 'manifest.ts'].map(
      (path) => readFileSync(resolve(packageRoot, 'src', path), 'utf8'),
    );
    const source = runtimeSources.join('\n');

    for (const forbidden of [
      'src/app/',
      '@/app/',
      '@tauri-apps/',
      '@douyinfe/semi-ui',
      "from 'react'",
      'node:fs',
      'AbortSignal',
      'MessagePort',
      'Window',
      'postMessage',
      'requestId',
      'nonce',
      'pluginIdentity',
      '@rstest/',
      'vitest',
    ]) {
      expect(source).not.toContain(forbidden);
    }
    const externalImports = [...source.matchAll(/from\s+['"]([^.'"][^'"]*)['"]/gu)].map((match) => match[1]);
    expect([...new Set(externalImports)].sort()).toEqual(['@lensx/plugin-contract', '@lensx/plugin-sdk']);
  });

  test('publish validation rejects missing exports, private files, dependency leaks, and forbidden declarations', () => {
    const metadata = {
      dependencies: { '@lensx/plugin-contract': '0.2.0', '@lensx/plugin-sdk': '0.2.0' },
      exports: { '.': { import: './dist/src/index.js', types: './dist/src/index.d.ts' } },
    };
    const files = ['LICENSE', 'README.md', 'dist/src/index.d.ts', 'dist/src/index.js', 'package.json'];
    expect(validatePackedPackage({ declarationSources: ['export {};'], files, metadata, runtimeImports: [] })).toEqual(
      [],
    );
    expect(
      validatePackedPackage({
        declarationSources: ['export {};'],
        files: files.filter((path) => path !== 'dist/src/index.d.ts'),
        metadata,
        runtimeImports: [],
      }),
    ).toContain('Export target is missing from the tarball: dist/src/index.d.ts.');
    expect(
      validatePackedPackage({
        declarationSources: ['export {};'],
        files: [...files, 'tests/private.test.js'],
        metadata,
        runtimeImports: [],
      }),
    ).toContain('Private or development file leaked into the tarball: tests/private.test.js.');
    expect(
      validatePackedPackage({
        declarationSources: ['export interface Leaked { window: Window }'],
        files,
        metadata,
        runtimeImports: [],
      }),
    ).toContain('Forbidden public declaration reference: Window.');
    expect(
      validatePackedPackage({ declarationSources: [], files, metadata, runtimeImports: ['missing-dependency'] }),
    ).toContain('Runtime import missing-dependency is not declared in dependencies.');
  });
});
