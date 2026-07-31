import { describe, expect, rs, test } from '@rstest/core';
import { enUSMessages, zhCNMessages } from '../src/app/i18n';
import {
  createDefaultLauncherActionService,
  HIDE_LAUNCHER_ACTION_ID,
  type LauncherDesktopActions,
  OPEN_SETTINGS_ACTION_ID,
} from '../src/app/launcher/actions';
import { AppNavigationService, HostPageCatalog } from '../src/app/navigation';

describe('default launcher action service', () => {
  test('registers the real message-derived Host actions without exposing executors or page targets', () => {
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
      {
        action_id: OPEN_SETTINGS_ACTION_ID,
        owner_id: 'lensx.core',
        title: {
          'en-US': enUSMessages.launcher.actions.openSettings.title,
          'zh-CN': zhCNMessages.launcher.actions.openSettings.title,
        },
        description: {
          'en-US': enUSMessages.launcher.actions.openSettings.description,
          'zh-CN': zhCNMessages.launcher.actions.openSettings.description,
        },
        default_keywords: {
          'en-US': ['settings', 'preferences', 'configuration'],
          'zh-CN': ['设置', '偏好', '配置'],
        },
        enabled: true,
      },
    ]);
    expect(JSON.stringify(service.registry.snapshot())).not.toContain('executor');
    expect(JSON.stringify(service.registry.snapshot())).not.toContain('page_id');
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

  test('dispatches Open Settings through the injected framework-neutral navigation service', async () => {
    const navigationService = new AppNavigationService(
      new HostPageCatalog([
        {
          owner_id: 'lensx.core',
          page_id: 'settings',
          enabled: true,
        },
      ]),
    );
    const handler = rs.fn();
    navigationService.registerHandler(handler);
    const service = createDefaultLauncherActionService({ hideLauncher: async () => undefined }, navigationService);

    await expect(service.dispatcher.dispatch(OPEN_SETTINGS_ACTION_ID)).resolves.toEqual({
      ok: true,
      action_id: OPEN_SETTINGS_ACTION_ID,
    });
    expect(handler).toHaveBeenCalledWith({
      owner_id: 'lensx.core',
      page_id: 'settings',
      opened_by_action_id: OPEN_SETTINGS_ACTION_ID,
    });
  });

  test('contains navigation preflight failures as the existing dispatcher error', async () => {
    const navigationService = new AppNavigationService(new HostPageCatalog([]));
    const service = createDefaultLauncherActionService({ hideLauncher: async () => undefined }, navigationService);

    await expect(service.dispatcher.dispatch(OPEN_SETTINGS_ACTION_ID)).resolves.toEqual({
      ok: false,
      action_id: OPEN_SETTINGS_ACTION_ID,
      error: {
        code: 'action_execution_failed',
        message: 'Launcher action execution failed.',
      },
    });
  });
});
