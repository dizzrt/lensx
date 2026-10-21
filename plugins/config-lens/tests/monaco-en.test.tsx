import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { messagesFor } from '../src/catalog.js';
import { MonacoSurface, replaceEditorContent } from '../src/editor/MonacoSurface.js';
import { disposeMonacoWorkers, loadMonaco, waitForEditorWorkerReady } from '../src/editor/monaco.js';
import { registerNativeEditingCases } from './monaco-editing-cases.js';
import {
  bodyInput,
  EditorWorkerDouble,
  installWorkerDouble,
  mountEditor,
  primaryModifier,
  queryInput,
  releaseWorkers,
} from './monaco-fixture.js';
import { registerWordSelectionCases } from './monaco-word-selection-cases.js';

beforeEach(installWorkerDouble);
afterEach(releaseWorkers);

describe('actual English Monaco modules', () => {
  test('single-flight resources produce meaningful tokens for all four languages', async () => {
    const first = loadMonaco('en-US');
    expect(loadMonaco('zh-CN')).toBe(first);
    const monaco = await first;
    const types = (source: string, language: string) =>
      monaco.editor
        .tokenize(source, language)
        .flat()
        .map((token) => token.type);
    expect(types('{"key":"text","number":12,"flag":true', 'json')).toEqual(
      expect.arrayContaining(['string.key.json', 'string.value.json', 'number.json', 'keyword.json']),
    );
    expect(types('key: "text"\nnumber: 12\nflag: true\n# comment', 'yaml')).toEqual(
      expect.arrayContaining(['type.yaml', 'string.yaml', 'number.yaml', 'keyword.yaml', 'comment.yaml']),
    );
    expect(types('<xml enabled="yes">', 'xml')).toEqual(
      expect.arrayContaining(['tag.xml', 'attribute.name.xml', 'attribute.value.xml']),
    );
    expect(
      types(
        '[server]\n[[server.nodes]]\n"quoted.key" = "text"\nport = 8_080\nenabled = true\ndate = 1979-05-27T07:32:00Z\n# comment',
        'toml',
      ),
    ).toEqual(
      expect.arrayContaining([
        'type.toml',
        'key.toml',
        'string.toml',
        'number.toml',
        'keyword.toml',
        'number.date.toml',
        'comment.toml',
      ]),
    );
    const multiline = monaco.editor.tokenize(
      'text = """first\nsecond \\t escaped\nlast"""\nplain = \'\'\'first\nsecond # literal\nlast\'\'\'\nenabled = true',
      'toml',
    );
    expect(multiline[1]?.map((token) => token.type)).toContain('string.escape.toml');
    expect(multiline[4]?.every((token) => token.type === 'string.toml')).toBe(true);
    expect(multiline[6]?.map((token) => token.type)).toContain('keyword.toml');
    expect(types('a = "unterminated\nb = true', 'toml')).toContain('keyword.toml');
  });

  test('the Find shortcut retains native space, navigation, options and focus recovery', async () => {
    const view = await mountEditor({ input: 'hello HELLO\nhelloWorld\nhello' });
    const before = view.model.getValue();
    const initialLineTop = view.editor.getTopForLineNumber(1);
    expect(view.editor.getOption(view.monaco.editor.EditorOption.find).addExtraSpaceOnTop).toBe(true);
    expect(view.container.querySelector('.dock-find-viewzone')).toBeNull();
    await view.openSearch();
    const input = queryInput(view.container);
    expect(input).toHaveAttribute('aria-label', 'Find');
    expect(input).toHaveFocus();
    // Inspect Monaco's real layout model and zone lifecycle, not rendered pixels.
    await waitFor(() => expect(view.editor.getTopForLineNumber(1)).toBeGreaterThan(initialLineTop));
    const findLineTop = view.editor.getTopForLineNumber(1);
    expect(view.container.querySelectorAll('.dock-find-viewzone')).toHaveLength(1);
    const toggleReplace = within(view.container).getByRole('button', { name: /^Toggle Replace/ });
    fireEvent.click(toggleReplace);
    await waitFor(() => expect(view.editor.getTopForLineNumber(1)).toBeGreaterThan(findLineTop));
    expect(toggleReplace).toHaveAttribute('aria-expanded', 'true');
    expect(view.container.querySelectorAll('.dock-find-viewzone')).toHaveLength(1);
    fireEvent.click(toggleReplace);
    await waitFor(() => expect(view.editor.getTopForLineNumber(1)).toBe(findLineTop));
    expect(toggleReplace).toHaveAttribute('aria-expanded', 'false');
    expect(view.editor.getModel()).toBe(view.model);
    fireEvent.input(input, { target: { value: 'hello' } });
    await waitFor(() => expect(view.container.querySelector('.matchesCount')).toHaveTextContent('1 of 4'));
    fireEvent.click(within(view.container).getByRole('checkbox', { name: /Match Case/ }));
    await waitFor(() => expect(view.container.querySelector('.matchesCount')).toHaveTextContent('1 of 3'));
    fireEvent.click(within(view.container).getByRole('checkbox', { name: /Match Whole Word/ }));
    await waitFor(() => expect(view.container.querySelector('.matchesCount')).toHaveTextContent('1 of 2'));
    fireEvent.click(within(view.container).getByRole('button', { name: /^Next Match/ }));
    await waitFor(() => expect(view.editor.getSelection()?.startLineNumber).toBe(3));
    fireEvent.click(within(view.container).getByRole('button', { name: /^Previous Match/ }));
    await waitFor(() => expect(view.editor.getSelection()?.startLineNumber).toBe(1));
    fireEvent.input(input, { target: { value: 'missing' } });
    await waitFor(() => expect(view.container.querySelector('.matchesCount')).toHaveTextContent('No results'));
    fireEvent.click(within(view.container).getByRole('checkbox', { name: /Use Regular Expression/ }));
    fireEvent.input(input, { target: { value: 'h.llo' } });
    await waitFor(() => expect(view.container.querySelector('.matchesCount')).toHaveTextContent('of 2'));
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    expect(view.editor.hasTextFocus()).toBe(true);
    expect(view.container.querySelector('.find-widget')).not.toHaveClass('visible');
    expect(view.container.querySelector('.dock-find-viewzone')).toBeNull();
    expect(view.editor.getTopForLineNumber(1)).toBe(initialLineTop);
    fireEvent.keyDown(bodyInput(view.container), {
      key: 'f',
      code: 'KeyF',
      keyCode: 70,
      ...primaryModifier,
    });
    await waitFor(() => expect(input).toHaveFocus());
    expect(view.container.querySelectorAll('.find-widget')).toHaveLength(1);
    expect(view.container.querySelectorAll('.dock-find-viewzone')).toHaveLength(1);
    expect(view.editor.getTopForLineNumber(1)).toBe(findLineTop);
    fireEvent.click(within(view.container).getByRole('button', { name: /^Close/ }));
    expect(view.editor.hasTextFocus()).toBe(true);
    expect(view.container.querySelector('.dock-find-viewzone')).toBeNull();
    expect(view.editor.getTopForLineNumber(1)).toBe(initialLineTop);
    expect(view.editor.getModel()).toBe(view.model);
    expect(view.model.getValue()).toBe(before);
    expect(view.model.canUndo()).toBe(false);
    view.unmount();
  });

  test('selection follows body/query focus and the visible menu uses the core command', async () => {
    const view = await mountEditor();
    view.editor.focus();
    fireEvent.keyDown(bodyInput(view.container), {
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      ...primaryModifier,
    });
    expect(view.editor.getSelection()?.equalsRange(view.model.getFullModelRange())).toBe(true);
    view.editor.setSelection(new view.monaco.Range(1, 1, 1, 1));
    await view.openSearch();
    const input = queryInput(view.container);
    fireEvent.input(input, { target: { value: 'hello' } });
    // happy-dom lacks the native input selection primitive, not Monaco's command.
    const original = document.execCommand;
    document.execCommand = rs.fn((command: string) => {
      if (command === 'selectAll' && document.activeElement instanceof HTMLTextAreaElement)
        document.activeElement.select();
      return true;
    });
    try {
      fireEvent.keyDown(input, { key: 'a', code: 'KeyA', keyCode: 65, ...primaryModifier });
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(5);
      expect(view.editor.getSelection()?.equalsRange(view.model.getFullModelRange())).toBe(false);
    } finally {
      document.execCommand = original;
    }
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    await view.editor.getAction('editor.action.showContextMenu')?.run();
    const shadow = [...document.querySelectorAll('*')].find((element) =>
      element.shadowRoot?.querySelector('[role="menu"]'),
    )?.shadowRoot;
    expect(shadow).toBeDefined();
    const menuItem = within(shadow as unknown as HTMLElement).getByRole('menuitem', { name: /Select All/ });
    fireEvent.mouseOver(menuItem);
    fireEvent.keyDown(menuItem, { key: 'Enter', code: 'Enter', keyCode: 13 });
    await waitFor(() => expect(view.editor.getSelection()?.equalsRange(view.model.getFullModelRange())).toBe(true));
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    fireEvent.keyDown(outside, { key: 'a', code: 'KeyA', keyCode: 65, ...primaryModifier });
    expect(outside).toHaveFocus();
    outside.remove();
    view.unmount();
  });

  test('language/theme/live diagnostics preserve model, undo, query and opening locale', async () => {
    const view = await mountEditor({ input: '<xml>', language: 'xml' });
    const originalModel = view.model;
    act(() => {
      replaceEditorContent(view.editor, view.model, '<xml></xml>');
    });
    await view.openSearch();
    fireEvent.input(queryInput(view.container), { target: { value: 'xml' } });
    view.update({ input: '<xml></xml>', language: 'json' });
    view.update({ language: 'toml' });
    view.update({
      language: undefined,
      locale: 'zh-CN',
      messages: messagesFor('zh-CN'),
      theme: 'dark',
      diagnostics: [
        { code: 'worker.failure', messageKey: 'diagnostic.workerFailure', severity: 'error', offset: 0, length: 1 },
      ],
    });
    expect(view.editor.getModel()).toBe(originalModel);
    expect(view.model.getLanguageId()).toBe('plaintext');
    expect(view.container.querySelector('.monaco-editor')).toHaveClass('vs-dark');
    expect(view.container.querySelector('.inputarea')).toHaveAttribute('aria-label', '可编辑的配置输入');
    expect(queryInput(view.container)).toHaveAttribute('aria-label', 'Find');
    expect(view.editor.getAction('editor.action.marker.next')?.label).toBe('Go to Next Problem (Error, Warning, Info)');
    expect(queryInput(view.container)).toHaveValue('xml');
    expect(view.monaco.editor.getModelMarkers({ owner: 'config-lens' })[0]?.message).toBe(
      messagesFor('zh-CN').diagnostics.workerFailure,
    );
    expect(view.container.querySelector('.config-lens-editor__diagnostics')).toHaveTextContent(
      messagesFor('zh-CN').diagnostics.workerFailure,
    );
    view.container.hidden = true;
    view.container.hidden = false;
    expect(view.editor.getModel()).toBe(originalModel);
    expect(queryInput(view.container)).toHaveValue('xml');
    await act(async () => {
      await view.model.undo();
    });
    expect(view.model.getValue()).toBe('<xml>');
    view.unmount();
    expect(view.model.isDisposed()).toBe(true);
    expect(view.monaco.editor.getModels()).toHaveLength(0);
    expect(view.monaco.editor.getModelMarkers({ owner: 'config-lens' })).toHaveLength(0);
  });

  test('native replacement emits content updates, supports undo and stores no query', async () => {
    const storage = rs.spyOn(Storage.prototype, 'setItem');
    const view = await mountEditor();
    await view.openSearch();
    fireEvent.input(queryInput(view.container), { target: { value: 'hello' } });
    await waitFor(() => expect(view.container.querySelector('.matchesCount')).toHaveTextContent('of 2'));
    fireEvent.click(within(view.container).getByRole('button', { name: /^Toggle Replace/ }));
    const replace = within(view.container).getByRole('textbox', { name: 'Replace' });
    fireEvent.input(replace, { target: { value: 'bye' } });
    fireEvent.click(within(view.container).getByRole('button', { name: /^Replace All/ }));
    await waitFor(() => expect(view.model.getValue()).toBe('bye bye\nWorld'));
    expect(view.onInput).toHaveBeenCalledWith('bye bye\nWorld');
    await act(async () => {
      await view.model.undo();
    });
    expect(view.model.getValue()).toBe('hello hello\nWorld');
    expect(view.editor.getRawOptions().find).toMatchObject({
      globalFindClipboard: false,
      history: 'never',
      replaceHistory: 'never',
    });
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
    view.unmount();
    const fresh = await mountEditor({ input: '' });
    await fresh.openSearch();
    expect(queryInput(fresh.container)).toHaveValue('');
    fresh.unmount();
    releaseWorkers();
    expect(EditorWorkerDouble.instances.every((worker) => worker.terminate.mock.calls.length > 0)).toBe(true);
  });
});

test('the actual singleton WorkerManager releases its client with the last model and retries with a new client', async () => {
  const view = await mountEditor();
  const { StandaloneServices } = await import('monaco-editor/editor/standalone/browser/standaloneServices.js');
  const { IEditorWorkerService } = await import('monaco-editor/editor/common/services/editorWorker.js');
  // Inspect the reviewed version's production manager without replacing it.
  const service = StandaloneServices.get(IEditorWorkerService) as {
    _workerManager: { withWorker(): Promise<{ dispose(): void }> };
  };
  const client = await service._workerManager.withWorker();
  const dispose = rs.spyOn(client, 'dispose');
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
  expect(EditorWorkerDouble.instances.every((worker) => worker.terminate.mock.calls.length > 0)).toBe(true);
  const fresh = await mountEditor();
  expect(await service._workerManager.withWorker()).not.toBe(client);
  expect(fresh.model).not.toBe(view.model);
  fresh.unmount();
});

test('pending initialization accepts only the latest props and ignores teardown and old Worker messages', async () => {
  const monaco = await loadMonaco('en-US');
  const props = {
    diagnostics: [],
    input: '<xml>',
    language: 'json' as const,
    locale: 'en-US' as const,
    messages: messagesFor('en-US'),
    onInput: rs.fn(),
    theme: 'light' as const,
  };
  let pending: ReturnType<typeof render> | undefined;
  await act(async () => {
    pending = render(<MonacoSurface {...props} />);
    pending.rerender(<MonacoSurface {...props} language="toml" />);
    pending.rerender(<MonacoSurface {...props} language="xml" />);
  });
  await waitFor(() => expect(monaco.editor.getModels()).toHaveLength(1));
  expect(monaco.editor.getModels()[0]?.getLanguageId()).toBe('xml');
  expect(monaco.editor.getModels()[0]?.getValue()).toBe('<xml>');
  pending?.unmount();
  await act(async () => {
    render(<MonacoSurface {...props} />).unmount();
  });
  expect(monaco.editor.getModels()).toHaveLength(0);
  expect(EditorWorkerDouble.instances.every((worker) => worker.terminate.mock.calls.length > 0)).toBe(true);
  await loadMonaco('en-US');
  const oldWorker = EditorWorkerDouble.instances.at(-1);
  disposeMonacoWorkers();
  await loadMonaco('en-US');
  let ready = false;
  const readiness = waitForEditorWorkerReady().then(() => {
    ready = true;
  });
  oldWorker?.dispatchEvent(new MessageEvent('message'));
  await Promise.resolve();
  expect(ready).toBe(false);
  EditorWorkerDouble.instances.at(-1)?.dispatchEvent(new MessageEvent('message'));
  await readiness;
  expect(ready).toBe(true);
});

registerNativeEditingCases('en-US');
registerWordSelectionCases('en-US');
