import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@rstest/core';
import {
  createLocalPluginInstallationRequest,
  parseLocalPluginInstallationError,
  parseLocalPluginInstallationResult,
} from '../src/app/plugins/installation';

interface Fixture {
  readonly name: string;
  readonly type: 'request' | 'result' | 'error';
  readonly value: unknown;
}

const readFixtures = (kind: 'valid' | 'invalid'): Fixture[] =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../fixtures/plugin-local-installation/${kind}/cases.json`, import.meta.url)),
      'utf8',
    ),
  ) as Fixture[];

const parse = (fixture: Fixture) => {
  if (fixture.type === 'result') return parseLocalPluginInstallationResult(fixture.value);
  if (fixture.type === 'error') return parseLocalPluginInstallationError(fixture.value);
  const value = fixture.value as { preparation_token?: unknown };
  if (
    typeof value.preparation_token !== 'string' ||
    Object.keys(value).some((key) => !['contract_version', 'preparation_token'].includes(key)) ||
    (value as { contract_version?: unknown }).contract_version !== '0.2.0'
  )
    throw new TypeError();
  return createLocalPluginInstallationRequest(value.preparation_token);
};

describe('local plugin installation contract', () => {
  test.each(readFixtures('valid'))('accepts shared valid fixture $name', (fixture) => {
    expect(() => parse(fixture)).not.toThrow();
  });

  test.each(readFixtures('invalid'))('rejects shared invalid fixture $name', (fixture) => {
    expect(() => parse(fixture)).toThrow(TypeError);
  });

  test('returns detached deeply frozen values', () => {
    const fixture = readFixtures('valid').find(({ name }) => name === 'installed');
    expect(fixture).toBeDefined();
    const input = structuredClone(fixture?.value) as { plugin_id: string };
    const result = parseLocalPluginInstallationResult(input);

    input.plugin_id = 'com.attacker.changed';
    expect(result.status).toBe('installed');
    if (result.status === 'installed') {
      expect(result.plugin_id).toBe('com.acme.workspace');
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  test('keeps prepared candidate detached, deeply frozen, and minimally disclosed', () => {
    const fixture = readFixtures('valid').find(({ name }) => name === 'prepared');
    const input = structuredClone(fixture?.value) as { candidate: { display_name: { 'en-US': string } } };
    const result = parseLocalPluginInstallationResult(input);
    input.candidate.display_name['en-US'] = 'Changed';
    expect(result.status).toBe('prepared');
    if (result.status === 'prepared') {
      expect(result.candidate.display_name['en-US']).toBe('Workspace');
      expect(Object.isFrozen(result.candidate.requested_permissions)).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(
        /path|digest|package_bytes|staging|manifest|grant|raw_error|stack|host_object/u,
      );
    }
  });
});
