import { describe, expect, test } from '@rstest/core';

import type { PluginSdkCancellationSignal, PluginSdkTransport } from '../src/index.js';
import { createPluginWebviewTransport } from '../src/webview.js';
import { FakeCancellationSignal } from './fixtures/fake-transport.js';

const bootstrap = Object.freeze({
  contract_version: '0.2.0',
  type: 'lensx.plugin_bridge.ready',
  freshness: '0123456789abcdef0123456789abcdef',
});
const context = Object.freeze({
  capabilities: Object.freeze(['storage.get', 'ui.close']),
  hostApiVersion: '0.2.0',
  locale: 'en-US',
  theme: 'light',
});

class FakeBridge {
  readonly bootstrap = bootstrap;
  readonly sent: unknown[] = [];
  readonly listeners = new Set<(frame: unknown) => void>();
  sendCalls = 0;
  subscribeCalls = 0;
  unsubscribeCalls = 0;
  readonly surface = Object.freeze({
    bootstrap: this.bootstrap,
    send: (frame: unknown) => this.send(frame),
    subscribe: (listener: (frame: unknown) => void) => this.subscribe(listener),
  });

  send = (frame: unknown): boolean => {
    this.sendCalls += 1;
    this.sent.push(frame);
    return true;
  };

  subscribe = (listener: (frame: unknown) => void): (() => boolean) => {
    this.subscribeCalls += 1;
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      this.unsubscribeCalls += 1;
      return this.listeners.delete(listener);
    };
  };

  emit(frame: unknown): void {
    for (const listener of [...this.listeners]) listener(frame);
  }
}

const withBridge = async <Value>(
  bridge: FakeBridge | Record<string, unknown> | undefined,
  operation: () => Promise<Value>,
): Promise<Value> => {
  const key = '__LENSX_PLUGIN_WEBVIEW_BRIDGE__';
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  if (bridge === undefined) Reflect.deleteProperty(globalThis, key);
  else
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: bridge instanceof FakeBridge ? bridge.surface : Object.freeze(bridge),
    });
  try {
    return await operation();
  } finally {
    if (previous !== undefined) Object.defineProperty(globalThis, key, previous);
    else Reflect.deleteProperty(globalThis, key);
  }
};

const establish = async (
  bridge: FakeBridge,
): Promise<{
  readonly signal: FakeCancellationSignal;
  readonly transport: PluginSdkTransport;
}> => {
  const signal = new FakeCancellationSignal();
  const transport = createPluginWebviewTransport();
  const connected = transport.connect({ signal });
  expect(bridge.sent[0]).toEqual(bootstrap);
  const request = bridge.sent[1] as { readonly request_id: string };
  bridge.emit({
    contract_version: '0.2.0',
    type: 'lensx.plugin_bridge.response',
    request_id: request.request_id,
    result: { method: 'runtime.get_context', result: context },
  });
  await expect(connected).resolves.toEqual(context);
  return { signal, transport };
};

describe('official Plugin SDK WebView transport', () => {
  test('defers bridge ready until the document crosses the native finished-load boundary', async () => {
    const bridge = new FakeBridge();
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    let loadListener: (() => void) | undefined;
    const loadTarget = {
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'load') loadListener = listener;
      },
      removeEventListener: (type: string, listener: () => void) => {
        if (type === 'load' && loadListener === listener) loadListener = undefined;
      },
      setTimeout,
    };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: Object.freeze({ defaultView: loadTarget, readyState: 'loading' }),
    });
    try {
      await withBridge(bridge, async () => {
        const transport = createPluginWebviewTransport();
        const connected = transport.connect({ signal: new FakeCancellationSignal() });
        expect(bridge.sent).toEqual([]);
        loadListener?.();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(bridge.sent[0]).toEqual(bootstrap);
        const request = bridge.sent[1] as { readonly request_id: string };
        bridge.emit({
          contract_version: '0.2.0',
          type: 'lensx.plugin_bridge.response',
          request_id: request.request_id,
          result: { method: 'runtime.get_context', result: context },
        });
        await expect(connected).resolves.toEqual(context);
      });
    } finally {
      if (previousDocument !== undefined) Object.defineProperty(globalThis, 'document', previousDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });

  test('discovers one frozen current bridge and sends its exact ready frame once', async () => {
    const bridge = new FakeBridge();
    await withBridge(bridge, async () => {
      const transport = createPluginWebviewTransport();
      const signal = new FakeCancellationSignal();
      const first = transport.connect({ signal });
      const second = transport.connect({ signal });
      expect(first).toBe(second);
      expect(bridge.subscribeCalls).toBe(1);
      expect(bridge.sent.filter((frame) => (frame as { readonly type?: string }).type === bootstrap.type)).toEqual([
        bootstrap,
      ]);
      const request = bridge.sent[1] as { readonly request_id: string };
      bridge.emit({
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.response',
        request_id: request.request_id,
        result: { method: 'runtime.get_context', result: context },
      });
      await expect(first).resolves.toEqual(context);
      await transport.dispose();
    });
  });

  test('fails closed when the bridge is absent or malformed without probing a fallback carrier', async () => {
    const traps = ['window', '__TAURI__', 'ipc', 'postMessage', 'MessageChannel'] as const;
    const previous = new Map<string, PropertyDescriptor | undefined>();
    let fallbackReads = 0;
    for (const key of traps) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get: () => {
          fallbackReads += 1;
          throw new Error('fallback probe');
        },
      });
    }
    try {
      await withBridge(undefined, async () => {
        const transport = createPluginWebviewTransport();
        await expect(transport.connect({ signal: new FakeCancellationSignal() })).rejects.toMatchObject({
          code: 'transport_failure',
        });
      });
      await withBridge({ bootstrap, send: () => true, subscribe: () => () => undefined, extra: 'forged' }, async () => {
        const transport = createPluginWebviewTransport();
        await expect(transport.connect({ signal: new FakeCancellationSignal() })).rejects.toMatchObject({
          code: 'transport_failure',
        });
      });
      expect(fallbackReads).toBe(0);
    } finally {
      for (const key of traps) {
        const descriptor = previous.get(key);
        if (descriptor !== undefined) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });

  test('correlates out-of-order responses, preserves errors, and delivers declared events', async () => {
    const bridge = new FakeBridge();
    await withBridge(bridge, async () => {
      const { transport } = await establish(bridge);
      const signal = new FakeCancellationSignal();
      const first = transport.request({ method: 'storage.get', params: { key: 'first' }, signal });
      const second = transport.request({ method: 'storage.get', params: { key: 'second' }, signal });
      const firstFrame = bridge.sent.at(-2) as { readonly request_id: string };
      const secondFrame = bridge.sent.at(-1) as { readonly request_id: string };
      bridge.emit({
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.response',
        request_id: secondFrame.request_id,
        result: { method: 'storage.get', result: { found: false } },
      });
      bridge.emit({
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.response',
        request_id: firstFrame.request_id,
        error: { code: 'not_found', message: 'Not found.' },
      });
      await expect(second).resolves.toEqual({ method: 'storage.get', result: { found: false } });
      await expect(first).rejects.toEqual({ code: 'not_found', message: 'Not found.' });

      const events: unknown[] = [];
      transport.subscribe('runtime.context_changed', (payload) => events.push(payload));
      bridge.emit({
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.event',
        event: { event: 'runtime.context_changed', payload: { ...context, capabilities: [] } },
      });
      expect(events).toEqual([{ ...context, capabilities: [] }]);
    });
  });

  test('sends one cancel, ignores its late response, and rejects duplicate terminal frames', async () => {
    const bridge = new FakeBridge();
    await withBridge(bridge, async () => {
      const { transport } = await establish(bridge);
      const cancellation = new FakeCancellationSignal();
      const pending = transport.request({ method: 'ui.close', params: {}, signal: cancellation });
      const request = bridge.sent.at(-1) as { readonly request_id: string };
      cancellation.abort();
      cancellation.abort();
      await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
      expect(
        bridge.sent.filter(
          (frame) =>
            (frame as { readonly type?: string }).type === 'lensx.plugin_bridge.cancel' &&
            (frame as { readonly request_id?: string }).request_id === request.request_id,
        ),
      ).toHaveLength(1);
      bridge.emit({
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.response',
        request_id: request.request_id,
        result: { method: 'ui.close', result: { accepted: true } },
      });

      const nextSignal: PluginSdkCancellationSignal = new FakeCancellationSignal();
      const completed = transport.request({ method: 'ui.close', params: {}, signal: nextSignal });
      const next = bridge.sent.at(-1) as { readonly request_id: string };
      const response = {
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.response',
        request_id: next.request_id,
        result: { method: 'ui.close', result: { accepted: true } },
      };
      bridge.emit(response);
      await completed;
      bridge.emit(response);
      await expect(transport.request({ method: 'ui.close', params: {}, signal: nextSignal })).rejects.toMatchObject({
        code: 'disconnected',
      });
      expect(
        bridge.sent.filter((frame) => (frame as { readonly type?: string }).type === 'lensx.plugin_bridge.disconnect'),
      ).toHaveLength(1);
      expect(bridge.unsubscribeCalls).toBe(1);
    });
  });

  test('disposes subscriptions and pending work once and makes every late callback inert', async () => {
    const bridge = new FakeBridge();
    await withBridge(bridge, async () => {
      const { transport } = await establish(bridge);
      const signal = new FakeCancellationSignal();
      const pending = transport.request({ method: 'storage.get', params: { key: 'slow' }, signal });
      const request = bridge.sent.at(-1) as { readonly request_id: string };
      const events: unknown[] = [];
      let disconnects = 0;
      transport.subscribe('runtime.context_changed', (payload) => events.push(payload));
      transport.onDisconnect(() => {
        disconnects += 1;
      });

      await transport.dispose();
      await transport.dispose();
      await expect(pending).rejects.toMatchObject({ code: 'disposed' });
      expect(bridge.unsubscribeCalls).toBe(1);
      expect(bridge.listeners.size).toBe(0);
      expect(
        bridge.sent.filter((frame) => (frame as { readonly type?: string }).type === 'lensx.plugin_bridge.disconnect'),
      ).toHaveLength(1);

      bridge.emit({
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.response',
        request_id: request.request_id,
        result: { method: 'storage.get', result: { found: false } },
      });
      bridge.emit({
        contract_version: '0.2.0',
        type: 'lensx.plugin_bridge.event',
        event: { event: 'runtime.context_changed', payload: { ...context, capabilities: [] } },
      });
      expect(events).toEqual([]);
      expect(disconnects).toBe(0);
      await expect(transport.request({ method: 'ui.close', params: {}, signal })).rejects.toMatchObject({
        code: 'disposed',
      });
    });
  });
});
