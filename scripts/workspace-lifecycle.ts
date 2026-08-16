import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_WORKSPACE_PATTERNS = ['packages/*', 'plugins/*', 'examples/plugins/*'] as const;

export const REQUIRED_LIFECYCLE_SCRIPTS = ['build', 'typecheck', 'test', 'check'] as const;

export type LifecycleScript = (typeof REQUIRED_LIFECYCLE_SCRIPTS)[number];
export type WorkspaceMemberKind = 'public-package' | 'official-plugin' | 'example-plugin';

export interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  exports?: string | Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface WorkspaceMember {
  kind: WorkspaceMemberKind;
  manifest: PackageManifest;
  manifestPath: string;
  name: string;
  relativePath: string;
  rootDir: string;
}

export type LifecycleCommandRunner = (cwd: string, script: string, label: string) => number;

const WORKSPACE_KIND_BY_PARENT: Record<string, WorkspaceMemberKind> = {
  packages: 'public-package',
  plugins: 'official-plugin',
  'examples/plugins': 'example-plugin',
};

export const readPackageManifest = (manifestPath: string): PackageManifest =>
  JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;

export const discoverWorkspaceMembers = (rootDir: string): WorkspaceMember[] => {
  const members: WorkspaceMember[] = [];
  const names = new Map<string, string>();

  for (const pattern of SUPPORTED_WORKSPACE_PATTERNS) {
    const parentRelativePath = pattern.slice(0, -2);
    const parentDir = join(rootDir, parentRelativePath);
    if (!existsSync(parentDir)) {
      continue;
    }

    for (const entry of readdirSync(parentDir, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (!entry.isDirectory()) {
        continue;
      }
      const memberRoot = join(parentDir, entry.name);
      const manifestPath = join(memberRoot, 'package.json');
      if (!existsSync(manifestPath)) {
        continue;
      }

      const manifest = readPackageManifest(manifestPath);
      if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
        throw new Error(
          `[workspace/invalid-package-name] ${relative(rootDir, manifestPath)}: workspace members must declare a name.`,
        );
      }
      const previousPath = names.get(manifest.name);
      if (previousPath !== undefined) {
        throw new Error(
          `[workspace/duplicate-package-name] ${relative(rootDir, manifestPath)}: package name ${JSON.stringify(manifest.name)} is already used by ${previousPath}.`,
        );
      }
      names.set(manifest.name, relative(rootDir, manifestPath));
      members.push({
        kind: WORKSPACE_KIND_BY_PARENT[parentRelativePath],
        manifest,
        manifestPath,
        name: manifest.name,
        relativePath: relative(rootDir, memberRoot),
        rootDir: memberRoot,
      });
    }
  }

  return members.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

export const workspaceDependencyNames = (manifest: PackageManifest): Set<string> =>
  new Set(
    [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies].flatMap(
      (section) => Object.keys(section ?? {}),
    ),
  );

export const sortWorkspaceMembers = (members: readonly WorkspaceMember[]): WorkspaceMember[] => {
  const byName = new Map(members.map((member) => [member.name, member]));
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const member of members) {
    const memberDependencies = new Set(
      [...workspaceDependencyNames(member.manifest)].filter((dependency) => byName.has(dependency)),
    );
    dependencies.set(member.name, memberDependencies);
    for (const dependency of memberDependencies) {
      const currentDependents = dependents.get(dependency) ?? new Set<string>();
      currentDependents.add(member.name);
      dependents.set(dependency, currentDependents);
    }
  }

  const ready = members
    .filter((member) => dependencies.get(member.name)?.size === 0)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const sorted: WorkspaceMember[] = [];

  while (ready.length > 0) {
    const member = ready.shift();
    if (member === undefined) {
      break;
    }
    sorted.push(member);
    for (const dependentName of [...(dependents.get(member.name) ?? [])].sort()) {
      const remainingDependencies = dependencies.get(dependentName);
      remainingDependencies?.delete(member.name);
      if (remainingDependencies?.size === 0) {
        const dependent = byName.get(dependentName);
        if (dependent !== undefined && !sorted.includes(dependent) && !ready.includes(dependent)) {
          ready.push(dependent);
          ready.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
        }
      }
    }
  }

  if (sorted.length !== members.length) {
    const cycleMembers = members
      .filter((member) => !sorted.includes(member))
      .map((member) => member.name)
      .sort();
    throw new Error(`[workspace/dependency-cycle] Workspace dependency cycle: ${cycleMembers.join(', ')}.`);
  }

  return sorted;
};

export const validateLifecycleScripts = (members: readonly WorkspaceMember[], rootDir: string): void => {
  const missing = members.flatMap((member) =>
    REQUIRED_LIFECYCLE_SCRIPTS.filter((script) => typeof member.manifest.scripts?.[script] !== 'string').map(
      (script) =>
        `[workspace/required-lifecycle-script] ${relative(rootDir, member.manifestPath)}: missing scripts.${script}.`,
    ),
  );
  if (missing.length > 0) {
    throw new Error(missing.join('\n'));
  }
};

const defaultCommandRunner: LifecycleCommandRunner = (cwd, script) => {
  const result = spawnSync('pnpm', ['run', script], { cwd, stdio: 'inherit' });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.status ?? 1;
};

export const runWorkspaceLifecycle = ({
  lifecycle,
  rootDir,
  runCommand = defaultCommandRunner,
}: {
  lifecycle: LifecycleScript;
  rootDir: string;
  runCommand?: LifecycleCommandRunner;
}): void => {
  const rootManifestPath = join(rootDir, 'package.json');
  const rootManifest = readPackageManifest(rootManifestPath);
  const appScript = `app:${lifecycle}`;
  if (typeof rootManifest.scripts?.[appScript] !== 'string') {
    throw new Error(`[workspace/required-app-script] package.json: missing scripts.${appScript}.`);
  }

  const members = discoverWorkspaceMembers(rootDir);
  validateLifecycleScripts(members, rootDir);
  const invocations = [
    { cwd: rootDir, label: 'root application', script: appScript },
    ...sortWorkspaceMembers(members).map((member) => ({
      cwd: member.rootDir,
      label: `${member.name} (${member.relativePath})`,
      script: lifecycle,
    })),
  ];

  for (const invocation of invocations) {
    const status = runCommand(invocation.cwd, invocation.script, invocation.label);
    if (status !== 0) {
      throw new Error(
        `[workspace/lifecycle-failed] ${invocation.label}: script ${JSON.stringify(invocation.script)} exited with status ${status}.`,
      );
    }
  }
};

const isDirectExecution = (): boolean =>
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution()) {
  const lifecycle = process.argv[2];
  if (!REQUIRED_LIFECYCLE_SCRIPTS.includes(lifecycle as LifecycleScript)) {
    console.error(`[workspace/unknown-lifecycle] Expected one of: ${REQUIRED_LIFECYCLE_SCRIPTS.join(', ')}.`);
    process.exitCode = 1;
  } else {
    try {
      runWorkspaceLifecycle({ lifecycle: lifecycle as LifecycleScript, rootDir: process.cwd() });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
