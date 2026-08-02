import { enUSMessages, zhCNMessages } from '../../i18n';
import { type AppNavigationService, HOST_SETTINGS_PAGE } from '../../navigation';
import type { LauncherActionRegistrationInput } from './types';

export const HIDE_LAUNCHER_ACTION_ID = 'lensx.core.hide_launcher';
export const OPEN_SETTINGS_ACTION_ID = 'lensx.core.open_settings';

export interface LauncherDesktopActions {
  hideLauncher: () => Promise<void>;
}

export const createHideLauncherRegistration = (
  desktopActions: LauncherDesktopActions,
): LauncherActionRegistrationInput => ({
  descriptor: {
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
    icon: { kind: 'host', token: 'hide-launcher' },
    enabled: true,
  },
  executor: () => desktopActions.hideLauncher(),
});

export const createOpenSettingsRegistration = (
  navigationService: AppNavigationService,
): LauncherActionRegistrationInput => ({
  descriptor: {
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
      'en-US': [
        enUSMessages.launcher.actions.openSettings.keywords.settings,
        enUSMessages.launcher.actions.openSettings.keywords.preferences,
        enUSMessages.launcher.actions.openSettings.keywords.configuration,
      ],
      'zh-CN': [
        zhCNMessages.launcher.actions.openSettings.keywords.settings,
        zhCNMessages.launcher.actions.openSettings.keywords.preferences,
        zhCNMessages.launcher.actions.openSettings.keywords.configuration,
      ],
    },
    icon: { kind: 'host', token: 'settings' },
    enabled: true,
  },
  executor: () => {
    navigationService.openPage(HOST_SETTINGS_PAGE, OPEN_SETTINGS_ACTION_ID);
  },
});
