import { describe, expect, test } from '@rstest/core';

import { validationRegistry } from '../scripts/validation/catalog.ts';
import { executePlan, executeWritableTarget, planGates, validateRegistry } from '../scripts/validation/runner.ts';
import type { ValidationRegistry, ValidationStep } from '../scripts/validation/types.ts';

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
    launchesBrowser: false,
    launchesNativeApp: false,
    writesCommittedArtifacts: false,
  },
});

const registry = (gates: ValidationRegistry['gates'], steps: ValidationRegistry['steps'] = []): ValidationRegistry => ({
  gates,
  steps,
  generateTargets: [],
  evidenceTargets: [],
});

describe('validation Gate registry and runner', () => {
  test('accepts the maintained registry and plans an empty request', () => {
    expect(() => validateRegistry(validationRegistry)).not.toThrow();
    expect(planGates(validationRegistry, [])).toEqual({ requestedGateIds: [], gateIds: [], steps: [] });
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

  test('requires explicit write authorization before Generate or Evidence starts', () => {
    let calls = 0;
    const target = { id: 'fixture', description: 'fixture', platform: 'any' as const, steps: [step('write')] };
    expect(() => executeWritableTarget('evidence', target, '/repo', false, () => ({ status: ++calls }))).toThrow(
      '[validation/write-required]',
    );
    expect(calls).toBe(0);
  });
});
