import { getCurrentWindow } from '@tauri-apps/api/window';

export const LAUNCHER_WINDOW_DRAG_EXCLUDE_ATTRIBUTE = 'data-launcher-drag-exclude';

export interface LauncherWindowDragController {
  startDragging: () => Promise<void>;
}

export type TauriStartDragging = () => Promise<void>;

const startCurrentWindowDragging: TauriStartDragging = () => getCurrentWindow().startDragging();

export const createTauriLauncherWindowDragController = (
  startDragging: TauriStartDragging = startCurrentWindowDragging,
): LauncherWindowDragController => ({
  startDragging,
});

export const isLauncherWindowDragExcluded = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`[${LAUNCHER_WINDOW_DRAG_EXCLUDE_ATTRIBUTE}]`) !== null;

export const inertLauncherWindowDragController: LauncherWindowDragController = {
  startDragging: async () => undefined,
};

export const desktopLauncherWindowDragController = createTauriLauncherWindowDragController();
