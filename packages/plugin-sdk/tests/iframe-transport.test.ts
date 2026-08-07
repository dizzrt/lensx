import { describe, expect, test } from '@rstest/core';

import { createPluginIframeTransport } from '../src/iframe.js';
import type { PluginSdkCancellationSignal, PluginSdkTransport } from '../src/index.js';
import { FakeCancellationSignal } from './fixtures/fake-transport.js';

class FakePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly sent: unknown[] = [];
  closeCalls = 0;
  startCalls = 0;
  postMessage(value: unknown) {
    this.sent.push(value);
  }
  start() {
    this.startCalls += 1;
  }
  close() {
    this.closeCalls += 1;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  emitError() {
    this.onmessageerror?.();
  }
}

class FakeWindow {
  readonly parent = Object.freeze({ kind: 'parent' });
  readonly listeners = new Set<(event: unknown) => void>();
  addEventListener(_type: 'message', listener: (event: unknown) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: unknown) => void) {
    this.listeners.delete(listener);
  }
  emit(event: unknown) {
    for (const listener of [...this.listeners]) listener(event);
  }
}

const bootstrap = {
  contract_version: '0.1.0',
  type: 'lensx.plugin_runtime.bootstrap',
  nonce: '0123456789abcdef0123456789abcdef',
};
const context = Object.freeze({
  capabilities: Object.freeze(['storage.get', 'ui.close']),
  hostApiVersion: '0.1.0',
  locale: 'en-US',
  theme: 'light',
});

const withWindow = async <Value>(operation: (window: FakeWindow) => Promise<Value>): Promise<Value> => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const window = new FakeWindow();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  try {
    return await operation(window);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
};

const establish = async (
  window: FakeWindow,
): Promise<{
  readonly port: FakePort;
  readonly signal: FakeCancellationSignal;
  readonly transport: PluginSdkTransport;
}> => {
  const port = new FakePort();
  const signal = new FakeCancellationSignal();
  const transport = createPluginIframeTransport();
  const connected = transport.connect({ signal });
  window.emit({ data: bootstrap, origin: 'tauri://localhost', ports: [port], source: window.parent });
  await Promise.resolve();
  const request = port.sent[1] as { readonly request_id: string };
  port.emit({
    contract_version: '0.1.0',
    type: 'lensx.plugin_transport.response',
    request_id: request.request_id,
    result: { method: 'runtime.get_context', result: context },
  });
  await expect(connected).resolves.toEqual(context);
  return { port, signal, transport };
};

describe('official Plugin SDK iframe transport', () => {
  test('accepts one exact current-parent bootstrap and acknowledges only its transferred Port', async () => {
    await withWindow(async (window) => {
      const transport = createPluginIframeTransport();
      const signal = new FakeCancellationSignal();
      const connected = transport.connect({ signal });
      const wrongPort = new FakePort();
      window.emit({ data: bootstrap, origin: 'tauri://localhost', ports: [wrongPort], source: {} });
      window.emit({ data: bootstrap, origin: 'https://wrong.invalid', ports: [wrongPort], source: window.parent });
      window.emit({ data: bootstrap, origin: 'http://localhost:40756', ports: [wrongPort], source: window.parent });
      expect(wrongPort.sent).toEqual([]);
      expect(window.listeners.size).toBe(1);

      const port = new FakePort();
      window.emit({ data: bootstrap, origin: 'tauri://localhost', ports: [port], source: window.parent });
      expect(window.listeners.size).toBe(0);
      expect(port.sent[0]).toEqual({ ...bootstrap, type: 'lensx.plugin_runtime.ready' });
      expect(port.startCalls).toBe(1);
      await Promise.resolve();
      const request = port.sent[1] as { readonly request_id: string };
      port.emit({
        contract_version: '0.1.0',
        type: 'lensx.plugin_transport.response',
        request_id: request.request_id,
        result: { method: 'runtime.get_context', result: context },
      });
      await connected;
      window.emit({ data: bootstrap, origin: 'tauri://localhost', ports: [wrongPort], source: window.parent });
      expect(wrongPort.sent).toEqual([]);
      await transport.dispose();
    });
  });

  test('accepts the exact configured tauri development Host origin', async () => {
    await withWindow(async (window) => {
      const transport = createPluginIframeTransport();
      const connected = transport.connect({ signal: new FakeCancellationSignal() });
      const port = new FakePort();
      window.emit({ data: bootstrap, origin: 'http://localhost:40755', ports: [port], source: window.parent });

      expect(port.sent[0]).toEqual({ ...bootstrap, type: 'lensx.plugin_runtime.ready' });
      await Promise.resolve();
      const request = port.sent[1] as { readonly request_id: string };
      port.emit({
        contract_version: '0.1.0',
        type: 'lensx.plugin_transport.response',
        request_id: request.request_id,
        result: { method: 'runtime.get_context', result: context },
      });

      await expect(connected).resolves.toEqual(context);
      await transport.dispose();
    });
  });

  test.each([
    ['wrong version', { ...bootstrap, contract_version: '0.2.0' }, [new FakePort()]],
    ['extra identity', { ...bootstrap, plugin_id: 'private' }, [new FakePort()]],
    ['missing Port', bootstrap, []],
    ['multiple Ports', bootstrap, [new FakePort(), new FakePort()]],
  ])('fails closed for %s without adopting a Port', async (_name, value, ports) => {
    await withWindow(async (window) => {
      const transport = createPluginIframeTransport();
      const connected = transport.connect({ signal: new FakeCancellationSignal() });
      window.emit({ data: value, origin: 'tauri://localhost', ports, source: window.parent });
      await expect(connected).rejects.toMatchObject({ code: 'transport_failure' });
      expect(window.listeners.size).toBe(0);
      expect(ports.every((port) => port.sent.length === 0)).toBe(true);
    });
  });

  test('correlates concurrent out-of-order responses and preserves Host errors and declared events', async () => {
    await withWindow(async (window) => {
      const { port, transport } = await establish(window);
      const signal = new FakeCancellationSignal();
      const first = transport.request({ method: 'storage.get', params: { key: 'first' }, signal });
      const second = transport.request({ method: 'storage.get', params: { key: 'second' }, signal });
      const firstFrame = port.sent.at(-2) as { readonly request_id: string };
      const secondFrame = port.sent.at(-1) as { readonly request_id: string };
      port.emit({
        contract_version: '0.1.0',
        type: 'lensx.plugin_transport.response',
        request_id: secondFrame.request_id,
        result: { method: 'storage.get', result: { found: false } },
      });
      port.emit({
        contract_version: '0.1.0',
        type: 'lensx.plugin_transport.response',
        request_id: firstFrame.request_id,
        error: { code: 'not_found', message: 'Not found.' },
      });
      await expect(second).resolves.toEqual({ method: 'storage.get', result: { found: false } });
      await expect(first).rejects.toEqual({ code: 'not_found', message: 'Not found.' });

      const events: unknown[] = [];
      transport.subscribe('runtime.context_changed', (payload) => events.push(payload));
      port.emit({
        contract_version: '0.1.0',
        type: 'lensx.plugin_transport.event',
        event: { event: 'runtime.context_changed', payload: { ...context, capabilities: [] } },
      });
      expect(events).toEqual([{ ...context, capabilities: [] }]);
    });
  });

  test('sends one cancel, ignores its late response, and terminates on duplicate or malformed terminal frames', async () => {
    await withWindow(async (window) => {
      const { port, transport } = await establish(window);
      const cancellation = new FakeCancellationSignal();
      const pending = transport.request({ method: 'ui.close', params: {}, signal: cancellation });
      const request = port.sent.at(-1) as { readonly request_id: string };
      cancellation.abort();
      cancellation.abort();
      await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
      expect(
        port.sent.filter(
          (value) =>
            (value as { readonly type?: string }).type === 'lensx.plugin_transport.cancel' &&
            (value as { readonly request_id?: string }).request_id === request.request_id,
        ),
      ).toHaveLength(1);
      port.emit({
        contract_version: '0.1.0',
        type: 'lensx.plugin_transport.response',
        request_id: request.request_id,
        result: { method: 'ui.close', result: { accepted: true } },
      });

      const nextSignal: PluginSdkCancellationSignal = new FakeCancellationSignal();
      const completed = transport.request({ method: 'ui.close', params: {}, signal: nextSignal });
      const next = port.sent.at(-1) as { readonly request_id: string };
      const response = {
        contract_version: '0.1.0',
        type: 'lensx.plugin_transport.response',
        request_id: next.request_id,
        result: { method: 'ui.close', result: { accepted: true } },
      };
      port.emit(response);
      await completed;
      port.emit(response);
      expect(port.closeCalls).toBe(1);
      await expect(transport.request({ method: 'ui.close', params: {}, signal: nextSignal })).rejects.toMatchObject({
        code: 'disconnected',
      });
    });
  });

  test('converges messageerror, disconnect, and dispose on idempotent terminal cleanup', async () => {
    await withWindow(async (window) => {
      const { port, transport } = await establish(window);
      let disconnects = 0;
      transport.onDisconnect(() => {
        disconnects += 1;
      });
      port.emitError();
      port.emitError();
      await transport.dispose();
      await transport.dispose();
      expect(disconnects).toBe(1);
      expect(port.closeCalls).toBe(1);
    });
  });
});
