import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('ConfigLens Manifest', () => {
  test('is a permissionless public WebView Action/Page plugin', () => {
    const validation = validatePluginManifest(manifest);
    expect(validation.status).toBe('valid');
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const normalized = normalizePluginManifest(validation, { lensx: '0.1.0', host_api: '0.2.0' });
    expect(normalized.status).toBe('compatible');
    expect(normalized.manifest.plugin_id).toBe('dev.lensx.config-lens');
    expect(normalized.manifest.manifest_version).toBe('0.4.0');
    expect(normalized.manifest.contributes.pages[0]?.presentation).toEqual({
      initial_size: { width: 800, height: 600 },
      resizable: true,
    });
    expect(normalized.manifest.runtime).toEqual({ kind: 'webview', entry: 'index.html' });
    expect(normalized.manifest.display.name).toEqual({ 'en-US': 'ConfigLens', 'zh-CN': 'ConfigLens' });
    expect(normalized.manifest.contributes.pages).toHaveLength(1);
    expect(normalized.manifest.contributes.actions).toHaveLength(1);
    expect(normalized.manifest.contributes.actions[0]?.target).toEqual({ kind: 'page', page_id: 'main' });
    expect(normalized.manifest.contributes.launcher?.default_action_id).toBe('open');
    expect(normalized.manifest).not.toHaveProperty('requested_permissions');
  });
});
