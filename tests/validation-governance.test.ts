import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, test } from '@rstest/core';

import {
  findGate,
  isProhibitedEnvironmentCommand,
  migrationInventory,
  ROOT_SCRIPT_POLICY,
  validationRegistry,
} from '../scripts/validation/catalog.ts';
import { planGates, validateRegistry } from '../scripts/validation/runner.ts';
import { discoverWorkspaceMembers } from '../scripts/workspace-lifecycle.ts';

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
    expect(rootScripts).not.toHaveProperty('evidence');
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
        const isTarget = validationRegistry.generateTargets.some((target) => target.id === entry.destinationId);
        const isRootLifecycle = Object.hasOwn(rootScripts, entry.destinationId);
        expect(findGate(entry.destinationId) !== undefined || isTarget || isRootLifecycle, entry.legacyName).toBe(true);
      }
      if (entry.disposition !== 'lifecycle' && entry.disposition !== 'internal') {
        expect(rootScripts, entry.legacyName).not.toHaveProperty(entry.legacyName);
      }
    }
    expect(findGate('plugin-rpc-validation')).toBeDefined();
    expect(findGate('plugin-child-webview-delivery')).toBeDefined();
    expect(findGate('official-config-lens-cold-open-delivery')).toBeUndefined();
    expect(findGate('plugin-pointer-cursor')).toBeUndefined();
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
      'pnpm --dir packages/plugin-contract run build',
      'pnpm --dir packages/plugin-cli run build',
      'pnpm --dir packages/plugin-sdk run build',
      'pnpm --dir packages/plugin-testkit run build',
      'LENSX_TEMPLATE_MODULE_GRAPH=1 LENSX_VALIDATION_STAGE=ci-lensx-test pnpm --dir examples/plugins/framework-neutral run build',
      'pnpm --dir packages/plugin-ui run build',
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

  test('keeps maintained validation deterministic and removes environment entry points', () => {
    for (const step of validationRegistry.steps) {
      expect(isProhibitedEnvironmentCommand(step.description), step.description).toBe(false);
      expect(step.safety.readOnly, step.description).toBe(true);
      expect(step.safety.writesCommittedArtifacts, step.description).toBe(false);
    }
    for (const target of validationRegistry.generateTargets) {
      for (const step of target.steps) {
        expect(isProhibitedEnvironmentCommand(step.description), target.id).toBe(false);
        expect(step.safety.writesCommittedArtifacts, target.id).toBe(true);
      }
    }
    expect(validationRegistry.generateTargets.map((target) => target.id)).toEqual([
      'frame-aware-navigation-dependency-drift',
      'plugin-host-api-types',
      'plugin-manifest-types',
      'plugin-package-format-fixtures',
      'plugin-webview-runtime-fixtures',
    ]);
    for (const path of [
      'visual',
      'plugins/config-lens/visual',
      'packages/plugin-ui/visual',
      'examples/plugins/react-semi/visual',
      'src-tauri/src/config_lens_cold_open_harness.rs',
      'src-tauri/src/macos_accessory_evidence.rs',
    ]) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
  });

  test('keeps workspace lifecycle categories non-overlapping and environment-free', () => {
    for (const member of discoverWorkspaceMembers(root)) {
      const scripts = member.manifest.scripts ?? {};
      for (const lifecycle of ['build', 'typecheck', 'test', 'check']) {
        expect(scripts[lifecycle], `${member.relativePath}:${lifecycle}`).toBeDefined();
      }
      expect(scripts.check, member.relativePath).not.toMatch(/pnpm run (?:typecheck|test)\b/u);
      for (const [name, command] of Object.entries(scripts)) {
        expect(name, member.relativePath).not.toMatch(/visual|evidence|harness/iu);
        expect(isProhibitedEnvironmentCommand(`${name} ${command}`), `${member.relativePath}:${name}`).toBe(false);
      }
    }
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
      for (const match of source.matchAll(/pnpm run generate -- ([a-z0-9][a-z0-9-]*)/gu)) {
        const targets = validationRegistry.generateTargets;
        expect(
          targets.some((target) => target.id === match[1]),
          path,
        ).toBe(true);
      }
      expect(source, path).not.toMatch(/pnpm run (?:check|run|refresh|evidence|generate|ci):/u);
      expect(source, path).not.toMatch(/pnpm run evidence\b/u);
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
