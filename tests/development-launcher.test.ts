import type { SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@rstest/core';

import {
  applyDevelopmentLauncherResult,
  createDevelopmentLauncherPlan,
  createTauriLaunch,
  createTauriRuntimeConfig,
  type DevelopmentLauncherPlan,
  type DevelopmentLauncherResult,
  type DevelopmentServer,
  formatDevelopmentLauncherDiagnostic,
  PLUGIN_DEVELOPMENT_MODE_ENV,
  PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV,
  runDevelopmentLauncher,
} from '../scripts/development-launcher.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const flush = () => new Promise<void>((resolveFlush) => setTimeout(resolveFlush, 0));

class FakeServer implements DevelopmentServer {
  readonly httpServer = new EventEmitter();
  closeCalls = 0;
  listenCalls = 0;

  constructor(
    public port: number,
    private readonly options: { listenError?: boolean; closeError?: boolean } = {},
  ) {}

  async listen() {
    this.listenCalls += 1;
    if (this.options.listenError) throw new Error('/private/listen-stack');
    return { port: this.port, server: this, urls: [`http://localhost:${this.port}/`] };
  }

  async close() {
    this.closeCalls += 1;
    if (this.options.closeError) throw new Error('/private/close-stack');
  }
}

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly killedWith: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals) {
    this.killedWith.push(signal);
    return true;
  }

  exit(code: number | null, signal: NodeJS.Signals | null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }
}

const fixture = (port = 40755, serverOptions: ConstructorParameters<typeof FakeServer>[1] = {}) => {
  const server = new FakeServer(port, serverOptions);
  const child = new FakeChild();
  const signalSource = new EventEmitter();
  const environment: Record<string, string | undefined> = {};
  const launches: Array<{
    command: string;
    arguments: readonly string[];
    options: SpawnOptions;
  }> = [];
  let observedPlan: DevelopmentLauncherPlan | undefined;
  const run = (options: Parameters<typeof runDevelopmentLauncher>[0] = {}) =>
    runDevelopmentLauncher(options, {
      environment,
      signalSource,
      log: () => undefined,
      createServer: async (plan) => {
        observedPlan = plan;
        return server;
      },
      spawnChild: (command, arguments_, options_) => {
        launches.push({ command, arguments: arguments_, options: options_ });
        return child as never;
      },
    });
  return { child, environment, launches, run, server, signalSource, observedPlan: () => observedPlan };
};

describe('unified development launcher', () => {
  test.each([40755, 40756])('propagates actual Rsbuild port %s into the in-memory Tauri merge', async (port) => {
    const current = fixture(port);
    const running = current.run();
    await flush();

    expect(current.server.listenCalls).toBe(1);
    expect(current.launches).toHaveLength(1);
    expect(current.launches[0]?.command).toBe('pnpm');
    expect(current.launches[0]?.arguments.slice(0, 5)).toEqual([
      'exec',
      'tauri',
      'dev',
      '--config',
      expect.any(String),
    ]);
    const runtime = JSON.parse(current.launches[0]?.arguments[4] ?? '') as ReturnType<typeof createTauriRuntimeConfig>;
    expect(runtime).toEqual({ build: { devUrl: `http://localhost:${port}/`, beforeDevCommand: null } });
    expect(current.launches[0]?.arguments.join(' ')).not.toContain('--features');

    current.child.exit(0, null);
    await expect(running).resolves.toEqual({ kind: 'exit', code: 0 });
    expect(current.server.closeCalls).toBe(1);
  });

  test('isolates ordinary mode and sets plugin capability before server creation', async () => {
    const ordinary = fixture();
    ordinary.environment[PLUGIN_DEVELOPMENT_MODE_ENV] = '1';
    ordinary.environment[PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV] = '/private/stale-root';
    const ordinaryRun = ordinary.run();
    await flush();
    expect(ordinary.environment).not.toHaveProperty(PLUGIN_DEVELOPMENT_MODE_ENV);
    expect(ordinary.environment).not.toHaveProperty(PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV);
    ordinary.child.exit(0, null);
    await ordinaryRun;

    const plugin = fixture();
    const pluginRun = plugin.run({
      mode: 'plugin-development',
      arguments: ['--plugins-root', 'custom plugins'],
      cwd: repositoryRoot,
    });
    await flush();
    expect(plugin.environment).toMatchObject({
      [PLUGIN_DEVELOPMENT_MODE_ENV]: '1',
      [PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV]: resolve(repositoryRoot, 'custom plugins'),
    });
    expect(plugin.observedPlan()?.mode).toBe('plugin-development');
    expect(plugin.launches[0]?.arguments).toContain('plugin-development-mode');
    expect(plugin.launches[0]?.options.env).toMatchObject(plugin.environment);
    plugin.child.exit(0, null);
    await pluginRun;
  });

  test.each([
    [['--unknown'], 'unknown-argument'],
    [['--plugins-root'], 'missing-plugins-root'],
    [['--plugins-root', 'one', '--plugins-root', 'two'], 'duplicate-plugins-root'],
  ])('rejects plugin arguments %j before creating either process', async (arguments_, code) => {
    const current = fixture();
    const result = await current.run({ mode: 'plugin-development', arguments: arguments_ });
    expect(result).toMatchObject({ kind: 'failure', code: 1 });
    expect((result as Extract<DevelopmentLauncherResult, { kind: 'failure' }>).diagnostic).toContain(code);
    expect(current.server.listenCalls).toBe(0);
    expect(current.launches).toEqual([]);
  });

  test('closes a created server and never spawns Tauri when listen fails', async () => {
    const current = fixture(40755, { listenError: true });
    const result = await current.run();
    expect(result).toEqual({
      kind: 'failure',
      code: 1,
      diagnostic: '[development-launcher/server-start-failed] Rsbuild failed before listening.',
    });
    expect(current.launches).toEqual([]);
    expect(current.server.closeCalls).toBe(1);
    expect(JSON.stringify(result)).not.toContain('/private/listen-stack');
  });

  test('closes Rsbuild when Tauri spawn fails without exposing the raw exception', async () => {
    const server = new FakeServer(40755);
    const result = await runDevelopmentLauncher(
      {},
      {
        createServer: async () => server,
        spawnChild: () => {
          throw new Error('/private/tauri-spawn-stack');
        },
        signalSource: new EventEmitter(),
        environment: {},
        log: () => undefined,
      },
    );
    expect(result).toEqual({
      kind: 'failure',
      code: 1,
      diagnostic: '[development-launcher/tauri-spawn-failed] Tauri child could not be created.',
    });
    expect(server.closeCalls).toBe(1);
  });

  test('observes a child that exits before its lifecycle listeners are attached', async () => {
    const server = new FakeServer(40755);
    const child = new FakeChild();
    const result = await runDevelopmentLauncher(
      {},
      {
        createServer: async () => server,
        spawnChild: () => {
          child.exit(6, null);
          return child as never;
        },
        signalSource: new EventEmitter(),
        environment: {},
        log: () => undefined,
      },
    );
    expect(result).toEqual({ kind: 'exit', code: 6 });
    expect(server.closeCalls).toBe(1);
  });

  test.each([0, 7])('preserves Tauri exit code %s and closes exactly once', async (code) => {
    const current = fixture();
    const running = current.run();
    await flush();
    current.child.exit(code, null);
    current.child.exit(9, null);
    current.server.httpServer.emit('error', new Error('late'));
    await expect(running).resolves.toEqual({ kind: 'exit', code });
    expect(current.server.closeCalls).toBe(1);
    expect(current.child.killedWith).toEqual([]);
  });

  test.each([
    'SIGINT',
    'SIGTERM',
  ] as const)('forwards repeated %s at most once and preserves signal semantics', async (signal) => {
    const current = fixture();
    const running = current.run();
    await flush();
    current.signalSource.emit(signal);
    current.signalSource.emit(signal);
    expect(current.child.killedWith).toEqual([signal]);
    current.child.exit(null, signal);
    await expect(running).resolves.toEqual({ kind: 'signal', signal });
    expect(current.server.closeCalls).toBe(1);
    expect(current.signalSource.listenerCount('SIGINT')).toBe(0);
    expect(current.signalSource.listenerCount('SIGTERM')).toBe(0);
  });

  test('terminates Tauri after a server runtime error and keeps the server failure primary', async () => {
    const current = fixture();
    const running = current.run();
    await flush();
    current.server.httpServer.emit('error', new Error('/private/runtime-error'));
    expect(current.child.killedWith).toEqual(['SIGTERM']);
    current.child.exit(null, 'SIGTERM');
    await expect(running).resolves.toEqual({
      kind: 'failure',
      code: 1,
      diagnostic: '[development-launcher/server-runtime-failed] Rsbuild failed after startup.',
    });
  });

  test('does not overwrite a nonzero Tauri result when cleanup also fails', async () => {
    const current = fixture(40755, { closeError: true });
    const running = current.run();
    await flush();
    current.child.exit(8, null);
    await expect(running).resolves.toEqual({ kind: 'exit', code: 8 });
    expect(current.server.closeCalls).toBe(1);
  });

  test('makes cleanup failure terminal only after an otherwise successful child exit', async () => {
    const current = fixture(40755, { closeError: true });
    const running = current.run();
    await flush();
    current.child.exit(0, null);
    await expect(running).resolves.toEqual({
      kind: 'failure',
      code: 1,
      diagnostic: '[development-launcher/server-close-failed] Rsbuild cleanup failed.',
    });
  });

  test('applies exit and signal results without conflating them', () => {
    const exitCodes: number[] = [];
    const signals: NodeJS.Signals[] = [];
    const diagnostics: string[] = [];
    const handlers = {
      setExitCode: (value: number) => exitCodes.push(value),
      relaySignal: (value: NodeJS.Signals) => signals.push(value),
      report: (value: string) => diagnostics.push(value),
    };
    applyDevelopmentLauncherResult({ kind: 'exit', code: 7 }, handlers);
    applyDevelopmentLauncherResult({ kind: 'signal', signal: 'SIGTERM' }, handlers);
    applyDevelopmentLauncherResult({ kind: 'failure', code: 1, diagnostic: 'bounded' }, handlers);
    expect(exitCodes).toEqual([7, 1]);
    expect(signals).toEqual(['SIGTERM']);
    expect(diagnostics).toEqual(['bounded']);
  });

  test('keeps runtime config and diagnostics bounded and Host-private', () => {
    const ordinary = createDevelopmentLauncherPlan();
    expect(createTauriLaunch(ordinary, 43123, {}).runtimeConfig).toEqual({
      build: { devUrl: 'http://localhost:43123/', beforeDevCommand: null },
    });
    try {
      createTauriRuntimeConfig(0);
      throw new Error('expected invalid port to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid-server-port' });
    }
    expect(formatDevelopmentLauncherDiagnostic(new Error('/private/secret/root'))).toBe(
      '[development-launcher/internal] Development launcher failed.',
    );
  });
});
