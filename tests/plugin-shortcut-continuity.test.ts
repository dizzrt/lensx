import { type HostApiEventName, type HostApiRequest, validateHostApiResult } from '@lensx/plugin-contract';
import { expect, rs, test } from '@rstest/core';
import { createPluginSdk, type PluginSdkTransport } from '../packages/plugin-sdk/src';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import { PageActivationAttempt } from '../src/app/navigation/activations';
import {
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
} from '../src/app/plugins/runtime';

// Semantic transport only: this exercises production Host/SDK composition without a WebView.
const compose = (pluginId: string, attempt: PageActivationAttempt) => {
  const registry = new LauncherActionRegistry();
  const close = rs.fn(() => true);
  const binding = createPluginHostApiDispatcherFactory({
    actions: { registry, dispatcher: new LauncherActionDispatcher(registry) },
    context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' }),
    navigation: { isActivePage: () => true, closePageIfMatches: close },
    bindActivations: () => attempt.bind(),
  }).create({
    identity: { entry_id: 'entry_0123456789abcdef', plugin_id: pluginId, version: '0.1.0', page_id: 'main' },
    isCurrent: () => !attempt.terminal,
  });
  const listeners = new Map<HostApiEventName, Set<(payload: unknown) => void>>();
  binding.attachEmitter((event) => {
    for (const listener of listeners.get(event.event) ?? []) listener(event.payload);
    return true;
  });
  const requests: string[] = [];
  const execute = async (request: HostApiRequest) => {
    const value = await binding.execute(request, new AbortController().signal);
    const result = validateHostApiResult(value);
    if (result.status !== 'valid') throw new Error('Host rejected semantic request.');
    return result.value;
  };
  const transport: PluginSdkTransport = {
    connect: async () => {
      const result = await execute({ method: 'runtime.get_context', params: {} });
      if (result.method !== 'runtime.get_context') throw new Error('Context response mismatch.');
      return result.result;
    },
    request: async <Result>({
      method,
      params,
    }: {
      method: HostApiRequest['method'];
      params: HostApiRequest['params'];
    }) => {
      requests.push(method);
      return (await execute({ method, params } as HostApiRequest)) as Result;
    },
    subscribe: (event, listener) => {
      const subscriptions = listeners.get(event) ?? new Set();
      subscriptions.add(listener);
      listeners.set(event, subscriptions);
      return () => {
        subscriptions.delete(listener);
      };
    },
    onDisconnect: () => () => undefined,
    dispose: () => {
      binding.dispose();
      listeners.clear();
    },
  };
  return { sdk: createPluginSdk({ transport }), binding, requests, close };
};

test.each([
  'dev.lensx.translation',
  'dev.lensx.config-lens',
])('current Host and callback-free SDK retain %s activation continuity after a full initial batch', async (pluginId) => {
  const attempt = new PageActivationAttempt();
  for (let id = 1; id <= 32; id += 1) attempt.append('open', { invocationId: id, source: 'shortcut' });
  const { sdk, requests, close } = compose(pluginId, attempt);
  await sdk.initialize();
  expect(sdk.activation).toEqual({ actionId: 'open', invocationId: 32, source: 'shortcut' });
  const initial = await sdk.request({ method: 'actions.subscribe_activations', params: {} });
  for (let id = 33; id <= 100; id += 1)
    attempt.append('open', { invocationId: id, source: id === 100 ? 'normal' : 'shortcut' });
  expect(sdk.state).toBe('ready');
  expect(attempt.terminal).toBe(false);
  expect(sdk.activation).toEqual({ actionId: 'open', invocationId: 100, source: 'normal' });
  expect(await sdk.request({ method: 'actions.subscribe_activations', params: {} })).toEqual(initial);
  expect(await sdk.request({ method: 'actions.get_activation', params: {} })).toEqual({ activation: sdk.activation });
  expect(requests).not.toContain('http.request');
  expect(requests).not.toContain('actions.open');
  expect(close).not.toHaveBeenCalled();
  await sdk.dispose();
  expect(attempt.terminal).toBe(true);
  expect(sdk.activation).toBeUndefined();
  expect(() => attempt.append('open', { invocationId: 101, source: 'shortcut' })).toThrow();
});
