import { describe, expect, test } from '@rstest/core';
import type { editor, IRange } from 'monaco-editor';

import { replaceEditorContent } from '../src/editor/MonacoSurface.js';

describe('single Monaco editor replacement', () => {
  test('groups one full-model edit between undo stops', () => {
    const events: string[] = [];
    let value = 'before';
    const range = {} as IRange;
    const model = {
      getFullModelRange: () => range,
      getValue: () => value,
      pushEditOperations: (
        _before: unknown,
        operations: readonly { readonly range: IRange; readonly text: string }[],
      ) => {
        events.push('edit');
        expect(operations).toEqual([{ range, text: 'after' }]);
        value = operations[0]?.text ?? value;
        return null;
      },
    } as unknown as editor.ITextModel;
    const standaloneEditor = {
      pushUndoStop: () => {
        events.push('undo-stop');
        return true;
      },
    } as unknown as editor.IStandaloneCodeEditor;

    expect(replaceEditorContent(standaloneEditor, model, 'after')).toBe(true);
    expect(events).toEqual(['undo-stop', 'edit', 'undo-stop']);
    expect(value).toBe('after');
    expect(replaceEditorContent(standaloneEditor, model, 'after')).toBe(false);
    expect(events).toEqual(['undo-stop', 'edit', 'undo-stop']);
  });
});
