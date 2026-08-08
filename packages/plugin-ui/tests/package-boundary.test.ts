import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@rstest/core';

import { PUBLIC_STYLE_TOKENS, validatePackedPackage } from '../scripts/package-validation.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const metadata = JSON.parse(readFileSync(`${packageRoot}/package.json`, 'utf8')) as Record<string, unknown>;
const styles = readFileSync(`${packageRoot}/src/styles.less`, 'utf8');
const files = [
  'LICENSE',
  'README.md',
  'dist/src/index.d.ts',
  'dist/src/index.js',
  'dist/styles.css',
  'dist/styles.d.ts',
];
const rootDeclaration = 'PluginUiProvider PluginPage PluginFeedback';

describe('Plugin UI public package boundary', () => {
  test('defines only the approved exports, peers, Runtime dependency, and CSS side effect', () => {
    expect(metadata.exports).toEqual({
      '.': { import: './dist/src/index.js', types: './dist/src/index.d.ts' },
      './styles.css': { default: './dist/styles.css', types: './dist/styles.d.ts' },
    });
    expect(metadata.sideEffects).toEqual(['./dist/styles.css']);
    expect(metadata.dependencies).toEqual({ '@douyinfe/semi-ui': '^2.101.1' });
    expect(metadata.peerDependencies).toEqual({
      '@lensx/plugin-sdk': '^0.2.0',
      react: '^19.2.7',
      'react-dom': '^19.2.7',
    });
    expect(metadata).not.toHaveProperty('dependencies.@douyinfe/semi-icons');
  });

  test('publishes exactly the approved lensX semantic tokens without Host or UnoCSS styles', () => {
    for (const token of PUBLIC_STYLE_TOKENS) {
      expect(styles).toContain(`${token}:`);
    }
    expect(styles).not.toMatch(/src\/(?:app|styles)\//u);
    expect(styles).not.toMatch(/unocss|launcher-/iu);
  });

  test('accepts a valid packed package model', () => {
    expect(
      validatePackedPackage({
        declarationSources: ['export { PluginUiProvider, PluginPage, PluginFeedback };'],
        files,
        metadata,
        rootDeclaration,
        runtimeImports: ['@douyinfe/semi-ui', '@lensx/plugin-sdk', 'react/jsx-runtime'],
        styles: `${styles}\n.semi-button { display: inline-flex; }`,
      }),
    ).toEqual([]);
  });

  test('rejects private files, undeclared imports, deep exports, and Host declaration leaks', () => {
    const invalidMetadata = {
      ...metadata,
      exports: { ...(metadata.exports as Record<string, unknown>), './internal': './dist/src/internal.js' },
    };
    const diagnostics = validatePackedPackage({
      declarationSources: ['export type Host = import("src/app/private").Host;'],
      files: [...files, 'tests/private.test.js'],
      metadata: invalidMetadata,
      rootDeclaration,
      runtimeImports: ['@tauri-apps/api'],
      styles: `${styles}\n.semi-button { display: inline-flex; }`,
    });

    expect(diagnostics).toContain('The UI package must expose only its root entry and ./styles.css.');
    expect(diagnostics).toContain('Private or development file leaked into the tarball: tests/private.test.js.');
    expect(diagnostics).toContain(
      'Runtime import @tauri-apps/api is not declared in dependencies or peerDependencies.',
    );
    expect(diagnostics).toContain('Forbidden public declaration reference: src/app/.');
  });
});
