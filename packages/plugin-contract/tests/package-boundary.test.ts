import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, test } from '@rstest/core';

import { validatePackedPackage } from '../scripts/package-validation.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

interface PackageMetadata {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  files?: string[];
  scripts?: Record<string, string>;
}

describe('public package boundary', () => {
  test('declares bounded exports, publish files, runtime dependencies, and real lifecycle scripts', () => {
    const metadata = readJson<PackageMetadata>(resolve(packageRoot, 'package.json'));

    expect(Object.keys(metadata.exports ?? {})).toEqual(['.', './schema', './manifest.schema.json']);
    expect(metadata.files).toEqual(['dist', 'LICENSE', 'README.md']);
    expect(metadata.dependencies).toEqual({ ajv: '^8.20.0' });
    expect(Object.values(metadata.dependencies ?? {}).some((version) => version.startsWith('workspace:'))).toBe(false);
    for (const script of ['build', 'typecheck', 'test', 'check']) {
      expect(metadata.scripts?.[script]).toBeTruthy();
    }
  });

  test('runtime source has no Host, React, DOM, Tauri, Node, or undeclared package imports', () => {
    const runtimeSources = ['src/constants.ts', 'src/index.ts', 'src/schema.ts', 'src/types.ts', 'src/validate.ts'].map(
      (path) => readFileSync(resolve(packageRoot, path), 'utf8'),
    );
    const source = runtimeSources.join('\n');

    for (const forbidden of [
      'src/app/',
      '@/',
      '@tauri-apps/',
      '@douyinfe/semi-ui',
      'react',
      'node:',
      'document.',
      'window.',
    ]) {
      expect(source).not.toContain(forbidden);
    }
    const externalImports = [...source.matchAll(/from\s+['"]([^.'"][^'"]*)['"]/gu)].map((match) => match[1]);
    expect(externalImports).toEqual(['ajv/dist/2020.js']);
  });

  test('generated type drift check fails for missing and stale output', () => {
    const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'lensx-contract-generator-'));
    const outputPath = resolve(temporaryRoot, 'plugin-manifest-input.ts');
    const generatorArguments = [
      'scripts/generate-plugin-manifest-types.mjs',
      '--schema',
      'schema/manifest.schema.json',
      '--output',
      outputPath,
    ];

    try {
      expect(spawnSync(process.execPath, [...generatorArguments, '--check'], { cwd: packageRoot }).status).not.toBe(0);
      expect(spawnSync(process.execPath, generatorArguments, { cwd: packageRoot }).status).toBe(0);
      expect(spawnSync(process.execPath, [...generatorArguments, '--check'], { cwd: packageRoot }).status).toBe(0);
      writeFileSync(outputPath, '// stale\n', 'utf8');
      expect(spawnSync(process.execPath, [...generatorArguments, '--check'], { cwd: packageRoot }).status).not.toBe(0);
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  test('publish validation rejects missing artifacts, dependency leaks, and undeclared runtime imports', () => {
    const metadata = {
      dependencies: { ajv: '^8.20.0' },
      exports: {
        '.': { types: './dist/src/index.d.ts', import: './dist/src/index.js' },
        './schema': { types: './dist/src/schema.d.ts', import: './dist/src/schema.js' },
        './manifest.schema.json': './dist/schema/manifest.schema.json',
      },
    };
    const files = [
      'dist/schema/manifest.schema.json',
      'dist/src/index.d.ts',
      'dist/src/index.js',
      'dist/src/schema.d.ts',
      'dist/src/schema.js',
      'package.json',
    ];
    expect(validatePackedPackage({ metadata, files, runtimeImports: ['ajv/dist/2020.js'] })).toEqual([]);

    expect(
      validatePackedPackage({
        metadata,
        files: files.filter((path) => path !== 'dist/src/index.d.ts'),
        runtimeImports: [],
      }),
    ).toContain('Export target is missing from the tarball: dist/src/index.d.ts.');
    expect(
      validatePackedPackage({
        metadata,
        files: files.filter((path) => path !== 'dist/schema/manifest.schema.json'),
        runtimeImports: [],
      }),
    ).toContain('Export target is missing from the tarball: dist/schema/manifest.schema.json.');
    expect(validatePackedPackage({ metadata, files, runtimeImports: ['missing-runtime-package'] })).toContain(
      'Runtime import missing-runtime-package is not declared in dependencies.',
    );
    expect(
      validatePackedPackage({
        metadata: { ...metadata, dependencies: { ajv: 'workspace:*' } },
        files,
        runtimeImports: [],
      }),
    ).toContain('Published dependencies must not contain workspace: ranges.');
    expect(validatePackedPackage({ metadata, files: [...files, 'tests/fixture.json'], runtimeImports: [] })).toContain(
      'Private or development file leaked into the tarball: tests/fixture.json.',
    );
  });
});
