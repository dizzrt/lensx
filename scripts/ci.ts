import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  discoverWorkspaceMembers,
  type LifecycleCommandRunner,
  REQUIRED_LIFECYCLE_SCRIPTS,
  selectWorkspaceBuildOrder,
  type WorkspaceMember,
} from './workspace-lifecycle.ts';

export const REQUIRED_PLUGIN_CI_SCRIPTS = REQUIRED_LIFECYCLE_SCRIPTS;
export const PLUGIN_CI_SCRIPT_ORDER = ['typecheck', 'test', 'check', 'build', 'test:e2e'] as const;
const PROHIBITED_PLUGIN_SCRIPT =
  /(?:visual|screenshot|pixel|playwright|chrome|chromium|webview[^\n]*(?:run|harness)|cargo\s+run|tauri\s+dev|\.app\b|launch services|evidence)/iu;

const defaultCommandRunner: LifecycleCommandRunner = (cwd, script) => {
  const result = spawnSync('pnpm', ['run', script], { cwd, stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
};

export const discoverDirectPlugins = (rootDir: string): WorkspaceMember[] =>
  discoverWorkspaceMembers(rootDir).filter((member) => member.kind === 'official-plugin');

export const selectPluginDependencyBuildOrder = (
  members: readonly WorkspaceMember[],
  plugins: readonly WorkspaceMember[],
): WorkspaceMember[] => {
  const pluginNames = new Set(plugins.map((plugin) => plugin.name));
  return selectWorkspaceBuildOrder(members, plugins).filter(
    (member) => member.kind === 'public-package' && !pluginNames.has(member.name),
  );
};

const runRequiredScript = (member: WorkspaceMember, script: string, runCommand: LifecycleCommandRunner): void => {
  const label = `${member.name} (${member.relativePath})`;
  const status = runCommand(member.rootDir, script, label);
  if (status !== 0) {
    throw new Error(`[ci/command-failed] ${label}: script ${JSON.stringify(script)} exited with status ${status}.`);
  }
};

export const runPluginsCi = ({
  rootDir,
  runCommand = defaultCommandRunner,
  log = console.log,
}: {
  rootDir: string;
  runCommand?: LifecycleCommandRunner;
  log?: (message: string) => void;
}): { dependencies: WorkspaceMember[]; plugins: WorkspaceMember[] } => {
  const members = discoverWorkspaceMembers(rootDir);
  const plugins = members.filter((member) => member.kind === 'official-plugin');
  if (plugins.length === 0) {
    log('Plugins CI: no direct plugins under plugins/*; successful no-op.');
    return { dependencies: [], plugins: [] };
  }

  const missing = plugins.flatMap((plugin) =>
    REQUIRED_PLUGIN_CI_SCRIPTS.filter((script) => typeof plugin.manifest.scripts?.[script] !== 'string').map(
      (script) => `[ci/required-plugin-script] ${plugin.relativePath}/package.json: missing scripts.${script}.`,
    ),
  );
  if (missing.length > 0) throw new Error(missing.join('\n'));

  const prohibited = plugins.flatMap((plugin) =>
    Object.entries(plugin.manifest.scripts ?? {}).flatMap(([name, command]) =>
      name === 'visual' || PROHIBITED_PLUGIN_SCRIPT.test(`${name} ${command}`)
        ? [`[ci/prohibited-plugin-script] ${plugin.relativePath}/package.json: scripts.${name}.`]
        : [],
    ),
  );
  if (prohibited.length > 0) throw new Error(prohibited.join('\n'));

  const dependencies = selectPluginDependencyBuildOrder(members, plugins);
  for (const dependency of dependencies) {
    if (typeof dependency.manifest.scripts?.build !== 'string') {
      throw new Error(
        `[ci/public-package-build-script] ${dependency.relativePath}/package.json: missing scripts.build.`,
      );
    }
    runRequiredScript(dependency, 'build', runCommand);
  }

  for (const plugin of plugins) {
    for (const script of PLUGIN_CI_SCRIPT_ORDER) {
      if (script === 'test:e2e' && typeof plugin.manifest.scripts?.[script] !== 'string') continue;
      runRequiredScript(plugin, script, runCommand);
    }
  }

  log(
    `Plugins CI: validated ${plugins.length} direct plugin(s) after building ${dependencies.length} public dependency package(s).`,
  );
  return { dependencies, plugins };
};

const isDirectExecution = (): boolean =>
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution()) {
  try {
    if (process.argv[2] !== 'plugins') throw new Error('[ci/command-invalid] Expected command: plugins.');
    runPluginsCi({ rootDir: process.cwd() });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
