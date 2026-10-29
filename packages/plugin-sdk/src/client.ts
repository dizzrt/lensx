import {
  type HostApiEventName,
  type HostApiRequest,
  type PluginActionActivation,
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
  readonly #onShortcutActivated: CreatePluginSdkOptions['onShortcutActivated'];
  readonly #activationBuffer = new Map<number, PluginActionActivation>();
  #activation: PluginActionActivation | null | undefined;
  #activationAttempted = false;
  #activationInitializing = false;
  #activationFlushing = false;
  #activationWatermark = 0;
  #transportDisposePromise: Promise<void> | undefined;

  constructor(options: CreatePluginSdkOptions) {
    this.#transport = options.transport;
    this.#onShortcutActivated = options.onShortcutActivated;
    this.#defaultTimeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_PLUGIN_SDK_TIMEOUT_MS);
  }

  get state(): PluginSdkState {
    return this.#state;
  }

  get context(): PluginRuntimeContext | undefined {
    return this.#context;
  }

  get activation(): PluginActionActivation | null | undefined {
    return this.#activation;
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
      operation: async (signal) => {
        const rawContext = await this.#transport.connect({ signal });
        this.#assertInitializing(signal.aborted);
        const context = validateRuntimeContext(rawContext);
        if (!isSupportedHostApiVersion(context.hostApiVersion)) {
          throw new PluginSdkError('incompatible_host_api');
        }
        if (context.capabilities.includes('actions.subscribe_activations')) {
          this.#activationInitializing = true;
          this.#installActivationListener();
          this.#assertInitializing(signal.aborted);
          this.#activationAttempted = true;
          const rawBatch = await this.#transport.request({
            method: 'actions.subscribe_activations',
            params: Object.freeze({}),
            signal,
          });
          this.#assertInitializing(signal.aborted);
          const batch = validateHostApiResult(rawBatch);
          if (batch.status === 'invalid' || batch.value.method !== 'actions.subscribe_activations') {
            throw new PluginSdkError('transport_failure');
          }
          for (const activation of batch.value.result.activations) this.#bufferActivation(activation);
        }
        return context;
      },
      pendingOperations: this.#pendingOperations,
      signal: options.signal,
      timeoutMs,
    })
      .then((context) => {
        this.#assertInitializing(false);
        this.#context = context;
        this.#activation = null;
        this.#transition('ready');
        this.#activationInitializing = false;
        this.#flushActivations();
        return context;
      })
      .catch((error: unknown) => {
        if (this.#state !== 'disposed' && this.#state !== 'disconnected') {
          if (this.#activationAttempted) {
            this.#terminateInvalidTransport();
          } else {
            this.#removeDisconnectListener();
            this.#removeEventListeners();
            this.#context = undefined;
            this.#transition('idle');
          }
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
    this.#clearActivation();
    this.#transition('disposed');
    abortPendingOperations(this.#pendingOperations, new PluginSdkError('disposed'));
    this.#removeDisconnectListener();
    this.#removeEventListeners();
    this.#stateListeners.clear();

    this.#disposePromise = this.#disposeTransport();
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
    this.#clearActivation();
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
    void this.#disposeTransport().catch(() => undefined);
  }

  #disposeTransport(): Promise<void> {
    this.#transportDisposePromise ??= Promise.resolve()
      .then(() => this.#transport.dispose())
      .catch(() => {
        throw new PluginSdkError('transport_failure');
      });
    return this.#transportDisposePromise;
  }

  #assertInitializing(aborted: boolean): void {
    if (this.#state === 'disposed') throw new PluginSdkError('disposed');
    if (this.#state === 'disconnected') throw new PluginSdkError('disconnected');
    if (aborted || this.#state !== 'initializing') throw new PluginSdkError('cancelled');
  }

  #installActivationListener(): void {
    let active = true;
    const release = this.#transport.subscribe('actions.activated', (payload) => {
      if (!active || (this.#state !== 'initializing' && this.#state !== 'ready')) return;
      const event = validateHostApiEvent({ event: 'actions.activated', payload });
      if (event.status === 'invalid' || event.value.event !== 'actions.activated') {
        this.#terminateInvalidTransport();
        return;
      }
      try {
        this.#bufferActivation(event.value.payload);
        if (!this.#activationInitializing) this.#flushActivations();
      } catch {
        this.#terminateInvalidTransport();
      }
    });
    const unsubscribe = idempotent(() => {
      active = false;
      this.#eventUnsubscribes.delete(unsubscribe);
      try {
        release();
      } catch {
        /* Private cleanup errors are isolated. */
      }
    });
    this.#eventUnsubscribes.add(unsubscribe);
    if (this.#state === 'disconnected' || this.#state === 'disposed') unsubscribe();
  }

  #bufferActivation(activation: PluginActionActivation): void {
    if (activation.invocationId <= this.#activationWatermark) return;
    const existing = this.#activationBuffer.get(activation.invocationId);
    if (existing !== undefined) {
      if (existing.actionId !== activation.actionId || existing.source !== activation.source) {
        throw new PluginSdkError('transport_failure');
      }
      return;
    }
    if (this.#activationBuffer.size >= 64) throw new PluginSdkError('transport_failure');
    this.#activationBuffer.set(activation.invocationId, activation);
  }

  #flushActivations(): void {
    if (this.#activationFlushing || this.#state !== 'ready') return;
    this.#activationFlushing = true;
    try {
      while (this.#state === 'ready' && this.#activationBuffer.size > 0) {
        const id = Math.min(...this.#activationBuffer.keys());
        const activation = this.#activationBuffer.get(id);
        this.#activationBuffer.delete(id);
        if (activation === undefined || id <= this.#activationWatermark) continue;
        this.#activationWatermark = id;
        this.#activation = activation;
        if (activation.source === 'shortcut' && this.#onShortcutActivated !== undefined) {
          try {
            void Promise.resolve(this.#onShortcutActivated(activation)).catch(() => undefined);
          } catch {
            // Business failure never changes navigation or SDK lifecycle and is not retried.
          }
        }
      }
    } finally {
      this.#activationFlushing = false;
    }
  }

  #clearActivation(): void {
    this.#activation = undefined;
    this.#activationBuffer.clear();
    this.#activationInitializing = false;
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
