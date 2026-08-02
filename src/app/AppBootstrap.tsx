import { type ReactNode, useEffect, useRef, useState } from 'react';
import App from '../App';
import { AppProviders } from './AppProviders';
import { desktopLauncherSurfaceController, type LauncherSurfaceController } from './launcher/surface';
import { desktopLauncherWindowDragController, type LauncherWindowDragController } from './launcher/windowDrag';
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
  preferencesClient?: AppPreferencesClient;
  renderApp?: (startupState: AppStartupState) => ReactNode;
  surfaceController?: LauncherSurfaceController;
  windowDragController?: LauncherWindowDragController;
}

export const AppBootstrap = ({
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
        <App
          preferencesClient={preferencesClient}
          startupPreferencesErrorCode={startupState.preferencesErrorCode}
          surfaceController={surfaceController}
          windowDragController={windowDragController}
        />
      )}
    </AppProviders>
  );
};
