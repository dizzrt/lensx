import { invoke } from '@tauri-apps/api/core';
import { ref } from 'vue';
import { type AppThemeMode, appThemeMode, DEFAULT_THEME_MODE } from '@/app/theme/theme';

export type ThemeMode = AppThemeMode;

export type AppPreferences = {
  theme_mode: ThemeMode;
};

export type PreferenceFileStatus = 'ok' | 'missing' | 'corrupted';

export type AppPreferencesState = {
  preferences: AppPreferences;
  file_status: PreferenceFileStatus;
  diagnostic?: string | null;
};

export type UpdateAppPreferencesRequest = {
  theme_mode?: ThemeMode;
};

export const appPreferencesState = ref<AppPreferencesState>({
  preferences: {
    theme_mode: DEFAULT_THEME_MODE,
  },
  file_status: 'missing',
  diagnostic: null,
});

export const appPreferencesLoadError = ref<string | null>(null);

const applyPreferencesState = (state: AppPreferencesState): AppPreferencesState => {
  appPreferencesState.value = state;
  appThemeMode.value = state.preferences.theme_mode;
  return state;
};

export const getAppPreferences = async (): Promise<AppPreferencesState> => {
  return invoke<AppPreferencesState>('get_app_preferences');
};

export const loadAppPreferences = async (): Promise<AppPreferencesState> => {
  try {
    appPreferencesLoadError.value = null;
    return applyPreferencesState(await getAppPreferences());
  } catch (error) {
    appThemeMode.value = DEFAULT_THEME_MODE;
    appPreferencesLoadError.value = error instanceof Error ? error.message : String(error);
    throw error;
  }
};

export const updateAppPreferences = async (request: UpdateAppPreferencesRequest): Promise<AppPreferencesState> => {
  return applyPreferencesState(await invoke<AppPreferencesState>('update_app_preferences', { request }));
};
