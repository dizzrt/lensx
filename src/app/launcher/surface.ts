import { invoke } from '@tauri-apps/api/core';

export const SET_LAUNCHER_SURFACE_MODE_COMMAND = 'set_launcher_surface_mode';

export type LauncherPresentationState = 'home' | 'page' | 'search';

export interface LauncherSurfaceController {
  setPresentationState: (state: LauncherPresentationState) => Promise<void>;
}

export type TauriSurfaceInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export const createTauriLauncherSurfaceController = (
  invokeCommand: TauriSurfaceInvoke = invoke,
): LauncherSurfaceController => {
  let resizeChain = Promise.resolve();

  return {
    setPresentationState: (state) => {
      const resizeRequest = resizeChain.then(async () => {
        await invokeCommand(SET_LAUNCHER_SURFACE_MODE_COMMAND, {
          mode: state,
        });
      });
      resizeChain = resizeRequest.then(
        () => undefined,
        () => undefined,
      );
      return resizeRequest;
    },
  };
};

export const inertLauncherSurfaceController: LauncherSurfaceController = {
  setPresentationState: async () => undefined,
};

export const desktopLauncherSurfaceController = createTauriLauncherSurfaceController();
