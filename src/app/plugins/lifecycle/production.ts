import { createProductionPluginDevelopmentService } from '@/app/plugins/development/composition';
import type { DefaultLauncherActionService } from '../../launcher/actions';
import type { AppNavigationService } from '../../navigation';
import { createPluginDataManagementDesktopAdapter, createPluginDataManagementService } from '../data-management';
import { createLocalPluginInstallationService, type LocalPluginInstallationClient } from '../installation';
import { createPluginManagementService, type PluginManagementService } from '../management';
import { createPluginPermissionMutationAdapter, createPluginPermissionService } from '../permission';
import { createPluginRegistrationDesktopAdapter } from '../registration';
import { createPluginReplacementDesktopAdapter, createPluginReplacementService } from '../replacement';
import { createPluginRuntimeLifecycleService, type PluginRuntimeLifecycleService } from '../runtime';
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
  readonly runtimeLifecycleService: PluginRuntimeLifecycleService;
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
  const developmentService = createProductionPluginDevelopmentService(surfaceProjectionService);
  const runtimeLifecycleService = createPluginRuntimeLifecycleService();
  const managementService = createPluginManagementService({
    surfaceProjection: surfaceProjectionService,
    installationService,
    lifecycleService,
    replacementService,
    permissionService,
    dataManagementService,
    developmentService,
  });
  let initializePromise: Promise<void> | undefined;
  let destroyPromise: Promise<void> | undefined;
  return Object.freeze({
    surfaceProjectionService,
    lifecycleService,
    managementService,
    runtimeLifecycleService,
    initialize() {
      if (destroyPromise) return destroyPromise.then(() => undefined);
      initializePromise ??= managementService.initialize();
      return initializePromise;
    },
    destroy() {
      destroyPromise ??= (async () => {
        await runtimeLifecycleService.dispose();
        await managementService.destroy();
        await surfaceProjectionService.destroy();
      })();
      return destroyPromise;
    },
  });
};
