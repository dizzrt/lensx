import { invoke } from '@tauri-apps/api/core';
import type { LauncherDesktopActions } from './actions/builtins';

export const HIDE_LAUNCHER_COMMAND = 'hide_launcher';

export type LauncherDesktopActionErrorCode = 'invalid_desktop_error_payload' | 'launcher_window_action_failed';

export interface LauncherDesktopActionErrorPayload {
  readonly code: LauncherDesktopActionErrorCode;
  readonly action: 'hide';
  readonly operation: string;
  readonly message: string;
}

export class LauncherDesktopActionError extends Error {
  readonly code: LauncherDesktopActionErrorCode;
  readonly action: 'hide';
  readonly operation: string;

  constructor(payload: LauncherDesktopActionErrorPayload) {
    super(payload.message);
    this.name = 'LauncherDesktopActionError';
    this.code = payload.code;
    this.action = payload.action;
    this.operation = payload.operation;
  }
}

export type TauriInvoke = <T>(command: string) => Promise<T>;

const isLauncherDesktopActionErrorPayload = (value: unknown): value is LauncherDesktopActionErrorPayload => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<Record<keyof LauncherDesktopActionErrorPayload, unknown>>;
  return (
    payload.code === 'launcher_window_action_failed' &&
    payload.action === 'hide' &&
    typeof payload.operation === 'string' &&
    payload.operation.length > 0 &&
    typeof payload.message === 'string' &&
    payload.message.length > 0
  );
};

const mapDesktopActionError = (error: unknown): LauncherDesktopActionError => {
  if (isLauncherDesktopActionErrorPayload(error)) {
    return new LauncherDesktopActionError(error);
  }

  return new LauncherDesktopActionError({
    code: 'invalid_desktop_error_payload',
    action: 'hide',
    operation: 'invoke',
    message: 'Launcher desktop action failed.',
  });
};

export const createTauriLauncherDesktopActions = (invokeCommand: TauriInvoke = invoke): LauncherDesktopActions => ({
  hideLauncher: async () => {
    try {
      await invokeCommand<void>(HIDE_LAUNCHER_COMMAND);
    } catch (error) {
      throw mapDesktopActionError(error);
    }
  },
});

export const desktopLauncherActions = createTauriLauncherDesktopActions();
