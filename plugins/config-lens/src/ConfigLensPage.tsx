import { Button, Select } from '@douyinfe/semi-ui';
import type { PluginRuntimeContext } from '@lensx/plugin-sdk';
import { type ComponentType, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { languageLabel, messagesFor } from './catalog.js';
import { type EditorSurfaceProps, MonacoSurface } from './editor/MonacoSurface.js';
import { createLanguageController, type LanguageController } from './language/controller.js';
import {
  type AnalysisResult,
  LANGUAGE_IDS,
  type LanguageId,
  type LanguageSelection,
  type SafeDiagnostic,
} from './language/protocol.js';

export interface ConfigLensPageProps {
  readonly context: PluginRuntimeContext;
  readonly createController?: () => LanguageController;
  readonly EditorSurface?: ComponentType<EditorSurfaceProps>;
  readonly initialInput?: string;
}

interface EditingState {
  readonly input: string;
  readonly inputVersion: number;
  readonly selectionVersion: number;
  readonly selection: LanguageSelection;
  readonly effectiveLanguage: LanguageId | undefined;
  readonly analysis: AnalysisResult | undefined;
  readonly diagnostics: readonly SafeDiagnostic[];
  readonly pending: boolean;
  readonly processing: boolean;
}

const canFormat = (state: EditingState): boolean =>
  state.input.trim() !== '' && !state.pending && !state.processing && state.effectiveLanguage !== undefined;
const canCompact = (state: EditingState): boolean =>
  canFormat(state) &&
  state.effectiveLanguage === 'json' &&
  state.analysis?.status === 'resolved' &&
  state.analysis.validationStatus === 'valid' &&
  state.analysis.inputVersion === state.inputVersion &&
  state.analysis.selectionVersion === state.selectionVersion;

export const ConfigLensPage = ({
  context,
  createController = createLanguageController,
  EditorSurface = MonacoSurface,
  initialInput = '',
}: ConfigLensPageProps) => {
  const [state, setState] = useState<EditingState>(() => ({
    input: initialInput,
    inputVersion: 0,
    selectionVersion: 0,
    selection: { mode: 'auto' },
    effectiveLanguage: undefined,
    analysis: undefined,
    diagnostics: [],
    pending: initialInput.trim() !== '',
    processing: false,
  }));
  const stateRef = useRef(state);
  const contextKey = `${context.locale}:${context.theme}`;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const epoch = useRef(0);
  const messages = messagesFor(context.locale);
  const controller = useMemo(() => createController(), [createController]);
  const commit = useCallback((next: EditingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const analyze = useCallback(
    (next: EditingState, requestContext = contextRef.current) => {
      const requestEpoch = ++epoch.current;
      const empty = next.input.trim() === '';
      const current: EditingState = {
        ...next,
        effectiveLanguage: empty && next.selection.mode === 'auto' ? undefined : next.effectiveLanguage,
        analysis: undefined,
        diagnostics: [],
        processing: false,
        pending: !empty,
      };
      commit(current);
      if (empty) {
        controller.invalidate();
        return;
      }
      controller.scheduleAnalysis(
        {
          source: current.input,
          inputVersion: current.inputVersion,
          selectionVersion: current.selectionVersion,
          selection:
            current.selection.mode === 'manual'
              ? current.selection
              : {
                  mode: 'auto',
                  previousAutoLanguage: current.effectiveLanguage,
                },
        },
        (result) => {
          if (
            requestEpoch !== epoch.current ||
            requestContext !== contextRef.current ||
            result.inputVersion !== stateRef.current.inputVersion ||
            result.selectionVersion !== stateRef.current.selectionVersion
          )
            return;
          commit({
            ...stateRef.current,
            effectiveLanguage:
              result.status === 'resolved'
                ? result.effectiveLanguage
                : result.status === 'unresolved'
                  ? undefined
                  : stateRef.current.effectiveLanguage,
            analysis: result,
            diagnostics: result.diagnostics,
            pending: false,
          });
        },
      );
    },
    [commit, controller],
  );

  useEffect(() => {
    analyze(stateRef.current, contextKey);
  }, [analyze, contextKey]);

  useEffect(
    () => () => {
      epoch.current += 1;
      controller.dispose();
    },
    [controller],
  );

  const handleInput = useCallback(
    (input: string) => {
      const current = stateRef.current;
      // Monaco also notifies when a successful operation is applied to its model.
      if (input === current.input) return;
      analyze({ ...current, input, inputVersion: current.inputVersion + 1 });
    },
    [analyze],
  );

  const handleLanguage = useCallback(
    (value: unknown) => {
      if (value !== 'auto' && !LANGUAGE_IDS.includes(value as LanguageId)) return;
      const current = stateRef.current;
      analyze({
        ...current,
        selection: value === 'auto' ? { mode: 'auto' } : { mode: 'manual', language: value as LanguageId },
        effectiveLanguage: value === 'auto' ? undefined : (value as LanguageId),
        selectionVersion: current.selectionVersion + 1,
      });
    },
    [analyze],
  );

  const perform = useCallback(
    async (operation: 'format' | 'compact') => {
      const current = stateRef.current;
      if (
        !(operation === 'compact' ? canCompact(current) : canFormat(current)) ||
        current.effectiveLanguage === undefined
      )
        return;
      const requestEpoch = ++epoch.current;
      const requestContext = contextRef.current;
      commit({ ...current, processing: true });
      const result = await controller.run(current.effectiveLanguage, operation, current.input, {
        inputVersion: current.inputVersion,
        selectionVersion: current.selectionVersion,
      });
      if (
        requestEpoch !== epoch.current ||
        requestContext !== contextRef.current ||
        result.inputVersion !== stateRef.current.inputVersion ||
        result.selectionVersion !== stateRef.current.selectionVersion ||
        current.effectiveLanguage !== stateRef.current.effectiveLanguage
      )
        return;
      if (result.status === 'valid' && result.output !== undefined) {
        analyze({ ...stateRef.current, input: result.output, inputVersion: current.inputVersion + 1 });
      } else {
        commit({ ...stateRef.current, processing: false, diagnostics: result.diagnostics });
      }
    },
    [analyze, commit, controller],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void perform('format');
      }
    },
    [perform],
  );

  return (
    <main
      aria-label={messages.title}
      className="config-lens"
      data-workbench-layout="continuous"
      onKeyDown={handleKeyDown}
    >
      <section className="config-lens__content">
        <EditorSurface
          diagnostics={state.diagnostics}
          input={state.input}
          language={state.effectiveLanguage}
          locale={context.locale}
          messages={messages}
          onInput={handleInput}
          theme={context.theme}
        />
      </section>
      <footer className="config-lens__footer" data-footer-layout="fixed-bottom">
        <div className="config-lens__footer-main">
          <div className="config-lens__language">
            <span id="config-lens-language-label">{messages.language}</span>
            <Select
              aria-labelledby="config-lens-language-label"
              optionList={[
                { label: messages.auto, value: 'auto' },
                ...LANGUAGE_IDS.map((value) => ({ label: languageLabel(value), value })),
              ]}
              value={state.selection.mode === 'auto' ? 'auto' : state.selection.language}
              onChange={handleLanguage}
            />
          </div>
          <div aria-busy={state.pending || state.processing} className="config-lens__toolbar">
            <Button
              disabled={!canFormat(state)}
              loading={state.processing}
              htmlType="button"
              theme="solid"
              onClick={() => void perform('format')}
            >
              {messages.format}
            </Button>
            <Button
              disabled={!canCompact(state)}
              htmlType="button"
              theme="outline"
              onClick={() => void perform('compact')}
            >
              {messages.compact}
            </Button>
          </div>
        </div>
      </footer>
    </main>
  );
};
