import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV = 'LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export const parsePluginDevelopmentArguments = (arguments_, cwd = repositoryRoot) => {
  let pluginsRoot;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== '--plugins-root') {
      throw new Error(`[plugin-development-startup/unknown-argument] Unknown argument: ${argument ?? ''}.`);
    }
    if (pluginsRoot !== undefined) {
      throw new Error('[plugin-development-startup/duplicate-plugins-root] --plugins-root may be provided once.');
    }
    const value = arguments_[index + 1];
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new Error('[plugin-development-startup/missing-plugins-root] --plugins-root requires a path.');
    }
    pluginsRoot = resolve(cwd, value);
    index += 1;
  }
  return { pluginsRoot: pluginsRoot ?? resolve(repositoryRoot, 'plugins') };
};

export const createPluginDevelopmentLaunch = (arguments_, cwd = repositoryRoot) => {
  const { pluginsRoot } = parsePluginDevelopmentArguments(arguments_, cwd);
  return {
    command: 'pnpm',
    arguments: ['exec', 'tauri', 'dev', '--features', 'plugin-development-mode'],
    cwd: repositoryRoot,
    environment: {
      LENSX_PLUGIN_DEVELOPMENT_MODE: '1',
      [PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV]: pluginsRoot,
    },
  };
};

export const applyPluginDevelopmentChildExit = (
  code,
  signal,
  {
    setExitCode = (value) => (process.exitCode = value),
    relaySignal = (value) => process.kill(process.pid, value),
  } = {},
) => {
  if (signal !== null) {
    relaySignal(signal);
    return;
  }
  setExitCode(code ?? 1);
};

export const runPluginDevelopmentMode = (
  arguments_ = process.argv.slice(2),
  { cwd = process.cwd(), spawnChild = spawn } = {},
) => {
  const launch = createPluginDevelopmentLaunch(arguments_, cwd);
  const child = spawnChild(launch.command, launch.arguments, {
    cwd: launch.cwd,
    env: { ...process.env, ...launch.environment },
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    console.error(`[plugin-development-startup/child-error] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => applyPluginDevelopmentChildExit(code, signal));
  return child;
};

const isDirectExecution = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runPluginDevelopmentMode();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
