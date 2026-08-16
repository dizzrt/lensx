import type { HostApiRequest, HostApiResult } from '@lensx/plugin-contract';

export const PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION = '0.1.0' as const;
export const PLUGIN_SCOPED_STORAGE_COMMAND = 'plugin_scoped_storage' as const;

export const PLUGIN_SCOPED_STORAGE_METHODS = Object.freeze([
  'storage.delete',
  'storage.get',
  'storage.get_quota',
  'storage.list',
  'storage.set',
] as const);

export type PluginScopedStorageMethod = (typeof PLUGIN_SCOPED_STORAGE_METHODS)[number];
export type PluginScopedStorageRequest = Extract<HostApiRequest, { readonly method: PluginScopedStorageMethod }>;
export type PluginScopedStorageResult = Extract<HostApiResult, { readonly method: PluginScopedStorageMethod }>;

export interface PluginScopedStorageIdentity {
  readonly entry_id: string;
  readonly plugin_id: string;
  readonly version: string;
}

export type PluginScopedStorageOperation =
  | { readonly kind: 'delete'; readonly key: string }
  | { readonly kind: 'get'; readonly key: string }
  | { readonly kind: 'get_quota' }
  | { readonly kind: 'list'; readonly cursor?: string; readonly limit?: number }
  | { readonly kind: 'set'; readonly key: string; readonly value: unknown };

export interface PluginScopedStorageBoundaryRequest {
  readonly contract_version: typeof PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION;
  readonly identity: PluginScopedStorageIdentity;
  readonly operation: PluginScopedStorageOperation;
}

export interface PluginScopedStorageBoundaryResult {
  readonly contract_version: typeof PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION;
  readonly operation: PluginScopedStorageOperation['kind'];
  readonly result: unknown;
}

export type PluginScopedStorageErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'internal_error'
  | 'invalid_params'
  | 'limit_exceeded'
  | 'unavailable';

export interface PluginScopedStorageBoundaryErrorPayload {
  readonly contract_version: typeof PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION;
  readonly code: PluginScopedStorageErrorCode;
  readonly operation: PluginScopedStorageOperation['kind'];
  readonly message: string;
}

export class PluginScopedStorageBoundaryError extends Error {
  readonly code: PluginScopedStorageErrorCode;
  readonly operation: PluginScopedStorageOperation['kind'];

  constructor(payload: PluginScopedStorageBoundaryErrorPayload) {
    super(payload.message);
    this.name = 'PluginScopedStorageBoundaryError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}

export interface PluginScopedStorageProviderBinding {
  readonly available: () => boolean;
  readonly execute: (request: PluginScopedStorageRequest, signal: AbortSignal) => Promise<PluginScopedStorageResult>;
  readonly subscribeAvailability: (listener: () => void) => () => void;
  readonly dispose: () => void;
}

export interface PluginScopedStorageProviderFactory {
  readonly create: (input: {
    readonly identity: PluginScopedStorageIdentity;
    readonly isCurrent: () => boolean;
  }) => PluginScopedStorageProviderBinding;
}
