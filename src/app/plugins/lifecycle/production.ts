import type { DefaultLauncherActionService } from '../../launcher/actions';
import type { AppNavigationService } from '../../navigation';
import { createPluginRegistrationDesktopAdapter } from '../registration';
import {
  createPluginSurfaceProjectionForLauncher,
  type PluginSurfacePageRegistry,
  type PluginSurfaceProjectionService,
} from '../surfaces';
import { createPluginLifecycleDesktopAdapter } from './desktop';
import { createPluginLifecycleService, type PluginLifecycleService } from './service';

export interface ProductionPluginLifecycleComposition {
  readonly lifecycleService: PluginLifecycleService;
  readonly surfaceProjectionService: PluginSurfaceProjectionService;
}

export const createProductionPluginLifecycleComposition = (
  actionService: DefaultLauncherActionService,
  pageRegistry: PluginSurfacePageRegistry,
  navigationService: AppNavigationService,
): ProductionPluginLifecycleComposition => {
  const registrationAdapter = createPluginRegistrationDesktopAdapter();
  const surfaceProjectionService = createPluginSurfaceProjectionForLauncher(
    actionService,
    pageRegistry,
    navigationService,
    registrationAdapter,
  );
  return Object.freeze({
    surfaceProjectionService,
    lifecycleService: createPluginLifecycleService({
      lifecycleAdapter: createPluginLifecycleDesktopAdapter(),
      surfaceProjection: surfaceProjectionService,
    }),
  });
};
