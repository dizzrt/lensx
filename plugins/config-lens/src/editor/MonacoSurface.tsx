import type { PluginRuntimeContext } from '@lensx/plugin-sdk';
import { useEffect, useRef } from 'react';

import { type ConfigLensMessages, diagnosticMessage } from '../catalog.js';
import { diagnosticToMarker } from '../language/markers.js';
import type { LanguageId, SafeDiagnostic } from '../language/protocol.js';
import { localClipboard } from './localClipboard.js';
import { disposeMonacoWorkers, loadMonaco, waitForEditorWorkerReady } from './monaco.js';

export interface EditorSurfaceProps {
  readonly diagnostics: readonly SafeDiagnostic[];
  readonly input: string;
  readonly language: LanguageId | undefined;
  readonly locale: PluginRuntimeContext['locale'];
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

// Reviewed 0.56.0 runtime options omitted from Monaco's public find interface.
const localFindOptions: import('monaco-editor').editor.IEditorFindOptions & {
  readonly globalFindClipboard: false;
  readonly history: 'never';
  readonly replaceHistory: 'never';
} = { globalFindClipboard: false, history: 'never', replaceHistory: 'never' };

export const MonacoSurface = ({
  diagnostics,
  input,
  language,
  locale,
  messages,
  onInput,
  theme,
}: EditorSurfaceProps) => {
  const inputHostRef = useRef<HTMLDivElement>(null);
  const initialLocaleRef = useRef(locale);
  const stateRef = useRef<
    | {
        readonly monaco: typeof import('monaco-editor');
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
    void loadMonaco(initialLocaleRef.current).then(async (monaco) => {
      const { registerSelectAllMenu } = await import('./contributions.js');
      if (cancelled || inputHostRef.current === null) return;
      const latest = latestRef.current;
      const model = monaco.editor.createModel(latest.input, latest.language ?? 'plaintext');
      const editor = monaco.editor.create(inputHostRef.current, {
        ariaLabel: latest.messages.inputLabel,
        automaticLayout: true,
        find: localFindOptions,
        model,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
      });
      const menu = registerSelectAllMenu(editor);
      editor.layout();
      void waitForEditorWorkerReady();
      const subscription = model.onDidChangeContent(() => {
        onInputRef.current(model.getValue());
      });
      const disconnectLayoutObserver = observeMonacoLayout(inputHostRef.current, () => editor.layout());
      const dispose = () => {
        disconnectLayoutObserver();
        subscription.dispose();
        menu.dispose();
        localClipboard.clearInternalState();
        monaco.editor.setModelMarkers(model, 'config-lens', []);
        editor.dispose();
        model.dispose();
      };
      stateRef.current = { monaco, model, editor, dispose };
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
      disposeMonacoWorkers();
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (state === undefined) return;
    const { monaco, editor, model } = state;
    replaceEditorContent(editor, model, input);
    // Resources were registered before model creation. These updates are
    // synchronous, so an old async language load cannot overwrite a new choice.
    monaco.editor.setModelLanguage(model, language ?? 'plaintext');
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    editor.updateOptions({ ariaLabel: messages.inputLabel });
    monaco.editor.setModelMarkers(
      model,
      'config-lens',
      diagnostics.map((item) => diagnosticToMarker(model, item, diagnosticMessage(messages, item))),
    );
  }, [diagnostics, input, language, messages, theme]);

  return (
    <div className="config-lens-editor" data-editor="single">
      <section aria-label={messages.inputLabel} className="config-lens-editor__surface" ref={inputHostRef} />
      <div aria-live="polite" className="config-lens-editor__diagnostics">
        {diagnostics.map((item) => diagnosticMessage(messages, item)).join('\n')}
      </div>
    </div>
  );
};
