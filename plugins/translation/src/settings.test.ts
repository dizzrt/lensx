import { createPluginSdk, PluginSdkError } from '@lensx/plugin-sdk';
import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { describe, expect, it } from '@rstest/core';

import { createSettingsController, normalizeCredentials, parseSettings, SETTINGS_KEY } from './settings.js';

const credentials = { accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk' };
const saved = { version: 1 as const, provider: 'volcengine' as const, credentials, targetLanguage: 'en' };
const context = createPluginRuntimeContextFixture({ capabilities: ['storage.get', 'storage.set'] });
const setup = async (value: unknown = saved, locale: 'en-US' | 'zh-CN' = 'en-US') => {
  let stored = value;
  const transport = new FakePluginSdkTransport({
    connect: () => ({ ...context, locale }),
    request: (request) => {
      if (request.method === 'storage.get')
        return {
          method: request.method,
          result: stored === undefined ? { found: false } : { found: true, value: stored },
        };
      if (request.method === 'storage.set' && 'value' in request.params) {
        stored = request.params.value;
        return { method: request.method, result: { stored: true } };
      }
      throw new Error('unexpected method');
    },
  });
  const client = createPluginSdk({ transport });
  await client.initialize();
  const settings = createSettingsController({ client, initialLocale: locale });
  return { client, settings, transport, stored: () => stored };
};

describe('confirmed settings through the real SDK', () => {
  it.each([
    'en-US',
    'zh-CN',
  ] as const)('derives %s only after confirmed missing read without writing defaults', async (locale) => {
    const fixture = await setup(undefined, locale);
    // Explicit undefined uses setup default; force a real missing result.
    fixture.transport.setRequestHandler(() => ({ method: 'storage.get', result: { found: false } }));
    expect(fixture.settings.getSnapshot().phase).toBe('loading');
    expect(fixture.settings.getSnapshot().targetLanguage).toBeUndefined();
    await fixture.settings.load();
    expect(fixture.settings.getSnapshot()).toMatchObject({
      phase: 'ready',
      targetLanguage: locale === 'en-US' ? 'en' : 'zh',
      confirmed: { version: 1, provider: 'volcengine' },
    });
    expect(fixture.transport.observation.requests).toHaveLength(1);
    expect(fixture.settings.getSnapshot().confirmed?.targetLanguage).toBeUndefined();
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('uses the first locale despite later Context updates and delayed storage', async () => {
    const fixture = await setup(saved, 'zh-CN');
    const pending = createDeferred<unknown>();
    fixture.transport.setRequestHandler(() => pending.promise);
    const load = fixture.settings.load();
    const unsubscribe = fixture.client.subscribe('runtime.context_changed', () => {});
    fixture.transport.emit('runtime.context_changed', { ...context, locale: 'en-US' });
    pending.resolve({ method: 'storage.get', result: { found: false } });
    await load;
    expect(fixture.client.context?.locale).toBe('en-US');
    expect(fixture.settings.getSnapshot().targetLanguage).toBe('zh');
    unsubscribe();
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it.each([
    { version: 2, provider: 'volcengine' },
    { version: 1, provider: 'other' },
    { version: 1, provider: 'volcengine', credentials: { accessKeyId: 'only' } },
    { ...saved, credentials: { accessKeyId: 'a\nb', secretAccessKey: 'safe' } },
    { ...saved, extra: 'unknown' },
    { ...saved, targetLanguage: null },
    null,
  ])('preserves invalid records and blocks writes %#', async (value) => {
    const fixture = await setup(value);
    await fixture.settings.load();
    expect(fixture.settings.getSnapshot().phase).toBe('invalid');
    expect(await fixture.settings.saveCredentials(credentials)).toBe(false);
    expect(await fixture.settings.selectTarget('en')).toBe(false);
    expect(fixture.stored()).toEqual(value);
    expect(fixture.transport.observation.requests).toHaveLength(1);
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('repairs only an invalid target without replacing validated credentials', async () => {
    const fixture = await setup({ ...saved, targetLanguage: 'retired' }, 'zh-CN');
    await fixture.settings.load();
    expect(fixture.settings.getSnapshot()).toMatchObject({ phase: 'invalid-target', confirmed: { credentials } });
    expect(fixture.settings.getSnapshot().targetLanguage).toBeUndefined();
    expect(await fixture.settings.saveCredentials({ accessKeyId: 'new', secretAccessKey: 'new' })).toBe(false);
    expect(await fixture.settings.selectTarget('zh')).toBe(true);
    expect(fixture.stored()).toEqual({ ...saved, targetLanguage: 'zh' });
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('keeps invalid-target state and disk unchanged after definite repair failure', async () => {
    const fixture = await setup({ ...saved, targetLanguage: 'retired' });
    await fixture.settings.load();
    fixture.transport.setRequestHandler(() => Promise.reject({ code: 'limit_exceeded', message: 'safe' }));
    expect(await fixture.settings.selectTarget('zh')).toBe(false);
    expect(fixture.settings.getSnapshot()).toMatchObject({ phase: 'invalid-target', error: 'save' });
    expect(fixture.settings.getSnapshot().targetLanguage).toBeUndefined();
    expect(fixture.stored()).toEqual({ ...saved, targetLanguage: 'retired' });
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('distinguishes read failure from missing and recovers by explicit reread', async () => {
    const fixture = await setup();
    fixture.transport.setRequestHandler(() => Promise.reject(new PluginSdkError('transport_failure')));
    await fixture.settings.load();
    expect(fixture.settings.getSnapshot().phase).toBe('read-error');
    expect(await fixture.settings.selectTarget('zh')).toBe(false);
    expect(await fixture.settings.saveCredentials(credentials)).toBe(false);
    fixture.transport.setRequestHandler(() => ({ method: 'storage.get', result: { found: true, value: saved } }));
    await fixture.settings.load();
    expect(fixture.settings.getSnapshot()).toMatchObject({ phase: 'ready', targetLanguage: 'en' });
    expect(fixture.transport.observation.requests.every((request) => request.method === 'storage.get')).toBe(true);
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('reports an unavailable Host storage capability without issuing or overwriting a record', async () => {
    const transport = new FakePluginSdkTransport({ connect: () => ({ ...context, capabilities: [] }) });
    const client = createPluginSdk({ transport });
    await client.initialize();
    const settings = createSettingsController({ client, initialLocale: 'en-US' });
    await settings.load();
    expect(settings.getSnapshot()).toMatchObject({ phase: 'read-error', error: 'unavailable' });
    expect(transport.observation.requests).toHaveLength(0);
    settings.dispose();
    await client.dispose();
  });

  it('serializes submissions, confirms only after reply and preserves fields across target and credential changes', async () => {
    const fixture = await setup();
    await fixture.settings.load();
    const pending = createDeferred<unknown>();
    fixture.transport.setRequestHandler(() => pending.promise);
    const write = fixture.settings.selectTarget('zh');
    expect(fixture.settings.getSnapshot()).toMatchObject({ phase: 'saving', targetLanguage: 'en' });
    expect(await fixture.settings.saveCredentials({ accessKeyId: 'changed', secretAccessKey: 'changed' })).toBe(false);
    expect(await fixture.settings.selectTarget('fr')).toBe(false);
    expect(fixture.transport.observation.requests.at(-1)?.params).toEqual({
      key: SETTINGS_KEY,
      value: { ...saved, targetLanguage: 'zh' },
    });
    pending.resolve({ method: 'storage.set', result: { stored: true } });
    await write;
    expect(fixture.settings.getSnapshot().targetLanguage).toBe('zh');
    fixture.transport.setRequestHandler(() => ({ method: 'storage.set', result: { stored: true } }));
    await fixture.settings.saveCredentials({ accessKeyId: ' new-ak ', secretAccessKey: ' new-sk ' });
    expect(fixture.transport.observation.requests.at(-1)?.params).toEqual({
      key: SETTINGS_KEY,
      value: { ...saved, targetLanguage: 'zh', credentials: { accessKeyId: 'new-ak', secretAccessKey: 'new-sk' } },
    });
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('retains confirmed state after a definite rejection without using the draft', async () => {
    const fixture = await setup();
    await fixture.settings.load();
    const previous = fixture.settings.getSnapshot();
    fixture.transport.setRequestHandler(() => Promise.reject({ code: 'limit_exceeded', message: 'safe' }));
    expect(await fixture.settings.saveCredentials({ accessKeyId: 'changed', secretAccessKey: 'changed' })).toBe(false);
    expect(fixture.settings.getSnapshot()).toEqual({ ...previous, error: 'save' });
    expect(fixture.transport.observation.requests).toHaveLength(2);
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it.each([
    'timeout',
    'cancelled',
    'transport_failure',
  ] as const)('reconciles an ambiguous %s using readback, without another write', async (code) => {
    const fixture = await setup();
    await fixture.settings.load();
    let disk: unknown = saved;
    fixture.transport.setRequestHandler((request) => {
      if (request.method === 'storage.set' && 'value' in request.params) {
        disk = request.params.value;
        throw new PluginSdkError(code);
      }
      return { method: 'storage.get', result: { found: true, value: disk } };
    });
    expect(await fixture.settings.selectTarget('zh')).toBe(true);
    expect(fixture.settings.getSnapshot()).toMatchObject({ phase: 'ready', targetLanguage: 'zh' });
    expect(fixture.transport.observation.requests.map(({ method }) => method)).toEqual([
      'storage.get',
      'storage.set',
      'storage.get',
    ]);
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('adopts actual disk contents after ambiguous failure without claiming the draft saved', async () => {
    const fixture = await setup();
    await fixture.settings.load();
    fixture.transport.setRequestHandler((request) => {
      if (request.method === 'storage.set') throw new PluginSdkError('transport_failure');
      return { method: 'storage.get', result: { found: true, value: { ...saved, targetLanguage: 'fr' } } };
    });
    expect(await fixture.settings.selectTarget('zh')).toBe(false);
    expect(fixture.settings.getSnapshot()).toMatchObject({ phase: 'ready', error: 'save', targetLanguage: 'fr' });
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('remains blocked when an ambiguous save cannot be read back', async () => {
    const fixture = await setup();
    await fixture.settings.load();
    fixture.transport.setRequestHandler(() => Promise.reject(new PluginSdkError('transport_failure')));
    expect(await fixture.settings.selectTarget('zh')).toBe(false);
    expect(fixture.settings.getSnapshot().phase).toBe('read-error');
    expect(await fixture.settings.selectTarget('fr')).toBe(false);
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('does not advance semantic revision for unchanged settings or persisting a derived target', async () => {
    const fixture = await setup({ version: 1, provider: 'volcengine', credentials });
    await fixture.settings.load();
    const revision = fixture.settings.getSnapshot().revision;
    await fixture.settings.saveCredentials(credentials);
    expect(fixture.settings.getSnapshot().revision).toBe(revision);
    await fixture.settings.selectTarget('en');
    expect(fixture.settings.getSnapshot().revision).toBe(revision);
    await fixture.settings.selectTarget('zh');
    expect(fixture.settings.getSnapshot().revision).toBe(revision + 1);
    fixture.settings.dispose();
    await fixture.client.dispose();
  });

  it('restores the same persisted configuration in a new attempt without persisting text', async () => {
    const fixture = await setup();
    await fixture.settings.load();
    await fixture.settings.selectTarget('zh');
    fixture.settings.dispose();
    const next = createSettingsController({ client: fixture.client, initialLocale: 'en-US' });
    await next.load();
    expect(next.getSnapshot()).toMatchObject({ targetLanguage: 'zh', confirmed: { credentials } });
    expect(
      fixture.transport.observation.requests.every(({ params }) => (params as { key: string }).key === SETTINGS_KEY),
    ).toBe(true);
    next.dispose();
    await fixture.client.dispose();
  });

  it('invalidates pending reads and writes, aborts signals, and releases secrets at disposal', async () => {
    const fixture = await setup();
    await fixture.settings.load();
    const pending = createDeferred<unknown>();
    fixture.transport.setRequestHandler(() => pending.promise);
    const write = fixture.settings.selectTarget('zh');
    fixture.settings.dispose();
    fixture.settings.dispose();
    pending.resolve({ method: 'storage.set', result: { stored: true } });
    expect(await write).toBe(false);
    expect(fixture.settings.getSnapshot().confirmed).toBeUndefined();
    expect(fixture.transport.observation.requests.at(-1)?.signal.aborted).toBe(true);
    await fixture.client.dispose();
  });

  it('drops pending read results on SDK disconnect', async () => {
    const fixture = await setup();
    const pending = createDeferred<unknown>();
    fixture.transport.setRequestHandler(() => pending.promise);
    const load = fixture.settings.load();
    fixture.transport.disconnect();
    pending.resolve({ method: 'storage.get', result: { found: true, value: saved } });
    await load;
    expect(fixture.settings.getSnapshot().confirmed).toBeUndefined();
    await fixture.client.dispose();
  });

  it('invalidates a pending read when Context removes storage and recovers only by explicit reread', async () => {
    const fixture = await setup();
    const pending = createDeferred<unknown>();
    fixture.transport.setRequestHandler(() => pending.promise);
    const load = fixture.settings.load();
    fixture.transport.emit('runtime.context_changed', { ...context, capabilities: [] });
    pending.resolve({ method: 'storage.get', result: { found: true, value: saved } });
    await load;
    expect(fixture.settings.getSnapshot()).toMatchObject({ phase: 'read-error', error: 'unavailable' });
    expect(fixture.settings.getSnapshot().confirmed).toBeUndefined();
    fixture.transport.emit('runtime.context_changed', context);
    expect(fixture.settings.getSnapshot().phase).toBe('read-error');
    fixture.transport.setRequestHandler(() => ({ method: 'storage.get', result: { found: true, value: saved } }));
    await fixture.settings.load();
    expect(fixture.settings.getSnapshot().phase).toBe('ready');
    fixture.settings.dispose();
    expect(fixture.transport.observation.subscriptions.every(({ active }) => !active)).toBe(true);
    await fixture.client.dispose();
  });
});

describe('credential and stored schema validation', () => {
  it('trims only outside form input and rejects incomplete or control/whitespace-containing keys', () => {
    expect(normalizeCredentials({ accessKeyId: ' ak-123 ', secretAccessKey: ' sk_+=/ ' })).toEqual({
      accessKeyId: 'ak-123',
      secretAccessKey: 'sk_+=/',
    });
    for (const secretAccessKey of ['', '  ', 'secret key', 'secret\nkey', '\u0000secret']) {
      expect(normalizeCredentials({ accessKeyId: 'ak', secretAccessKey })).toBeUndefined();
    }
    expect(parseSettings(saved)).toEqual(saved);
    expect(Object.isFrozen(parseSettings(saved)?.credentials)).toBe(true);
  });
});
