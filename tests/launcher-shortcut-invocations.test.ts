import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import {
  type NativeActionInvocationPort,
  startNativeActionInvocations,
} from '../src/app/launcher/actions/native-invocations';
import { PageActivationAttempt } from '../src/app/navigation/activations';
import {
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
} from '../src/app/plugins/runtime';

const register = (
  registry: LauncherActionRegistry,
  executor: (invocation: { invocationId: number; source: 'normal' | 'shortcut' }) => void | Promise<void>,
) =>
  registry.register({
    descriptor: {
      action_id: 'com.test.plugin.open',
      owner_id: 'com.test.plugin',
      title: { 'en-US': 'Example' },
      default_keywords: {},
      enabled: true,
    },
    executor,
  });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
afterEach(() => {
  rs.useRealTimers();
});

describe('Host invocation admission', () => {
  test('creates immutable per-call provenance and checks the current registry after queueing', async () => {
    const registry = new LauncherActionRegistry();
    const seen: unknown[] = [];
    let release!: () => void;
    register(registry, async (invocation) => {
      expect(Object.isFrozen(invocation)).toBe(true);
      seen.push(invocation);
      if (seen.length === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    });
    const dispatcher = new LauncherActionDispatcher(registry);
    const success = rs.fn();
    dispatcher.subscribeSuccessfulInvocations(success);
    const first = dispatcher.dispatchShortcut('com.test.plugin.open');
    const second = dispatcher.dispatch('com.test.plugin.open');
    release();
    await Promise.all([first, second]);
    expect(seen).toEqual([
      { invocationId: 1, source: 'shortcut' },
      { invocationId: 2, source: 'normal' },
    ]);
    expect(success).toHaveBeenCalledTimes(2);
    registry.replaceProviderBatch('com.test.plugin', []);
    expect(await dispatcher.dispatchShortcut('com.test.plugin.open')).toMatchObject({
      ok: false,
      error: { code: 'action_not_found' },
    });
  });

  test('rechecks the binding generation at execution after a claimed invocation waited behind another Action', async () => {
    const registry = new LauncherActionRegistry();
    let release!: () => void;
    let count = 0;
    register(registry, async () => {
      count++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const dispatcher = new LauncherActionDispatcher(registry);
    const running = dispatcher.dispatch('com.test.plugin.open');
    let current = true;
    const stale = dispatcher.dispatchShortcut('com.test.plugin.open', () => current);
    const rejected = expect(stale).rejects.toMatchObject({ code: 'unavailable' });
    current = false;
    release();
    await running;
    await rejected;
    expect(count).toBe(1);
  });

  test('keeps overload and waiting deadlines separate from typed execution failures', async () => {
    rs.useFakeTimers();
    const registry = new LauncherActionRegistry();
    let release!: () => void;
    register(
      registry,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const dispatcher = new LauncherActionDispatcher(registry);
    const running = dispatcher.dispatch('com.test.plugin.open');
    const waiting = Array.from({ length: 32 }, () =>
      dispatcher.dispatch('com.test.plugin.open').catch((error) => error),
    );
    await expect(dispatcher.dispatch('com.test.plugin.open')).rejects.toMatchObject({ code: 'busy' });
    await rs.advanceTimersByTimeAsync(10_000);
    for (const result of await Promise.all(waiting)) expect(result).toMatchObject({ code: 'expired' });
    release();
    await expect(running).resolves.toMatchObject({ ok: true });
  });

  test('does not execute a late ready batch after Host teardown and merges early live events in order', async () => {
    const registry = new LauncherActionRegistry();
    const executor = rs.fn();
    register(registry, executor);
    const actions = { registry, dispatcher: new LauncherActionDispatcher(registry) };
    const event = (id: number) => ({ invocation_id: id, binding_revision: 1, action_id: 'com.test.plugin.open' });
    let receive!: (payload: unknown) => void;
    let finish!: (batch: readonly ReturnType<typeof event>[]) => void;
    const claims: number[] = [];
    const port: NativeActionInvocationPort = {
      listen: async (listener) => {
        receive = listener;
        return () => undefined;
      },
      ready: async (ready) =>
        ready
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : [],
      claim: async (id) => {
        claims.push(id);
        return true;
      },
    };
    const signal = new AbortController();
    const starting = startNativeActionInvocations(actions, rs.fn(), port, signal.signal);
    await flush();
    receive(event(2));
    signal.abort();
    finish([event(1)]);
    await starting;
    await flush();
    expect(executor).not.toHaveBeenCalled();
    expect(claims).toEqual([]);
    const next = startNativeActionInvocations(actions, rs.fn(), port);
    await flush();
    receive(event(4));
    finish([event(3)]);
    const dispose = await next;
    await flush();
    expect(claims).toEqual([3, 4]);
    expect(executor).toHaveBeenCalledTimes(2);
    dispose();
  });

  test('claims duplicate native handshake/events once and rejects stale bindings before executing', async () => {
    const registry = new LauncherActionRegistry();
    const executor = rs.fn();
    register(registry, executor);
    const actions = { registry, dispatcher: new LauncherActionDispatcher(registry) };
    const event = { invocation_id: 1, binding_revision: 4, action_id: 'com.test.plugin.open' };
    let receive!: (payload: unknown) => void;
    const claimed = new Set<number>();
    const port: NativeActionInvocationPort = {
      listen: async (listener) => {
        receive = listener;
        return () => undefined;
      },
      ready: async (ready) => {
        if (ready) receive(event);
        return ready ? [event] : [];
      },
      claim: async (id) => {
        if (claimed.has(id) || id === 2) return false;
        claimed.add(id);
        return true;
      },
    };
    const failed = rs.fn();
    const dispose = await startNativeActionInvocations(actions, failed, port);
    await flush();
    receive(event);
    receive({ ...event, invocation_id: 2 });
    await flush();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith({ invocationId: 1, source: 'shortcut' });
    dispose();
    receive({ ...event, invocation_id: 3 });
    await flush();
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

describe('Page attempt activation channel', () => {
  test('atomically caches at most 32 initial activations without limiting the later stream', () => {
    const attempt = new PageActivationAttempt();
    for (let id = 1; id <= 32; id++) attempt.append('open', { invocationId: id, source: 'shortcut' });
    expect(() => attempt.append('open', { invocationId: 33, source: 'shortcut' })).toThrow(
      expect.objectContaining({ code: 'busy' }),
    );
    const session = attempt.bind();
    const emit = rs.fn(() => true);
    const initial = session.subscribe(emit);
    expect(initial).toHaveLength(32);
    expect(Object.isFrozen(initial)).toBe(true);
    for (let id = 33; id < 100; id++)
      attempt.append('other', { invocationId: id, source: id % 2 ? 'normal' : 'shortcut' });
    expect(session.subscribe(rs.fn())).toBe(initial);
    expect(emit).toHaveBeenCalledTimes(67);
    expect(session.current()).toEqual({ actionId: 'other', invocationId: 99, source: 'normal' });
    attempt.append('open', { invocationId: 99, source: 'shortcut' });
    expect(emit).toHaveBeenCalledTimes(67);
    session.dispose();
    expect(session.current()).toBe(null);
    expect(() => attempt.bind()).toThrow();
    expect(() => attempt.append('open', { invocationId: 100, source: 'shortcut' })).toThrow();
  });

  test('expires an uninitialized attempt and contains failed stream delivery', async () => {
    rs.useFakeTimers();
    const failed = rs.fn();
    const attempt = new PageActivationAttempt(failed);
    attempt.append('open', { invocationId: 1, source: 'normal' });
    await rs.advanceTimersByTimeAsync(10_000);
    expect(failed).toHaveBeenCalledWith('expired');
    expect(attempt.terminal).toBe(true);
    const next = new PageActivationAttempt(failed);
    next.bind().subscribe(() => false);
    expect(() => next.append('open', { invocationId: 2, source: 'shortcut' })).toThrow();
    expect(failed).toHaveBeenCalledWith('unavailable');
  });

  test('composes exact Session-owned queries, events, and normal plugin navigation', async () => {
    const attempt = new PageActivationAttempt();
    const registry = new LauncherActionRegistry();
    register(registry, (invocation) => attempt.append('open', invocation));
    const actions = { registry, dispatcher: new LauncherActionDispatcher(registry) };
    await actions.dispatcher.dispatchShortcut('com.test.plugin.open');
    const factory = createPluginHostApiDispatcherFactory({
      actions,
      context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'dark' }),
      navigation: { isActivePage: () => true, closePageIfMatches: () => true },
      bindActivations: (target) =>
        target.owner_id === 'com.test.plugin' && target.page_id === 'home' ? attempt.bind() : undefined,
    });
    let current = true;
    const binding = factory.create({
      identity: { entry_id: 'entry_one', plugin_id: 'com.test.plugin', page_id: 'home', version: '1.0.0' },
      isCurrent: () => current,
    });
    const events = rs.fn(() => true);
    binding.attachEmitter(events);
    const signal = new AbortController().signal;
    expect(await binding.execute({ method: 'actions.get_activation', params: {} }, signal)).toEqual({
      method: 'actions.get_activation',
      result: { activation: { actionId: 'open', invocationId: 1, source: 'shortcut' } },
    });
    const initial = await binding.execute({ method: 'actions.subscribe_activations', params: {} }, signal);
    expect(await binding.execute({ method: 'actions.open', params: { actionId: 'open' } }, signal)).toEqual({
      method: 'actions.open',
      result: { opened: true },
    });
    expect(events).toHaveBeenCalledWith({
      event: 'actions.activated',
      payload: { actionId: 'open', invocationId: 2, source: 'normal' },
    });
    expect(await binding.execute({ method: 'actions.subscribe_activations', params: {} }, signal)).toEqual(initial);
    expect(
      await binding.execute({ method: 'actions.get_activation', params: { source: 'shortcut' } } as never, signal),
    ).toMatchObject({ code: 'invalid_params' });
    const other = factory.create({
      identity: { entry_id: 'entry_two', plugin_id: 'com.other.plugin', page_id: 'home', version: '1.0.0' },
      isCurrent: () => true,
    });
    expect(await other.execute({ method: 'actions.get_activation', params: {} }, signal)).toMatchObject({
      code: 'unavailable',
    });
    current = false;
    expect(await binding.execute({ method: 'actions.get_activation', params: {} }, signal)).toMatchObject({
      code: 'unavailable',
    });
    binding.dispose();
    binding.dispose();
    expect(attempt.terminal).toBe(true);
    other.dispose();
  });
});
