import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, test } from '@rstest/core';

import { findGate, migrationInventory, ROOT_SCRIPT_POLICY, validationRegistry } from '../scripts/validation/catalog.ts';
import { planGates, validateRegistry } from '../scripts/validation/runner.ts';

const root = resolve(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const rootScripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

const markdownFiles = (directory: string): string[] =>
  readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name));

describe('validation Gate governance', () => {
  test('keeps the root script surface equal to the semantic policy', () => {
    expect(Object.keys(rootScripts).sort()).toEqual(Object.keys(ROOT_SCRIPT_POLICY).sort());
    for (const [name, command] of Object.entries(rootScripts)) {
      expect(command, name).not.toContain('&&');
      expect(command, name).not.toMatch(/\bpnpm run (?:check|test|run|refresh|evidence|generate|ci):/u);
    }
    expect(
      Object.keys(rootScripts).filter((name) => /^(?:check|run|refresh|evidence|generate|ci):/u.test(name)),
    ).toEqual([]);
    expect(Object.keys(rootScripts).filter((name) => name.startsWith('test:'))).toEqual(['test:watch']);
    expect(rootScripts).not.toHaveProperty('check:validation-governance');
  });

  test('classifies every legacy root entry without keeping a compatibility alias', () => {
    const inventory = migrationInventory();
    expect(inventory).toHaveLength(
      Object.keys(
        (JSON.parse(read('scripts/validation/migration-baseline.json')) as { rootScripts: object }).rootScripts,
      ).length,
    );
    for (const entry of inventory) {
      if (
        entry.destinationId !== undefined &&
        (entry.disposition === 'dispatcher' || entry.disposition === 'renamed')
      ) {
        const isTarget =
          validationRegistry.generateTargets.some((target) => target.id === entry.destinationId) ||
          validationRegistry.evidenceTargets.some((target) => target.id === entry.destinationId);
        const isRootLifecycle = Object.hasOwn(rootScripts, entry.destinationId);
        expect(findGate(entry.destinationId) !== undefined || isTarget || isRootLifecycle, entry.legacyName).toBe(true);
      }
      if (entry.disposition !== 'lifecycle' && entry.disposition !== 'internal') {
        expect(rootScripts, entry.legacyName).not.toHaveProperty(entry.legacyName);
      }
    }
    expect(findGate('plugin-rpc-validation')).toBeDefined();
    expect(findGate('plugin-child-webview-delivery')).toBeDefined();
    expect(findGate('official-config-lens-cold-open-delivery')).toBeDefined();
    expect(findGate('plugin-pointer-cursor')).toBeDefined();
    expect(inventory.find((entry) => entry.legacyName === 'check:fix')).toMatchObject({
      destinationId: 'fix',
      disposition: 'renamed',
    });
  });

  test('keeps Gate IDs stable, the graph valid, and migrated plans non-empty', () => {
    expect(() => validateRegistry(validationRegistry)).not.toThrow();
    for (const gate of validationRegistry.gates) {
      expect(gate.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(gate.id).not.toContain('consolidate-validation-gate-governance');
      const plan = planGates(validationRegistry, [gate.id]);
      expect(plan.gateIds.at(-1)).toBe(gate.id);
      expect(plan.steps.length, gate.id).toBeGreaterThan(0);
    }
  });

  test('preserves the root test lifecycle template preparation in the CI Gate', () => {
    const descriptions = planGates(validationRegistry, ['ci-lensx-test']).steps.map((step) => step.description);
    expect(descriptions).toEqual([
      'pnpm --dir packages/plugin-cli run build',
      'LENSX_TEMPLATE_MODULE_GRAPH=1 LENSX_VALIDATION_STAGE=ci-lensx-test pnpm --dir examples/plugins/framework-neutral run build',
      'LENSX_TEMPLATE_MODULE_GRAPH=1 LENSX_VALIDATION_STAGE=ci-lensx-test pnpm --dir examples/plugins/react-semi run build',
      'rstest',
    ]);
  });

  test('does not de-duplicate artifact preparation across invalidating Gate stages', () => {
    const descriptions = planGates(validationRegistry, [
      'ci-lensx-test',
      'plugin-project-template-external',
      'plugin-project-template-runtime',
    ]).steps.map((step) => step.description);
    for (const template of ['framework-neutral', 'react-semi']) {
      const builds = descriptions.filter(
        (description) =>
          description.includes(`examples/plugins/${template} run build`) && description.includes('MODULE_GRAPH'),
      );
      expect(builds).toEqual([
        `LENSX_TEMPLATE_MODULE_GRAPH=1 LENSX_VALIDATION_STAGE=ci-lensx-test pnpm --dir examples/plugins/${template} run build`,
        `LENSX_TEMPLATE_MODULE_GRAPH=1 pnpm --dir examples/plugins/${template} run build`,
      ]);
    }
  });

  test('keeps native Child WebView APIs inside the product adapter or feature-gated evidence harness', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/check-plugin-child-webview-spike.ts'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  test('resolves every maintained documentation dispatcher reference', () => {
    const files = [...markdownFiles('docs/en'), ...markdownFiles('docs/zh')];
    const retiredDocumentationCommands = migrationInventory().filter(
      (entry) =>
        entry.disposition === 'dispatcher' || entry.disposition === 'renamed' || entry.disposition === 'removed',
    );
    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/pnpm run gate -- ([a-z0-9][a-z0-9-]*)/gu)) {
        expect(findGate(match[1] ?? ''), path).toBeDefined();
      }
      for (const match of source.matchAll(/pnpm run (generate|evidence) -- ([a-z0-9][a-z0-9-]*)/gu)) {
        const targets =
          match[1] === 'generate' ? validationRegistry.generateTargets : validationRegistry.evidenceTargets;
        expect(
          targets.some((target) => target.id === match[2]),
          path,
        ).toBe(true);
      }
      expect(source, path).not.toMatch(/pnpm run (?:check|run|refresh|evidence|generate|ci):/u);
      for (const entry of retiredDocumentationCommands) {
        expect(source, `${path}: ${entry.legacyName}`).not.toContain(`pnpm run ${entry.legacyName}`);
      }
    }
  });

  test('keeps English and Chinese documentation paths and top-level titles aligned', () => {
    const english = markdownFiles('docs/en')
      .map((path) => path.slice(join(root, 'docs/en').length + 1))
      .sort();
    const chinese = markdownFiles('docs/zh')
      .map((path) => path.slice(join(root, 'docs/zh').length + 1))
      .sort();
    expect(chinese).toEqual(english);
    for (const relativePath of english) {
      const englishPath = join(root, 'docs/en', relativePath);
      const chinesePath = join(root, 'docs/zh', relativePath);
      expect(existsSync(chinesePath), relativePath).toBe(true);
      expect(readFileSync(englishPath, 'utf8')).toMatch(/^# /u);
      expect(readFileSync(chinesePath, 'utf8')).toMatch(/^# /u);
    }
  });
});
