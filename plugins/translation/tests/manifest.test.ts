import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../manifest.json'), 'utf8'));
describe('Translation public Manifest', () => {
  test('contributes the localized identity, one page and one action on the current protocol', () => {
    const result = validatePluginManifest(manifest);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error('Invalid Manifest');
    const normalized = normalizePluginManifest(result, { lensx: '0.1.0', host_api: '0.3.0' });
    expect(normalized.status).toBe('compatible');
    expect(normalized.manifest.plugin_id).toBe('dev.lensx.translation');
    expect(normalized.manifest.display.name).toEqual({ 'en-US': 'Translation', 'zh-CN': '翻译' });
    expect(normalized.manifest.contributes.pages).toHaveLength(1);
    expect(normalized.manifest.contributes.pages[0]).toMatchObject({
      id: 'main',
      presentation: { initial_size: { width: 800, height: 480 }, resizable: true },
    });
    expect(normalized.manifest.contributes.actions).toHaveLength(1);
    expect(normalized.manifest.contributes.actions[0]).toMatchObject({
      id: 'open',
      target: { kind: 'page', page_id: 'main' },
      title: manifest.display.name,
    });
    expect(normalizePluginManifest(result, { lensx: '0.1.0', host_api: '0.4.0' }).status).toBe('incompatible');
  });
  test.each(['id', 'locale', 'protocol', 'page'])('rejects invalid %s fixtures', (kind) => {
    const invalid = structuredClone(manifest);
    if (kind === 'id') invalid.plugin_id = '../invalid';
    if (kind === 'locale') delete invalid.display.name['en-US'];
    if (kind === 'protocol') invalid.manifest_version = '0.3.0';
    if (kind === 'page') invalid.contributes.actions[0].target.page_id = 'absent';
    expect(validatePluginManifest(invalid).status).not.toBe('valid');
  });
});
