import { invoke } from '@tauri-apps/api/core';
import { parseLocalPluginInstallationError, parseLocalPluginInstallationResult } from './parse';
import {
  INSTALL_LOCAL_PLUGIN_COMMAND,
  type LocalPluginInstallationClient,
  LocalPluginInstallationError,
} from './types';

export type LocalPluginInstallationInvoke = (command: string) => Promise<unknown>;

export const createLocalPluginInstallationClient = (
  invokeCommand: LocalPluginInstallationInvoke = invoke as LocalPluginInstallationInvoke,
): LocalPluginInstallationClient => ({
  install: async () => {
    try {
      return parseLocalPluginInstallationResult(await invokeCommand(INSTALL_LOCAL_PLUGIN_COMMAND));
    } catch (error) {
      if (error instanceof LocalPluginInstallationError) {
        throw error;
      }
      try {
        throw new LocalPluginInstallationError(parseLocalPluginInstallationError(error));
      } catch (boundaryError) {
        if (boundaryError instanceof LocalPluginInstallationError) {
          throw boundaryError;
        }
        throw new LocalPluginInstallationError({
          code: 'invalid_boundary_payload',
          operation: 'register',
          message: 'Local plugin installation returned an invalid response.',
        });
      }
    }
  },
});

export const desktopLocalPluginInstallationClient = createLocalPluginInstallationClient();
