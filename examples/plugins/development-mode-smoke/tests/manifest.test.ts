import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

const root = resolve(import.meta.dirname, '..');

const readManifest = (phase: 'initial' | 'permission-delta') =>
  JSON.parse(readFileSync(resolve(root, `manifests/${phase}.json`), 'utf8'));

describe('development-mode smoke manifests', () => {
  test.each([
    ['initial', '0.1.0', []],
    ['permission-delta', '0.2.0', ['clipboard.read']],
  ] as const)('keeps %s contract-valid and compatible', (phase, version, permissionIds) => {
    const validation = validatePluginManifest(readManifest(phase));
    expect(validation.status).toBe('valid');
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const normalized = normalizePluginManifest(validation, { lensx: '0.1.0', host_api: '0.1.0' });

    expect(normalized.status).toBe('compatible');
    expect(normalized.manifest.plugin_id).toBe('dev.lensx.smoke.development-mode');
    expect(normalized.manifest.version).toBe(version);
    expect(normalized.manifest.requested_permissions.map(({ permission_id }) => permission_id)).toEqual(permissionIds);
    expect(normalized.manifest.contributes.pages[0]?.required_permissions).toEqual([]);
  });

  test('models one identity across a visible generation and permission delta', () => {
    const initial = readManifest('initial');
    const permissionDelta = readManifest('permission-delta');

    expect(permissionDelta.plugin_id).toBe(initial.plugin_id);
    expect(permissionDelta.version).not.toBe(initial.version);
    expect(permissionDelta.contributes.actions[0].title['en-US']).toContain('smoke B');
    expect(initial.contributes.actions[0].title['en-US']).toContain('smoke A');
  });
});
