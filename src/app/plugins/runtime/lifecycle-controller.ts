import { browserPluginRuntimeScheduler, type PluginRuntimeScheduler } from './scheduler';

export const PLUGIN_RUNTIME_LOAD_DEADLINE_MS = 10_000;
export const PLUGIN_RUNTIME_FAILURE_WINDOW_MS = 60_000;
export const PLUGIN_RUNTIME_BREAKER_COOLDOWN_MS = 30_000;
export const PLUGIN_RUNTIME_HEALTHY_RESET_MS = 30_000;

export type PluginRuntimeFailureCode =
  | 'runtime_load_timeout'
  | 'runtime_handshake_timeout'
  | 'runtime_session_disconnected'
  | 'runtime_security_policy_failure'
  | 'runtime_crash_loop'
  | 'runtime_unavailable';

export type PluginRuntimeTerminalReason =
  | 'manual_close'
  | 'navigation'
  | 'quiescence'
  | 'invalidation'
  | 'retry'
  | 'host_reload'
  | 'app_teardown'
  | 'graceful_exit'
  | 'failure';

const QUALIFYING_FAILURES: ReadonlySet<PluginRuntimeFailureCode> = new Set([
  'runtime_load_timeout',
  'runtime_handshake_timeout',
  'runtime_session_disconnected',
]);

interface BreakerRecord {
  readonly entryId: string;
  readonly generation: string;
  failures: number[];
  cooldownUntil?: number;
  healthyTimer?: unknown;
}

const breakerKey = (entryId: string, generation: string) => `${entryId}\u0000${generation}`;

export class PluginRuntimeCircuitBreaker {
  readonly #records = new Map<string, BreakerRecord>();
  readonly #scheduler: PluginRuntimeScheduler;

  constructor(scheduler: PluginRuntimeScheduler = browserPluginRuntimeScheduler) {
    this.#scheduler = scheduler;
  }

  observeGeneration(entryId: string, generation: string): string {
    for (const [key, record] of this.#records) {
      if (record.entryId === entryId && record.generation !== generation) {
        this.#clearRecord(key, record);
      }
    }
    return breakerKey(entryId, generation);
  }

  isCoolingDown(key: string): boolean {
    const record = this.#records.get(key);
    if (!record?.cooldownUntil) return false;
    if (this.#scheduler.now() < record.cooldownUntil) return true;
    record.cooldownUntil = undefined;
    return false;
  }

  recordFailure(key: string, code: PluginRuntimeFailureCode): boolean {
    if (!QUALIFYING_FAILURES.has(code)) return this.isCoolingDown(key);
    const record = this.#records.get(key);
    if (!record) return false;
    const now = this.#scheduler.now();
    if (record.healthyTimer !== undefined) {
      this.#scheduler.clearTimeout(record.healthyTimer);
      record.healthyTimer = undefined;
    }
    record.failures = record.failures.filter((failure) => now - failure <= PLUGIN_RUNTIME_FAILURE_WINDOW_MS);
    record.failures.push(now);
    if (record.failures.length >= 3) {
      record.cooldownUntil = now + PLUGIN_RUNTIME_BREAKER_COOLDOWN_MS;
      return true;
    }
    return false;
  }

  ensureRecord(entryId: string, generation: string): string {
    const key = this.observeGeneration(entryId, generation);
    if (!this.#records.has(key)) {
      this.#records.set(key, { entryId, generation, failures: [] });
    }
    return key;
  }

  beginHealthyWindow(key: string): () => void {
    const record = this.#records.get(key);
    if (!record) return () => undefined;
    if (record.healthyTimer !== undefined) this.#scheduler.clearTimeout(record.healthyTimer);
    const timer = this.#scheduler.setTimeout(() => {
      const current = this.#records.get(key);
      if (current !== record || current.healthyTimer !== timer) return;
      this.#clearRecord(key, current);
    }, PLUGIN_RUNTIME_HEALTHY_RESET_MS);
    record.healthyTimer = timer;
    return () => {
      if (record.healthyTimer === timer) {
        this.#scheduler.clearTimeout(timer);
        record.healthyTimer = undefined;
      }
    };
  }

  reset(): void {
    for (const [key, record] of this.#records) this.#clearRecord(key, record);
  }

  #clearRecord(key: string, record: BreakerRecord): void {
    if (record.healthyTimer !== undefined) this.#scheduler.clearTimeout(record.healthyTimer);
    this.#records.delete(key);
  }
}

export interface PluginRuntimeAttempt {
  readonly key: number;
  readonly isCurrent: () => boolean;
  readonly bindCancellable: (cancel: () => void) => void;
  readonly bindSubscription: (unsubscribe: () => void) => void;
  readonly bindSession: (dispose: () => void) => void;
  readonly bindIframe: (unbind: () => void) => void;
  readonly bindNavigationLease: (release: () => void | Promise<void>) => void;
  readonly bindTrustedIdentity: (entryId: string, generation: string) => boolean;
  readonly startLoadDeadline: () => void;
  readonly completeLoad: () => void;
  readonly markReady: () => void;
  readonly fail: (code: PluginRuntimeFailureCode) => Promise<void>;
  readonly terminate: (reason: PluginRuntimeTerminalReason) => Promise<void>;
}

export interface StartPluginRuntimeAttemptInput {
  readonly targetKey: string;
  readonly onFailure: (code: PluginRuntimeFailureCode) => void;
}

export interface PluginRuntimeLifecycleService {
  readonly start: (input: StartPluginRuntimeAttemptInput) => Promise<PluginRuntimeAttempt | undefined>;
  readonly terminateCurrent: (reason: PluginRuntimeTerminalReason) => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export const createPluginRuntimeLifecycleService = (
  options: { readonly scheduler?: PluginRuntimeScheduler; readonly breaker?: PluginRuntimeCircuitBreaker } = {},
): PluginRuntimeLifecycleService => {
  const scheduler = options.scheduler ?? browserPluginRuntimeScheduler;
  const breaker = options.breaker ?? new PluginRuntimeCircuitBreaker(scheduler);
  const trustedTargets = new Map<string, string>();
  let sequence = 0;
  let current: PluginRuntimeAttempt | undefined;
  let terminalQueue: Promise<void> = Promise.resolve();
  let disposed = false;

  const terminateCurrent = (reason: PluginRuntimeTerminalReason) => {
    const attempt = current;
    return attempt ? attempt.terminate(reason) : terminalQueue;
  };

  const service: PluginRuntimeLifecycleService = Object.freeze({
    async start(input: StartPluginRuntimeAttemptInput) {
      await terminateCurrent('retry');
      if (disposed) return undefined;
      const rememberedBreakerKey = trustedTargets.get(input.targetKey);
      if (rememberedBreakerKey && breaker.isCoolingDown(rememberedBreakerKey)) {
        input.onFailure('runtime_crash_loop');
        return undefined;
      }

      const key = ++sequence;
      let phase: 'active' | 'terminating' | 'disposed' = 'active';
      let breakerIdentity: string | undefined;
      let loadTimer: unknown;
      let cancelHealthy: (() => void) | undefined;
      const cancellables: Array<() => void> = [];
      const subscriptions: Array<() => void> = [];
      let disposeSession: (() => void) | undefined;
      let unbindIframe: (() => void) | undefined;
      let releaseLease: (() => void | Promise<void>) | undefined;

      const isCurrent = () => phase === 'active' && current === attempt;
      const clearLoadTimer = () => {
        if (loadTimer !== undefined) scheduler.clearTimeout(loadTimer);
        loadTimer = undefined;
      };
      const terminate = (reason: PluginRuntimeTerminalReason): Promise<void> => {
        if (phase === 'disposed') return terminalQueue;
        if (phase === 'terminating') return terminalQueue;
        phase = 'terminating';
        if (current === attempt) current = undefined;
        terminalQueue = terminalQueue.then(async () => {
          clearLoadTimer();
          cancelHealthy?.();
          cancelHealthy = undefined;
          for (const cancel of cancellables.splice(0)) cancel();
          for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
          disposeSession?.();
          disposeSession = undefined;
          unbindIframe?.();
          unbindIframe = undefined;
          const release = releaseLease;
          releaseLease = undefined;
          if (release) await release();
          breakerIdentity = undefined;
          phase = 'disposed';
          void reason;
        });
        return terminalQueue;
      };

      const attempt: PluginRuntimeAttempt = Object.freeze({
        key,
        isCurrent,
        bindCancellable(cancel: () => void) {
          if (isCurrent()) cancellables.push(cancel);
          else cancel();
        },
        bindSubscription(unsubscribe: () => void) {
          if (isCurrent()) subscriptions.push(unsubscribe);
          else unsubscribe();
        },
        bindSession(disposeSessionBinding: () => void) {
          if (isCurrent()) disposeSession = disposeSessionBinding;
          else disposeSessionBinding();
        },
        bindIframe(unbind: () => void) {
          if (isCurrent()) unbindIframe = unbind;
          else unbind();
        },
        bindNavigationLease(release: () => void | Promise<void>) {
          if (isCurrent()) releaseLease = release;
          else void release();
        },
        bindTrustedIdentity(entryId: string, generation: string) {
          if (!isCurrent()) return false;
          breakerIdentity = breaker.ensureRecord(entryId, generation);
          trustedTargets.set(input.targetKey, breakerIdentity);
          return !breaker.isCoolingDown(breakerIdentity);
        },
        startLoadDeadline() {
          if (!isCurrent() || loadTimer !== undefined) return;
          loadTimer = scheduler.setTimeout(() => {
            if (isCurrent()) void attempt.fail('runtime_load_timeout');
          }, PLUGIN_RUNTIME_LOAD_DEADLINE_MS);
        },
        completeLoad: clearLoadTimer,
        markReady() {
          if (isCurrent() && breakerIdentity) cancelHealthy = breaker.beginHealthyWindow(breakerIdentity);
        },
        async fail(code: PluginRuntimeFailureCode) {
          if (!isCurrent()) return;
          const opened = breakerIdentity ? breaker.recordFailure(breakerIdentity, code) : false;
          input.onFailure(opened ? 'runtime_crash_loop' : code);
          await terminate('failure');
        },
        terminate,
      });
      current = attempt;
      return attempt;
    },
    terminateCurrent,
    async dispose() {
      disposed = true;
      await terminateCurrent('app_teardown');
      trustedTargets.clear();
      breaker.reset();
    },
  });
  return service;
};
