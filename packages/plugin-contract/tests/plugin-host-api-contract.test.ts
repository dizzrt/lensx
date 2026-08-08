import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@rstest/core';

import {
  HOST_API_METHOD_CATALOG,
  type HostApiValidationResult,
  PLUGIN_HOST_API_VERSION,
  PLUGIN_MANIFEST_VERSION,
  validateHostApiError,
  validateHostApiEvent,
  validateHostApiRequest,
  validateHostApiResult,
  validatePluginRuntimeContext,
} from '../src/index.js';

type FixtureKind = 'context' | 'error' | 'event' | 'request' | 'result';
interface FixtureCase {
  readonly name: string;
  readonly kind: FixtureKind;
  readonly value: unknown;
  readonly expected?: readonly { readonly code: string; readonly path: string }[];
}

const fixtureRoot = resolve(import.meta.dirname, 'fixtures/host-api');
const fixtures = (category: 'valid' | 'invalid'): readonly FixtureCase[] =>
  JSON.parse(readFileSync(resolve(fixtureRoot, category, 'cases.json'), 'utf8')) as FixtureCase[];
const validate = (fixture: FixtureCase): HostApiValidationResult<unknown> => {
  if (fixture.kind === 'context') return validatePluginRuntimeContext(fixture.value);
  if (fixture.kind === 'error') return validateHostApiError(fixture.value);
  if (fixture.kind === 'event') return validateHostApiEvent(fixture.value);
  if (fixture.kind === 'request') return validateHostApiRequest(fixture.value);
  return validateHostApiResult(fixture.value);
};

describe('Host API 0.2.0 shared fixtures', () => {
  for (const fixture of fixtures('valid')) {
    test(`valid: ${fixture.name}`, () => {
      const original = structuredClone(fixture.value);
      const first = validate(fixture);
      const second = validate(fixture);
      expect(first.status).toBe('valid');
      expect(first).toEqual(second);
      expect(fixture.value).toEqual(original);
      if (first.status === 'valid') {
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.value)).toBe(true);
      }
    });
  }

  for (const fixture of fixtures('invalid')) {
    test(`invalid: ${fixture.name}`, () => {
      const result = validate(fixture);
      expect(result.status).toBe('invalid');
      expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual(fixture.expected);
      expect(result.diagnostics).toEqual(
        [...result.diagnostics].sort(
          (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
        ),
      );
    });
  }
});

test('catalog is closed, sorted, immutable, independently versioned, and non-privileged', () => {
  expect(PLUGIN_HOST_API_VERSION).toBe('0.2.0');
  expect(PLUGIN_MANIFEST_VERSION).toBe('0.2.0');
  expect(HOST_API_METHOD_CATALOG).toHaveLength(8);
  expect(HOST_API_METHOD_CATALOG.map(({ method }) => method)).toEqual(
    [...HOST_API_METHOD_CATALOG.map(({ method }) => method)].sort(),
  );
  expect(HOST_API_METHOD_CATALOG.map(({ method }) => method)).not.toContain('system.open_external');
  expect(HOST_API_METHOD_CATALOG.map(({ method }) => method)).not.toContain('clipboard.read');
  expect(HOST_API_METHOD_CATALOG.map(({ method }) => method)).not.toContain('clipboard.write');
  expect(HOST_API_METHOD_CATALOG.every((entry) => !('permission' in entry))).toBe(true);
  expect(Object.isFrozen(HOST_API_METHOD_CATALOG)).toBe(true);
  expect(Object.isFrozen(HOST_API_METHOD_CATALOG[0])).toBe(true);
  expect(HOST_API_METHOD_CATALOG.every(({ deprecated }) => deprecated === false)).toBe(true);
});

test('validators reject non-JSON and cyclic values without mutation or sensitive echo', () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  for (const value of [
    { method: 'storage.set', params: { key: 'value', value: undefined } },
    { method: 'storage.set', params: { key: 'value', value: BigInt(1) } },
    { method: 'storage.set', params: { key: 'value', value: cyclic } },
    { method: 'storage.set', params: { key: 'value', value: new Date() } },
  ]) {
    const result = validateHostApiRequest(value);
    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result.diagnostics)).not.toContain('private');
  }
});

test('Host API errors remain bounded and distinct from SDK lifecycle codes', () => {
  expect(validateHostApiError({ code: 'permission_denied', message: 'Denied.' }).status).toBe('invalid');
  expect(validateHostApiError({ code: 'transport_failure', message: 'Wrong layer.' }).status).toBe('invalid');
  expect(validateHostApiError({ code: 'internal_error', message: 'x'.repeat(513) }).status).toBe('invalid');
});
