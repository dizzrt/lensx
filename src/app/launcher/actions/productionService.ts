import { desktopLauncherActions } from '../desktopActions';
import { createDefaultLauncherActionService } from './service';

export const productionLauncherActionService = createDefaultLauncherActionService(desktopLauncherActions);
