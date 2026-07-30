import { describe, expect, rs, test } from '@rstest/core';
import { enUSMessages, zhCNMessages } from '../src/app/i18n';
import {
  createDefaultLauncherActionService,
  HIDE_LAUNCHER_ACTION_ID,
  type LauncherDesktopActions,
} from '../src/app/launcher/actions';

describe('default launcher action service', () => {
  test('registers only the real message-derived hide action', () => {
    const desktopActions: LauncherDesktopActions = {
      hideLauncher: rs.fn(async () => undefined),
    };
    const service = createDefaultLauncherActionService(desktopActions);

    expect(service.registry.snapshot()).toEqual([
      {
        action_id: HIDE_LAUNCHER_ACTION_ID,
        owner_id: 'lensx.core',
        title: {
          'en-US': enUSMessages.launcher.actions.hideLauncher.title,
          'zh-CN': zhCNMessages.launcher.actions.hideLauncher.title,
        },
        description: {
          'en-US': enUSMessages.launcher.actions.hideLauncher.description,
          'zh-CN': zhCNMessages.launcher.actions.hideLauncher.description,
        },
        default_keywords: {
          'en-US': ['hide', 'launcher', 'window'],
          'zh-CN': ['隐藏', '启动器', '窗口'],
        },
        enabled: true,
      },
    ]);
  });

  test('dispatches registry action through the injected desktop adapter', async () => {
    const hideLauncher = rs.fn(async () => undefined);
    const service = createDefaultLauncherActionService({ hideLauncher });

    await expect(service.dispatcher.dispatch(HIDE_LAUNCHER_ACTION_ID)).resolves.toEqual({
      ok: true,
      action_id: HIDE_LAUNCHER_ACTION_ID,
    });
    expect(hideLauncher).toHaveBeenCalledTimes(1);
  });

  test('maps desktop adapter rejection to the unified dispatcher failure', async () => {
    const service = createDefaultLauncherActionService({
      hideLauncher: async () => {
        throw new Error('native internals');
      },
    });

    await expect(service.dispatcher.dispatch(HIDE_LAUNCHER_ACTION_ID)).resolves.toEqual({
      ok: false,
      action_id: HIDE_LAUNCHER_ACTION_ID,
      error: {
        code: 'action_execution_failed',
        message: 'Launcher action execution failed.',
      },
    });
  });
});
