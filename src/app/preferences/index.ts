export {
  createTauriAppPreferencesClient,
  desktopAppPreferencesClient,
  READ_APP_PREFERENCES_COMMAND,
  type TauriPreferencesInvoke,
  WRITE_APP_PREFERENCES_COMMAND,
} from './desktop';
export {
  type AppPreferences,
  type AppPreferencesClient,
  AppPreferencesError,
  type AppPreferencesErrorCode,
  type AppPreferencesErrorPayload,
  DEFAULT_APP_PREFERENCES,
  isAppPreferences,
} from './types';
