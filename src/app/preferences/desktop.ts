import { invoke } from '@tauri-apps/api/core';
import {
  type AppPreferences,
  type AppPreferencesClient,
  AppPreferencesError,
  type AppPreferencesErrorCode,
  type AppPreferencesErrorPayload,
  isAppPreferences,
} from './types';

export const READ_APP_PREFERENCES_COMMAND = 'read_app_preferences';
export const WRITE_APP_PREFERENCES_COMMAND = 'write_app_preferences';

type PreferencesOperation = AppPreferencesErrorPayload['operation'];
export type TauriPreferencesInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const rustErrorCodes = new Set<AppPreferencesErrorCode>([
  'preferences_invalid',
  'preferences_read_failed',
  'preferences_write_failed',
]);

const isAppPreferencesErrorPayload = (
  value: unknown,
  operation: PreferencesOperation,
): value is AppPreferencesErrorPayload => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<Record<keyof AppPreferencesErrorPayload, unknown>>;
  return (
    typeof payload.code === 'string' &&
    rustErrorCodes.has(payload.code as AppPreferencesErrorCode) &&
    payload.operation === operation &&
    typeof payload.message === 'string' &&
    payload.message.length > 0
  );
};

const mapInvokeError = (error: unknown, operation: PreferencesOperation) => {
  if (isAppPreferencesErrorPayload(error, operation)) {
    return new AppPreferencesError(error);
  }

  return new AppPreferencesError({
    code: 'invalid_preferences_error_payload',
    operation,
    message: `Application preferences ${operation} failed.`,
  });
};

const validateResponse = (value: unknown, operation: PreferencesOperation): AppPreferences => {
  if (!isAppPreferences(value)) {
    throw new AppPreferencesError({
      code: 'invalid_preferences_payload',
      operation,
      message: `Application preferences ${operation} returned an invalid payload.`,
    });
  }

  return Object.freeze({
    theme_mode: value.theme_mode,
    locale: value.locale,
  });
};

export const createTauriAppPreferencesClient = (
  invokeCommand: TauriPreferencesInvoke = invoke,
): AppPreferencesClient => ({
  read: async () => {
    try {
      return validateResponse(await invokeCommand(READ_APP_PREFERENCES_COMMAND), 'read');
    } catch (error) {
      if (error instanceof AppPreferencesError) {
        throw error;
      }
      throw mapInvokeError(error, 'read');
    }
  },
  write: async (preferences) => {
    if (!isAppPreferences(preferences)) {
      throw new AppPreferencesError({
        code: 'preferences_invalid',
        operation: 'write',
        message: 'Application preferences are invalid.',
      });
    }

    try {
      return validateResponse(
        await invokeCommand(WRITE_APP_PREFERENCES_COMMAND, {
          preferences,
        }),
        'write',
      );
    } catch (error) {
      if (error instanceof AppPreferencesError) {
        throw error;
      }
      throw mapInvokeError(error, 'write');
    }
  },
});

export const desktopAppPreferencesClient = createTauriAppPreferencesClient();
