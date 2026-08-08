import { describe, expect, rs, test } from '@rstest/core';

import { createPluginSdk } from '../packages/plugin-sdk/src';
import { createPluginIframeTransport } from '../packages/plugin-sdk/src/iframe';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import { AppNavigationService, PageRegistry } from '../src/app/navigation';
import {
  attachPluginRuntimeTransport,
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
  createPluginRuntimeSessionService,
  type PluginRuntimeHostPortLease,
  type PluginRuntimeScheduler,
  type PluginRuntimeSession,
  type PluginRuntimeTransportAdapter,
  type PluginRuntimeTransportHandler,
  type PluginRuntimeTransportHandlerResult,
} from '../src/app/plugins/runtime';
import { createPluginScopedStorageProviderFactory } from '../src/app/plugins/storage';

class ChildWindow {
  readonly parent = Object.freeze({ kind: 'host-parent' });
  readonly listeners = new Set<(event: unknown) => void>();
  addEventListener(_type: 'message', listener: (event: unknown) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: unknown) => void) {
    this.listeners.delete(listener);
  }
  deliver(data: unknown, ports: readonly unknown[]) {
    for (const listener of [...this.listeners]) {
      listener({ data, origin: 'lensx-runtime-harness://localhost', ports, source: this.parent });
    }
  }
}

const identity = Object.freeze({
  entry_id: 'entry_0123456789abcdef',
  plugin_id: 'com.acme.workspace',
  version: '1.2.3',
  page_id: 'home',
  expected_origin: 'https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '7',
});

const installWindow = (window: ChildWindow): (() => void) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  };
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 500;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for the integration fixture');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

class ControlledScheduler implements PluginRuntimeScheduler {
  #sequence = 0;
  readonly callbacks = new Map<number, () => void>();
  readonly clearTimeout = (handle: unknown) => {
    this.callbacks.delete(handle as number);
  };
  readonly now = () => 0;
  readonly setTimeout = (callback: () => void, _delayMs: number): unknown => {
    this.#sequence += 1;
    this.callbacks.set(this.#sequence, callback);
    return this.#sequence;
  };
  runLatest() {
    const handle = Math.max(...this.callbacks.keys());
    this.callbacks.get(handle)?.();
  }
}

describe('real MessageChannel Plugin SDK transport integration', () => {
  test('connects real SDK and Host adapter for context, request, error, event, concurrency, cancel, and cleanup', async () => {
    const child = new ChildWindow();
    const restore = installWindow(child);
    const completions = new Map<string, (value: PluginRuntimeTransportHandlerResult) => void>();
    let cancelledSignal: AbortSignal | undefined;
    const handler: PluginRuntimeTransportHandler = ({ request, signal }) => {
      if (request.method === 'runtime.get_context') {
        return {
          method: request.method,
          result: {
            capabilities: ['storage.get', 'ui.close'],
            hostApiVersion: '0.2.0',
            locale: 'en-US',
            theme: 'light',
          },
        };
      }
      if (request.method === 'ui.close') {
        return { code: 'unavailable', message: 'The Host API is unavailable.' };
      }
      if (request.method === 'storage.get') {
        if (request.params.key === 'cancel') cancelledSignal = signal;
        return new Promise((resolve) => completions.set(request.params.key, resolve));
      }
      throw new Error('unexpected fixture request');
    };
    const sessionService = createPluginRuntimeSessionService();
    let adapter: PluginRuntimeTransportAdapter | undefined;
    let session: PluginRuntimeSession;
    const transport = createPluginIframeTransport();
    const client = createPluginSdk({ transport, timeoutMs: 1_000 });
    try {
      const initialization = client.initialize();
      await Promise.resolve();
      session = sessionService.start({
        identity,
        targetOrigin: identity.expected_origin,
        targetWindow: {
          postMessage: (message, _targetOrigin, ports) => child.deliver(message, ports),
        },
        consumeReadyLease: (lease: PluginRuntimeHostPortLease) => {
          adapter = attachPluginRuntimeTransport({
            handler,
            isCurrent: () => true,
            lease,
            onDisconnect: () => session.disconnect(),
          });
          return adapter.dispose;
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(session.snapshot().state).toBe('ready');
      await expect(initialization).resolves.toMatchObject({ locale: 'en-US', theme: 'light' });

      await expect(client.request({ method: 'ui.close', params: {} })).rejects.toEqual({
        code: 'unavailable',
        message: 'The Host API is unavailable.',
      });
      const first = client.request({ method: 'storage.get', params: { key: 'first' } });
      const second = client.request({ method: 'storage.get', params: { key: 'second' } });
      await waitFor(() => completions.has('first') && completions.has('second'));
      completions.get('second')?.({ method: 'storage.get', result: { found: false } });
      completions.get('first')?.({ method: 'storage.get', result: { found: true, value: 'first' } });
      await expect(second).resolves.toEqual({ found: false });
      await expect(first).resolves.toEqual({ found: true, value: 'first' });

      const contexts: unknown[] = [];
      client.subscribe('runtime.context_changed', (event) => contexts.push([client.context, event]));
      expect(
        adapter?.emit({
          event: 'runtime.context_changed',
          payload: { capabilities: ['storage.get'], hostApiVersion: '0.2.0', locale: 'zh-CN', theme: 'dark' },
        }),
      ).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(contexts).toEqual([[client.context, { event: 'runtime.context_changed', payload: client.context }]]);

      const controller = new AbortController();
      const cancelled = client.request(
        { method: 'storage.get', params: { key: 'cancel' } },
        { signal: controller.signal },
      );
      const cancelledAssertion = expect(cancelled).rejects.toMatchObject({ code: 'cancelled' });
      await waitFor(() => cancelledSignal !== undefined);
      controller.abort();
      await cancelledAssertion;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(cancelledSignal?.aborted).toBe(true);
      completions.get('cancel')?.({ method: 'storage.get', result: { found: false } });
      await client.dispose();
      session.dispose();
      expect(child.listeners.size).toBe(0);
    } finally {
      sessionService.dispose();
      restore();
    }
  });

  test('runs the public SDK through a production-style Dispatcher for Context, Action, close, and cleanup', async () => {
    const child = new ChildWindow();
    const restore = installWindow(child);
    const pageRegistry = new PageRegistry([]);
    pageRegistry.replaceProviderBatch(identity.plugin_id, {
      provider: { kind: 'plugin', owner_id: identity.plugin_id, display_name: { 'en-US': 'Workspace' } },
      pages: [
        {
          owner_id: identity.plugin_id,
          page_id: identity.page_id,
          available: true,
          route: '/home',
          title: { 'en-US': 'Home' },
        },
      ],
    });
    const navigation = new AppNavigationService(pageRegistry);
    const navigationHandler = rs.fn();
    navigation.registerHandler(navigationHandler);
    navigation.openPage(
      { owner_id: identity.plugin_id, page_id: identity.page_id },
      `${identity.plugin_id}.open_project`,
    );
    const actionRegistry = new LauncherActionRegistry();
    const actionExecutor = rs.fn(() => {
      navigation.openPage(
        { owner_id: identity.plugin_id, page_id: identity.page_id },
        `${identity.plugin_id}.open_project`,
      );
    });
    const registration = actionRegistry.register({
      descriptor: {
        action_id: `${identity.plugin_id}.open_project`,
        owner_id: identity.plugin_id,
        title: { 'en-US': 'Open project' },
        default_keywords: {},
        enabled: true,
      },
      executor: actionExecutor,
    });
    if (!registration.ok) throw new Error('Production-style Action fixture registration failed.');
    const context = createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' });
    const stored = new Map<string, unknown>();
    const storageInvoke = rs.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = args?.request as {
        readonly identity: { readonly plugin_id: string };
        readonly operation: { readonly kind: string; readonly key?: string; readonly value?: unknown };
      };
      expect(request.identity.plugin_id).toBe(identity.plugin_id);
      const { operation } = request;
      let result: unknown;
      if (operation.kind === 'set') {
        stored.set(operation.key ?? '', operation.value);
        result = { stored: true };
      } else if (operation.kind === 'get') {
        result = stored.has(operation.key ?? '')
          ? { found: true, value: stored.get(operation.key ?? '') }
          : { found: false };
      } else if (operation.kind === 'delete') {
        result = { deleted: stored.delete(operation.key ?? '') };
      } else if (operation.kind === 'list') {
        result = { keys: [...stored.keys()].sort() };
      } else {
        result = { usedBytes: 9, limitBytes: 1_048_576 };
      }
      return { contract_version: '0.1.0', operation: operation.kind, result };
    });
    const factory = createPluginHostApiDispatcherFactory({
      actions: { registry: actionRegistry, dispatcher: new LauncherActionDispatcher(actionRegistry) },
      context,
      navigation,
      storage: createPluginScopedStorageProviderFactory(storageInvoke),
    });
    const sessionService = createPluginRuntimeSessionService();
    let adapter: PluginRuntimeTransportAdapter | undefined;
    let session: PluginRuntimeSession;
    let binding: ReturnType<typeof factory.create> | undefined;
    const client = createPluginSdk({ transport: createPluginIframeTransport(), timeoutMs: 1_000 });

    try {
      const initialization = client.initialize();
      await Promise.resolve();
      session = sessionService.start({
        identity,
        targetOrigin: identity.expected_origin,
        targetWindow: { postMessage: (message, _targetOrigin, ports) => child.deliver(message, ports) },
        consumeReadyLease: (lease) => {
          binding = factory.create({ identity: lease.identity, isCurrent: () => session.snapshot().state === 'ready' });
          adapter = attachPluginRuntimeTransport({
            handler: binding.handler,
            isCurrent: () => session.snapshot().state === 'ready',
            lease,
            onDisconnect: () => session.disconnect(),
          });
          const detachEmitter = binding.attachEmitter(adapter.emit);
          return () => {
            detachEmitter();
            binding?.dispose();
            adapter?.dispose();
          };
        },
      });
      const initialized = await initialization;
      expect(initialized).toEqual({
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
      });

      await expect(
        client.request({ method: 'storage.set', params: { key: 'settings', value: { mode: 'dark' } } }),
      ).resolves.toEqual({ stored: true });
      await expect(client.request({ method: 'storage.get', params: { key: 'settings' } })).resolves.toEqual({
        found: true,
        value: { mode: 'dark' },
      });
      await expect(client.request({ method: 'storage.list', params: {} })).resolves.toEqual({ keys: ['settings'] });
      await expect(client.request({ method: 'storage.get_quota', params: {} })).resolves.toEqual({
        usedBytes: 9,
        limitBytes: 1_048_576,
      });
      await expect(client.request({ method: 'storage.delete', params: { key: 'settings' } })).resolves.toEqual({
        deleted: true,
      });
      expect(storageInvoke).toHaveBeenCalledTimes(5);

      const events: unknown[] = [];
      client.subscribe('runtime.context_changed', (event) => events.push([client.context, event]));
      context.update({ locale: 'zh-CN', theme: 'dark' });
      await waitFor(() => events.length === 1);
      expect(client.context).toMatchObject({ locale: 'zh-CN', theme: 'dark' });

      await expect(client.request({ method: 'actions.open', params: { actionId: 'open_project' } })).resolves.toEqual({
        opened: true,
      });
      expect(actionExecutor).toHaveBeenCalledTimes(1);
      await expect(client.request({ method: 'ui.close', params: {} })).resolves.toEqual({ accepted: true });
      expect(navigation.isActivePage({ owner_id: identity.plugin_id, page_id: identity.page_id })).toBe(false);
      expect(navigationHandler).toHaveBeenLastCalledWith(undefined);

      await client.dispose();
      session.dispose();
      context.update({ locale: 'en-US', theme: 'light' });
      expect(events).toHaveLength(1);
      expect(child.listeners.size).toBe(0);
    } finally {
      sessionService.dispose();
      navigation.destroy();
      restore();
    }
  });

  test('contains limits and Host faults across the real SDK while preserving recovery and safe error semantics', async () => {
    const child = new ChildWindow();
    const restore = installWindow(child);
    const scheduler = new ControlledScheduler();
    const completions = new Map<string, (value: PluginRuntimeTransportHandlerResult) => void>();
    const diagnostics: unknown[] = [];
    const handlerHits: string[] = [];
    const handler: PluginRuntimeTransportHandler = ({ request: value }) => {
      if (value.method === 'runtime.get_context') {
        return {
          method: value.method,
          result: {
            capabilities: ['storage.get', 'ui.close'],
            hostApiVersion: '0.2.0',
            locale: 'en-US',
            theme: 'light',
          },
        };
      }
      if (value.method === 'ui.close') {
        return { code: 'unavailable', message: 'The Host API is unavailable.' } as const;
      }
      if (value.method !== 'storage.get') throw new Error('unexpected fixture request');
      const key = value.params.key;
      handlerHits.push(key);
      if (key === 'invalid-output') return { private: '/private/provider payload stack' } as never;
      if (key === 'throw') throw new Error('/private/provider payload stack');
      if (key === 'healthy') return { method: value.method, result: { found: true, value: 'safe' } };
      return new Promise((resolve) => completions.set(key, resolve));
    };
    const sessionService = createPluginRuntimeSessionService();
    let adapter: PluginRuntimeTransportAdapter | undefined;
    let session: PluginRuntimeSession;
    const client = createPluginSdk({ transport: createPluginIframeTransport(), timeoutMs: 20_000 });
    try {
      const initialization = client.initialize();
      await Promise.resolve();
      session = sessionService.start({
        identity,
        targetOrigin: identity.expected_origin,
        targetWindow: { postMessage: (message, _targetOrigin, ports) => child.deliver(message, ports) },
        consumeReadyLease: (lease) => {
          adapter = attachPluginRuntimeTransport({
            handler,
            isCurrent: () => session.snapshot().state === 'ready',
            lease,
            onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
            onDisconnect: () => session.disconnect(),
            scheduler,
          });
          return adapter.dispose;
        },
      });
      await initialization;

      await expect(client.request({ method: 'ui.close', params: {} })).rejects.toEqual({
        code: 'unavailable',
        message: 'The Host API is unavailable.',
      });
      await expect(client.request({ method: 'storage.get', params: { key: 'invalid-output' } })).rejects.toEqual({
        code: 'internal_error',
        message: 'The Host API request failed.',
      });
      await expect(client.request({ method: 'storage.get', params: { key: 'throw' } })).rejects.toEqual({
        code: 'internal_error',
        message: 'The Host API request failed.',
      });
      await expect(client.request({ method: 'storage.get', params: { key: 'healthy' } })).resolves.toEqual({
        found: true,
        value: 'safe',
      });

      const concurrent = Array.from({ length: 33 }, (_, index) =>
        client.request({ method: 'storage.get', params: { key: `pending-${index}` } }),
      );
      const overLimit = concurrent.at(-1);
      if (overLimit === undefined) throw new Error('concurrency fixture is empty');
      const overLimitAssertion = expect(overLimit).rejects.toEqual({
        code: 'limit_exceeded',
        message: 'The Host API limit was exceeded.',
      });
      await waitFor(() => handlerHits.filter((key) => key.startsWith('pending-')).length === 32);
      await overLimitAssertion;
      for (let index = 0; index < 32; index += 1) {
        completions.get(`pending-${index}`)?.({ method: 'storage.get', result: { found: false } });
      }
      await expect(Promise.all(concurrent.slice(0, 32))).resolves.toEqual(
        Array.from({ length: 32 }, () => ({ found: false })),
      );

      const hostTimeout = client.request({ method: 'storage.get', params: { key: 'host-timeout' } });
      await waitFor(() => completions.has('host-timeout'));
      scheduler.runLatest();
      await expect(hostTimeout).rejects.toEqual({
        code: 'timeout',
        message: 'The Host API request timed out.',
      });
      completions.get('host-timeout')?.({ method: 'storage.get', result: { found: true, value: 'private-late' } });

      const events: unknown[] = [];
      client.subscribe('runtime.context_changed', (event) => events.push(event));
      expect(adapter?.emit({ event: 'private.event', payload: { grant: 'secret' } } as never)).toBe(false);
      expect(events).toEqual([]);
      await expect(client.request({ method: 'storage.get', params: { key: 'healthy' } })).resolves.toEqual({
        found: true,
        value: 'safe',
      });
      expect(JSON.stringify(diagnostics)).not.toMatch(
        /private\/provider|private-late|payload|request_[0-9a-f]|origin|grant|stack|MessagePort/u,
      );
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'invalid_handler_output', stage: 'egress' }),
          expect.objectContaining({ code: 'handler_failed', stage: 'execution' }),
          expect.objectContaining({ code: 'concurrency_limit_exceeded', stage: 'ingress' }),
          expect.objectContaining({ code: 'execution_timeout', stage: 'execution' }),
          expect.objectContaining({ code: 'invalid_event', stage: 'egress' }),
        ]),
      );
      await client.dispose();
      session.dispose();
    } finally {
      sessionService.dispose();
      restore();
    }
  });
});
