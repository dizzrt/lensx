import type { HostApiEvent, HostApiResult } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';

import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import {
  createMutablePluginHostApiContextSource,
  createPluginChildWebviewHostDispatcherController,
  createPluginHostApiDispatcherFactory,
  type PluginChildWebviewHostNativePort,
} from '../src/app/plugins/runtime';
import type {
  PluginScopedStorageProviderFactory,
  PluginScopedStorageRequest,
  PluginScopedStorageResult,
} from '../src/app/plugins/storage';

const sessionId = '0123456789abcdef0123456789abcdef';
const identity = Object.freeze({
  entry_id: 'entry_0123456789abcdef',
  plugin_id: 'com.acme.workspace',
  version: '1.2.3',
  page_id: 'home',
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const dispatchEvent = (sequence: number, request: unknown) => ({
  contract_version: '0.1.0',
  session_id: sessionId,
  dispatch_id: sequence.toString(16).padStart(32, '0'),
  identity,
  request,
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
  if (!registered.ok) throw new Error('Action fixture registration failed.');
  let active = true;
  const closePageIfMatches = rs.fn(() => {
    active = false;
    return true;
  });
  const storageDispose = rs.fn();
  const storageExecute = rs.fn(
    async (request: PluginScopedStorageRequest, signal: AbortSignal): Promise<PluginScopedStorageResult> => {
      if (request.method === 'storage.set') return { method: request.method, result: { stored: true } };
      if (request.method === 'storage.get') {
        return await new Promise<PluginScopedStorageResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        });
      }
      throw new Error('unexpected storage method');
    },
  );
  const storage: PluginScopedStorageProviderFactory = {
    create: () => ({
      available: () => true,
      execute: storageExecute,
      subscribeAvailability: () => () => undefined,
      dispose: storageDispose,
    }),
  };
  const factory = createPluginHostApiDispatcherFactory({
    actions: { registry, dispatcher: new LauncherActionDispatcher(registry) },
    context,
    navigation: {
      isActivePage: (target) => active && target.owner_id === identity.plugin_id && target.page_id === identity.page_id,
      closePageIfMatches,
    },
    storage,
  });
  const settlements: Array<{ dispatchId: string; output: unknown }> = [];
  const events: Array<{ sessionId: string; event: HostApiEvent }> = [];
  const settle = rs.fn(async (dispatchId: string, output: HostApiResult | { code: string; message: string }) => {
    settlements.push({ dispatchId, output });
    return true;
  });
  const fail = rs.fn(async () => true);
  const native: PluginChildWebviewHostNativePort = {
    settle,
    fail,
    emitEvent(nextSessionId, event) {
      events.push({ sessionId: nextSessionId, event });
      return true;
    },
  };
  const controller = createPluginChildWebviewHostDispatcherController(factory, native);
  return {
    actionExecutor,
    closePageIfMatches,
    context,
    controller,
    events,
    fail,
    settlements,
    storageDispose,
    storageExecute,
  };
};

describe('Child WebView Host dispatcher adapter', () => {
  test('preserves Context, Action, storage, event, and post-response close semantics', async () => {
    const fixture = createFixture();
    expect(fixture.controller.dispatch(dispatchEvent(1, { method: 'runtime.get_context', params: {} }))).toBe(true);
    await flush();
    expect(fixture.settlements[0]?.output).toEqual({
      method: 'runtime.get_context',
      result: {
        hostApiVersion: '0.2.0',
        locale: 'en-US',
        theme: 'light',
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

    expect(
      fixture.controller.dispatch(dispatchEvent(2, { method: 'actions.open', params: { actionId: 'open_project' } })),
    ).toBe(true);
    expect(
      fixture.controller.dispatch(dispatchEvent(3, { method: 'storage.set', params: { key: 'theme', value: 'dark' } })),
    ).toBe(true);
    await flush();
    expect(fixture.actionExecutor).toHaveBeenCalledTimes(1);
    expect(fixture.storageExecute).toHaveBeenCalledTimes(1);
    expect(fixture.settlements.map(({ output }) => output)).toContainEqual({
      method: 'storage.set',
      result: { stored: true },
    });

    fixture.context.update({ locale: 'zh-CN', theme: 'dark' });
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]).toEqual({
      sessionId,
      event: expect.objectContaining({ event: 'runtime.context_changed' }),
    });

    expect(fixture.controller.dispatch(dispatchEvent(4, { method: 'ui.close', params: {} }))).toBe(true);
    expect(fixture.closePageIfMatches).not.toHaveBeenCalled();
    await flush();
    expect(fixture.closePageIfMatches).toHaveBeenCalledWith({
      owner_id: identity.plugin_id,
      page_id: identity.page_id,
    });
  });

  test('binds cancellation and provider teardown to one opaque current Session', async () => {
    const fixture = createFixture();
    const pending = dispatchEvent(1, { method: 'storage.get', params: { key: 'slow' } });
    expect(fixture.controller.dispatch(pending)).toBe(true);
    await Promise.resolve();
    expect(
      fixture.controller.cancel({
        contract_version: '0.1.0',
        session_id: sessionId,
        dispatch_id: pending.dispatch_id,
      }),
    ).toBe(true);
    await flush();
    expect(fixture.settlements).toEqual([]);
    expect(fixture.fail).not.toHaveBeenCalled();

    expect(fixture.controller.disconnect({ contract_version: '0.1.0', session_id: sessionId })).toBe(true);
    expect(fixture.storageDispose).toHaveBeenCalledTimes(1);
    fixture.context.update({ locale: 'zh-CN', theme: 'dark' });
    expect(fixture.events).toEqual([]);
    expect(
      fixture.controller.cancel({
        contract_version: '0.1.0',
        session_id: sessionId,
        dispatch_id: pending.dispatch_id,
      }),
    ).toBe(false);
  });

  test('rejects forged native identity fields and cross-Session cancellation', async () => {
    const fixture = createFixture();
    expect(
      fixture.controller.dispatch({
        ...dispatchEvent(1, { method: 'runtime.get_context', params: {} }),
        source_label: 'forged-child',
      }),
    ).toBe(false);
    const pending = dispatchEvent(2, { method: 'storage.get', params: { key: 'slow' } });
    expect(fixture.controller.dispatch(pending)).toBe(true);
    expect(
      fixture.controller.cancel({
        contract_version: '0.1.0',
        session_id: 'ffffffffffffffffffffffffffffffff',
        dispatch_id: pending.dispatch_id,
      }),
    ).toBe(false);
    fixture.controller.dispose();
    fixture.controller.dispose();
    await flush();
    expect(fixture.storageDispose).toHaveBeenCalledTimes(1);
    expect(fixture.settlements).toEqual([]);
    fixture.context.update({ locale: 'zh-CN', theme: 'dark' });
    expect(fixture.events).toEqual([]);
    expect(fixture.controller.dispatch(dispatchEvent(3, { method: 'ui.close', params: {} }))).toBe(false);
  });
});
