import { invoke } from '@tauri-apps/api/core';
import { parsePluginLifecycleError, parsePluginLifecycleResult } from './parse';
import {
  type PluginLifecycleDesktopAdapter,
  PluginLifecycleError,
  type PluginLifecycleOperation,
  SET_PLUGIN_ENABLED_COMMAND,
  type SetPluginEnabledRequest,
  type SetPluginEnabledResult,
  UNINSTALL_PLUGIN_COMMAND,
  type UninstallPluginRequest,
  type UninstallPluginResult,
} from './types';

export type PluginLifecycleInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const boundaryError = (operation: PluginLifecycleOperation) =>
  new PluginLifecycleError({
    code: 'invalid_boundary_payload',
    operation,
    message: 'Plugin lifecycle boundary returned an invalid payload.',
  });

const mapInvokeError = (error: unknown, operation: PluginLifecycleOperation) => {
  try {
    return new PluginLifecycleError(parsePluginLifecycleError(error));
  } catch {
    return boundaryError(operation);
  }
};

const invokeLifecycle = async <T>(
  invokeCommand: PluginLifecycleInvoke,
  command: string,
  request: SetPluginEnabledRequest | UninstallPluginRequest,
  operation: PluginLifecycleOperation,
  expectedOperation: T extends SetPluginEnabledResult ? 'set_enabled' : 'uninstall',
): Promise<T> => {
  try {
    const result = parsePluginLifecycleResult(await invokeCommand(command, { request }));
    if (result.operation !== expectedOperation) {
      throw boundaryError(operation);
    }
    return result as T;
  } catch (error) {
    if (error instanceof PluginLifecycleError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw boundaryError(operation);
    }
    throw mapInvokeError(error, operation);
  }
};

export const createPluginLifecycleDesktopAdapter = (
  invokeCommand: PluginLifecycleInvoke = invoke as PluginLifecycleInvoke,
): PluginLifecycleDesktopAdapter => ({
  setEnabled: (request) =>
    invokeLifecycle<SetPluginEnabledResult>(
      invokeCommand,
      SET_PLUGIN_ENABLED_COMMAND,
      request,
      'set_enabled',
      'set_enabled',
    ),
  uninstall: (request) =>
    invokeLifecycle<UninstallPluginResult>(invokeCommand, UNINSTALL_PLUGIN_COMMAND, request, 'uninstall', 'uninstall'),
});

export const desktopPluginLifecycleAdapter = createPluginLifecycleDesktopAdapter();
