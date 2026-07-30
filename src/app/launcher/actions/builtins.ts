import { enUSMessages, zhCNMessages } from '../../i18n';
import type { LauncherActionRegistrationInput } from './types';

export const HIDE_LAUNCHER_ACTION_ID = 'lensx.core.hide_launcher';

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
    enabled: true,
  },
  executor: () => desktopActions.hideLauncher(),
});
