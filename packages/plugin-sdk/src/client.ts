import type { PluginRuntimeContext } from './contract';
import { HOST_API_METHODS } from './host-api';
import {
  createJsonRpcRequest,
  isJsonRpcResponse,
  JsonRpcError,
  JsonRpcErrorCode,
  type JsonRpcNotification,
  type JsonRpcResponse,
} from './rpc';

export type PluginEventMap = {
  'runtime.context': PluginRuntimeContext;
  'runtime.theme_changed': Pick<PluginRuntimeContext, 'theme'>;
  'runtime.locale_changed': Pick<PluginRuntimeContext, 'locale'>;
};

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: number;
};

type PluginClientOptions = {
  target?: Window;
  targetOrigin?: string;
  timeoutMs?: number;
};

export class PluginClient {
  private readonly target: Window;
  private readonly targetOrigin: string;
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, PendingCall>();
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  private sequence = 0;

  constructor(options: PluginClientOptions = {}) {
    this.target = options.target ?? window.parent;
    this.targetOrigin = options.targetOrigin ?? '*';
    this.timeoutMs = options.timeoutMs ?? 5000;
    window.addEventListener('message', this.handleMessage);
  }

  dispose(): void {
    window.removeEventListener('message', this.handleMessage);
    for (const call of this.pending.values()) {
      window.clearTimeout(call.timeout);
      call.reject(new JsonRpcError({ code: JsonRpcErrorCode.Timeout, message: 'client disposed' }));
    }
    this.pending.clear();
    this.listeners.clear();
  }

  async call<TResult = unknown, TParams = unknown>(method: string, params?: TParams): Promise<TResult> {
    const id = `lensx.rpc.${Date.now()}.${this.sequence++}`;
    const request = createJsonRpcRequest(id, method, params);

    return new Promise<TResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new JsonRpcError({ code: JsonRpcErrorCode.Timeout, message: `RPC timed out: ${method}` }));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
        timeout,
      });
      this.target.postMessage(request, this.targetOrigin);
    });
  }

  on<TKey extends keyof PluginEventMap>(event: TKey, listener: (payload: PluginEventMap[TKey]) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as (payload: unknown) => void);
    this.listeners.set(event, listeners);

    return () => {
      listeners.delete(listener as (payload: unknown) => void);
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  getRuntimeContext(): Promise<PluginRuntimeContext> {
    return this.call<PluginRuntimeContext>(HOST_API_METHODS.runtimeGetContext);
  }

  actions = {
    open: (action_id: string) => this.call(HOST_API_METHODS.actionsOpen, { action_id }),
  };

  events = {
    emit: (event_id: string, payload?: unknown) => this.call(HOST_API_METHODS.eventsEmit, { event_id, payload }),
  };

  ui = {
    close: () => this.call(HOST_API_METHODS.uiClose),
  };

  preferences = {
    get: <TValue = unknown>(key: string) => this.call<TValue>(HOST_API_METHODS.preferencesGet, { key }),
  };

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (isJsonRpcResponse(event.data)) {
      this.handleResponse(event.data);
      return;
    }

    const notification = event.data as Partial<JsonRpcNotification>;
    if (notification?.jsonrpc !== '2.0' || typeof notification.method !== 'string') {
      return;
    }

    const listeners = this.listeners.get(notification.method);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(notification.params);
    }
  };

  private handleResponse(response: JsonRpcResponse): void {
    const call = this.pending.get(String(response.id));
    if (!call) {
      return;
    }

    window.clearTimeout(call.timeout);
    this.pending.delete(String(response.id));

    if (response.error) {
      call.reject(new JsonRpcError(response.error));
      return;
    }

    call.resolve(response.result);
  }
}

export const createPluginClient = (options?: PluginClientOptions): PluginClient => new PluginClient(options);
