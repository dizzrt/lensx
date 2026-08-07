import { invoke } from '@tauri-apps/api/core';
import { parsePluginDevelopmentCapability, parsePluginDevelopmentError, parsePluginDevelopmentResult } from './parse';
import {
  type PluginDevelopmentDesktopAdapter,
  PluginDevelopmentError,
  type PluginDevelopmentOperation,
  READ_PLUGIN_DEVELOPMENT_CAPABILITY_COMMAND,
  REGISTER_PLUGIN_DEVELOPMENT_DIRECTORY_COMMAND,
  RELOAD_PLUGIN_DEVELOPMENT_ENTRY_COMMAND,
  REMOVE_PLUGIN_DEVELOPMENT_ENTRY_COMMAND,
  SET_PLUGIN_DEVELOPMENT_MODE_COMMAND,
} from './types';

export type PluginDevelopmentInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const boundary = (operation: PluginDevelopmentOperation) =>
  new PluginDevelopmentError({
    code: 'invalid_boundary_payload',
    operation,
    message: 'Plugin development returned an invalid response.',
  });

const call = async <T>(
  invokeCommand: PluginDevelopmentInvoke,
  command: string,
  operation: PluginDevelopmentOperation,
  parse: (value: unknown) => T,
  args?: Record<string, unknown>,
): Promise<T> => {
  try {
    return parse(await invokeCommand(command, args));
  } catch (error) {
    if (error instanceof PluginDevelopmentError) throw error;
    if (error instanceof TypeError) throw boundary(operation);
    try {
      throw new PluginDevelopmentError(parsePluginDevelopmentError(error));
    } catch (parsed) {
      if (parsed instanceof PluginDevelopmentError) throw parsed;
      throw boundary(operation);
    }
  }
};

export const createPluginDevelopmentDesktopAdapter = (
  invokeCommand: PluginDevelopmentInvoke = invoke as PluginDevelopmentInvoke,
): PluginDevelopmentDesktopAdapter =>
  Object.freeze({
    readCapability: () =>
      call(
        invokeCommand,
        READ_PLUGIN_DEVELOPMENT_CAPABILITY_COMMAND,
        'read_capability',
        parsePluginDevelopmentCapability,
      ),
    setMode: (request: Parameters<PluginDevelopmentDesktopAdapter['setMode']>[0]) =>
      call(invokeCommand, SET_PLUGIN_DEVELOPMENT_MODE_COMMAND, 'set_mode', parsePluginDevelopmentResult, { request }),
    register: () =>
      call(invokeCommand, REGISTER_PLUGIN_DEVELOPMENT_DIRECTORY_COMMAND, 'register', parsePluginDevelopmentResult),
    reload: (request: Parameters<PluginDevelopmentDesktopAdapter['reload']>[0]) =>
      call(invokeCommand, RELOAD_PLUGIN_DEVELOPMENT_ENTRY_COMMAND, 'reload', parsePluginDevelopmentResult, { request }),
    remove: (request: Parameters<PluginDevelopmentDesktopAdapter['remove']>[0]) =>
      call(invokeCommand, REMOVE_PLUGIN_DEVELOPMENT_ENTRY_COMMAND, 'remove', parsePluginDevelopmentResult, { request }),
  });
