import { createDeferred, createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../src/App.js';
import { messagesFor } from '../src/catalog.js';
import { TranslationError, type TranslationInput, type TranslationResult } from '../src/provider/index.js';

const credentials = { accessKeyId: 'fixture-ak', secretAccessKey: 'fixture-sk' };
const saved = { version: 1, provider: 'volcengine', credentials };
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
};
const tick = async (ms = 400) => {
  await act(async () => {
    await rs.advanceTimersByTimeAsync(ms);
  });
};
afterEach(() => {
  cleanup();
  rs.useRealTimers();
});
const setup = async ({
  locale = 'en-US',
  theme = 'light',
  value = saved,
  translate = rs.fn(
    async (_input: TranslationInput): Promise<TranslationResult> => ({ translation: '<b>译文</b>\nnext' }),
  ),
}: {
  locale?: 'en-US' | 'zh-CN';
  theme?: 'light' | 'dark';
  value?: unknown;
  translate?: ReturnType<typeof rs.fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>>;
} = {}) => {
  rs.useFakeTimers();
  let stored: unknown = value;
  const context = createPluginRuntimeContextFixture({
    locale,
    theme,
    capabilities: ['http.request', 'storage.get', 'storage.set'],
  });
  const fake = new FakePluginSdkTransport({
    connect: () => context,
    request: (request) => {
      if (request.method === 'storage.get')
        return { method: 'storage.get', result: stored === null ? { found: false } : { found: true, value: stored } };
      if (request.method === 'storage.set' && 'value' in request.params) {
        stored = request.params.value;
        return { method: 'storage.set', result: { stored: true } };
      }
      throw new Error('unexpected request');
    },
  });
  const result = render(<App createTransport={() => fake} translate={translate} />);
  await flush();
  return { ...result, fake, translate, context, stored: () => stored, messages: messagesFor(locale) };
};
const edit = (text: string, label = 'Source text') =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const choose = (label: string, option: string) => {
  const selector = screen.getByRole('combobox', { name: label });
  fireEvent.click(selector);
  const list = screen.getByRole('listbox');
  const item = within(list)
    .getAllByRole('option')
    .find((element) => element.textContent === option);
  if (!item) throw new Error(`Missing option ${option}`);
  fireEvent.click(item);
};

describe('Translation real Semi workspace', () => {
  test.each([
    ['en-US', 'light'],
    ['en-US', 'dark'],
    ['zh-CN', 'light'],
    ['zh-CN', 'dark'],
  ] as const)('provides localized multiline plain text and theme in %s/%s', async (locale, theme) => {
    const { translate, messages } = await setup({ locale, theme });
    const source = screen.getByLabelText(messages.sourceText);
    const output = screen.getByLabelText(messages.translatedText);
    expect(source.tagName).toBe('TEXTAREA');
    expect(output).toHaveAttribute('readonly');
    expect(output).not.toBeDisabled();
    expect(source.closest('section')).toHaveAttribute('data-layout', 'vertical');
    expect(document.documentElement.lang).toBe(locale);
    expect(document.body.getAttribute('theme-mode')).toBe(theme === 'dark' ? 'dark' : null);
    edit('  hello\nworld  ', messages.sourceText);
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).toMatchObject({
      text: '  hello\nworld  ',
      sourceLanguage: 'auto',
      targetLanguage: locale === 'zh-CN' ? 'zh' : 'en',
    });
    expect(output).toHaveValue('<b>译文</b>\nnext');
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(messages.success);
    (output as HTMLTextAreaElement).focus();
    (output as HTMLTextAreaElement).setSelectionRange(0, 4);
    expect((output as HTMLTextAreaElement).selectionEnd).toBe(4);
    expect(fireEvent.keyDown(output, { key: 'c', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(source, { key: 'v', metaKey: true })).toBe(true);
  });

  test('debounces continuous edits and preserves current result through duplicate events and Context changes', async () => {
    const { fake, context, translate } = await setup();
    edit('a');
    await tick(200);
    edit('ab');
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    edit('ab');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    act(() => fake.emit('runtime.context_changed', { ...context, locale: 'zh-CN', theme: 'dark' }));
    await flush();
    await tick();
    expect(screen.getByLabelText('原文')).toHaveValue('ab');
    expect(screen.getByLabelText('译文')).toHaveValue('<b>译文</b>\nnext');
    expect(screen.getByRole('combobox', { name: '目标语言' })).toHaveTextContent('英语');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(0);
  });

  test('does not translate IME drafts and schedules one final value without confirmation-key work', async () => {
    const { translate } = await setup();
    const source = screen.getByLabelText('Source text');
    fireEvent.compositionStart(source);
    edit('中');
    await tick(600);
    edit('中文');
    await tick(600);
    expect(translate).not.toHaveBeenCalled();
    fireEvent.compositionEnd(source, { data: '中文' });
    fireEvent.change(source, { target: { value: '中文' } });
    expect(fireEvent.keyDown(source, { key: 'Enter', keyCode: 229, isComposing: true })).toBe(true);
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].text).toBe('中文');
  });

  test.each([
    '',
    '   ',
  ])('retires cleared composition and ignores late end and trailing change (%j)', async (cleared) => {
    const { translate } = await setup();
    const source = screen.getByLabelText('Source text') as HTMLTextAreaElement;
    fireEvent.compositionStart(source);
    edit('draft');
    if (cleared === '') fireEvent.click(screen.getByRole('button', { name: 'Clear text' }));
    else edit(cleared);
    expect(source).toHaveValue(cleared);
    source.value = 'late';
    fireEvent.compositionEnd(source, { data: 'late' });
    fireEvent.change(source, { target: { value: 'late' } });
    await tick();
    expect(source).toHaveValue(cleared);
    expect(translate).not.toHaveBeenCalled();
    edit('fresh');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    fireEvent.compositionStart(source);
    edit('draft2');
    cleanup();
    fireEvent.compositionEnd(source);
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test('retains full oversized text and resumes without truncation', async () => {
    const { translate } = await setup();
    const full = '😀'.repeat(5001);
    edit(full);
    await tick();
    expect(screen.getByLabelText('Source text')).toHaveValue(full);
    expect(screen.getByRole('status')).toHaveTextContent('5,000');
    expect(translate).not.toHaveBeenCalled();
    edit(full.slice(2));
    await tick();
    expect(translate.mock.calls[0][0].text).toBe('😀'.repeat(5000));
    edit(' '.repeat(6000));
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Translated text')).toHaveValue('');
  });

  test('opens same-document masked settings, cancels drafts and restores focus without duplicate work', async () => {
    const { translate } = await setup();
    edit('hello');
    await tick();
    const source = screen.getByLabelText('Source text');
    const trigger = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(trigger);
    const accessKey = screen.getByLabelText('Access Key ID');
    expect(accessKey).toHaveAttribute('type', 'password');
    expect(accessKey).toHaveFocus();
    expect(screen.getByLabelText('Secret Access Key')).toHaveAttribute('type', 'password');
    expect(screen.getByText(/without encryption/u)).toBeVisible();
    fireEvent.change(accessKey, { target: { value: 'draft' } });
    expect(screen.getByLabelText('Source text')).toBe(source);
    expect(fireEvent.keyDown(accessKey, { key: 'Escape', isComposing: true, keyCode: 229 })).toBe(true);
    expect(screen.getByRole('region', { name: 'Translation settings' })).toBeVisible();
    expect(fireEvent.keyDown(accessKey, { key: 'Escape' })).toBe(false);
    expect(trigger).toHaveFocus();
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger);
    expect(screen.getByLabelText('Access Key ID')).toHaveValue('fixture-ak');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await flush();
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(source).toHaveValue('hello');
  });

  test('keeps source editable while saving and only adopts confirmed credentials', async () => {
    const { fake, translate } = await setup();
    edit('old');
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Access Key ID'), { target: { value: 'new-ak' } });
    const write = createDeferred<unknown>();
    fake.setRequestHandler(() => write.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    edit('current');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    write.resolve({ method: 'storage.set', result: { stored: true } });
    await flush();
    await tick();
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1][0]).toMatchObject({ text: 'current', credentials: { accessKeyId: 'new-ak' } });
  });

  test('save failure leaves the draft open and retains old credentials after cancel', async () => {
    const { fake, translate } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Access Key ID'), { target: { value: 'new-ak' } });
    fake.setRequestHandler(() => Promise.reject({ code: 'limit_exceeded', message: 'do not expose me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await flush();
    expect(screen.getByRole('region', { name: 'Translation settings' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
    expect(document.body.textContent).not.toContain('do not expose me');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    edit('hello');
    await tick();
    expect(translate.mock.calls[0][0].credentials).toEqual(credentials);
  });

  test('an old save cannot close a reopened settings draft', async () => {
    const { fake } = await setup();
    const write = createDeferred<unknown>();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fake.setRequestHandler(() => write.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Access Key ID'), { target: { value: 'new-draft' } });
    write.resolve({ method: 'storage.set', result: { stored: true } });
    await flush();
    expect(screen.getByRole('region', { name: 'Translation settings' })).toBeVisible();
    expect(screen.getByLabelText('Access Key ID')).toHaveValue('new-draft');
  });

  test('validates missing credentials and lists only Volcengine', async () => {
    await setup({ value: null });
    expect(screen.getByText('Open Settings to configure your Volcengine credentials.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter both credentials');
    fireEvent.click(screen.getByRole('combobox', { name: 'Translation service' }));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Volcengine');
  });

  test('persists target only after confirmation without overwriting credentials; source remains memory-only', async () => {
    const { fake, translate } = await setup();
    edit('hello');
    await tick();
    const write = createDeferred<unknown>();
    fake.setRequestHandler(() => write.promise);
    choose('Target language', 'Chinese (simplified)');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox', { name: 'Target language' })).toHaveTextContent('English');
    write.resolve({ method: 'storage.set', result: { stored: true } });
    await flush();
    await tick();
    expect(translate.mock.calls[1][0]).toMatchObject({ targetLanguage: 'zh', credentials });
    choose('Source language', 'English');
    await tick();
    expect(translate.mock.calls.at(-1)?.[0].sourceLanguage).toBe('en');
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(1);
  });

  test('fails safely, announces state, and deduplicates explicit retries', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs
      .fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>()
      .mockRejectedValueOnce(new TranslationError('network'))
      .mockImplementation(() => pending.promise);
    await setup({ translate });
    edit('hello');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('The network request failed');
    const retry = screen.getByRole('button', { name: 'Retry translation' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await flush();
    expect(translate).toHaveBeenCalledTimes(2);
    expect(retry).toBeDisabled();
    pending.resolve({ translation: 'recovered' });
    await flush();
    expect(screen.getByLabelText('Translated text')).toHaveValue('recovered');
  });

  test('hide/restore events preserve memory, disconnect cleans it and reconnect starts empty', async () => {
    const { fake, translate } = await setup();
    edit('hello');
    await tick();
    fireEvent(document, new Event('visibilitychange'));
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Source text')).toHaveValue('hello');
    act(() => fake.disconnect());
    await flush();
    expect(screen.queryByLabelText('Source text')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toHaveFocus();
  });

  test('both message catalogs have complete aligned keys', () => {
    const english = messagesFor('en-US');
    const chinese = messagesFor('zh-CN');
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    expect(Object.values(chinese).every((value) => value.length > 0)).toBe(true);
  });

  test('missing HTTP capability blocks requests and a full Context update enables current text', async () => {
    const { fake, context, translate } = await setup();
    act(() => fake.emit('runtime.context_changed', { ...context, capabilities: ['storage.get', 'storage.set'] }));
    edit('waiting for Host HTTP');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('Host HTTP is unavailable');
    expect(translate).not.toHaveBeenCalled();
    act(() => fake.emit('runtime.context_changed', context));
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    act(() => fake.emit('runtime.context_changed', { ...context, capabilities: ['storage.get', 'storage.set'] }));
    act(() => fake.emit('runtime.context_changed', context));
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Translated text')).toHaveValue('<b>译文</b>\nnext');
  });

  test('the production page uses SDK HTTP and exposes a safe service error without CORS headers', async () => {
    rs.useFakeTimers();
    const fake = new FakePluginSdkTransport({
      connect: () =>
        createPluginRuntimeContextFixture({
          hostApiVersion: '0.3.0',
          capabilities: ['http.request', 'storage.get', 'storage.set'],
        }),
      request: (request) => {
        if (request.method === 'storage.get') return { method: 'storage.get', result: { found: true, value: saved } };
        return {
          method: 'http.request',
          result: {
            status: 200,
            headers: [],
            body: JSON.stringify({
              ResponseMetadata: {
                Error: { Code: 'InvalidAccessKey', CodeN: 100009, Message: 'private credential detail' },
              },
            }),
          },
        };
      },
    });
    render(<App createTransport={() => fake} />);
    await flush();
    edit('hello');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('Authentication or signing failed');
    expect(document.body.textContent).not.toContain('private credential detail');
    const requests = fake.observation.requests.filter((request) => request.method === 'http.request');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'http.request',
      params: { method: 'POST', body: '{"TargetLanguage":"en","TextList":["hello"]}' },
    });
  });
  test('pausing a failed input announces pause and returns to failure without automatic retry', async () => {
    const translate = rs
      .fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>()
      .mockRejectedValue(new TranslationError('network', 'safe-id'));
    await setup({ translate });
    edit('hello');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('The network request failed');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('status')).toHaveTextContent('paused');
    expect(screen.getByRole('status')).not.toHaveTextContent('safe-id');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await tick(20000);
    expect(screen.getByRole('status')).toHaveTextContent('The network request failed');
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test('fresh ordinary edits do not let an older cleared composition restore text', async () => {
    const { translate } = await setup();
    const source = screen.getByLabelText('Source text') as HTMLTextAreaElement;
    fireEvent.compositionStart(source);
    edit('draft');
    fireEvent.click(screen.getByRole('button', { name: 'Clear text' }));
    edit('fresh');
    source.value = 'stale';
    fireEvent.compositionEnd(source, { data: 'stale' });
    fireEvent.change(source, { target: { value: 'stale' } });
    await tick();
    expect(source).toHaveValue('fresh');
    expect(translate.mock.calls[0][0].text).toBe('fresh');
    fireEvent.compositionStart(source);
    edit('新');
    fireEvent.compositionEnd(source);
    await tick();
    expect(translate.mock.calls[1][0].text).toBe('新');
  });

  test('closing settings mid-composition does not disable Escape on the next panel', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.compositionStart(screen.getByLabelText('Access Key ID'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.keyDown(screen.getByLabelText('Access Key ID'), { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Translation settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
  });

  test('reconnect uses fresh SDK state and restores settings without restoring text', async () => {
    rs.useFakeTimers();
    const context = createPluginRuntimeContextFixture({ capabilities: ['http.request', 'storage.get', 'storage.set'] });
    const fake = () =>
      new FakePluginSdkTransport({
        connect: () => context,
        request: () => ({ method: 'storage.get', result: { found: true, value: { ...saved, targetLanguage: 'zh' } } }),
      });
    const first = fake();
    const second = fake();
    const queue = [first, second];
    const translate = rs.fn(async () => ({ translation: 'old translation' }));
    render(
      <App
        createTransport={() => {
          const transport = queue.shift();
          if (!transport) throw new Error('extra attempt');
          return transport;
        }}
        translate={translate}
      />,
    );
    await flush();
    edit('old');
    await tick();
    act(() => first.disconnect());
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await flush();
    await tick();
    expect(screen.getByLabelText('Source text')).toHaveValue('');
    expect(screen.getByLabelText('Translated text')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Target language' })).toHaveTextContent('Chinese (simplified)');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(first.observation.disposeCalls).toBe(1);
  });
});
