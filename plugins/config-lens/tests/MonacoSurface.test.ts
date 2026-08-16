import { describe, expect, test } from '@rstest/core';
import type { editor, IRange } from 'monaco-editor';

import { observeMonacoLayout, replaceEditorContent } from '../src/editor/MonacoSurface.js';

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

  test('lays out one existing editor across continuous Host resize and disconnects on teardown', () => {
    let publishResize: ResizeObserverCallback | undefined;
    let observed: Element | undefined;
    let disconnected = false;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        publishResize = callback;
      }
      observe(element: Element) {
        observed = element;
      }
      disconnect() {
        disconnected = true;
      }
    }
    const element = document.createElement('section');
    let layouts = 0;
    const disconnect = observeMonacoLayout(
      element,
      () => {
        layouts += 1;
      },
      TestResizeObserver,
    );

    expect(observed).toBe(element);
    publishResize?.([], {} as ResizeObserver);
    publishResize?.([], {} as ResizeObserver);
    publishResize?.([], {} as ResizeObserver);
    expect(layouts).toBe(3);
    disconnect();
    expect(disconnected).toBe(true);
  });
});
