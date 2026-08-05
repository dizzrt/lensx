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
export const PLUGIN_RUNTIME_BOOTSTRAP_TYPE = 'lensx.plugin_runtime.bootstrap' as const;
export const PLUGIN_RUNTIME_READY_TYPE = 'lensx.plugin_runtime.ready' as const;

const REQUEST_ID_PATTERN = /^request_[0-9a-f]{16}$/u;
const NONCE_PATTERN = /^[0-9a-f]{32}$/u;

export type PluginTransportRequestId = `request_${string}`;

export interface PluginTransportRequestFrame {
  readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_TRANSPORT_REQUEST_TYPE;
  readonly request_id: PluginTransportRequestId;
  readonly request: HostApiRequest;
}

export interface PluginTransportSuccessResponseFrame {
  readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_TRANSPORT_RESPONSE_TYPE;
  readonly request_id: PluginTransportRequestId;
  readonly result: HostApiResult;
}

export interface PluginTransportErrorResponseFrame {
  readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_TRANSPORT_RESPONSE_TYPE;
  readonly request_id: PluginTransportRequestId;
  readonly error: HostApiError;
}

export type PluginTransportResponseFrame = PluginTransportSuccessResponseFrame | PluginTransportErrorResponseFrame;

export interface PluginTransportEventFrame {
  readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_TRANSPORT_EVENT_TYPE;
  readonly event: HostApiEvent;
}

export interface PluginTransportCancelFrame {
  readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_TRANSPORT_CANCEL_TYPE;
  readonly request_id: PluginTransportRequestId;
}

export interface PluginTransportDisconnectFrame {
  readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_TRANSPORT_DISCONNECT_TYPE;
}

export type PluginTransportFrame =
  | PluginTransportRequestFrame
  | PluginTransportResponseFrame
  | PluginTransportEventFrame
  | PluginTransportCancelFrame
  | PluginTransportDisconnectFrame;

export interface PluginRuntimeBootstrap {
  readonly contract_version: typeof PLUGIN_TRANSPORT_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_RUNTIME_BOOTSTRAP_TYPE;
  readonly nonce: string;
}

export class PrivatePluginTransportError extends Error {
  readonly code: 'invalid_bootstrap' | 'invalid_frame';

  constructor(code: 'invalid_bootstrap' | 'invalid_frame') {
    super(
      code === 'invalid_bootstrap' ? 'Plugin transport bootstrap is invalid.' : 'Plugin transport frame is invalid.',
    );
    this.name = 'PrivatePluginTransportError';
    this.code = code;
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const isJsonValue = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && !isPlainRecord(value)) return false;
  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const valid = children.every((child) => isJsonValue(child, ancestors));
  ancestors.delete(value);
  return valid;
};

const invalidFrame = (): never => {
  throw new PrivatePluginTransportError('invalid_frame');
};

export const isPluginTransportRequestId = (value: unknown): value is PluginTransportRequestId =>
  typeof value === 'string' && REQUEST_ID_PATTERN.test(value);

export const parsePluginRuntimeBootstrap = (value: unknown): PluginRuntimeBootstrap => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['contract_version', 'type', 'nonce']) ||
    value.contract_version !== PLUGIN_TRANSPORT_CONTRACT_VERSION ||
    value.type !== PLUGIN_RUNTIME_BOOTSTRAP_TYPE ||
    typeof value.nonce !== 'string' ||
    !NONCE_PATTERN.test(value.nonce)
  ) {
    throw new PrivatePluginTransportError('invalid_bootstrap');
  }
  return Object.freeze({
    contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
    type: PLUGIN_RUNTIME_BOOTSTRAP_TYPE,
    nonce: value.nonce,
  });
};

export const parsePluginTransportFrame = (value: unknown): PluginTransportFrame => {
  if (!isJsonValue(value) || !isPlainRecord(value) || value.contract_version !== PLUGIN_TRANSPORT_CONTRACT_VERSION) {
    return invalidFrame();
  }
  if (value.type === PLUGIN_TRANSPORT_REQUEST_TYPE) {
    if (!hasExactKeys(value, ['contract_version', 'type', 'request_id', 'request'])) return invalidFrame();
    if (!isPluginTransportRequestId(value.request_id)) return invalidFrame();
    const request = validateHostApiRequest(value.request);
    if (request.status === 'invalid') return invalidFrame();
    return Object.freeze({
      contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
      type: PLUGIN_TRANSPORT_REQUEST_TYPE,
      request_id: value.request_id,
      request: request.value,
    });
  }
  if (value.type === PLUGIN_TRANSPORT_RESPONSE_TYPE) {
    if (!isPluginTransportRequestId(value.request_id)) return invalidFrame();
    if (hasExactKeys(value, ['contract_version', 'type', 'request_id', 'result'])) {
      const result = validateHostApiResult(value.result);
      if (result.status === 'invalid') return invalidFrame();
      return Object.freeze({
        contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
        type: PLUGIN_TRANSPORT_RESPONSE_TYPE,
        request_id: value.request_id,
        result: result.value,
      });
    }
    if (hasExactKeys(value, ['contract_version', 'type', 'request_id', 'error'])) {
      const error = validateHostApiError(value.error);
      if (error.status === 'invalid') return invalidFrame();
      return Object.freeze({
        contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
        type: PLUGIN_TRANSPORT_RESPONSE_TYPE,
        request_id: value.request_id,
        error: error.value,
      });
    }
    return invalidFrame();
  }
  if (value.type === PLUGIN_TRANSPORT_EVENT_TYPE) {
    if (!hasExactKeys(value, ['contract_version', 'type', 'event'])) return invalidFrame();
    const event = validateHostApiEvent(value.event);
    if (event.status === 'invalid') return invalidFrame();
    return Object.freeze({
      contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
      type: PLUGIN_TRANSPORT_EVENT_TYPE,
      event: event.value,
    });
  }
  if (value.type === PLUGIN_TRANSPORT_CANCEL_TYPE) {
    if (
      !hasExactKeys(value, ['contract_version', 'type', 'request_id']) ||
      !isPluginTransportRequestId(value.request_id)
    ) {
      return invalidFrame();
    }
    return Object.freeze({
      contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
      type: PLUGIN_TRANSPORT_CANCEL_TYPE,
      request_id: value.request_id,
    });
  }
  if (value.type === PLUGIN_TRANSPORT_DISCONNECT_TYPE) {
    if (!hasExactKeys(value, ['contract_version', 'type'])) return invalidFrame();
    return Object.freeze({
      contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
      type: PLUGIN_TRANSPORT_DISCONNECT_TYPE,
    });
  }
  return invalidFrame();
};

export const createPluginTransportRequestId = (sequence: number): PluginTransportRequestId => {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) return invalidFrame();
  const value = sequence.toString(16).padStart(16, '0');
  if (value.length !== 16) return invalidFrame();
  return `request_${value}`;
};
