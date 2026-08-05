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

export const PLUGIN_TRANSPORT_CONTRACT_VERSION = '0.1.0' as const;
export const PLUGIN_TRANSPORT_REQUEST_TYPE = 'lensx.plugin_transport.request' as const;
export const PLUGIN_TRANSPORT_RESPONSE_TYPE = 'lensx.plugin_transport.response' as const;
export const PLUGIN_TRANSPORT_EVENT_TYPE = 'lensx.plugin_transport.event' as const;
export const PLUGIN_TRANSPORT_CANCEL_TYPE = 'lensx.plugin_transport.cancel' as const;
export const PLUGIN_TRANSPORT_DISCONNECT_TYPE = 'lensx.plugin_transport.disconnect' as const;

const REQUEST_ID_PATTERN = /^request_[0-9a-f]{16}$/u;
export type PluginTransportRequestId = `request_${string}`;

export type PluginTransportFrame =
  | {
      readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
      readonly type: typeof PLUGIN_TRANSPORT_REQUEST_TYPE;
      readonly request_id: PluginTransportRequestId;
      readonly request: HostApiRequest;
    }
  | {
      readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
      readonly type: typeof PLUGIN_TRANSPORT_RESPONSE_TYPE;
      readonly request_id: PluginTransportRequestId;
      readonly result: HostApiResult;
    }
  | {
      readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
      readonly type: typeof PLUGIN_TRANSPORT_RESPONSE_TYPE;
      readonly request_id: PluginTransportRequestId;
      readonly error: HostApiError;
    }
  | {
      readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
      readonly type: typeof PLUGIN_TRANSPORT_EVENT_TYPE;
      readonly event: HostApiEvent;
    }
  | {
      readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
      readonly type: typeof PLUGIN_TRANSPORT_CANCEL_TYPE;
      readonly request_id: PluginTransportRequestId;
    }
  | {
      readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
      readonly type: typeof PLUGIN_TRANSPORT_DISCONNECT_TYPE;
    };

export class PluginRuntimeTransportFrameError extends Error {
  constructor() {
    super('Plugin Runtime transport frame is invalid.');
    this.name = 'PluginRuntimeTransportFrameError';
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
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
  throw new PluginRuntimeTransportFrameError();
};
const validId = (value: unknown): value is PluginTransportRequestId =>
  typeof value === 'string' && REQUEST_ID_PATTERN.test(value);

export const parsePluginRuntimeTransportFrame = (value: unknown): PluginTransportFrame => {
  if (!isJson(value) || !isPlainRecord(value) || value.contract_version !== PLUGIN_TRANSPORT_CONTRACT_VERSION) {
    return fail();
  }
  if (value.type === PLUGIN_TRANSPORT_REQUEST_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'request_id', 'request']) || !validId(value.request_id))
      return fail();
    const request = validateHostApiRequest(value.request);
    if (request.status === 'invalid') return fail();
    return Object.freeze({ ...value, request: request.value }) as PluginTransportFrame;
  }
  if (value.type === PLUGIN_TRANSPORT_RESPONSE_TYPE) {
    if (!validId(value.request_id)) return fail();
    if (exact(value, ['contract_version', 'type', 'request_id', 'result'])) {
      const result = validateHostApiResult(value.result);
      if (result.status === 'invalid') return fail();
      return Object.freeze({ ...value, result: result.value }) as PluginTransportFrame;
    }
    if (exact(value, ['contract_version', 'type', 'request_id', 'error'])) {
      const error = validateHostApiError(value.error);
      if (error.status === 'invalid') return fail();
      return Object.freeze({ ...value, error: error.value }) as PluginTransportFrame;
    }
    return fail();
  }
  if (value.type === PLUGIN_TRANSPORT_EVENT_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'event'])) return fail();
    const event = validateHostApiEvent(value.event);
    if (event.status === 'invalid') return fail();
    return Object.freeze({ ...value, event: event.value }) as PluginTransportFrame;
  }
  if (value.type === PLUGIN_TRANSPORT_CANCEL_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'request_id']) || !validId(value.request_id)) return fail();
    return Object.freeze({ ...value }) as PluginTransportFrame;
  }
  if (value.type === PLUGIN_TRANSPORT_DISCONNECT_TYPE) {
    if (!exact(value, ['contract_version', 'type'])) return fail();
    return Object.freeze({ ...value }) as PluginTransportFrame;
  }
  return fail();
};
