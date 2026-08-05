import { describe, expect, test } from '@rstest/core';

import { createPluginSdk } from '../packages/plugin-sdk/src';
import { createPluginIframeTransport } from '../packages/plugin-sdk/src/iframe';
import {
  attachPluginRuntimeTransport,
  createPluginRuntimeSessionService,
  type PluginRuntimeHostPortLease,
  type PluginRuntimeSession,
  type PluginRuntimeTransportAdapter,
  type PluginRuntimeTransportHandler,
  type PluginRuntimeTransportHandlerResult,
} from '../src/app/plugins/runtime';

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
  granted_permission_ids: Object.freeze([]),
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
            hostApiVersion: '0.1.0',
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
          payload: { capabilities: ['storage.get'], hostApiVersion: '0.1.0', locale: 'zh-CN', theme: 'dark' },
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
});
