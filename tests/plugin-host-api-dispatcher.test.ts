import { validateHostApiEvent, validateHostApiResult } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';

import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import {
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
  type PluginHostApiAuthorityIdentity,
  type PluginHostApiDispatcherBinding,
  type PluginRuntimeTransportHandlerResult,
} from '../src/app/plugins/runtime';
import { createPluginScopedStorageProviderFactory } from '../src/app/plugins/storage';

const identity: PluginHostApiAuthorityIdentity = Object.freeze({
  entry_id: 'entry_0123456789abcdef',
  plugin_id: 'com.acme.workspace',
  version: '1.2.3',
  page_id: 'home',
});

const requestInput = (
  binding: PluginHostApiDispatcherBinding,
  request: unknown,
  options?: { readonly signal?: AbortSignal; readonly injectedIdentity?: PluginHostApiAuthorityIdentity },
) =>
  binding.handler({
    identity: options?.injectedIdentity ?? identity,
    request: request as never,
    signal: options?.signal ?? new AbortController().signal,
  });

const createFixture = () => {
  const context = createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' });
  const registry = new LauncherActionRegistry();
  const actionExecutor = rs.fn(async () => undefined);
  const registered = registry.register({
    descriptor: {
      action_id: 'com.acme.workspace.open_project',
      owner_id: 'com.acme.workspace',
      title: { 'en-US': 'Open project' },
      default_keywords: {},
      enabled: true,
    },
    executor: actionExecutor,
  });
  if (!registered.ok) throw new Error('Dispatcher fixture Action registration failed.');
  let activeTarget = { owner_id: identity.plugin_id, page_id: identity.page_id };
  const closePageIfMatches = rs.fn((target: typeof activeTarget) => {
    if (target.owner_id !== activeTarget.owner_id || target.page_id !== activeTarget.page_id) return false;
    activeTarget = { owner_id: '', page_id: '' };
    return true;
  });
  const factory = createPluginHostApiDispatcherFactory({
    actions: { registry, dispatcher: new LauncherActionDispatcher(registry) },
    context,
    navigation: {
      isActivePage: (target) => target.owner_id === activeTarget.owner_id && target.page_id === activeTarget.page_id,
      closePageIfMatches,
    },
  });
  let current = true;
  const binding = factory.create({ identity, isCurrent: () => current });
  return {
    actionExecutor,
    binding,
    closePageIfMatches,
    context,
    registry,
    replaceActiveTarget: (target: typeof activeTarget) => {
      activeTarget = target;
    },
    setCurrent: (value: boolean) => {
      current = value;
    },
  };
};

describe('Host-private Plugin Host API dispatcher', () => {
  test('returns a frozen, sorted, identity-free Context with only implemented providers', async () => {
    const { binding } = createFixture();
    const output = await requestInput(binding, { method: 'runtime.get_context', params: {} });

    expect(output).toEqual({
      method: 'runtime.get_context',
      result: {
        hostApiVersion: '0.2.0',
        locale: 'en-US',
        theme: 'light',
        capabilities: ['actions.open', 'runtime.get_context', 'ui.close'],
      },
    });
    expect(validateHostApiResult(output).status).toBe('valid');
    expect(Object.isFrozen((output as { result: object }).result)).toBe(true);
    expect(JSON.stringify(output)).not.toMatch(/com\.acme|entry_|grant|revision|origin|path|attempt/u);
  });

  test('publishes one full Context replacement for each real locale/theme change in subscriber order', async () => {
    const { binding, context } = createFixture();
    const events: unknown[] = [];
    const order: string[] = [];
    const unsubscribeFirst = context.subscribe(() => order.push('source-first'));
    binding.attachEmitter((event) => {
      order.push('binding');
      events.push(event);
      return true;
    });
    const unsubscribeLast = context.subscribe(() => order.push('source-last'));

    context.update({ locale: 'en-US', theme: 'light' });
    context.update({ locale: 'zh-CN', theme: 'dark' });
    context.update({ locale: 'zh-CN', theme: 'dark' });

    expect(events).toHaveLength(1);
    expect(validateHostApiEvent(events[0]).status).toBe('valid');
    expect(events[0]).toEqual({
      event: 'runtime.context_changed',
      payload: {
        hostApiVersion: '0.2.0',
        locale: 'zh-CN',
        theme: 'dark',
        capabilities: ['actions.open', 'runtime.get_context', 'ui.close'],
      },
    });
    expect(order).toEqual(['binding', 'source-first', 'source-last']);
    unsubscribeFirst();
    unsubscribeLast();
  });

  test('fails closed for unknown, malformed, unimplemented, cancelled, stale, and disposed requests', async () => {
    const { binding, setCurrent } = createFixture();
    await expect(requestInput(binding, { method: 'host.private', params: {} })).resolves.toEqual({
      code: 'method_not_found',
      message: 'The Host API method was not found.',
    });
    await expect(requestInput(binding, { method: 'ui.close', params: { plugin_id: 'com.forged' } })).resolves.toEqual({
      code: 'invalid_params',
      message: 'The Host API parameters are invalid.',
    });
    for (const request of [
      { method: 'clipboard.read', params: {} },
      { method: 'clipboard.write', params: { text: 'text' } },
      { method: 'storage.delete', params: { key: 'x' } },
      { method: 'storage.get', params: { key: 'x' } },
      { method: 'storage.get_quota', params: {} },
      { method: 'storage.list', params: {} },
      { method: 'storage.set', params: { key: 'x', value: 'value' } },
    ]) {
      await expect(requestInput(binding, request)).resolves.toEqual(
        expect.objectContaining({ code: request.method.startsWith('clipboard.') ? 'method_not_found' : 'unavailable' }),
      );
    }

    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      requestInput(binding, { method: 'runtime.get_context', params: {} }, { signal: cancelled.signal }),
    ).resolves.toEqual(expect.objectContaining({ code: 'cancelled' }));
    setCurrent(false);
    await expect(requestInput(binding, { method: 'runtime.get_context', params: {} })).resolves.toEqual(
      expect.objectContaining({ code: 'unavailable' }),
    );
    binding.dispose();
    await expect(requestInput(binding, { method: 'runtime.get_context', params: {} })).resolves.toEqual(
      expect.objectContaining({ code: 'unavailable' }),
    );
  });

  test('rejects every plugin-controlled attempt to request Host permission authority', async () => {
    const { actionExecutor, binding, closePageIfMatches } = createFixture();
    for (const request of [
      { method: 'permissions.request', params: { permission_id: 'clipboard.read', user_activation: true } },
      { method: 'permission_denied', params: { reason: 'Open a prompt', publisher: 'official' } },
      { method: 'runtime.get_context', params: { requested_permission: 'clipboard.read' } },
    ]) {
      await expect(requestInput(binding, request)).resolves.toEqual({
        code: request.method === 'runtime.get_context' ? 'invalid_params' : 'method_not_found',
        message:
          request.method === 'runtime.get_context'
            ? 'The Host API parameters are invalid.'
            : 'The Host API method was not found.',
      });
    }
    expect(actionExecutor).not.toHaveBeenCalled();
    expect(closePageIfMatches).not.toHaveBeenCalled();
    binding.dispose();
  });

  test('derives ui.close only from the bound Session and rechecks the target in its post-response effect', async () => {
    const fixture = createFixture();
    const injectedIdentity = Object.freeze({ ...identity, plugin_id: 'com.forged', page_id: 'other' });
    const output = (await requestInput(
      fixture.binding,
      { method: 'ui.close', params: {} },
      { injectedIdentity },
    )) as Exclude<PluginRuntimeTransportHandlerResult, { readonly code: string }>;

    expect(output).toMatchObject({ response: { method: 'ui.close', result: { accepted: true } } });
    fixture.replaceActiveTarget({ owner_id: identity.plugin_id, page_id: 'replacement' });
    if ('effect' in output) output.effect();
    expect(fixture.closePageIfMatches).toHaveBeenCalledWith({
      owner_id: identity.plugin_id,
      page_id: identity.page_id,
    });
    expect(fixture.closePageIfMatches).toHaveReturnedWith(false);

    const stale = await requestInput(fixture.binding, { method: 'ui.close', params: {} });
    expect(stale).toEqual(expect.objectContaining({ code: 'not_found' }));
  });

  test('opens only the bound plugin local Action and maps current registry outcomes safely', async () => {
    const fixture = createFixture();
    const forgedIdentity = Object.freeze({ ...identity, plugin_id: 'com.other.plugin' });
    await expect(
      requestInput(
        fixture.binding,
        { method: 'actions.open', params: { actionId: 'open_project' } },
        { injectedIdentity: forgedIdentity },
      ),
    ).resolves.toEqual({ method: 'actions.open', result: { opened: true } });
    expect(fixture.actionExecutor).toHaveBeenCalledTimes(1);

    await expect(
      requestInput(fixture.binding, { method: 'actions.open', params: { actionId: 'lensx.core.open_settings' } }),
    ).resolves.toEqual(expect.objectContaining({ code: 'invalid_params' }));

    fixture.registry.replaceProviderBatch(identity.plugin_id, []);
    await expect(
      requestInput(fixture.binding, { method: 'actions.open', params: { actionId: 'open_project' } }),
    ).resolves.toEqual(expect.objectContaining({ code: 'not_found' }));
    expect(fixture.actionExecutor).toHaveBeenCalledTimes(1);
  });

  test('isolates Session bindings and drops Context events after replacement or disposal', () => {
    const fixture = createFixture();
    const second = createPluginHostApiDispatcherFactory({
      actions: { registry: fixture.registry, dispatcher: new LauncherActionDispatcher(fixture.registry) },
      context: fixture.context,
      navigation: { isActivePage: () => true, closePageIfMatches: () => true },
    }).create({ identity: Object.freeze({ ...identity, page_id: 'second' }), isCurrent: () => true });
    const firstEvents: unknown[] = [];
    const secondEvents: unknown[] = [];
    fixture.binding.attachEmitter((event) => {
      firstEvents.push(event);
      return true;
    });
    second.attachEmitter((event) => {
      secondEvents.push(event);
      return true;
    });
    fixture.setCurrent(false);
    fixture.context.update({ locale: 'zh-CN', theme: 'light' });
    expect(firstEvents).toEqual([]);
    expect(secondEvents).toHaveLength(1);
    second.dispose();
    fixture.context.update({ locale: 'zh-CN', theme: 'dark' });
    expect(secondEvents).toHaveLength(1);
  });

  test('routes storage through the trusted provider and publishes one degraded Context replacement', async () => {
    const fixture = createFixture();
    const invoke = rs.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = args?.request as {
        readonly identity: { readonly plugin_id: string };
        readonly operation: { readonly kind: string };
      };
      expect(request.identity.plugin_id).toBe(identity.plugin_id);
      expect(JSON.stringify(request)).not.toMatch(/namespace|path|plugin_key|com\.forged/u);
      return Promise.reject({
        contract_version: '0.1.0',
        code: 'unavailable',
        operation: request.operation.kind,
        message: 'Plugin storage is unavailable.',
      });
    });
    const factory = createPluginHostApiDispatcherFactory({
      actions: { registry: fixture.registry, dispatcher: new LauncherActionDispatcher(fixture.registry) },
      context: fixture.context,
      navigation: { isActivePage: () => true, closePageIfMatches: () => true },
      storage: createPluginScopedStorageProviderFactory(invoke),
    });
    const binding = factory.create({ identity, isCurrent: () => true });
    const events: unknown[] = [];
    binding.attachEmitter((event) => {
      events.push(event);
      return true;
    });
    await expect(requestInput(binding, { method: 'runtime.get_context', params: {} })).resolves.toMatchObject({
      result: {
        capabilities: [
          'actions.open',
          'runtime.get_context',
          'storage.delete',
          'storage.get',
          'storage.get_quota',
          'storage.list',
          'storage.set',
          'ui.close',
        ],
      },
    });
    await expect(requestInput(binding, { method: 'storage.get', params: { key: 'safe' } })).resolves.toEqual(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(events).toEqual([
      {
        event: 'runtime.context_changed',
        payload: {
          hostApiVersion: '0.2.0',
          locale: 'en-US',
          theme: 'light',
          capabilities: ['actions.open', 'runtime.get_context', 'ui.close'],
        },
      },
    ]);
    await expect(requestInput(binding, { method: 'storage.get', params: { key: 'safe' } })).resolves.toEqual(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(events).toHaveLength(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
