import { createPluginSdk } from '@lensx/plugin-sdk';
import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { describe, expect, test } from '@rstest/core';
import { createTranslationProvider } from './index.js';
import { createSdkHttpTransport } from './transport.js';

const request = {
  url: 'https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01',
  method: 'POST' as const,
  headers: [{ name: 'Authorization', value: 'synthetic-signature' }],
  body: '{"TextList":["hello"]}',
  timeoutMs: 15000,
};
const setup = async (available = true) => {
  const fake = new FakePluginSdkTransport({
    connect: () =>
      createPluginRuntimeContextFixture({
        hostApiVersion: available ? '0.3.0' : '0.2.0',
        capabilities: available ? ['http.request'] : [],
      }),
    request: () => ({ method: 'http.request', result: { status: 200, headers: [], body: '{}' } }),
  });
  const client = createPluginSdk({ transport: fake });
  await client.initialize();
  return { fake, client, send: createSdkHttpTransport(client) };
};
describe('public SDK HTTP adapter', () => {
  test('forwards exact text/headers through real typed SDK and no native internals', async () => {
    const { fake, client, send } = await setup();
    expect(await send(request, new AbortController().signal)).toEqual({ status: 200, headers: [], body: '{}' });
    expect(fake.observation.requests[0]).toMatchObject({ method: 'http.request', params: request });
    await client.dispose();
  });
  test('rejects missing capability on an otherwise compatible older Host', async () => {
    const { fake, client, send } = await setup(false);
    await expect(send(request, new AbortController().signal)).rejects.toMatchObject({ code: 'http-unavailable' });
    expect(fake.observation.requests).toHaveLength(0);
    await client.dispose();
  });
  test('SDK cancellation and disconnect terminate the request without adopting late output', async () => {
    const { fake, client, send } = await setup();
    const late = createDeferred<unknown>();
    fake.setRequestHandler(() => late.promise);
    const abort = new AbortController();
    const pending = send(request, abort.signal);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    late.resolve({ method: 'http.request', result: { status: 200, headers: [], body: '{}' } });
    await client.dispose();
    await expect(send(request, new AbortController().signal)).rejects.toMatchObject({ code: 'http-unavailable' });
  });
  test('HTTP200 without CORS headers reaches plugin authentication classification', async () => {
    const { fake, client, send } = await setup();
    fake.setRequestHandler(() => ({
      method: 'http.request',
      result: {
        status: 200,
        headers: [],
        body: JSON.stringify({
          ResponseMetadata: { Error: { Code: 'InvalidAccessKey', CodeN: 100009, Message: 'raw must remain private' } },
        }),
      },
    }));
    const provider = createTranslationProvider({ request: send });
    await expect(
      provider(
        {
          text: 'hello',
          sourceLanguage: 'auto',
          targetLanguage: 'zh',
          credentials: { accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk' },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'credentials', message: 'credentials' });
    await client.dispose();
  });
});
