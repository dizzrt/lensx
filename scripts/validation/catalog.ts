import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkspaceMember } from '../workspace-lifecycle.ts';
import { discoverWorkspaceMembers, selectWorkspaceBuildOrder } from '../workspace-lifecycle.ts';

import type {
  ValidationGate,
  ValidationPlatform,
  ValidationRegistry,
  ValidationSafety,
  ValidationStep,
  WritableTarget,
} from './types.ts';

interface MigrationBaseline {
  readonly capturedAt: string;
  readonly rootScripts: Readonly<Record<string, string>>;
  readonly source: string;
}

export type MigrationDisposition = 'dispatcher' | 'internal' | 'lifecycle' | 'removed' | 'renamed';

export interface MigrationEntry {
  readonly legacyName: string;
  readonly destinationId?: string;
  readonly disposition: MigrationDisposition;
  readonly callers: readonly string[];
  readonly stages: readonly string[];
}

const rootDir = join(import.meta.dirname, '..', '..');
const baseline = JSON.parse(
  readFileSync(join(import.meta.dirname, 'migration-baseline.json'), 'utf8'),
) as MigrationBaseline;
const legacyScripts = baseline.rootScripts;

export const ROOT_SCRIPT_POLICY = Object.freeze({
  build: 'standard workspace lifecycle',
  check: 'standard workspace lifecycle',
  dev: 'root application development server',
  'app:dev': 'workspace-private unified desktop development launcher',
  'dev:plugin-development-mode': 'explicit Host-private development-mode launch',
  fix: 'repository formatting and lint repair',
  format: 'repository formatting',
  gate: 'single governed read-only validation dispatcher',
  generate: 'single governed generated-artifact dispatcher',
  'lint-staged': 'pre-commit file validation',
  prepare: 'repository hook installation',
  preview: 'root application production preview',
  'src-tauri:build': 'Rust workspace build',
  'src-tauri:check': 'Rust workspace static validation',
  'src-tauri:format': 'Rust workspace formatting',
  'src-tauri:format:check': 'Rust workspace formatting validation',
  'src-tauri:test': 'Rust workspace tests',
  tauri: 'Tauri operational entry point',
  test: 'standard workspace lifecycle',
  'test:watch': 'complete root Rstest suite in watch mode',
  typecheck: 'standard workspace lifecycle',
  'app:build': 'workspace-private root application lifecycle',
  'app:check': 'workspace-private root application lifecycle',
  'app:test': 'workspace-private root application lifecycle',
  'app:typecheck': 'workspace-private root application lifecycle',
} as const satisfies Readonly<Record<string, string>>);

const renamedGateIds: Readonly<Record<string, string>> = Object.freeze({
  'check:replace-plugin-iframe-runtime-with-child-webview': 'plugin-child-webview-delivery',
  'check:workspace-boundaries': 'workspace-boundaries',
  'test:workspace-boundaries': 'workspace-boundaries',
  'test:workspace-lifecycle': 'workspace-lifecycle',
});

const retiredLegacyEntries = new Set(['check:plugin-runtime-gate-graph']);
const specialGateEntries = new Set([
  'build:plugin-development-smoke:initial',
  'build:plugin-development-smoke:reload',
  'validate:plugin-development-smoke',
]);

const stableId = (legacyName: string): string => {
  const renamed = renamedGateIds[legacyName];
  if (renamed !== undefined) return renamed;
  if (legacyName.startsWith('check:')) return legacyName.slice('check:'.length).replaceAll(':', '-');
  if (legacyName.startsWith('ci:')) return `ci-${legacyName.slice('ci:'.length).replaceAll(':', '-')}`;
  if (legacyName.startsWith('build:plugin-development-smoke:')) {
    return `plugin-development-smoke-${legacyName.split(':').at(-1)}`;
  }
  if (legacyName === 'validate:plugin-development-smoke') return 'plugin-development-smoke-validation';
  throw new Error(`[validation/catalog] ${legacyName} has no stable Gate ID.`);
};

const isGateEntry = (name: string): boolean =>
  (name.startsWith('check:') && name !== 'check:fix') ||
  name.startsWith('ci:') ||
  specialGateEntries.has(name) ||
  name === 'test:workspace-boundaries' ||
  name === 'test:workspace-lifecycle';

const isGenerateEntry = (name: string): boolean => name.startsWith('generate:');

const targetId = (name: string): string => {
  if (name.startsWith('generate:')) return name.slice('generate:'.length).replaceAll(':', '-');
  throw new Error(`[validation/catalog] ${name} has no dispatcher target ID.`);
};

const splitCommand = (command: string): string[] => command.split(/\s+&&\s+/u).map((part) => part.trim());

const tokenize = (command: string): string[] => {
  if (/[|;<>`]/u.test(command)) {
    throw new Error(`[validation/catalog] shell operator is not allowed in structured step: ${command}`);
  }
  return command.match(/[^\s]+/gu) ?? [];
};

const commandKey = (step: Omit<ValidationStep, 'description' | 'id'>): string =>
  JSON.stringify([step.executable, step.argv, step.cwd, step.environment, step.platform, step.safety]);

const stepId = (step: Omit<ValidationStep, 'description' | 'id'>): string => {
  const kind = step.executable
    .replaceAll(/[^a-z0-9]+/giu, '-')
    .replaceAll(/^-|-$/gu, '')
    .toLowerCase();
  const digest = createHash('sha256').update(commandKey(step)).digest('hex').slice(0, 12);
  return `${kind || 'command'}-${digest}`;
};

const prohibitedEnvironmentCommand =
  /(?:visual|screenshot|pixel|playwright|chrome|chromium|\bevidence\b|(?:^|[/_-])harness(?:[/_.-]|$)|cargo\s+run|tauri\s+dev|\.app\b|launch services|rsbuild\s+preview)/iu;

export const isProhibitedEnvironmentCommand = (command: string): boolean => prohibitedEnvironmentCommand.test(command);

const safetyFor = (writable: boolean): ValidationSafety => {
  return Object.freeze({
    readOnly: !writable,
    writesCommittedArtifacts: writable,
  });
};

const platformFor = (command: string): ValidationPlatform =>
  /(?:macos|wkwebview|accessory-launcher|pointer-cursor)/iu.test(command) ? 'darwin' : 'any';

const parseStep = (
  command: string,
  writable = false,
  platform?: ValidationPlatform,
): Omit<ValidationStep, 'description' | 'id'> => {
  const tokens = tokenize(command);
  const environment: Record<string, string> = {};
  while (/^[A-Z_][A-Z0-9_]*=/u.test(tokens[0] ?? '')) {
    const assignment = tokens.shift() ?? '';
    const separator = assignment.indexOf('=');
    environment[assignment.slice(0, separator)] = assignment.slice(separator + 1);
  }
  const executable = tokens.shift();
  if (executable === undefined) throw new Error('[validation/catalog] empty command segment.');
  const normalizedCommand = `${executable} ${tokens.join(' ')}`;
  if (isProhibitedEnvironmentCommand(normalizedCommand)) {
    throw new Error(`[validation/prohibited-environment-command] ${normalizedCommand}`);
  }
  const safety = safetyFor(writable);
  return Object.freeze({
    executable,
    argv: Object.freeze(tokens),
    cwd: '.',
    environment: Object.freeze(environment),
    platform: platform ?? platformFor(command),
    safety,
  });
};

interface MutableGate {
  readonly id: string;
  readonly description?: string;
  readonly legacyNames: string[];
  readonly dependsOn: string[];
  readonly steps: string[];
}

const gatesById = new Map<string, MutableGate>();
for (const legacyName of Object.keys(legacyScripts).filter(isGateEntry).sort()) {
  if (retiredLegacyEntries.has(legacyName)) continue;
  const id = stableId(legacyName);
  const gate = gatesById.get(id) ?? { id, legacyNames: [], dependsOn: [], steps: [] };
  gate.legacyNames.push(legacyName);
  gatesById.set(id, gate);
}

const stepByKey = new Map<string, ValidationStep>();
const stepById = new Map<string, ValidationStep>();

const internStep = (command: string, writable = false, platform?: ValidationPlatform): string => {
  const parsed = parseStep(command, writable, platform);
  const key = commandKey(parsed);
  const existing = stepByKey.get(key);
  if (existing !== undefined) return existing.id;
  const id = stepId(parsed);
  const previous = stepById.get(id);
  if (previous !== undefined && commandKey(previous) !== key) {
    throw new Error(`[validation/catalog] step ID collision for ${id}.`);
  }
  const step = Object.freeze({ id, description: command, ...parsed });
  stepByKey.set(key, step);
  stepById.set(id, step);
  return id;
};

const expandLegacyCommand = (legacyName: string, gate: MutableGate, stack: readonly string[] = []): void => {
  if (stack.includes(legacyName)) {
    throw new Error(`[validation/catalog] legacy script cycle: ${[...stack, legacyName].join(' -> ')}`);
  }
  const command = legacyScripts[legacyName];
  if (command === undefined) throw new Error(`[validation/catalog] missing legacy script ${legacyName}.`);
  for (const segment of splitCommand(command)) {
    const tokens = tokenize(segment);
    const runIndex = tokens[0] === 'pnpm' && tokens[1] === 'run' ? 1 : -1;
    const dependencyName = runIndex === 1 ? tokens[2] : undefined;
    if (dependencyName !== undefined && tokens.length === 3) {
      if (retiredLegacyEntries.has(dependencyName)) {
        if (!gate.dependsOn.includes('validation-governance')) gate.dependsOn.push('validation-governance');
        continue;
      }
      if (isGateEntry(dependencyName) && !retiredLegacyEntries.has(dependencyName)) {
        const dependencyId = stableId(dependencyName);
        if (dependencyId !== gate.id && !gate.dependsOn.includes(dependencyId)) gate.dependsOn.push(dependencyId);
        continue;
      }
      if (legacyScripts[dependencyName] !== undefined && !Object.hasOwn(ROOT_SCRIPT_POLICY, dependencyName)) {
        expandLegacyCommand(dependencyName, gate, [...stack, legacyName]);
        continue;
      }
    }
    gate.steps.push(internStep(segment));
  }
};

for (const gate of gatesById.values()) {
  for (const legacyName of gate.legacyNames) expandLegacyCommand(legacyName, gate);
}

const workspaceMembers = discoverWorkspaceMembers(rootDir);
const prependWorkspaceBuildPreparation = ({
  gateId,
  targetPaths,
  environmentPrefix = () => '',
}: {
  readonly gateId: string;
  readonly targetPaths: readonly string[];
  readonly environmentPrefix?: (member: WorkspaceMember) => string;
}): void => {
  const gate = gatesById.get(gateId);
  if (gate === undefined) throw new Error(`[validation/catalog] missing ${gateId} Gate.`);
  const requestedPaths = new Set(targetPaths);
  const targets = workspaceMembers.filter((member) => requestedPaths.has(member.relativePath));
  if (targets.length !== requestedPaths.size) {
    const selectedPaths = new Set(targets.map((member) => member.relativePath));
    const missingPaths = [...requestedPaths].filter((path) => !selectedPaths.has(path));
    throw new Error(`[validation/catalog] ${gateId} is missing build preparation targets: ${missingPaths.join(', ')}.`);
  }
  gate.steps.unshift(
    ...selectWorkspaceBuildOrder(workspaceMembers, targets).map((member) =>
      internStep(`${environmentPrefix(member)}pnpm --dir ${member.relativePath} run build`),
    ),
  );
};

prependWorkspaceBuildPreparation({
  gateId: 'ci-lensx-typecheck',
  targetPaths: ['packages/plugin-cli'],
});
prependWorkspaceBuildPreparation({
  gateId: 'ci-lensx-test',
  targetPaths: ['packages/plugin-cli', 'examples/plugins/framework-neutral', 'examples/plugins/react-semi'],
  environmentPrefix: (member) =>
    member.kind === 'example-plugin' ? 'LENSX_TEMPLATE_MODULE_GRAPH=1 LENSX_VALIDATION_STAGE=ci-lensx-test ' : '',
});
prependWorkspaceBuildPreparation({
  gateId: 'plugin-child-webview-window-lifecycle',
  targetPaths: ['packages/plugin-contract'],
});

const governanceGate: MutableGate = {
  id: 'validation-governance',
  legacyNames: ['check:plugin-runtime-gate-graph'],
  dependsOn: ['workspace-lifecycle', 'workspace-boundaries'],
  steps: [
    internStep(
      'pnpm exec rstest run tests/validation-registry.test.ts tests/validation-governance.test.ts tests/workspace-lifecycle.test.ts tests/workspace-boundaries.test.ts',
    ),
  ],
};
gatesById.set(governanceGate.id, governanceGate);
const taoRustFiles = [
  'src/platform/macos.rs',
  'src/platform_impl/macos/app.rs',
  'src/platform_impl/macos/app_delegate.rs',
  'src/platform_impl/macos/event.rs',
  'src/platform_impl/macos/event_loop.rs',
  'src/platform_impl/macos/file_drop.rs',
  'src/platform_impl/macos/icon.rs',
  'src/platform_impl/macos/mod.rs',
  'src/platform_impl/macos/monitor.rs',
  'src/platform_impl/macos/resizable.rs',
  'src/platform_impl/macos/responder.rs',
  'src/platform_impl/macos/util/async.rs',
  'src/platform_impl/macos/util/mod.rs',
  'src/platform_impl/macos/view.rs',
  'src/platform_impl/macos/window.rs',
  'src/platform_impl/macos/window_delegate.rs',
  'src/window.rs',
].map((path) => `vendor/frame-aware-navigation/tao/${path}`);
const dependencyDriftGate = gatesById.get('frame-aware-navigation-dependency-drift');
if (dependencyDriftGate === undefined) throw new Error('[validation/catalog] missing dependency drift Gate.');
dependencyDriftGate.steps.push(
  internStep('node --experimental-strip-types scripts/tao-dependency-graph.ts', false, 'darwin'),
  internStep('cargo rustc --locked --manifest-path src-tauri/Cargo.toml -p tao --lib -- -D warnings', false, 'darwin'),
  internStep('node --experimental-strip-types scripts/tao-policy-tests.ts', false, 'any'),
  internStep('node --experimental-strip-types scripts/wry-policy-tests.ts', false, 'any'),
  internStep(
    'rustfmt --config-path scripts/validation/vendor-rustfmt.toml --check vendor/frame-aware-navigation/wry/src/wkwebview/class/mod.rs vendor/frame-aware-navigation/wry/src/wkwebview/class/wry_web_view.rs vendor/frame-aware-navigation/wry/src/wkwebview/class/key_equivalent.rs',
    false,
    'any',
  ),
  internStep(`rustfmt --edition 2021 --config tab_spaces=2 --check ${taoRustFiles.join(' ')}`, false, 'any'),
  internStep(
    'pnpm exec rstest run tests/frame-aware-navigation-dependency-drift.test.ts tests/tao-dependency-graph.test.ts tests/tao-policy-tests.test.ts tests/wry-policy-tests.test.ts tests/wry-key-equivalent.test.ts tests/validation-registry.test.ts tests/validation-governance.test.ts',
  ),
);
gatesById.set('development-launcher', {
  id: 'development-launcher',
  legacyNames: ['typed registry'],
  dependsOn: ['frame-aware-webview-navigation-policy', 'plugin-development-mode', 'plugin-child-webview-runtime'],
  steps: [
    internStep('pnpm exec rstest run tests/development-launcher.test.ts tests/plugin-development-startup.test.ts'),
    internStep('cargo test --manifest-path src-tauri/Cargo.toml trusted_app_target'),
    internStep('cargo test --manifest-path src-tauri/Cargo.toml plugin_runtime_security_policy'),
    internStep(
      'cargo test --manifest-path src-tauri/Cargo.toml plugin_resource_service::tests::resolves_idempotently_and_serves_get_head_and_static_mime_matrix',
    ),
    internStep('node --experimental-strip-types scripts/check-development-launcher.ts'),
  ],
});
gatesById.set('launcher-input-focus', {
  id: 'launcher-input-focus',
  description: 'Committed launcher input, IME keyboard priority, and native responder preservation',
  legacyNames: [],
  dependsOn: ['frame-aware-navigation-dependency-drift', 'plugin-child-webview-window-lifecycle'],
  steps: [
    internStep(
      'pnpm exec rstest run tests/launcher-input-focus-ui.test.tsx tests/ordinary-plugin-editing-ui.test.ts tests/launcher-action-search-ui.test.tsx tests/launcher-surface-desktop-adapter.test.ts tests/index.test.tsx tests/frame-aware-navigation-dependency-drift.test.ts tests/validation-registry.test.ts tests/validation-governance.test.ts',
    ),
    internStep('cargo test --manifest-path src-tauri/Cargo.toml launcher_surface'),
    internStep('cargo test --manifest-path src-tauri/Cargo.toml launcher_window'),
  ],
});
gatesById.set('isolated-plugin-runtime-origin', {
  id: 'isolated-plugin-runtime-origin',
  legacyNames: ['stable capability successor'],
  dependsOn: ['plugin-child-webview-origin-isolation'],
  steps: [],
});

gatesById.set('plugin-host-http', {
  id: 'plugin-host-http',
  description: 'Public typed HTTP contract, native public-address transport, cancellation and plugin integration',
  legacyNames: [],
  dependsOn: ['plugin-host-api-contract', 'plugin-child-webview-host-dispatcher', 'workspace-boundaries'],
  steps: [
    internStep('cargo test --manifest-path src-tauri/Cargo.toml plugin_http'),
    internStep('cargo test --manifest-path src-tauri/Cargo.toml plugin_child_webview_rpc'),
    internStep('cargo test --manifest-path src-tauri/Cargo.toml plugin_child_webview_host_dispatcher'),
    internStep('pnpm --dir packages/plugin-sdk run test'),
    internStep('pnpm --dir plugins/translation run test'),
    internStep('pnpm --dir plugins/translation run typecheck'),
    internStep('pnpm --dir plugins/translation run build'),
    internStep('pnpm --dir plugins/translation run test:e2e'),
  ],
});
prependWorkspaceBuildPreparation({
  gateId: 'plugin-host-http',
  targetPaths: ['packages/plugin-sdk', 'packages/plugin-testkit', 'packages/plugin-ui', 'packages/plugin-cli'],
});

const targetFromLegacy = (legacyName: string, writable: boolean): WritableTarget => {
  const command = legacyScripts[legacyName];
  if (command === undefined) throw new Error(`[validation/catalog] missing target command ${legacyName}.`);
  const commands = splitCommand(command);
  if (legacyName === 'generate:plugin-host-api-types') {
    commands.push('node packages/plugin-contract/scripts/generate-plugin-host-api-validators.mjs');
  }
  return Object.freeze({
    id: targetId(legacyName),
    description: `Migrated from ${legacyName}`,
    platform: platformFor(command),
    steps: Object.freeze(
      commands.map((segment) => {
        const parsed = parseStep(segment, writable);
        return Object.freeze({ id: stepId(parsed), description: segment, ...parsed });
      }),
    ),
  });
};

const toGate = (gate: MutableGate): ValidationGate =>
  Object.freeze({
    id: gate.id,
    description: gate.description ?? `Stable validation Gate migrated from ${gate.legacyNames.join(', ')}`,
    dependsOn: Object.freeze([...new Set(gate.dependsOn)]),
    steps: Object.freeze([...new Set(gate.steps)]),
  });

export const validationRegistry: ValidationRegistry = Object.freeze({
  gates: Object.freeze([...gatesById.values()].sort((left, right) => left.id.localeCompare(right.id)).map(toGate)),
  steps: Object.freeze([...stepById.values()].sort((left, right) => left.id.localeCompare(right.id))),
  generateTargets: Object.freeze(
    Object.keys(legacyScripts)
      .filter(isGenerateEntry)
      .sort()
      .map((name) => targetFromLegacy(name, true)),
  ),
});

export const findGate = (id: string): ValidationGate | undefined =>
  validationRegistry.gates.find((gate) => gate.id === id);

export const migrationInventory = (): readonly MigrationEntry[] => {
  const names = Object.keys(legacyScripts).sort();
  return Object.freeze(
    names.map((legacyName) => {
      const callers = names.filter((candidate) =>
        splitCommand(legacyScripts[candidate] ?? '').some((stage) =>
          tokenize(stage).join(' ').includes(`pnpm run ${legacyName}`),
        ),
      );
      if (retiredLegacyEntries.has(legacyName)) {
        return Object.freeze({
          legacyName,
          disposition: 'removed' as const,
          callers,
          stages: splitCommand(legacyScripts[legacyName] ?? ''),
        });
      }
      if (isGateEntry(legacyName)) {
        const destinationId = stableId(legacyName);
        return Object.freeze({
          legacyName,
          destinationId,
          disposition:
            destinationId === legacyName.replace(/^[^:]+:/u, '') ? ('dispatcher' as const) : ('renamed' as const),
          callers,
          stages: splitCommand(legacyScripts[legacyName] ?? ''),
        });
      }
      if (isGenerateEntry(legacyName)) {
        return Object.freeze({
          legacyName,
          destinationId: targetId(legacyName),
          disposition: 'dispatcher' as const,
          callers,
          stages: splitCommand(legacyScripts[legacyName] ?? ''),
        });
      }
      if (legacyName === 'check:fix') {
        return Object.freeze({
          legacyName,
          destinationId: 'fix',
          disposition: 'renamed' as const,
          callers,
          stages: splitCommand(legacyScripts[legacyName] ?? ''),
        });
      }
      if (Object.hasOwn(ROOT_SCRIPT_POLICY, legacyName)) {
        return Object.freeze({
          legacyName,
          destinationId: legacyName,
          disposition: 'lifecycle' as const,
          callers,
          stages: splitCommand(legacyScripts[legacyName] ?? ''),
        });
      }
      return Object.freeze({
        legacyName,
        disposition: 'removed' as const,
        callers,
        stages: splitCommand(legacyScripts[legacyName] ?? ''),
      });
    }),
  );
};

export const migrationBaselineMetadata = Object.freeze({
  capturedAt: baseline.capturedAt,
  source: baseline.source,
  rootDir,
});
