import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('React and Semi template Manifest', () => {
  test('is accepted by the real Contract with an independent identity', () => {
    const validation = validatePluginManifest(manifest);
    expect(validation.status).toBe('valid');
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const normalized = normalizePluginManifest(validation, { lensx: '0.1.0', host_api: '0.2.0' });

    expect(normalized.status).toBe('compatible');
    expect(normalized.manifest.plugin_id).toBe('dev.lensx.template.react-semi');
    expect(normalized.manifest.plugin_id).not.toBe('dev.lensx.template.framework-neutral');
    expect(normalized.manifest).not.toHaveProperty('requested_permissions');
    expect(normalized.manifest.runtime.entry).toBe('index.html');
    expect(normalized.manifest.contributes.actions).toEqual([
      expect.objectContaining({
        id: 'open',
        title: normalized.manifest.display.name,
        default_keywords: { 'en-US': ['starter', 'react', 'semi'], 'zh-CN': ['起步', 'React', 'Semi'] },
        target: { kind: 'page', page_id: 'main' },
      }),
    ]);
    expect(normalized.manifest.contributes.actions[0]?.title).toEqual(normalized.manifest.contributes.pages[0]?.title);
    expect(normalized.manifest.contributes.launcher?.default_action_id).toBe('open');
  });
});
