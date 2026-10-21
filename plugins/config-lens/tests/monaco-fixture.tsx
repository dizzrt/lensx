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

export const pressPrimary = (target: HTMLElement, key: string, shiftKey = false): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode: key.toUpperCase().charCodeAt(0),
    shiftKey,
    ...primaryModifier,
  });
  fireEvent(target, event);
  return event;
};

export const deliverComposition = (target: HTMLElement, type: string, data: string): void => {
  const event = new CompositionEvent(type, { bubbles: true, data });
  // Happy DOM aliases CompositionEvent to Event and drops its data field.
  // Supply that platform payload; Monaco still owns all composition model edits.
  Object.defineProperty(event, 'data', { value: data });
  fireEvent(target, event);
};

// Happy DOM does not turn a key into a browser clipboard event. Model only that
// delivery step; Monaco's actual copy/cut/paste listeners perform every model edit.
// This is not evidence of AppKit delivery or a system clipboard round trip.
export const deliverClipboardShortcut = (target: HTMLTextAreaElement, kind: 'copy' | 'cut' | 'paste', text = '') => {
  const data = new DataTransfer();
  if (kind === 'paste' || text !== '') data.setData('text/plain', text);
  const eligible = () => target.isConnected && !target.disabled && target.ownerDocument.activeElement === target;
  if (!eligible()) return { data };
  const key = pressPrimary(target, { copy: 'c', cut: 'x', paste: 'v' }[kind]);
  // A page keydown handler may invalidate the original target without cancelling
  // the key. Do not deliver to the stale node or redirect it to the new focus.
  if (key.defaultPrevented || !eligible()) return { data, key };
  const event = new ClipboardEvent(kind, { bubbles: true, cancelable: true, clipboardData: data });
  fireEvent(target, event);
  return { data, key, event };
};

// Find is a native textarea, unlike Monaco's model-backed body. Happy DOM lacks
// browser default clipboard edits and the native undo stack. Keep those explicit,
// local to this input, and separate from Monaco's real command/focus selection.
export const modelTextareaDefaults = (input: HTMLTextAreaElement) => {
  interface Snapshot {
    readonly value: string;
    readonly start: number;
    readonly end: number;
  }
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  const snapshot = (): Snapshot => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd });
  const eligible = () => input.isConnected && !input.disabled && document.activeElement === input;
  const apply = (next: Snapshot, inputType: string) => {
    input.value = next.value;
    input.setSelectionRange(next.start, next.end);
    fireEvent.input(input, { inputType });
  };
  const originalExecCommand = document.execCommand;
  const execCommand = rs.fn((command: string) => {
    if (!eligible()) return false;
    if (command === 'selectAll') {
      input.select();
      return true;
    }
    if (input.readOnly || (command !== 'undo' && command !== 'redo')) return false;
    const source = command === 'undo' ? past : future;
    const destination = command === 'undo' ? future : past;
    const next = source.pop();
    if (next === undefined) return false;
    destination.push(snapshot());
    apply(next, command === 'undo' ? 'historyUndo' : 'historyRedo');
    return true;
  });
  document.execCommand = execCommand;
  return {
    execCommand,
    applyClipboard: (event: ClipboardEvent | undefined) => {
      if (event === undefined || event.defaultPrevented || !eligible()) return;
      const current = snapshot();
      if (event.type === 'copy' || event.type === 'cut') {
        if (current.start === current.end || (event.type === 'cut' && input.readOnly)) return;
        event.clipboardData?.setData('text/plain', current.value.slice(current.start, current.end));
      }
      if (event.type === 'copy' || input.readOnly) return;
      const replacement = event.type === 'paste' ? (event.clipboardData?.getData('text/plain') ?? '') : '';
      if (event.type === 'paste' && replacement === '') return;
      const inputType = event.type === 'paste' ? 'insertFromPaste' : 'deleteByCut';
      const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data: replacement });
      if (!fireEvent(input, before) || !eligible() || input.readOnly) return;
      const value = current.value.slice(0, current.start) + replacement + current.value.slice(current.end);
      if (value === current.value) return;
      past.push(current);
      future.length = 0;
      const cursor = current.start + replacement.length;
      apply({ value, start: cursor, end: cursor }, inputType);
    },
    restore: () => {
      document.execCommand = originalExecCommand;
    },
  };
};
