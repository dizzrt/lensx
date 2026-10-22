import { PluginSdkError } from '@lensx/plugin-sdk';
import { createDeferred } from '@lensx/plugin-testkit';
import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { createTranslationProvider, REQUEST_TIMEOUT_MS, RESPONSE_BYTE_LIMIT, type TranslationInput } from './index.js';
import { signTranslationRequest } from './signing.js';
import type { TranslationHttpResult, TranslationHttpTransport } from './transport.js';

const input: TranslationInput = {
  text: '  Hello 世界\n👋  ',
  sourceLanguage: 'auto',
  targetLanguage: 'zh',
  credentials: { accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk' },
};
const success = {
  TranslationList: [{ Translation: '<b>普通文本</b>\nsecond line', DetectedSourceLanguage: 'en' }],
  ResponseMetadata: { Error: null, RequestId: 'safe.id_1:2-3' },
};
const response = (body: string, status = 200): TranslationHttpResult => ({ status, headers: [], body });
const json = (value: unknown, status = 200) => response(JSON.stringify(value), status);
const invoke = (value: TranslationHttpResult, requestInput = input) =>
  createTranslationProvider({ request: async () => value })(requestInput, new AbortController().signal);
const codeOf = (code: string) => expect.objectContaining({ name: 'TranslationError', message: code, code });
afterEach(() => {
  rs.useRealTimers();
});

describe('plugin signing over public Host HTTP', () => {
  test('sends exactly the signed body and headers through one bounded public request', async () => {
    rs.useFakeTimers();
    const date = new Date('2026-10-22T01:02:03Z');
    const request = rs.fn<TranslationHttpTransport>(async () => json(success));
    const provider = createTranslationProvider({ now: () => date, request });
    expect(await provider(input, new AbortController().signal)).toEqual({
      translation: '<b>普通文本</b>\nsecond line',
      detectedLanguage: 'en',
      requestId: 'safe.id_1:2-3',
    });
    const signed = signTranslationRequest(input, date);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]).toEqual([
      {
        url: signed.url,
        method: 'POST',
        headers: Object.entries(signed.headers).map(([name, value]) => ({ name, value })),
        body: signed.body,
        timeoutMs: 15000,
      },
      expect.any(AbortSignal),
    ]);
    expect(JSON.parse(request.mock.calls[0][0].body ?? '')).toEqual({ TargetLanguage: 'zh', TextList: [input.text] });
  });
  test('manual source preserves exact text and failure signing never calls Host HTTP', async () => {
    const request = rs.fn<TranslationHttpTransport>(async () => json(success));
    await createTranslationProvider({ request })({ ...input, sourceLanguage: 'en' }, new AbortController().signal);
    expect(JSON.parse(request.mock.calls[0][0].body ?? '')).toEqual({
      TargetLanguage: 'zh',
      TextList: [input.text],
      SourceLanguage: 'en',
    });
    await expect(
      createTranslationProvider({
        request,
        sign: () => {
          throw new Error('private key');
        },
      })(input, new AbortController().signal),
    ).rejects.toEqual(codeOf('credentials'));
    expect(request).toHaveBeenCalledTimes(1);
  });
  test.each([
    [{ ...input, sourceLanguage: 'sk' }, 'direction'],
    [{ ...input, sourceLanguage: 'bo', targetLanguage: 'en' }, 'direction'],
    [{ ...input, targetLanguage: 'auto' }, 'direction'],
    [{ ...input, text: '  \n ' }, 'parameters'],
    [{ ...input, text: '👋'.repeat(5001) }, 'input-limit'],
    [{ ...input, credentials: { accessKeyId: '\nheader', secretAccessKey: 'secret' } }, 'credentials'],
  ] as const)('rejects invalid input before signing or transport %#', async (value, code) => {
    const request = rs.fn<TranslationHttpTransport>(async () => json(success));
    await expect(createTranslationProvider({ request })(value, new AbortController().signal)).rejects.toEqual(
      codeOf(code),
    );
    expect(request).not.toHaveBeenCalled();
  });
  test('sends all 5000 code points as one string without splitting', async () => {
    const request = rs.fn<TranslationHttpTransport>(async () => json(success));
    await createTranslationProvider({ request })({ ...input, text: '👋'.repeat(5000) }, new AbortController().signal);
    expect(JSON.parse(request.mock.calls[0][0].body ?? '').TextList).toEqual(['👋'.repeat(5000)]);
  });
});

describe('actual HTTP status and body validation', () => {
  test.each([
    { TranslationList: [] },
    { TranslationList: [{ Translation: 'one' }, { Translation: 'two' }] },
    { TranslationList: [{ Translation: 22 }] },
    { TranslationList: [{ Translation: { html: 'raw' } }] },
    { TranslationList: [{ Translation: 'ok', DetectedSourceLanguage: '<script>' }] },
    { TranslationList: [{ Translation: 'ok', DetectedSourceLanguage: 'auto' }] },
    { TranslationList: [{ Translation: 'ok' }], ResponseMetadata: { Error: {} } },
    { TranslationList: [{ Translation: 'ok' }], ResponseMetadata: { Error: 'raw' } },
    { TranslationList: [{ Translation: 'ok' }], ResponseMetadata: false },
    null,
    [],
    {},
  ])('rejects malformed success %#', async (value) => {
    await expect(invoke(json(value))).rejects.toEqual(codeOf('protocol'));
  });
  test('allows absent detection and ignores extra raw fields', async () => {
    expect(
      await invoke(json({ TranslationList: [{ Translation: 'ok', Message: 'secret' }], extra: '<script>' })),
    ).toEqual({ translation: 'ok' });
  });
  test.each([
    ['InvalidAccessKey', 100009, 'credentials'],
    ['InvalidCredential', 100025, 'credentials'],
    ['new-vendor-alias', 100009, 'credentials'],
    [undefined, 100009, 'credentials'],
    ['InvalidClientTokenId', undefined, 'credentials'],
    ['SignatureDoesNotMatch', undefined, 'credentials'],
    ['MissingAuthenticationToken', undefined, 'credentials'],
    ['InvalidTimestamp', undefined, 'clock'],
    ['SignatureExpired', undefined, 'clock'],
    ['LackPolicy', undefined, 'permission'],
    ['AccessDenied', undefined, 'permission'],
    ['FlowLimitExceeded', undefined, 'rate-limit'],
    ['QuotaExceeded', undefined, 'rate-limit'],
    ['-415', undefined, 'direction'],
    [-429, undefined, 'rate-limit'],
    [-500, undefined, 'service'],
    [-400, undefined, 'parameters'],
    ['InvalidActionOrVersion', undefined, 'parameters'],
    ['unknown', undefined, 'service'],
  ] as const)('classifies service error %s including CodeN independently of HTTP success', async (Code, CodeN, expected) => {
    for (const status of [200, 403]) {
      const value = {
        ResponseMetadata: {
          RequestId: 'safe-123',
          Error: {
            ...(Code === undefined ? {} : { Code }),
            ...(CodeN === undefined ? {} : { CodeN }),
            Message: 'Authorization private text',
          },
        },
        TranslationList: [{ Translation: 'must not display' }],
      };
      await expect(invoke(json(value, status))).rejects.toEqual(
        expect.objectContaining({ code: expected, requestId: 'safe-123', message: expected }),
      );
    }
  });
  test.each([
    '',
    '<script>',
    'x'.repeat(129),
    '含中文',
    'with space',
    'line\nbreak',
  ])('discards unsafe RequestId %j', async (RequestId) => {
    await expect(invoke(json({ ResponseMetadata: { RequestId, Error: { Code: '-415' } } }))).rejects.toEqual(
      expect.objectContaining({ code: 'direction', requestId: undefined }),
    );
  });
  test.each([
    [200, 'protocol'],
    [401, 'credentials'],
    [403, 'permission'],
    [429, 'rate-limit'],
    [503, 'service'],
    [302, 'service'],
  ] as const)('handles non JSON HTTP %i without showing body', async (status, code) => {
    await expect(invoke(response('<html>private failure</html>', status))).rejects.toEqual(codeOf(code));
  });
  test('accepts exactly 1MiB UTF8 JSON and rejects oversized or invalid Host result', async () => {
    const prefix = '{"TranslationList":[{"Translation":"';
    const suffix = '"}]}';
    const exact = prefix + 'a'.repeat(RESPONSE_BYTE_LIMIT - prefix.length - suffix.length) + suffix;
    await expect(invoke(response(exact))).resolves.toMatchObject({
      translation: 'a'.repeat(RESPONSE_BYTE_LIMIT - prefix.length - suffix.length),
    });
    await expect(invoke(response(`${exact} `))).rejects.toEqual(codeOf('protocol'));
    await expect(
      invoke(json({ TranslationList: [{ Translation: '中'.repeat(RESPONSE_BYTE_LIMIT / 2) }] })),
    ).rejects.toEqual(codeOf('protocol'));
    await expect(invoke({ status: 0, headers: [], body: '{}' })).rejects.toEqual(codeOf('protocol'));
  });
});

describe('Host errors cancellation and total deadline', () => {
  test.each([
    ['invalid_params', 'http-policy'],
    ['invalid_request', 'http-policy'],
    ['limit_exceeded', 'request-limit'],
    ['method_not_found', 'http-unavailable'],
    ['unavailable', 'network'],
    ['internal_error', 'network'],
    ['timeout', 'timeout'],
    ['cancelled', 'cancelled'],
  ] as const)('maps stable Host %s without raw diagnostics', async (code, expected) => {
    await expect(
      createTranslationProvider({
        request: async () => {
          throw { code, message: 'Safe Host error.' };
        },
      })(input, new AbortController().signal),
    ).rejects.toEqual(codeOf(expected));
  });
  test.each([
    'timeout',
    'cancelled',
    'disconnected',
    'disposed',
    'transport_failure',
  ] as const)('maps SDK lifecycle %s', async (code) => {
    await expect(
      createTranslationProvider({
        request: async () => {
          throw new PluginSdkError(code);
        },
      })(input, new AbortController().signal),
    ).rejects.toEqual(codeOf(code === 'timeout' || code === 'cancelled' ? code : 'http-unavailable'));
  });
  test('passes only the remaining deadline after signing', async () => {
    rs.useFakeTimers();
    const signing = createDeferred<ReturnType<typeof signTranslationRequest>>();
    const request = rs.fn<TranslationHttpTransport>(async () => json(success));
    const promise = createTranslationProvider({ request, sign: () => signing.promise })(
      input,
      new AbortController().signal,
    );
    await rs.advanceTimersByTimeAsync(700);
    signing.resolve(signTranslationRequest(input, new Date()));
    await promise;
    expect(request.mock.calls[0][0].timeoutMs).toBe(14300);
  });
  test.each([
    'sign',
    'request',
  ] as const)('total deadline bounds stalled %s and ignores its late result', async (stage) => {
    rs.useFakeTimers();
    const stalled = createDeferred<TranslationHttpResult>();
    const signing = createDeferred<ReturnType<typeof signTranslationRequest>>();
    const request = rs.fn<TranslationHttpTransport>(() => stalled.promise);
    const provider = createTranslationProvider({
      request,
      ...(stage === 'sign' ? { sign: () => signing.promise } : {}),
    });
    const promise = provider(input, new AbortController().signal);
    const assertion = expect(promise).rejects.toEqual(codeOf('timeout'));
    await rs.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
    if (stage === 'request') expect(request.mock.calls[0][1].aborted).toBe(true);
    else expect(request).not.toHaveBeenCalled();
    stalled.resolve(json(success));
    signing.resolve(signTranslationRequest(input, new Date()));
    await Promise.resolve();
  });
  test('cancels before or during transport even when it ignores AbortSignal', async () => {
    const request = rs.fn<TranslationHttpTransport>(() => new Promise(() => {}));
    const provider = createTranslationProvider({ request });
    const first = new AbortController();
    first.abort();
    await expect(provider(input, first.signal)).rejects.toEqual(codeOf('cancelled'));
    expect(request).not.toHaveBeenCalled();
    const current = new AbortController();
    const promise = provider(input, current.signal);
    await Promise.resolve();
    current.abort();
    await expect(promise).rejects.toEqual(codeOf('cancelled'));
    expect(request.mock.calls[0][1].aborted).toBe(true);
  });
  test('never exposes raw failures or automatically repeats a failed transport', async () => {
    const request = rs.fn<TranslationHttpTransport>(async () => {
      throw new Error('AK/SK or private body');
    });
    await expect(createTranslationProvider({ request })(input, new AbortController().signal)).rejects.toEqual(
      codeOf('network'),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
});
