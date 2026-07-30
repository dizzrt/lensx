import { createHideLauncherRegistration, type LauncherDesktopActions } from './builtins';
import { LauncherActionDispatcher } from './dispatcher';
import { LauncherActionRegistry } from './registry';

export interface LauncherActionService {
  readonly registry: LauncherActionRegistry;
  readonly dispatcher: LauncherActionDispatcher;
}

export const createDefaultLauncherActionService = (desktopActions: LauncherDesktopActions): LauncherActionService => {
  const registry = new LauncherActionRegistry();
  const registrationResult = registry.registerBatch([createHideLauncherRegistration(desktopActions)]);
  if (!registrationResult.ok) {
    throw new Error('Default launcher actions failed Host validation.');
  }

  return Object.freeze({
    registry,
    dispatcher: new LauncherActionDispatcher(registry),
  });
};
