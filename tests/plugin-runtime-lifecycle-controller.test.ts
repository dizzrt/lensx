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
    first.bindPresentation(() => {
      order.push('presentation');
    });
    first.startLoadDeadline();

    const cleanup = first.terminate('navigation');
    await first.terminate('manual_close');
    await cleanup;
    expect(order).toEqual(['cancel', 'unsubscribe', 'presentation']);
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
    await lifecycle.terminateCurrent('failure');
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
    first.bindPresentation(() => release.promise);

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

  test('aggregates sibling failures without letting a healthy or detached instance bypass cooldown', async () => {
    const scheduler = new VirtualScheduler();
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    const trustedIdentity = { entryId: identity[0], generation: identity[1] };
    const failures = rs.fn();
    const healthy = await lifecycle.start({
      targetKey,
      trustedIdentity,
      surfaceId: 'detached-healthy',
      onFailure: failures,
    });
    if (!healthy) throw new Error('healthy instance should start');
    healthy.markReady();
    for (let index = 0; index < 3; index++) {
      const failing = await lifecycle.start({ targetKey: `page-${index}`, trustedIdentity, onFailure: failures });
      if (!failing) throw new Error('failing instance should start');
      await failing.fail('runtime_load_timeout');
      await failing.fail('runtime_load_timeout');
      healthy.markReady();
      if (index < 2) scheduler.advance(29_000);
    }
    expect(failures.mock.calls.map(([code]) => code)).toEqual([
      'runtime_load_timeout',
      'runtime_load_timeout',
      'runtime_crash_loop',
    ]);
    expect(healthy.isCurrent()).toBe(true);
    const transferred = await lifecycle.transfer(healthy.key, healthy.currentOwner(), 'detached-moved', rs.fn());
    expect(transferred).toBeDefined();
    expect(
      await lifecycle.start({ targetKey: 'previously-unopened-page', trustedIdentity, onFailure: failures }),
    ).toBeUndefined();
    scheduler.advance(29_999);
    expect(await lifecycle.start({ targetKey: 'another-page', trustedIdentity, onFailure: failures })).toBeUndefined();
    scheduler.advance(1);
    expect(lifecycle.getCurrent()).toBeUndefined();
    expect(healthy.isCurrent()).toBe(true);
    const retry = await lifecycle.start({ targetKey: 'another-page', trustedIdentity, onFailure: failures });
    expect(retry?.isCurrent()).toBe(true);
    await lifecycle.dispose();
    expect(scheduler.timerCount).toBe(0);
  });

  test('healthy reset requires one continuously ready instance and retains bookkeeping for later failures', () => {
    const scheduler = new VirtualScheduler();
    const breaker = new PluginRuntimeCircuitBreaker(scheduler);
    const key = breaker.ensureRecord(...identity);
    breaker.recordFailure(key, 'runtime_load_timeout');
    breaker.recordFailure(key, 'runtime_load_timeout');
    const stopOldest = breaker.beginHealthyWindow(key);
    scheduler.advance(29_000);
    const stopSibling = breaker.beginHealthyWindow(key);
    stopOldest();
    scheduler.advance(1_000);
    expect(breaker.recordFailure(key, 'runtime_handshake_timeout')).toBe(true);
    scheduler.advance(29_999);
    expect(breaker.isCoolingDown(key)).toBe(true);
    scheduler.advance(1);
    expect(breaker.isCoolingDown(key)).toBe(false);
    expect(breaker.recordFailure(key, 'runtime_load_timeout')).toBe(false);
    expect(breaker.recordFailure(key, 'runtime_load_timeout')).toBe(false);
    expect(breaker.recordFailure(key, 'runtime_load_timeout')).toBe(true);
    stopSibling();
    expect(scheduler.timerCount).toBe(0);
    breaker.reset();
  });

  test('ready gaps and obsolete generation callbacks cannot clear current failures', () => {
    const scheduler = new VirtualScheduler();
    const breaker = new PluginRuntimeCircuitBreaker(scheduler);
    const old = breaker.ensureRecord(...identity);
    breaker.recordFailure(old, 'runtime_load_timeout');
    const stopOld = breaker.beginHealthyWindow(old);
    const next = breaker.ensureRecord(identity[0], 'new-generation');
    expect(breaker.recordFailure(old, 'runtime_load_timeout')).toBe(false);
    breaker.recordFailure(next, 'runtime_load_timeout');
    const stopNext = breaker.beginHealthyWindow(next);
    stopOld();
    scheduler.advance(29_000);
    stopNext();
    scheduler.advance(1_000);
    const stopReturned = breaker.beginHealthyWindow(next);
    scheduler.advance(29_999);
    expect(breaker.recordFailure(next, 'runtime_load_timeout')).toBe(false);
    expect(breaker.recordFailure(next, 'runtime_load_timeout')).toBe(true);
    stopReturned();
    breaker.reset();
    expect(scheduler.timerCount).toBe(0);
  });

  test('trusted generation preflight admits a new generation while rejecting identity reuse', async () => {
    const scheduler = new VirtualScheduler();
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    for (let index = 0; index < 3; index++) {
      const instance = await lifecycle.start({
        targetKey,
        trustedIdentity: { entryId: identity[0], generation: '1' },
        onFailure: rs.fn(),
      });
      if (!instance) throw new Error('instance should start');
      expect(instance.bindTrustedIdentity(identity[0], '2')).toBe(false);
      await instance.fail('runtime_load_timeout');
    }
    const next = await lifecycle.start({
      targetKey,
      trustedIdentity: { entryId: identity[0], generation: '2' },
      onFailure: rs.fn(),
    });
    expect(next?.isCurrent()).toBe(true);
    await lifecycle.dispose();
  });

  test('matching invalidation fans out across surfaces while preserving unrelated entries and newer generations', async () => {
    const lifecycle = createPluginRuntimeLifecycleService();
    const identities = [
      { entryId: 'entry-a', generation: '1' },
      { entryId: 'entry-a', generation: '1' },
      { entryId: 'entry-a', generation: '2' },
      { entryId: 'entry-b', generation: '1' },
    ];
    const cleanups = identities.map(() => rs.fn());
    const instances = [];
    for (const [index, trustedIdentity] of identities.entries()) {
      const instance = await lifecycle.start({
        targetKey: `page-${index}`,
        surfaceId: `surface-${index}`,
        trustedIdentity,
        onFailure: rs.fn(),
      });
      if (!instance) throw new Error('instance should start');
      instance.bindRuntime(cleanups[index]);
      instances.push(instance);
    }
    await lifecycle.terminateMatching({ entryId: 'entry-a', generation: '1' }, 'invalidation');
    expect(instances.map((instance) => instance.isCurrent())).toEqual([false, false, true, true]);
    await lifecycle.terminateMatching({ entryId: 'entry-a' }, 'invalidation');
    expect(instances.map((instance) => instance.isCurrent())).toEqual([false, false, false, true]);
    expect(cleanups.map((cleanup) => cleanup.mock.calls.length)).toEqual([1, 1, 1, 0]);
    await lifecycle.dispose();
    expect(cleanups.map((cleanup) => cleanup.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  test('matching invalidation cancels an admitted start waiting on prior cleanup', async () => {
    const lifecycle = createPluginRuntimeLifecycleService();
    const trustedIdentity = { entryId: identity[0], generation: '1' };
    const first = await lifecycle.start({ targetKey, trustedIdentity, onFailure: rs.fn() });
    if (!first) throw new Error('instance should start');
    const cleanup = deferred<void>();
    first.bindRuntime(() => cleanup.promise);
    const pending = lifecycle.start({ targetKey, trustedIdentity, onFailure: rs.fn() });
    const invalidation = lifecycle.terminateMatching(trustedIdentity, 'invalidation');
    cleanup.resolve();
    await invalidation;
    expect(await pending).toBeUndefined();
    expect(lifecycle.getCurrent()).toBeUndefined();
    await lifecycle.dispose();
  });

  test('moves presentation ownership without cancelling the instance and closes each surface independently', async () => {
    const lifecycle = createPluginRuntimeLifecycleService();
    const first = await lifecycle.start({ targetKey, onFailure: rs.fn() });
    if (!first) throw new Error('first attempt should start');
    const cancel = rs.fn();
    const unsubscribe = rs.fn();
    const releasePresentation = rs.fn();
    const oldNativeCleanup = rs.fn();
    const currentNativeCleanup = rs.fn();
    first.bindCancellable(cancel);
    first.bindSubscription(unsubscribe);
    first.bindPresentation(releasePresentation);
    first.bindRuntime(oldNativeCleanup);
    const owner = first.currentOwner();
    const moved = await lifecycle.transfer(first.key, owner, 'detached-1', currentNativeCleanup);
    expect(moved).toEqual({ surfaceId: 'detached-1', revision: 2 });
    expect(first.isOwner(owner)).toBe(false);
    expect(first.isCurrent()).toBe(true);
    expect(lifecycle.getCurrent()).toBeUndefined();
    expect(lifecycle.getCurrent('detached-1')).toBe(first);
    expect(releasePresentation).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(oldNativeCleanup).not.toHaveBeenCalled();
    expect(currentNativeCleanup).not.toHaveBeenCalled();
    expect(await lifecycle.transfer(first.key, owner, 'detached-2', rs.fn())).toBeUndefined();

    const second = await lifecycle.start({ targetKey, onFailure: rs.fn() });
    if (!second) throw new Error('second attempt should start');
    expect(second.key).not.toBe(first.key);
    expect(await lifecycle.transfer(second.key, second.currentOwner(), 'detached-1', rs.fn())).toBeUndefined();
    await lifecycle.terminateCurrent('manual_close');
    expect(second.isCurrent()).toBe(false);
    expect(first.isCurrent()).toBe(true);
    await first.terminate('manual_close');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(currentNativeCleanup).toHaveBeenCalledTimes(1);
    expect(oldNativeCleanup).not.toHaveBeenCalled();
    await lifecycle.dispose();
  });

  test('releases a presentation lease without terminating its Runtime and tears down all instances exactly once', async () => {
    const scheduler = new VirtualScheduler();
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    const cleanups = [rs.fn(), rs.fn(), rs.fn()];
    const instances = [];
    for (const [index, surfaceId] of ['main', 'detached-1', 'detached-2'].entries()) {
      const attempt = await lifecycle.start({ targetKey, surfaceId, onFailure: rs.fn() });
      if (!attempt) throw new Error('attempt should start');
      attempt.bindRuntime(cleanups[index]);
      attempt.startLoadDeadline();
      instances.push(attempt);
    }
    const release = rs.fn();
    instances[0].bindPresentation(release);
    await instances[0].releasePresentation();
    await instances[0].releasePresentation();
    expect(release).toHaveBeenCalledTimes(1);
    expect(instances.every((instance) => instance.isCurrent())).toBe(true);
    for (const cleanup of cleanups) expect(cleanup).not.toHaveBeenCalled();
    await lifecycle.terminateAll('host_reload');
    await lifecycle.dispose();
    expect(instances.every((instance) => !instance.isCurrent())).toBe(true);
    for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledTimes(1);
    expect(scheduler.timerCount).toBe(0);
    expect(lifecycle.getCurrent('detached-1')).toBeUndefined();
  });

  test('serializes replacement within a surface without blocking a sibling and admits only the newest concurrent start', async () => {
    const lifecycle = createPluginRuntimeLifecycleService();
    const first = await lifecycle.start({ targetKey, onFailure: rs.fn() });
    if (!first) throw new Error('attempt should start');
    const cleanup = deferred<void>();
    first.bindRuntime(() => cleanup.promise);
    const pending = lifecycle.start({ targetKey, onFailure: rs.fn() });
    const newest = lifecycle.start({ targetKey, onFailure: rs.fn() });
    const sibling = await lifecycle.start({ targetKey, surfaceId: 'detached-1', onFailure: rs.fn() });
    expect(sibling?.isCurrent()).toBe(true);
    cleanup.resolve();
    expect(await pending).toBeUndefined();
    const current = await newest;
    expect(current?.isCurrent()).toBe(true);
    expect(lifecycle.getCurrent()).toBe(current);
    expect(sibling?.isCurrent()).toBe(true);
    await lifecycle.dispose();
  });

  test('dispose clears all process-local work', async () => {
    const scheduler = new VirtualScheduler();
    const lifecycle = createPluginRuntimeLifecycleService({ scheduler });
    const destroyPresentation = rs.fn();
    const attempt = await lifecycle.start({ targetKey, onFailure: () => undefined });
    if (!attempt) throw new Error('attempt should start');
    attempt.bindPresentation(destroyPresentation);
    attempt.startLoadDeadline();
    await lifecycle.dispose();
    expect(destroyPresentation).toHaveBeenCalledTimes(1);
    expect(scheduler.timerCount).toBe(0);
    expect(await lifecycle.start({ targetKey, onFailure: () => undefined })).toBeUndefined();
  });
});
