import { describe, expect, rs, test } from '@rstest/core';
import {
  createPluginRuntimeLifecycleService,
  PLUGIN_RUNTIME_BREAKER_COOLDOWN_MS,
  PLUGIN_RUNTIME_FAILURE_WINDOW_MS,
  PLUGIN_RUNTIME_HEALTHY_RESET_MS,
  PLUGIN_RUNTIME_LOAD_DEADLINE_MS,
  PLUGIN_RUNTIME_START_DEADLINE_MS,
  PluginRuntimeCircuitBreaker,
  type PluginRuntimeFailureCode,
  type PluginRuntimeScheduler,
} from '../src/app/plugins/runtime';

class VirtualScheduler implements PluginRuntimeScheduler {
  #now = 0;
  #sequence = 0;
  readonly #timers = new Map<number, { readonly at: number; readonly callback: () => void }>();

  readonly now = () => this.#now;
  readonly setTimeout = (callback: () => void, delayMs: number) => {
    const handle = ++this.#sequence;
    this.#timers.set(handle, { at: this.#now + delayMs, callback });
    return handle;
  };
  readonly clearTimeout = (handle: unknown) => {
    if (typeof handle === 'number') this.#timers.delete(handle);
  };

  advance(milliseconds: number) {
    this.#now += milliseconds;
    let ready = [...this.#timers]
      .filter(([, timer]) => timer.at <= this.#now)
      .sort((left, right) => left[1].at - right[1].at);
    while (ready.length > 0) {
      for (const [handle, timer] of ready) {
        if (!this.#timers.delete(handle)) continue;
        timer.callback();
      }
      ready = [...this.#timers]
        .filter(([, timer]) => timer.at <= this.#now)
        .sort((left, right) => left[1].at - right[1].at);
    }
  }

  get timerCount() {
    return this.#timers.size;
  }
}

const targetKey = 'trusted-page-projection';
const identity = ['entry_0123456789abcdef', '0123456789abcdef0123456789abcdef'] as const;

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('Plugin Runtime lifecycle controller', () => {
  test('uses one idempotent ordered terminal operation and makes stale callbacks inert', async () => {
    const scheduler = new VirtualScheduler();
    const failures: PluginRuntimeFailureCode[] = [];
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    const first = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    if (!first) throw new Error('first attempt should start');
    expect(first.bindTrustedIdentity(...identity)).toBe(true);
    const order: string[] = [];
    first.bindCancellable(() => order.push('cancel'));
    first.bindSubscription(() => order.push('unsubscribe'));
    first.bindSession(() => order.push('session'));
    first.bindIframe(() => order.push('iframe'));
    first.bindNavigationLease(async () => {
      order.push('lease');
    });
    first.startLoadDeadline();

    const cleanup = first.terminate('navigation');
    await first.terminate('manual_close');
    await cleanup;
    expect(order).toEqual(['cancel', 'unsubscribe', 'session', 'iframe', 'lease']);
    expect(scheduler.timerCount).toBe(0);
    scheduler.advance(PLUGIN_RUNTIME_LOAD_DEADLINE_MS);
    expect(failures).toEqual([]);

    const second = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    if (!second) throw new Error('second attempt should start');
    expect(second.key).not.toBe(first.key);
    await first.fail('runtime_load_timeout');
    expect(second.isCurrent()).toBe(true);
    expect(failures).toEqual([]);
  });

  test('load deadline fails once, clears on load, and never revives a terminated attempt', async () => {
    const scheduler = new VirtualScheduler();
    const failures: PluginRuntimeFailureCode[] = [];
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    const timedOut = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    if (!timedOut) throw new Error('attempt should start');
    timedOut.bindTrustedIdentity(...identity);
    timedOut.startLoadDeadline();
    scheduler.advance(PLUGIN_RUNTIME_LOAD_DEADLINE_MS - 1);
    expect(failures).toEqual([]);
    scheduler.advance(1);
    await Promise.resolve();
    expect(failures).toEqual(['runtime_load_timeout']);

    const loaded = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    if (!loaded) throw new Error('loaded attempt should start');
    loaded.bindTrustedIdentity(...identity);
    loaded.startLoadDeadline();
    loaded.completeLoad();
    scheduler.advance(PLUGIN_RUNTIME_LOAD_DEADLINE_MS);
    expect(failures).toEqual(['runtime_load_timeout']);
  });

  test('bounds a stalled prior terminal queue without constructing a second attempt', async () => {
    const scheduler = new VirtualScheduler();
    const failures: PluginRuntimeFailureCode[] = [];
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    const release = deferred<void>();
    const first = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    if (!first) throw new Error('first attempt should start');
    first.bindNavigationLease(() => release.promise);

    const secondPromise = lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    scheduler.advance(PLUGIN_RUNTIME_START_DEADLINE_MS);
    expect(await secondPromise).toBeUndefined();
    expect(failures).toEqual(['runtime_unavailable']);

    release.resolve();
    await Promise.resolve();
    const third = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    expect(third).toBeDefined();
  });

  test('opens on the third qualifying failure, blocks construction during cooldown, and requires explicit retry', async () => {
    const scheduler = new VirtualScheduler();
    const failures: PluginRuntimeFailureCode[] = [];
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    for (let attemptNumber = 0; attemptNumber < 3; attemptNumber += 1) {
      const attempt = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
      if (!attempt) throw new Error('qualifying attempt should start');
      attempt.bindTrustedIdentity(...identity);
      await attempt.fail('runtime_handshake_timeout');
    }
    expect(failures).toEqual(['runtime_handshake_timeout', 'runtime_handshake_timeout', 'runtime_crash_loop']);
    const blocked = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    expect(blocked).toBeUndefined();
    expect(failures.at(-1)).toBe('runtime_crash_loop');
    scheduler.advance(PLUGIN_RUNTIME_BREAKER_COOLDOWN_MS);
    expect(failures).toHaveLength(4);
    const explicitRetry = await lifecycle.start({ targetKey, onFailure: (code) => failures.push(code) });
    expect(explicitRetry).toBeDefined();
  });

  test('rolling boundary, generation isolation, non-qualifying events, healthy reset, and process recreation are deterministic', () => {
    const scheduler = new VirtualScheduler();
    const breaker = new PluginRuntimeCircuitBreaker(scheduler);
    const first = breaker.ensureRecord(...identity);
    expect(breaker.recordFailure(first, 'runtime_unavailable')).toBe(false);
    expect(breaker.recordFailure(first, 'runtime_load_timeout')).toBe(false);
    scheduler.advance(PLUGIN_RUNTIME_FAILURE_WINDOW_MS + 1);
    expect(breaker.recordFailure(first, 'runtime_load_timeout')).toBe(false);
    expect(breaker.recordFailure(first, 'runtime_load_timeout')).toBe(false);
    expect(breaker.isCoolingDown(first)).toBe(false);

    const replacement = breaker.ensureRecord(identity[0], 'fedcba9876543210fedcba9876543210');
    expect(breaker.isCoolingDown(replacement)).toBe(false);
    breaker.recordFailure(replacement, 'runtime_load_timeout');
    const cancelHealthy = breaker.beginHealthyWindow(replacement);
    scheduler.advance(PLUGIN_RUNTIME_HEALTHY_RESET_MS);
    expect(breaker.recordFailure(replacement, 'runtime_load_timeout')).toBe(false);
    cancelHealthy();

    const recreated = new PluginRuntimeCircuitBreaker(scheduler);
    expect(recreated.isCoolingDown(recreated.ensureRecord(...identity))).toBe(false);
  });

  test('dispose clears all process-local work', async () => {
    const scheduler = new VirtualScheduler();
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    const disposeSession = rs.fn();
    const attempt = await lifecycle.start({ targetKey, onFailure: () => undefined });
    if (!attempt) throw new Error('attempt should start');
    attempt.bindSession(disposeSession);
    attempt.startLoadDeadline();
    await lifecycle.dispose();
    expect(disposeSession).toHaveBeenCalledTimes(1);
    expect(scheduler.timerCount).toBe(0);
    expect(await lifecycle.start({ targetKey, onFailure: () => undefined })).toBeUndefined();
  });
});
