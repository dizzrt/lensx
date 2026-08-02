import {
  normalizePluginManifest,
  PLUGIN_HOST_API_VERSION,
  PLUGIN_MANIFEST_VERSION,
  validatePluginManifest,
} from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

import { createPluginManifestFixture, mutatePluginManifestFixture } from '../src/index.js';

describe('Plugin Manifest fixtures', () => {
  test('creates isolated minimal author input accepted by the real Contract', () => {
    const first = createPluginManifestFixture();
    const second = createPluginManifestFixture();
    const validation = validatePluginManifest(first);

    expect(first.manifest_version).toBe(PLUGIN_MANIFEST_VERSION);
    expect(validation.status).toBe('valid');
    if (validation.status === 'invalid') {
      throw new Error('The baseline Testkit Manifest must be valid.');
    }
    expect(normalizePluginManifest(validation, { host_api: PLUGIN_HOST_API_VERSION, lensx: '0.1.0' })).toMatchObject({
      status: 'compatible',
    });
    expect(first).not.toBe(second);
    expect(first.display).not.toBe(second.display);
    first.display.name['en-US'] = 'Changed';
    expect(second.display.name['en-US']).toBe('Test Plugin');
    expect(createPluginManifestFixture().display.name['en-US']).toBe('Test Plugin');

    for (const hostOwned of ['source', 'lifecycle', 'enabled', 'granted_permissions', 'context', 'session']) {
      expect(hostOwned in first).toBe(false);
    }
  });

  test('removes required fields and sets invalid values without changing the input', () => {
    const input = createPluginManifestFixture();
    const original = JSON.parse(JSON.stringify(input));
    const candidate = mutatePluginManifestFixture(input, [
      { op: 'remove', path: '/plugin_id' },
      { op: 'set', path: '/runtime/kind', value: 'native' },
    ]);

    expect(input).toEqual(original);
    const validation = validatePluginManifest(candidate);
    expect(validation.status).toBe('invalid');
    if (validation.status === 'invalid') {
      expect(validation.diagnostics.map(({ path }) => path)).toEqual(
        expect.arrayContaining(['/plugin_id', '/runtime/kind']),
      );
    }
  });

  test('applies array and escaped JSON Pointer mutations in order', () => {
    const input = createPluginManifestFixture();
    const result = mutatePluginManifestFixture(input, [
      {
        op: 'set',
        path: '/contributes/pages/0/title/en-US',
        value: 'First title',
      },
      {
        op: 'set',
        path: '/display/a~1b',
        value: { '~key': 'before' },
      },
      {
        op: 'set',
        path: '/display/a~1b/~0key',
        value: 'after',
      },
    ]) as Record<string, unknown>;

    expect(result).toMatchObject({
      contributes: { pages: [{ title: { 'en-US': 'First title' } }] },
      display: { 'a/b': { '~key': 'after' } },
    });
    expect(input.display).not.toHaveProperty('a/b');
  });

  test('fails deterministically for invalid pointers, missing parents, and array bounds', () => {
    const input = createPluginManifestFixture();
    const original = JSON.parse(JSON.stringify(input));
    for (const operation of [
      { op: 'remove' as const, path: 'plugin_id' },
      { op: 'remove' as const, path: '/missing/value' },
      { op: 'set' as const, path: '/contributes/pages/1/title', value: {} },
      { op: 'set' as const, path: '/display/~2invalid', value: true },
    ]) {
      expect(() => mutatePluginManifestFixture(input, [operation])).toThrow(/^Plugin Testkit configuration error:/u);
      expect(input).toEqual(original);
    }
  });
});
