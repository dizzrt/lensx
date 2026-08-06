import { type ReactNode, useEffect, useRef, useState } from 'react';
import App from '../App';
import { AppProviders } from './AppProviders';
import { productionLauncherActionService } from './launcher/actions';
import { desktopLauncherSurfaceController, type LauncherSurfaceController } from './launcher/surface';
import { desktopLauncherWindowDragController, type LauncherWindowDragController } from './launcher/windowDrag';
import { productionAppNavigationService, productionPageRegistry } from './navigation';
import { desktopLocalPluginInstallationClient, type LocalPluginInstallationClient } from './plugins/installation';
import type { ProductionPluginLifecycleComposition } from './plugins/lifecycle';
import { createProductionPluginLifecycleComposition } from './plugins/lifecycle';
import {
  type AppPreferences,
  type AppPreferencesClient,
  AppPreferencesError,
  type AppPreferencesErrorCode,
  DEFAULT_APP_PREFERENCES,
  desktopAppPreferencesClient,
} from './preferences';

export interface AppStartupState {
  readonly preferences: AppPreferences;
  readonly preferencesErrorCode?: AppPreferencesErrorCode;
}

export const resolveInitialAppPreferences = async (
  preferencesClient: AppPreferencesClient,
): Promise<AppStartupState> => {
  try {
    return {
      preferences: await preferencesClient.read(),
    };
  } catch (error) {
    return {
      preferences: DEFAULT_APP_PREFERENCES,
      preferencesErrorCode: error instanceof AppPreferencesError ? error.code : 'invalid_preferences_error_payload',
    };
  }
};

interface AppBootstrapProps {
  installationClient?: LocalPluginInstallationClient;
  preferencesClient?: AppPreferencesClient;
  renderApp?: (startupState: AppStartupState) => ReactNode;
  surfaceController?: LauncherSurfaceController;
  windowDragController?: LauncherWindowDragController;
}

type ProductionPluginLifecycleCompositionFactory = typeof createProductionPluginLifecycleComposition;

export const useProductionPluginLifecycleComposition = (
  installationClient: LocalPluginInstallationClient,
  createComposition: ProductionPluginLifecycleCompositionFactory = createProductionPluginLifecycleComposition,
): ProductionPluginLifecycleComposition | undefined => {
  const [composition, setComposition] = useState<ProductionPluginLifecycleComposition>();

  useEffect(() => {
    const next = createComposition(
      productionLauncherActionService,
      productionPageRegistry,
      productionAppNavigationService,
      installationClient,
    );
    setComposition(next);
    void next.initialize();
    return () => {
      void next.destroy();
    };
  }, [createComposition, installationClient]);

  return composition;
};

const ProductionApp = ({
  installationClient,
  preferencesClient,
  startupState,
  surfaceController,
  windowDragController,
}: {
  readonly installationClient: LocalPluginInstallationClient;
  readonly preferencesClient: AppPreferencesClient;
  readonly startupState: AppStartupState;
  readonly surfaceController: LauncherSurfaceController;
  readonly windowDragController: LauncherWindowDragController;
}) => {
  const composition = useProductionPluginLifecycleComposition(installationClient);
  if (!composition) return null;

  return (
    <App
      pluginManagementService={composition.managementService}
      preferencesClient={preferencesClient}
      startupPreferencesErrorCode={startupState.preferencesErrorCode}
      surfaceController={surfaceController}
      surfaceProjectionService={composition.surfaceProjectionService}
      windowDragController={windowDragController}
    />
  );
};

export const AppBootstrap = ({
  installationClient = desktopLocalPluginInstallationClient,
  preferencesClient = desktopAppPreferencesClient,
  renderApp,
  surfaceController = desktopLauncherSurfaceController,
  windowDragController = desktopLauncherWindowDragController,
}: AppBootstrapProps) => {
  const startupRequestRef = useRef<Promise<AppStartupState> | null>(null);
  const [startupState, setStartupState] = useState<AppStartupState>();

  useEffect(() => {
    let isCurrent = true;
    startupRequestRef.current ??= resolveInitialAppPreferences(preferencesClient);
    void startupRequestRef.current.then((result) => {
      if (isCurrent) {
        setStartupState(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [preferencesClient]);

  if (!startupState) {
    return null;
  }

  return (
    <AppProviders
      initialLocale={startupState.preferences.locale}
      initialThemeMode={startupState.preferences.theme_mode}
    >
      {renderApp ? (
        renderApp(startupState)
      ) : (
        <ProductionApp
          installationClient={installationClient}
          preferencesClient={preferencesClient}
          startupState={startupState}
          surfaceController={surfaceController}
          windowDragController={windowDragController}
        />
      )}
    </AppProviders>
  );
};
