import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { fireEvent, waitFor } from '@testing-library/react';
import { messagesFor } from '../src/catalog.js';
import { disposeMonacoWorkers, loadMonaco } from '../src/editor/monaco.js';
import { registerNativeEditingCases } from './monaco-editing-cases.js';
import { installWorkerDouble, mountEditor, queryInput, releaseWorkers } from './monaco-fixture.js';
import { registerWordSelectionCases } from './monaco-word-selection-cases.js';

beforeEach(installWorkerDouble);
afterEach(releaseWorkers);

test('a new document initializes Chinese native NLS and retains it across same-document SDK retries', async () => {
  expect(navigator.userAgent).toMatch(/AppleWebKit/);
  const write = rs.spyOn(navigator.clipboard, 'write');
  const writeText = rs.spyOn(navigator.clipboard, 'writeText');
  const read = rs.spyOn(navigator.clipboard, 'read');
  const readText = rs.spyOn(navigator.clipboard, 'readText');
  const first = loadMonaco('zh-CN');
  expect(loadMonaco('en-US')).toBe(first);
  const view = await mountEditor({ locale: 'zh-CN' });
  await view.openSearch();
  expect(queryInput(view.container)).toHaveAttribute('aria-label', '查找');
  fireEvent.input(queryInput(view.container), { target: { value: 'missing' } });
  await waitFor(() => expect(view.container.querySelector('.matchesCount')).toHaveTextContent('无结果'));
  expect(view.editor.getAction('editor.action.showContextMenu')?.label).toBe('显示编辑器上下文菜单');
  view.update({ locale: 'en-US', messages: messagesFor('en-US'), theme: 'dark' });
  expect(queryInput(view.container)).toHaveAttribute('aria-label', '查找');
  expect(view.container.querySelector('.inputarea')).toHaveAttribute('aria-label', 'Editable configuration input');
  expect(view.container.querySelector('.monaco-editor')).toHaveClass('vs-dark');
  view.unmount();
  disposeMonacoWorkers();
  expect(loadMonaco('en-US')).toBe(first);
  const retry = await mountEditor({ locale: 'en-US', input: '' });
  await retry.openSearch();
  expect(queryInput(retry.container)).toHaveAttribute('aria-label', '查找');
  expect(queryInput(retry.container)).toHaveValue('');
  fireEvent.keyDown(queryInput(retry.container), { key: 'Escape', code: 'Escape', keyCode: 27 });
  fireEvent.click(retry.container);
  expect(retry.editor.getAction('editor.action.marker.next')?.label).toBe('转到下一个问题 (错误、警告、信息)');
  retry.unmount();
  for (const spy of [write, writeText, read, readText]) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
});

registerNativeEditingCases('zh-CN');
registerWordSelectionCases('zh-CN');
