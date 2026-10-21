import { describe, expect, test } from '@rstest/core';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { bodyInput, deliverClipboardShortcut, mountEditor, pressPrimary, queryInput } from './monaco-fixture.js';

const pressWordSelection = (target: HTMLElement, direction: 'Left' | 'Right'): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: `Arrow${direction}`,
    code: `Arrow${direction}`,
    keyCode: direction === 'Left' ? 37 : 39,
    shiftKey: true,
    ...(process.platform === 'darwin' ? { altKey: true } : { ctrlKey: true }),
  });
  fireEvent(target, event);
  return event;
};

// These cases use the production loader before the first editor is constructed.
// No test-side contribution import or keybinding override supplies the behavior.
export const registerWordSelectionCases = (locale: 'en-US' | 'zh-CN') => {
  describe(`${locale} word selection`, () => {
    test('word movement preserves native typing-group boundaries without adding content edits', async () => {
      const view = await mountEditor({ locale, input: '' });
      const body = bodyInput(view.container);
      view.editor.focus();
      try {
        // Leave this typing group open. The official word command owns its
        // grouping boundary; the test must not supply an explicit undo stop.
        act(() => view.editor.trigger('keyboard', 'type', { text: 'alpha' }));
        expect(view.model.getValue()).toBe('alpha');
        expect(view.onInput).toHaveBeenLastCalledWith('alpha');
        const typingNotifications = view.onInput.mock.calls.length;
        const version = view.model.getVersionId();
        const alternativeVersion = view.model.getAlternativeVersionId();
        expect(pressWordSelection(body, 'Left').defaultPrevented).toBe(true);
        const selection = view.editor.getSelection();
        expect(view.model.getValueInRange(selection as NonNullable<typeof selection>)).toBe('alpha');
        expect(pressWordSelection(body, 'Right').defaultPrevented).toBe(true);
        expect(view.editor.getSelection()?.isEmpty()).toBe(true);
        expect(view.editor.getPosition()).toMatchObject({ lineNumber: 1, column: 6 });
        expect(view.model.getValue()).toBe('alpha');
        expect(view.model.getVersionId()).toBe(version);
        expect(view.model.getAlternativeVersionId()).toBe(alternativeVersion);
        expect(view.onInput).toHaveBeenCalledTimes(typingNotifications);

        act(() => view.editor.trigger('keyboard', 'type', { text: 'beta' }));
        expect(view.model.getValue()).toBe('alphabeta');
        expect(view.onInput).toHaveBeenLastCalledWith('alphabeta');
        view.onInput.mockClear();
        await act(async () => {
          pressPrimary(body, 'z');
        });
        expect(view.model.getValue()).toBe('alpha');
        expect(view.model.canUndo()).toBe(true);
        await act(async () => {
          pressPrimary(body, 'z');
        });
        expect(view.model.getValue()).toBe('');
        expect(view.model.canUndo()).toBe(false);
        await act(async () => {
          pressPrimary(body, 'z', true);
        });
        expect(view.model.getValue()).toBe('alpha');
        await act(async () => {
          pressPrimary(body, 'z', true);
        });
        expect(view.model.getValue()).toBe('alphabeta');
        expect(view.model.canRedo()).toBe(false);
        expect(view.onInput.mock.calls.map(([value]) => value)).toEqual(['alpha', '', 'alpha', 'alphabeta']);
      } finally {
        view.unmount();
      }
    });

    test.each([
      'light',
      'dark',
    ] as const)('%s preserves anchors while extending and reversing in both directions', async (theme) => {
      const view = await mountEditor({ locale, theme, input: 'alpha beta' });
      const body = bodyInput(view.container);
      view.editor.focus();
      view.editor.setPosition({ lineNumber: 1, column: 11 });
      deliverClipboardShortcut(body, 'paste', ' gamma');
      await waitFor(() => expect(view.model.getValue()).toBe('alpha beta gamma'));
      const version = view.model.getVersionId();
      const alternativeVersion = view.model.getAlternativeVersionId();
      view.onInput.mockClear();
      try {
        const expectSelection = (anchor: number, position: number, text: string) => {
          const selection = view.editor.getSelection();
          expect(selection).toMatchObject({
            selectionStartLineNumber: 1,
            selectionStartColumn: anchor,
            positionLineNumber: 1,
            positionColumn: position,
          });
          expect(view.model.getValueInRange(selection as NonNullable<typeof selection>)).toBe(text);
        };
        view.editor.setPosition({ lineNumber: 1, column: 17 });
        for (const [direction, position, text] of [
          ['Left', 12, 'gamma'],
          ['Left', 7, 'beta gamma'],
          ['Right', 11, ' gamma'],
          ['Right', 17, ''],
        ] as const) {
          expect(pressWordSelection(body, direction).defaultPrevented).toBe(true);
          expectSelection(17, position, text);
        }
        view.editor.setPosition({ lineNumber: 1, column: 1 });
        for (const [direction, position, text] of [
          ['Right', 6, 'alpha'],
          ['Right', 11, 'alpha beta'],
          ['Left', 7, 'alpha '],
          ['Left', 1, ''],
        ] as const) {
          expect(pressWordSelection(body, direction).defaultPrevented).toBe(true);
          expectSelection(1, position, text);
        }
        expect(view.editor.hasTextFocus()).toBe(true);
        expect(view.model.getValue()).toBe('alpha beta gamma');
        expect(view.model.getVersionId()).toBe(version);
        expect(view.model.getAlternativeVersionId()).toBe(alternativeVersion);
        expect(view.model.canUndo()).toBe(true);
        expect(view.model.canRedo()).toBe(false);
        expect(view.onInput).not.toHaveBeenCalled();
        await act(async () => {
          pressPrimary(body, 'z');
        });
        expect(view.model.getValue()).toBe('alpha beta');
        expect(view.model.canUndo()).toBe(false);
        await act(async () => {
          pressPrimary(body, 'z', true);
        });
        expect(view.model.getValue()).toBe('alpha beta gamma');
        expect(view.model.canRedo()).toBe(false);
        expect(view.onInput).toHaveBeenCalledTimes(2);
      } finally {
        view.unmount();
      }
    });

    test.each([
      'light',
      'dark',
    ] as const)('%s keeps empty boundaries safe and allows read-only word selection', async (theme) => {
      for (const input of ['', 'alpha beta']) {
        const view = await mountEditor({ locale, theme, input });
        const body = bodyInput(view.container);
        view.editor.updateOptions({ readOnly: input !== '' });
        view.editor.focus();
        const version = view.model.getVersionId();
        try {
          expect(pressWordSelection(body, 'Left').defaultPrevented).toBe(true);
          expect(view.editor.getSelection()?.isEmpty()).toBe(true);
          expect(view.editor.getPosition()).toMatchObject({ lineNumber: 1, column: 1 });
          expect(pressWordSelection(body, 'Right').defaultPrevented).toBe(true);
          const selection = view.editor.getSelection();
          expect(view.model.getValueInRange(selection as NonNullable<typeof selection>)).toBe(
            input === '' ? '' : 'alpha',
          );
          view.editor.setPosition({ lineNumber: 1, column: input.length + 1 });
          expect(pressWordSelection(body, 'Right').defaultPrevented).toBe(true);
          expect(view.editor.getSelection()?.isEmpty()).toBe(true);
          expect(view.editor.getPosition()).toMatchObject({ lineNumber: 1, column: input.length + 1 });
          expect(pressWordSelection(body, 'Left').defaultPrevented).toBe(true);
          const reverse = view.editor.getSelection();
          expect(view.model.getValueInRange(reverse as NonNullable<typeof reverse>)).toBe(input === '' ? '' : 'beta');
          expect(view.model.getValue()).toBe(input);
          expect(view.model.getVersionId()).toBe(version);
          expect(view.model.canUndo()).toBe(false);
          expect(view.model.canRedo()).toBe(false);
          expect(view.onInput).not.toHaveBeenCalled();
        } finally {
          view.unmount();
        }
      }
    });

    test.each([
      'light',
      'dark',
    ] as const)('%s leaves Find and other input focus outside body word selection', async (theme) => {
      const view = await mountEditor({ locale, theme, input: 'alpha beta gamma' });
      await view.openSearch();
      const query = queryInput(view.container);
      fireEvent.input(query, { target: { value: 'query words' } });
      query.setSelectionRange(2, 5);
      const originalSelection = view.editor.getSelection();
      const version = view.model.getVersionId();
      const otherInput = document.createElement('input');
      otherInput.value = 'other input';
      document.body.append(otherInput);
      try {
        for (const target of [query, otherInput]) {
          target.focus();
          for (const direction of ['Left', 'Right'] as const) {
            expect(pressWordSelection(target, direction).defaultPrevented).toBe(false);
            expect(target).toHaveFocus();
            expect(view.editor.hasTextFocus()).toBe(false);
            expect(view.editor.getSelection()).toEqual(originalSelection);
          }
        }
        view.editor.focus();
        view.editor.setPosition({ lineNumber: 1, column: 17 });
        expect(pressWordSelection(bodyInput(view.container), 'Left').defaultPrevented).toBe(true);
        const restoredSelection = view.editor.getSelection();
        expect(view.model.getValueInRange(restoredSelection as NonNullable<typeof restoredSelection>)).toBe('gamma');
        expect(view.editor.hasTextFocus()).toBe(true);
        // Browser default word selection in ordinary inputs is not modeled here.
        expect(query).toHaveValue('query words');
        expect(otherInput).toHaveValue('other input');
        expect(view.model.getValue()).toBe('alpha beta gamma');
        expect(view.model.getVersionId()).toBe(version);
        expect(view.model.canUndo()).toBe(false);
        expect(view.model.canRedo()).toBe(false);
        expect(view.onInput).not.toHaveBeenCalled();
      } finally {
        otherInput.remove();
        view.unmount();
      }
    });
  });
};
