import { describe, expect, rs, test } from '@rstest/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
  const invalidate = rs.fn();
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
    invalidate,
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
  return { controller, create: () => controller, requests, run, settle, invalidate };
};
const edit = (value: string) => fireEvent.change(screen.getByLabelText('Editable input'), { target: { value } });
const openLanguageOptions = () => {
  const combobox = screen.getByRole('combobox');
  fireEvent.click(combobox);
  const listboxId = combobox.getAttribute('aria-controls');
  if (!listboxId) throw new Error('Language selector must own a listbox');
  const controlled = document.getElementById(listboxId);
  if (!controlled) throw new Error('Missing controlled language options');
  const listbox = within(controlled).getByRole('listbox');
  const dialog = listbox.closest('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) throw new Error('Missing language popup dialog');
  expect(within(dialog).getByRole('listbox')).toBe(listbox);
  return { combobox, listbox, dialog };
};
type LanguagePopup = ReturnType<typeof openLanguageOptions>;
const choose = async (
  h: ReturnType<typeof harness>,
  name: 'Auto' | '自动' | 'JSON' | 'YAML' | 'TOML' | 'XML',
  phases: {
    afterOpen?: (popup: LanguagePopup) => void | Promise<void>;
    beforeClose?: (popup: LanguagePopup) => void;
  } = {},
) => {
  const requestCount = h.requests.length;
  const previous = h.requests.at(-1);
  const invalidations = h.invalidate.mock.calls.length;
  const source = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Editable input' }).value;
  const popup = openLanguageOptions();
  await phases.afterOpen?.(popup);
  // Semi's tick icon contributes to each option's complete accessible name.
  const option = within(popup.listbox).getByRole('option', { name: `tick ${name}` });
  fireEvent.click(option);
  phases.beforeClose?.(popup);
  await act(async () => {
    // Happy DOM does not play CSS animations. Only finish this popup's exit;
    // before positioning, Semi completes the close and removes it immediately.
    if (popup.dialog.isConnected) {
      expect(popup.dialog).toContainElement(popup.listbox);
      expect(popup.listbox.closest('[role="dialog"]')).toBe(popup.dialog);
      expect(popup.dialog).toHaveClass('semi-tooltip-animation-hide');
      fireEvent.animationEnd(popup.dialog);
    }
  });
  expect(popup.combobox.textContent).toBe(name);
  expect(popup.dialog).not.toBeInTheDocument();
  expect(popup.listbox).not.toBeInTheDocument();
  if (source.trim() === '') {
    expect(h.requests).toHaveLength(requestCount);
    expect(h.controller.invalidate).toHaveBeenCalledTimes(invalidations + 1);
  } else {
    if (!previous) throw new Error('Missing current input analysis');
    expect(h.requests).toHaveLength(requestCount + 1);
    expect(h.requests.at(-1)).not.toBe(previous);
    expect(h.requests.at(-1)?.input).toEqual({
      source,
      inputVersion: previous.input.inputVersion,
      selectionVersion: previous.input.selectionVersion + 1,
      selection:
        name === 'Auto' || name === '自动'
          ? { mode: 'auto', previousAutoLanguage: undefined }
          : { mode: 'manual', language: name.toLowerCase() },
    });
  }
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
  test.each([
    ['before', 'en-US', 'light'],
    ['after', 'en-US', 'light'],
    ['before', 'en-US', 'dark'],
    ['after', 'en-US', 'dark'],
    ['before', 'zh-CN', 'light'],
    ['after', 'zh-CN', 'light'],
    ['before', 'zh-CN', 'dark'],
    ['after', 'zh-CN', 'dark'],
  ] as const)('commits once %s popup positioning in %s/%s', async (position, locale, theme) => {
    rs.useFakeTimers();
    try {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const h = harness();
      renderPage(h, locale, theme);
      edit('<root/>');
      const auto = locale === 'zh-CN' ? '自动' : 'Auto';
      for (const name of ['TOML', auto] as const) {
        const previous = h.requests.at(-1);
        const requestCount = h.requests.length;
        const oldLabel = screen.getByRole('combobox').textContent;
        await choose(h, name, {
          afterOpen: async ({ dialog }) => {
            expect(dialog).not.toHaveClass('semi-tooltip-animation-show');
            if (position === 'after') {
              // Semi 2.101.1's ResizeObserver fallback marks this popup as positioned.
              await act(async () => rs.advanceTimersByTime(50));
              expect(dialog).toHaveClass('semi-tooltip-animation-show');
              fireEvent.animationEnd(dialog);
              expect(dialog).not.toHaveClass('semi-tooltip-animation-show');
            }
          },
          beforeClose: ({ combobox, dialog }) => {
            if (position === 'after') {
              expect(dialog).toHaveClass('semi-tooltip-animation-hide');
              expect(combobox.textContent).toBe(oldLabel);
              expect(h.requests).toHaveLength(requestCount);
              expect(h.requests.at(-1)).toBe(previous);
              expect(previous?.input.selectionVersion).toBe(requestCount - 1);
            } else {
              expect(dialog).not.toBeInTheDocument();
              expect(h.requests).toHaveLength(requestCount + 1);
            }
          },
        });
      }
      expect(h.requests.at(-1)?.input.selectionVersion).toBe(2);
      edit('');
      await choose(h, 'XML');
      expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'xml');
      await choose(h, auto);
      expect(screen.getByLabelText('Editable input')).toHaveAttribute('data-language', 'plaintext');
      expect(h.requests).toHaveLength(3);
      edit('<new/>');
      expect(h.requests.at(-1)?.input).toEqual({
        source: '<new/>',
        inputVersion: 3,
        selectionVersion: 4,
        selection: { mode: 'auto', previousAutoLanguage: undefined },
      });
    } finally {
      try {
        cleanup();
        await act(async () => rs.runOnlyPendingTimers());
        expect(rs.getTimerCount()).toBe(0);
        expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
        expect(screen.queryByRole('listbox', { hidden: true })).not.toBeInTheDocument();
      } finally {
        rs.clearAllTimers();
        rs.useRealTimers();
      }
    }
  });

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
    await choose(h, 'TOML', {
      afterOpen: ({ listbox }) => {
        expect(
          within(listbox)
            .getAllByRole('option')
            .map((option) => option.textContent),
        ).toEqual(['Auto', 'JSON', 'YAML', 'TOML', 'XML']);
      },
    });
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
    await choose(h, 'Auto');
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
    else if (change === 'selection') await choose(h, 'XML');
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
    await choose(h, 'XML');
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
