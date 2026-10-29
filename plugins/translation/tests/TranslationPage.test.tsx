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
  readError = false,
  activations = false,
  translate = rs.fn(
    async (_input: TranslationInput): Promise<TranslationResult> => ({ translation: '<b>译文</b>\nnext' }),
  ),
}: {
  locale?: 'en-US' | 'zh-CN';
  theme?: 'light' | 'dark';
  value?: unknown;
  readError?: boolean;
  activations?: boolean;
  translate?: ReturnType<typeof rs.fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>>;
} = {}) => {
  rs.useFakeTimers();
  let stored: unknown = value;
  const context = createPluginRuntimeContextFixture({
    locale,
    theme,
    capabilities: activations
      ? ['actions.subscribe_activations', 'http.request', 'storage.get', 'storage.set']
      : ['http.request', 'storage.get', 'storage.set'],
  });
  const fake = new FakePluginSdkTransport({
    connect: () => context,
    request: (request) => {
      if (request.method === 'actions.subscribe_activations')
        return {
          method: request.method,
          result: { activations: [{ actionId: 'open', invocationId: 1, source: 'shortcut' }] },
        };
      if (request.method === 'storage.get') {
        if (readError) throw new Error('private storage failure');
        return { method: 'storage.get', result: stored === null ? { found: false } : { found: true, value: stored } };
      }
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
  fireEvent.input(screen.getByRole('textbox', { name: label }), {
    target: { value: text },
    inputType: text === '' ? 'deleteContentBackward' : 'insertText',
    isComposing: false,
  });
const choose = (label: string, option: string) => {
  const selector = screen.getByRole('combobox', { name: label });
  fireEvent.click(selector);
  const popupId = selector.getAttribute('aria-controls');
  const popup = popupId ? document.getElementById(popupId) : null;
  if (!popup) throw new Error(`Missing popup for ${label}`);
  const list = within(popup).getByRole('listbox');
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
    const source = screen.getByRole('textbox', { name: messages.sourceText });
    const output = screen.getByRole('textbox', { name: messages.translatedText });
    expect(source.tagName).toBe('TEXTAREA');
    expect(output).toHaveAttribute('readonly');
    expect(output).not.toBeDisabled();
    // This is responsive metadata, not a claim about Happy DOM geometry.
    expect(source.closest('[data-layout]')).toHaveAttribute('data-layout', 'responsive');
    expect(screen.getByRole('combobox', { name: messages.sourceLanguage })).toHaveTextContent(messages.auto);
    expect(screen.getByRole('combobox', { name: messages.targetLanguage })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: messages.swap })).toBeDisabled();
    expect(screen.getByRole('button', { name: messages.swap })).toHaveAccessibleDescription(messages.swapUnavailable);
    const swapIcon = screen.getByRole('button', { name: messages.swap }).querySelector('svg');
    expect(swapIcon).not.toBeNull();
    expect(Number(swapIcon?.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(swapIcon?.getAttribute('height'))).toBeGreaterThan(0);
    expect(swapIcon).toHaveAttribute('viewBox', '0 0 24 24');
    expect(swapIcon?.querySelector('path')).toHaveAttribute('stroke', 'currentColor');
    expect(swapIcon).toHaveAttribute('aria-hidden', 'true');
    expect(source).toHaveAttribute('spellcheck', 'false');
    expect(source).toHaveAttribute('autocorrect', 'off');
    expect(source).toHaveAttribute('autocapitalize', 'off');
    expect(source).toHaveAttribute('autocomplete', 'off');
    expect(source).not.toHaveAttribute('maxlength');
    expect(source).not.toHaveAttribute('aria-describedby');
    expect(document.getElementById('translation-character-count')).toBeNull();
    const sourceCard = screen.getByRole('article', { name: messages.sourceText });
    const outputCard = screen.getByRole('article', { name: messages.translatedText });
    expect(sourceCard).toContainElement(source);
    expect(within(sourceCard).queryByRole('button')).toBeNull();
    expect(outputCard).toContainElement(output);
    expect(within(outputCard).queryByRole('status')).toBeNull();
    expect(outputCard.querySelector('footer')).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('status')).toHaveClass('translation__sr-only');
    expect(within(outputCard).queryByRole('button', { name: messages.retry })).toBeNull();
    expect(screen.queryByText(/Source text is sent to|原文将发送至/u)).toBeNull();
    (source as HTMLTextAreaElement).focus();
    expect(source).toHaveFocus();
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
    expect(outputCard.querySelector('footer')).toBeNull();
    expect(within(outputCard).queryByText(messages.success)).toBeNull();
    (output as HTMLTextAreaElement).focus();
    (output as HTMLTextAreaElement).setSelectionRange(0, 4);
    expect(output).toHaveFocus();
    expect((output as HTMLTextAreaElement).selectionEnd).toBe(4);
    expect(fireEvent.keyDown(output, { key: 'c', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(source, { key: 'v', metaKey: true })).toBe(true);
  });

  test('debounces continuous edits and preserves current result through duplicate events and Context changes', async () => {
    const { fake, context, translate } = await setup();
    const source = screen.getByRole('textbox', { name: 'Source text' });
    const output = screen.getByRole('textbox', { name: 'Translated text' }) as HTMLTextAreaElement;
    edit('a');
    await tick(200);
    edit('ab');
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    edit('ab');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    output.focus();
    output.setSelectionRange(2, 6);
    act(() => fake.emit('runtime.context_changed', { ...context, locale: 'zh-CN', theme: 'dark' }));
    fireEvent(window, new Event('resize'));
    await flush();
    await tick();
    expect(screen.getByRole('textbox', { name: '原文' })).toHaveValue('ab');
    expect(screen.getByRole('textbox', { name: '译文' })).toHaveValue('<b>译文</b>\nnext');
    expect(screen.getByRole('textbox', { name: '原文' })).toBe(source);
    expect(screen.getByRole('textbox', { name: '译文' })).toBe(output);
    expect(output).toHaveFocus();
    expect([output.selectionStart, output.selectionEnd]).toEqual([2, 6]);
    expect(screen.getByRole('combobox', { name: '目标语言' })).toHaveTextContent('英语');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(0);
  });

  test('presentation updates preserve the active composition, debounce and request identity', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs.fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>(
      () => pending.promise,
    );
    const { fake, context } = await setup({ translate });
    const source = screen.getByRole('textbox', { name: 'Source text' }) as HTMLTextAreaElement;
    const output = screen.getByRole('textbox', { name: 'Translated text' });
    source.focus();
    fireEvent.compositionStart(source);
    edit('中');
    source.setSelectionRange(1, 1);
    act(() => fake.emit('runtime.context_changed', { ...context, locale: 'zh-CN', theme: 'dark' }));
    fireEvent(window, new Event('resize'));
    await tick(800);
    expect(screen.getByRole('textbox', { name: '原文' })).toBe(source);
    expect(screen.getByRole('textbox', { name: '译文' })).toBe(output);
    expect(source).toHaveFocus();
    expect([source.selectionStart, source.selectionEnd]).toEqual([1, 1]);
    expect(screen.getByRole('status')).toHaveTextContent(messagesFor('zh-CN').paused);
    expect(translate).not.toHaveBeenCalled();

    edit('中文', '原文');
    fireEvent.compositionEnd(source, { data: '中文' });
    await tick(200);
    act(() => fake.emit('runtime.context_changed', context));
    fireEvent(window, new Event('resize'));
    await tick(199);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    const [input, signal] = translate.mock.calls[0];
    expect(input).toMatchObject({ text: '中文', sourceLanguage: 'auto', targetLanguage: 'en' });
    act(() => fake.emit('runtime.context_changed', { ...context, locale: 'zh-CN', theme: 'dark' }));
    fireEvent(window, new Event('resize'));
    await tick(400);
    expect(signal.aborted).toBe(false);
    expect(translate).toHaveBeenCalledTimes(1);
    pending.resolve({ translation: 'current result', detectedLanguage: 'zh', requestId: 'safe-current' });
    await flush();
    expect(output).toHaveValue('current result');
    expect(screen.getByRole('status')).toHaveTextContent(messagesFor('zh-CN').success);
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(0);
  });

  test('does not translate IME drafts and schedules one final value without confirmation-key work', async () => {
    const { translate } = await setup();
    const source = screen.getByRole('textbox', { name: 'Source text' });
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
    'InputEvent',
    'legacy Event',
  ] as const)('keeps native Chinese composition editable through %s and an emptied draft', async (eventType) => {
    const { translate } = await setup();
    const source = screen.getByRole('textbox', { name: 'Source text' }) as HTMLTextAreaElement;
    source.focus();
    fireEvent.compositionStart(source, { data: '' });
    const compose = (value: string) => {
      fireEvent.compositionUpdate(source, { data: value });
      if (eventType === 'legacy Event') {
        const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!nativeValue) throw new Error('Missing native textarea setter');
        nativeValue.call(source, value);
        fireEvent(source, new Event('input', { bubbles: true }));
      } else {
        fireEvent.input(source, {
          target: { value },
          data: value,
          inputType: 'insertCompositionText',
          isComposing: true,
        });
      }
      expect(source).toHaveValue(value);
    };
    compose('n');
    compose('');
    compose('ni');
    compose('你');
    await tick(800);
    expect(translate).not.toHaveBeenCalled();
    fireEvent.compositionEnd(source, { data: '你' });
    fireEvent.input(source, {
      target: { value: '你' },
      data: '你',
      inputType: 'insertText',
      isComposing: false,
    });
    expect(source).toHaveValue('你');
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].text).toBe('你');
  });

  test('an explicit noncomposing deletion retires a composition and rejects its late commit', async () => {
    const { translate } = await setup();
    const source = screen.getByRole('textbox', { name: 'Source text' }) as HTMLTextAreaElement;
    fireEvent.compositionStart(source);
    fireEvent.input(source, {
      target: { value: 'ni' },
      inputType: 'insertCompositionText',
      isComposing: true,
    });
    fireEvent.input(source, {
      target: { value: '' },
      inputType: 'deleteContentBackward',
      isComposing: false,
    });
    source.value = '你';
    fireEvent.compositionEnd(source, { data: '你' });
    fireEvent.input(source, {
      target: { value: '你' },
      inputType: 'insertText',
      isComposing: false,
    });
    await tick(800);
    expect(source).toHaveValue('');
    expect(translate).not.toHaveBeenCalled();
    edit('fresh ordinary text');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].text).toBe('fresh ordinary text');
  });

  test.each([
    '',
    '   ',
  ])('retires cleared composition and ignores late end and trailing change (%j)', async (cleared) => {
    const { translate } = await setup();
    const source = screen.getByRole('textbox', { name: 'Source text' }) as HTMLTextAreaElement;
    fireEvent.compositionStart(source);
    edit('draft');
    edit(cleared);
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
    expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveValue(full);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveAccessibleDescription(/5,000/u);
    expect(screen.getByRole('alert')).toHaveTextContent('5,000');
    expect(screen.getByRole('alert').closest('.translation__configuration')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry translation' })).toBeNull();
    expect(translate).not.toHaveBeenCalled();
    edit(full.slice(2));
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate.mock.calls[0][0].text).toBe('😀'.repeat(5000));
    edit(' '.repeat(6000));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('status')).not.toHaveTextContent(messagesFor('en-US')['input-limit']);
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Translated text' })).toHaveValue('');
  });

  test.each([
    ['mixed whitespace, surrogate pair and combining sequence', '\n😀e\u0301 '],
    ['combining sequences at the limit', 'e\u0301'.repeat(2500)],
  ] as const)('preserves Unicode code points without rewriting the request: %s', async (_description, text) => {
    const { translate } = await setup();
    edit(text);
    expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveValue(text);
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].text).toBe(text);
  });

  test('switches to masked settings without remounting the hidden workspace and restores focus after save', async () => {
    const { translate } = await setup();
    edit('hello');
    await tick();
    const source = screen.getByRole('textbox', { name: 'Source text' });
    const output = screen.getByRole('textbox', { name: 'Translated text' });
    const trigger = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(trigger);
    const workspace = source.closest<HTMLElement>('.translation__workspace');
    expect(workspace).toHaveAttribute('hidden');
    expect(workspace).toHaveAttribute('inert');
    expect(source).not.toBeVisible();
    expect(output).not.toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Source text' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Translated text' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Source language' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Target language' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Swap languages' })).toBeNull();
    const accessKey = screen.getByLabelText('Access Key ID');
    expect(accessKey).toHaveAttribute('type', 'password');
    expect(accessKey).toHaveFocus();
    expect(screen.getByLabelText('Secret Access Key')).toHaveAttribute('type', 'password');
    expect(screen.getByText(/without encryption/u)).toBeVisible();
    fireEvent.change(accessKey, { target: { value: 'draft' } });
    expect(document.getElementById('translation-source')).toBe(source);
    expect(fireEvent.keyDown(accessKey, { key: 'Escape', isComposing: true, keyCode: 229 })).toBe(true);
    expect(screen.getByRole('region', { name: 'Translation settings' })).toBeVisible();
    expect(fireEvent.keyDown(accessKey, { key: 'Escape' })).toBe(false);
    expect(workspace).not.toHaveAttribute('hidden');
    expect(workspace).not.toHaveAttribute('inert');
    expect(screen.getByRole('textbox', { name: 'Source text' })).toBe(source);
    expect(screen.getByRole('textbox', { name: 'Translated text' })).toBe(output);
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
    expect(screen.queryByRole('region', { name: 'Translation settings' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test.each(['en-US', 'zh-CN'] as const)('returns from localized settings with Back in %s', async (locale) => {
    const { translate, messages } = await setup({ locale, theme: locale === 'zh-CN' ? 'dark' : 'light' });
    edit('preserved source', messages.sourceText);
    await tick();
    const source = screen.getByRole('textbox', { name: messages.sourceText }) as HTMLTextAreaElement;
    const output = screen.getByRole('textbox', { name: messages.translatedText }) as HTMLTextAreaElement;
    const trigger = screen.getByRole('button', { name: messages.settings });
    const main = screen.getByRole('main', { name: messages.title });
    source.setSelectionRange(2, 7);
    output.setSelectionRange(1, 5);
    // Stored scroll offsets exercise view state; Happy DOM does not establish geometry.
    main.scrollTop = 96;
    fireEvent.click(trigger);
    expect(main.scrollTop).toBe(0);
    expect(screen.getByLabelText(messages.accessKeyId)).toHaveFocus();
    expect(screen.queryByRole('textbox', { name: messages.sourceText })).toBeNull();
    fireEvent.change(screen.getByLabelText(messages.accessKeyId), { target: { value: 'discarded-draft' } });
    main.scrollTop = 42;
    fireEvent.click(screen.getByRole('button', { name: locale === 'zh-CN' ? '返回翻译' : 'Back to translation' }));
    expect(main.scrollTop).toBe(96);
    expect(screen.getByRole('textbox', { name: messages.sourceText })).toBe(source);
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toBe(output);
    expect(source).toHaveValue('preserved source');
    expect(output).toHaveValue('<b>译文</b>\nnext');
    expect([source.selectionStart, source.selectionEnd]).toEqual([2, 7]);
    expect([output.selectionStart, output.selectionEnd]).toEqual([1, 5]);
    expect(trigger).toHaveFocus();
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger);
    expect(screen.getByLabelText(messages.accessKeyId)).toHaveValue('fixture-ak');
    fireEvent.click(screen.getByRole('button', { name: messages.cancel }));
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('region', { name: messages.settingsTitle })).toBeNull();
  });

  test('keeps source hidden while saving and editable after Back before credentials are confirmed', async () => {
    const { fake, translate } = await setup();
    edit('old');
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Access Key ID'), { target: { value: 'new-ak' } });
    const write = createDeferred<unknown>();
    fake.setRequestHandler(() => write.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('textbox', { name: 'Source text' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to translation' }));
    expect(screen.queryByRole('region', { name: 'Translation settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    const source = screen.getByRole('textbox', { name: 'Source text' });
    source.focus();
    edit('current');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    write.resolve({ method: 'storage.set', result: { stored: true } });
    await flush();
    await tick();
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1][0]).toMatchObject({ text: 'current', credentials: { accessKeyId: 'new-ak' } });
    expect(source).toHaveFocus();
  });

  test('switching to settings cancels an in-flight request and Back reschedules only current work', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs
      .fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce({ translation: 'current result' });
    await setup({ translate });
    edit('current source');
    const source = screen.getByRole('textbox', { name: 'Source text' });
    const output = screen.getByRole('textbox', { name: 'Translated text' });
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(translate.mock.calls[0][1].aborted).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Source text' })).toBeNull();
    pending.resolve({ translation: 'late cancelled result' });
    await flush();
    await tick(800);
    expect(translate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back to translation' }));
    expect(screen.getByRole('textbox', { name: 'Source text' })).toBe(source);
    expect(screen.getByRole('textbox', { name: 'Translated text' })).toBe(output);
    expect(source).toHaveValue('current source');
    expect(output).toHaveValue('');
    await tick(399);
    expect(translate).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(output).toHaveValue('current result');
  });

  test('save failure leaves the draft open and retains old credentials after cancel', async () => {
    const { fake, translate } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Access Key ID'), { target: { value: 'new-ak' } });
    fake.setRequestHandler(() => Promise.reject({ code: 'limit_exceeded', message: 'do not expose me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await flush();
    const panel = screen.getByRole('region', { name: 'Translation settings' });
    expect(panel).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Source text' })).toBeNull();
    expect(within(panel).getByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText('Access Key ID')).toHaveValue('new-ak');
    expect(document.body.textContent).not.toContain('do not expose me');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
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
    expect(screen.queryByRole('textbox', { name: 'Source text' })).toBeNull();
  });

  test('validates missing credentials and lists only Volcengine', async () => {
    const { fake, translate } = await setup({ value: null });
    const missing = screen.getByText('Open Settings to configure your Volcengine credentials.');
    expect(missing).toBeVisible();
    expect(missing.closest('.translation__configuration')).not.toBeNull();
    edit('waiting for credentials');
    await tick();
    expect(translate).not.toHaveBeenCalled();
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const panel = screen.getByRole('region', { name: 'Translation settings' });
    expect(within(panel).getByRole('alert')).toHaveTextContent('Enter both credentials');
    fireEvent.click(screen.getByRole('combobox', { name: 'Translation service' }));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Volcengine');
  });

  test.each([
    { kind: 'read failure', options: { readError: true }, message: 'read' },
    { kind: 'invalid stored record', options: { value: { ...saved, version: 2 } }, message: 'invalid' },
  ] as const)('keeps $kind beside configuration and reloads without speculative writes', async ({
    options,
    message,
  }) => {
    const { fake, translate, messages } = await setup(options);
    edit('retained source');
    await tick();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(messages[message]);
    const configuration = alert.closest<HTMLElement>('.translation__configuration');
    if (!configuration) throw new Error('Missing configuration recovery context');
    expect(screen.queryByRole('button', { name: messages.retry })).toBeNull();
    expect(translate).not.toHaveBeenCalled();
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('private storage failure');
    fake.setRequestHandler(() => ({ method: 'storage.get', result: { found: true, value: saved } }));
    fireEvent.click(within(configuration).getByRole('button', { name: messages.reload }));
    await flush();
    await tick(399);
    expect(translate).not.toHaveBeenCalled();
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).toMatchObject({ text: 'retained source', credentials });
    expect(fake.observation.requests.filter((request) => request.method === 'storage.get')).toHaveLength(2);
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('repairs only an unsupported target after confirmation and preserves validated credentials', async () => {
    const { fake, translate, messages } = await setup({ value: { ...saved, targetLanguage: 'retired-language' } });
    edit('repair target');
    await tick();
    expect(screen.getByRole('alert')).toHaveTextContent(messages['invalid-target']);
    expect(screen.getByRole('alert').closest('.translation__configuration')).not.toBeNull();
    expect(translate).not.toHaveBeenCalled();
    const write = createDeferred<unknown>();
    fake.setRequestHandler(() => write.promise);
    choose('Target language', 'Chinese (simplified)');
    await tick();
    expect(translate).not.toHaveBeenCalled();
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toMatchObject([
      { method: 'storage.set', params: { key: 'settings.v1', value: { ...saved, targetLanguage: 'zh' } } },
    ]);
    write.resolve({ method: 'storage.set', result: { stored: true } });
    await flush();
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).toMatchObject({ text: 'repair target', targetLanguage: 'zh', credentials });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('keeps failed target saves near the language controls and retains the confirmed target', async () => {
    const { fake, translate, messages } = await setup();
    edit('successful original');
    await tick();
    fake.setRequestHandler(() => Promise.reject({ code: 'limit_exceeded', message: 'private failure' }));
    choose('Target language', 'Chinese (simplified)');
    await flush();
    await tick();
    expect(screen.getByRole('alert')).toHaveTextContent(messages.saveFailed);
    expect(screen.getByRole('alert').closest('.translation__configuration')).not.toBeNull();
    expect(screen.queryByRole('button', { name: messages.reload })).toBeNull();
    expect(screen.getByRole('combobox', { name: messages.targetLanguage })).toHaveTextContent('English');
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toHaveValue('<b>译文</b>\nnext');
    expect(translate).toHaveBeenCalledTimes(1);
    edit('still confirmed');
    await tick();
    expect(translate.mock.calls[1][0]).toMatchObject({ text: 'still confirmed', targetLanguage: 'en', credentials });
    expect(document.body.textContent).not.toContain('private failure');
  });

  test('announces request stages without an output footer and keeps errors recoverable near the toolbar', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs
      .fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>()
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValueOnce(new TranslationError('network', 'safe-error-id'));
    const { messages } = await setup({ translate });
    const outputCard = screen.getByRole('article', { name: messages.translatedText });
    const status = screen.getByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status).toHaveClass('translation__sr-only');
    expect(status).not.toHaveAttribute('aria-hidden');
    expect(status).not.toHaveAttribute('hidden');
    expect(outputCard).not.toContainElement(status);
    expect(outputCard.querySelector('footer')).toBeNull();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toBeEmptyDOMElement();
    edit('first');
    expect(status).toHaveTextContent(messages.debouncing);
    expect(status).toHaveAttribute('aria-busy', 'false');
    await tick();
    expect(status).toHaveTextContent(messages.translating);
    expect(status).toHaveAttribute('aria-busy', 'true');
    pending.resolve({ translation: 'plain result', detectedLanguage: 'en', requestId: 'safe-success-id' });
    await flush();
    expect(status).toHaveTextContent(messages.success);
    expect(status).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toHaveValue('plain result');
    expect(screen.queryByText(/safe-success-id/u)).toBeNull();
    expect(screen.queryByText('Detected language: English')).toBeNull();
    expect(outputCard.querySelector('.translation__metadata')).toBeNull();
    expect(within(outputCard).queryByText(messages.success)).toBeNull();
    edit('second');
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toHaveValue('');
    expect(screen.queryByText(/safe-success-id/u)).toBeNull();
    await tick();
    expect(status).toBeEmptyDOMElement();
    expect(screen.queryByText(/safe-error-id/u)).toBeNull();
    expect(within(outputCard).queryByRole('button', { name: messages.retry })).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(messages.network);
    expect(alert).toBeVisible();
    const recovery = alert.closest<HTMLElement>('.translation__configuration');
    if (!recovery) throw new Error('Missing toolbar request-recovery context');
    expect(within(recovery).getByRole('button', { name: messages.retry })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toHaveValue('');
  });

  test('shows a blocked direction near the language controls without rewriting the selected target', async () => {
    const { translate, fake, messages } = await setup();
    choose(messages.sourceLanguage, 'Tibetan');
    edit('direction check');
    await tick();
    const outputCard = screen.getByRole('article', { name: messages.translatedText });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(messages.direction);
    expect(alert.closest('.translation__configuration')).not.toBeNull();
    expect(outputCard).not.toContainElement(alert);
    expect(within(outputCard).queryByRole('button', { name: messages.retry })).toBeNull();
    expect(screen.getByRole('combobox', { name: messages.targetLanguage })).toHaveTextContent('English');
    expect(translate).not.toHaveBeenCalled();
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(0);
    choose(messages.targetLanguage, 'Chinese (simplified)');
    await flush();
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).toMatchObject({ sourceLanguage: 'bo', targetLanguage: 'zh' });
  });

  test('native source clearing cancels in-flight work and ignores a late result', async () => {
    const pending = createDeferred<TranslationResult>();
    const translate = rs
      .fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce({ translation: 'fresh result' });
    const { messages } = await setup({ translate });
    edit('old');
    await tick();
    edit('');
    expect(translate.mock.calls[0][1].aborted).toBe(true);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    edit('fresh');
    await tick();
    pending.resolve({ translation: 'stale result', requestId: 'stale-id', detectedLanguage: 'fr' });
    await flush();
    expect(screen.getByRole('textbox', { name: messages.sourceText })).toHaveValue('fresh');
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toHaveValue('fresh result');
    expect(screen.queryByText(/stale-id/u)).toBeNull();
    expect(translate).toHaveBeenCalledTimes(2);
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

  test('swaps a manual language pair together after persistence while preserving editable text', async () => {
    const { fake, translate, messages } = await setup({ value: { ...saved, targetLanguage: 'zh' } });
    choose(messages.sourceLanguage, 'English');
    edit('original input');
    await tick();
    const source = screen.getByRole('textbox', { name: messages.sourceText });
    const output = screen.getByRole('textbox', { name: messages.translatedText });
    const write = createDeferred<unknown>();
    fake.setRequestHandler(() => write.promise);
    const swap = screen.getByRole('button', { name: messages.swap });
    expect(swap).toBeEnabled();
    expect(Number(swap.querySelector('svg')?.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(swap.querySelector('svg')?.getAttribute('height'))).toBeGreaterThan(0);
    fireEvent.click(swap);
    fireEvent.click(swap);
    expect(swap).toBeDisabled();
    expect(screen.getByRole('combobox', { name: messages.sourceLanguage })).toHaveTextContent('English');
    expect(screen.getByRole('combobox', { name: messages.targetLanguage })).toHaveTextContent('Chinese (simplified)');
    expect(screen.getByRole('combobox', { name: messages.sourceLanguage })).toHaveAttribute('aria-disabled', 'true');
    edit('edited during save');
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toHaveLength(1);
    write.resolve({ method: 'storage.set', result: { stored: true } });
    await flush();
    expect(screen.getByRole('combobox', { name: messages.sourceLanguage })).toHaveTextContent('Chinese (simplified)');
    expect(screen.getByRole('combobox', { name: messages.targetLanguage })).toHaveTextContent('English');
    expect(screen.getByRole('textbox', { name: messages.sourceText })).toBe(source);
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toBe(output);
    expect(source).toHaveValue('edited during save');
    expect(output).toHaveValue('');
    await tick(399);
    expect(translate).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1][0]).toMatchObject({
      text: 'edited during save',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      credentials,
    });
  });

  test('uses a successful detected language for swapping and retains the pair after a failed save', async () => {
    const translate = rs
      .fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>()
      .mockResolvedValue({ translation: 'translated', detectedLanguage: 'zh' });
    const { fake, messages } = await setup({ translate });
    const swap = screen.getByRole('button', { name: messages.swap });
    expect(swap).toBeDisabled();
    edit('你好');
    await tick();
    expect(swap).toBeEnabled();
    fake.setRequestHandler(() => Promise.reject({ code: 'limit_exceeded', message: 'private write failure' }));
    fireEvent.click(swap);
    await flush();
    await tick();
    expect(screen.getByRole('combobox', { name: messages.sourceLanguage })).toHaveTextContent(messages.auto);
    expect(screen.getByRole('combobox', { name: messages.targetLanguage })).toHaveTextContent('English');
    expect(screen.getByRole('textbox', { name: messages.sourceText })).toHaveValue('你好');
    expect(screen.getByRole('textbox', { name: messages.translatedText })).toHaveValue('translated');
    expect(screen.getByRole('alert')).toHaveTextContent(messages.saveFailed);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(fake.observation.requests.filter((request) => request.method === 'storage.set')).toMatchObject([
      { params: { value: { targetLanguage: 'zh', credentials } } },
    ]);
    fake.setRequestHandler(() => ({ method: 'storage.set', result: { stored: true } }));
    fireEvent.click(swap);
    await flush();
    await tick();
    expect(screen.getByRole('combobox', { name: messages.sourceLanguage })).toHaveTextContent('English');
    expect(screen.getByRole('combobox', { name: messages.targetLanguage })).toHaveTextContent('Chinese (simplified)');
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1][0]).toMatchObject({ text: '你好', sourceLanguage: 'en', targetLanguage: 'zh' });
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
    expect(screen.getByRole('alert')).toHaveTextContent('The network request failed');
    const retry = screen.getByRole('button', { name: 'Retry translation' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await flush();
    expect(translate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Retry translation' })).toBeNull();
    pending.resolve({ translation: 'recovered' });
    await flush();
    expect(screen.getByRole('textbox', { name: 'Translated text' })).toHaveValue('recovered');
  });

  test('hide/restore events preserve memory, disconnect cleans it and reconnect starts empty', async () => {
    const { fake, translate } = await setup();
    edit('hello');
    await tick();
    fireEvent(document, new Event('visibilitychange'));
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveValue('hello');
    act(() => fake.disconnect());
    await flush();
    expect(screen.queryByRole('textbox', { name: 'Source text' })).toBeNull();
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
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toHaveTextContent('Host HTTP is unavailable');
    expect(screen.getByRole('alert').closest('.translation__configuration')).not.toBeNull();
    expect(translate).not.toHaveBeenCalled();
    act(() => fake.emit('runtime.context_changed', context));
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    act(() => fake.emit('runtime.context_changed', { ...context, capabilities: ['storage.get', 'storage.set'] }));
    act(() => fake.emit('runtime.context_changed', context));
    await tick();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Translated text' })).toHaveValue('<b>译文</b>\nnext');
  });

  test('the production page uses SDK HTTP and exposes a safe service error without CORS headers', async () => {
    rs.useFakeTimers();
    const fake = new FakePluginSdkTransport({
      connect: () =>
        createPluginRuntimeContextFixture({
          hostApiVersion: '0.4.0',
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
    expect(screen.getByRole('alert')).toHaveTextContent('Authentication or signing failed');
    expect(document.body.textContent).not.toContain('private credential detail');
    const requests = fake.observation.requests.filter((request) => request.method === 'http.request');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'http.request',
      params: { method: 'POST', body: '{"TargetLanguage":"en","TextList":["hello"]}' },
    });
  });
  test('settings hides a failed workspace and returns to its failure without automatic retry', async () => {
    const translate = rs
      .fn<(input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>>()
      .mockRejectedValue(new TranslationError('network', 'safe-id'));
    await setup({ translate });
    edit('hello');
    await tick();
    expect(screen.getByRole('alert')).toHaveTextContent('The network request failed');
    const status = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(status).toHaveTextContent('paused');
    expect(status).not.toHaveTextContent('safe-id');
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveClass('translation__sr-only');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await tick(20000);
    expect(screen.getByRole('alert')).toHaveTextContent('The network request failed');
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test('fresh ordinary edits do not let an older cleared composition restore text', async () => {
    const { translate } = await setup();
    const source = screen.getByRole('textbox', { name: 'Source text' }) as HTMLTextAreaElement;
    fireEvent.compositionStart(source);
    edit('draft');
    edit('');
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
    expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Translated text' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Target language' })).toHaveTextContent('Chinese (simplified)');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(first.observation.disposeCalls).toBe(1);
  });
});

test('shortcut activation preserves text, result and pending translation without another business call', async () => {
  const pending = createDeferred<TranslationResult>();
  const translate = rs.fn(async (input: TranslationInput, _signal: AbortSignal) =>
    input.text === 'next input' ? pending.promise : { translation: 'existing result' },
  );
  const { fake } = await setup({ activations: true, translate });
  edit('first input');
  await tick();
  expect(translate).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox', { name: 'Translated text' })).toHaveValue('existing result');
  act(() => fake.emit('actions.activated', { actionId: 'open', invocationId: 2, source: 'shortcut' }));
  await tick();
  expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveValue('first input');
  expect(screen.getByRole('textbox', { name: 'Translated text' })).toHaveValue('existing result');
  expect(translate).toHaveBeenCalledTimes(1);
  edit('next input');
  await tick();
  expect(translate).toHaveBeenCalledTimes(2);
  const signal = translate.mock.calls[1]?.[1];
  act(() => fake.emit('actions.activated', { actionId: 'open', invocationId: 3, source: 'shortcut' }));
  await tick();
  expect(screen.getByRole('textbox', { name: 'Source text' })).toHaveValue('next input');
  expect(translate).toHaveBeenCalledTimes(2);
  expect(signal?.aborted).toBe(false);
  pending.resolve({ translation: 'next result' });
  await flush();
  expect(screen.getByRole('textbox', { name: 'Translated text' })).toHaveValue('next result');
});
