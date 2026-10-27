import { createPluginSdk } from '@lensx/plugin-sdk';
import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

import { createTranslationController, type Translate } from './controller.js';
import { TranslationError, type TranslationResult } from './provider/index.js';
import { createSettingsController } from './settings.js';

const credentials = { accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk' };
const configuration = { version: 1, provider: 'volcengine', credentials, targetLanguage: 'zh' };
const context = createPluginRuntimeContextFixture({ capabilities: ['storage.get', 'storage.set'], locale: 'en-US' });
const cleanups: (() => Promise<void>)[] = [];
const setup = async (
  translate: Translate = async () => ({ translation: 'result' }),
  value: unknown = configuration,
) => {
  let stored = value;
  const transport = new FakePluginSdkTransport({
    connect: () => context,
    request: (request) => {
      if (request.method === 'storage.get') return { method: request.method, result: { found: true, value: stored } };
      if (request.method === 'storage.set' && 'value' in request.params) {
        stored = request.params.value;
        return { method: request.method, result: { stored: true } };
      }
      throw new Error('unexpected method');
    },
  });
  const client = createPluginSdk({ transport });
  await client.initialize();
  const settings = createSettingsController({ client, initialLocale: 'en-US' });
  const controller = createTranslationController({ settings, translate });
  cleanups.push(async () => {
    controller.dispose();
    settings.dispose();
    await client.dispose();
  });
  return { controller, settings, client, transport };
};
const tick = async (ms = 400) => {
  await rs.advanceTimersByTimeAsync(ms);
};
const flush = async () => {
  for (let n = 0; n < 8; n += 1) await Promise.resolve();
};

beforeEach(() => {
  rs.useFakeTimers();
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  rs.useRealTimers();
});

describe('translation scheduling and request identity', () => {
  it('waits for confirmed storage and requests only the latest edited text', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'fresh' });
    const { controller, settings } = await setup(translate);
    controller.input('old');
    await tick(1000);
    expect(translate).not.toHaveBeenCalled();
    controller.input('latest');
    await settings.load();
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]?.[0]).toEqual({
      text: 'latest',
      sourceLanguage: 'auto',
      targetLanguage: 'zh',
      credentials,
    });
    expect(controller.getSnapshot()).toMatchObject({ text: 'latest', translation: 'fresh', status: 'success' });
  });

  it('debounces effective edits, preserves input bytes, and ignores duplicate notifications', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'fresh' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('a');
    await tick(250);
    controller.input('ab');
    await tick(250);
    controller.input('  行\nline  ');
    await tick(200);
    controller.input('  行\nline  ');
    await tick(199);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate.mock.calls[0]?.[0].text).toBe('  行\nline  ');
    controller.input('  行\nline  ');
    await tick(1000);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it.each(['', '  \n\t', ' '.repeat(6000)])('treats whitespace before length limits %#', async (text) => {
    const translate = rs.fn<Translate>();
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input(text);
    await tick(1000);
    expect(controller.getSnapshot()).toMatchObject({ text, translation: '', status: 'empty' });
    expect(translate).not.toHaveBeenCalled();
  });

  it.each([
    'a'.repeat(5000),
    '😀'.repeat(5000),
    'e\u0301'.repeat(2500),
  ])('sends exactly 5000 code points unsplit %#', async (text) => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'ok' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input(text);
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]?.[0].text).toBe(text);
  });

  it.each([
    'a'.repeat(5001),
    '😀'.repeat(5001),
    `${'e\u0301'.repeat(2500)}x`,
  ])('blocks 5001 code points without modifying input and resumes after correction %#', async (text) => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'ok' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input(text);
    await tick();
    expect(controller.getSnapshot()).toMatchObject({ text, status: 'input-limit', translation: '' });
    expect(translate).not.toHaveBeenCalled();
    controller.input('corrected');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('cancels prior work at composition start and schedules only the final committed value', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'ok' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('old');
    await tick(200);
    const token = controller.compositionStart();
    controller.input('ni');
    await tick(1000);
    controller.input('你');
    await tick(1000);
    expect(translate).not.toHaveBeenCalled();
    controller.compositionEnd('你好', token);
    controller.input('你好');
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]?.[0].text).toBe('你好');
  });

  it('retires composition on clear and disposal so late end cannot resurrect text', async () => {
    const translate = rs.fn<Translate>();
    const { controller, settings } = await setup(translate);
    await settings.load();
    const token = controller.compositionStart();
    controller.input('draft');
    controller.input('');
    controller.compositionEnd('late', token);
    await tick(1000);
    expect(controller.getSnapshot().text).toBe('');
    expect(translate).not.toHaveBeenCalled();
    const emptyToken = controller.compositionStart();
    controller.input('');
    controller.compositionEnd('late empty composition', emptyToken);
    await tick(1000);
    expect(controller.getSnapshot().text).toBe('');
    expect(translate).not.toHaveBeenCalled();
    const nextToken = controller.compositionStart();
    controller.input('new');
    controller.dispose();
    controller.compositionEnd('late again', nextToken);
    await tick(1000);
    expect(controller.getSnapshot()).toMatchObject({ text: '', translation: '', status: 'disposed' });
    expect(translate).not.toHaveBeenCalled();
  });

  it('keeps empty composition drafts in the same session until they are committed', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'ok' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    const token = controller.compositionStart();
    controller.input('', { composing: true });
    controller.input('n', { composing: true });
    controller.input('', { composing: true });
    expect(controller.getSnapshot()).toMatchObject({ text: '', composing: true });
    controller.input('你', { composing: true });
    await tick(1000);
    expect(translate).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ text: '你', composing: true });
    controller.compositionEnd('你', token);
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]?.[0].text).toBe('你');
  });

  it.each([
    'success',
    'failure',
  ] as const)('rejects stale %s despite ineffective abort and leaves latest loading state alone', async (outcome) => {
    const first = createDeferred<TranslationResult>();
    const second = createDeferred<TranslationResult>();
    const translate = rs.fn<Translate>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('a');
    await tick();
    controller.input('b');
    await tick();
    expect(translate.mock.calls[0]?.[1].aborted).toBe(true);
    if (outcome === 'success') first.resolve({ translation: 'stale' });
    else first.reject(new TranslationError('service'));
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ text: 'b', translation: '', status: 'translating' });
    second.resolve({ translation: 'fresh' });
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ text: 'b', translation: 'fresh', status: 'success' });
  });

  it('does not allow old deadline/finalization to clear a newer request or result', async () => {
    const first = createDeferred<TranslationResult>();
    const second = createDeferred<TranslationResult>();
    const translate = rs.fn<Translate>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('a');
    await tick();
    await tick(1000);
    controller.input('b');
    await tick();
    await tick(13_700);
    first.reject(new TranslationError('timeout'));
    await flush();
    expect(controller.getSnapshot().status).toBe('translating');
    second.resolve({ translation: 'current' });
    await flush();
    await tick(20_000);
    expect(controller.getSnapshot()).toMatchObject({ translation: 'current', status: 'success' });
  });

  it('clearing immediately invalidates output and late request completion', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs.fn<Translate>().mockReturnValue(pending.promise);
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('a');
    await tick();
    controller.input('');
    pending.resolve({ translation: 'late' });
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ status: 'empty', text: '', translation: '' });
    expect(translate.mock.calls[0]?.[1].aborted).toBe(true);
  });

  it('revises identity for source, confirmed target, and changed credentials without premature requests', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'ok' });
    const { controller, settings, transport } = await setup(translate);
    await settings.load();
    controller.input('hello');
    await tick();
    controller.setSource('en');
    expect(controller.getSnapshot().translation).toBe('');
    await tick();
    const pending = createDeferred<unknown>();
    transport.setRequestHandler(() => pending.promise);
    const save = settings.selectTarget('fr');
    await tick(1000);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().targetLanguage).toBe('zh');
    controller.input('new input');
    pending.resolve({ method: 'storage.set', result: { stored: true } });
    await save;
    await tick();
    expect(translate.mock.calls[2]?.[0]).toMatchObject({
      text: 'new input',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
    });
    transport.setRequestHandler(() => ({ method: 'storage.set', result: { stored: true } }));
    await settings.saveCredentials({ accessKeyId: 'new-ak', secretAccessKey: 'new-sk' });
    expect(controller.getSnapshot().translation).toBe('');
    await tick();
    expect(translate.mock.calls[3]?.[0].credentials).toEqual({ accessKeyId: 'new-ak', secretAccessKey: 'new-sk' });
  });

  it('preserves successful output across unchanged saves and same derived target persistence', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'keep' });
    const { controller, settings } = await setup(translate, { version: 1, provider: 'volcengine', credentials });
    await settings.load();
    controller.input('hello');
    await tick();
    await settings.saveCredentials(credentials);
    await tick(1000);
    await settings.selectTarget('en');
    await tick(1000);
    expect(controller.getSnapshot()).toMatchObject({ translation: 'keep', status: 'success' });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes cancelled pending work using current input when settings closes', async () => {
    const stale = createDeferred<TranslationResult>();
    const translate = rs.fn<Translate>().mockReturnValueOnce(stale.promise).mockResolvedValue({ translation: 'new' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('old');
    await tick();
    controller.setSettingsOpen(true);
    controller.input('current');
    await tick(1000);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]?.[1].aborted).toBe(true);
    stale.resolve({ translation: 'stale' });
    await flush();
    expect(controller.getSnapshot().translation).toBe('');
    controller.setSettingsOpen(false);
    await tick();
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1]?.[0].text).toBe('current');
  });

  it('keeps a valid success when opening/cancelling or saving unchanged settings', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'keep' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('hello');
    await tick();
    controller.setSettingsOpen(true);
    await tick(1000);
    expect(controller.getSnapshot().translation).toBe('keep');
    await settings.saveCredentials(credentials);
    controller.setSettingsOpen(false);
    await tick(1000);
    expect(controller.getSnapshot()).toMatchObject({ translation: 'keep', status: 'success' });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('does not retry failed input on presentation/settings pause changes and coalesces explicit retry', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs
      .fn<Translate>()
      .mockRejectedValueOnce(new TranslationError('rate-limit'))
      .mockReturnValueOnce(pending.promise);
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('hello');
    await tick();
    await tick(30_000);
    controller.setSettingsOpen(true);
    controller.setSettingsOpen(false);
    await tick(1000);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().error?.code).toBe('rate-limit');
    controller.retry();
    controller.retry();
    controller.retry();
    await flush();
    expect(translate).toHaveBeenCalledTimes(2);
    pending.resolve({ translation: 'retried' });
    await flush();
    expect(controller.getSnapshot().translation).toBe('retried');
  });

  it('enforces the total deadline even when the provider ignores cancellation', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs.fn<Translate>().mockReturnValue(pending.promise);
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('hello');
    await tick();
    await tick(14_999);
    expect(controller.getSnapshot().status).toBe('translating');
    await tick(1);
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', error: { code: 'timeout' } });
    expect(translate.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve({ translation: 'too late' });
    await flush();
    expect(controller.getSnapshot().translation).toBe('');
    expect(controller.getSnapshot().status).toBe('error');
  });

  it('blocks unsupported manual direction without silently changing target; auto remains service-resolved', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'ok' });
    const { controller, settings } = await setup(translate);
    await settings.load();
    await settings.selectTarget('en');
    controller.setSource('bo');
    controller.input('text');
    await tick();
    expect(controller.getSnapshot()).toMatchObject({ sourceLanguage: 'bo', targetLanguage: 'en', status: 'direction' });
    expect(translate).not.toHaveBeenCalled();
    controller.setSource('sk');
    expect(controller.getSnapshot().sourceLanguage).toBe('bo');
    controller.setSource('auto');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('does not change request identity on locale/theme events or visibility hide/restore', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'keep' });
    const { controller, settings, client, transport } = await setup(translate);
    const unsubscribe = client.subscribe('runtime.context_changed', () => {});
    await settings.load();
    controller.input('hello');
    await tick();
    transport.emit('runtime.context_changed', { ...context, locale: 'zh-CN', theme: 'dark' });
    // There is deliberately no visibility event subscription: hiding is not disposal.
    globalThis.document?.dispatchEvent(new Event('visibilitychange'));
    await tick(1000);
    expect(controller.getSnapshot()).toMatchObject({
      text: 'hello',
      translation: 'keep',
      targetLanguage: 'zh',
      sourceLanguage: 'auto',
    });
    expect(translate).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('disposes all local work and a new attempt starts empty with Auto source', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs.fn<Translate>().mockReturnValue(pending.promise);
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.setSource('en');
    controller.input('secret text');
    await tick();
    controller.dispose();
    controller.dispose();
    pending.resolve({ translation: 'late secret' });
    await flush();
    await tick(30_000);
    expect(controller.getSnapshot()).toEqual({
      text: '',
      translation: '',
      sourceLanguage: 'auto',
      status: 'disposed',
      settingsOpen: false,
      composing: false,
      swappingLanguages: false,
    });
    const next = createTranslationController({ settings, translate });
    expect(next.getSnapshot()).toMatchObject({ text: '', translation: '', sourceLanguage: 'auto', status: 'empty' });
    expect(translate).toHaveBeenCalledTimes(1);
    next.dispose();
  });

  it('prevents dispatch after disposal between timer and provider microtask', async () => {
    const translate = rs.fn<Translate>();
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('hello');
    rs.advanceTimersByTime(400);
    controller.dispose();
    await flush();
    expect(translate).not.toHaveBeenCalled();
  });

  it('uses only safe provider codes and never exposes raw thrown values', async () => {
    const translate = rs.fn<Translate>().mockRejectedValue(new Error('secret key / payload'));
    const { controller, settings } = await setup(translate);
    await settings.load();
    controller.input('hello');
    await tick();
    expect(controller.getSnapshot().error).toEqual({ code: 'network' });
  });
});
