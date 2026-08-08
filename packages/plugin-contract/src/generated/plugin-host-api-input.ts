/* eslint-disable */
// biome-ignore-all lint/suspicious/noEmptyInterface: Exact empty object Schemas generate empty interfaces.
/**
 * Generated from schema/host-api.schema.json.
 * Do not edit directly; run `pnpm run generate`.
 */

/**
 * Public semantic Host API 0.2.0 contract. This schema intentionally excludes private RPC transport and Host identity facts.
 */
export type PluginHostApiInput =
  | HostApiRequestInput
  | HostApiResultInput
  | HostApiEventInput
  | HostApiErrorInput
  | PluginRuntimeContextInput
  | HostApiEventNameInput;
export type HostApiRequestInput =
  | ActionsOpenRequest
  | RuntimeGetContextRequest
  | StorageDeleteRequest
  | StorageGetRequest
  | StorageGetQuotaRequest
  | StorageListRequest
  | StorageSetRequest
  | UiCloseRequest;
export type LocalActionId = string;
export type StorageKey = string;
export type OpaqueCursor = string;
export type JsonValue =
  | null
  | boolean
  | string
  | number
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };
export type HostApiResultInput =
  | ActionsOpenResult
  | RuntimeGetContextResult
  | StorageDeleteResult
  | StorageGetResult
  | StorageGetQuotaResult
  | StorageListResult
  | StorageSetResult
  | UiCloseResult;
export type Semver = string;
export type HostApiMethodInput =
  | 'actions.open'
  | 'runtime.get_context'
  | 'storage.delete'
  | 'storage.get'
  | 'storage.get_quota'
  | 'storage.list'
  | 'storage.set'
  | 'ui.close';
export type HostApiErrorCodeInput =
  | 'cancelled'
  | 'conflict'
  | 'internal_error'
  | 'invalid_params'
  | 'invalid_request'
  | 'limit_exceeded'
  | 'method_not_found'
  | 'not_found'
  | 'timeout'
  | 'unavailable';
export type HostApiEventNameInput = 'runtime.context_changed';

export interface ActionsOpenRequest {
  method: 'actions.open';
  params: {
    actionId: LocalActionId;
  };
}
export interface RuntimeGetContextRequest {
  method: 'runtime.get_context';
  params: EmptyParams;
}
export interface EmptyParams {}
export interface StorageDeleteRequest {
  method: 'storage.delete';
  params: {
    key: StorageKey;
  };
}
export interface StorageGetRequest {
  method: 'storage.get';
  params: {
    key: StorageKey;
  };
}
export interface StorageGetQuotaRequest {
  method: 'storage.get_quota';
  params: EmptyParams;
}
export interface StorageListRequest {
  method: 'storage.list';
  params: {
    cursor?: OpaqueCursor;
    limit?: number;
  };
}
export interface StorageSetRequest {
  method: 'storage.set';
  params: {
    key: StorageKey;
    value: JsonValue;
  };
}
export interface UiCloseRequest {
  method: 'ui.close';
  params: EmptyParams;
}
export interface ActionsOpenResult {
  method: 'actions.open';
  result: {
    opened: true;
  };
}
export interface RuntimeGetContextResult {
  method: 'runtime.get_context';
  result: PluginRuntimeContextInput;
}
export interface PluginRuntimeContextInput {
  hostApiVersion: Semver;
  locale: 'en-US' | 'zh-CN';
  theme: 'light' | 'dark';
  capabilities: HostApiMethodInput[];
}
export interface StorageDeleteResult {
  method: 'storage.delete';
  result: {
    deleted: boolean;
  };
}
export interface StorageGetResult {
  method: 'storage.get';
  result:
    | {
        found: false;
      }
    | {
        found: true;
        value: JsonValue;
      };
}
export interface StorageGetQuotaResult {
  method: 'storage.get_quota';
  result: {
    usedBytes: number;
    limitBytes: number;
  };
}
export interface StorageListResult {
  method: 'storage.list';
  result: {
    /**
     * @maxItems 1000
     */
    keys: StorageKey[];
    nextCursor?: OpaqueCursor;
  };
}
export interface StorageSetResult {
  method: 'storage.set';
  result: {
    stored: true;
  };
}
export interface UiCloseResult {
  method: 'ui.close';
  result: {
    accepted: true;
  };
}
export interface HostApiEventInput {
  event: 'runtime.context_changed';
  payload: PluginRuntimeContextInput;
}
export interface HostApiErrorInput {
  code: HostApiErrorCodeInput;
  message: string;
}
