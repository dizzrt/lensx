import { createPluginSdk, PluginSdkError } from '@lensx/plugin-sdk';
import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';

import {
  createTranslationController,
  reversedLanguages,
  type Translate,
  type TranslationSnapshot,
} from './controller.js';
import type { TranslationResult } from './provider/index.js';
import { createSettingsController } from './settings.js';

const credentials = { accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk' };
const configuration = { version: 1, provider: 'volcengine', credentials, targetLanguage: 'zh' };
const cleanups: (() => Promise<void>)[] = [];
const setup = async (
  translate: Translate = async () => ({ translation: 'confirmed result' }),
  targetLanguage = 'zh',
) => {
  let stored: unknown = { ...configuration, targetLanguage };
  const transport = new FakePluginSdkTransport({
    connect: () => createPluginRuntimeContextFixture({ capabilities: ['storage.get', 'storage.set'] }),
    request: (request) => {
      if (request.method === 'storage.get') return { method: request.method, result: { found: true, value: stored } };
      if (request.method === 'storage.set' && 'value' in request.params) {
        stored = request.params.value;
        return { method: request.method, result: { stored: true } };
      }
      throw new Error('Unexpected storage method');
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
  await settings.load();
  return { controller, settings, transport };
};
const tick = (milliseconds = 400) => rs.advanceTimersByTimeAsync(milliseconds);
const writes = (transport: FakePluginSdkTransport) =>
  transport.observation.requests
    .filter((request) => request.method === 'storage.set')
    .map(({ method, params }) => ({ method, params }));

beforeEach(() => {
  rs.useFakeTimers();
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  rs.useRealTimers();
});

describe('confirmed language swaps', () => {
  test('publishes the reversed pair atomically and requests only the latest text after confirmation', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'confirmed result' });
    const { controller, settings, transport } = await setup(translate);
    controller.setSource('en');
    controller.input('original');
    await tick();
    const pending = createDeferred<unknown>();
    transport.setRequestHandler(() => pending.promise);
    const snapshots: TranslationSnapshot[] = [];
    const unsubscribe = controller.subscribe(() => snapshots.push(controller.getSnapshot()));

    const swap = controller.swapLanguages();
    expect(controller.getSnapshot()).toMatchObject({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      swappingLanguages: true,
    });
    await expect(controller.swapLanguages()).resolves.toBe(false);
    controller.setSource('fr');
    const latest = '  latest 中文 😀\ntext  ';
    controller.input(latest);
    await tick(800);
    expect(controller.getSnapshot()).toMatchObject({ text: latest, sourceLanguage: 'en', targetLanguage: 'zh' });
    expect(settings.getSnapshot().targetLanguage).toBe('zh');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(writes(transport)).toEqual([
      { method: 'storage.set', params: { key: 'settings.v1', value: { ...configuration, targetLanguage: 'en' } } },
    ]);

    pending.resolve({ method: 'storage.set', result: { stored: true } });
    await expect(swap).resolves.toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      text: latest,
      translation: '',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      swappingLanguages: false,
      status: 'debouncing',
    });
    expect(new Set(snapshots.map((state) => `${state.sourceLanguage}/${state.targetLanguage}`))).toEqual(
      new Set(['en/zh', 'zh/en']),
    );
    await tick(399);
    expect(translate).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1]?.[0]).toEqual({
      text: latest,
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      credentials,
    });
    await tick();
    expect(translate).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  test('retains the confirmed pair and result when persistence definitely fails', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'old result', requestId: 'old-result-id' });
    const { controller, settings, transport } = await setup(translate);
    controller.setSource('en');
    controller.input('unchanged source');
    await tick();
    transport.setRequestHandler(() => Promise.reject({ code: 'limit_exceeded', message: 'safe failure' }));

    await expect(controller.swapLanguages()).resolves.toBe(false);
    expect(settings.getSnapshot()).toMatchObject({ phase: 'ready', targetLanguage: 'zh', error: 'save' });
    expect(controller.getSnapshot()).toMatchObject({
      text: 'unchanged source',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      status: 'success',
      translation: 'old result',
      requestId: 'old-result-id',
      swappingLanguages: false,
    });
    await tick(1000);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(writes(transport)).toHaveLength(1);
  });

  test.each([
    true,
    false,
  ])('reconciles an ambiguous write using confirmed readback: committed=%s', async (committed) => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'old result' });
    const { controller, settings, transport } = await setup(translate);
    controller.setSource('en');
    controller.input('preserved text');
    await tick();
    transport.setRequestHandler((request) => {
      if (request.method === 'storage.set') throw new PluginSdkError('transport_failure');
      return {
        method: 'storage.get',
        result: { found: true, value: { ...configuration, targetLanguage: committed ? 'en' : 'zh' } },
      };
    });

    await expect(controller.swapLanguages()).resolves.toBe(committed);
    expect(transport.observation.requests.map((request) => request.method)).toEqual([
      'storage.get',
      'storage.set',
      'storage.get',
    ]);
    expect(settings.getSnapshot().targetLanguage).toBe(committed ? 'en' : 'zh');
    expect(controller.getSnapshot()).toMatchObject({
      text: 'preserved text',
      sourceLanguage: committed ? 'zh' : 'en',
      targetLanguage: committed ? 'en' : 'zh',
      swappingLanguages: false,
    });
    await tick(399);
    expect(translate).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(committed ? 2 : 1);
  });

  test('ignores a late successful save after the Runtime controller is disposed', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: 'result' });
    const { controller, transport } = await setup(translate);
    controller.setSource('en');
    controller.input('pending source');
    const pending = createDeferred<unknown>();
    transport.setRequestHandler(() => pending.promise);
    const changed = rs.fn();
    controller.subscribe(changed);
    const swap = controller.swapLanguages();
    controller.dispose();
    const disposed = controller.getSnapshot();
    const notifications = changed.mock.calls.length;
    pending.resolve({ method: 'storage.set', result: { stored: true } });

    await expect(swap).resolves.toBe(false);
    await tick(1000);
    expect(controller.getSnapshot()).toBe(disposed);
    expect(controller.getSnapshot()).toMatchObject({ status: 'disposed', text: '', swappingLanguages: false });
    expect(changed).toHaveBeenCalledTimes(notifications);
    expect(translate).not.toHaveBeenCalled();
  });

  test('uses only current successful detection for Auto and preserves the original source text', async () => {
    const translate = rs.fn<Translate>().mockResolvedValue({ translation: '译文', detectedLanguage: 'en' });
    const { controller, transport } = await setup(translate);
    expect(reversedLanguages(controller.getSnapshot())).toBeUndefined();
    await expect(controller.swapLanguages()).resolves.toBe(false);
    controller.input('original English');
    await tick(399);
    await expect(controller.swapLanguages()).resolves.toBe(false);
    await tick(1);
    expect(reversedLanguages(controller.getSnapshot())).toEqual({ sourceLanguage: 'zh', targetLanguage: 'en' });

    await expect(controller.swapLanguages()).resolves.toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      text: 'original English',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      translation: '',
    });
    expect(writes(transport)).toHaveLength(1);
    await tick();
    expect(translate.mock.calls[1]?.[0]).toMatchObject({
      text: 'original English',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
    });
  });

  test('invalidates previous detection immediately and ignores stale detection responses', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs
      .fn<Translate>()
      .mockResolvedValueOnce({ translation: 'first result', detectedLanguage: 'en' })
      .mockImplementationOnce(() => pending.promise);
    const { controller, transport } = await setup(translate);
    controller.input('first');
    await tick();
    expect(reversedLanguages(controller.getSnapshot())).toBeDefined();
    controller.input('second');
    expect(reversedLanguages(controller.getSnapshot())).toBeUndefined();
    await expect(controller.swapLanguages()).resolves.toBe(false);
    await tick();
    controller.input('newest');
    pending.resolve({ translation: 'stale result', detectedLanguage: 'fr' });
    await tick(0);
    expect(controller.getSnapshot()).toMatchObject({ text: 'newest', translation: '', status: 'debouncing' });
    expect(controller.getSnapshot().detectedLanguage).toBeUndefined();
    await expect(controller.swapLanguages()).resolves.toBe(false);
    expect(writes(transport)).toHaveLength(0);
  });

  test.each([
    undefined,
    'unknown-language',
    'bo',
    'zh',
  ])('does not reverse unavailable detection %s', async (detectedLanguage) => {
    const { controller, transport } = await setup(async () => ({ translation: 'result', detectedLanguage }));
    controller.input('source');
    await tick();
    expect(controller.getSnapshot().status).toBe('success');
    expect(reversedLanguages(controller.getSnapshot())).toBeUndefined();
    await expect(controller.swapLanguages()).resolves.toBe(false);
    expect(writes(transport)).toHaveLength(0);
  });

  test.each([
    'bo',
    'nan',
    'wuu',
    'yue',
    'cmn',
    'ug',
  ])('does not reverse the source-only language %s', async (source) => {
    const { controller, transport } = await setup();
    controller.setSource(source);
    expect(reversedLanguages(controller.getSnapshot())).toBeUndefined();
    await expect(controller.swapLanguages()).resolves.toBe(false);
    expect(writes(transport)).toHaveLength(0);
  });

  test('does not reverse a target-only language or an identical explicit pair', async () => {
    const { controller, settings, transport } = await setup(undefined, 'sk');
    controller.setSource('en');
    expect(reversedLanguages(controller.getSnapshot())).toBeUndefined();
    await expect(controller.swapLanguages()).resolves.toBe(false);
    expect(writes(transport)).toHaveLength(0);
    await settings.selectTarget('en');
    expect(reversedLanguages(controller.getSnapshot())).toBeUndefined();
    await expect(controller.swapLanguages()).resolves.toBe(false);
    expect(writes(transport)).toHaveLength(1);
  });

  test('does not start a swap while settings or composition own the input session', async () => {
    const { controller, transport } = await setup();
    controller.setSource('en');
    controller.setSettingsOpen(true);
    await expect(controller.swapLanguages()).resolves.toBe(false);
    controller.setSettingsOpen(false);
    const token = controller.compositionStart();
    controller.input('draft', { composing: true });
    await expect(controller.swapLanguages()).resolves.toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ text: 'draft', composing: true });
    expect(writes(transport)).toHaveLength(0);
    controller.compositionEnd('committed', token);
  });
});
