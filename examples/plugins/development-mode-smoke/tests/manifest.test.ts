import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

const root = resolve(import.meta.dirname, '..');

const readManifest = (phase: 'initial' | 'reload') =>
  JSON.parse(readFileSync(resolve(root, `manifests/${phase}.json`), 'utf8'));

describe('development-mode smoke manifests', () => {
  test.each([
    ['initial', '0.1.0'],
    ['reload', '0.2.0'],
  ] as const)('keeps %s contract-valid and compatible', (phase, version) => {
    const validation = validatePluginManifest(readManifest(phase));
    expect(validation.status).toBe('valid');
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const normalized = normalizePluginManifest(validation, { lensx: '0.1.0', host_api: '0.2.0' });

    expect(normalized.status).toBe('compatible');
    expect(normalized.manifest.plugin_id).toBe('dev.lensx.smoke.development-mode');
    expect(normalized.manifest.version).toBe(version);
    expect(normalized.manifest).not.toHaveProperty('requested_permissions');
    expect(normalized.manifest.contributes.pages[0]).not.toHaveProperty('required_permissions');
  });

  test('models one identity across a visible generation reload', () => {
    const initial = readManifest('initial');
    const reload = readManifest('reload');

    expect(reload.plugin_id).toBe(initial.plugin_id);
    expect(reload.version).not.toBe(initial.version);
    expect(reload.contributes.actions[0].title['en-US']).toContain('smoke B');
    expect(initial.contributes.actions[0].title['en-US']).toContain('smoke A');
  });
});
