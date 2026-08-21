import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRsbuild, loadConfig } from '@rsbuild/core';

export const DEVELOPMENT_APP_HOST = 'localhost';
export const DEVELOPMENT_APP_PREFERRED_PORT = 40755;
export const PLUGIN_DEVELOPMENT_MODE_ENV = 'LENSX_PLUGIN_DEVELOPMENT_MODE';
export const PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV = 'LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const TERMINAL_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM']);

export class DevelopmentLauncherError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DevelopmentLauncherError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new DevelopmentLauncherError(code, message);
};

export const parsePluginDevelopmentArguments = (arguments_, cwd = repositoryRoot) => {
  let pluginsRoot;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== '--plugins-root') {
      fail('unknown-argument', 'Unsupported plugin development argument.');
    }
    if (pluginsRoot !== undefined) {
      fail('duplicate-plugins-root', '--plugins-root may be provided once.');
    }
    const value = arguments_[index + 1];
    if (value === undefined || value === '' || value.startsWith('--')) {
      fail('missing-plugins-root', '--plugins-root requires a path.');
    }
    pluginsRoot = resolve(cwd, value);
    index += 1;
  }
  return Object.freeze({ pluginsRoot: pluginsRoot ?? resolve(repositoryRoot, 'plugins') });
};

export const createDevelopmentLauncherPlan = ({
  mode = 'ordinary',
  arguments: arguments_ = [],
  cwd = process.cwd(),
} = {}) => {
  if (mode === 'ordinary') {
    if (arguments_.length > 0) fail('unknown-argument', 'Ordinary desktop development accepts no arguments.');
    return Object.freeze({
      mode,
      repositoryRoot,
      environment: Object.freeze({}),
      tauriArguments: Object.freeze([]),
    });
  }
  if (mode !== 'plugin-development') fail('unknown-mode', 'Development launcher mode is invalid.');
  const { pluginsRoot } = parsePluginDevelopmentArguments(arguments_, cwd);
  return Object.freeze({
    mode,
    repositoryRoot,
    environment: Object.freeze({
      [PLUGIN_DEVELOPMENT_MODE_ENV]: '1',
      [PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV]: pluginsRoot,
    }),
    tauriArguments: Object.freeze(['--features', 'plugin-development-mode']),
  });
};

export const configureDevelopmentEnvironment = (plan, environment = process.env) => {
  delete environment[PLUGIN_DEVELOPMENT_MODE_ENV];
  delete environment[PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV];
  for (const [name, value] of Object.entries(plan.environment)) environment[name] = value;
  return environment;
};

export const developmentAppOrigin = (port) => {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    fail('invalid-server-port', 'Rsbuild returned an invalid loopback port.');
  }
  return `http://${DEVELOPMENT_APP_HOST}:${port}/`;
};

export const createTauriRuntimeConfig = (port) =>
  Object.freeze({
    build: Object.freeze({
      devUrl: developmentAppOrigin(port),
      beforeDevCommand: null,
    }),
  });

export const createTauriLaunch = (plan, port, environment = process.env) => {
  const runtimeConfig = createTauriRuntimeConfig(port);
  return Object.freeze({
    command: 'pnpm',
    arguments: Object.freeze([
      'exec',
      'tauri',
      'dev',
      '--config',
      JSON.stringify(runtimeConfig),
      ...plan.tauriArguments,
    ]),
    cwd: plan.repositoryRoot,
    environment: Object.freeze({ ...environment }),
    runtimeConfig,
  });
};

export const formatDevelopmentLauncherDiagnostic = (error) => {
  if (error instanceof DevelopmentLauncherError) {
    return `[development-launcher/${error.code}] ${error.message}`;
  }
  return '[development-launcher/internal] Development launcher failed.';
};

const defaultCreateServer = async (plan) => {
  const loaded = await loadConfig({ cwd: plan.repositoryRoot, command: 'dev' });
  const rsbuild = await createRsbuild({
    cwd: plan.repositoryRoot,
    config: loaded,
    callerName: 'lensx-development-launcher',
  });
  return rsbuild.createDevServer();
};

const launcherError = (code, message) => new DevelopmentLauncherError(code, message);

const closeServer = async (server) => {
  try {
    await server.close();
    return null;
  } catch {
    return launcherError('server-close-failed', 'Rsbuild cleanup failed.');
  }
};

const validateStartedServer = (createdServer, result) => {
  const port = result?.port;
  if (result?.server !== createdServer || createdServer.port !== port) {
    fail('invalid-server-result', 'Rsbuild returned an inconsistent server result.');
  }
  developmentAppOrigin(port);
  return port;
};

const runTerminalLifecycle = async ({ server, launch, spawnChild, signalSource }) => {
  let child;
  let forwardedSignal = false;
  let requestedTerminal = null;
  let requestedStopSignal = null;
  let settled = false;
  let resolveTerminal;
  const terminal = new Promise((resolveTerminal_) => {
    resolveTerminal = resolveTerminal_;
  });

  const settle = (result) => {
    if (settled) return;
    settled = true;
    resolveTerminal(result);
  };

  const requestChildStop = (result, signal) => {
    if (requestedTerminal === null) requestedTerminal = result;
    requestedStopSignal ??= signal;
    if (child === undefined) return;
    if (!forwardedSignal && child.exitCode === null && child.signalCode === null) {
      forwardedSignal = true;
      child.kill(requestedStopSignal);
    }
  };

  const signalHandlers = new Map(
    TERMINAL_SIGNALS.map((signal) => [
      signal,
      () => requestChildStop(Object.freeze({ kind: 'signal', signal }), signal),
    ]),
  );
  for (const [signal, handler] of signalHandlers) signalSource.on(signal, handler);

  const serverErrorHandler = () =>
    requestChildStop(
      Object.freeze({
        kind: 'failure',
        code: 1,
        diagnostic: formatDevelopmentLauncherDiagnostic(
          launcherError('server-runtime-failed', 'Rsbuild failed after startup.'),
        ),
      }),
      'SIGTERM',
    );
  server.httpServer?.once('error', serverErrorHandler);

  try {
    if (settled) return await terminal;
    child = spawnChild(launch.command, launch.arguments, {
      cwd: launch.cwd,
      env: launch.environment,
      stdio: 'inherit',
    });
  } catch {
    settle(
      Object.freeze({
        kind: 'failure',
        code: 1,
        diagnostic: formatDevelopmentLauncherDiagnostic(
          launcherError('tauri-spawn-failed', 'Tauri child could not be created.'),
        ),
      }),
    );
  }

  if (child !== undefined) {
    const settleFromChild = (code, signal) => {
      settle(
        requestedTerminal ??
          Object.freeze({
            kind: signal === null ? 'exit' : 'signal',
            ...(signal === null ? { code: code ?? 1 } : { signal }),
          }),
      );
    };
    child.once('error', () => {
      settle(
        requestedTerminal ??
          Object.freeze({
            kind: 'failure',
            code: 1,
            diagnostic: formatDevelopmentLauncherDiagnostic(
              launcherError('tauri-spawn-failed', 'Tauri child could not be created.'),
            ),
          }),
      );
    });
    child.once('exit', settleFromChild);
    if (child.exitCode !== null || child.signalCode !== null) {
      settleFromChild(child.exitCode, child.signalCode);
    }
    if (requestedTerminal !== null && requestedStopSignal !== null) {
      requestChildStop(requestedTerminal, requestedStopSignal);
    }
  }

  const result = await terminal;
  const cleanupPromise = (async () => {
    for (const [signal, handler] of signalHandlers) signalSource.off(signal, handler);
    server.httpServer?.off('error', serverErrorHandler);
    return closeServer(server);
  })();
  const cleanupError = await cleanupPromise;
  if (cleanupError !== null && result.kind === 'exit' && result.code === 0) {
    return Object.freeze({
      kind: 'failure',
      code: 1,
      diagnostic: formatDevelopmentLauncherDiagnostic(cleanupError),
    });
  }
  return result;
};

export const runDevelopmentLauncher = async (
  { mode = 'ordinary', arguments: arguments_ = [], cwd = process.cwd() } = {},
  {
    createServer = defaultCreateServer,
    spawnChild = spawn,
    signalSource = process,
    environment = process.env,
    log = (message) => console.log(message),
  } = {},
) => {
  let server;
  try {
    const plan = createDevelopmentLauncherPlan({ mode, arguments: arguments_, cwd });
    configureDevelopmentEnvironment(plan, environment);
    server = await createServer(plan);
    let started;
    try {
      started = await server.listen();
    } catch {
      throw launcherError('server-start-failed', 'Rsbuild failed before listening.');
    }
    const port = validateStartedServer(server, started);
    const launch = createTauriLaunch(plan, port, environment);
    log(`[development-launcher/server-ready] ${launch.runtimeConfig.build.devUrl}`);
    return await runTerminalLifecycle({ server, launch, spawnChild, signalSource });
  } catch (error) {
    const primary =
      error instanceof DevelopmentLauncherError
        ? error
        : launcherError('server-create-failed', 'Rsbuild could not be created.');
    const cleanupError = server === undefined ? null : await closeServer(server);
    return Object.freeze({
      kind: 'failure',
      code: 1,
      diagnostic: formatDevelopmentLauncherDiagnostic(primary ?? cleanupError),
    });
  }
};

export const applyDevelopmentLauncherResult = (
  result,
  {
    setExitCode = (value) => (process.exitCode = value),
    relaySignal = (signal) => process.kill(process.pid, signal),
    report = (message) => console.error(message),
  } = {},
) => {
  if (result.kind === 'signal') {
    relaySignal(result.signal);
    return;
  }
  if (result.kind === 'failure') report(result.diagnostic);
  setExitCode(result.code);
};

const isDirectExecution = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  runDevelopmentLauncher({ arguments: process.argv.slice(2) })
    .then((result) => applyDevelopmentLauncherResult(result))
    .catch(() =>
      applyDevelopmentLauncherResult({
        kind: 'failure',
        code: 1,
        diagnostic: '[development-launcher/internal] Development launcher failed.',
      }),
    );
}
