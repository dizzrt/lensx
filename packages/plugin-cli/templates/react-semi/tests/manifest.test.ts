import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('React and Semi template Manifest', () => {
  test('is accepted by the real Contract with an independent identity and no permissions', () => {
    const validation = validatePluginManifest(manifest);
    expect(validation.status).toBe('valid');
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const normalized = normalizePluginManifest(validation, { lensx: '0.1.0', host_api: '0.1.0' });

    expect(normalized.status).toBe('compatible');
    expect(normalized.manifest.plugin_id).toBe('dev.lensx.template.react-semi');
    expect(normalized.manifest.plugin_id).not.toBe('dev.lensx.template.framework-neutral');
    expect(normalized.manifest.requested_permissions).toEqual([]);
    expect(normalized.manifest.runtime.entry).toBe('index.html');
    expect(normalized.manifest.contributes.actions[0]?.target).toEqual({ kind: 'page', page_id: 'main' });
  });
});
