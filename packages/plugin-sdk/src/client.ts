import {
  type HostApiEventName,
  type HostApiRequest,
  validateHostApiEvent,
  validateHostApiRequest,
  validateHostApiResult,
} from '@lensx/plugin-contract';

import { DEFAULT_PLUGIN_SDK_TIMEOUT_MS } from './constants.js';
import { validateRuntimeContext } from './context.js';
import { PluginSdkError, toPluginSdkError } from './error.js';
import {
  abortPendingOperations,
  type PendingOperationSet,
  runSdkOperation,
  validateCancellationSignal,
  validateTimeout,
} from './operation.js';
import { isSupportedHostApiVersion } from './semver.js';
import type {
  CreatePluginSdkOptions,
  PluginRuntimeContext,
  PluginSdkClient,
  PluginSdkEvent,
  PluginSdkOperationOptions,
  PluginSdkRequestResult,
  PluginSdkState,
  PluginSdkUnsubscribe,
} from './types.js';

const idempotent = (unsubscribe: PluginSdkUnsubscribe): PluginSdkUnsubscribe => {
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    unsubscribe();
  };
};

class PluginSdkClientImplementation implements PluginSdkClient {
  readonly #defaultTimeoutMs: number;
  readonly #pendingOperations: PendingOperationSet = new Set();
  readonly #stateListeners = new Set<(state: PluginSdkState) => void>();
  readonly #eventUnsubscribes = new Set<PluginSdkUnsubscribe>();
  readonly #transport: CreatePluginSdkOptions['transport'];
  #context: PluginRuntimeContext | undefined;
  #disconnectUnsubscribe: PluginSdkUnsubscribe | undefined;
  #disposePromise: Promise<void> | undefined;
  #initializePromise: Promise<PluginRuntimeContext> | undefined;
  #state: PluginSdkState = 'idle';

  constructor(options: CreatePluginSdkOptions) {
    this.#transport = options.transport;
    this.#defaultTimeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_PLUGIN_SDK_TIMEOUT_MS);
  }

  get state(): PluginSdkState {
    return this.#state;
  }

  get context(): PluginRuntimeContext | undefined {
    return this.#context;
  }

  initialize(options: PluginSdkOperationOptions = {}): Promise<PluginRuntimeContext> {
    if (this.#state === 'disposed') {
      return Promise.reject(new PluginSdkError('disposed'));
    }
    if (this.#state === 'disconnected') {
      return Promise.reject(new PluginSdkError('disconnected'));
    }
    if (this.#state === 'ready' && this.#context !== undefined) {
      return Promise.resolve(this.#context);
    }
    if (this.#initializePromise !== undefined) {
      return this.#initializePromise;
    }

    const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs;
    try {
      validateTimeout(timeoutMs);
      validateCancellationSignal(options.signal);
      this.#installDisconnectListener();
    } catch (error) {
      return Promise.reject(toPluginSdkError(error));
    }
    this.#transition('initializing');

    const initializePromise = runSdkOperation({
      operation: (signal) => this.#transport.connect({ signal }),
      pendingOperations: this.#pendingOperations,
      signal: options.signal,
      timeoutMs,
    })
      .then((rawContext) => {
        if (this.#state === 'disposed') {
          throw new PluginSdkError('disposed');
        }
        if (this.#state === 'disconnected') {
          throw new PluginSdkError('disconnected');
        }
        const context = validateRuntimeContext(rawContext);
        if (!isSupportedHostApiVersion(context.hostApiVersion)) {
          throw new PluginSdkError('incompatible_host_api');
        }
        this.#context = context;
        this.#transition('ready');
        return context;
      })
      .catch((error: unknown) => {
        if (this.#state !== 'disposed' && this.#state !== 'disconnected') {
          this.#removeDisconnectListener();
          this.#context = undefined;
          this.#transition('idle');
        }
        throw toPluginSdkError(error);
      })
      .finally(() => {
        if (this.#initializePromise === initializePromise) {
          this.#initializePromise = undefined;
        }
      });

    this.#initializePromise = initializePromise;
    return initializePromise;
  }

  async request<Request extends HostApiRequest>(
    request: Request,
    options: PluginSdkOperationOptions = {},
  ): Promise<PluginSdkRequestResult<Request>> {
    if (this.#state === 'disposed') throw new PluginSdkError('disposed');
    if (this.#state === 'disconnected') throw new PluginSdkError('disconnected');
    if (this.#state !== 'ready' || this.#context === undefined) {
      throw new PluginSdkError('transport_failure');
    }
    const validated = validateHostApiRequest(request);
    if (validated.status === 'invalid' || !this.#context.capabilities.includes(validated.value.method)) {
      throw new PluginSdkError('invalid_argument');
    }
    const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs;
    try {
      validateTimeout(timeoutMs);
      validateCancellationSignal(options.signal);
    } catch (error) {
      throw toPluginSdkError(error);
    }
    const rawResult = await runSdkOperation({
      operation: (signal) =>
        this.#transport.request({ method: validated.value.method, params: validated.value.params, signal }),
      pendingOperations: this.#pendingOperations,
      signal: options.signal,
      timeoutMs,
    });
    const result = validateHostApiResult(rawResult);
    if (result.status === 'invalid' || result.value.method !== validated.value.method) {
      throw new PluginSdkError('transport_failure');
    }
    return result.value.result as unknown as PluginSdkRequestResult<Request>;
  }

  subscribe<EventName extends HostApiEventName>(
    event: EventName,
    listener: (event: PluginSdkEvent<EventName>) => void,
  ): PluginSdkUnsubscribe {
    if (this.#state === 'disposed') throw new PluginSdkError('disposed');
    if (this.#state === 'disconnected') throw new PluginSdkError('disconnected');
    if (this.#state !== 'ready') throw new PluginSdkError('transport_failure');
    let active = true;
    const transportUnsubscribe = this.#transport.subscribe(event, (payload) => {
      if (!active || this.#state !== 'ready') return;
      const validated = validateHostApiEvent({ event, payload });
      if (validated.status === 'invalid') {
        this.#terminateInvalidTransport();
        return;
      }
      if (validated.value.event === 'runtime.context_changed') {
        this.#context = validated.value.payload;
      }
      try {
        listener(validated.value as PluginSdkEvent<EventName>);
      } catch {
        // A plugin listener cannot corrupt SDK lifecycle or transport state.
      }
    });
    const unsubscribe = idempotent(() => {
      active = false;
      this.#eventUnsubscribes.delete(unsubscribe);
      try {
        transportUnsubscribe();
      } catch {
        // Transport cleanup cannot expose a private error.
      }
    });
    this.#eventUnsubscribes.add(unsubscribe);
    return unsubscribe;
  }

  subscribeState(listener: (state: PluginSdkState) => void): PluginSdkUnsubscribe {
    if (this.#state === 'disposed') {
      return () => undefined;
    }
    this.#stateListeners.add(listener);
    return idempotent(() => this.#stateListeners.delete(listener));
  }

  dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) {
      return this.#disposePromise;
    }
    this.#context = undefined;
    this.#transition('disposed');
    abortPendingOperations(this.#pendingOperations, new PluginSdkError('disposed'));
    this.#removeDisconnectListener();
    this.#removeEventListeners();
    this.#stateListeners.clear();

    this.#disposePromise = Promise.resolve()
      .then(() => this.#transport.dispose())
      .catch(() => {
        throw new PluginSdkError('transport_failure');
      });
    return this.#disposePromise;
  }

  #installDisconnectListener(): void {
    if (this.#disconnectUnsubscribe !== undefined) {
      return;
    }
    this.#disconnectUnsubscribe = idempotent(this.#transport.onDisconnect(() => this.#handleDisconnect()));
  }

  #removeDisconnectListener(): void {
    const unsubscribe = this.#disconnectUnsubscribe;
    this.#disconnectUnsubscribe = undefined;
    try {
      unsubscribe?.();
    } catch {
      // Transport cleanup cannot expose a private error or corrupt client state.
    }
  }

  #handleDisconnect(): void {
    if (this.#state === 'disposed' || this.#state === 'disconnected') {
      return;
    }
    this.#context = undefined;
    this.#transition('disconnected');
    abortPendingOperations(this.#pendingOperations, new PluginSdkError('disconnected'));
    this.#removeDisconnectListener();
    this.#removeEventListeners();
  }

  #removeEventListeners(): void {
    for (const unsubscribe of [...this.#eventUnsubscribes]) unsubscribe();
    this.#eventUnsubscribes.clear();
  }

  #terminateInvalidTransport(): void {
    this.#handleDisconnect();
    Promise.resolve(this.#transport.dispose()).catch(() => undefined);
  }

  #transition(state: PluginSdkState): void {
    if (this.#state === state) {
      return;
    }
    this.#state = state;
    for (const listener of [...this.#stateListeners]) {
      try {
        listener(state);
      } catch {
        // A consumer listener cannot corrupt SDK lifecycle state.
      }
    }
  }
}

export const createPluginSdk = (options: CreatePluginSdkOptions): PluginSdkClient =>
  new PluginSdkClientImplementation(options);
