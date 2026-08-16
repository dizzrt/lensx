import type { ChildProcess, SpawnOptions } from 'node:child_process';

export const PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV: 'LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT';

export interface PluginDevelopmentLaunch {
  command: 'pnpm';
  arguments: string[];
  cwd: string;
  environment: {
    LENSX_PLUGIN_DEVELOPMENT_MODE: '1';
    LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT: string;
  };
}

export function parsePluginDevelopmentArguments(arguments_: string[], cwd?: string): { pluginsRoot: string };

export function createPluginDevelopmentLaunch(arguments_: string[], cwd?: string): PluginDevelopmentLaunch;

export function applyPluginDevelopmentChildExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  handlers?: {
    setExitCode?: (value: number) => void;
    relaySignal?: (value: NodeJS.Signals) => void;
  },
): void;

export function runPluginDevelopmentMode(
  arguments_?: string[],
  options?: {
    cwd?: string;
    spawnChild?: (command: string, arguments_: readonly string[], options: SpawnOptions) => ChildProcess;
  },
): ChildProcess;
