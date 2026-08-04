import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@rstest/core';
import { parseLocalPluginInstallationError, parseLocalPluginInstallationResult } from '../src/app/plugins/installation';

interface Fixture {
  readonly name: string;
  readonly type: 'result' | 'error';
  readonly value: unknown;
}

const readFixtures = (kind: 'valid' | 'invalid'): Fixture[] =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../fixtures/plugin-local-installation/${kind}/cases.json`, import.meta.url)),
      'utf8',
    ),
  ) as Fixture[];

const parse = (fixture: Fixture) =>
  fixture.type === 'result'
    ? parseLocalPluginInstallationResult(fixture.value)
    : parseLocalPluginInstallationError(fixture.value);

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
});
