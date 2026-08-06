import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

import {
  parsePluginScopedStorageBoundaryError,
  parsePluginScopedStorageBoundaryRequest,
  parsePluginScopedStorageBoundaryResultEnvelope,
} from '../src/app/plugins/storage';

interface FixtureCase {
  readonly name: string;
  readonly kind: 'error' | 'request' | 'result';
  readonly value: unknown;
}

const fixtures = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/plugin-scoped-storage/cases.json'), 'utf8'),
) as { readonly valid: readonly FixtureCase[]; readonly invalid: readonly FixtureCase[] };

const parseFixture = ({ kind, value }: FixtureCase) => {
  if (kind === 'request') return parsePluginScopedStorageBoundaryRequest(value);
  if (kind === 'result') return parsePluginScopedStorageBoundaryResultEnvelope(value);
  return parsePluginScopedStorageBoundaryError(value);
};

describe('Host-private plugin scoped storage contract', () => {
  for (const fixture of fixtures.valid) {
    test(`accepts shared valid fixture: ${fixture.name}`, () => {
      const parsed = parseFixture(fixture);
      expect(parsed).toBeDefined();
      expect(Object.isFrozen(parsed)).toBe(true);
    });
  }

  for (const fixture of fixtures.invalid) {
    test(`rejects shared invalid fixture: ${fixture.name}`, () => {
      expect(() => parseFixture(fixture)).toThrow(TypeError);
    });
  }

  test('keeps private authority and storage implementation out of public packages', () => {
    for (const file of [
      'packages/plugin-contract/src/index.ts',
      'packages/plugin-sdk/src/index.ts',
      'packages/plugin-sdk/src/iframe.ts',
      'packages/plugin-testkit/src/index.ts',
    ]) {
      const source = readFileSync(join(import.meta.dirname, '..', file), 'utf8');
      expect(source).not.toMatch(
        /PluginScopedStorage|PluginDataManagement|ClearPluginData|storage-v1|plugin_scoped_storage|clear_plugin_data|@tauri-apps/u,
      );
    }
  });
});
