import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@rstest/core';

import { findGate, isProhibitedEnvironmentCommand, validationRegistry } from '../scripts/validation/catalog.ts';
import { executePlan, executeWritableTarget, planGates, validateRegistry } from '../scripts/validation/runner.ts';
import type { ValidationRegistry, ValidationStep } from '../scripts/validation/types.ts';
import { discoverWorkspaceMembers, selectWorkspaceBuildOrder } from '../scripts/workspace-lifecycle.ts';

const step = (id: string, environment: Readonly<Record<string, string>> = {}): ValidationStep => ({
  id,
  description: id,
  executable: 'node',
  argv: ['--version'],
  cwd: 'fixtures',
  environment,
  platform: 'any',
  safety: {
    readOnly: true,
    writesCommittedArtifacts: false,
  },
});

const registry = (gates: ValidationRegistry['gates'], steps: ValidationRegistry['steps'] = []): ValidationRegistry => ({
  gates,
  steps,
  generateTargets: [],
});

describe('validation Gate registry and runner', () => {
  test('accepts the maintained registry and plans an empty request', () => {
    expect(() => validateRegistry(validationRegistry)).not.toThrow();
    expect(planGates(validationRegistry, [])).toEqual({ requestedGateIds: [], gateIds: [], steps: [] });
  });

  test('resolves the development launcher Gate through stable capability dependencies', () => {
    const plan = planGates(validationRegistry, ['development-launcher']);
    expect(plan.gateIds).toContain('frame-aware-webview-navigation-policy');
    expect(plan.gateIds).toContain('plugin-development-mode');
    expect(plan.gateIds).toContain('plugin-child-webview-runtime');
    expect(plan.gateIds.at(-1)).toBe('development-launcher');
    expect(plan.steps.every((item) => item.safety.readOnly)).toBe(true);
  });

  test('plans launcher input focus with structured commands and shared native dependencies', () => {
    const gate = findGate('launcher-input-focus');
    expect(gate?.description).toBe(
      'Committed launcher input, IME keyboard priority, and native responder preservation',
    );
    expect(gate?.dependsOn).toEqual([
      'frame-aware-navigation-dependency-drift',
      'plugin-child-webview-window-lifecycle',
    ]);
    const plan = planGates(validationRegistry, ['launcher-input-focus']);
    expect(plan.gateIds).toEqual([
      'frame-aware-navigation-dependency-drift',
      'plugin-child-webview-window-lifecycle',
      'launcher-input-focus',
    ]);
    const nativeWindowTests = plan.steps.filter(
      (item) =>
        item.executable === 'cargo' &&
        item.argv.join(' ') === 'test --manifest-path src-tauri/Cargo.toml launcher_window',
    );
    expect(nativeWindowTests).toHaveLength(1);
    expect(
      plan.steps.filter(
        (item) => item.executable === 'cargo' && item.argv.join(' ') === 'check --manifest-path src-tauri/Cargo.toml',
      ),
    ).toHaveLength(1);
    const policies = plan.steps.filter((item) => item.argv.includes('scripts/tao-policy-tests.ts'));
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      executable: 'node',
      argv: ['--experimental-strip-types', 'scripts/tao-policy-tests.ts'],
      cwd: '.',
      environment: {},
      platform: 'any',
      safety: { readOnly: true, writesCommittedArtifacts: false },
    });
    const focused = plan.steps.find(
      (item) => item.executable === 'pnpm' && item.argv.includes('tests/launcher-input-focus-ui.test.tsx'),
    );
    expect(focused?.argv.slice(0, 3)).toEqual(['exec', 'rstest', 'run']);
    expect(focused?.argv).toContain('tests/frame-aware-navigation-dependency-drift.test.ts');
    expect(focused?.argv).toContain('tests/launcher-action-search-ui.test.tsx');
    expect(plan.steps.every((item) => item.safety.readOnly && !item.safety.writesCommittedArtifacts)).toBe(true);
  });

  test('adds strict Tao compilation and complete vendor formatting through the existing dependency Gate', () => {
    const plan = planGates(validationRegistry, ['frame-aware-navigation-dependency-drift', 'launcher-input-focus']);
    const strict = plan.steps.filter((item) => item.executable === 'cargo' && item.argv[0] === 'rustc');
    expect(strict).toHaveLength(1);
    expect(strict[0]).toMatchObject({
      argv: [
        'rustc',
        '--locked',
        '--manifest-path',
        'src-tauri/Cargo.toml',
        '-p',
        'tao',
        '--lib',
        '--',
        '-D',
        'warnings',
      ],
      platform: 'darwin',
      environment: {},
    });
    const graph = plan.steps.filter((item) => item.argv.includes('scripts/tao-dependency-graph.ts'));
    expect(graph).toHaveLength(1);
    expect(graph[0]?.platform).toBe('darwin');
    expect(plan.steps.indexOf(graph[0] as ValidationStep)).toBeLessThan(
      plan.steps.indexOf(strict[0] as ValidationStep),
    );
    const format = plan.steps.filter((item) => item.executable === 'rustfmt');
    expect(format).toHaveLength(2);
    const taoFormat = format.find((item) => item.argv.includes('vendor/frame-aware-navigation/tao/src/window.rs'));
    const wryFormat = format.find((item) =>
      item.argv.includes('vendor/frame-aware-navigation/wry/src/wkwebview/class/key_equivalent.rs'),
    );
    expect(wryFormat).toMatchObject({
      argv: [
        '--config-path',
        'scripts/validation/vendor-rustfmt.toml',
        '--check',
        'vendor/frame-aware-navigation/wry/src/wkwebview/class/mod.rs',
        'vendor/frame-aware-navigation/wry/src/wkwebview/class/wry_web_view.rs',
        'vendor/frame-aware-navigation/wry/src/wkwebview/class/key_equivalent.rs',
      ],
      platform: 'any',
    });
    expect(plan.steps.filter((item) => item.argv.includes('scripts/wry-policy-tests.ts'))).toHaveLength(1);
    const reviewedSources = [
      ...readFileSync(
        new URL('../scripts/frame-aware-navigation-dependency-drift.ts', import.meta.url),
        'utf8',
      ).matchAll(/^\s*'tao\/([^']+\.rs)'/gmu),
    ].map((match) => `vendor/frame-aware-navigation/tao/${match[1]}`);
    expect(reviewedSources).toHaveLength(15);
    expect(taoFormat).toMatchObject({
      argv: ['--edition', '2021', '--config', 'tab_spaces=2', '--check', ...reviewedSources],
      platform: 'any',
    });
    expect(plan.steps.filter((item) => item.argv.includes('scripts/tao-policy-tests.ts'))).toHaveLength(1);
    expect(plan.steps.every((item) => item.safety.readOnly && !item.safety.writesCommittedArtifacts)).toBe(true);
    expect(
      plan.steps.some((item) => item.argv.includes('--write') || isProhibitedEnvironmentCommand(item.description)),
    ).toBe(false);
  });

  test.each(['linux', 'win32', 'darwin'] as const)('enforces explicit Tao step platform metadata on %s', (platform) => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    if (!original) throw new Error('process.platform descriptor is required');
    const maintenance = planGates(validationRegistry, ['frame-aware-navigation-dependency-drift']);
    const strict = maintenance.steps.filter((item) => item.executable === 'cargo' && item.argv[0] === 'rustc');
    const portable = maintenance.steps.filter(
      (item) =>
        item.executable === 'rustfmt' ||
        item.argv.includes('scripts/tao-policy-tests.ts') ||
        item.argv.includes('scripts/wry-policy-tests.ts'),
    );
    try {
      Object.defineProperty(process, 'platform', { ...original, value: platform });
      let calls = 0;
      const run = () => {
        calls += 1;
        return { status: 0 };
      };
      const strictPlan = { ...maintenance, steps: strict };
      if (platform === 'darwin') {
        expect(() => executePlan(strictPlan, '/repo', run)).not.toThrow();
        expect(calls).toBe(1);
      } else {
        expect(() => executePlan(strictPlan, '/repo', run)).toThrow('[validation/platform]');
        expect(calls).toBe(0);
      }
      expect(portable).toHaveLength(4);
      expect(() => executePlan({ ...maintenance, steps: portable }, '/repo', run)).not.toThrow();
      expect(calls).toBe(platform === 'darwin' ? 5 : 4);
    } finally {
      Object.defineProperty(process, 'platform', original);
    }
  });

  test('prepares public package output before launcher focus dependency UI tests', () => {
    const members = discoverWorkspaceMembers(fileURLToPath(new URL('..', import.meta.url)));
    const contract = members.filter((member) => member.relativePath === 'packages/plugin-contract');
    const expected = selectWorkspaceBuildOrder(members, contract).map((member) => member.relativePath);
    expect(expected).toEqual(['packages/plugin-contract']);
    const plan = planGates(validationRegistry, [
      'launcher-input-focus',
      'plugin-child-webview-window-lifecycle',
      'ci-lensx-typecheck',
    ]);
    const builds = plan.steps.filter(
      (item) => item.executable === 'pnpm' && item.argv.join(' ') === '--dir packages/plugin-contract run build',
    );
    expect(builds).toHaveLength(1);
    const [build] = builds;
    if (build === undefined) throw new Error('Contract build preparation is required');
    expect(build.environment).toEqual({});
    const buildIndex = plan.steps.indexOf(build);
    const uiTestIndex = plan.steps.findIndex((item) => item.argv.includes('tests/plugin-runtime-slot.test.tsx'));
    expect(buildIndex).toBeLessThan(uiTestIndex);
    expect(buildIndex).toBeLessThan(
      plan.steps.findIndex((item) => item.argv.includes('tests/launcher-input-focus-ui.test.tsx')),
    );
    expect(plan.steps.some((item) => item.argv.includes('--store-dir'))).toBe(false);
    expect(plan.steps.some((item) => item.argv.includes('install'))).toBe(false);
  });

  test('keeps the launcher focus integrity baseline read-only and Generate separate', () => {
    const plan = planGates(validationRegistry, ['launcher-input-focus']);
    const drift = plan.steps.filter((item) => item.argv.includes('scripts/frame-aware-navigation-dependency-drift.ts'));
    expect(drift).toHaveLength(1);
    expect(drift[0]?.argv).toEqual([
      '--experimental-strip-types',
      'scripts/frame-aware-navigation-dependency-drift.ts',
    ]);
    expect(plan.steps.some((item) => item.argv.includes('--write') || item.argv.includes('generate'))).toBe(false);
    const generate = validationRegistry.generateTargets.find(
      (target) => target.id === 'frame-aware-navigation-dependency-drift',
    );
    expect(generate?.steps[0]?.argv).toContain('--write');
    expect(generate?.steps[0]?.safety).toEqual({ readOnly: false, writesCommittedArtifacts: true });
  });

  test('uses stable topology and de-duplicates shared Gates and steps', () => {
    const shared = step('shared');
    const left = step('left');
    const right = step('right');
    const fixture = registry(
      [
        { id: 'root', description: 'root', dependsOn: ['left', 'right'], steps: ['shared'] },
        { id: 'left', description: 'left', dependsOn: ['base'], steps: ['left', 'shared'] },
        { id: 'right', description: 'right', dependsOn: ['base'], steps: ['right', 'shared'] },
        { id: 'base', description: 'base', dependsOn: [], steps: ['shared'] },
      ],
      [shared, left, right],
    );

    const plan = planGates(fixture, ['root']);
    expect(plan.gateIds).toEqual(['base', 'left', 'right', 'root']);
    expect(plan.steps.map((item) => item.id)).toEqual(['shared', 'left', 'right']);
  });

  test('fails closed for unknown, missing, duplicate, and cyclic graph entries', () => {
    expect(() => planGates(registry([], []), ['missing'])).toThrow('[validation/unknown-gate] missing');
    expect(() =>
      validateRegistry(
        registry([
          { id: 'same', description: 'one', dependsOn: [], steps: [] },
          { id: 'same', description: 'two', dependsOn: [], steps: [] },
        ]),
      ),
    ).toThrow('[validation/duplicate-gate] same');
    expect(() =>
      validateRegistry(registry([{ id: 'root', description: 'root', dependsOn: ['missing'], steps: [] }])),
    ).toThrow('[validation/missing-gate-dependency] root -> missing');
    expect(() =>
      validateRegistry(registry([{ id: 'root', description: 'root', dependsOn: [], steps: ['missing'] }])),
    ).toThrow('[validation/missing-step] root -> missing');
    expect(() =>
      validateRegistry(
        registry([
          { id: 'left', description: 'left', dependsOn: ['right'], steps: [] },
          { id: 'right', description: 'right', dependsOn: ['left'], steps: [] },
        ]),
      ),
    ).toThrow('[validation/gate-cycle]');
  });

  test('passes cwd and environment and stops at launch or non-zero failures', () => {
    const first = step('first', { VALIDATION_FIXTURE: 'yes' });
    const second = step('second');
    const plan = planGates(
      registry([{ id: 'sample', description: 'sample', dependsOn: [], steps: ['first', 'second'] }], [first, second]),
      ['sample'],
    );
    const observed: string[] = [];
    expect(() =>
      executePlan(plan, '/repo', (item, root) => {
        observed.push(`${root}:${item.cwd}:${item.environment.VALIDATION_FIXTURE ?? ''}`);
        return { status: item.id === 'second' ? 7 : 0 };
      }),
    ).toThrow(/step=second status=7/u);
    expect(observed).toEqual(['/repo:fixtures:yes', '/repo:fixtures:']);

    expect(() => executePlan(plan, '/repo', () => ({ error: new Error('missing executable'), status: null }))).toThrow(
      /launch-failed.*missing executable/u,
    );
  });

  test.each([
    { readOnly: false, writesCommittedArtifacts: true },
    { readOnly: true, writesCommittedArtifacts: true },
    { readOnly: false, writesCommittedArtifacts: false },
  ])('rejects unsafe Gate metadata %o before starting any command', (safety) => {
    const unsafe = { ...step('unsafe'), safety };
    let calls = 0;
    expect(() =>
      executePlan(
        planGates(registry([{ id: 'focus', description: 'focus', dependsOn: [], steps: ['unsafe'] }], [unsafe]), [
          'focus',
        ]),
        '/repo',
        () => ({ status: ++calls }),
      ),
    ).toThrow('[validation/unsafe-gate-step] unsafe');
    expect(calls).toBe(0);
  });

  test.each([
    { executable: 'cargo', argv: ['run', '--example', 'native_harness'] },
    { executable: 'node', argv: ['scripts/verify-visual.mjs'] },
    { executable: 'open', argv: ['Product.app'] },
  ])('rejects prohibited structured Gate commands %o before starting any command', (command) => {
    const unsafe = { ...step('environment'), ...command };
    let calls = 0;
    expect(() =>
      executePlan(
        planGates(registry([{ id: 'focus', description: 'focus', dependsOn: [], steps: ['environment'] }], [unsafe]), [
          'focus',
        ]),
        '/repo',
        () => ({ status: ++calls }),
      ),
    ).toThrow('[validation/prohibited-environment-command] environment');
    expect(calls).toBe(0);
  });

  test('classifies executable arguments without treating explanatory descriptions as commands', () => {
    const safe = { ...step('safe'), description: 'Deterministic evidence for the native policy' };
    expect(() =>
      validateRegistry(registry([{ id: 'focus', description: 'focus', dependsOn: [], steps: ['safe'] }], [safe])),
    ).not.toThrow();
  });

  test('requires explicit write authorization before Generate starts', () => {
    let calls = 0;
    const target = { id: 'fixture', description: 'fixture', platform: 'any' as const, steps: [step('write')] };
    expect(() => executeWritableTarget(target, '/repo', false, () => ({ status: ++calls }))).toThrow(
      '[validation/write-required]',
    );
    expect(calls).toBe(0);
  });

  test.each([
    'node scripts/verify-visual.mjs',
    'cargo run --example native_harness',
    'node scripts/write-evidence.ts',
    'rsbuild preview',
    'open Product.app',
  ])('classifies %s as prohibited environment validation', (command) => {
    expect(isProhibitedEnvironmentCommand(command)).toBe(true);
  });

  test.each([
    'rstest',
    'cargo test --manifest-path src-tauri/Cargo.toml',
    'biome check .',
    'tsc --noEmit',
    'rsbuild build',
    'pnpm --dir packages/plugin-ui run test:pack',
  ])('allows deterministic command %s', (command) => {
    expect(isProhibitedEnvironmentCommand(command)).toBe(false);
  });
});
