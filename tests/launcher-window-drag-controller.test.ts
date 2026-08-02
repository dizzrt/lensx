import { describe, expect, rs, test } from '@rstest/core';
import {
  createTauriLauncherWindowDragController,
  inertLauncherWindowDragController,
} from '../src/app/launcher/windowDrag';

describe('launcher window drag controller', () => {
  test('delegates only the start-dragging operation', async () => {
    const startDragging = rs.fn(async () => undefined);
    const controller = createTauriLauncherWindowDragController(startDragging);

    await expect(controller.startDragging()).resolves.toBeUndefined();
    expect(startDragging).toHaveBeenCalledTimes(1);
    expect(startDragging).toHaveBeenCalledWith();
    expect(Object.keys(controller)).toEqual(['startDragging']);
  });

  test('propagates the native rejection unchanged', async () => {
    const error = new Error('native startDragging failed');
    const controller = createTauriLauncherWindowDragController(async () => {
      throw error;
    });

    await expect(controller.startDragging()).rejects.toBe(error);
  });

  test('provides an inert implementation outside the desktop composition', async () => {
    await expect(inertLauncherWindowDragController.startDragging()).resolves.toBeUndefined();
  });
});
