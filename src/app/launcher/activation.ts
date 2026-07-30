import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const LAUNCHER_ACTIVATED_EVENT = 'launcher://activated';

export type LauncherActivationReason = 'startup' | 'global_shortcut' | 'programmatic';

export interface LauncherActivationPayload {
  reason: LauncherActivationReason;
}

export type LauncherActivationListener = (payload: LauncherActivationPayload) => void;
export type LauncherActivationErrorListener = (error: unknown) => void;

export interface LauncherActivationSource {
  subscribe: (listener: LauncherActivationListener, onError: LauncherActivationErrorListener) => Promise<UnlistenFn>;
}

const ACTIVATION_REASONS = new Set<LauncherActivationReason>(['startup', 'global_shortcut', 'programmatic']);

export const parseLauncherActivationPayload = (payload: unknown): LauncherActivationPayload => {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('Launcher activation payload must be an object.');
  }

  const { reason } = payload as { reason?: unknown };
  if (typeof reason !== 'string' || !ACTIVATION_REASONS.has(reason as LauncherActivationReason)) {
    throw new TypeError(`Launcher activation reason is invalid: ${String(reason)}`);
  }

  return {
    reason: reason as LauncherActivationReason,
  };
};

export const desktopLauncherActivationSource: LauncherActivationSource = {
  subscribe: (listener, onError) =>
    listen<unknown>(LAUNCHER_ACTIVATED_EVENT, ({ payload }) => {
      try {
        listener(parseLauncherActivationPayload(payload));
      } catch (error) {
        onError(error);
      }
    }),
};
