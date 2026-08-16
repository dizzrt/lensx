import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  type IncompatiblePluginManifestValidationResult,
  type InvalidPluginManifestValidationResult,
  normalizePluginManifest,
  type PluginHostVersions,
  type PluginManifestDiagnostic,
  type PluginManifestNormalizationResult,
  resolvePluginManifestText,
  validatePluginManifest,
} from '../src/index.js';

interface FixtureMutation {
  readonly op: 'remove' | 'set';
  readonly path: string;
  readonly value?: unknown;
}

interface FixtureCase {
  readonly name: string;
  readonly current_versions?: PluginHostVersions;
  readonly input?: unknown;
  readonly mutations?: readonly FixtureMutation[];
  readonly expected_status?: 'compatible' | 'incompatible';
  readonly expected_diagnostics?: readonly Pick<PluginManifestDiagnostic, 'code' | 'path'>[];
  readonly expected_normalized?: unknown;
}

const fixtureRoot = resolve(import.meta.dirname, 'fixtures');
const defaultVersions: PluginHostVersions = {
  lensx: '0.1.0',
  host_api: '0.2.0',
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const baseManifest = readJson<unknown>(resolve(fixtureRoot, 'base.json'));

const evaluateManifest = (
  input: unknown,
  currentVersions: PluginHostVersions,
):
  | InvalidPluginManifestValidationResult
  | IncompatiblePluginManifestValidationResult
  | PluginManifestNormalizationResult => {
  const validation = validatePluginManifest(input);
  return validation.status === 'valid' ? normalizePluginManifest(validation, currentVersions) : validation;
};

const decodePointer = (path: string): string[] =>
  path
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));

const applyMutations = (input: unknown, mutations: readonly FixtureMutation[]): unknown => {
  const output = cloneJson(input) as Record<string, unknown>;
  for (const mutation of mutations) {
    const segments = decodePointer(mutation.path);
    const key = segments.pop();
    if (key === undefined) {
      throw new TypeError('Fixture mutation cannot target the document root.');
    }
    let target: Record<string, unknown> | unknown[] = output;
    for (const segment of segments) {
      target = (target as Record<string, Record<string, unknown> | unknown[]>)[segment];
    }
    if (mutation.op === 'remove') {
      if (Array.isArray(target)) {
        target.splice(Number(key), 1);
      } else {
        delete target[key];
      }
    } else if (Array.isArray(target)) {
      target[Number(key)] = cloneJson(mutation.value);
    } else {
      target[key] = cloneJson(mutation.value);
    }
  }
  return output;
};

const loadCases = (category: string): readonly FixtureCase[] =>
  readJson<FixtureCase[]>(resolve(fixtureRoot, category, 'cases.json'));

const fixtureInput = (fixture: FixtureCase): unknown =>
  fixture.input ?? applyMutations(baseManifest, fixture.mutations ?? []);

describe('plugin Manifest 0.2.0 shared contract fixtures', () => {
  for (const category of ['valid', 'incompatible'] as const) {
    for (const fixture of loadCases(category)) {
      test(`${category}: ${fixture.name}`, () => {
        const result = evaluateManifest(fixtureInput(fixture), fixture.current_versions ?? defaultVersions);

        expect(result.status).toBe(fixture.expected_status);
        expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual(
          fixture.expected_diagnostics ?? [],
        );
        expect(result.status).not.toBe('invalid');
      });
    }
  }

  for (const fixture of loadCases('invalid')) {
    test(`invalid: ${fixture.name}`, () => {
      const result = evaluateManifest(fixtureInput(fixture), fixture.current_versions ?? defaultVersions);

      expect(result.status).toBe('invalid');
      expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual(fixture.expected_diagnostics);
      expect(result.diagnostics).toEqual(
        [...result.diagnostics].sort(
          (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
        ),
      );
    });
  }

  for (const fixture of loadCases('normalized')) {
    test(`normalized: ${fixture.name}`, () => {
      const input = fixtureInput(fixture);
      const original = cloneJson(input);
      const result = evaluateManifest(input, fixture.current_versions ?? defaultVersions);

      expect(result.status).toBe(fixture.expected_status);
      expect(input).toEqual(original);
      if (!('manifest' in result)) {
        throw new TypeError('Normalized fixture unexpectedly failed validation.');
      }
      expect(result.manifest).toEqual(fixture.expected_normalized);
      expect(resolvePluginManifestText(result.manifest.display.name, 'zh-CN')).toBe(
        result.manifest.display.name['en-US'],
      );
    });
  }
});

test('Action keywords remain scoped to their owning Action', () => {
  const result = evaluateManifest(baseManifest, defaultVersions);
  if (!('manifest' in result)) {
    throw new TypeError('Base fixture unexpectedly failed validation.');
  }

  expect(result.manifest.contributes.actions[0]?.default_keywords).toEqual({
    'en-US': ['open workspace', 'open folder'],
    'zh-CN': ['打开工作区', '打开文件夹'],
  });
  expect('default_keywords' in result.manifest.display).toBe(false);
});

test('normalization cannot be reached with an ordinary object or forged failure result', () => {
  expect(() =>
    normalizePluginManifest({ status: 'valid', value: baseManifest, diagnostics: [] } as never, defaultVersions),
  ).toThrow('requires a successful validatePluginManifest result');
  expect(() => normalizePluginManifest({ status: 'invalid', diagnostics: [] } as never, defaultVersions)).toThrow(
    'requires a successful validatePluginManifest result',
  );
});

test('validation snapshots the accepted value before normalization', () => {
  const input = cloneJson(baseManifest) as Record<string, unknown>;
  const validation = validatePluginManifest(input);
  expect(validation.status).toBe('valid');
  if (validation.status !== 'valid') {
    throw new TypeError('Base fixture unexpectedly failed validation.');
  }

  input.plugin_id = 'com.changed.after-validation';
  const result = normalizePluginManifest(validation, defaultVersions);
  expect(result.manifest.plugin_id).toBe('com.acme.workspace');
});
