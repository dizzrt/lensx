import type { ChildProcess, SpawnOptions } from 'node:child_process';
import type { EventEmitter } from 'node:events';

export const DEVELOPMENT_APP_HOST: 'localhost';
export const DEVELOPMENT_APP_PREFERRED_PORT: 40755;
export const PLUGIN_DEVELOPMENT_MODE_ENV: 'LENSX_PLUGIN_DEVELOPMENT_MODE';
export const PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV: 'LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT';

export type DevelopmentLauncherMode = 'ordinary' | 'plugin-development';
export type DevelopmentLauncherResult =
  | { readonly kind: 'exit'; readonly code: number }
  | { readonly kind: 'signal'; readonly signal: NodeJS.Signals }
  | { readonly kind: 'failure'; readonly code: 1; readonly diagnostic: string };

export class DevelopmentLauncherError extends Error {
  readonly code: string;
}

export interface DevelopmentLauncherPlan {
  readonly mode: DevelopmentLauncherMode;
  readonly repositoryRoot: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly tauriArguments: readonly string[];
}

export interface DevelopmentServer {
  port: number;
  httpServer?: EventEmitter | null;
  listen(): Promise<{ port: number; server: DevelopmentServer; urls?: string[] }>;
  close(): Promise<void>;
}

export interface DevelopmentLauncherSignalSource {
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

export function parsePluginDevelopmentArguments(arguments_: string[], cwd?: string): { readonly pluginsRoot: string };
export function createDevelopmentLauncherPlan(options?: {
  mode?: DevelopmentLauncherMode;
  arguments?: string[];
  cwd?: string;
}): DevelopmentLauncherPlan;
export function configureDevelopmentEnvironment(
  plan: DevelopmentLauncherPlan,
  environment?: Record<string, string | undefined>,
): Record<string, string | undefined>;
export function developmentAppOrigin(port: number): string;
export function createTauriRuntimeConfig(port: number): {
  readonly build: { readonly devUrl: string; readonly beforeDevCommand: null };
};
export function createTauriLaunch(
  plan: DevelopmentLauncherPlan,
  port: number,
  environment?: Record<string, string | undefined>,
): {
  readonly command: 'pnpm';
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly runtimeConfig: ReturnType<typeof createTauriRuntimeConfig>;
};
export function formatDevelopmentLauncherDiagnostic(error: unknown): string;
export function runDevelopmentLauncher(
  options?: { mode?: DevelopmentLauncherMode; arguments?: string[]; cwd?: string },
  dependencies?: {
    createServer?: (plan: DevelopmentLauncherPlan) => Promise<DevelopmentServer>;
    spawnChild?: (command: string, arguments_: readonly string[], options: SpawnOptions) => ChildProcess;
    signalSource?: DevelopmentLauncherSignalSource;
    environment?: Record<string, string | undefined>;
    log?: (message: string) => void;
  },
): Promise<DevelopmentLauncherResult>;
export function applyDevelopmentLauncherResult(
  result: DevelopmentLauncherResult,
  handlers?: {
    setExitCode?: (value: number) => void;
    relaySignal?: (signal: NodeJS.Signals) => void;
    report?: (message: string) => void;
  },
): void;
