import { invoke } from '@tauri-apps/api/core';

import type { PluginRuntimeSessionIdentity } from '../runtime/session-contract';
import {
  parsePluginScopedStorageBoundaryError,
  parsePluginScopedStorageBoundaryResult,
  toPluginScopedStorageBoundaryRequest,
} from './parse';
import {
  PLUGIN_SCOPED_STORAGE_COMMAND,
  PluginScopedStorageBoundaryError,
  type PluginScopedStorageErrorCode,
  type PluginScopedStorageIdentity,
  type PluginScopedStorageProviderFactory,
  type PluginScopedStorageRequest,
  type PluginScopedStorageResult,
} from './types';

export type PluginScopedStorageInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const boundaryError = (
  code: PluginScopedStorageErrorCode,
  operation: 'delete' | 'get' | 'get_quota' | 'list' | 'set',
) =>
  new PluginScopedStorageBoundaryError({
    contract_version: '0.1.0',
    code,
    operation,
    message:
      code === 'cancelled'
        ? 'Plugin storage request was cancelled.'
        : code === 'unavailable'
          ? 'Plugin storage is unavailable.'
          : 'Plugin storage request failed.',
  });

export const createPluginScopedStorageProviderFactory = (
  invokeCommand: PluginScopedStorageInvoke = invoke as PluginScopedStorageInvoke,
): PluginScopedStorageProviderFactory =>
  Object.freeze({
    create({
      identity,
      isCurrent,
    }: {
      readonly identity: PluginRuntimeSessionIdentity;
      readonly isCurrent: () => boolean;
    }) {
      let disposed = false;
      let available = true;
      const listeners = new Set<() => void>();
      const storageIdentity: PluginScopedStorageIdentity = Object.freeze({
        entry_id: identity.entry_id,
        plugin_id: identity.plugin_id,
        version: identity.version,
      });
      const setUnavailable = () => {
        if (!available) return;
        available = false;
        for (const listener of listeners) listener();
      };
      return Object.freeze({
        available: () => !disposed && available && isCurrent(),
        async execute(request: PluginScopedStorageRequest, signal: AbortSignal): Promise<PluginScopedStorageResult> {
          const operation = request.method.slice('storage.'.length) as 'delete' | 'get' | 'get_quota' | 'list' | 'set';
          if (signal.aborted) throw boundaryError('cancelled', operation);
          if (disposed || !isCurrent() || !available) throw boundaryError('unavailable', operation);
          const boundaryRequest = toPluginScopedStorageBoundaryRequest(storageIdentity, request);
          try {
            const value = await invokeCommand(PLUGIN_SCOPED_STORAGE_COMMAND, { request: boundaryRequest });
            if (signal.aborted) throw boundaryError('cancelled', operation);
            if (disposed || !isCurrent()) throw boundaryError('unavailable', operation);
            return parsePluginScopedStorageBoundaryResult(value, request.method);
          } catch (error) {
            if (error instanceof PluginScopedStorageBoundaryError) throw error;
            try {
              const parsed = parsePluginScopedStorageBoundaryError(error);
              if (parsed.code === 'unavailable') setUnavailable();
              throw new PluginScopedStorageBoundaryError(parsed);
            } catch (boundaryFailure) {
              if (boundaryFailure instanceof PluginScopedStorageBoundaryError) throw boundaryFailure;
              throw boundaryError('internal_error', operation);
            }
          }
        },
        subscribeAvailability(listener: () => void) {
          if (disposed) return () => undefined;
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          listeners.clear();
        },
      });
    },
  });

export const desktopPluginScopedStorageProviderFactory = createPluginScopedStorageProviderFactory();
