import { describe, expect, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ConfigLensPage } from '../src/ConfigLensPage.js';
import type { EditorSurfaceProps } from '../src/editor/MonacoSurface.js';
import type { LanguageController } from '../src/language/controller.js';
import type { LanguageResult } from '../src/language/protocol.js';

const context = (locale: 'en-US' | 'zh-CN' = 'en-US', theme: 'light' | 'dark' = 'light') =>
  Object.freeze({ capabilities: Object.freeze([]), hostApiVersion: '0.2.0', locale, theme });

const TestSurface = ({ diagnostics, input, language, onInput, theme }: EditorSurfaceProps) => (
  <textarea
    aria-label="Editable input"
    data-diagnostic-count={diagnostics.length}
    data-language={language}
    data-theme={theme}
    value={input}
    onChange={(event) => onInput(event.currentTarget.value)}
  />
);

const createController = (): LanguageController => {
  let generation = 0;
  const run = async (
    language: 'json' | 'yaml' | 'toml' | 'xml',
    operation: 'validate' | 'format' | 'compact',
    source: string,
  ) => {
    generation += 1;
    if (source.includes('bad')) {
      return {
        requestId: generation,
        status: 'invalid',
        diagnostics: [
          {
            code: `${language}.syntax`,
            severity: 'error',
            offset: 0,
            length: 3,
            messageKey: `diagnostic.${language}Syntax`,
          },
        ],
      } satisfies LanguageResult;
    }
    return {
      requestId: generation,
      status: 'valid',
      diagnostics: [],
      output: operation === 'validate' ? undefined : `formatted:${source}`,
    } satisfies LanguageResult;
  };
  return {
    run,
    scheduleValidation: (language, source, publish) => void run(language, 'validate', source).then(publish),
    invalidate: () => {
      generation += 1;
    },
    dispose: () => undefined,
    generation: () => generation,
  };
};

describe('ConfigLens product workflow', () => {
  test('renders an editor-first workspace without repeated page headings', () => {
    render(<ConfigLensPage context={context()} createController={createController} EditorSurface={TestSurface} />);
    const workspace = screen.getByRole('main', { name: 'ConfigLens' });
    const editor = screen.getByLabelText('Editable input');
    const language = screen.getByRole('combobox');
    const format = screen.getByRole('button', { name: 'Format' });
    const compact = screen.getByRole('button', { name: 'Compact' });
    const status = screen.getByRole('status');
    const footer = workspace.children[1];
    expect(workspace).toBeInTheDocument();
    expect(workspace).toHaveAttribute('data-workbench-layout', 'continuous');
    expect(workspace.children).toHaveLength(2);
    expect(workspace.children[0]).toHaveClass('config-lens__content');
    expect(workspace.children[0]?.tagName).toBe('SECTION');
    expect(footer).toHaveClass('config-lens__footer');
    expect(footer).toHaveAttribute('data-footer-layout', 'fixed-bottom');
    expect(footer?.tagName).toBe('FOOTER');
    expect(footer?.children).toHaveLength(1);
    expect(workspace.children[0]).toContainElement(editor);
    expect(footer).toContainElement(language);
    expect(footer).toContainElement(status);
    expect(footer).toContainElement(format);
    expect(footer).toContainElement(compact);
    expect(language.closest('.config-lens__footer-main')).toContainElement(status);
    expect(language.closest('.config-lens__footer-main')).toContainElement(format);
    expect(language.closest('.config-lens__footer-main')).toContainElement(compact);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText(/temporary workspace|临时工作区/u)).not.toBeInTheDocument();
    expect(editor.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(editor.compareDocumentPosition(format) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(format).toBeDisabled();
    expect(compact).toBeDisabled();
  });

  test('keeps language selection explicit and exposes no suggestion or change-application controls', () => {
    render(<ConfigLensPage context={context()} createController={createController} EditorSurface={TestSurface} />);
    const editor = screen.getByLabelText('Editable input');
    fireEvent.change(editor, { target: { value: '<root/>' } });
    expect(screen.getByRole('combobox')).toHaveTextContent('JSON');
    expect(editor).toHaveAttribute('data-language', 'json');
    expect(screen.getByRole('button', { name: 'Format' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Compact' })).toBeEnabled();
    expect(screen.queryByText(/suggestion|may be|建议|可能/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Apply result|应用结果/u })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/preview|预览/u)).not.toBeInTheDocument();
  });

  test('formats directly and supports keyboard format without preview or Apply', async () => {
    render(<ConfigLensPage context={context()} createController={createController} EditorSurface={TestSurface} />);
    const input = screen.getByLabelText('Editable input');
    fireEvent.change(input, { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(input).toHaveValue('formatted:{"a":1}'));
    fireEvent.change(input, { target: { value: '{"a":2}' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(input).toHaveValue('formatted:{"a":2}'));
    expect(screen.queryByRole('button', { name: 'Apply result' })).not.toBeInTheDocument();
  });

  test('preserves invalid input and updates locale/theme without losing content', async () => {
    const { rerender } = render(
      <ConfigLensPage context={context()} createController={createController} EditorSurface={TestSurface} />,
    );
    const input = screen.getByLabelText('Editable input');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(input).toHaveAttribute('data-diagnostic-count', '1'));
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveAttribute('data-footer-layout', 'fixed-bottom');
    expect(footer.children).toHaveLength(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(footer.querySelector('ul')).toBeNull();
    expect(screen.queryByText('json.syntax')).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnostic|诊断|语法无效/iu)).not.toBeInTheDocument();
    expect(input).toHaveValue('bad');
    rerender(
      <ConfigLensPage
        context={context('zh-CN', 'dark')}
        createController={createController}
        EditorSurface={TestSurface}
      />,
    );
    expect(screen.getByLabelText('Editable input')).toHaveValue('bad');
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-diagnostic-count', '1');
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: '格式化' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Editable input'), { target: { value: '{"ok":true}' } });
    fireEvent.click(screen.getByRole('button', { name: '格式化' }));
    await waitFor(() => expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-diagnostic-count', '0'));
    expect(screen.getByRole('contentinfo')).toHaveAttribute('data-footer-layout', 'fixed-bottom');
  });

  test('rejects a pending result after input changes', async () => {
    let resolveRun: ((result: LanguageResult) => void) | undefined;
    const deferredController = (): LanguageController => ({
      run: () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      scheduleValidation: () => undefined,
      invalidate: () => undefined,
      dispose: () => undefined,
      generation: () => 0,
    });
    render(<ConfigLensPage context={context()} createController={deferredController} EditorSurface={TestSurface} />);
    const input = screen.getByLabelText('Editable input');
    fireEvent.change(input, { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    fireEvent.change(input, { target: { value: '{"a":2}' } });
    resolveRun?.({ requestId: 1, status: 'valid', diagnostics: [], output: 'stale-result' });
    await waitFor(() => expect(input).toHaveValue('{"a":2}'));
  });

  test('rejects a pending result when the complete Runtime context is replaced', async () => {
    let resolveRun: ((result: LanguageResult) => void) | undefined;
    const deferredController = (): LanguageController => ({
      run: () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      scheduleValidation: () => undefined,
      invalidate: () => undefined,
      dispose: () => undefined,
      generation: () => 0,
    });
    const { rerender } = render(
      <ConfigLensPage context={context()} createController={deferredController} EditorSurface={TestSurface} />,
    );
    fireEvent.change(screen.getByLabelText('Editable input'), { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    rerender(
      <ConfigLensPage
        context={context('zh-CN', 'dark')}
        createController={deferredController}
        EditorSurface={TestSurface}
      />,
    );
    resolveRun?.({ requestId: 1, status: 'valid', diagnostics: [], output: 'stale-result' });
    await Promise.resolve();
    expect(screen.getByLabelText('Editable input')).toHaveValue('{"a":1}');
    expect(screen.queryByRole('button', { name: '应用结果' })).not.toBeInTheDocument();
  });
});
