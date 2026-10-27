import { Button, Icon, Input, Select, TextArea } from '@douyinfe/semi-ui';
import type { PluginRuntimeContext, PluginSdkClient } from '@lensx/plugin-sdk';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { messagesFor } from './catalog.js';
import { createTranslationController, reversedLanguages } from './controller.js';
import { LANGUAGE_CATALOG, languageLabel } from './languages.js';
import { createTranslationProvider, type TranslationProvider } from './provider/index.js';
import { createSdkHttpTransport } from './provider/transport.js';
import { createSettingsController, normalizeCredentials } from './settings.js';

export const TranslationPage = ({
  client,
  context,
  initialLocale,
  translate,
}: {
  client: PluginSdkClient;
  context: PluginRuntimeContext;
  initialLocale: PluginRuntimeContext['locale'];
  translate?: TranslationProvider;
}) => {
  const [{ settings, controller }] = useState(() => {
    const settings = createSettingsController({ client, initialLocale });
    return {
      settings,
      controller: createTranslationController({
        settings,
        translate: translate ?? createTranslationProvider({ request: createSdkHttpTransport(client) }),
        transportAvailable: context.capabilities.includes('http.request'),
      }),
    };
  });
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const config = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const [draft, setDraft] = useState({ accessKeyId: '', secretAccessKey: '' });
  const [invalidDraft, setInvalidDraft] = useState(false);
  const [saveOrigin, setSaveOrigin] = useState<'target' | 'credentials'>('target');
  const trigger = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const workspaceScrollTop = useRef(0);
  const settingsWereOpen = useRef(false);
  const compositionToken = useRef<number | undefined>(undefined);
  const retiredComposition = useRef(false);
  const retiredEndValue = useRef<string | undefined>(undefined);
  const settingsComposing = useRef(false);
  const settingsSession = useRef(0);
  const messages = messagesFor(context.locale);
  const busy = config.phase === 'loading' || config.phase === 'saving';
  const writable = config.phase === 'ready' || config.phase === 'invalid-target';
  const swapAvailable =
    !!reversedLanguages(state) && config.phase === 'ready' && !state.settingsOpen && !state.composing;
  useEffect(() => {
    controller.setTransportAvailable(context.capabilities.includes('http.request'));
  }, [context.capabilities, controller]);
  useEffect(() => {
    void settings.load();
    return () => {
      controller.dispose();
      settings.dispose();
    };
  }, [settings, controller]);
  useLayoutEffect(() => {
    if (state.settingsOpen) {
      if (viewport.current) viewport.current.scrollTop = 0;
      panel.current?.querySelector<HTMLInputElement>('input[type="password"]')?.focus({ preventScroll: true });
    } else if (settingsWereOpen.current) {
      if (viewport.current) viewport.current.scrollTop = workspaceScrollTop.current;
      trigger.current?.querySelector('button')?.focus({ preventScroll: true });
    }
    settingsWereOpen.current = state.settingsOpen;
  }, [state.settingsOpen]);
  const closeSettings = () => {
    settingsComposing.current = false;
    settingsSession.current += 1;
    controller.setSettingsOpen(false);
    setDraft({ accessKeyId: '', secretAccessKey: '' });
    setInvalidDraft(false);
  };
  const openSettings = () => {
    workspaceScrollTop.current = viewport.current?.scrollTop ?? 0;
    settingsComposing.current = false;
    settingsSession.current += 1;
    setDraft(config.confirmed?.credentials ?? { accessKeyId: '', secretAccessKey: '' });
    setInvalidDraft(false);
    controller.setSettingsOpen(true);
  };
  const save = async () => {
    const session = settingsSession.current;
    const next = normalizeCredentials(draft);
    if (next === undefined) {
      setInvalidDraft(true);
      return;
    }
    setSaveOrigin('credentials');
    if ((await settings.saveCredentials(next)) && session === settingsSession.current) closeSettings();
  };
  const configMessage =
    config.error === 'save' ? messages.saveFailed : config.error ? messages[config.error] : undefined;
  const formError =
    state.settingsOpen &&
    saveOrigin === 'credentials' &&
    (config.error === 'save' || config.error === 'credentials' || (config.error === 'unavailable' && writable));
  const translationIssue =
    state.status === 'error' && state.error
      ? messages[state.error.code]
      : state.status === 'input-limit' || state.status === 'direction' || state.status === 'http-unavailable'
        ? messages[state.status]
        : undefined;
  const configurationFeedback = (
    <>
      {configMessage && !formError ? <div role="alert">{configMessage}</div> : null}
      {config.error &&
      config.error !== 'save' &&
      config.error !== 'credentials' &&
      config.error !== 'invalid-target' &&
      !formError ? (
        <div className="translation__actions">
          <Button htmlType="button" disabled={busy} onClick={() => void settings.load()}>
            {messages.reload}
          </Button>
        </div>
      ) : null}
    </>
  );
  return (
    <main
      ref={viewport}
      aria-label={state.settingsOpen ? messages.settingsTitle : messages.title}
      className="translation"
    >
      <div
        id="translation-status"
        className="translation__sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={state.status === 'translating'}
      >
        {state.status === 'empty' ||
        translationIssue ||
        state.status === 'config-error' ||
        state.status === 'unconfigured'
          ? ''
          : messages[state.status]}
      </div>
      <div className="translation__workspace" hidden={state.settingsOpen} inert={state.settingsOpen}>
        <div className="translation__toolbar">
          <div className="translation__languages">
            <div className="translation__language">
              <span id="translation-source-language" className="translation__sr-only">
                {messages.sourceLanguage}
              </span>
              <Select
                className="translation__language-select translation__language-select--source"
                aria-labelledby="translation-source-language"
                disabled={busy || state.swappingLanguages}
                value={state.sourceLanguage}
                optionList={[
                  { value: 'auto', label: messages.auto },
                  ...LANGUAGE_CATALOG.filter((language) => language.source).map((language) => ({
                    value: language.code,
                    label: languageLabel(language.code, context.locale),
                  })),
                ]}
                onChange={(value) => {
                  if (typeof value === 'string') controller.setSource(value);
                }}
              />
            </div>
            <span title={swapAvailable ? messages.swap : messages.swapUnavailable}>
              <Button
                className="translation__swap"
                theme="borderless"
                htmlType="button"
                aria-label={messages.swap}
                aria-description={swapAvailable ? undefined : messages.swapUnavailable}
                disabled={!swapAvailable || busy || state.swappingLanguages}
                icon={
                  <Icon
                    aria-hidden="true"
                    svg={
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                        <path
                          d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    }
                  />
                }
                onClick={() => {
                  setSaveOrigin('target');
                  void controller.swapLanguages();
                }}
              />
            </span>
            <div className="translation__language">
              <span id="translation-target-language" className="translation__sr-only">
                {messages.targetLanguage}
              </span>
              <Select
                className="translation__language-select translation__language-select--target"
                aria-labelledby="translation-target-language"
                disabled={!writable || busy || state.swappingLanguages}
                value={state.targetLanguage}
                optionList={LANGUAGE_CATALOG.filter((language) => language.target).map((language) => ({
                  value: language.code,
                  label: languageLabel(language.code, context.locale),
                }))}
                onChange={(value) => {
                  if (typeof value === 'string') {
                    setSaveOrigin('target');
                    void settings.selectTarget(value);
                  }
                }}
              />
            </div>
          </div>
          <span ref={trigger} className="translation__settings-trigger">
            <Button
              htmlType="button"
              theme="borderless"
              aria-label={messages.settings}
              title={messages.settings}
              icon={
                <Icon
                  aria-hidden="true"
                  svg={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                      <path
                        d="m9.2 3-.5 2.2-2 .9-2-.7-2.1 3.6 1.5 1.6-.2 2.2-1.3 1.6 2.1 3.6 2-.6 2 .9.5 2.1h4.2l.5-2.1 2-.9 2 .6 2.1-3.6-1.3-1.6-.2-2.2 1.5-1.6-2.1-3.6-2 .7-2-.9L13.4 3H9.2Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <circle cx="11.3" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  }
                />
              }
              aria-expanded={state.settingsOpen}
              aria-controls="translation-settings"
              onClick={openSettings}
            />
          </span>
        </div>
        <div className="translation__configuration">
          {config.phase === 'ready' && !config.confirmed?.credentials ? <p>{messages.unconfigured}</p> : null}
          {configurationFeedback}
          {translationIssue ? (
            <div id="translation-issue" role="alert">
              {translationIssue}
            </div>
          ) : null}
          {state.status === 'error' ? (
            <div className="translation__actions">
              <Button htmlType="button" onClick={() => controller.retry()}>
                {messages.retry}
              </Button>
            </div>
          ) : null}
        </div>
        <section className="translation__texts" data-layout="responsive">
          <article className="translation__card" aria-labelledby="translation-source-label">
            <label id="translation-source-label" htmlFor="translation-source">
              {messages.sourceText}
            </label>
            <TextArea
              id="translation-source"
              aria-describedby={state.status === 'input-limit' ? 'translation-issue' : undefined}
              aria-invalid={state.status === 'input-limit'}
              value={state.text}
              resize="none"
              composition={false}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              onCompositionStart={() => {
                retiredComposition.current = false;
                retiredEndValue.current = undefined;
                compositionToken.current = controller.compositionStart();
              }}
              onCompositionEnd={(event) => {
                const value = event.currentTarget.value;
                if (retiredComposition.current || !event.currentTarget.isConnected) {
                  retiredEndValue.current = value;
                  event.currentTarget.value = controller.getSnapshot().text;
                  return;
                }
                if (compositionToken.current !== undefined) controller.compositionEnd(value, compositionToken.current);
                compositionToken.current = undefined;
              }}
              onChange={(value, event) => {
                if (!event.currentTarget.isConnected) return;
                const native = event.nativeEvent as unknown as InputEvent;
                const legacyCompositionInput =
                  native.type === 'input' &&
                  typeof native.isComposing !== 'boolean' &&
                  !native.inputType &&
                  compositionToken.current !== undefined &&
                  controller.getSnapshot().composing;
                const marked =
                  native.isComposing || /composition/iu.test(native.inputType ?? '') || legacyCompositionInput;
                if (retiredComposition.current && (marked || value === retiredEndValue.current)) {
                  event.currentTarget.value = controller.getSnapshot().text;
                  return;
                }
                if (!marked && value !== retiredEndValue.current) retiredEndValue.current = undefined;
                if (!marked && value.trim() === '' && controller.getSnapshot().composing)
                  retiredComposition.current = true;
                controller.input(value, { composing: marked });
              }}
            />
          </article>
          <article className="translation__card translation__card--output" aria-labelledby="translation-output-label">
            <label id="translation-output-label" htmlFor="translation-output">
              {messages.translatedText}
            </label>
            <TextArea
              id="translation-output"
              value={state.translation}
              readonly
              resize="none"
              aria-describedby="translation-status"
              aria-busy={state.status === 'translating'}
            />
          </article>
        </section>
      </div>
      {state.settingsOpen ? (
        <section
          id="translation-settings"
          ref={panel}
          className="translation__settings"
          aria-label={messages.settingsTitle}
          onCompositionStart={() => {
            settingsComposing.current = true;
          }}
          onCompositionEnd={() => {
            settingsComposing.current = false;
          }}
          onKeyDown={(event) => {
            if (settingsComposing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeSettings();
            }
          }}
        >
          <header className="translation__settings-header">
            <Button htmlType="button" theme="borderless" onClick={closeSettings}>
              {messages.backToTranslation}
            </Button>
            <h2>{messages.settingsTitle}</h2>
          </header>
          <div className="translation__configuration">{configurationFeedback}</div>
          <div className="translation__field">
            <span id="translation-provider">{messages.provider}</span>
            <Select
              aria-labelledby="translation-provider"
              value="volcengine"
              optionList={[{ value: 'volcengine', label: messages.volcengine }]}
            />
          </div>
          <div className="translation__field">
            <label htmlFor="translation-ak">{messages.accessKeyId}</label>
            <Input
              id="translation-ak"
              type="password"
              mode="password"
              autoComplete="off"
              value={draft.accessKeyId}
              onChange={(accessKeyId) => setDraft((current) => ({ ...current, accessKeyId }))}
            />
          </div>
          <div className="translation__field">
            <label htmlFor="translation-sk">{messages.secretAccessKey}</label>
            <Input
              id="translation-sk"
              type="password"
              mode="password"
              autoComplete="off"
              value={draft.secretAccessKey}
              onChange={(secretAccessKey) => setDraft((current) => ({ ...current, secretAccessKey }))}
            />
          </div>
          <p className="translation__notice">{messages.storageNotice}</p>
          <p className="translation__notice">{messages.sending}</p>
          {invalidDraft ? <div role="alert">{messages.credentialsRequired}</div> : null}
          {formError && configMessage ? <div role="alert">{configMessage}</div> : null}
          <div className="translation__actions">
            <Button
              htmlType="button"
              theme="solid"
              disabled={config.phase !== 'ready' || busy}
              onClick={() => void save()}
            >
              {messages.save}
            </Button>
            <Button htmlType="button" onClick={closeSettings}>
              {messages.cancel}
            </Button>
          </div>
        </section>
      ) : null}
    </main>
  );
};
