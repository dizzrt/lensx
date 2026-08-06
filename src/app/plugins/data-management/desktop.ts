import { invoke } from '@tauri-apps/api/core';
import { parseClearPluginDataResult, parsePluginDataManagementError } from './parse';
import { CLEAR_PLUGIN_DATA_COMMAND, type PluginDataManagementDesktopAdapter, PluginDataManagementError } from './types';

export type PluginDataManagementInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export const createPluginDataManagementDesktopAdapter = (
  invokeCommand: PluginDataManagementInvoke = invoke as PluginDataManagementInvoke,
): PluginDataManagementDesktopAdapter =>
  Object.freeze({
    async clear(request: Parameters<PluginDataManagementDesktopAdapter['clear']>[0]) {
      try {
        return parseClearPluginDataResult(await invokeCommand(CLEAR_PLUGIN_DATA_COMMAND, { request }));
      } catch (error) {
        if (error instanceof TypeError) {
          throw new PluginDataManagementError({
            code: 'invalid_boundary_payload',
            message: 'Plugin data management returned an invalid response.',
          });
        }
        try {
          throw new PluginDataManagementError(parsePluginDataManagementError(error));
        } catch (boundaryError) {
          if (boundaryError instanceof PluginDataManagementError) throw boundaryError;
          throw new PluginDataManagementError({
            code: 'invalid_boundary_payload',
            message: 'Plugin data management returned an invalid response.',
          });
        }
      }
    },
  });

export const desktopPluginDataManagementAdapter = createPluginDataManagementDesktopAdapter();
