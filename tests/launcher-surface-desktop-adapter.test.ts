import { describe, expect, rs, test } from '@rstest/core';
import {
  createTauriLauncherSurfaceController,
  type LauncherSurfaceTarget,
  SET_LAUNCHER_SURFACE_MODE_COMMAND,
} from '../src/app/launcher/surface';

const targets = [
  { kind: 'home' },
  { kind: 'search' },
  { kind: 'host_page' },
  {
    kind: 'plugin_page',
    owner_id: 'com.acme.editor',
    page_id: 'main',
    page_attempt_id: 'page_attempt_1',
    initial_size: { width: 800, height: 600 },
    resizable: true,
  },
] as const satisfies readonly LauncherSurfaceTarget[];

describe('launcher surface desktop adapter', () => {
  test.each(targets)('sends only the supported $kind tagged target to the constrained command', async (target) => {
    const invoke = rs.fn(async () => undefined);
    const controller = createTauriLauncherSurfaceController(invoke);

    await expect(controller.setPresentationState(target)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(SET_LAUNCHER_SURFACE_MODE_COMMAND, { target });
  });

  test.each([
    { kind: 'page' },
    { kind: 'home', width: 800 },
    {
      kind: 'plugin_page',
      owner_id: 'com.acme.editor',
      page_id: 'main',
      page_attempt_id: 'page_attempt_1',
      width: 800,
      height: 600,
      resizable: true,
    },
    {
      kind: 'plugin_page',
      owner_id: 'com.acme.editor',
      page_id: 'main',
      page_attempt_id: 'page_attempt_1',
      initial_size: { width: 319, height: 600 },
      resizable: true,
    },
    {
      kind: 'plugin_page',
      owner_id: 'com.acme.editor',
      page_id: 'main',
      page_attempt_id: 'page_attempt_1',
      initial_size: { width: 800, height: 600 },
      resizable: true,
      monitor: 'primary',
    },
  ])('rejects unknown, naked, out-of-range, or native-authority target %# before invoking', async (target) => {
    const invoke = rs.fn(async () => undefined);
    const controller = createTauriLauncherSurfaceController(invoke);

    expect(() => controller.setPresentationState(target as never)).toThrow('Invalid launcher surface target.');
    expect(invoke).not.toHaveBeenCalled();
  });

  test('preserves the stable Rust error payload for diagnostics', async () => {
    const error = {
      code: 'launcher_surface_transition_failed',
      target_kind: 'plugin_page',
      operation: 'set_size',
      message: 'The launcher window could not change presentation.',
    };
    const controller = createTauriLauncherSurfaceController(async () => {
      throw error;
    });

    await expect(controller.setPresentationState(targets[3])).rejects.toBe(error);
  });

  test('serializes rapid presentation changes so the latest tagged target wins in order', async () => {
    let releaseHome: () => void = () => undefined;
    const homeRequest = new Promise<void>((resolve) => {
      releaseHome = resolve;
    });
    const invokedKinds: string[] = [];
    const invoke = rs.fn(async (_command: string, args?: Record<string, unknown>) => {
      const kind = (args?.target as LauncherSurfaceTarget).kind;
      invokedKinds.push(kind);
      if (kind === 'home') await homeRequest;
    });
    const controller = createTauriLauncherSurfaceController(invoke);

    const home = controller.setPresentationState(targets[0]);
    const search = controller.setPresentationState(targets[1]);
    const pluginPage = controller.setPresentationState(targets[3]);
    await Promise.resolve();
    expect(invokedKinds).toEqual(['home']);

    releaseHome();
    await expect(Promise.all([home, search, pluginPage])).resolves.toEqual([undefined, undefined, undefined]);
    expect(invokedKinds).toEqual(['home', 'search', 'plugin_page']);
  });
});
