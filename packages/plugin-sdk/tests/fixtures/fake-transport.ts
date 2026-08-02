import type {
  PluginSdkCancellationSignal,
  PluginSdkTransport,
  PluginSdkTransportOperation,
  PluginSdkTransportRequest,
  PluginSdkUnsubscribe,
} from '../../src/index.js';

export const validRuntimeContext = (capabilities: readonly string[] = []) => ({
  capabilities,
  hostApiVersion: '0.1.0',
  locale: 'en-US',
  theme: 'light',
});

export class FakePluginSdkTransport implements PluginSdkTransport {
  connectCalls = 0;
  connectImplementation: (operation: PluginSdkTransportOperation) => Promise<unknown> = async () =>
    validRuntimeContext();
  disposeCalls = 0;
  readonly connectSignals: PluginSdkCancellationSignal[] = [];
  requestImplementation: (request: PluginSdkTransportRequest) => Promise<unknown> = async () => undefined;
  readonly requestSignals: PluginSdkCancellationSignal[] = [];
  readonly #disconnectListeners = new Set<() => void>();
  readonly #eventListeners = new Map<string, Set<(payload: unknown) => void>>();

  connect(operation: PluginSdkTransportOperation): Promise<unknown> {
    this.connectCalls += 1;
    this.connectSignals.push(operation.signal);
    return this.connectImplementation(operation);
  }

  request<Result = unknown>(request: PluginSdkTransportRequest): Promise<Result> {
    this.requestSignals.push(request.signal);
    return this.requestImplementation(request) as Promise<Result>;
  }

  subscribe(event: string, listener: (payload: unknown) => void): PluginSdkUnsubscribe {
    const listeners = this.#eventListeners.get(event) ?? new Set();
    listeners.add(listener);
    this.#eventListeners.set(event, listeners);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      listeners.delete(listener);
    };
  }

  onDisconnect(listener: () => void): PluginSdkUnsubscribe {
    this.#disconnectListeners.add(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      this.#disconnectListeners.delete(listener);
    };
  }

  emit(event: string, payload: unknown): void {
    for (const listener of [...(this.#eventListeners.get(event) ?? [])]) {
      listener(payload);
    }
  }

  disconnect(): void {
    for (const listener of [...this.#disconnectListeners]) {
      listener();
    }
  }

  dispose(): void {
    this.disposeCalls += 1;
    this.#disconnectListeners.clear();
    this.#eventListeners.clear();
  }
}

export class FakeCancellationSignal implements PluginSdkCancellationSignal {
  #aborted = false;
  readonly #listeners = new Set<() => void>();

  get aborted(): boolean {
    return this.#aborted;
  }

  addEventListener(type: 'abort', listener: () => void): void {
    if (type === 'abort') {
      this.#listeners.add(listener);
    }
  }

  removeEventListener(type: 'abort', listener: () => void): void {
    if (type === 'abort') {
      this.#listeners.delete(listener);
    }
  }

  abort(): void {
    if (this.#aborted) {
      return;
    }
    this.#aborted = true;
    for (const listener of [...this.#listeners]) {
      listener();
    }
    this.#listeners.clear();
  }
}

export const deferred = <Value>(): {
  readonly promise: Promise<Value>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: Value) => void;
} => {
  let resolvePromise: (value: Value) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
};
