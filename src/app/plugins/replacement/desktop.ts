import { invoke } from '@tauri-apps/api/core';
import { parsePluginReplacementError, parsePluginReplacementResult } from './parse';
import {
  CANCEL_PLUGIN_REPLACEMENT_COMMAND,
  COMMIT_LOCAL_PLUGIN_REPLACEMENT_COMMAND,
  type PluginReplacementDesktopAdapter,
  PluginReplacementError,
  type PluginReplacementOperation,
  PREPARE_LOCAL_PLUGIN_REPLACEMENT_COMMAND,
} from './types';

export type PluginReplacementInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const call = async (
  invokeCommand: PluginReplacementInvoke,
  command: string,
  request: object,
  operation: PluginReplacementOperation,
) => {
  try {
    return parsePluginReplacementResult(await invokeCommand(command, { request }));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new PluginReplacementError({
        code: 'invalid_boundary_payload',
        operation,
        message: 'Plugin replacement returned an invalid response.',
      });
    }
    try {
      throw new PluginReplacementError(parsePluginReplacementError(error));
    } catch (boundaryError) {
      if (boundaryError instanceof PluginReplacementError) throw boundaryError;
      throw new PluginReplacementError({
        code: 'invalid_boundary_payload',
        operation,
        message: 'Plugin replacement returned an invalid response.',
      });
    }
  }
};

export const createPluginReplacementDesktopAdapter = (
  invokeCommand: PluginReplacementInvoke = invoke as PluginReplacementInvoke,
): PluginReplacementDesktopAdapter => ({
  prepare: (request) => call(invokeCommand, PREPARE_LOCAL_PLUGIN_REPLACEMENT_COMMAND, request, 'prepare'),
  commit: (request) => call(invokeCommand, COMMIT_LOCAL_PLUGIN_REPLACEMENT_COMMAND, request, 'commit'),
  cancel: (request) => call(invokeCommand, CANCEL_PLUGIN_REPLACEMENT_COMMAND, request, 'cancel'),
});

export const desktopPluginReplacementAdapter = createPluginReplacementDesktopAdapter();
