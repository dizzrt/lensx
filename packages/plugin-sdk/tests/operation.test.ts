import { describe, expect, test } from '@rstest/core';

import { PluginSdkError } from '../src/error.js';
import { abortPendingOperations, type PendingOperationSet, runSdkOperation } from '../src/operation.js';
import { deferred, FakeCancellationSignal, FakePluginSdkTransport } from './fixtures/fake-transport.js';

describe('SDK operation runner and abstract transport events', () => {
  test('completes once and removes cancellation listeners', async () => {
    const transport = new FakePluginSdkTransport();
    transport.requestImplementation = async () => 'done';
    const pending: PendingOperationSet = new Set();

    await expect(
      runSdkOperation({
        operation: (signal) => transport.request({ method: 'typed.adapter.operation', params: {}, signal }),
        pendingOperations: pending,
        timeoutMs: 100,
      }),
    ).resolves.toBe('done');
    expect(pending.size).toBe(0);
    expect(transport.requestSignals[0]?.aborted).toBe(false);
  });

  test('propagates caller cancellation and ignores a late result', async () => {
    const transport = new FakePluginSdkTransport();
    const late = deferred<unknown>();
    transport.requestImplementation = () => late.promise;
    const callerSignal = new FakeCancellationSignal();
    let delivered = false;
    const operation = runSdkOperation({
      operation: (signal) => transport.request({ method: 'typed.adapter.operation', params: {}, signal }),
      pendingOperations: new Set() as PendingOperationSet,
      signal: callerSignal,
      timeoutMs: 100,
    }).then(() => {
      delivered = true;
    });

    callerSignal.abort();
    await expect(operation).rejects.toMatchObject({ code: 'cancelled' });
    expect(transport.requestSignals[0]?.aborted).toBe(true);
    late.resolve('late');
    await Promise.resolve();
    expect(delivered).toBe(false);
  });

  test('times out, rejects invalid timeout, and supports lifecycle abort', async () => {
    const transport = new FakePluginSdkTransport();
    transport.requestImplementation = () => new Promise(() => undefined);

    await expect(
      runSdkOperation({
        operation: (signal) => transport.request({ method: 'typed.adapter.operation', params: {}, signal }),
        pendingOperations: new Set() as PendingOperationSet,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(transport.requestSignals[0]?.aborted).toBe(true);

    expect(() =>
      runSdkOperation({
        operation: async () => undefined,
        pendingOperations: new Set() as PendingOperationSet,
        timeoutMs: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_argument' }));

    const pending: PendingOperationSet = new Set();
    const pendingResult = runSdkOperation({
      operation: async () => new Promise(() => undefined),
      pendingOperations: pending,
      timeoutMs: 100,
    });
    abortPendingOperations(pending, new PluginSdkError('disconnected'));
    await expect(pendingResult).rejects.toMatchObject({ code: 'disconnected' });
  });

  test('uses idempotent event unsubscribe semantics in the package fake', () => {
    const transport = new FakePluginSdkTransport();
    const payloads: unknown[] = [];
    const unsubscribe = transport.subscribe('runtime.changed', (payload) => payloads.push(payload));

    transport.emit('runtime.changed', 1);
    unsubscribe();
    unsubscribe();
    transport.emit('runtime.changed', 2);

    expect(payloads).toEqual([1]);
  });
});
