import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('framework-neutral template Manifest', () => {
  test('is accepted by the real Contract with one Page and matching Action', () => {
    const validation = validatePluginManifest(manifest);
    expect(validation.status).toBe('valid');
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const normalized = normalizePluginManifest(validation, { lensx: '0.1.0', host_api: '0.2.0' });

    expect(normalized.status).toBe('compatible');
    expect(normalized.manifest.plugin_id).toBe('dev.lensx.template.framework-neutral');
    expect(normalized.manifest).not.toHaveProperty('requested_permissions');
    expect(normalized.manifest.runtime).toEqual({ kind: 'webview', entry: 'index.html' });
    expect(normalized.manifest.contributes.pages).toEqual([expect.objectContaining({ id: 'main', route: '/' })]);
    expect(normalized.manifest.contributes.pages[0]).not.toHaveProperty('required_permissions');
    expect(normalized.manifest.contributes.actions[0]?.target).toEqual({ kind: 'page', page_id: 'main' });
  });

  test('has no React, Semi Design, or Plugin UI dependency or source import', () => {
    const metadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = Object.keys({ ...metadata.dependencies, ...metadata.devDependencies });
    expect(dependencyNames).not.toEqual(
      expect.arrayContaining(['react', 'react-dom', '@douyinfe/semi-ui', '@lensx/plugin-ui']),
    );
    const source = ['main.ts', 'runtime.ts', 'view.ts']
      .map((file) => readFileSync(resolve(root, 'src', file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/(?:from|import\s*)\s*['"](?:react|react-dom|@douyinfe\/semi-ui|@lensx\/plugin-ui)/u);
  });
});
