import { rs } from '@rstest/core';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { editor } from 'monaco-editor';
import { messagesFor } from '../src/catalog.js';
import { type EditorSurfaceProps, MonacoSurface } from '../src/editor/MonacoSurface.js';
import { disposeMonacoWorkers, loadMonaco } from '../src/editor/monaco.js';

// Model only platform primitives. All editor/model/command/widget code is real.
export class EditorWorkerDouble extends EventTarget {
  static instances: EditorWorkerDouble[] = [];
  readonly terminate = rs.fn();
  readonly postMessage = rs.fn();
  constructor() {
    super();
    EditorWorkerDouble.instances.push(this);
  }
}
export const installWorkerDouble = () => {
  rs.stubGlobal('Worker', EditorWorkerDouble);
};
export const releaseWorkers = () => {
  disposeMonacoWorkers();
  rs.unstubAllGlobals();
};
export const mountEditor = async (overrides: Partial<EditorSurfaceProps> = {}) => {
  let standalone: editor.IStandaloneCodeEditor | undefined;
  const locale = overrides.locale ?? 'en-US';
  const monaco = await loadMonaco(locale);
  const subscription = monaco.editor.onDidCreateEditor((created) => {
    standalone = created as editor.IStandaloneCodeEditor;
  });
  const onInput = rs.fn();
  let props: EditorSurfaceProps = {
    diagnostics: [],
    input: 'hello hello\nWorld',
    language: undefined,
    locale,
    messages: messagesFor(locale),
    onInput,
    theme: 'light',
    ...overrides,
  };
  const result = render(<MonacoSurface {...props} />);
  await waitFor(() => {
    if (standalone === undefined) throw new Error('Editor pending');
  });
  subscription.dispose();
  const instance = standalone as unknown as editor.IStandaloneCodeEditor;
  instance.layout({ width: 700, height: 300 });
  return {
    ...result,
    monaco,
    editor: instance,
    model: instance.getModel() as editor.ITextModel,
    onInput,
    openSearch: async () => {
      await act(async () => {
        instance.focus();
        fireEvent.keyDown(bodyInput(result.container), {
          key: 'f',
          code: 'KeyF',
          keyCode: 70,
          ...primaryModifier,
        });
      });
    },
    update: (next: Partial<EditorSurfaceProps>) => {
      props = { ...props, ...next };
      result.rerender(<MonacoSurface {...props} />);
    },
  };
};
export const queryInput = (container: Element): HTMLTextAreaElement => {
  const input = container.querySelector<HTMLTextAreaElement>('.find-widget .find-part textarea');
  if (input === null) throw new Error('Native Find input missing');
  return input;
};
export const primaryModifier = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };

export const bodyInput = (container: Element): HTMLTextAreaElement => {
  const input = container.querySelector<HTMLTextAreaElement>('.inputarea');
  if (input === null) throw new Error('Native editor input missing');
  return input;
};
