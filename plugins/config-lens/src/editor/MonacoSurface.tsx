import { useEffect, useRef } from 'react';

import { type ConfigLensMessages, diagnosticMessage } from '../catalog.js';
import { signalConfigLensFirstInteractive } from '../first-interactive.js';
import { diagnosticToMarker } from '../language/markers.js';
import type { LanguageId, SafeDiagnostic } from '../language/protocol.js';
import { recordConfigLensStage } from '../startup-stages.js';
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
    const editorStarted = performance.now();
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
      recordConfigLensStage('editor', performance.now() - editorStarted);
      const workerStarted = performance.now();
      void waitForEditorWorkerReady().then(() => {
        if (!cancelled && stateRef.current?.model === model) {
          recordConfigLensStage('worker', performance.now() - workerStarted);
        }
      });
      let keyboardProbe = false;
      let firstInteractivePending = false;
      const keySubscription = editor.onKeyDown(() => {
        keyboardProbe = true;
      });
      const editorNode = editor.getDomNode?.();
      const armNativeTextInput = (event: Event) => {
        if (!(event instanceof InputEvent) || event.inputType === '' || event.inputType.startsWith('insert')) {
          keyboardProbe = true;
        }
      };
      editorNode?.addEventListener('beforeinput', armNativeTextInput, true);
      editorNode?.addEventListener('input', armNativeTextInput, true);
      const subscription = model.onDidChangeContent(() => {
        onInputRef.current(model.getValue());
        if (keyboardProbe && !firstInteractivePending) {
          firstInteractivePending = true;
          void waitForEditorWorkerReady().then(() => {
            if (!cancelled && stateRef.current?.model === model) signalConfigLensFirstInteractive();
          });
        }
      });
      const observer = new ResizeObserver(() => {
        editor.layout();
      });
      observer.observe(inputHostRef.current);
      const dispose = () => {
        observer.disconnect();
        editorNode?.removeEventListener('beforeinput', armNativeTextInput, true);
        editorNode?.removeEventListener('input', armNativeTextInput, true);
        keySubscription.dispose();
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
