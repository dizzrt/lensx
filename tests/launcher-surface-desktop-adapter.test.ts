import { describe, expect, rs, test } from '@rstest/core';
import { createTauriLauncherSurfaceController, SET_LAUNCHER_SURFACE_MODE_COMMAND } from '../src/app/launcher/surface';

describe('launcher surface desktop adapter', () => {
  test.each([
    'home',
    'search',
    'page',
  ] as const)('sends only the supported %s presentation mode to the constrained command', async (mode) => {
    const invoke = rs.fn(async () => undefined);
    const controller = createTauriLauncherSurfaceController(invoke);

    await expect(controller.setPresentationState(mode)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(SET_LAUNCHER_SURFACE_MODE_COMMAND, {
      mode,
    });
  });

  test('preserves the stable Rust error payload for diagnostics', async () => {
    const error = {
      code: 'launcher_surface_resize_failed',
      mode: 'page',
      operation: 'set_size',
      message: 'The launcher window could not change presentation size.',
    };
    const controller = createTauriLauncherSurfaceController(async () => {
      throw error;
    });

    await expect(controller.setPresentationState('page')).rejects.toBe(error);
  });

  test('serializes rapid presentation changes so the latest state wins in order', async () => {
    let releaseHome: () => void = () => undefined;
    const homeRequest = new Promise<void>((resolve) => {
      releaseHome = resolve;
    });
    const invokedModes: string[] = [];
    const invoke = rs.fn(async (_command: string, args?: Record<string, unknown>) => {
      const mode = String(args?.mode);
      invokedModes.push(mode);
      if (mode === 'home') {
        await homeRequest;
      }
    });
    const controller = createTauriLauncherSurfaceController(invoke);

    const home = controller.setPresentationState('home');
    const search = controller.setPresentationState('search');
    const page = controller.setPresentationState('page');
    await Promise.resolve();
    expect(invokedModes).toEqual(['home']);

    releaseHome();
    await expect(Promise.all([home, search, page])).resolves.toEqual([undefined, undefined, undefined]);
    expect(invokedModes).toEqual(['home', 'search', 'page']);
  });
});
