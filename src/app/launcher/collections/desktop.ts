import { invoke } from '@tauri-apps/api/core';
import {
  cloneLauncherActionCollections,
  isLauncherActionCollections,
  type LauncherActionCollections,
  type LauncherActionCollectionsClient,
  LauncherActionCollectionsError,
  type LauncherActionCollectionsErrorCode,
  type LauncherActionCollectionsErrorPayload,
  type LauncherActionCollectionsOperation,
} from './types';

export const READ_LAUNCHER_ACTION_COLLECTIONS_COMMAND = 'read_launcher_action_collections';
export const RECORD_LAUNCHER_ACTION_USE_COMMAND = 'record_launcher_action_use';
export const SET_LAUNCHER_ACTION_PINNED_COMMAND = 'set_launcher_action_pinned';

export type TauriLauncherActionCollectionsInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

const rustErrorCodes = new Set<LauncherActionCollectionsErrorCode>([
  'launcher_action_collections_capacity_reached',
  'launcher_action_collections_invalid',
  'launcher_action_collections_read_failed',
  'launcher_action_collections_write_failed',
]);
const operations = new Set<LauncherActionCollectionsOperation>(['read', 'record_use', 'set_pinned']);

const isErrorPayload = (value: unknown): value is LauncherActionCollectionsErrorPayload => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Partial<Record<keyof LauncherActionCollectionsErrorPayload, unknown>>;
  return (
    typeof payload.code === 'string' &&
    rustErrorCodes.has(payload.code as LauncherActionCollectionsErrorCode) &&
    typeof payload.operation === 'string' &&
    operations.has(payload.operation as LauncherActionCollectionsOperation) &&
    typeof payload.message === 'string' &&
    payload.message.length > 0
  );
};

const mapInvokeError = (error: unknown, operation: LauncherActionCollectionsOperation) =>
  new LauncherActionCollectionsError(
    isErrorPayload(error)
      ? error
      : {
          code: 'invalid_launcher_action_collections_error_payload',
          operation,
          message: 'Launcher action collections operation failed.',
        },
  );

const validateResponse = (value: unknown, operation: LauncherActionCollectionsOperation): LauncherActionCollections => {
  if (!isLauncherActionCollections(value)) {
    throw new LauncherActionCollectionsError({
      code: 'invalid_launcher_action_collections_payload',
      operation,
      message: 'Launcher action collections returned an invalid payload.',
    });
  }
  return cloneLauncherActionCollections(value);
};

const invokeAndValidate = async (
  invokeCommand: TauriLauncherActionCollectionsInvoke,
  command: string,
  operation: LauncherActionCollectionsOperation,
  args?: Record<string, unknown>,
) => {
  try {
    return validateResponse(await invokeCommand(command, args), operation);
  } catch (error) {
    if (error instanceof LauncherActionCollectionsError) {
      throw error;
    }
    throw mapInvokeError(error, operation);
  }
};

export const createTauriLauncherActionCollectionsClient = (
  invokeCommand: TauriLauncherActionCollectionsInvoke = invoke,
): LauncherActionCollectionsClient => ({
  read: () => invokeAndValidate(invokeCommand, READ_LAUNCHER_ACTION_COLLECTIONS_COMMAND, 'read'),
  recordUse: (actionId) =>
    invokeAndValidate(invokeCommand, RECORD_LAUNCHER_ACTION_USE_COMMAND, 'record_use', { actionId }),
  setPinned: (actionId, pinned) =>
    invokeAndValidate(invokeCommand, SET_LAUNCHER_ACTION_PINNED_COMMAND, 'set_pinned', { actionId, pinned }),
});

export const desktopLauncherActionCollectionsClient = createTauriLauncherActionCollectionsClient();
