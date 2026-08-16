import type { HostApiEventName, HostApiRequest } from '@lensx/plugin-contract';

import { PluginSdkError } from './error.js';
import {
  createPluginWebviewBridgeRequestId,
  PLUGIN_WEBVIEW_BRIDGE_CANCEL_TYPE,
  PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION,
  PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE,
  PLUGIN_WEBVIEW_BRIDGE_EVENT_TYPE,
  PLUGIN_WEBVIEW_BRIDGE_READY_TYPE,
  PLUGIN_WEBVIEW_BRIDGE_REQUEST_TYPE,
  PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE,
  type PluginWebviewBridgeRequestId,
  parsePluginWebviewBridgeFrame,
} from './internal/webview-bridge-contract.js';
import type {
  PluginSdkCancellationSignal,
  PluginSdkTransport,
  PluginSdkTransportOperation,
  PluginSdkTransportRequest,
  PluginSdkUnsubscribe,
} from './types.js';

interface PrivatePluginWebviewBridge {
  readonly bootstrap: unknown;
  readonly send: (frame: unknown) => boolean;
  readonly subscribe: (listener: (frame: unknown) => void) => (() => unknown) | undefined;
}

interface PendingRequest {
  readonly method: HostApiRequest['method'];
  readonly reject: (reason: unknown) => void;
  readonly resolve: (value: unknown) => void;
  readonly signal: PluginSdkCancellationSignal;
  readonly abort: () => void;
}

interface PrivatePluginDocument {
  readonly readyState?: unknown;
  readonly defaultView?: unknown;
}

interface PrivateLoadTarget {
  readonly addEventListener: (type: 'load', listener: () => void, options?: { readonly once?: boolean }) => void;
  readonly removeEventListener: (type: 'load', listener: () => void) => void;
  readonly setTimeout: (callback: () => void, delay: number) => unknown;
}

const idempotent = (operation: () => void): (() => void) => {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    operation();
  };
};

const waitForNativeLoadBoundary = (signal: PluginSdkCancellationSignal): Promise<void> | undefined => {
  const document = (globalThis as unknown as { readonly document?: PrivatePluginDocument }).document;
  if (document === undefined || document.readyState === 'complete') return undefined;
  const target = document.defaultView as Partial<PrivateLoadTarget> | undefined;
  if (
    typeof target?.addEventListener !== 'function' ||
    typeof target.removeEventListener !== 'function' ||
    typeof target.setTimeout !== 'function'
  ) {
    return undefined;
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener?.('load', loaded);
      signal.removeEventListener('abort', aborted);
    };
    const loaded = () => {
      cleanup();
      target.setTimeout?.(() => {
        if (signal.aborted) reject(new PluginSdkError('cancelled'));
        else resolve();
      }, 0);
    };
    const aborted = () => {
      cleanup();
      reject(new PluginSdkError('cancelled'));
    };
    signal.addEventListener('abort', aborted);
    target.addEventListener?.('load', loaded, { once: true });
    if (signal.aborted) aborted();
  });
};

const discoverBridge = (): PrivatePluginWebviewBridge => {
  const candidate = (globalThis as unknown as { readonly __LENSX_PLUGIN_WEBVIEW_BRIDGE__?: unknown })
    .__LENSX_PLUGIN_WEBVIEW_BRIDGE__;
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    !Object.isFrozen(candidate) ||
    Object.keys(candidate).sort().join('\0') !== 'bootstrap\0send\0subscribe'
  ) {
    throw new PluginSdkError('transport_failure');
  }
  const bridge = candidate as Partial<PrivatePluginWebviewBridge>;
  if (typeof bridge.send !== 'function' || typeof bridge.subscribe !== 'function') {
    throw new PluginSdkError('transport_failure');
  }
  return bridge as PrivatePluginWebviewBridge;
};

class PluginWebviewTransport implements PluginSdkTransport {
  readonly #cancelledRequestIds = new Set<PluginWebviewBridgeRequestId>();
  readonly #disconnectListeners = new Set<() => void>();
  readonly #eventListeners = new Map<HostApiEventName, Set<(payload: unknown) => void>>();
  readonly #pending = new Map<PluginWebviewBridgeRequestId, PendingRequest>();
  readonly #terminalRequestIds = new Set<PluginWebviewBridgeRequestId>();
  #bridge: PrivatePluginWebviewBridge | undefined;
  #bridgeUnsubscribe: (() => void) | undefined;
  #connectPromise: Promise<unknown> | undefined;
  #disconnectSent = false;
  #requestSequence = 0;
  #state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'disposed' = 'idle';

  connect(operation: PluginSdkTransportOperation): Promise<unknown> {
    if (this.#state === 'disposed') return Promise.reject(new PluginSdkError('disposed'));
    if (this.#state === 'disconnected') return Promise.reject(new PluginSdkError('disconnected'));
    if (this.#connectPromise !== undefined) return this.#connectPromise;
    this.#state = 'connecting';
    this.#connectPromise = this.#connect(operation.signal);
    return this.#connectPromise;
  }

  request<Result = unknown, Request extends HostApiRequest = HostApiRequest>(
    request: PluginSdkTransportRequest<Request>,
  ): Promise<Result> {
    return this.#sendRequest(request) as Promise<Result>;
  }

  subscribe(event: HostApiEventName, listener: (payload: unknown) => void): PluginSdkUnsubscribe {
    if (this.#state === 'disposed' || this.#state === 'disconnected') return () => undefined;
    const listeners = this.#eventListeners.get(event) ?? new Set();
    listeners.add(listener);
    this.#eventListeners.set(event, listeners);
    return idempotent(() => listeners.delete(listener));
  }

  onDisconnect(listener: () => void): PluginSdkUnsubscribe {
    if (this.#state === 'disposed' || this.#state === 'disconnected') return () => undefined;
    this.#disconnectListeners.add(listener);
    return idempotent(() => this.#disconnectListeners.delete(listener));
  }

  dispose(): void {
    this.#terminate('disposed', true);
  }

  async #connect(signal: PluginSdkCancellationSignal): Promise<unknown> {
    try {
      if (signal.aborted) throw new PluginSdkError('cancelled');
      const loadBoundary = waitForNativeLoadBoundary(signal);
      if (loadBoundary !== undefined) await loadBoundary;
      const bridge = discoverBridge();
      const bootstrap = parsePluginWebviewBridgeFrame(bridge.bootstrap);
      if (bootstrap.type !== PLUGIN_WEBVIEW_BRIDGE_READY_TYPE) throw new PluginSdkError('transport_failure');
      const unsubscribe = bridge.subscribe((frame) => this.#receive(frame));
      if (typeof unsubscribe !== 'function') throw new PluginSdkError('transport_failure');
      this.#bridge = bridge;
      this.#bridgeUnsubscribe = idempotent(() => {
        try {
          unsubscribe();
        } catch {
          // A Host-installed bridge listener is private and terminal cleanup is best effort.
        }
      });
      this.#state = 'connected';
      if (bridge.send(bootstrap) !== true) throw new PluginSdkError('transport_failure');
      const result = await this.#sendRequest({ method: 'runtime.get_context', params: {}, signal });
      const record = result as { readonly method?: unknown; readonly result?: unknown };
      if (record?.method !== 'runtime.get_context') throw new PluginSdkError('transport_failure');
      return record.result;
    } catch (error) {
      if (this.#state !== 'disconnected' && this.#state !== 'disposed') this.#terminate('disconnected', false);
      if (error instanceof PluginSdkError && error.code === 'cancelled') throw error;
      throw new PluginSdkError('transport_failure');
    }
  }

  #sendRequest(request: PluginSdkTransportRequest): Promise<unknown> {
    if (this.#state === 'disposed') return Promise.reject(new PluginSdkError('disposed'));
    if (this.#state !== 'connected' || this.#bridge === undefined) {
      return Promise.reject(new PluginSdkError('disconnected'));
    }
    if (request.signal.aborted) return Promise.reject(new PluginSdkError('cancelled'));
    const requestId = createPluginWebviewBridgeRequestId(++this.#requestSequence);
    return new Promise((resolve, reject) => {
      const abort = idempotent(() => {
        const pending = this.#pending.get(requestId);
        if (pending === undefined) return;
        this.#pending.delete(requestId);
        this.#cancelledRequestIds.add(requestId);
        if (
          this.#send(
            Object.freeze({
              contract_version: PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION,
              type: PLUGIN_WEBVIEW_BRIDGE_CANCEL_TYPE,
              request_id: requestId,
            }),
          ) === false
        ) {
          this.#terminate('disconnected', false);
        }
        reject(new PluginSdkError('cancelled'));
      });
      this.#pending.set(requestId, { method: request.method, reject, resolve, signal: request.signal, abort });
      request.signal.addEventListener('abort', abort);
      if (
        this.#send(
          Object.freeze({
            contract_version: PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION,
            type: PLUGIN_WEBVIEW_BRIDGE_REQUEST_TYPE,
            request_id: requestId,
            request: Object.freeze({ method: request.method, params: request.params }),
          }),
        ) === false
      ) {
        this.#pending.delete(requestId);
        request.signal.removeEventListener('abort', abort);
        this.#terminate('disconnected', false);
        reject(new PluginSdkError('disconnected'));
      }
    });
  }

  #send(frame: unknown): boolean {
    try {
      return this.#bridge?.send(frame) === true;
    } catch {
      return false;
    }
  }

  #receive(value: unknown): void {
    if (this.#state !== 'connected') return;
    try {
      const frame = parsePluginWebviewBridgeFrame(value);
      if (frame.type === PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE) {
        this.#terminate('disconnected', false);
        return;
      }
      if (frame.type === PLUGIN_WEBVIEW_BRIDGE_EVENT_TYPE) {
        for (const listener of [...(this.#eventListeners.get(frame.event.event) ?? [])]) {
          listener(frame.event.payload);
        }
        return;
      }
      if (frame.type !== PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE) throw new PluginSdkError('transport_failure');
      if (this.#cancelledRequestIds.has(frame.request_id)) return;
      if (this.#terminalRequestIds.has(frame.request_id)) throw new PluginSdkError('transport_failure');
      const pending = this.#pending.get(frame.request_id);
      if (pending === undefined) throw new PluginSdkError('transport_failure');
      if ('result' in frame && frame.result.method !== pending.method) throw new PluginSdkError('transport_failure');
      this.#pending.delete(frame.request_id);
      this.#terminalRequestIds.add(frame.request_id);
      pending.signal.removeEventListener('abort', pending.abort);
      if ('error' in frame) pending.reject(frame.error);
      else pending.resolve(frame.result);
    } catch {
      this.#terminate('disconnected', true);
    }
  }

  #terminate(state: 'disconnected' | 'disposed', notifyPeer: boolean): void {
    if (this.#state === 'disposed' || this.#state === 'disconnected') return;
    const notifyListeners = state === 'disconnected';
    this.#state = state;
    if (notifyPeer && this.#bridge !== undefined && !this.#disconnectSent) {
      this.#disconnectSent = true;
      this.#send(
        Object.freeze({
          contract_version: PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION,
          type: PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE,
        }),
      );
    }
    this.#bridgeUnsubscribe?.();
    this.#bridgeUnsubscribe = undefined;
    for (const pending of this.#pending.values()) {
      pending.signal.removeEventListener('abort', pending.abort);
      pending.reject(new PluginSdkError(state));
    }
    this.#pending.clear();
    this.#cancelledRequestIds.clear();
    this.#terminalRequestIds.clear();
    this.#eventListeners.clear();
    this.#bridge = undefined;
    if (notifyListeners) {
      const listeners = [...this.#disconnectListeners];
      this.#disconnectListeners.clear();
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // A plugin listener cannot corrupt transport lifecycle state.
        }
      }
    } else {
      this.#disconnectListeners.clear();
    }
  }
}

/** Creates the official zero-configuration transport for a lensX plugin Child WebView. */
export const createPluginWebviewTransport = (): PluginSdkTransport => new PluginWebviewTransport();
