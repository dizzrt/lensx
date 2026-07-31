import type { AppLocale } from '../i18n';
import type { ThemeMode } from '../theme';

export interface AppPreferences {
  readonly theme_mode: ThemeMode;
  readonly locale: AppLocale;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = Object.freeze({
  theme_mode: 'light',
  locale: 'en-US',
});

export const isAppPreferences = (value: unknown): value is AppPreferences => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const preferences = value as Partial<Record<keyof AppPreferences, unknown>>;
  return (
    (preferences.theme_mode === 'light' || preferences.theme_mode === 'dark') &&
    (preferences.locale === 'en-US' || preferences.locale === 'zh-CN')
  );
};

export type AppPreferencesErrorCode =
  | 'invalid_preferences_error_payload'
  | 'invalid_preferences_payload'
  | 'preferences_invalid'
  | 'preferences_read_failed'
  | 'preferences_write_failed';

export interface AppPreferencesErrorPayload {
  readonly code: AppPreferencesErrorCode;
  readonly operation: 'read' | 'write';
  readonly message: string;
}

export class AppPreferencesError extends Error {
  readonly code: AppPreferencesErrorCode;
  readonly operation: 'read' | 'write';

  constructor(payload: AppPreferencesErrorPayload) {
    super(payload.message);
    this.name = 'AppPreferencesError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}

export interface AppPreferencesClient {
  read: () => Promise<AppPreferences>;
  write: (preferences: AppPreferences) => Promise<AppPreferences>;
}
