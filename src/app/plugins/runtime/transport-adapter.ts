import {
  type HostApiError,
  type HostApiEvent,
  type HostApiMethod,
  type HostApiRequest,
  type HostApiResult,
  validateHostApiError,
  validateHostApiEvent,
  validateHostApiMethod,
  validateHostApiRequest,
  validateHostApiResult,
} from '@lensx/plugin-contract';

import {
  analyzePluginRpcFrame,
  analyzePluginRpcSemanticPayload,
  PLUGIN_RPC_V1_POLICY,
  type PluginRpcDiagnosticSink,
  reportPluginRpcDiagnostic,
} from './rpc-validation';
import { browserPluginRuntimeScheduler, type PluginRuntimeScheduler } from './scheduler';
import type { PluginRuntimeHostPortLease } from './session-service';
import {
  PLUGIN_TRANSPORT_CANCEL_TYPE,
  PLUGIN_TRANSPORT_CONTRACT_VERSION,
  PLUGIN_TRANSPORT_DISCONNECT_TYPE,
  PLUGIN_TRANSPORT_EVENT_TYPE,
  PLUGIN_TRANSPORT_REQUEST_TYPE,
  PLUGIN_TRANSPORT_RESPONSE_TYPE,
  type PluginTransportRequestId,
} from './transport-contract';

export interface PluginRuntimeTransportHandlerInput {
  readonly identity: PluginRuntimeHostPortLease['identity'];
  readonly request: HostApiRequest;
  readonly signal: AbortSignal;
}

const postResponseEffectBrand = Symbol('PluginRuntimeTransportPostResponseEffect');

export interface PluginRuntimeTransportPostResponseOutcome {
  readonly [postResponseEffectBrand]: true;
  readonly response: HostApiResult | HostApiError;
  readonly effect: () => void;
}

export const createPluginRuntimeTransportPostResponseOutcome = (
  response: HostApiResult | HostApiError,
  effect: () => void,
): PluginRuntimeTransportPostResponseOutcome =>
  Object.freeze({ [postResponseEffectBrand]: true as const, response, effect });

const isPostResponseOutcome = (value: unknown): value is PluginRuntimeTransportPostResponseOutcome =>
  typeof value === 'object' && value !== null && postResponseEffectBrand in value;

export type PluginRuntimeTransportHandlerResult =
  | HostApiResult
  | HostApiError
  | PluginRuntimeTransportPostResponseOutcome;
export type PluginRuntimeTransportHandler = (
  input: PluginRuntimeTransportHandlerInput,
) => PluginRuntimeTransportHandlerResult | PromiseLike<PluginRuntimeTransportHandlerResult>;

export interface PluginRuntimeTransportAdapter {
  readonly emit: (event: HostApiEvent) => boolean;
  readonly disconnect: () => void;
  readonly dispose: () => void;
}

export interface AttachPluginRuntimeTransportInput {
  readonly lease: PluginRuntimeHostPortLease;
  readonly handler: PluginRuntimeTransportHandler;
  readonly isCurrent: () => boolean;
  readonly onDisconnect?: () => void;
  readonly onDiagnostic?: PluginRpcDiagnosticSink;
  readonly scheduler?: PluginRuntimeScheduler;
}

const unavailableError = Object.freeze({
  code: 'unavailable',
  message: 'The Host API is unavailable.',
}) satisfies HostApiError;

export const unavailablePluginRuntimeTransportHandler: PluginRuntimeTransportHandler = () => unavailableError;

const errors = Object.freeze({
  internal: Object.freeze({ code: 'internal_error', message: 'The Host API request failed.' }),
  invalidParams: Object.freeze({ code: 'invalid_params', message: 'The Host API parameters are invalid.' }),
  invalidRequest: Object.freeze({ code: 'invalid_request', message: 'The Host API request is invalid.' }),
  limitExceeded: Object.freeze({ code: 'limit_exceeded', message: 'The Host API limit was exceeded.' }),
  methodNotFound: Object.freeze({ code: 'method_not_found', message: 'The Host API method was not found.' }),
  timeout: Object.freeze({ code: 'timeout', message: 'The Host API request timed out.' }),
}) satisfies Readonly<Record<string, HostApiError>>;

const requestIdPattern = /^request_[0-9a-f]{16}$/u;
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const plainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const validRequestId = (value: unknown): value is PluginTransportRequestId =>
  typeof value === 'string' && requestIdPattern.test(value);
const requestSequence = (requestId: PluginTransportRequestId): bigint =>
  BigInt(`0x${requestId.slice('request_'.length)}`);

type InboundFrame =
  | {
      readonly type: typeof PLUGIN_TRANSPORT_REQUEST_TYPE;
      readonly request_id: PluginTransportRequestId;
      request: unknown;
    }
  | { readonly type: typeof PLUGIN_TRANSPORT_CANCEL_TYPE; readonly request_id: PluginTransportRequestId }
  | { readonly type: typeof PLUGIN_TRANSPORT_DISCONNECT_TYPE };

const classifyInboundFrame = (value: unknown): InboundFrame => {
  if (!plainRecord(value) || value.contract_version !== PLUGIN_TRANSPORT_CONTRACT_VERSION) {
    throw new TypeError('Protocol violation.');
  }
  if (value.type === PLUGIN_TRANSPORT_REQUEST_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'request_id', 'request']) || !validRequestId(value.request_id)) {
      throw new TypeError('Protocol violation.');
    }
    return { type: PLUGIN_TRANSPORT_REQUEST_TYPE, request_id: value.request_id, request: value.request };
  }
  if (value.type === PLUGIN_TRANSPORT_CANCEL_TYPE) {
    if (!exact(value, ['contract_version', 'type', 'request_id']) || !validRequestId(value.request_id)) {
      throw new TypeError('Protocol violation.');
    }
    return { type: PLUGIN_TRANSPORT_CANCEL_TYPE, request_id: value.request_id };
  }
  if (value.type === PLUGIN_TRANSPORT_DISCONNECT_TYPE && exact(value, ['contract_version', 'type'])) {
    return { type: PLUGIN_TRANSPORT_DISCONNECT_TYPE };
  }
  throw new TypeError('Protocol violation.');
};

const methodFrom = (request: unknown): HostApiMethod | undefined => {
  if (!plainRecord(request) || typeof request.method !== 'string') return undefined;
  const method = validateHostApiMethod(request.method);
  return method.status === 'valid' ? method.value : undefined;
};

const validateCorrelatableRequest = (
  request: unknown,
):
  | { readonly status: 'valid'; readonly request: HostApiRequest }
  | { readonly status: 'invalid'; error: HostApiError } => {
  if (!plainRecord(request) || !exact(request, ['method', 'params']) || typeof request.method !== 'string') {
    return { status: 'invalid', error: errors.invalidRequest };
  }
  if (validateHostApiMethod(request.method).status === 'invalid') {
    return { status: 'invalid', error: errors.methodNotFound };
  }
  const validated = validateHostApiRequest(request);
  return validated.status === 'valid'
    ? { status: 'valid', request: validated.value }
    : { status: 'invalid', error: errors.invalidParams };
};

interface PendingRequest {
  readonly controller: AbortController;
  readonly deadline: unknown;
  readonly request: HostApiRequest;
}

export const attachPluginRuntimeTransport = ({
  lease,
  handler,
  isCurrent,
  onDisconnect,
  onDiagnostic,
  scheduler = browserPluginRuntimeScheduler,
}: AttachPluginRuntimeTransportInput): PluginRuntimeTransportAdapter => {
  const pending = new Map<PluginTransportRequestId, PendingRequest>();
  let requestHighWater = -1n;
  let state: 'active' | 'disconnected' | 'disposed' = 'active';
  let disconnectSent = false;

  const diagnose = (
    stage: 'ingress' | 'execution' | 'egress',
    code:
      | 'protocol_violation'
      | 'frame_limit_exceeded'
      | 'concurrency_limit_exceeded'
      | 'execution_timeout'
      | 'handler_failed'
      | 'invalid_handler_output'
      | 'invalid_event',
    method?: HostApiMethod,
  ) => reportPluginRpcDiagnostic(onDiagnostic, { plugin_id: lease.identity.plugin_id, method, stage, code });

  const send = (value: unknown): boolean => {
    if (state !== 'active' || !isCurrent()) return false;
    try {
      lease.port.postMessage(value);
      return true;
    } catch {
      return false;
    }
  };
  const cleanup = (nextState: 'disconnected' | 'disposed', notifyPeer: boolean) => {
    if (state !== 'active') return;
    state = nextState;
    if (notifyPeer && !disconnectSent) {
      disconnectSent = true;
      try {
        lease.port.postMessage(
          Object.freeze({
            contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
            type: PLUGIN_TRANSPORT_DISCONNECT_TYPE,
          }),
        );
      } catch {
        // Terminal notification is bounded and best effort.
      }
    }
    lease.port.onmessage = null;
    lease.port.onmessageerror = null;
    for (const record of pending.values()) {
      scheduler.clearTimeout(record.deadline);
      record.controller.abort();
    }
    pending.clear();
    try {
      lease.port.close();
    } catch {
      // A transferred or already-closed Port is safe to forget.
    }
    if (nextState === 'disconnected') onDisconnect?.();
  };
  const fail = () => cleanup('disconnected', true);

  const responseFrame = (requestId: PluginTransportRequestId, response: HostApiResult | HostApiError) => {
    const error = validateHostApiError(response);
    return error.status === 'valid'
      ? Object.freeze({
          contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
          type: PLUGIN_TRANSPORT_RESPONSE_TYPE,
          request_id: requestId,
          error: error.value,
        })
      : Object.freeze({
          contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
          type: PLUGIN_TRANSPORT_RESPONSE_TYPE,
          request_id: requestId,
          result: response as HostApiResult,
        });
  };

  const sendRequestError = (requestId: PluginTransportRequestId, error: HostApiError): boolean => {
    const frame = responseFrame(requestId, error);
    if (analyzePluginRpcFrame(frame).status === 'invalid') return false;
    return send(frame);
  };

  const takePending = (requestId: PluginTransportRequestId, expected: PendingRequest): boolean => {
    if (pending.get(requestId) !== expected) return false;
    pending.delete(requestId);
    scheduler.clearTimeout(expected.deadline);
    return true;
  };

  const settle = async (requestId: PluginTransportRequestId, record: PendingRequest) => {
    try {
      const output = await handler(
        Object.freeze({ identity: lease.identity, request: record.request, signal: record.controller.signal }),
      );
      if (state !== 'active' || record.controller.signal.aborted || pending.get(requestId) !== record) return;
      if (!isCurrent()) return fail();
      const response = isPostResponseOutcome(output) ? output.response : output;
      let safeResponse: HostApiResult | HostApiError;
      let responseAccepted = true;
      if (analyzePluginRpcFrame(response).status === 'invalid') {
        diagnose('egress', 'invalid_handler_output', record.request.method);
        safeResponse = errors.internal;
        responseAccepted = false;
      } else {
        const error = validateHostApiError(response);
        if (error.status === 'valid') {
          safeResponse = error.value;
        } else {
          const result = validateHostApiResult(response);
          if (
            result.status === 'invalid' ||
            result.value.method !== record.request.method ||
            analyzePluginRpcSemanticPayload(result.value.result).status === 'invalid'
          ) {
            diagnose('egress', 'invalid_handler_output', record.request.method);
            safeResponse = errors.internal;
            responseAccepted = false;
          } else {
            safeResponse = result.value;
          }
        }
      }
      let frame = responseFrame(requestId, safeResponse);
      if (analyzePluginRpcFrame(frame).status === 'invalid') {
        diagnose('egress', 'invalid_handler_output', record.request.method);
        safeResponse = errors.internal;
        responseAccepted = false;
        frame = responseFrame(requestId, safeResponse);
      }
      if (!takePending(requestId, record)) return;
      if (!send(frame)) return fail();
      if (
        isPostResponseOutcome(output) &&
        responseAccepted &&
        state === 'active' &&
        isCurrent() &&
        !record.controller.signal.aborted
      ) {
        output.effect();
      }
    } catch {
      if (state !== 'active' || record.controller.signal.aborted || !takePending(requestId, record)) return;
      diagnose('execution', 'handler_failed', record.request.method);
      if (!sendRequestError(requestId, errors.internal)) fail();
    }
  };

  lease.port.onmessage = ({ data }) => {
    if (state !== 'active') return;
    if (!isCurrent()) return fail();
    try {
      const frame = classifyInboundFrame(data);
      if (frame.type === PLUGIN_TRANSPORT_DISCONNECT_TYPE) return cleanup('disconnected', false);
      if (frame.type === PLUGIN_TRANSPORT_CANCEL_TYPE) {
        const record = pending.get(frame.request_id);
        if (!record) return;
        pending.delete(frame.request_id);
        scheduler.clearTimeout(record.deadline);
        record.controller.abort();
        return;
      }
      const sequence = requestSequence(frame.request_id);
      if (sequence <= requestHighWater) {
        diagnose('ingress', 'protocol_violation');
        return fail();
      }
      requestHighWater = sequence;
      const method = methodFrom(frame.request);
      const frameAnalysis = analyzePluginRpcFrame(data);
      const semanticAnalysis =
        plainRecord(frame.request) && Object.hasOwn(frame.request, 'params')
          ? analyzePluginRpcSemanticPayload(frame.request.params)
          : undefined;
      if (
        (frameAnalysis.status === 'invalid' &&
          (frameAnalysis.failure === 'non_json_value' || frameAnalysis.failure === 'cyclic_value')) ||
        (semanticAnalysis?.status === 'invalid' &&
          (semanticAnalysis.failure === 'non_json_value' || semanticAnalysis.failure === 'cyclic_value'))
      ) {
        throw new TypeError('Protocol violation.');
      }
      if (frameAnalysis.status === 'invalid' || semanticAnalysis?.status === 'invalid') {
        diagnose('ingress', 'frame_limit_exceeded', method);
        if (!sendRequestError(frame.request_id, errors.limitExceeded)) fail();
        return;
      }
      const validated = validateCorrelatableRequest(frame.request);
      if (validated.status === 'invalid') {
        if (!sendRequestError(frame.request_id, validated.error)) fail();
        return;
      }
      if (pending.size >= PLUGIN_RPC_V1_POLICY.maxInFlightRequests) {
        diagnose('ingress', 'concurrency_limit_exceeded', validated.request.method);
        if (!sendRequestError(frame.request_id, errors.limitExceeded)) fail();
        return;
      }
      const controller = new AbortController();
      let record: PendingRequest | undefined;
      const deadline = scheduler.setTimeout(() => {
        if (record === undefined || state !== 'active' || pending.get(frame.request_id) !== record) return;
        pending.delete(frame.request_id);
        scheduler.clearTimeout(record.deadline);
        controller.abort();
        diagnose('execution', 'execution_timeout', validated.request.method);
        if (!sendRequestError(frame.request_id, errors.timeout)) fail();
      }, PLUGIN_RPC_V1_POLICY.hostExecutionDeadlineMs);
      record = Object.freeze({ controller, deadline, request: validated.request });
      pending.set(frame.request_id, record);
      void settle(frame.request_id, record);
    } catch {
      diagnose('ingress', 'protocol_violation');
      fail();
    }
  };
  lease.port.onmessageerror = fail;
  lease.port.start();

  return Object.freeze({
    emit(event: HostApiEvent): boolean {
      if (state !== 'active') return false;
      if (!isCurrent()) {
        fail();
        return false;
      }
      const eventFrame = Object.freeze({
        contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
        type: PLUGIN_TRANSPORT_EVENT_TYPE,
        event,
      });
      const semantic =
        plainRecord(event) && Object.hasOwn(event, 'payload')
          ? analyzePluginRpcSemanticPayload(event.payload)
          : undefined;
      if (analyzePluginRpcFrame(eventFrame).status === 'invalid' || semantic?.status === 'invalid') {
        diagnose('egress', 'invalid_event');
        return false;
      }
      const validated = validateHostApiEvent(event);
      if (validated.status === 'invalid') {
        diagnose('egress', 'invalid_event');
        return false;
      }
      const frame = Object.freeze({
        contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
        type: PLUGIN_TRANSPORT_EVENT_TYPE,
        event: validated.value,
      });
      if (analyzePluginRpcFrame(frame).status === 'invalid') {
        diagnose('egress', 'invalid_event');
        return false;
      }
      if (!send(frame)) {
        fail();
        return false;
      }
      return true;
    },
    disconnect: () => cleanup('disconnected', true),
    dispose: () => cleanup('disposed', true),
  });
};
