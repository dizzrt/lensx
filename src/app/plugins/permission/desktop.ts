import { invoke } from '@tauri-apps/api/core';
import type { PluginRuntimeSessionIdentity } from '../runtime/session-contract';
import {
  parsePluginClipboardBoundaryError,
  parsePluginClipboardBoundaryResult,
  parsePluginPermissionGrantError,
  parseSetPluginPermissionGrantResult,
  toPluginClipboardBoundaryRequest,
} from './parse';
import {
  PLUGIN_CLIPBOARD_COMMAND,
  PluginClipboardBoundaryError,
  type PluginClipboardErrorCode,
  type PluginClipboardProviderFactory,
  type PluginClipboardRequest,
  type PluginClipboardResult,
  PluginPermissionGrantError,
  type PluginPermissionMutationAdapter,
  SET_PLUGIN_PERMISSION_GRANT_COMMAND,
} from './types';

export type PluginPermissionInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const clipboardError = (code: PluginClipboardErrorCode, operation: 'read' | 'write') =>
  new PluginClipboardBoundaryError({
    contract_version: '0.1.0',
    code,
    operation,
    message:
      code === 'cancelled'
        ? 'Plugin clipboard request was cancelled.'
        : code === 'permission_denied'
          ? 'Plugin clipboard permission was denied.'
          : code === 'unavailable'
            ? 'Plugin clipboard is unavailable.'
            : code === 'limit_exceeded'
              ? 'Plugin clipboard text limit was exceeded.'
              : 'Plugin clipboard request failed.',
  });

export const createPluginPermissionMutationAdapter = (
  invokeCommand: PluginPermissionInvoke = invoke as PluginPermissionInvoke,
): PluginPermissionMutationAdapter =>
  Object.freeze({
    async setGrant(request: Parameters<PluginPermissionMutationAdapter['setGrant']>[0]) {
      try {
        return parseSetPluginPermissionGrantResult(
          await invokeCommand(SET_PLUGIN_PERMISSION_GRANT_COMMAND, { request }),
        );
      } catch (error) {
        if (error instanceof PluginPermissionGrantError) throw error;
        try {
          throw new PluginPermissionGrantError(parsePluginPermissionGrantError(error));
        } catch (boundaryError) {
          if (boundaryError instanceof PluginPermissionGrantError) throw boundaryError;
          throw new PluginPermissionGrantError({
            code: 'invalid_boundary_payload',
            message: 'Plugin permission boundary payload is invalid.',
          });
        }
      }
    },
  });

export const createPluginClipboardProviderFactory = (
  invokeCommand: PluginPermissionInvoke = invoke as PluginPermissionInvoke,
): PluginClipboardProviderFactory =>
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
      const clipboardIdentity = Object.freeze({
        entry_id: identity.entry_id,
        plugin_id: identity.plugin_id,
        version: identity.version,
        registration_revision: identity.registration_revision,
      });
      const setUnavailable = () => {
        if (!available) return;
        available = false;
        for (const listener of listeners) listener();
      };
      return Object.freeze({
        available: () => !disposed && available && isCurrent(),
        async execute(request: PluginClipboardRequest, signal: AbortSignal): Promise<PluginClipboardResult> {
          const operation = request.method === 'clipboard.read' ? 'read' : 'write';
          if (signal.aborted) throw clipboardError('cancelled', operation);
          if (disposed || !available || !isCurrent()) throw clipboardError('unavailable', operation);
          try {
            const raw = await invokeCommand(PLUGIN_CLIPBOARD_COMMAND, {
              request: toPluginClipboardBoundaryRequest(clipboardIdentity, request),
            });
            if (signal.aborted) throw clipboardError('cancelled', operation);
            if (disposed || !isCurrent()) throw clipboardError('unavailable', operation);
            const result = parsePluginClipboardBoundaryResult(raw, request);
            return request.method === 'clipboard.read'
              ? Object.freeze({
                  method: request.method,
                  result: Object.freeze({ text: result.operation === 'read' ? result.text : '' }),
                })
              : Object.freeze({ method: request.method, result: Object.freeze({ written: true as const }) });
          } catch (error) {
            if (error instanceof PluginClipboardBoundaryError) throw error;
            try {
              const parsed = parsePluginClipboardBoundaryError(error);
              if (parsed.code === 'unavailable') setUnavailable();
              throw new PluginClipboardBoundaryError(parsed);
            } catch (boundaryError) {
              if (boundaryError instanceof PluginClipboardBoundaryError) throw boundaryError;
              throw clipboardError('internal_error', operation);
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

export const desktopPluginPermissionMutationAdapter = createPluginPermissionMutationAdapter();
export const desktopPluginClipboardProviderFactory = createPluginClipboardProviderFactory();
