import type { HostApiEvent } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';

import type { PluginRuntimeSessionMessageEvent, PluginRuntimeSessionMessagePort } from '../src/app/plugins/runtime';
import {
  attachPluginRuntimeTransport,
  createPluginRuntimeTransportPostResponseOutcome,
  PLUGIN_RPC_V1_POLICY,
  type PluginRuntimeScheduler,
  type PluginRuntimeTransportHandler,
  type PluginRuntimeTransportHandlerResult,
  unavailablePluginRuntimeTransportHandler,
} from '../src/app/plugins/runtime';
import { nestedValue } from './fixtures/plugin-rpc-validation';

class FakePort implements PluginRuntimeSessionMessagePort {
  onmessage: ((event: PluginRuntimeSessionMessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly close = rs.fn();
  readonly postMessage = rs.fn();
  readonly start = rs.fn();
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  emitError() {
    this.onmessageerror?.();
  }
}

class FakeScheduler implements PluginRuntimeScheduler {
  #sequence = 0;
  readonly callbacks = new Map<number, () => void>();
  readonly clearTimeout = rs.fn((handle: unknown) => this.callbacks.delete(handle as number));
  readonly now = () => 0;
  readonly setTimeout = rs.fn((callback: () => void, _delayMs: number): unknown => {
    this.#sequence += 1;
    this.callbacks.set(this.#sequence, callback);
    return this.#sequence;
  });
  run(handle: number) {
    this.callbacks.get(handle)?.();
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
  granted_permission_ids: Object.freeze(['clipboard.read']),
});
const request = (id: string, method = 'ui.close', params: unknown = {}) => ({
  contract_version: '0.1.0',
  type: 'lensx.plugin_transport.request',
  request_id: id,
  request: { method, params },
});

describe('Host-private Plugin Runtime transport adapter', () => {
  test('injects only frozen lease identity and returns Contract-valid out-of-order results', async () => {
    const port = new FakePort();
    const completions = new Map<string, (value: PluginRuntimeTransportHandlerResult) => void>();
    const handler = rs.fn<PluginRuntimeTransportHandler>(({ request: value }) => {
      if (value.method !== 'storage.get') throw new Error('unexpected method');
      return new Promise((resolve) => completions.set(value.params.key, resolve));
    });
    attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
    port.emit(request('request_0000000000000001', 'storage.get', { key: 'first' }));
    port.emit(request('request_0000000000000002', 'storage.get', { key: 'second' }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ identity, request: { method: 'storage.get' } });
    expect(handler.mock.calls[0]?.[0]).not.toHaveProperty('origin');
    expect(handler.mock.calls[0]?.[0]).not.toHaveProperty('port');
    completions.get('second')?.({ method: 'storage.get', result: { found: false } });
    completions.get('first')?.({ method: 'storage.get', result: { found: true, value: 'first' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(port.postMessage.mock.calls.map(([value]) => (value as { request_id: string }).request_id)).toEqual([
      'request_0000000000000002',
      'request_0000000000000001',
    ]);
  });

  test('blocks identity injection, stale Ports, duplicate IDs, and invalid frames before the handler', () => {
    for (const value of [
      { ...request('request_0000000000000001'), plugin_id: 'com.forged' },
      { ...request('request_0000000000000001'), grant: 'clipboard.read' },
      { ...request('request_0000000000000001'), path: '/private/plugin' },
    ]) {
      const port = new FakePort();
      const handler = rs.fn<PluginRuntimeTransportHandler>();
      attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
      port.emit(value);
      expect(handler).not.toHaveBeenCalled();
      expect(port.close).toHaveBeenCalledTimes(1);
    }

    const stalePort = new FakePort();
    const staleHandler = rs.fn<PluginRuntimeTransportHandler>();
    attachPluginRuntimeTransport({
      handler: staleHandler,
      isCurrent: () => false,
      lease: { identity, port: stalePort },
    });
    stalePort.emit(request('request_0000000000000001'));
    expect(staleHandler).not.toHaveBeenCalled();
    expect(stalePort.close).toHaveBeenCalledTimes(1);
  });

  test('propagates cancellation once and suppresses late handler completion', async () => {
    const port = new FakePort();
    let signal: AbortSignal | undefined;
    let complete: ((value: PluginRuntimeTransportHandlerResult) => void) | undefined;
    const handler: PluginRuntimeTransportHandler = (input) => {
      signal = input.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    };
    attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
    port.emit(request('request_0000000000000001'));
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_0000000000000001',
    });
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_0000000000000001',
    });
    expect(signal?.aborted).toBe(true);
    complete?.({ method: 'ui.close', result: { accepted: true } });
    await Promise.resolve();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  test('delivers and terminals a valid response before running one private post-response effect', async () => {
    const order: string[] = [];
    const port = new FakePort();
    port.postMessage.mockImplementation(() => order.push('response'));
    const effect = rs.fn(() => order.push('effect'));
    const adapter = attachPluginRuntimeTransport({
      handler: () =>
        createPluginRuntimeTransportPostResponseOutcome({ method: 'ui.close', result: { accepted: true } }, effect),
      isCurrent: () => true,
      lease: { identity, port },
    });

    port.emit(request('request_0000000000000001'));
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['response', 'effect']);
    expect(effect).toHaveBeenCalledTimes(1);
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_0000000000000001',
    });
    adapter.dispose();
    adapter.dispose();
    expect(effect).toHaveBeenCalledTimes(1);
  });

  test('suppresses a post-response effect when cancellation or currentness wins before settlement', async () => {
    for (const makeStale of [false, true]) {
      const port = new FakePort();
      const effect = rs.fn();
      let current = true;
      let complete: ((value: PluginRuntimeTransportHandlerResult) => void) | undefined;
      attachPluginRuntimeTransport({
        handler: () => new Promise((resolve) => (complete = resolve)),
        isCurrent: () => current,
        lease: { identity, port },
      });
      port.emit(request('request_0000000000000001'));
      if (makeStale) current = false;
      else
        port.emit({
          contract_version: '0.1.0',
          type: 'lensx.plugin_transport.cancel',
          request_id: 'request_0000000000000001',
        });
      complete?.(
        createPluginRuntimeTransportPostResponseOutcome({ method: 'ui.close', result: { accepted: true } }, effect),
      );
      await Promise.resolve();
      await Promise.resolve();
      if (makeStale) {
        expect(port.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'lensx.plugin_transport.disconnect' }),
        );
      } else {
        expect(port.postMessage).not.toHaveBeenCalled();
      }
      expect(effect).not.toHaveBeenCalled();
    }
  });

  test('emits only valid events and converges handler, codec, messageerror, and cleanup failures safely', async () => {
    const port = new FakePort();
    const disconnect = rs.fn();
    const adapter = attachPluginRuntimeTransport({
      handler: unavailablePluginRuntimeTransportHandler,
      isCurrent: () => true,
      lease: { identity, port },
      onDisconnect: disconnect,
    });
    port.emit(request('request_0000000000000001'));
    await Promise.resolve();
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 'unavailable', message: 'The Host API is unavailable.' } }),
    );
    const event: HostApiEvent = {
      event: 'runtime.context_changed',
      payload: { capabilities: [], hostApiVersion: '0.1.0', locale: 'zh-CN', theme: 'dark' },
    };
    expect(adapter.emit(event)).toBe(true);
    expect(adapter.emit({ ...event, payload: { ...event.payload, identity: 'private' } } as never)).toBe(false);
    adapter.disconnect();
    adapter.dispose();
    port.emitError();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toMatch(/\/private\/|stack|payload.*private/u);
  });

  test('contains handler throw, invalid output, and method/result mismatch as safe internal errors', async () => {
    for (const handler of [
      (() => {
        throw new Error('/private/plugin payload stack');
      }) satisfies PluginRuntimeTransportHandler,
      (() => ({ method: 'actions.open', result: { opened: true } })) satisfies PluginRuntimeTransportHandler,
      (() => ({ private: 'Host object' }) as never) satisfies PluginRuntimeTransportHandler,
    ]) {
      const port = new FakePort();
      attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
      port.emit(request('request_0000000000000001'));
      await Promise.resolve();
      await Promise.resolve();
      expect(port.close).not.toHaveBeenCalled();
      expect(port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ error: { code: 'internal_error', message: 'The Host API request failed.' } }),
      );
      expect(JSON.stringify(port.postMessage.mock.calls)).not.toMatch(/\/private\/|payload|stack|Host object/u);
    }
  });

  test('maps correlatable request validation failures without any Handler hit and keeps the Session usable', async () => {
    const port = new FakePort();
    const handler = rs.fn<PluginRuntimeTransportHandler>(() => ({
      method: 'ui.close',
      result: { accepted: true },
    }));
    const diagnostics: unknown[] = [];
    attachPluginRuntimeTransport({
      handler,
      isCurrent: () => true,
      lease: { identity, port },
      onDiagnostic: (value) => diagnostics.push(value),
    });
    port.emit({ ...request('request_0000000000000001'), request: 'malformed' });
    port.emit(request('request_0000000000000002', 'storage.get', { key: '' }));
    port.emit(request('request_0000000000000003', 'future.unknown', {}));
    port.emit(
      request('request_0000000000000004', 'storage.set', {
        key: 'deep',
        value: nestedValue(PLUGIN_RPC_V1_POLICY.maxSemanticDepth + 1),
      }),
    );
    expect(handler).not.toHaveBeenCalled();
    expect(port.postMessage.mock.calls.map(([value]) => (value as { error: { code: string } }).error.code)).toEqual([
      'invalid_request',
      'invalid_params',
      'method_not_found',
      'limit_exceeded',
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        plugin_id: identity.plugin_id,
        method: 'storage.set',
        stage: 'ingress',
        code: 'frame_limit_exceeded',
      }),
    ]);
    port.emit(request('request_0000000000000005'));
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(port.close).not.toHaveBeenCalled();
  });

  test('fails closed for batch, non-JSON, private envelope, duplicate, and decreasing request IDs', async () => {
    for (const frames of [
      [[request('request_0000000000000001')]],
      [{ ...request('request_0000000000000001'), request: { method: 'ui.close', params: { bad: undefined } } }],
      [{ ...request('request_0000000000000001'), origin: identity.expected_origin }],
      [request('request_0000000000000001'), request('request_0000000000000001')],
      [request('request_0000000000000002'), request('request_0000000000000001')],
    ]) {
      const port = new FakePort();
      const handler = rs.fn<PluginRuntimeTransportHandler>(() => ({
        method: 'ui.close',
        result: { accepted: true },
      }));
      attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
      for (const frame of frames) port.emit(frame);
      await Promise.resolve();
      await Promise.resolve();
      expect(port.close).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledTimes(frames.length === 2 ? 1 : 0);
    }
  });

  test('bounds one Session at 32 in-flight handlers and releases slots after completion and cancellation', async () => {
    const port = new FakePort();
    const completions = new Map<number, (value: PluginRuntimeTransportHandlerResult) => void>();
    const signals = new Map<number, AbortSignal>();
    const handler = rs.fn<PluginRuntimeTransportHandler>(({ request: value, signal }) => {
      const key = Number((value.params as { key: string }).key);
      signals.set(key, signal);
      return new Promise((resolve) => completions.set(key, resolve));
    });
    attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
    for (let sequence = 1; sequence <= 33; sequence += 1) {
      port.emit(request(`request_${sequence.toString(16).padStart(16, '0')}`, 'storage.get', { key: `${sequence}` }));
    }
    expect(handler).toHaveBeenCalledTimes(PLUGIN_RPC_V1_POLICY.maxInFlightRequests);
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'request_0000000000000021',
        error: expect.objectContaining({ code: 'limit_exceeded' }),
      }),
    );
    completions.get(1)?.({ method: 'storage.get', result: { found: false } });
    await Promise.resolve();
    await Promise.resolve();
    port.emit(request('request_0000000000000022', 'storage.get', { key: '34' }));
    expect(handler).toHaveBeenCalledTimes(33);
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_0000000000000002',
    });
    expect(signals.get(2)?.aborted).toBe(true);
    port.emit(request('request_0000000000000023', 'storage.get', { key: '35' }));
    expect(handler).toHaveBeenCalledTimes(34);
  });

  test('keeps long-Session terminal state bounded behind only a monotonic request high-water mark', async () => {
    const port = new FakePort();
    const handler = rs.fn<PluginRuntimeTransportHandler>(() => ({
      method: 'ui.close',
      result: { accepted: true },
    }));
    attachPluginRuntimeTransport({ handler, isCurrent: () => true, lease: { identity, port } });
    for (let sequence = 1; sequence <= 256; sequence += 1) {
      port.emit(request(`request_${sequence.toString(16).padStart(16, '0')}`));
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(handler).toHaveBeenCalledTimes(256);
    expect(port.close).not.toHaveBeenCalled();
    port.emit({
      contract_version: '0.1.0',
      type: 'lensx.plugin_transport.cancel',
      request_id: 'request_ffffffffffffffff',
    });
    expect(port.close).not.toHaveBeenCalled();
    port.emit(request('request_0000000000000001'));
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(256);
  });

  test('enforces one injectable 10 second Host deadline and suppresses late completion and effect', async () => {
    const port = new FakePort();
    const scheduler = new FakeScheduler();
    const effect = rs.fn();
    let signal: AbortSignal | undefined;
    let complete: ((value: PluginRuntimeTransportHandlerResult) => void) | undefined;
    attachPluginRuntimeTransport({
      handler: (input) => {
        signal = input.signal;
        return new Promise((resolve) => (complete = resolve));
      },
      isCurrent: () => true,
      lease: { identity, port },
      scheduler,
    });
    port.emit(request('request_0000000000000001'));
    expect(scheduler.setTimeout).toHaveBeenCalledWith(expect.any(Function), 10_000);
    scheduler.run(1);
    expect(signal?.aborted).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 'timeout', message: 'The Host API request timed out.' } }),
    );
    complete?.(
      createPluginRuntimeTransportPostResponseOutcome({ method: 'ui.close', result: { accepted: true } }, effect),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(effect).not.toHaveBeenCalled();
    port.emit(request('request_0000000000000002'));
    expect(scheduler.setTimeout).toHaveBeenCalledTimes(2);
  });

  test('contains invalid and over-budget events without disconnecting subscribers or leaking diagnostics', () => {
    const port = new FakePort();
    const diagnostics: unknown[] = [];
    const adapter = attachPluginRuntimeTransport({
      handler: unavailablePluginRuntimeTransportHandler,
      isCurrent: () => true,
      lease: { identity, port },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    expect(
      adapter.emit({
        event: 'runtime.context_changed',
        payload: { capabilities: [], hostApiVersion: '0.1.0', locale: 'en-US', theme: 'light', grant: 'private' },
      } as never),
    ).toBe(false);
    expect(adapter.emit({ private: 'Host object' } as never)).toBe(false);
    expect(
      adapter.emit({
        event: 'runtime.context_changed',
        payload: { oversized: 'x'.repeat(PLUGIN_RPC_V1_POLICY.maxFrameBytes) },
      } as never),
    ).toBe(false);
    expect(port.postMessage).not.toHaveBeenCalled();
    expect(port.close).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid_event', stage: 'egress' }),
      expect.objectContaining({ code: 'invalid_event', stage: 'egress' }),
      expect.objectContaining({ code: 'invalid_event', stage: 'egress' }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toMatch(/grant.*private|Host object|payload|request_id|origin|stack/u);
  });

  test('converts an over-depth Handler result to internal_error before recursive Contract delivery', async () => {
    const port = new FakePort();
    attachPluginRuntimeTransport({
      handler: () =>
        ({
          method: 'storage.get',
          result: { found: true, value: nestedValue(PLUGIN_RPC_V1_POLICY.maxSemanticDepth + 1) },
        }) as never,
      isCurrent: () => true,
      lease: { identity, port },
    });
    port.emit(request('request_0000000000000001', 'storage.get', { key: 'deep-result' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'internal_error' }) }),
    );
    expect(port.close).not.toHaveBeenCalled();
  });

  test('keeps a request-level rejection deterministic when the diagnostic sink throws', () => {
    const port = new FakePort();
    const handler = rs.fn<PluginRuntimeTransportHandler>();
    attachPluginRuntimeTransport({
      handler,
      isCurrent: () => true,
      lease: { identity, port },
      onDiagnostic: () => {
        throw new Error('sink failure with payload /private/path');
      },
    });
    port.emit(
      request('request_0000000000000001', 'storage.set', {
        key: 'deep',
        value: nestedValue(PLUGIN_RPC_V1_POLICY.maxSemanticDepth + 1),
      }),
    );
    expect(handler).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'limit_exceeded' }) }),
    );
    expect(port.close).not.toHaveBeenCalled();
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toMatch(/private\/path|payload|stack/u);
  });

  test('treats postMessage failure as terminal and never runs the paired effect', async () => {
    const port = new FakePort();
    port.postMessage.mockImplementation(() => {
      throw new Error('Port failed with /private/path payload');
    });
    const effect = rs.fn();
    attachPluginRuntimeTransport({
      handler: () =>
        createPluginRuntimeTransportPostResponseOutcome({ method: 'ui.close', result: { accepted: true } }, effect),
      isCurrent: () => true,
      lease: { identity, port },
    });
    port.emit(request('request_0000000000000001'));
    await Promise.resolve();
    await Promise.resolve();
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(effect).not.toHaveBeenCalled();
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toMatch(/private\/path|payload/u);
  });
});
