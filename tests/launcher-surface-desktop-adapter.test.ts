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
    const invoke = rs.fn(async (command: string) =>
      command === 'read_main_surface_epoch'
        ? { contract_version: '0.1.0', host_epoch: '1' }
        : command === 'begin_main_surface_intent'
          ? { contract_version: '0.1.0', host_epoch: '1', intent_epoch: '1' }
          : undefined,
    );
    const controller = createTauriLauncherSurfaceController(invoke);
    const lease = await controller.prepareNavigation?.();
    await expect(controller.setPresentationState(target, lease)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(SET_LAUNCHER_SURFACE_MODE_COMMAND, {
      request: {
        contract_version: '0.1.0',
        host_epoch: '1',
        intent_epoch: '1',
        presentation_revision: '1',
        binding: null,
        target,
      },
    });
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
    const controller = createTauriLauncherSurfaceController(async (command) => {
      if (command === 'read_main_surface_epoch') return { contract_version: '0.1.0', host_epoch: '1' };
      if (command === 'begin_main_surface_intent')
        return { contract_version: '0.1.0', host_epoch: '1', intent_epoch: '1' };
      throw error;
    });
    const lease = await controller.prepareNavigation?.();
    await expect(controller.setPresentationState(targets[3], lease)).rejects.toBe(error);
  });

  test('serializes rapid presentation changes so the latest tagged target wins in order', async () => {
    let releaseHome: () => void = () => undefined;
    const homeRequest = new Promise<void>((resolve) => {
      releaseHome = resolve;
    });
    const invokedKinds: string[] = [];
    const invoke = rs.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'read_main_surface_epoch') return { contract_version: '0.1.0', host_epoch: '1' };
      if (command === 'begin_main_surface_intent')
        return { contract_version: '0.1.0', host_epoch: '1', intent_epoch: '1' };
      const kind = (args?.request as { target: LauncherSurfaceTarget }).target.kind;
      invokedKinds.push(kind);
      if (kind === 'home') await homeRequest;
    });
    const controller = createTauriLauncherSurfaceController(invoke);

    const lease = await controller.prepareNavigation?.();
    const home = controller.setPresentationState(targets[0], lease);
    const search = controller.setPresentationState(targets[1], lease);
    const pluginPage = controller.setPresentationState(targets[3], lease);
    await Promise.resolve();
    expect(invokedKinds).toEqual(['home']);

    releaseHome();
    await expect(Promise.all([home, search, pluginPage])).resolves.toEqual([undefined, undefined, undefined]);
    expect(invokedKinds).toEqual(['home', 'search', 'plugin_page']);
  });
  test('rejects missing native leases and drops queued old Page intents after renewal', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: Array<Record<string, unknown>> = [];
    const invoke = rs.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'read_main_surface_epoch') return { contract_version: '0.1.0', host_epoch: '5' };
      const request = args?.request as Record<string, unknown>;
      if (command === 'begin_main_surface_intent')
        return { contract_version: '0.1.0', host_epoch: '5', intent_epoch: request.navigation_revision };
      requests.push(request);
      if (requests.length === 1) await held;
    });
    const controller = createTauriLauncherSurfaceController(invoke);
    await expect(controller.setPresentationState(targets[0])).rejects.toThrow('lease is unavailable');
    expect(invoke).not.toHaveBeenCalled();
    const first = await controller.prepareNavigation?.();
    const pending = controller.setPresentationState(targets[0], first);
    await Promise.resolve();
    const stale = controller.setPresentationState(targets[3], first);
    controller.suspend?.();
    const second = await controller.prepareNavigation?.();
    const latest = controller.setPresentationState(targets[1], second);
    release();
    await Promise.all([pending, stale, latest]);
    expect(requests.map((request) => request.target)).toEqual([targets[0], targets[1]]);
    expect(requests[0].intent_epoch).not.toEqual(requests[1].intent_epoch);
    expect(requests.map((request) => request.presentation_revision)).toEqual(['1', '3']);
  });
});
