import { describe, expect, test } from '@rstest/core';
import invalidCases from '../fixtures/plugin-registration-contract/invalid/cases.json';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import {
  parsePluginRegistrationChangedEvent,
  parsePluginRegistrationDetailResponse,
  parsePluginRegistrationQueryError,
  parsePluginRegistrationSnapshot,
} from '../src/app/plugins/registration';

type FixtureType = 'snapshot' | 'detail' | 'error' | 'event';

const parsers = {
  detail: parsePluginRegistrationDetailResponse,
  error: parsePluginRegistrationQueryError,
  event: parsePluginRegistrationChangedEvent,
  snapshot: parsePluginRegistrationSnapshot,
} satisfies Record<FixtureType, (value: unknown) => unknown>;

const validByName = new Map(validCases.map((fixture) => [fixture.name, fixture]));

const setPointer = (value: unknown, pointer: string, replacement: unknown): void => {
  const segments = pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  let target = value as Record<string, unknown> | unknown[];
  for (const segment of segments.slice(0, -1)) {
    target = (target as Record<string, unknown>)[segment] as Record<string, unknown> | unknown[];
  }
  const finalSegment = segments.at(-1);
  if (finalSegment === undefined) {
    throw new TypeError('Fixture JSON Pointer must not be empty.');
  }
  (target as Record<string, unknown>)[finalSegment] = structuredClone(replacement);
};

const recursivelyFrozen = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(recursivelyFrozen);
};

describe('Plugin Registration Contract fixtures', () => {
  test.each(validCases)('accepts shared valid fixture $name', (fixture) => {
    const parsed = parsers[fixture.type as FixtureType](fixture.value);

    expect(parsed).toEqual(fixture.value);
    expect(recursivelyFrozen(parsed)).toBe(true);
  });

  test.each(invalidCases)('rejects shared invalid fixture $name', (fixture) => {
    const base = validByName.get(fixture.base);
    expect(base).toBeDefined();
    const value = structuredClone(base?.value);
    for (const [pointer, replacement] of Object.entries(fixture.set)) {
      setPointer(value, pointer, replacement);
    }

    expect(() => parsers[fixture.type as FixtureType](value)).toThrow(TypeError);
  });

  test('returns detached values that callers cannot mutate', () => {
    const fixture = validByName.get('healthy_detail');
    expect(fixture).toBeDefined();
    const input = structuredClone(fixture?.value) as { detail: { enabled: boolean } };
    const parsed = parsePluginRegistrationDetailResponse(input);

    input.detail.enabled = false;
    expect(parsed.detail.kind).toBe('registered');
    const parsedDetail = parsed.detail;
    if (parsedDetail.kind === 'registered') {
      expect(parsedDetail.enabled).toBe(true);
      expect(parsedDetail).not.toHaveProperty('granted_permission_ids');
    }
  });
});
