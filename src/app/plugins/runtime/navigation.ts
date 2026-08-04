import { invoke } from '@tauri-apps/api/core';
import { PluginPageRuntimeError, type PluginRuntimeNavigationAdapter } from './types';

export const PLUGIN_RUNTIME_NAVIGATION_CONTRACT_VERSION = '0.1.0' as const;
export const ACTIVATE_PLUGIN_RUNTIME_NAVIGATION_COMMAND = 'activate_plugin_runtime_navigation' as const;
export const DISPOSE_PLUGIN_RUNTIME_NAVIGATION_COMMAND = 'dispose_plugin_runtime_navigation' as const;

export type PluginRuntimeNavigationInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const exactRecord = (value: unknown, keys: readonly string[]) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new PluginPageRuntimeError('runtime_activation_failed');
  }
  return value as Record<string, unknown>;
};

export const createPluginRuntimeNavigationAdapter = (
  invokeCommand: PluginRuntimeNavigationInvoke = invoke as PluginRuntimeNavigationInvoke,
): PluginRuntimeNavigationAdapter => ({
  async activate({ entry_url, host_fragment }) {
    try {
      const result = exactRecord(
        await invokeCommand(ACTIVATE_PLUGIN_RUNTIME_NAVIGATION_COMMAND, {
          request: {
            contract_version: PLUGIN_RUNTIME_NAVIGATION_CONTRACT_VERSION,
            entry_url,
            host_fragment,
          },
        }),
        ['contract_version', 'lease_id'],
      );
      if (
        result.contract_version !== PLUGIN_RUNTIME_NAVIGATION_CONTRACT_VERSION ||
        typeof result.lease_id !== 'string' ||
        !/^[0-9a-f]{16}$/u.test(result.lease_id)
      ) {
        throw new PluginPageRuntimeError('runtime_activation_failed');
      }
      return Object.freeze({ lease_id: result.lease_id });
    } catch {
      throw new PluginPageRuntimeError('runtime_activation_failed');
    }
  },
  async dispose({ lease_id }) {
    try {
      const result = exactRecord(
        await invokeCommand(DISPOSE_PLUGIN_RUNTIME_NAVIGATION_COMMAND, {
          request: {
            contract_version: PLUGIN_RUNTIME_NAVIGATION_CONTRACT_VERSION,
            lease_id,
          },
        }),
        ['contract_version', 'disposed'],
      );
      if (
        result.contract_version !== PLUGIN_RUNTIME_NAVIGATION_CONTRACT_VERSION ||
        typeof result.disposed !== 'boolean'
      ) {
        return false;
      }
      return result.disposed;
    } catch {
      return false;
    }
  },
});

export const desktopPluginRuntimeNavigationAdapter = createPluginRuntimeNavigationAdapter();
