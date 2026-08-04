import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@rstest/core';
import {
  parseCancelPluginReplacementRequest,
  parseCommitPluginReplacementRequest,
  parsePluginReplacementError,
  parsePluginReplacementResult,
  parsePreparePluginReplacementRequest,
} from '../src/app/plugins/replacement';

interface Fixture {
  readonly name: string;
  readonly type: 'prepare_request' | 'commit_request' | 'cancel_request' | 'result' | 'error';
  readonly value: unknown;
}
const fixtures = (kind: 'valid' | 'invalid'): Fixture[] =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../fixtures/plugin-replacement/${kind}/cases.json`, import.meta.url)), 'utf8'),
  ) as Fixture[];
const parse = ({ type, value }: Fixture) =>
  ({
    prepare_request: parsePreparePluginReplacementRequest,
    commit_request: parseCommitPluginReplacementRequest,
    cancel_request: parseCancelPluginReplacementRequest,
    result: parsePluginReplacementResult,
    error: parsePluginReplacementError,
  })[type](value);

describe('plugin replacement private contract', () => {
  test.each(fixtures('valid'))('accepts shared fixture $name', (fixture) => expect(() => parse(fixture)).not.toThrow());
  test.each(fixtures('invalid'))('rejects shared fixture $name', (fixture) =>
    expect(() => parse(fixture)).toThrow(TypeError));
  test('returns detached deeply frozen permission differences', () => {
    const input = structuredClone(fixtures('valid').find(({ name }) => name === 'prepared')?.value) as {
      added_permission_ids: string[];
    };
    const result = parsePluginReplacementResult(input);
    input.added_permission_ids.push('attacker.permission');
    expect(result.status).toBe('prepared');
    if (result.status === 'prepared') {
      expect(result.added_permission_ids).toEqual(['lensx.network.read']);
      expect(Object.isFrozen(result.added_permission_ids)).toBe(true);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });
});
