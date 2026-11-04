import { browserPluginRuntimeScheduler, type PluginRuntimeScheduler } from './scheduler';

export const PLUGIN_RUNTIME_LOAD_DEADLINE_MS = 10_000;
export const PLUGIN_RUNTIME_RESOLUTION_DEADLINE_MS = 10_000;
export const PLUGIN_RUNTIME_START_DEADLINE_MS = 10_000;
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
  readonly readyInstances: Map<symbol, number>;
  lastFailureAt?: number;
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
    record.lastFailureAt = now;
    record.failures = record.failures.filter((failure) => now - failure <= PLUGIN_RUNTIME_FAILURE_WINDOW_MS);
    record.failures.push(now);
    if (record.failures.length >= 3) {
      record.cooldownUntil = now + PLUGIN_RUNTIME_BREAKER_COOLDOWN_MS;
    }
    this.#scheduleHealthyReset(key, record);
    return this.isCoolingDown(key);
  }

  ensureRecord(entryId: string, generation: string): string {
    const key = this.observeGeneration(entryId, generation);
    if (!this.#records.has(key)) {
      this.#records.set(key, { entryId, generation, failures: [], readyInstances: new Map() });
    }
    return key;
  }

  beginHealthyWindow(key: string): () => void {
    const record = this.#records.get(key);
    if (!record) return () => undefined;
    const instance = Symbol('ready-runtime');
    record.readyInstances.set(instance, this.#scheduler.now());
    this.#scheduleHealthyReset(key, record);
    return () => {
      if (this.#records.get(key) !== record || !record.readyInstances.delete(instance)) return;
      this.#scheduleHealthyReset(key, record);
    };
  }

  #scheduleHealthyReset(key: string, record: BreakerRecord): void {
    if (record.healthyTimer !== undefined) this.#scheduler.clearTimeout(record.healthyTimer);
    record.healthyTimer = undefined;
    if (record.readyInstances.size === 0 || record.failures.length === 0) return;
    let oldestReadyAt = Number.POSITIVE_INFINITY;
    for (const readyAt of record.readyInstances.values()) oldestReadyAt = Math.min(oldestReadyAt, readyAt);
    const deadline = Math.max(oldestReadyAt, record.lastFailureAt ?? oldestReadyAt) + PLUGIN_RUNTIME_HEALTHY_RESET_MS;
    const timer = this.#scheduler.setTimeout(
      () => {
        if (this.#records.get(key) !== record || record.healthyTimer !== timer) return;
        record.healthyTimer = undefined;
        record.failures = [];
        record.lastFailureAt = undefined;
        record.cooldownUntil = undefined;
        // Keep current ready leases, so the next failure can start its own healthy window.
      },
      Math.max(0, deadline - this.#scheduler.now()),
    );
    record.healthyTimer = timer;
  }

  reset(): void {
    for (const [key, record] of this.#records) this.#clearRecord(key, record);
  }

  #clearRecord(key: string, record: BreakerRecord): void {
    if (record.healthyTimer !== undefined) this.#scheduler.clearTimeout(record.healthyTimer);
    this.#records.delete(key);
  }
}

/** Host-private presentation ownership; never part of plugin Context or SDK payloads. */
export interface PluginRuntimeOwner {
  readonly surfaceId: string;
  readonly revision: number;
}

type RuntimeRelease = () => void | Promise<void>;
type RuntimeTerminalRelease = (reason: PluginRuntimeTerminalReason) => void | Promise<void>;

export interface PluginRuntimeAttempt {
  readonly key: number;
  readonly isCurrent: () => boolean;
  readonly currentOwner: () => PluginRuntimeOwner;
  readonly isOwner: (owner: PluginRuntimeOwner) => boolean;
  readonly bindCancellable: (cancel: () => void) => void;
  readonly bindSubscription: (unsubscribe: () => void) => void;
  /** Releases only DOM observers and presentation intent, never the native runtime. */
  readonly bindPresentation: (release: RuntimeRelease) => void;
  readonly releasePresentation: () => Promise<void>;
  /** Terminal cleanup for the native instance, replaced atomically when ownership transfers. */
  readonly bindRuntime: (release: RuntimeTerminalRelease) => void;
  readonly bindTrustedIdentity: (entryId: string, generation: string) => boolean;
  readonly startResolutionDeadline: () => void;
  readonly completeResolution: () => void;
  readonly startLoadDeadline: () => void;
  readonly completeLoad: () => void;
  readonly markReady: () => void;
  readonly fail: (code: PluginRuntimeFailureCode) => Promise<void>;
  readonly terminate: (reason: PluginRuntimeTerminalReason) => Promise<void>;
}

export interface PluginRuntimeTrustedIdentity {
  readonly entryId: string;
  readonly generation: string;
}

export interface StartPluginRuntimeAttemptInput {
  readonly targetKey: string;
  readonly surfaceId?: string;
  readonly trustedIdentity?: PluginRuntimeTrustedIdentity;
  readonly onFailure: (code: PluginRuntimeFailureCode) => void;
}

export interface PluginRuntimeLifecycleService {
  readonly start: (input: StartPluginRuntimeAttemptInput) => Promise<PluginRuntimeAttempt | undefined>;
  readonly getCurrent: (surfaceId?: string) => PluginRuntimeAttempt | undefined;
  readonly transfer: (
    attemptKey: number,
    expectedOwner: PluginRuntimeOwner,
    targetSurfaceId: string,
    releaseRuntime: RuntimeTerminalRelease,
  ) => Promise<PluginRuntimeOwner | undefined>;
  readonly failCurrent?: (code: PluginRuntimeFailureCode) => Promise<void>;
  readonly terminateCurrent: (reason: PluginRuntimeTerminalReason) => Promise<void>;
  readonly terminateAll: (reason: PluginRuntimeTerminalReason) => Promise<void>;
  readonly terminateMatching: (
    identity: { readonly entryId: string; readonly generation?: string },
    reason: PluginRuntimeTerminalReason,
  ) => Promise<void>;
  readonly dispose: () => Promise<void>;
}

interface RuntimeRecord {
  readonly attempt: PluginRuntimeAttempt;
  owner: PluginRuntimeOwner;
  releaseRuntime?: RuntimeTerminalRelease;
  trustedIdentity?: PluginRuntimeTrustedIdentity;
}

export const createPluginRuntimeLifecycleService = (
  options: { readonly scheduler?: PluginRuntimeScheduler; readonly breaker?: PluginRuntimeCircuitBreaker } = {},
): PluginRuntimeLifecycleService => {
  const scheduler = options.scheduler ?? browserPluginRuntimeScheduler;
  const breaker = options.breaker ?? new PluginRuntimeCircuitBreaker(scheduler);
  const trustedTargets = new Map<string, string>();
  const attempts = new Map<number, RuntimeRecord>();
  const surfaces = new Map<string, PluginRuntimeAttempt>();
  const terminalQueues = new Map<string, Promise<void>>();
  const startVersions = new Map<string, number>();
  const pendingStarts = new Map<
    string,
    { readonly version: number; readonly identity?: PluginRuntimeTrustedIdentity }
  >();
  let sequence = 0;
  let disposed = false;

  const waitForTerminal = (terminal: Promise<void>) =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (completed: boolean) => {
        if (settled) return;
        settled = true;
        scheduler.clearTimeout(timer);
        resolve(completed);
      };
      const timer = scheduler.setTimeout(() => finish(false), PLUGIN_RUNTIME_START_DEADLINE_MS);
      void terminal.then(
        () => finish(true),
        () => finish(true),
      );
    });

  const terminateSurface = (surfaceId: string, reason: PluginRuntimeTerminalReason) =>
    surfaces.get(surfaceId)?.terminate(reason) ?? terminalQueues.get(surfaceId) ?? Promise.resolve();
  const terminateAll = async (reason: PluginRuntimeTerminalReason) => {
    for (const [surfaceId, version] of startVersions) startVersions.set(surfaceId, version + 1);
    await Promise.all([...attempts.values()].map(({ attempt }) => attempt.terminate(reason)));
  };

  const service: PluginRuntimeLifecycleService = Object.freeze({
    async start(input: StartPluginRuntimeAttemptInput) {
      if (disposed) return undefined;
      const surfaceId = input.surfaceId ?? 'main';
      const startVersion = (startVersions.get(surfaceId) ?? 0) + 1;
      startVersions.set(surfaceId, startVersion);
      pendingStarts.set(surfaceId, { version: startVersion, identity: input.trustedIdentity });
      const previousTerminated = await waitForTerminal(terminateSurface(surfaceId, 'retry'));
      if (pendingStarts.get(surfaceId)?.version === startVersion) pendingStarts.delete(surfaceId);
      if (!previousTerminated) {
        if (!disposed && startVersions.get(surfaceId) === startVersion) input.onFailure('runtime_unavailable');
        return undefined;
      }
      if (disposed || startVersions.get(surfaceId) !== startVersion) return undefined;
      const rememberedBreakerKey = input.trustedIdentity
        ? breaker.ensureRecord(input.trustedIdentity.entryId, input.trustedIdentity.generation)
        : trustedTargets.get(input.targetKey);
      if (rememberedBreakerKey && breaker.isCoolingDown(rememberedBreakerKey)) {
        input.onFailure('runtime_crash_loop');
        return undefined;
      }

      const key = ++sequence;
      let phase: 'active' | 'terminating' | 'disposed' = 'active';
      let breakerIdentity: string | undefined;
      let resolutionTimer: unknown;
      let loadTimer: unknown;
      let cancelHealthy: (() => void) | undefined;
      const cancellables: Array<() => void> = [];
      const subscriptions: Array<() => void> = [];
      let presentation: RuntimeRelease | undefined;
      let presentationRelease: Promise<void> = Promise.resolve();
      let terminal: Promise<void> | undefined;

      const isCurrent = () => phase === 'active' && attempts.get(key) === record;
      const clearLoadTimer = () => {
        if (loadTimer !== undefined) scheduler.clearTimeout(loadTimer);
        loadTimer = undefined;
      };
      const clearResolutionTimer = () => {
        if (resolutionTimer !== undefined) scheduler.clearTimeout(resolutionTimer);
        resolutionTimer = undefined;
      };
      const releasePresentation = () => {
        const release = presentation;
        presentation = undefined;
        if (release) presentationRelease = presentationRelease.then(release);
        return presentationRelease;
      };
      const terminate = (reason: PluginRuntimeTerminalReason): Promise<void> => {
        if (terminal) return terminal;
        phase = 'terminating';
        const terminalSurface = record.owner.surfaceId;
        if (surfaces.get(terminalSurface) === attempt) surfaces.delete(terminalSurface);
        terminal = (terminalQueues.get(terminalSurface) ?? Promise.resolve()).then(async () => {
          clearResolutionTimer();
          clearLoadTimer();
          cancelHealthy?.();
          cancelHealthy = undefined;
          for (const cancel of cancellables.splice(0)) cancel();
          for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
          await releasePresentation().catch(() => undefined);
          const release = record.releaseRuntime;
          record.releaseRuntime = undefined;
          if (release) {
            try {
              await release(reason);
            } catch {
              // Native cleanup is compare-instance and best effort.
            }
          }
          breakerIdentity = undefined;
          phase = 'disposed';
          attempts.delete(key);
          void reason;
        });
        terminalQueues.set(terminalSurface, terminal);
        void terminal.finally(() => {
          if (terminalQueues.get(terminalSurface) === terminal) terminalQueues.delete(terminalSurface);
        });
        return terminal;
      };

      const attempt: PluginRuntimeAttempt = Object.freeze({
        key,
        isCurrent,
        currentOwner: () => record.owner,
        isOwner: (owner: PluginRuntimeOwner) => isCurrent() && record.owner === owner,
        bindCancellable(cancel: () => void) {
          if (isCurrent()) cancellables.push(cancel);
          else cancel();
        },
        bindSubscription(unsubscribe: () => void) {
          if (isCurrent()) subscriptions.push(unsubscribe);
          else unsubscribe();
        },
        bindPresentation(release: RuntimeRelease) {
          if (isCurrent()) presentation = release;
          else void release();
        },
        releasePresentation,
        bindRuntime(release: RuntimeTerminalRelease) {
          if (isCurrent()) record.releaseRuntime = release;
          else void release('app_teardown');
        },
        bindTrustedIdentity(entryId: string, generation: string) {
          if (!isCurrent()) return false;
          if (record.trustedIdentity) {
            return record.trustedIdentity.entryId === entryId && record.trustedIdentity.generation === generation;
          }
          breakerIdentity = breaker.ensureRecord(entryId, generation);
          trustedTargets.set(input.targetKey, breakerIdentity);
          if (breaker.isCoolingDown(breakerIdentity)) return false;
          record.trustedIdentity = Object.freeze({ entryId, generation });
          return true;
        },
        startResolutionDeadline() {
          if (!isCurrent() || resolutionTimer !== undefined) return;
          resolutionTimer = scheduler.setTimeout(() => {
            if (isCurrent()) void attempt.fail('runtime_unavailable');
          }, PLUGIN_RUNTIME_RESOLUTION_DEADLINE_MS);
        },
        completeResolution: clearResolutionTimer,
        startLoadDeadline() {
          if (!isCurrent() || loadTimer !== undefined) return;
          loadTimer = scheduler.setTimeout(() => {
            if (isCurrent()) void attempt.fail('runtime_load_timeout');
          }, PLUGIN_RUNTIME_LOAD_DEADLINE_MS);
        },
        completeLoad: clearLoadTimer,
        markReady() {
          if (isCurrent() && breakerIdentity && cancelHealthy === undefined) {
            cancelHealthy = breaker.beginHealthyWindow(breakerIdentity);
          }
        },
        async fail(code: PluginRuntimeFailureCode) {
          if (!isCurrent()) return;
          const opened = breakerIdentity ? breaker.recordFailure(breakerIdentity, code) : false;
          await terminate('failure');
          input.onFailure(opened ? 'runtime_crash_loop' : code);
        },
        terminate,
      });
      const record: RuntimeRecord = { attempt, owner: Object.freeze({ surfaceId, revision: 1 }) };
      attempts.set(key, record);
      surfaces.set(surfaceId, attempt);
      if (input.trustedIdentity) {
        attempt.bindTrustedIdentity(input.trustedIdentity.entryId, input.trustedIdentity.generation);
      }
      return attempt;
    },
    getCurrent: (surfaceId = 'main') => surfaces.get(surfaceId),
    async transfer(
      attemptKey: number,
      expectedOwner: PluginRuntimeOwner,
      targetSurfaceId: string,
      releaseRuntime: RuntimeTerminalRelease,
    ) {
      const record = attempts.get(attemptKey);
      if (
        disposed ||
        !record?.attempt.isOwner(expectedOwner) ||
        (surfaces.has(targetSurfaceId) && surfaces.get(targetSurfaceId) !== record.attempt) ||
        terminalQueues.has(targetSurfaceId) ||
        pendingStarts.has(targetSurfaceId) ||
        expectedOwner.revision >= Number.MAX_SAFE_INTEGER
      )
        return undefined;
      surfaces.delete(expectedOwner.surfaceId);
      record.owner = Object.freeze({ surfaceId: targetSurfaceId, revision: expectedOwner.revision + 1 });
      record.releaseRuntime = releaseRuntime;
      surfaces.set(targetSurfaceId, record.attempt);
      await record.attempt.releasePresentation();
      return record.attempt.isCurrent() ? record.owner : undefined;
    },
    failCurrent: async (code: PluginRuntimeFailureCode) => {
      await surfaces.get('main')?.fail(code);
    },
    terminateCurrent: (reason: PluginRuntimeTerminalReason) => terminateSurface('main', reason),
    terminateAll,
    async terminateMatching(
      identity: { readonly entryId: string; readonly generation?: string },
      reason: PluginRuntimeTerminalReason,
    ) {
      const matches = (candidate?: PluginRuntimeTrustedIdentity) =>
        candidate?.entryId === identity.entryId &&
        (identity.generation === undefined || candidate.generation === identity.generation);
      for (const [surfaceId, pending] of pendingStarts) {
        if (matches(pending.identity)) startVersions.set(surfaceId, (startVersions.get(surfaceId) ?? 0) + 1);
      }
      const matching = [...attempts.values()].filter(({ trustedIdentity }) => matches(trustedIdentity));
      await Promise.all(matching.map(({ attempt }) => attempt.terminate(reason)));
    },
    async dispose() {
      disposed = true;
      await terminateAll('app_teardown');
      trustedTargets.clear();
      breaker.reset();
    },
  });
  return service;
};
