import type { DefaultLauncherActionService } from '../../launcher/actions';
import type { AppNavigationService } from '../../navigation';
import { createPluginDataManagementDesktopAdapter, createPluginDataManagementService } from '../data-management';
import { createLocalPluginInstallationService, type LocalPluginInstallationClient } from '../installation';
import { createPluginManagementService, type PluginManagementService } from '../management';
import { createPluginPermissionMutationAdapter, createPluginPermissionService } from '../permission';
import { createPluginRegistrationDesktopAdapter } from '../registration';
import { createPluginReplacementDesktopAdapter, createPluginReplacementService } from '../replacement';
import {
  createPluginSurfaceProjectionForLauncher,
  type PluginSurfacePageRegistry,
  type PluginSurfaceProjectionService,
} from '../surfaces';
import { createPluginLifecycleDesktopAdapter } from './desktop';
import { createPluginLifecycleService, type PluginLifecycleService } from './service';

export interface ProductionPluginLifecycleComposition {
  readonly lifecycleService: PluginLifecycleService;
  readonly managementService: PluginManagementService;
  readonly surfaceProjectionService: PluginSurfaceProjectionService;
  readonly initialize: () => Promise<void>;
  readonly destroy: () => Promise<void>;
}

export const createProductionPluginLifecycleComposition = (
  actionService: DefaultLauncherActionService,
  pageRegistry: PluginSurfacePageRegistry,
  navigationService: AppNavigationService,
  installationClient: LocalPluginInstallationClient,
): ProductionPluginLifecycleComposition => {
  const registrationAdapter = createPluginRegistrationDesktopAdapter();
  const surfaceProjectionService = createPluginSurfaceProjectionForLauncher(
    actionService,
    pageRegistry,
    navigationService,
    registrationAdapter,
  );
  const lifecycleService = createPluginLifecycleService({
    lifecycleAdapter: createPluginLifecycleDesktopAdapter(),
    surfaceProjection: surfaceProjectionService,
  });
  const replacementService = createPluginReplacementService({
    replacementAdapter: createPluginReplacementDesktopAdapter(),
    surfaceProjection: surfaceProjectionService,
  });
  const permissionService = createPluginPermissionService(createPluginPermissionMutationAdapter());
  const dataManagementService = createPluginDataManagementService(createPluginDataManagementDesktopAdapter());
  const installationService = createLocalPluginInstallationService(installationClient);
  const managementService = createPluginManagementService({
    surfaceProjection: surfaceProjectionService,
    installationService,
    lifecycleService,
    replacementService,
    permissionService,
    dataManagementService,
  });
  let initializePromise: Promise<void> | undefined;
  let destroyPromise: Promise<void> | undefined;
  return Object.freeze({
    surfaceProjectionService,
    lifecycleService,
    managementService,
    initialize() {
      if (destroyPromise) return destroyPromise.then(() => undefined);
      initializePromise ??= managementService.initialize();
      return initializePromise;
    },
    destroy() {
      destroyPromise ??= (async () => {
        await managementService.destroy();
        await surfaceProjectionService.destroy();
      })();
      return destroyPromise;
    },
  });
};
