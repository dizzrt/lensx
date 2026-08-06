import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  parseClearPluginDataRequest,
  parseClearPluginDataResult,
  parsePluginDataManagementError,
} from '../src/app/plugins/data-management';

interface Fixture {
  readonly name: string;
  readonly kind: 'request' | 'result' | 'error';
  readonly value: unknown;
}

const fixtures = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/plugin-data-management/cases.json'), 'utf8'),
) as { readonly valid: readonly Fixture[]; readonly invalid: readonly Fixture[] };

const parse = ({ kind, value }: Fixture) =>
  kind === 'request'
    ? parseClearPluginDataRequest(value)
    : kind === 'result'
      ? parseClearPluginDataResult(value)
      : parsePluginDataManagementError(value);

describe('Host-private Plugin Data Management Contract', () => {
  test('accepts and freezes valid shared fixtures', () => {
    for (const fixture of fixtures.valid) {
      expect(Object.isFrozen(parse(structuredClone(fixture))), fixture.name).toBe(true);
    }
  });

  test('rejects invalid, drifting, and disclosing shared fixtures', () => {
    for (const fixture of fixtures.invalid) {
      expect(() => parse(structuredClone(fixture)), fixture.name).toThrow(TypeError);
    }
  });
});
