import { describe, expect, test } from '@rstest/core';

import { createPluginSdk, PluginSdkError } from '../src/index.js';
import {
  deferred,
  FakeCancellationSignal,
  FakePluginSdkTransport,
  validRuntimeContext,
} from './fixtures/fake-transport.js';

describe('Plugin SDK Contract-closed request and event API', () => {
  test('validates and freezes a declared request and infers the paired result payload', async () => {
    const transport = new FakePluginSdkTransport();
    let observed: unknown;
    transport.connectImplementation = async () => validRuntimeContext(['actions.open']);
    transport.requestImplementation = async (request) => {
      observed = request;
      return { method: 'actions.open', result: { opened: true } };
    };
    const client = createPluginSdk({ transport });
    await client.initialize();
    const request = { method: 'actions.open', params: { actionId: 'open-settings' } } as const;
    const result = await client.request(request);
    expect(result.opened).toBe(true);
    expect(observed).toMatchObject(request);
    expect(Object.isFrozen((observed as { params: unknown }).params)).toBe(true);
    expect(transport.requestSignals).toHaveLength(1);
  });

  test('sends no transport request before ready, for unavailable capabilities, or for runtime-invalid input', async () => {
    const transport = new FakePluginSdkTransport();
    transport.connectImplementation = async () => validRuntimeContext([]);
    const client = createPluginSdk({ transport });
    await expect(client.request({ method: 'ui.close', params: {} })).rejects.toMatchObject({
      code: 'transport_failure',
    });
    await client.initialize();
    await expect(client.request({ method: 'ui.close', params: {} })).rejects.toMatchObject({
      code: 'invalid_argument',
    });
    await expect(
      client.request({ method: 'ui.close', params: {}, plugin_id: 'private' } as never),
    ).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(transport.requestSignals).toHaveLength(0);
  });

  test('preserves valid Host errors and maps unknown failures without sensitive values', async () => {
    const transport = new FakePluginSdkTransport();
    transport.connectImplementation = async () => validRuntimeContext(['ui.close']);
    const client = createPluginSdk({ transport });
    await client.initialize();
    transport.requestImplementation = async () => {
      throw { code: 'permission_denied', message: 'Permission denied.' };
    };
    await expect(client.request({ method: 'ui.close', params: {} })).rejects.toEqual({
      code: 'permission_denied',
      message: 'Permission denied.',
    });
    transport.requestImplementation = async () => {
      throw new Error('/private/path payload stack');
    };
    await expect(client.request({ method: 'ui.close', params: {} })).rejects.toEqual(
      new PluginSdkError('transport_failure'),
    );
  });

  test('supports concurrent out-of-order results, cancellation, timeout, and late suppression', async () => {
    const transport = new FakePluginSdkTransport();
    transport.connectImplementation = async () => validRuntimeContext(['storage.get', 'ui.close']);
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    let index = 0;
    transport.requestImplementation = () => (++index === 1 ? first.promise : second.promise);
    const client = createPluginSdk({ transport, timeoutMs: 10 });
    await client.initialize();
    const firstRequest = client.request({ method: 'storage.get', params: { key: 'first' } });
    const secondRequest = client.request({ method: 'storage.get', params: { key: 'second' } });
    second.resolve({ method: 'storage.get', result: { found: false } });
    first.resolve({ method: 'storage.get', result: { found: true, value: 'first' } });
    await expect(secondRequest).resolves.toEqual({ found: false });
    await expect(firstRequest).resolves.toEqual({ found: true, value: 'first' });

    const cancelled = deferred<unknown>();
    transport.requestImplementation = () => cancelled.promise;
    const signal = new FakeCancellationSignal();
    const cancellation = client.request({ method: 'ui.close', params: {} }, { signal });
    await Promise.resolve();
    signal.abort();
    await expect(cancellation).rejects.toMatchObject({ code: 'cancelled' });
    cancelled.resolve({ method: 'ui.close', result: { accepted: true } });
    await Promise.resolve();

    transport.requestImplementation = () => new Promise(() => undefined);
    await expect(client.request({ method: 'ui.close', params: {} }, { timeoutMs: 5 })).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  test('installs a full frozen context replacement before notifying typed subscribers', async () => {
    const transport = new FakePluginSdkTransport();
    transport.connectImplementation = async () => validRuntimeContext(['storage.get']);
    const client = createPluginSdk({ transport });
    await client.initialize();
    const contexts: unknown[] = [];
    client.subscribe('runtime.context_changed', (event) => contexts.push([client.context, event]));
    transport.emit('runtime.context_changed', {
      capabilities: [],
      hostApiVersion: '0.1.0',
      locale: 'zh-CN',
      theme: 'dark',
    });
    expect(contexts).toEqual([[client.context, { event: 'runtime.context_changed', payload: client.context }]]);
    expect(client.context).toMatchObject({ capabilities: [], locale: 'zh-CN', theme: 'dark' });
    expect(Object.isFrozen(client.context)).toBe(true);

    transport.emit('runtime.context_changed', { ...client.context, pluginIdentity: 'private' });
    expect(client.state).toBe('disconnected');
    expect(contexts).toHaveLength(1);
  });
});
