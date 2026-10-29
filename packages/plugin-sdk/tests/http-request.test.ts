import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { createPluginSdk } from '../src/index.js';
import {
  deferred,
  FakeCancellationSignal,
  FakePluginSdkTransport,
  validRuntimeContext,
} from './fixtures/fake-transport.js';

const request = {
  method: 'http.request',
  params: {
    url: 'https://example.com/api',
    method: 'POST',
    headers: [{ name: 'Authorization', value: 'fixture' }],
    body: '  中文\n',
    timeoutMs: 15000,
  },
} as const;
afterEach(() => {
  rs.useRealTimers();
});
const setup = async () => {
  const transport = new FakePluginSdkTransport();
  transport.connectImplementation = async () => ({ ...validRuntimeContext(['http.request']), hostApiVersion: '0.4.0' });
  const client = createPluginSdk({ transport });
  await client.initialize();
  return { client, transport };
};
describe('typed HTTP through the existing SDK', () => {
  test('preserves exact request text and HTTP failures as ordinary typed results', async () => {
    const { client, transport } = await setup();
    let observed: unknown;
    transport.requestImplementation = async (input) => {
      observed = input;
      return { method: 'http.request', result: { status: 403, headers: [], body: '{"service":"denied"}' } };
    };
    await expect(client.request(request, { timeoutMs: 16000 })).resolves.toEqual({
      status: 403,
      headers: [],
      body: '{"service":"denied"}',
    });
    expect(observed).toMatchObject(request);
    expect(Object.isFrozen((observed as { params: unknown }).params)).toBe(true);
    await client.dispose();
  });
  test('works on an older supported Host without pretending HTTP is available', async () => {
    const transport = new FakePluginSdkTransport();
    const client = createPluginSdk({ transport });
    await expect(client.initialize()).resolves.toMatchObject({ hostApiVersion: '0.4.0' });
    await expect(client.request(request)).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(transport.requestSignals).toHaveLength(0);
    await client.dispose();
  });
  test('rejects malformed HTTP requests before transport and preserves safe Host errors', async () => {
    const { client, transport } = await setup();
    await expect(
      client.request({ method: 'http.request', params: { url: 'https://example.com/', method: 'GET', body: '' } }),
    ).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(transport.requestSignals).toHaveLength(0);
    transport.requestImplementation = async () => {
      throw { code: 'limit_exceeded', message: 'The Host HTTP limit was exceeded.' };
    };
    await expect(client.request(request)).rejects.toEqual({
      code: 'limit_exceeded',
      message: 'The Host HTTP limit was exceeded.',
    });
    await client.dispose();
  });
  test('allows explicit 16-second SDK wait and cancels obsolete HTTP without late settlement', async () => {
    rs.useFakeTimers();
    const { client, transport } = await setup();
    const response = deferred<unknown>();
    transport.requestImplementation = () => response.promise;
    const signal = new FakeCancellationSignal();
    const pending = client.request(request, { signal, timeoutMs: 16000 });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await rs.advanceTimersByTimeAsync(10001);
    expect(transport.requestSignals[0]?.aborted).toBe(false);
    signal.abort();
    await rejected;
    expect(transport.requestSignals[0]?.aborted).toBe(true);
    response.resolve({ method: 'http.request', result: { status: 200, headers: [], body: 'late' } });
    await Promise.resolve();
    await client.dispose();
  });
  test('drops HTTP availability on full Context replacement', async () => {
    const { client, transport } = await setup();
    client.subscribe('runtime.context_changed', () => undefined);
    transport.emit('runtime.context_changed', { ...validRuntimeContext([]), hostApiVersion: '0.4.0' });
    await expect(client.request(request)).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(transport.requestSignals).toHaveLength(0);
    await client.dispose();
  });
});
