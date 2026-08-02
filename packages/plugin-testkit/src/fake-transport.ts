import type {
  PluginSdkCancellationSignal,
  PluginSdkTransport,
  PluginSdkTransportOperation,
  PluginSdkTransportRequest,
  PluginSdkUnsubscribe,
} from '@lensx/plugin-sdk';

import { createPluginRuntimeContextFixture } from './context.js';

export type FakePluginSdkConnectHandler = (operation: PluginSdkTransportOperation) => unknown | PromiseLike<unknown>;
export type FakePluginSdkRequestHandler = (request: PluginSdkTransportRequest) => unknown | PromiseLike<unknown>;

export interface FakePluginSdkTransportOptions {
  readonly connect?: FakePluginSdkConnectHandler;
  readonly request?: FakePluginSdkRequestHandler;
}

export interface FakePluginSdkRequestObservation {
  readonly method: string;
  readonly params: unknown;
  readonly signal: PluginSdkCancellationSignal;
}

export interface FakePluginSdkSubscriptionObservation {
  readonly active: boolean;
  readonly event: string;
}

export interface FakePluginSdkTransportObservation {
  readonly connectAttempts: number;
  readonly connectSignals: readonly PluginSdkCancellationSignal[];
  readonly disconnectCalls: number;
  readonly disconnectListenerCount: number;
  readonly disposeCalls: number;
  readonly requests: readonly FakePluginSdkRequestObservation[];
  readonly subscriptions: readonly FakePluginSdkSubscriptionObservation[];
}

interface SubscriptionRecord {
  active: boolean;
  readonly event: string;
  readonly listener: (payload: unknown) => void;
}

const defaultConnect: FakePluginSdkConnectHandler = async () => createPluginRuntimeContextFixture();
const defaultRequest: FakePluginSdkRequestHandler = async () => undefined;

export class FakePluginSdkTransport implements PluginSdkTransport {
  #connectAttempts = 0;
  #connectHandler: FakePluginSdkConnectHandler;
  readonly #connectSignals: PluginSdkCancellationSignal[] = [];
  #disconnectCalls = 0;
  readonly #disconnectListeners = new Set<() => void>();
  #disconnected = false;
  #disposeCalls = 0;
  #disposed = false;
  #requestHandler: FakePluginSdkRequestHandler;
  readonly #requests: FakePluginSdkRequestObservation[] = [];
  readonly #subscriptions: SubscriptionRecord[] = [];

  constructor(options: FakePluginSdkTransportOptions = {}) {
    this.#connectHandler = options.connect ?? defaultConnect;
    this.#requestHandler = options.request ?? defaultRequest;
  }

  get observation(): FakePluginSdkTransportObservation {
    return Object.freeze({
      connectAttempts: this.#connectAttempts,
      connectSignals: Object.freeze([...this.#connectSignals]),
      disconnectCalls: this.#disconnectCalls,
      disconnectListenerCount: this.#disconnectListeners.size,
      disposeCalls: this.#disposeCalls,
      requests: Object.freeze(this.#requests.map((request) => Object.freeze({ ...request }))),
      subscriptions: Object.freeze(this.#subscriptions.map(({ active, event }) => Object.freeze({ active, event }))),
    });
  }

  setConnectHandler(handler: FakePluginSdkConnectHandler): this {
    this.#connectHandler = handler;
    return this;
  }

  setRequestHandler(handler: FakePluginSdkRequestHandler): this {
    this.#requestHandler = handler;
    return this;
  }

  connect(operation: PluginSdkTransportOperation): Promise<unknown> {
    this.#connectAttempts += 1;
    this.#connectSignals.push(operation.signal);
    return Promise.resolve().then(() => this.#connectHandler(operation));
  }

  request<Result = unknown>(request: PluginSdkTransportRequest): Promise<Result> {
    this.#requests.push(Object.freeze({ method: request.method, params: request.params, signal: request.signal }));
    return Promise.resolve()
      .then(() => this.#requestHandler(request))
      .then((result) => result as Result);
  }

  subscribe(event: string, listener: (payload: unknown) => void): PluginSdkUnsubscribe {
    if (this.#disposed) {
      return () => undefined;
    }
    const record: SubscriptionRecord = { active: true, event, listener };
    this.#subscriptions.push(record);
    return this.#idempotent(() => {
      record.active = false;
    });
  }

  onDisconnect(listener: () => void): PluginSdkUnsubscribe {
    if (this.#disposed || this.#disconnected) {
      return () => undefined;
    }
    this.#disconnectListeners.add(listener);
    return this.#idempotent(() => this.#disconnectListeners.delete(listener));
  }

  emit(event: string, payload: unknown): void {
    if (this.#disposed) {
      return;
    }
    for (const subscription of [...this.#subscriptions]) {
      if (subscription.active && subscription.event === event) {
        subscription.listener(payload);
      }
    }
  }

  disconnect(): void {
    this.#disconnectCalls += 1;
    if (this.#disposed || this.#disconnected) {
      return;
    }
    this.#disconnected = true;
    const listeners = [...this.#disconnectListeners];
    this.#disconnectListeners.clear();
    for (const listener of listeners) {
      listener();
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#disposeCalls = 1;
    this.#disconnectListeners.clear();
    for (const subscription of this.#subscriptions) {
      subscription.active = false;
    }
  }

  #idempotent(unsubscribe: () => void): PluginSdkUnsubscribe {
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      unsubscribe();
    };
  }
}
