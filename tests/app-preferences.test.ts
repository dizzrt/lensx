import { describe, expect, rs, test } from '@rstest/core';
import {
  AppPreferencesError,
  createTauriAppPreferencesClient,
  DEFAULT_APP_PREFERENCES,
  isAppPreferences,
  READ_APP_PREFERENCES_COMMAND,
  WRITE_APP_PREFERENCES_COMMAND,
} from '../src/app/preferences';

describe('application preferences desktop boundary', () => {
  test('validates supported preferences and rejects malformed values', () => {
    expect(isAppPreferences(DEFAULT_APP_PREFERENCES)).toBe(true);
    expect(isAppPreferences({ theme_mode: 'dark', locale: 'zh-CN' })).toBe(true);
    expect(isAppPreferences({ theme_mode: 'system', locale: 'en-US' })).toBe(false);
    expect(isAppPreferences({ theme_mode: 'light', locale: 'fr-FR' })).toBe(false);
    expect(isAppPreferences({ theme_mode: 'light' })).toBe(false);
  });

  test('reads and writes complete validated snapshots through typed commands', async () => {
    const invoke = rs.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === READ_APP_PREFERENCES_COMMAND) {
        return { theme_mode: 'dark', locale: 'zh-CN' };
      }
      expect(command).toBe(WRITE_APP_PREFERENCES_COMMAND);
      expect(args).toEqual({
        preferences: { theme_mode: 'light', locale: 'zh-CN' },
      });
      return args?.preferences;
    });
    const client = createTauriAppPreferencesClient(invoke);

    await expect(client.read()).resolves.toEqual({ theme_mode: 'dark', locale: 'zh-CN' });
    await expect(client.write({ theme_mode: 'light', locale: 'zh-CN' })).resolves.toEqual({
      theme_mode: 'light',
      locale: 'zh-CN',
    });
  });

  test('maps invalid responses and Rust errors to safe typed failures', async () => {
    const invalidResponseClient = createTauriAppPreferencesClient(async () => ({
      theme_mode: 'system',
      locale: 'en-US',
    }));
    await expect(invalidResponseClient.read()).rejects.toMatchObject({
      code: 'invalid_preferences_payload',
      operation: 'read',
    });

    const rustErrorClient = createTauriAppPreferencesClient(async () => {
      throw {
        code: 'preferences_read_failed',
        operation: 'read',
        message: 'Application preferences could not be read.',
      };
    });
    await expect(rustErrorClient.read()).rejects.toBeInstanceOf(AppPreferencesError);
    await expect(rustErrorClient.read()).rejects.toMatchObject({
      code: 'preferences_read_failed',
      operation: 'read',
      message: 'Application preferences could not be read.',
    });

    const malformedErrorClient = createTauriAppPreferencesClient(async () => {
      throw new Error('sensitive desktop detail');
    });
    await expect(malformedErrorClient.read()).rejects.toMatchObject({
      code: 'invalid_preferences_error_payload',
      operation: 'read',
      message: 'Application preferences read failed.',
    });
  });
});
