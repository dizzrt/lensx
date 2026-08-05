import type { HostApiEventName, HostApiRequest } from '@lensx/plugin-contract';

import { PluginSdkError } from './error.js';
import {
  createPluginTransportRequestId,
  PLUGIN_RUNTIME_READY_TYPE,
  PLUGIN_TRANSPORT_CANCEL_TYPE,
  PLUGIN_TRANSPORT_CONTRACT_VERSION,
  PLUGIN_TRANSPORT_DISCONNECT_TYPE,
  PLUGIN_TRANSPORT_EVENT_TYPE,
  PLUGIN_TRANSPORT_REQUEST_TYPE,
  PLUGIN_TRANSPORT_RESPONSE_TYPE,
  type PluginTransportRequestId,
  parsePluginRuntimeBootstrap,
  parsePluginTransportFrame,
} from './internal/transport-contract.js';
import type {
  PluginSdkCancellationSignal,
  PluginSdkTransport,
  PluginSdkTransportOperation,
  PluginSdkTransportRequest,
  PluginSdkUnsubscribe,
} from './types.js';

interface PrivateMessageEvent {
  readonly data: unknown;
  readonly origin: string;
  readonly ports: readonly PrivateMessagePort[];
  readonly source: unknown;
}

interface PrivateMessagePort {
  onmessage: ((event: Pick<PrivateMessageEvent, 'data'>) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(value: unknown): void;
  start(): void;
  close(): void;
}

interface PrivateWindow {
  readonly parent: unknown;
  addEventListener(type: 'message', listener: (event: PrivateMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: PrivateMessageEvent) => void): void;
}

interface PrivatePluginIframeTransportAdapters {
  readonly currentWindow: PrivateWindow;
  readonly isSupportedHostOrigin: (origin: string) => boolean;
}

interface PendingRequest {
  readonly method: HostApiRequest['method'];
  readonly reject: (reason: unknown) => void;
  readonly resolve: (value: unknown) => void;
  readonly signal: PluginSdkCancellationSignal;
  readonly abort: () => void;
}

const supportedHostOrigins = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'lensx-runtime-harness://localhost',
]);

const browserAdapters = (): PrivatePluginIframeTransportAdapters => {
  const currentWindow = (globalThis as unknown as { readonly window?: PrivateWindow }).window;
  if (!currentWindow) throw new PluginSdkError('transport_failure');
  return Object.freeze({
    currentWindow,
    isSupportedHostOrigin: (origin: string) => supportedHostOrigins.has(origin),
  });
};

const idempotent = (operation: () => void): (() => void) => {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    operation();
  };
};

class PluginIframeTransport implements PluginSdkTransport {
  readonly #adapters: PrivatePluginIframeTransportAdapters;
  readonly #disconnectListeners = new Set<() => void>();
  readonly #eventListeners = new Map<HostApiEventName, Set<(payload: unknown) => void>>();
  readonly #pending = new Map<PluginTransportRequestId, PendingRequest>();
  readonly #cancelledRequestIds = new Set<PluginTransportRequestId>();
  readonly #terminalRequestIds = new Set<PluginTransportRequestId>();
  #bootstrapListener: ((event: PrivateMessageEvent) => void) | undefined;
  #connectPromise: Promise<unknown> | undefined;
  #disconnectSent = false;
  #port: PrivateMessagePort | undefined;
  #requestSequence = 0;
  #state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'disposed' = 'idle';

  constructor(adapters: PrivatePluginIframeTransportAdapters) {
    this.#adapters = adapters;
  }

  connect(operation: PluginSdkTransportOperation): Promise<unknown> {
    if (this.#state === 'disposed') return Promise.reject(new PluginSdkError('disposed'));
    if (this.#state === 'disconnected') return Promise.reject(new PluginSdkError('disconnected'));
    if (this.#connectPromise) return this.#connectPromise;
    this.#state = 'connecting';
    this.#connectPromise = this.#consumeBootstrap(operation.signal).then(async () => {
      const result = await this.#sendRequest(
        { method: 'runtime.get_context', params: {}, signal: operation.signal },
        true,
      );
      const record = result as { readonly method?: unknown; readonly result?: unknown };
      if (record?.method !== 'runtime.get_context') throw new PluginSdkError('transport_failure');
      return record.result;
    });
    return this.#connectPromise;
  }

  request<Result = unknown, Request extends HostApiRequest = HostApiRequest>(
    request: PluginSdkTransportRequest<Request>,
  ): Promise<Result> {
    return this.#sendRequest(request, false) as Promise<Result>;
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

  #consumeBootstrap(signal: PluginSdkCancellationSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const currentWindow = this.#adapters.currentWindow;
      if (currentWindow.parent === currentWindow || signal.aborted) {
        this.#terminate('disconnected', false);
        reject(new PluginSdkError('transport_failure'));
        return;
      }
      const abort = () => {
        this.#terminate('disconnected', false);
        reject(new PluginSdkError('transport_failure'));
      };
      const listener = (event: PrivateMessageEvent) => {
        if (event.source !== currentWindow.parent || !this.#adapters.isSupportedHostOrigin(event.origin)) return;
        try {
          const bootstrap = parsePluginRuntimeBootstrap(event.data);
          if (event.ports.length !== 1 || !event.ports[0]) throw new PluginSdkError('transport_failure');
          const port = event.ports[0];
          this.#removeBootstrapListener();
          signal.removeEventListener('abort', abort);
          this.#port = port;
          port.onmessage = ({ data }) => this.#receive(data);
          port.onmessageerror = () => this.#terminate('disconnected', false);
          port.start();
          port.postMessage(
            Object.freeze({
              contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
              type: PLUGIN_RUNTIME_READY_TYPE,
              nonce: bootstrap.nonce,
            }),
          );
          this.#state = 'connected';
          resolve();
        } catch {
          this.#removeBootstrapListener();
          signal.removeEventListener('abort', abort);
          this.#terminate('disconnected', false);
          reject(new PluginSdkError('transport_failure'));
        }
      };
      this.#bootstrapListener = listener;
      signal.addEventListener('abort', abort);
      currentWindow.addEventListener('message', listener);
    });
  }

  #sendRequest(request: PluginSdkTransportRequest, duringConnect: boolean): Promise<unknown> {
    if (this.#state === 'disposed') return Promise.reject(new PluginSdkError('disposed'));
    if (this.#state !== 'connected' || (!duringConnect && this.#connectPromise === undefined)) {
      return Promise.reject(new PluginSdkError('disconnected'));
    }
    if (request.signal.aborted) return Promise.reject(new PluginSdkError('cancelled'));
    const requestId = createPluginTransportRequestId(++this.#requestSequence);
    return new Promise((resolve, reject) => {
      const abort = idempotent(() => {
        const pending = this.#pending.get(requestId);
        if (!pending) return;
        this.#pending.delete(requestId);
        this.#cancelledRequestIds.add(requestId);
        try {
          this.#port?.postMessage(
            Object.freeze({
              contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
              type: PLUGIN_TRANSPORT_CANCEL_TYPE,
              request_id: requestId,
            }),
          );
        } catch {
          this.#terminate('disconnected', false);
        }
        reject(new PluginSdkError('cancelled'));
      });
      this.#pending.set(requestId, {
        method: request.method,
        reject,
        resolve,
        signal: request.signal,
        abort,
      });
      request.signal.addEventListener('abort', abort);
      try {
        this.#port?.postMessage(
          Object.freeze({
            contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
            type: PLUGIN_TRANSPORT_REQUEST_TYPE,
            request_id: requestId,
            request: Object.freeze({ method: request.method, params: request.params }),
          }),
        );
      } catch {
        this.#pending.delete(requestId);
        request.signal.removeEventListener('abort', abort);
        this.#terminate('disconnected', false);
        reject(new PluginSdkError('disconnected'));
      }
    });
  }

  #receive(value: unknown): void {
    if (this.#state !== 'connected') return;
    try {
      const frame = parsePluginTransportFrame(value);
      if (frame.type === PLUGIN_TRANSPORT_DISCONNECT_TYPE) {
        this.#terminate('disconnected', false);
        return;
      }
      if (frame.type === PLUGIN_TRANSPORT_EVENT_TYPE) {
        for (const listener of [...(this.#eventListeners.get(frame.event.event) ?? [])]) {
          listener(frame.event.payload);
        }
        return;
      }
      if (frame.type !== PLUGIN_TRANSPORT_RESPONSE_TYPE) throw new PluginSdkError('transport_failure');
      if (this.#cancelledRequestIds.has(frame.request_id)) return;
      if (this.#terminalRequestIds.has(frame.request_id)) throw new PluginSdkError('transport_failure');
      const pending = this.#pending.get(frame.request_id);
      if (!pending) throw new PluginSdkError('transport_failure');
      if ('result' in frame && frame.result.method !== pending.method) throw new PluginSdkError('transport_failure');
      this.#pending.delete(frame.request_id);
      this.#terminalRequestIds.add(frame.request_id);
      pending.signal.removeEventListener('abort', pending.abort);
      if ('error' in frame) pending.reject(frame.error);
      else pending.resolve(frame.result);
    } catch {
      this.#terminate('disconnected', false);
    }
  }

  #removeBootstrapListener(): void {
    if (!this.#bootstrapListener) return;
    this.#adapters.currentWindow.removeEventListener('message', this.#bootstrapListener);
    this.#bootstrapListener = undefined;
  }

  #terminate(state: 'disconnected' | 'disposed', notifyPeer: boolean): void {
    if (this.#state === 'disposed' || this.#state === 'disconnected') return;
    const notifyListeners = state === 'disconnected';
    this.#state = state;
    this.#removeBootstrapListener();
    if (notifyPeer && this.#port && !this.#disconnectSent) {
      this.#disconnectSent = true;
      try {
        this.#port.postMessage(
          Object.freeze({
            contract_version: PLUGIN_TRANSPORT_CONTRACT_VERSION,
            type: PLUGIN_TRANSPORT_DISCONNECT_TYPE,
          }),
        );
      } catch {
        // Terminal notification is bounded and best effort.
      }
    }
    for (const pending of this.#pending.values()) {
      pending.signal.removeEventListener('abort', pending.abort);
      pending.reject(new PluginSdkError(state));
    }
    this.#pending.clear();
    this.#eventListeners.clear();
    const port = this.#port;
    this.#port = undefined;
    if (port) {
      port.onmessage = null;
      port.onmessageerror = null;
      try {
        port.close();
      } catch {
        // A transferred or already-closed Port is safe to forget.
      }
    }
    if (notifyListeners) {
      const listeners = [...this.#disconnectListeners];
      this.#disconnectListeners.clear();
      for (const listener of listeners) listener();
    } else {
      this.#disconnectListeners.clear();
    }
  }
}

const createPluginIframeTransportWithAdapters = (adapters: PrivatePluginIframeTransportAdapters): PluginSdkTransport =>
  new PluginIframeTransport(adapters);

/** Creates the official zero-configuration transport for an isolated lensX plugin iframe. */
export const createPluginIframeTransport = (): PluginSdkTransport =>
  createPluginIframeTransportWithAdapters(browserAdapters());
