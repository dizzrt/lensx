import {
  type HostApiError,
  type HostApiEvent,
  type HostApiRequest,
  type HostApiResult,
  validateHostApiError,
  validateHostApiEvent,
  validateHostApiRequest,
  validateHostApiResult,
} from '@lensx/plugin-contract';

export const PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION = '0.2.0' as const;
export const PLUGIN_WEBVIEW_BRIDGE_READY_TYPE = 'lensx.plugin_bridge.ready' as const;
export const PLUGIN_WEBVIEW_BRIDGE_REQUEST_TYPE = 'lensx.plugin_bridge.request' as const;
export const PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE = 'lensx.plugin_bridge.response' as const;
export const PLUGIN_WEBVIEW_BRIDGE_EVENT_TYPE = 'lensx.plugin_bridge.event' as const;
export const PLUGIN_WEBVIEW_BRIDGE_CANCEL_TYPE = 'lensx.plugin_bridge.cancel' as const;
export const PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE = 'lensx.plugin_bridge.disconnect' as const;

const REQUEST_ID_PATTERN = /^request_[0-9a-f]{16}$/u;
const FRESHNESS_PATTERN = /^[0-9a-f]{32}$/u;

export type PluginWebviewBridgeRequestId = `request_${string}`;

export type PluginWebviewBridgeFrame =
  | {
      readonly contract_version: typeof PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION;
      readonly type: typeof PLUGIN_WEBVIEW_BRIDGE_READY_TYPE;
      readonly freshness: string;
    }
  | {
      readonly contract_version: typeof PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION;
      readonly type: typeof PLUGIN_WEBVIEW_BRIDGE_REQUEST_TYPE;
      readonly request_id: PluginWebviewBridgeRequestId;
      readonly request: HostApiRequest;
    }
  | {
      readonly contract_version: typeof PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION;
      readonly type: typeof PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE;
      readonly request_id: PluginWebviewBridgeRequestId;
      readonly result: HostApiResult;
    }
  | {
      readonly contract_version: typeof PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION;
      readonly type: typeof PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE;
      readonly request_id: PluginWebviewBridgeRequestId;
      readonly error: HostApiError;
    }
  | {
      readonly contract_version: typeof PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION;
      readonly type: typeof PLUGIN_WEBVIEW_BRIDGE_EVENT_TYPE;
      readonly event: HostApiEvent;
    }
  | {
      readonly contract_version: typeof PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION;
      readonly type: typeof PLUGIN_WEBVIEW_BRIDGE_CANCEL_TYPE;
      readonly request_id: PluginWebviewBridgeRequestId;
    }
  | {
      readonly contract_version: typeof PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION;
      readonly type: typeof PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE;
    };

export class PrivatePluginWebviewBridgeError extends Error {
  readonly code = 'invalid_frame' as const;

  constructor() {
    super('Plugin WebView bridge frame is invalid.');
    this.name = 'PrivatePluginWebviewBridgeError';
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isJson = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && !isPlainRecord(value)) return false;
  ancestors.add(value);
  const valid = (Array.isArray(value) ? value : Object.values(value)).every((item) => isJson(item, ancestors));
  ancestors.delete(value);
  return valid;
};
const fail = (): never => {
  throw new PrivatePluginWebviewBridgeError();
};
const validRequestId = (value: unknown): value is PluginWebviewBridgeRequestId =>
  typeof value === 'string' && REQUEST_ID_PATTERN.test(value);

export const createPluginWebviewBridgeRequestId = (sequence: number): PluginWebviewBridgeRequestId => {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) return fail();
  const value = sequence.toString(16).padStart(16, '0');
  if (value.length !== 16) return fail();
  return `request_${value}`;
};

export const parsePluginWebviewBridgeFrame = (value: unknown): PluginWebviewBridgeFrame => {
  if (!isJson(value) || !isPlainRecord(value) || value.contract_version !== PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION) {
    return fail();
  }
  if (value.type === PLUGIN_WEBVIEW_BRIDGE_READY_TYPE) {
    if (
      !exact(value, ['contract_version', 'type', 'freshness']) ||
      typeof value.freshness !== 'string' ||
      !FRESHNESS_PATTERN.test(value.freshness)
    ) {
      return fail();
    }
    return Object.freeze({ ...value }) as PluginWebviewBridgeFrame;
  }
  if (value.type === PLUGIN_WEBVIEW_BRIDGE_REQUEST_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'request_id', 'request']) || !validRequestId(value.request_id)) {
      return fail();
    }
    const request = validateHostApiRequest(value.request);
    if (request.status === 'invalid') return fail();
    return Object.freeze({ ...value, request: request.value }) as PluginWebviewBridgeFrame;
  }
  if (value.type === PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE) {
    if (!validRequestId(value.request_id)) return fail();
    if (exact(value, ['contract_version', 'type', 'request_id', 'result'])) {
      const result = validateHostApiResult(value.result);
      if (result.status === 'invalid') return fail();
      return Object.freeze({ ...value, result: result.value }) as PluginWebviewBridgeFrame;
    }
    if (exact(value, ['contract_version', 'type', 'request_id', 'error'])) {
      const error = validateHostApiError(value.error);
      if (error.status === 'invalid') return fail();
      return Object.freeze({ ...value, error: error.value }) as PluginWebviewBridgeFrame;
    }
    return fail();
  }
  if (value.type === PLUGIN_WEBVIEW_BRIDGE_EVENT_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'event'])) return fail();
    const event = validateHostApiEvent(value.event);
    if (event.status === 'invalid') return fail();
    return Object.freeze({ ...value, event: event.value }) as PluginWebviewBridgeFrame;
  }
  if (value.type === PLUGIN_WEBVIEW_BRIDGE_CANCEL_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'request_id']) || !validRequestId(value.request_id)) return fail();
    return Object.freeze({ ...value }) as PluginWebviewBridgeFrame;
  }
  if (value.type === PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE) {
    if (!exact(value, ['contract_version', 'type'])) return fail();
    return Object.freeze({ ...value }) as PluginWebviewBridgeFrame;
  }
  return fail();
};
