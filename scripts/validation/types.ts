export type ValidationPlatform = 'any' | 'darwin';

export interface ValidationSafety {
  readonly readOnly: boolean;
  readonly writesCommittedArtifacts: boolean;
}

export interface ValidationStep {
  readonly id: string;
  readonly description: string;
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly platform: ValidationPlatform;
  readonly safety: ValidationSafety;
}

export interface ValidationGate {
  readonly id: string;
  readonly description: string;
  readonly dependsOn: readonly string[];
  readonly steps: readonly string[];
}

export interface WritableTarget {
  readonly id: string;
  readonly description: string;
  readonly steps: readonly ValidationStep[];
  readonly platform: ValidationPlatform;
}

export interface ValidationRegistry {
  readonly gates: readonly ValidationGate[];
  readonly steps: readonly ValidationStep[];
  readonly generateTargets: readonly WritableTarget[];
}

export interface ValidationPlan {
  readonly requestedGateIds: readonly string[];
  readonly gateIds: readonly string[];
  readonly steps: readonly ValidationStep[];
}
