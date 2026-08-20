import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { ValidationGate, ValidationPlan, ValidationRegistry, ValidationStep, WritableTarget } from './types.ts';

export interface CommandResult {
  readonly error?: Error;
  readonly status: number | null;
}

export type CommandRunner = (step: ValidationStep, rootDir: string) => CommandResult;

const duplicateIds = (values: readonly { readonly id: string }[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates].sort();
};

export const validateRegistry = (registry: ValidationRegistry): void => {
  const duplicateGates = duplicateIds(registry.gates);
  const duplicateSteps = duplicateIds(registry.steps);
  const duplicateGenerate = duplicateIds(registry.generateTargets);
  const duplicateEvidence = duplicateIds(registry.evidenceTargets);
  if (duplicateGates.length > 0) throw new Error(`[validation/duplicate-gate] ${duplicateGates.join(', ')}`);
  if (duplicateSteps.length > 0) throw new Error(`[validation/duplicate-step] ${duplicateSteps.join(', ')}`);
  if (duplicateGenerate.length > 0)
    throw new Error(`[validation/duplicate-generate-target] ${duplicateGenerate.join(', ')}`);
  if (duplicateEvidence.length > 0)
    throw new Error(`[validation/duplicate-evidence-target] ${duplicateEvidence.join(', ')}`);

  const gates = new Map(registry.gates.map((gate) => [gate.id, gate]));
  const steps = new Set(registry.steps.map((step) => step.id));
  for (const gate of registry.gates) {
    for (const dependency of gate.dependsOn) {
      if (!gates.has(dependency)) throw new Error(`[validation/missing-gate-dependency] ${gate.id} -> ${dependency}`);
    }
    for (const step of gate.steps) {
      if (!steps.has(step)) throw new Error(`[validation/missing-step] ${gate.id} -> ${step}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (visiting.has(id)) throw new Error(`[validation/gate-cycle] ${[...path, id].join(' -> ')}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const gate = gates.get(id);
    if (gate === undefined) throw new Error(`[validation/unknown-gate] ${id}`);
    for (const dependency of gate.dependsOn) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const gate of registry.gates) visit(gate.id, []);
};

export const planGates = (registry: ValidationRegistry, requestedGateIds: readonly string[]): ValidationPlan => {
  validateRegistry(registry);
  const gates = new Map(registry.gates.map((gate) => [gate.id, gate]));
  const steps = new Map(registry.steps.map((step) => [step.id, step]));
  const plannedGates: ValidationGate[] = [];
  const seenGates = new Set<string>();
  const seenSteps = new Set<string>();
  const plannedSteps: ValidationStep[] = [];

  const visit = (id: string): void => {
    if (seenGates.has(id)) return;
    const gate = gates.get(id);
    if (gate === undefined) throw new Error(`[validation/unknown-gate] ${id}`);
    for (const dependency of gate.dependsOn) visit(dependency);
    seenGates.add(id);
    plannedGates.push(gate);
    for (const stepId of gate.steps) {
      if (seenSteps.has(stepId)) continue;
      const step = steps.get(stepId);
      if (step === undefined) throw new Error(`[validation/missing-step] ${gate.id} -> ${stepId}`);
      seenSteps.add(stepId);
      plannedSteps.push(step);
    }
  };
  for (const id of requestedGateIds) visit(id);
  return Object.freeze({
    requestedGateIds: Object.freeze([...requestedGateIds]),
    gateIds: Object.freeze(plannedGates.map((gate) => gate.id)),
    steps: Object.freeze(plannedSteps),
  });
};

const defaultRunner: CommandRunner = (step, rootDir) => {
  const result = spawnSync(step.executable, [...step.argv], {
    cwd: resolve(rootDir, step.cwd),
    env: { ...process.env, ...step.environment },
    stdio: 'inherit',
  });
  return { error: result.error, status: result.status };
};

export const executePlan = (plan: ValidationPlan, rootDir: string, runCommand: CommandRunner = defaultRunner): void => {
  for (const step of plan.steps) {
    if (step.platform === 'darwin' && process.platform !== 'darwin') {
      throw new Error(`[validation/platform] ${step.id} requires darwin.`);
    }
    console.log(`[gate:${plan.requestedGateIds.join(',')}] step:${step.id} ${step.description}`);
    const result = runCommand(step, rootDir);
    if (result.error !== undefined) {
      throw new Error(
        `[validation/launch-failed] gate=${plan.requestedGateIds.join(',')} step=${step.id}: ${result.error.message}`,
      );
    }
    if (result.status !== 0) {
      throw new Error(
        `[validation/step-failed] gate=${plan.requestedGateIds.join(',')} step=${step.id} status=${result.status ?? 'signal'}`,
      );
    }
  }
};

export const executeWritableTarget = (
  kind: 'evidence' | 'generate',
  target: WritableTarget,
  rootDir: string,
  write: boolean,
  runCommand: CommandRunner = defaultRunner,
): void => {
  if (!write) {
    throw new Error(
      `[validation/write-required] ${kind} target ${target.id} requires --write; no command was started.`,
    );
  }
  if (target.platform === 'darwin' && process.platform !== 'darwin') {
    throw new Error(`[validation/platform] ${kind} target ${target.id} requires darwin.`);
  }
  const plan: ValidationPlan = Object.freeze({
    requestedGateIds: Object.freeze([`${kind}:${target.id}`]),
    gateIds: Object.freeze([]),
    steps: target.steps,
  });
  executePlan(plan, rootDir, runCommand);
};
