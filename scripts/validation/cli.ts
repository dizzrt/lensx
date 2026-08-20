import { resolve } from 'node:path';

import { migrationInventory, validationRegistry } from './catalog.ts';
import { executePlan, executeWritableTarget, planGates, validateRegistry } from './runner.ts';

const rootDir = resolve(import.meta.dirname, '..', '..');

const printIds = (kind: string, values: readonly { readonly id: string; readonly description: string }[]): void => {
  console.log(`${kind}:`);
  for (const value of values) console.log(`  ${value.id}\t${value.description}`);
};

const printPlan = (requested: readonly string[]): void => {
  const plan = planGates(validationRegistry, requested);
  console.log(`gates: ${plan.gateIds.join(' -> ') || '(none)'}`);
  if (plan.steps.length === 0) console.log('steps: (none)');
  for (const [index, step] of plan.steps.entries()) {
    console.log(
      `step ${index + 1}: ${step.id}\t${step.executable} ${step.argv.join(' ')}\tplatform=${step.platform}\treadOnly=${step.safety.readOnly}`,
    );
  }
};

const runGate = (arguments_: readonly string[]): void => {
  if (arguments_.includes('--list')) {
    printIds('gates', validationRegistry.gates);
    return;
  }
  if (arguments_.includes('--migration')) {
    console.log(JSON.stringify(migrationInventory(), null, 2));
    return;
  }
  const planOnly = arguments_.includes('--plan');
  const gateIds = arguments_.includes('--all')
    ? validationRegistry.gates.map((gate) => gate.id)
    : arguments_.filter((argument) => argument !== '--plan');
  const selectedGateIds = gateIds.filter((argument) => argument !== '--all');
  if (selectedGateIds.length === 0)
    throw new Error('[validation/usage] gate requires --list, --all, --migration, or at least one Gate ID.');
  printPlan(selectedGateIds);
  if (!planOnly) executePlan(planGates(validationRegistry, selectedGateIds), rootDir);
};

const runGenerate = (arguments_: readonly string[]): void => {
  const targets = validationRegistry.generateTargets;
  if (arguments_.includes('--list')) {
    printIds('generate targets', targets);
    return;
  }
  const write = arguments_.includes('--write');
  const ids = arguments_.filter((argument) => argument !== '--write');
  if (ids.length !== 1) throw new Error('[validation/usage] generate requires exactly one target ID.');
  const target = targets.find((candidate) => candidate.id === ids[0]);
  if (target === undefined) throw new Error(`[validation/unknown-generate-target] ${ids[0]}`);
  executeWritableTarget(target, rootDir, write);
};

export const runValidationCli = (arguments_: readonly string[]): void => {
  validateRegistry(validationRegistry);
  const [kind, ...rest] = arguments_;
  if (kind === 'gate') runGate(rest);
  else if (kind === 'generate') runGenerate(rest);
  else throw new Error('[validation/usage] expected gate or generate dispatcher.');
};

try {
  runValidationCli(process.argv.slice(2).filter((argument) => argument !== '--'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
