import { describe, expect, rs, test } from '@rstest/core';
import {
  createTauriLauncherDesktopActions,
  HIDE_LAUNCHER_COMMAND,
  LauncherDesktopActionError,
  type TauriInvoke,
} from '../src/app/launcher/desktopActions';

describe('launcher desktop action adapter', () => {
  test('invokes the stable hide command without arbitrary action input', async () => {
    const invoke = rs.fn(async () => undefined) as TauriInvoke;
    const adapter = createTauriLauncherDesktopActions(invoke);

    await expect(adapter.hideLauncher()).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(HIDE_LAUNCHER_COMMAND);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  test('maps a valid Rust command error payload', async () => {
    const invoke = (async () => {
      throw {
        code: 'launcher_window_action_failed',
        action: 'hide',
        operation: 'resolve_window',
        message: "launcher action 'hide' failed during 'resolve_window'",
      };
    }) as TauriInvoke;
    const adapter = createTauriLauncherDesktopActions(invoke);

    await expect(adapter.hideLauncher()).rejects.toMatchObject({
      name: 'LauncherDesktopActionError',
      code: 'launcher_window_action_failed',
      action: 'hide',
      operation: 'resolve_window',
      message: "launcher action 'hide' failed during 'resolve_window'",
    });
  });

  test('maps unknown or invalid Rust errors without leaking their contents', async () => {
    const invoke = (async () => {
      throw new Error('secret native stack');
    }) as TauriInvoke;
    const adapter = createTauriLauncherDesktopActions(invoke);

    await expect(adapter.hideLauncher()).rejects.toEqual(
      new LauncherDesktopActionError({
        code: 'invalid_desktop_error_payload',
        action: 'hide',
        operation: 'invoke',
        message: 'Launcher desktop action failed.',
      }),
    );
  });
});
