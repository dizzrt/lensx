import { Button, Input, Select, TextArea } from '@douyinfe/semi-ui';
import type { PluginRuntimeContext, PluginSdkClient } from '@lensx/plugin-sdk';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { messagesFor } from './catalog.js';
import { createTranslationController } from './controller.js';
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
  const trigger = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLElement>(null);
  const compositionToken = useRef<number | undefined>(undefined);
  const retiredComposition = useRef(false);
  const retiredEndValue = useRef<string | undefined>(undefined);
  const settingsComposing = useRef(false);
  const settingsSession = useRef(0);
  const messages = messagesFor(context.locale);
  const busy = config.phase === 'loading' || config.phase === 'saving';
  const writable = config.phase === 'ready' || config.phase === 'invalid-target';
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
  useEffect(() => {
    if (state.settingsOpen) panel.current?.querySelector<HTMLInputElement>('input[type="password"]')?.focus();
  }, [state.settingsOpen]);
  const closeSettings = () => {
    settingsComposing.current = false;
    settingsSession.current += 1;
    controller.setSettingsOpen(false);
    setDraft({ accessKeyId: '', secretAccessKey: '' });
    setInvalidDraft(false);
    trigger.current?.querySelector('button')?.focus();
  };
  const openSettings = () => {
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
    if ((await settings.saveCredentials(next)) && session === settingsSession.current) closeSettings();
  };
  const configMessage =
    config.error === 'save' ? messages.saveFailed : config.error ? messages[config.error] : undefined;
  return (
    <main aria-label={messages.title} className="translation">
      <div className="translation__toolbar">
        <div>
          <span id="translation-source-language">{messages.sourceLanguage}</span>
          <Select
            aria-labelledby="translation-source-language"
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
        <div>
          <span id="translation-target-language">{messages.targetLanguage}</span>
          <Select
            aria-labelledby="translation-target-language"
            disabled={!writable || busy}
            value={state.targetLanguage}
            optionList={LANGUAGE_CATALOG.filter((language) => language.target).map((language) => ({
              value: language.code,
              label: languageLabel(language.code, context.locale),
            }))}
            onChange={(value) => {
              if (typeof value === 'string') void settings.selectTarget(value);
            }}
          />
        </div>
        <span ref={trigger}>
          <Button htmlType="button" onClick={openSettings}>
            {messages.settings}
          </Button>
        </span>
      </div>
      <section className="translation__texts" data-layout="vertical">
        <div className="translation__text">
          <label htmlFor="translation-source">{messages.sourceText}</label>
          <TextArea
            id="translation-source"
            value={state.text}
            resize="none"
            composition={false}
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
              const marked = native.isComposing || /composition/iu.test(native.inputType ?? '');
              if (retiredComposition.current && (marked || value === retiredEndValue.current)) {
                event.currentTarget.value = controller.getSnapshot().text;
                return;
              }
              if (!marked && value !== retiredEndValue.current) retiredEndValue.current = undefined;
              if (value.trim() === '' && controller.getSnapshot().composing) retiredComposition.current = true;
              controller.input(value);
            }}
          />
        </div>
        <div className="translation__text">
          <label htmlFor="translation-output">{messages.translatedText}</label>
          <TextArea id="translation-output" value={state.translation} readonly resize="none" />
        </div>
      </section>
      <div className="translation__feedback">
        {config.phase === 'ready' && !config.confirmed?.credentials ? <p>{messages.unconfigured}</p> : null}
        <div role="status" aria-live="polite" aria-atomic="true" aria-busy={state.status === 'translating'}>
          {state.status === 'error' && state.error ? messages[state.error.code] : messages[state.status]}
          {state.status === 'error' && state.error?.requestId ? (
            <span>
              {' '}
              {messages.requestId}: {state.error.requestId}
            </span>
          ) : null}
          {state.detectedLanguage ? (
            <span>
              {' '}
              {messages.detected}: {languageLabel(state.detectedLanguage, context.locale)}
            </span>
          ) : null}
        </div>
        {configMessage ? <div role="alert">{configMessage}</div> : null}
        <div className="translation__actions">
          <Button htmlType="button" disabled={state.status !== 'error'} onClick={() => controller.retry()}>
            {messages.retry}
          </Button>
          <Button
            htmlType="button"
            onClick={() => {
              retiredComposition.current = compositionToken.current !== undefined;
              controller.input('');
            }}
          >
            {messages.clear}
          </Button>
          {config.error && config.error !== 'save' ? (
            <Button htmlType="button" disabled={busy} onClick={() => void settings.load()}>
              {messages.reload}
            </Button>
          ) : null}
        </div>
        <p className="translation__notice">{messages.sending}</p>
      </div>
      {state.settingsOpen ? (
        <section
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
          <h2>{messages.settingsTitle}</h2>
          <span id="translation-provider">{messages.provider}</span>
          <Select
            aria-labelledby="translation-provider"
            value="volcengine"
            optionList={[{ value: 'volcengine', label: messages.volcengine }]}
          />
          <label htmlFor="translation-ak">{messages.accessKeyId}</label>
          <Input
            id="translation-ak"
            type="password"
            mode="password"
            autoComplete="off"
            value={draft.accessKeyId}
            onChange={(accessKeyId) => setDraft((current) => ({ ...current, accessKeyId }))}
          />
          <label htmlFor="translation-sk">{messages.secretAccessKey}</label>
          <Input
            id="translation-sk"
            type="password"
            mode="password"
            autoComplete="off"
            value={draft.secretAccessKey}
            onChange={(secretAccessKey) => setDraft((current) => ({ ...current, secretAccessKey }))}
          />
          <p>{messages.storageNotice}</p>
          {invalidDraft ? <div role="alert">{messages.credentialsRequired}</div> : null}
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
