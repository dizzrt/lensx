import { useEffect, useRef } from 'react';

import { type ConfigLensMessages, diagnosticMessage } from '../catalog.js';
import { diagnosticToMarker } from '../language/markers.js';
import type { LanguageId, SafeDiagnostic } from '../language/protocol.js';
import { loadMonaco, waitForEditorWorkerReady } from './monaco.js';

export interface EditorSurfaceProps {
  readonly diagnostics: readonly SafeDiagnostic[];
  readonly input: string;
  readonly language: LanguageId;
  readonly messages: ConfigLensMessages;
  readonly onInput: (value: string) => void;
  readonly theme: 'light' | 'dark';
}

type UndoableEditor = Pick<import('monaco-editor').editor.IStandaloneCodeEditor, 'pushUndoStop'>;
type UndoableModel = Pick<
  import('monaco-editor').editor.ITextModel,
  'getFullModelRange' | 'getValue' | 'pushEditOperations'
>;

export const replaceEditorContent = (editor: UndoableEditor, model: UndoableModel, input: string): boolean => {
  if (model.getValue() === input) return false;
  editor.pushUndoStop();
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: input }], () => null);
  editor.pushUndoStop();
  return true;
};

type ResizeObserverConstructor = new (
  callback: ResizeObserverCallback,
) => Pick<ResizeObserver, 'disconnect' | 'observe'>;

export const observeMonacoLayout = (
  element: Element,
  layout: () => void,
  Observer: ResizeObserverConstructor = ResizeObserver,
) => {
  const observer = new Observer(() => layout());
  observer.observe(element);
  return () => observer.disconnect();
};

export const MonacoSurface = ({ diagnostics, input, language, messages, onInput, theme }: EditorSurfaceProps) => {
  const inputHostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<
    | {
        readonly model: import('monaco-editor').editor.ITextModel;
        readonly editor: import('monaco-editor').editor.IStandaloneCodeEditor;
        readonly dispose: () => void;
      }
    | undefined
  >(undefined);
  const onInputRef = useRef(onInput);
  const latestRef = useRef({ diagnostics, input, language, messages, theme });
  onInputRef.current = onInput;
  latestRef.current = { diagnostics, input, language, messages, theme };

  useEffect(() => {
    let cancelled = false;
    void loadMonaco().then((monaco) => {
      if (cancelled || inputHostRef.current === null) return;
      const latest = latestRef.current;
      const model = monaco.editor.createModel(latest.input, latest.language);
      const editor = monaco.editor.create(inputHostRef.current, {
        automaticLayout: true,
        model,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
      });
      editor.layout();
      void waitForEditorWorkerReady();
      const subscription = model.onDidChangeContent(() => {
        onInputRef.current(model.getValue());
      });
      const disconnectLayoutObserver = observeMonacoLayout(inputHostRef.current, () => editor.layout());
      const dispose = () => {
        disconnectLayoutObserver();
        subscription.dispose();
        monaco.editor.setModelMarkers(model, 'config-lens', []);
        editor.dispose();
        model.dispose();
      };
      stateRef.current = { model, editor, dispose };
      monaco.editor.setTheme(latest.theme === 'dark' ? 'vs-dark' : 'vs');
      monaco.editor.setModelMarkers(
        model,
        'config-lens',
        latest.diagnostics.map((item) => diagnosticToMarker(model, item, diagnosticMessage(latest.messages, item))),
      );
    });
    return () => {
      cancelled = true;
      stateRef.current?.dispose();
      stateRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (state === undefined) return;
    replaceEditorContent(state.editor, state.model, input);
  }, [input]);

  useEffect(() => {
    const state = stateRef.current;
    if (state === undefined) return;
    void loadMonaco().then((monaco) => {
      monaco.editor.setModelLanguage(state.model, language);
    });
  }, [language]);

  useEffect(() => {
    void loadMonaco().then((monaco) => {
      const state = stateRef.current;
      if (state === undefined) return;
      monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
      monaco.editor.setModelMarkers(
        state.model,
        'config-lens',
        diagnostics.map((item) => diagnosticToMarker(state.model, item, diagnosticMessage(messages, item))),
      );
    });
  }, [diagnostics, messages, theme]);

  return (
    <div className="config-lens-editor" data-editor="single">
      <section aria-label={messages.inputLabel} className="config-lens-editor__surface" ref={inputHostRef} />
    </div>
  );
};
