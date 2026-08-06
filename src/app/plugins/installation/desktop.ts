import { invoke } from '@tauri-apps/api/core';
import {
  createLocalPluginInstallationRequest,
  parseLocalPluginInstallationError,
  parseLocalPluginInstallationResult,
} from './parse';
import {
  CANCEL_LOCAL_PLUGIN_INSTALLATION_COMMAND,
  COMMIT_LOCAL_PLUGIN_INSTALLATION_COMMAND,
  type LocalPluginInstallationClient,
  LocalPluginInstallationError,
  type LocalPluginInstallationOperation,
  type LocalPluginInstallationResult,
  PREPARE_LOCAL_PLUGIN_INSTALLATION_COMMAND,
} from './types';

export type LocalPluginInstallationInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const boundaryError = (operation: LocalPluginInstallationOperation) =>
  new LocalPluginInstallationError({
    code: 'invalid_boundary_payload',
    operation,
    message: 'Local plugin installation returned an invalid response.',
  });
const invokeOperation = async (
  invokeCommand: LocalPluginInstallationInvoke,
  command: string,
  operation: LocalPluginInstallationOperation,
  args?: Record<string, unknown>,
): Promise<LocalPluginInstallationResult> => {
  try {
    return parseLocalPluginInstallationResult(await invokeCommand(command, args));
  } catch (error) {
    if (error instanceof LocalPluginInstallationError) throw error;
    try {
      throw new LocalPluginInstallationError(parseLocalPluginInstallationError(error));
    } catch (parseError) {
      if (parseError instanceof LocalPluginInstallationError) throw parseError;
      throw boundaryError(operation);
    }
  }
};

export const createLocalPluginInstallationClient = (
  invokeCommand: LocalPluginInstallationInvoke = invoke as LocalPluginInstallationInvoke,
): LocalPluginInstallationClient =>
  Object.freeze({
    async prepare() {
      const result = await invokeOperation(invokeCommand, PREPARE_LOCAL_PLUGIN_INSTALLATION_COMMAND, 'prepare');
      if (result.status === 'installed' || result.operation !== 'prepare') throw boundaryError('prepare');
      return result;
    },
    async commit(preparationToken: string) {
      const result = await invokeOperation(invokeCommand, COMMIT_LOCAL_PLUGIN_INSTALLATION_COMMAND, 'commit', {
        request: createLocalPluginInstallationRequest(preparationToken),
      });
      if (result.status !== 'installed') throw boundaryError('commit');
      return result;
    },
    async cancel(preparationToken: string) {
      const result = await invokeOperation(invokeCommand, CANCEL_LOCAL_PLUGIN_INSTALLATION_COMMAND, 'cancel', {
        request: createLocalPluginInstallationRequest(preparationToken),
      });
      if (result.status !== 'cancelled' || result.operation !== 'cancel') throw boundaryError('cancel');
      return result;
    },
  });

export const desktopLocalPluginInstallationClient = createLocalPluginInstallationClient();
