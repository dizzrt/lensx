import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { fireEvent } from '@testing-library/react';
import { createOrdinaryPluginEditingFixture } from './fixtures/ordinary-plugin-editing';
import {
  clipboardText,
  editSelection,
  modelPlainTextEditing,
  pressModeledEdit,
  selectEditText,
} from './helpers/modeled-web-editing';

const fixtures: ReturnType<typeof createOrdinaryPluginEditingFixture>[] = [];
const fixture = (kind: 'input' | 'textarea' | 'contenteditable', text?: string) => {
  const result = createOrdinaryPluginEditingFixture(kind, text);
  fixtures.push(result);
  return result;
};

afterEach(() => {
  for (const item of fixtures.splice(0)) item.dispose();
});

const kinds = ['input', 'textarea', 'contenteditable'] as const;
const combinations = kinds.flatMap((kind) =>
  (['en-US', 'zh-CN'] as const).flatMap((locale) =>
    (['light', 'dark'] as const).map((theme) => ({ kind, locale, theme })),
  ),
);

// These are unprivileged, test-owned Web controls. AppKit ownership, Child
// generation and real event delivery remain production Rust policy concerns.
describe('ordinary external document handlers with explicitly modeled DOM defaults', () => {
  test.each(combinations)('$kind selection, clipboard and history in $locale/$theme', ({ kind, locale, theme }) => {
    document.documentElement.lang = locale;
    if (theme === 'dark') document.body.setAttribute('theme-mode', 'dark');
    const original = locale === 'en-US' ? 'alpha beta' : '运行 示例';
    const inserted = locale === 'en-US' ? 'independent clipboard' : '独立剪贴板';
    const { target, text } = fixture(kind, original);
    const defaults = modelPlainTextEditing(target);
    const inputTypes: string[] = [];
    const events: string[] = [];
    target.addEventListener('input', (event) => inputTypes.push((event as InputEvent).inputType));
    for (const type of ['copy', 'cut', 'paste']) target.addEventListener(type, () => events.push(type));

    expect(pressModeledEdit(target, 'a', defaults.selectAll).defaultPrevented).toBe(false);
    expect(editSelection(target)).toEqual([0, original.length]);
    const output = clipboardText('previous clipboard');
    pressModeledEdit(target, 'c', () => defaults.copy(output));
    expect(output.getData('text/plain')).toBe(original);
    expect(text()).toBe(original);
    pressModeledEdit(target, 'x', () => defaults.cut(output));
    expect(output.getData('text/plain')).toBe(original);
    expect(text()).toBe('');
    expect(editSelection(target)).toEqual([0, 0]);

    // This transfer is independently seeded, not copied from the fixture's
    // output or an application clipboard service.
    const incoming = clipboardText(inserted);
    pressModeledEdit(target, 'v', () => defaults.paste(incoming));
    expect(text()).toBe(inserted);
    expect(editSelection(target)).toEqual([inserted.length, inserted.length]);
    pressModeledEdit(target, 'z', defaults.undo);
    expect(text()).toBe('');
    pressModeledEdit(target, 'z', defaults.redo, { shiftKey: true });
    expect(text()).toBe(inserted);
    expect(inputTypes).toEqual(['deleteByCut', 'insertFromPaste', 'historyUndo', 'historyRedo']);
    expect(events).toEqual(['copy', 'cut', 'paste']);
    expect(output.getData('text/plain')).toBe(original);
    expect(target).toHaveFocus();
    expect(document.documentElement.lang).toBe(locale);
    expect(document.body.getAttribute('theme-mode')).toBe(theme === 'dark' ? 'dark' : null);
  });

  test.each(kinds)('%s respects page cancellation at keyboard, clipboard and beforeinput stages', (kind) => {
    const { target, text } = fixture(kind);
    const defaults = modelPlainTextEditing(target);
    const inputs = rs.fn();
    const copies = rs.fn();
    target.addEventListener('input', inputs);
    target.addEventListener('copy', copies);
    selectEditText(target, 0, 5);

    const cancelKey = (event: Event) => event.preventDefault();
    target.addEventListener('keydown', cancelKey, { once: true });
    const output = clipboardText('untouched');
    expect(pressModeledEdit(target, 'c', () => defaults.copy(output)).defaultPrevented).toBe(true);
    expect(copies).not.toHaveBeenCalled();
    expect(output.getData('text/plain')).toBe('untouched');
    expect(text()).toBe('alpha beta');

    target.addEventListener(
      'copy',
      (event) => {
        (event as ClipboardEvent).clipboardData?.setData('text/plain', 'page-owned output');
        event.preventDefault();
      },
      { once: true },
    );
    pressModeledEdit(target, 'c', () => defaults.copy(output));
    expect(output.getData('text/plain')).toBe('page-owned output');
    expect(copies).toHaveBeenCalledTimes(1);
    target.addEventListener('cut', cancelKey, { once: true });
    pressModeledEdit(target, 'x', () => defaults.cut(output));
    expect(text()).toBe('alpha beta');
    expect(output.getData('text/plain')).toBe('page-owned output');

    target.addEventListener('beforeinput', cancelKey, { once: true });
    pressModeledEdit(target, 'v', () => defaults.paste(clipboardText('blocked')));
    expect(text()).toBe('alpha beta');
    expect(inputs).not.toHaveBeenCalled();
    expect(defaults.undo()).toBe(false);
    pressModeledEdit(target, 'v', () => defaults.paste(clipboardText('allowed')));
    expect(text()).toBe('allowed beta');
    expect(inputs).toHaveBeenCalledTimes(1);
  });

  test.each(kinds)('%s preserves empty states and read-only contents, then resumes editing', (kind) => {
    const { target, text, readOnly } = fixture(kind);
    const defaults = modelPlainTextEditing(target);
    const inputs = rs.fn();
    target.addEventListener('input', inputs);
    selectEditText(target, 5);
    const output = clipboardText('previous clipboard');
    pressModeledEdit(target, 'c', () => defaults.copy(output));
    pressModeledEdit(target, 'x', () => defaults.cut(output));
    expect(output.getData('text/plain')).toBe('previous clipboard');
    expect(defaults.undo()).toBe(false);
    expect(defaults.redo()).toBe(false);
    selectEditText(target, 0, 5);
    pressModeledEdit(target, 'v', () => defaults.paste(clipboardText('')));
    expect(text()).toBe('alpha beta');
    expect(inputs).not.toHaveBeenCalled();

    readOnly(true);
    pressModeledEdit(target, 'a', defaults.selectAll);
    pressModeledEdit(target, 'c', () => defaults.copy(output));
    expect(output.getData('text/plain')).toBe('alpha beta');
    pressModeledEdit(target, 'x', () => defaults.cut(output));
    pressModeledEdit(target, 'v', () => defaults.paste(clipboardText('rejected')));
    expect(text()).toBe('alpha beta');
    expect(inputs).not.toHaveBeenCalled();
    readOnly(false);
    pressModeledEdit(target, 'v', () => defaults.paste(clipboardText('recovered')));
    expect(text()).toBe('recovered');
    expect(inputs).toHaveBeenCalledTimes(1);
  });

  test.each(['input', 'textarea'] as const)('disabled %s has no modeled edit or clipboard output', (kind) => {
    const { target, text } = fixture(kind);
    const control = target as HTMLInputElement | HTMLTextAreaElement;
    const defaults = modelPlainTextEditing(control);
    const inputs = rs.fn();
    control.addEventListener('input', inputs);
    selectEditText(control, 0, 5);
    control.disabled = true;
    const output = clipboardText('untouched');
    defaults.copy(output);
    defaults.cut(output);
    defaults.paste(clipboardText('rejected'));
    expect(output.getData('text/plain')).toBe('untouched');
    expect(text()).toBe('alpha beta');
    expect(inputs).not.toHaveBeenCalled();
    control.disabled = false;
    control.focus();
    pressModeledEdit(control, 'v', () => defaults.paste(clipboardText('resumed')));
    expect(text()).toBe('resumed beta');
    expect(inputs).toHaveBeenCalledTimes(1);
  });

  test.each(kinds)('%s never redirects a default to a new focus, hidden or removed target', (kind) => {
    const old = fixture(kind);
    const defaults = modelPlainTextEditing(old.target);
    selectEditText(old.target, 0, 5);
    const other = fixture('input', 'other document');
    old.target.focus();
    old.target.addEventListener('keydown', () => other.target.focus(), { once: true });
    pressModeledEdit(old.target, 'v', () => defaults.paste(clipboardText('stale')));
    expect(old.text()).toBe('alpha beta');
    expect(other.text()).toBe('other document');
    expect(other.target).toHaveFocus();
    old.target.focus();
    old.container.hidden = true;
    defaults.paste(clipboardText('hidden'));
    old.container.hidden = false;
    old.dispose();
    defaults.paste(clipboardText('removed'));
    expect(old.text()).toBe('alpha beta');
    expect(other.text()).toBe('other document');
  });

  test.each(kinds)('%s leaves composition to its owner and accepts the next ordinary edit', (kind) => {
    const { target, text } = fixture(kind);
    const defaults = modelPlainTextEditing(target);
    selectEditText(target, 0, 5);
    fireEvent.compositionStart(target);
    const event = pressModeledEdit(target, 'v', () => defaults.paste(clipboardText('not committed')), {
      isComposing: true,
    });
    expect(event.defaultPrevented).toBe(false);
    expect(text()).toBe('alpha beta');
    fireEvent.compositionEnd(target);
    pressModeledEdit(target, 'v', () => defaults.paste(clipboardText('已提交')));
    expect(text()).toBe('已提交 beta');
  });
});
