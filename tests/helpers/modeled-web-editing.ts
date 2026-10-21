import { fireEvent } from '@testing-library/react';

export type PlainTextEditTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const isFormControl = (target: PlainTextEditTarget): target is HTMLInputElement | HTMLTextAreaElement =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

export const editText = (target: PlainTextEditTarget): string =>
  isFormControl(target) ? target.value : (target.textContent ?? '');

export const editSelection = (target: PlainTextEditTarget): readonly [number, number] => {
  if (isFormControl(target)) return [target.selectionStart ?? 0, target.selectionEnd ?? 0];
  const selection = target.ownerDocument.getSelection();
  if (!selection?.rangeCount) return [0, 0];
  const range = selection.getRangeAt(0);
  if (!target.contains(range.startContainer) || !target.contains(range.endContainer)) return [0, 0];
  return [range.startOffset, range.endOffset];
};

export const selectEditText = (target: PlainTextEditTarget, start: number, end = start): void => {
  if (isFormControl(target)) {
    target.setSelectionRange(start, end);
    return;
  }
  if (!target.firstChild) target.append(target.ownerDocument.createTextNode(''));
  const range = target.ownerDocument.createRange();
  range.setStart(target.firstChild as Node, start);
  range.setEnd(target.firstChild as Node, end);
  const selection = target.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

export const clipboardText = (text: string): DataTransfer => {
  const transfer = new DataTransfer();
  transfer.setData('text/plain', text);
  return transfer;
};

/**
 * Happy DOM does not perform trusted keyboard/clipboard defaults or keep a
 * browser undo stack. These explicit plain-text primitives model those missing
 * operations, after actual cancelable DOM events have reached real handlers.
 * They do not model AppKit routing, native focus, WebKit completion, a system
 * clipboard, rich HTML paste, or browser history grouping. No key is translated
 * into a command here: each test supplies its intended default primitive.
 */
export const modelPlainTextEditing = (target: PlainTextEditTarget) => {
  type Snapshot = { text: string; selection: readonly [number, number] };
  const undo: Snapshot[] = [];
  const redo: Snapshot[] = [];
  const snapshot = (): Snapshot => ({ text: editText(target), selection: editSelection(target) });
  const available = () =>
    target.isConnected &&
    target.ownerDocument.activeElement === target &&
    !target.closest('[hidden]') &&
    !(isFormControl(target) && target.disabled);
  const writable = () => available() && (isFormControl(target) ? !target.readOnly : target.contentEditable === 'true');

  const beforeInput = (inputType: string, data: string | null): boolean =>
    fireEvent(target, new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data }));
  const write = ({ text, selection }: Snapshot, inputType: string, data: string | null) => {
    if (isFormControl(target)) {
      // Bypass React's value tracker as a browser edit would, then notify React
      // with input. A synthetic change after paste would not test this contract.
      const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(target, text);
    } else {
      target.replaceChildren(target.ownerDocument.createTextNode(text));
    }
    selectEditText(target, ...selection);
    fireEvent(target, new InputEvent('input', { bubbles: true, inputType, data }));
  };
  const replace = (replacement: string, inputType: string): boolean => {
    if (!writable()) return false;
    const previous = snapshot();
    const [start, end] = previous.selection;
    const nextText = previous.text.slice(0, start) + replacement + previous.text.slice(end);
    if (nextText === previous.text || !beforeInput(inputType, replacement || null) || !writable()) return false;
    undo.push(previous);
    redo.length = 0;
    const caret = start + replacement.length;
    write({ text: nextText, selection: [caret, caret] }, inputType, replacement || null);
    return true;
  };
  const clipboardEvent = (type: 'copy' | 'cut' | 'paste', transfer: DataTransfer): ClipboardEvent => {
    const event = new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: transfer });
    fireEvent(target, event);
    return event;
  };
  const restore = (from: Snapshot[], to: Snapshot[], inputType: 'historyUndo' | 'historyRedo'): boolean => {
    const next = from.at(-1);
    if (!writable() || !next || !beforeInput(inputType, null) || !writable()) return false;
    from.pop();
    to.push(snapshot());
    write(next, inputType, null);
    return true;
  };

  return {
    selectAll() {
      if (!available()) return false;
      selectEditText(target, 0, editText(target).length);
      return true;
    },
    copy(transfer: DataTransfer) {
      if (!available()) return undefined;
      const event = clipboardEvent('copy', transfer);
      const [start, end] = editSelection(target);
      if (!event.defaultPrevented && available() && start !== end) {
        transfer.setData('text/plain', editText(target).slice(start, end));
      }
      return event;
    },
    cut(transfer: DataTransfer) {
      if (!writable()) return undefined;
      const event = clipboardEvent('cut', transfer);
      const [start, end] = editSelection(target);
      if (!event.defaultPrevented && writable() && start !== end) {
        transfer.setData('text/plain', editText(target).slice(start, end));
        replace('', 'deleteByCut');
      }
      return event;
    },
    paste(transfer: DataTransfer) {
      if (!writable()) return undefined;
      const event = clipboardEvent('paste', transfer);
      const text = transfer.getData('text/plain');
      if (!event.defaultPrevented && text.length > 0) replace(text, 'insertFromPaste');
      return event;
    },
    insertText(text: string) {
      return replace(text, 'insertText');
    },
    undo: () => restore(undo, redo, 'historyUndo'),
    redo: () => restore(redo, undo, 'historyRedo'),
  };
};

export const pressModeledEdit = (
  target: PlainTextEditTarget,
  key: string,
  defaultPrimitive: () => unknown,
  options: KeyboardEventInit = {},
): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, key, ...options });
  fireEvent(target, event);
  // This fixture leaves native composition to its owner; it never fabricates
  // an edit during a composing key gesture or after page cancellation.
  if (!event.defaultPrevented && !event.isComposing) defaultPrimitive();
  return event;
};
