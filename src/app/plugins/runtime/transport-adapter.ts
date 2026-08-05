import {
  type HostApiError,
  type HostApiEvent,
  type HostApiRequest,
  type HostApiResult,
  validateHostApiError,
  validateHostApiEvent,
  validateHostApiResult,
} from '@lensx/plugin-contract';

import type { PluginRuntimeHostPortLease } from './session-service';
import {
  PLUGIN_TRANSPORT_CANCEL_TYPE,
  PLUGIN_TRANSPORT_CONTRACT_VERSION,
  PLUGIN_TRANSPORT_DISCONNECT_TYPE,
  PLUGIN_TRANSPORT_EVENT_TYPE,
  PLUGIN_TRANSPORT_REQUEST_TYPE,
  PLUGIN_TRANSPORT_RESPONSE_TYPE,
  type PluginTransportRequestId,
  parsePluginRuntimeTransportFrame,
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
}

const unavailableError = Object.freeze({
  code: 'unavailable',
  message: 'The Host API is unavailable.',
}) satisfies HostApiError;

export const unavailablePluginRuntimeTransportHandler: PluginRuntimeTransportHandler = () => unavailableError;

export const attachPluginRuntimeTransport = ({
  lease,
  handler,
  isCurrent,
  onDisconnect,
}: AttachPluginRuntimeTransportInput): PluginRuntimeTransportAdapter => {
  const pending = new Map<PluginTransportRequestId, AbortController>();
  const terminal = new Set<PluginTransportRequestId>();
  let state: 'active' | 'disconnected' | 'disposed' = 'active';
  let disconnectSent = false;

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
    for (const controller of pending.values()) controller.abort();
    pending.clear();
    try {
      lease.port.close();
    } catch {
      // A transferred or already-closed Port is safe to forget.
    }
    if (nextState === 'disconnected') onDisconnect?.();
  };
  const fail = () => cleanup('disconnected', true);

  const settle = async (requestId: PluginTransportRequestId, request: HostApiRequest, controller: AbortController) => {
    try {
      const output = await handler(Object.freeze({ identity: lease.identity, request, signal: controller.signal }));
      if (state !== 'active' || !isCurrent() || controller.signal.aborted || pending.get(requestId) !== controller)
        return;
      const response = isPostResponseOutcome(output) ? output.response : output;
      const error = validateHostApiError(response);
      let sent = false;
      if (error.status === 'valid') {
        sent = send(
          Object.freeze({
            contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
            type: PLUGIN_TRANSPORT_RESPONSE_TYPE,
            request_id: requestId,
            error: error.value,
          }),
        );
      } else {
        const result = validateHostApiResult(response);
        if (result.status === 'invalid' || result.value.method !== request.method) return fail();
        sent = send(
          Object.freeze({
            contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
            type: PLUGIN_TRANSPORT_RESPONSE_TYPE,
            request_id: requestId,
            result: result.value,
          }),
        );
      }
      if (!sent) return;
      pending.delete(requestId);
      terminal.add(requestId);
      if (isPostResponseOutcome(output) && state === 'active' && isCurrent() && !controller.signal.aborted) {
        output.effect();
      }
    } catch {
      fail();
    }
  };

  lease.port.onmessage = ({ data }) => {
    if (state !== 'active') return;
    if (!isCurrent()) return fail();
    try {
      const frame = parsePluginRuntimeTransportFrame(data);
      if (frame.type === PLUGIN_TRANSPORT_DISCONNECT_TYPE) return cleanup('disconnected', false);
      if (frame.type === PLUGIN_TRANSPORT_CANCEL_TYPE) {
        const controller = pending.get(frame.request_id);
        if (!controller) return;
        pending.delete(frame.request_id);
        terminal.add(frame.request_id);
        controller.abort();
        return;
      }
      if (frame.type !== PLUGIN_TRANSPORT_REQUEST_TYPE) return fail();
      if (pending.has(frame.request_id) || terminal.has(frame.request_id)) return fail();
      const controller = new AbortController();
      pending.set(frame.request_id, controller);
      void settle(frame.request_id, frame.request, controller);
    } catch {
      fail();
    }
  };
  lease.port.onmessageerror = fail;
  lease.port.start();

  return Object.freeze({
    emit(event: HostApiEvent): boolean {
      if (state !== 'active' || !isCurrent()) return false;
      const validated = validateHostApiEvent(event);
      if (validated.status === 'invalid') {
        fail();
        return false;
      }
      return send(
        Object.freeze({
          contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
          type: PLUGIN_TRANSPORT_EVENT_TYPE,
          event: validated.value,
        }),
      );
    },
    disconnect: () => cleanup('disconnected', true),
    dispose: () => cleanup('disposed', true),
  });
};
