import { Button, Select } from '@douyinfe/semi-ui';
import type { PluginRuntimeContext } from '@lensx/plugin-sdk';
import { type ComponentType, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { diagnosticMessage, languageLabel, messagesFor } from './catalog.js';
import { type EditorSurfaceProps, MonacoSurface } from './editor/MonacoSurface.js';
import { createLanguageController, type LanguageController } from './language/controller.js';
import { LANGUAGE_IDS, type LanguageId, type LanguageResult } from './language/protocol.js';

export interface ConfigLensPageProps {
  readonly context: PluginRuntimeContext;
  readonly createController?: () => LanguageController;
  readonly EditorSurface?: ComponentType<EditorSurfaceProps>;
  readonly initialInput?: string;
}

export const ConfigLensPage = ({
  context,
  createController = createLanguageController,
  EditorSurface = MonacoSurface,
  initialInput = '',
}: ConfigLensPageProps) => {
  const [language, setLanguage] = useState<LanguageId>('json');
  const [input, setInput] = useState(initialInput);
  const [result, setResult] = useState<LanguageResult>();
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(input);
  const languageRef = useRef(language);
  const contextKey = `${context.locale}:${context.theme}`;
  const contextRef = useRef(contextKey);
  const invalidatedContextRef = useRef(contextKey);
  const operationRef = useRef(0);
  inputRef.current = input;
  languageRef.current = language;
  contextRef.current = contextKey;
  const messages = messagesFor(context.locale);
  const controller = useMemo(() => {
    return createController();
  }, [createController]);

  useEffect(
    () => () => {
      controller.dispose();
    },
    [controller],
  );

  useEffect(() => {
    if (invalidatedContextRef.current === contextKey) return;
    invalidatedContextRef.current = contextKey;
    operationRef.current += 1;
    controller.invalidate();
    setProcessing(false);
  }, [contextKey, controller]);

  const scheduleValidation = useCallback(
    (selected: LanguageId, source: string) => {
      const requestContext = contextRef.current;
      controller.scheduleValidation(selected, source, (next) => {
        if (source === inputRef.current && selected === languageRef.current && requestContext === contextRef.current) {
          setResult(next);
        }
      });
    },
    [controller],
  );

  const handleInput = useCallback(
    (value: string) => {
      setInput(value);
      inputRef.current = value;
      operationRef.current += 1;
      setProcessing(false);
      if (value.trim() === '') {
        controller.invalidate();
        setResult(undefined);
      } else {
        scheduleValidation(languageRef.current, value);
      }
    },
    [controller, scheduleValidation],
  );

  const handleLanguage = useCallback(
    (value: unknown) => {
      if (!LANGUAGE_IDS.includes(value as LanguageId)) return;
      const next = value as LanguageId;
      setLanguage(next);
      languageRef.current = next;
      operationRef.current += 1;
      setProcessing(false);
      if (inputRef.current.trim() !== '') scheduleValidation(next, inputRef.current);
    },
    [scheduleValidation],
  );

  const perform = useCallback(
    async (operation: 'format' | 'compact') => {
      const source = inputRef.current;
      const selected = languageRef.current;
      const requestContext = contextRef.current;
      if (source.trim() === '') return;
      const operationId = ++operationRef.current;
      setProcessing(true);
      try {
        const next = await controller.run(selected, operation, source);
        if (
          operationId !== operationRef.current ||
          source !== inputRef.current ||
          selected !== languageRef.current ||
          requestContext !== contextRef.current
        ) {
          return;
        }
        setResult(next);
        if (next.status === 'valid' && next.output !== undefined) {
          inputRef.current = next.output;
          setInput(next.output);
        }
      } finally {
        if (operationId === operationRef.current) setProcessing(false);
      }
    },
    [controller],
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

  const empty = input.trim() === '';
  const diagnostics = result?.diagnostics ?? [];
  const diagnosticEntries = useMemo(() => {
    const occurrences = new Map<string, number>();
    return diagnostics.map((item) => {
      const identity = JSON.stringify(item);
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      return { item, key: `${identity}:${occurrence}` };
    });
  }, [diagnostics]);
  const status = empty
    ? messages.empty
    : processing
      ? messages.processing
      : result?.status === 'valid'
        ? messages.ready
        : diagnostics.length > 0
          ? messages.diagnosticSummary(diagnostics.length)
          : messages.empty;

  return (
    <main aria-label={messages.title} className="config-lens" onKeyDown={handleKeyDown}>
      <EditorSurface
        diagnostics={diagnostics}
        input={input}
        language={language}
        messages={messages}
        onInput={handleInput}
        theme={context.theme}
      />
      <div className="config-lens__toolbar">
        <div className="config-lens__language">
          <span id="config-lens-language-label">{messages.language}</span>
          <Select
            aria-labelledby="config-lens-language-label"
            optionList={LANGUAGE_IDS.map((value) => ({ label: languageLabel(value), value }))}
            value={language}
            onChange={handleLanguage}
          />
        </div>
        <Button disabled={empty || processing} htmlType="button" theme="solid" onClick={() => void perform('format')}>
          {messages.format}
        </Button>
        <Button
          disabled={empty || processing || language !== 'json'}
          htmlType="button"
          theme="outline"
          onClick={() => void perform('compact')}
        >
          {messages.compact}
        </Button>
      </div>
      <div aria-live="polite" className="config-lens__status" role="status">
        {status}
      </div>
      {diagnostics.length > 0 ? (
        <ul aria-label={messages.diagnosticSummary(diagnostics.length)} className="config-lens__diagnostics">
          {diagnosticEntries.map(({ item, key }) => (
            <li key={key}>
              <strong>{item.code}</strong> {diagnosticMessage(messages, item)}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
};
