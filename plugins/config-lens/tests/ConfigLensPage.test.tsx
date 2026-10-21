import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ConfigLensPage } from '../src/ConfigLensPage.js';
import type { EditorSurfaceProps } from '../src/editor/MonacoSurface.js';
import type { LanguageController } from '../src/language/controller.js';
import type {
  AnalysisInput,
  AnalysisResult,
  LanguageId,
  LanguageOperationResult,
  LanguageVersions,
} from '../src/language/protocol.js';

const context = (locale: 'en-US' | 'zh-CN' = 'en-US', theme: 'light' | 'dark' = 'light') =>
  Object.freeze({ capabilities: Object.freeze([]), hostApiVersion: '0.2.0', locale, theme });
// This double tests Page orchestration only. Actual Monaco actions, focus and
// model/undo behavior are exercised by the native editor tests.
const TestSurface = ({ diagnostics, input, language, onInput, theme }: EditorSurfaceProps) => (
  <textarea
    aria-label="Editable input"
    data-diagnostic-count={diagnostics.length}
    data-language={language ?? 'plaintext'}
    data-theme={theme}
    value={input}
    onChange={(event) => onInput(event.currentTarget.value)}
  />
);

const harness = () => {
  const requests: { input: AnalysisInput; publish: (result: AnalysisResult) => void }[] = [];
  const run = rs.fn(
    async (
      _language: LanguageId,
      _operation: string,
      source: string,
      versions: LanguageVersions,
    ): Promise<LanguageOperationResult> => ({
      ...versions,
      requestId: 1,
      status: 'valid',
      diagnostics: [],
      output: `${source}\n`,
    }),
  );
  const controller: LanguageController = {
    analyze: async (input) => ({
      requestId: 0,
      inputVersion: input.inputVersion,
      selectionVersion: input.selectionVersion,
      status: 'unresolved',
      diagnostics: [],
    }),
    scheduleAnalysis: (input, publish) => {
      requests.push({ input, publish });
    },
    run,
    invalidate: rs.fn(),
    dispose: rs.fn(),
    generation: () => 0,
  };
  const settle = (language?: LanguageId, valid = true, request = requests.at(-1)) => {
    if (request === undefined) throw new Error('Missing analysis request');
    const base = {
      requestId: 1,
      inputVersion: request.input.inputVersion,
      selectionVersion: request.input.selectionVersion,
      diagnostics: [],
    };
    act(() =>
      request.publish(
        language === undefined
          ? { ...base, status: 'unresolved' }
          : {
              ...base,
              status: 'resolved',
              effectiveLanguage: language,
              validationStatus: valid ? 'valid' : 'invalid',
            },
      ),
    );
  };
  return { controller, create: () => controller, requests, run, settle };
};
const edit = (value: string) => fireEvent.change(screen.getByLabelText('Editable input'), { target: { value } });
const choose = async (name: string) => {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(name, 'u') }));
};
const format = () => screen.getByRole('button', { name: /^(Format|格式化)$/u });
const compact = () => screen.getByRole('button', { name: /^(Compact|压缩)$/u });

const renderPage = (
  h: ReturnType<typeof harness>,
  locale: 'en-US' | 'zh-CN' = 'en-US',
  theme: 'light' | 'dark' = 'light',
) =>
  render(<ConfigLensPage context={context(locale, theme)} createController={h.create} EditorSurface={TestSurface} />);

describe('ConfigLens versioned language selection', () => {
  test('starts automatic and unresolved; detection changes language without editing input', () => {
    const h = harness();
    renderPage(h);
    expect(screen.getByRole('combobox')).toHaveTextContent(/^Auto$/u);
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'plaintext');
    expect(format()).toBeDisabled();
    expect(compact()).toBeDisabled();
    edit('<root/>');
    expect(format()).toBeDisabled();
    expect(h.requests.at(-1)?.input.selection).toEqual({ mode: 'auto', previousAutoLanguage: undefined });
    h.settle('xml');
    expect(screen.getByRole('combobox')).toHaveTextContent(/^Auto$/u);
    expect(screen.getByLabelText('Editable input')).toHaveValue('<root/>');
    expect(format()).toBeEnabled();
    expect(compact()).toBeDisabled();
  });

  test('locks a manual choice through paste and clear; returning to auto discards manual evidence', async () => {
    const h = harness();
    renderPage(h);
    edit('<root/>');
    const stale = h.requests.at(-1);
    fireEvent.click(screen.getByRole('combobox'));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Auto',
      'JSON',
      'YAML',
      'TOML',
      'XML',
    ]);
    fireEvent.click(screen.getByRole('option', { name: /TOML/u }));
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'toml');
    h.settle('xml', true, stale);
    expect(screen.getByRole('combobox')).toHaveTextContent('TOML');
    edit('{"port":80}');
    expect(h.requests.at(-1)?.input.selection).toEqual({ mode: 'manual', language: 'toml' });
    h.settle('toml', false);
    expect(compact()).toBeDisabled();
    edit('');
    expect(screen.getByRole('combobox')).toHaveTextContent('TOML');
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'toml');
    edit('<new/>');
    await choose('Auto');
    expect(h.requests.at(-1)?.input.selection).toEqual({ mode: 'auto', previousAutoLanguage: undefined });
    h.settle('xml');
    expect(screen.getByRole('combobox')).toHaveTextContent(/^Auto$/u);
  });

  test('passes only previous automatic language through ambiguity and clears it on empty input', () => {
    const h = harness();
    renderPage(h);
    edit('{"a":1}');
    h.settle('json');
    edit('unfinished');
    expect(h.requests.at(-1)?.input.selection).toEqual({ mode: 'auto', previousAutoLanguage: 'json' });
    h.settle('json', false);
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'json');
    edit('<xml>');
    h.settle('xml', false);
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'xml');
    edit('  ');
    expect(screen.getByRole('combobox')).toHaveTextContent(/^Auto$/u);
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'plaintext');
    expect(h.controller.invalidate).toHaveBeenCalled();
  });

  test('buttons and keyboard share pending, unresolved and current valid JSON guards', async () => {
    const h = harness();
    renderPage(h);
    edit('unknown');
    fireEvent.keyDown(screen.getByLabelText('Editable input'), { key: 'Enter', ctrlKey: true });
    expect(h.run).not.toHaveBeenCalled();
    h.settle();
    fireEvent.keyDown(screen.getByLabelText('Editable input'), { key: 'Enter', metaKey: true });
    expect(h.run).not.toHaveBeenCalled();
    edit('{"a":}');
    h.settle('json', false);
    expect(format()).toBeEnabled();
    expect(compact()).toBeDisabled();
    edit('{"a":1}');
    expect(format()).toBeDisabled();
    expect(compact()).toBeDisabled();
    h.settle('json');
    expect(compact()).toBeEnabled();
    fireEvent.keyDown(screen.getByLabelText('Editable input'), { key: 'Enter', metaKey: true });
    await waitFor(() => expect(screen.getByLabelText('Editable input')).toHaveValue('{"a":1}\n'));
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(compact()).toBeDisabled();
    h.settle('json');
    expect(compact()).toBeEnabled();
  });

  test.each([
    'input',
    'selection',
    'locale',
    'theme',
  ] as const)('rejects late transform after %s changes and resumes analysis', async (change) => {
    const h = harness();
    let finish: ((result: LanguageOperationResult) => void) | undefined;
    h.run.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderPage(h);
    edit('{"a":1}');
    h.settle('json');
    const versions = h.requests.at(-1)?.input;
    fireEvent.click(format());
    expect(format()).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Editable input'), { key: 'Enter', ctrlKey: true });
    expect(h.run).toHaveBeenCalledTimes(1);
    if (change === 'input') edit('{"a":2}');
    else if (change === 'selection') await choose('XML');
    else
      view.rerender(
        <ConfigLensPage
          context={context(change === 'locale' ? 'zh-CN' : 'en-US', change === 'theme' ? 'dark' : 'light')}
          createController={h.create}
          EditorSurface={TestSurface}
        />,
      );
    await act(async () =>
      finish?.({
        inputVersion: versions?.inputVersion ?? 0,
        selectionVersion: versions?.selectionVersion ?? 0,
        requestId: 2,
        status: 'valid',
        diagnostics: [],
        output: 'STALE',
      }),
    );
    expect(screen.getByLabelText('Editable input')).not.toHaveValue('STALE');
    expect(format()).toBeDisabled();
    h.settle(change === 'selection' ? 'xml' : 'json');
    expect(format()).toBeEnabled();
  });

  test('hiding preserves mode and content; unmount invalidates callbacks and reopening resets them', async () => {
    const h = harness();
    const view = renderPage(h);
    edit('<root/>');
    await choose('XML');
    h.settle('xml');
    view.container.hidden = true;
    view.rerender(<ConfigLensPage context={context()} createController={h.create} EditorSurface={TestSurface} />);
    view.container.hidden = false;
    expect(screen.getByLabelText('Editable input')).toHaveValue('<root/>');
    expect(screen.getByRole('combobox')).toHaveTextContent('XML');
    const stale = h.requests.at(-1);
    view.unmount();
    expect(h.controller.dispose).toHaveBeenCalledTimes(1);
    const next = harness();
    renderPage(next);
    h.settle('toml', true, stale);
    expect(screen.getByLabelText('Editable input')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveTextContent(/^Auto$/u);
  });
});

describe('ConfigLens footer and feedback', () => {
  test.each([
    ['en-US', 'light'],
    ['en-US', 'dark'],
    ['zh-CN', 'light'],
    ['zh-CN', 'dark'],
  ] as const)('keeps two regions and no status placeholder in %s/%s across states', (locale, theme) => {
    const h = harness();
    renderPage(h, locale, theme);
    const workspace = screen.getByRole('main', { name: 'ConfigLens' });
    const footer = screen.getByRole('contentinfo');
    expect(workspace.children).toHaveLength(2);
    expect(workspace.children[0]).toHaveClass('config-lens__content');
    expect(workspace.children[1]).toBe(footer);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    const verify = () => {
      expect(screen.getByRole('combobox')).toHaveTextContent(locale === 'zh-CN' ? /^自动$/u : /^Auto$/u);
      expect(footer.querySelector('.config-lens__status')).toBeNull();
      expect(footer.querySelector('[role="status"]')).toBeNull();
      expect(footer.querySelector('ul')).toBeNull();
      expect(footer.children).toHaveLength(1);
      expect(footer).toContainElement(format());
      expect(footer).toContainElement(compact());
      expect(footer.querySelectorAll('button')).toHaveLength(2);
      expect(screen.queryByRole('button', { name: /^(Search|搜索)$/u })).not.toBeInTheDocument();
    };
    verify();
    edit(`{"long":"${'内容'.repeat(500)}"}`);
    verify();
    expect(footer.querySelector('[aria-busy="true"]')).not.toBeNull();
    h.settle('json');
    verify();
    edit('bad');
    h.settle('json', false);
    verify();
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-theme', theme);
  });

  test('recovers from safe failures without adding footer feedback', () => {
    const h = harness();
    renderPage(h);
    edit('unknown');
    const request = h.requests.at(-1);
    if (request === undefined) throw new Error('No request');
    act(() =>
      request.publish({
        requestId: 1,
        inputVersion: request.input.inputVersion,
        selectionVersion: request.input.selectionVersion,
        status: 'failed',
        failureStatus: 'limit',
        diagnostics: [
          { code: 'input.bytes', severity: 'error', offset: 0, length: 0, messageKey: 'diagnostic.inputBytesLimit' },
        ],
      }),
    );
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-diagnostic-count', '1');
    expect(format()).toBeDisabled();
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent('limit');
    edit('{"ok":true}');
    h.settle('json');
    expect(format()).toBeEnabled();
    expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-diagnostic-count', '0');
  });
});
