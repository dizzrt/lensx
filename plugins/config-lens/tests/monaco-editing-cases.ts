import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { localClipboard } from '../src/editor/localClipboard.js';
import {
  bodyInput,
  deliverClipboardShortcut,
  deliverComposition,
  modelTextareaDefaults,
  mountEditor,
  pressPrimary,
  queryInput,
} from './monaco-fixture.js';

// Each caller is an isolated NLS module graph. Only missing browser primitives
// are modeled; editor/model, command dispatch, clipboard handlers and Find are real.
export const registerNativeEditingCases = (locale: 'en-US' | 'zh-CN') => {
  describe(`${locale} delivered editing events`, () => {
    test.each([
      'light',
      'dark',
    ] as const)('%s body clipboard handlers use independent event data and keyboard undo', async (theme) => {
      const view = await mountEditor({ locale, theme, input: 'alpha beta' });
      const input = bodyInput(view.container);
      view.editor.focus();
      view.editor.setSelection(new view.monaco.Range(1, 1, 1, 6));
      await localClipboard.writeText('service-only sentinel');
      const read = rs.spyOn(localClipboard, 'readText');
      const write = rs.spyOn(localClipboard, 'writeText');
      try {
        const copied = deliverClipboardShortcut(input, 'copy');
        expect(copied.key?.defaultPrevented).toBe(false);
        expect(copied.event?.defaultPrevented).toBe(true);
        expect(copied.data.getData('text/plain')).toBe('alpha');
        expect(view.model.getValue()).toBe('alpha beta');
        expect(view.onInput).not.toHaveBeenCalled();

        const cut = deliverClipboardShortcut(input, 'cut');
        expect(cut.data.getData('text/plain')).toBe('alpha');
        await waitFor(() => expect(view.model.getValue()).toBe(' beta'));
        expect(view.onInput).toHaveBeenCalledTimes(1);
        expect(view.editor.getPosition()).toMatchObject({ lineNumber: 1, column: 1 });
        await act(async () => {
          pressPrimary(input, 'z');
        });
        expect(view.model.getValue()).toBe('alpha beta');
        expect(view.onInput).toHaveBeenCalledTimes(2);
        await act(async () => {
          pressPrimary(input, 'z', true);
        });
        expect(view.model.getValue()).toBe(' beta');
        expect(view.onInput).toHaveBeenCalledTimes(3);

        const pasted = deliverClipboardShortcut(input, 'paste', '外部');
        expect(pasted.data).not.toBe(copied.data);
        expect(pasted.key?.defaultPrevented).toBe(false);
        expect(pasted.event?.defaultPrevented).toBe(true);
        await waitFor(() => expect(view.model.getValue()).toBe('外部 beta'));
        expect(view.onInput).toHaveBeenCalledTimes(4);
        expect(view.editor.getPosition()).toMatchObject({ lineNumber: 1, column: 3 });
        await act(async () => {
          pressPrimary(input, 'z');
        });
        expect(view.model.getValue()).toBe(' beta');
        await act(async () => {
          pressPrimary(input, 'z', true);
        });
        expect(view.model.getValue()).toBe('外部 beta');
        expect(view.onInput).toHaveBeenCalledTimes(6);
        expect(read).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
      } finally {
        read.mockRestore();
        write.mockRestore();
        view.unmount();
      }
    });

    test.each([
      'light',
      'dark',
    ] as const)('%s Find uses modeled native edits without consuming body undo', async (theme) => {
      const view = await mountEditor({ locale, theme, input: 'body' });
      const body = bodyInput(view.container);
      view.editor.focus();
      pressPrimary(body, 'a');
      expect(view.editor.getSelection()?.equalsRange(view.model.getFullModelRange())).toBe(true);
      deliverClipboardShortcut(body, 'paste', 'changed body');
      await waitFor(() => expect(view.model.getValue()).toBe('changed body'));
      expect(view.onInput).toHaveBeenCalledTimes(1);
      await view.openSearch();
      const query = queryInput(view.container);
      fireEvent.input(query, { target: { value: 'query text' } });
      query.setSelectionRange(0, 5);
      const defaults = modelTextareaDefaults(query);
      const queryChanges = rs.fn();
      query.addEventListener('input', queryChanges);
      try {
        const cancel = (event: KeyboardEvent) => event.preventDefault();
        query.addEventListener('keydown', cancel);
        const cancelled = deliverClipboardShortcut(query, 'paste', 'cancelled query edit');
        query.removeEventListener('keydown', cancel);
        expect(cancelled.key?.defaultPrevented).toBe(true);
        expect(cancelled.event).toBeUndefined();
        expect(query).toHaveValue('query text');
        expect(queryChanges).not.toHaveBeenCalled();
        const copy = deliverClipboardShortcut(query, 'copy');
        defaults.applyClipboard(copy.event);
        expect(copy.event?.defaultPrevented).toBe(false);
        expect(copy.data.getData('text/plain')).toBe('query');
        expect(queryChanges).not.toHaveBeenCalled();
        const cut = deliverClipboardShortcut(query, 'cut');
        defaults.applyClipboard(cut.event);
        expect(cut.data.getData('text/plain')).toBe('query');
        expect(query).toHaveValue(' text');
        expect([query.selectionStart, query.selectionEnd]).toEqual([0, 0]);
        const paste = deliverClipboardShortcut(query, 'paste', '查找');
        defaults.applyClipboard(paste.event);
        expect(query).toHaveValue('查找 text');
        expect([query.selectionStart, query.selectionEnd]).toEqual([2, 2]);
        pressPrimary(query, 'a');
        expect([query.selectionStart, query.selectionEnd]).toEqual([0, 7]);
        await act(async () => {
          pressPrimary(query, 'z');
        });
        expect(query).toHaveValue(' text');
        await act(async () => {
          pressPrimary(query, 'z', true);
        });
        expect(query).toHaveValue('查找 text');
        expect(defaults.execCommand.mock.calls.map(([command]) => command)).toEqual(['selectAll', 'undo', 'redo']);
        expect(queryChanges).toHaveBeenCalledTimes(4);
        expect(view.model.getValue()).toBe('changed body');
        expect(view.onInput).toHaveBeenCalledTimes(1);
        expect(view.model.canUndo()).toBe(true);
        fireEvent.keyDown(query, { key: 'Escape', code: 'Escape', keyCode: 27 });
        expect(view.editor.hasTextFocus()).toBe(true);
        await act(async () => {
          pressPrimary(body, 'z');
        });
        expect(view.model.getValue()).toBe('body');
        expect(view.onInput).toHaveBeenCalledTimes(2);
        expect(defaults.execCommand).toHaveBeenCalledTimes(3);
        expect(query).toHaveValue('查找 text');
        await view.openSearch();
        // A new Find command legitimately seeds the restored body selection.
        expect(query).toHaveValue('body');
        expect(query).toHaveFocus();
      } finally {
        defaults.restore();
        query.removeEventListener('input', queryChanges);
        view.unmount();
      }
    });

    test('empty clipboard, selection and history preserve each target’s own semantics', async () => {
      const view = await mountEditor({ locale, input: 'line one\nline two' });
      const body = bodyInput(view.container);
      view.editor.focus();
      await act(async () => {
        pressPrimary(body, 'z');
        pressPrimary(body, 'z', true);
      });
      deliverClipboardShortcut(body, 'paste');
      expect(view.model.getValue()).toBe('line one\nline two');
      expect(view.onInput).not.toHaveBeenCalled();
      expect(view.editor.getOption(view.monaco.editor.EditorOption.emptySelectionClipboard)).toBe(true);
      const copy = deliverClipboardShortcut(body, 'copy');
      expect(copy.data.getData('text/plain')).toBe('line one\n');
      const cut = deliverClipboardShortcut(body, 'cut');
      expect(cut.data.getData('text/plain')).toBe('line one\n');
      await waitFor(() => expect(view.model.getValue()).toBe('line two'));
      expect(view.onInput).toHaveBeenCalledTimes(1);
      await view.openSearch();
      const query = queryInput(view.container);
      fireEvent.input(query, { target: { value: 'query' } });
      query.setSelectionRange(2, 2);
      const defaults = modelTextareaDefaults(query);
      try {
        const queryCopy = deliverClipboardShortcut(query, 'copy', 'existing copy data');
        defaults.applyClipboard(queryCopy.event);
        expect(queryCopy.data.getData('text/plain')).toBe('existing copy data');
        const queryCut = deliverClipboardShortcut(query, 'cut', 'existing cut data');
        defaults.applyClipboard(queryCut.event);
        expect(queryCut.data.getData('text/plain')).toBe('existing cut data');
        defaults.applyClipboard(deliverClipboardShortcut(query, 'paste').event);
        await act(async () => {
          pressPrimary(query, 'z');
          pressPrimary(query, 'z', true);
        });
        expect(query).toHaveValue('query');
        expect([query.selectionStart, query.selectionEnd]).toEqual([2, 2]);
        expect(view.model.getValue()).toBe('line two');
        expect(view.onInput).toHaveBeenCalledTimes(1);
      } finally {
        defaults.restore();
        view.unmount();
      }
    });

    test('read-only body and read-only or disabled Find never mutate content or another focus target', async () => {
      const view = await mountEditor({ locale, input: 'protected' });
      const body = bodyInput(view.container);
      view.editor.updateOptions({ readOnly: true });
      view.editor.focus();
      pressPrimary(body, 'a');
      expect(deliverClipboardShortcut(body, 'copy').data.getData('text/plain')).toBe('protected');
      deliverClipboardShortcut(body, 'cut');
      deliverClipboardShortcut(body, 'paste', 'replacement');
      await act(async () => {
        pressPrimary(body, 'z');
        pressPrimary(body, 'z', true);
      });
      expect(view.model.getValue()).toBe('protected');
      expect(view.onInput).not.toHaveBeenCalled();
      await view.openSearch();
      const query = queryInput(view.container);
      fireEvent.input(query, { target: { value: 'query' } });
      query.select();
      query.readOnly = true;
      const defaults = modelTextareaDefaults(query);
      try {
        const copy = deliverClipboardShortcut(query, 'copy');
        defaults.applyClipboard(copy.event);
        expect(copy.data.getData('text/plain')).toBe('query');
        const cut = deliverClipboardShortcut(query, 'cut', 'existing read-only cut data');
        defaults.applyClipboard(cut.event);
        expect(cut.data.getData('text/plain')).toBe('existing read-only cut data');
        defaults.applyClipboard(deliverClipboardShortcut(query, 'paste', 'replacement').event);
        expect(query).toHaveValue('query');
        query.disabled = true;
        view.editor.focus();
        expect(deliverClipboardShortcut(query, 'paste', 'late').event).toBeUndefined();
        expect(query).toHaveValue('query');
        expect(view.editor.hasTextFocus()).toBe(true);
        expect(view.model.getValue()).toBe('protected');
        expect(view.onInput).not.toHaveBeenCalled();
      } finally {
        defaults.restore();
        view.unmount();
      }
    });

    test.each([
      'focus',
      'disabled',
      'readOnly',
    ] as const)('Find beforeinput %s changes stop editing the original query', async (invalidation) => {
      const view = await mountEditor({ locale, input: 'body state' });
      await view.openSearch();
      const query = queryInput(view.container);
      fireEvent.input(query, { target: { value: 'query' } });
      query.select();
      const defaults = modelTextareaDefaults(query);
      const queryChanges = rs.fn();
      const invalidate = () => {
        if (invalidation === 'focus') view.editor.focus();
        else query[invalidation] = true;
      };
      query.addEventListener('beforeinput', invalidate);
      query.addEventListener('input', queryChanges);
      try {
        const paste = deliverClipboardShortcut(query, 'paste', 'replacement');
        expect(paste.event).toBeDefined();
        defaults.applyClipboard(paste.event);
        expect(query).toHaveValue('query');
        expect(queryChanges).not.toHaveBeenCalled();
        expect(view.model.getValue()).toBe('body state');
        expect(view.onInput).not.toHaveBeenCalled();
        if (invalidation === 'focus') {
          expect(view.editor.hasTextFocus()).toBe(true);
          expect(bodyInput(view.container)).toHaveFocus();
        } else {
          expect(query[invalidation]).toBe(true);
        }
      } finally {
        query.removeEventListener('beforeinput', invalidate);
        query.removeEventListener('input', queryChanges);
        defaults.restore();
        view.unmount();
      }
    });

    test.each([
      'focus',
      'remove',
      'disabled',
    ] as const)('keydown %s changes prevent clipboard delivery to the former body target', async (invalidation) => {
      const view = await mountEditor({ locale, input: 'body state' });
      await view.openSearch();
      const query = queryInput(view.container);
      fireEvent.input(query, { target: { value: 'query state' } });
      const body = bodyInput(view.container);
      view.editor.focus();
      pressPrimary(body, 'a');
      const clipboardEvents = rs.fn();
      const queryChanges = rs.fn();
      const invalidate = () => {
        if (invalidation === 'focus') query.focus();
        else if (invalidation === 'remove') body.remove();
        else body.disabled = true;
      };
      body.addEventListener('keydown', invalidate);
      body.addEventListener('paste', clipboardEvents);
      query.addEventListener('paste', clipboardEvents);
      query.addEventListener('input', queryChanges);
      try {
        const paste = deliverClipboardShortcut(body, 'paste', 'late replacement');
        expect(paste.key?.defaultPrevented).toBe(false);
        expect(paste.event).toBeUndefined();
        expect(clipboardEvents).not.toHaveBeenCalled();
        expect(view.model.getValue()).toBe('body state');
        expect(view.onInput).not.toHaveBeenCalled();
        expect(query).toHaveValue('query state');
        expect(queryChanges).not.toHaveBeenCalled();
        if (invalidation === 'focus') expect(query).toHaveFocus();
        else if (invalidation === 'remove') expect(body.isConnected).toBe(false);
        else expect(body).toBeDisabled();
      } finally {
        body.removeEventListener('keydown', invalidate);
        body.removeEventListener('paste', clipboardEvents);
        query.removeEventListener('paste', clipboardEvents);
        query.removeEventListener('input', queryChanges);
        view.unmount();
      }
    });

    test('cancelled Web shortcuts skip default clipboard delivery and later composition edits recover', async () => {
      const view = await mountEditor({ locale, input: '' });
      const body = bodyInput(view.container);
      view.editor.focus();
      const cancel = (event: KeyboardEvent) => event.preventDefault();
      body.addEventListener('keydown', cancel);
      const cancelled = deliverClipboardShortcut(body, 'paste', 'must not be inserted');
      expect(cancelled.key?.defaultPrevented).toBe(true);
      expect(cancelled.event).toBeUndefined();
      expect(view.model.getValue()).toBe('');
      expect(view.onInput).not.toHaveBeenCalled();
      body.removeEventListener('keydown', cancel);
      fireEvent.keyDown(body, { key: 'Process', keyCode: 229, isComposing: true });
      deliverComposition(body, 'compositionstart', '');
      deliverComposition(body, 'compositionupdate', '中');
      deliverComposition(body, 'compositionend', '中文');
      expect(view.model.getValue()).toBe('中文');
      expect(view.onInput).toHaveBeenCalledTimes(2);
      deliverClipboardShortcut(body, 'paste', ' recovered');
      await waitFor(() => expect(view.model.getValue()).toBe('中文 recovered'));
      expect(view.onInput).toHaveBeenCalledTimes(3);
      await view.openSearch();
      const query = queryInput(view.container);
      expect(query).toHaveFocus();
      expect(deliverClipboardShortcut(body, 'paste', 'wrong target').event).toBeUndefined();
      expect(view.model.getValue()).toBe('中文 recovered');
      fireEvent.keyDown(query, { key: 'Escape', code: 'Escape', keyCode: 27 });
      expect(view.editor.hasTextFocus()).toBe(true);
      view.unmount();
    });
  });
};
