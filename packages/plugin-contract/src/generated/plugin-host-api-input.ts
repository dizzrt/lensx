/* eslint-disable */
// biome-ignore-all lint/suspicious/noEmptyInterface: Exact empty object Schemas generate empty interfaces.
/**
 * Generated from schema/host-api.schema.json.
 * Do not edit directly; run `pnpm run generate`.
 */

/**
 * Public semantic Host API 0.4.0 contract. This schema intentionally excludes private RPC transport and Host identity facts.
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
  | HttpRequestRequest
  | RuntimeGetContextRequest
  | StorageDeleteRequest
  | StorageGetRequest
  | StorageGetQuotaRequest
  | StorageListRequest
  | StorageSetRequest
  | UiCloseRequest
  | ActionsGetActivationRequest
  | ActionsSubscribeActivationsRequest;
export type LocalActionId = string;
/**
 * @maxItems 32
 */
export type HttpHeaders = HttpHeader[];
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
  | HttpRequestResult
  | RuntimeGetContextResult
  | StorageDeleteResult
  | StorageGetResult
  | StorageGetQuotaResult
  | StorageListResult
  | StorageSetResult
  | UiCloseResult
  | ActionsGetActivationResult
  | ActionsSubscribeActivationsResult;
export type Semver = string;
export type HostApiMethodInput =
  | 'actions.get_activation'
  | 'actions.open'
  | 'actions.subscribe_activations'
  | 'http.request'
  | 'runtime.get_context'
  | 'storage.delete'
  | 'storage.get'
  | 'storage.get_quota'
  | 'storage.list'
  | 'storage.set'
  | 'ui.close';
export type HostApiEventInput = ActionsActivatedEvent | RuntimeContextChangedEvent;
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
export type HostApiEventNameInput = 'actions.activated' | 'runtime.context_changed';

export interface ActionsOpenRequest {
  method: 'actions.open';
  params: {
    actionId: LocalActionId;
  };
}
export interface HttpRequestRequest {
  method: 'http.request';
  params: HttpRequestParams;
}
export interface HttpRequestParams {
  url: string;
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  headers?: HttpHeaders;
  body?: string;
  timeoutMs?: number;
}
export interface HttpHeader {
  name: string;
  value: string;
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
export interface ActionsGetActivationRequest {
  method: 'actions.get_activation';
  params: EmptyParams;
}
export interface ActionsSubscribeActivationsRequest {
  method: 'actions.subscribe_activations';
  params: EmptyParams;
}
export interface ActionsOpenResult {
  method: 'actions.open';
  result: {
    opened: true;
  };
}
export interface HttpRequestResult {
  method: 'http.request';
  result: {
    status: number;
    headers: HttpHeaders;
    body: string;
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
export interface ActionsGetActivationResult {
  method: 'actions.get_activation';
  result: {
    activation: null | PluginActionActivationInput;
  };
}
export interface PluginActionActivationInput {
  actionId: LocalActionId;
  invocationId: number;
  source: 'normal' | 'shortcut';
}
export interface ActionsSubscribeActivationsResult {
  method: 'actions.subscribe_activations';
  result: {
    /**
     * @maxItems 32
     */
    activations: PluginActionActivationInput[];
  };
}
export interface ActionsActivatedEvent {
  event: 'actions.activated';
  payload: PluginActionActivationInput;
}
export interface RuntimeContextChangedEvent {
  event: 'runtime.context_changed';
  payload: PluginRuntimeContextInput;
}
export interface HostApiErrorInput {
  code: HostApiErrorCodeInput;
  message: string;
}
