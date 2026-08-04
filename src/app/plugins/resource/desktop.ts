import { invoke } from '@tauri-apps/api/core';
import { parsePluginResourceEntry, parsePluginResourceError, parseResolvePluginResourceEntryRequest } from './parse';
import {
  type PluginResourceDesktopAdapter,
  PluginResourceError,
  RESOLVE_PLUGIN_RESOURCE_ENTRY_COMMAND,
  type ResolvePluginResourceEntryRequest,
} from './types';

export type PluginResourceInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const invalidBoundary = () =>
  new PluginResourceError({
    code: 'invalid_boundary_payload',
    operation: 'resolve_entry',
    message: 'Plugin resource boundary returned an invalid payload.',
  });

export const createPluginResourceDesktopAdapter = (
  invokeCommand: PluginResourceInvoke = invoke as PluginResourceInvoke,
): PluginResourceDesktopAdapter => ({
  async resolveEntry(input) {
    let request: ResolvePluginResourceEntryRequest;
    try {
      request = parseResolvePluginResourceEntryRequest(input);
    } catch {
      throw new PluginResourceError({
        contract_version: '0.1.0',
        code: 'invalid_request',
        operation: 'resolve_entry',
        message: 'Plugin resource request is invalid.',
      });
    }
    try {
      return parsePluginResourceEntry(await invokeCommand(RESOLVE_PLUGIN_RESOURCE_ENTRY_COMMAND, { request }));
    } catch (error) {
      if (error instanceof TypeError) throw invalidBoundary();
      try {
        throw new PluginResourceError(parsePluginResourceError(error));
      } catch (boundaryError) {
        if (boundaryError instanceof PluginResourceError) throw boundaryError;
        throw invalidBoundary();
      }
    }
  },
});

export const desktopPluginResourceAdapter = createPluginResourceDesktopAdapter();
