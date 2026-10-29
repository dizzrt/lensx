import type { PluginSdkTransport } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';
import { PluginFeedback, PluginUiProvider } from '@lensx/plugin-ui';
import { useEffect, useRef, useState } from 'react';
import { messagesFor } from './catalog.js';
import type { TranslationProvider } from './provider/index.js';
import { createTranslationRuntime, type RuntimeState } from './runtime.js';
import { TranslationPage } from './TranslationPage.js';

const fallbackContext = { capabilities: [], hostApiVersion: '0.4.0', locale: 'en-US', theme: 'light' } as const;
export const App = ({
  createTransport = createPluginWebviewTransport,
  translate,
}: {
  createTransport?: () => PluginSdkTransport;
  translate?: TranslationProvider;
}) => {
  const [state, setState] = useState<RuntimeState>({ kind: 'loading' });
  const runtime = useRef<ReturnType<typeof createTranslationRuntime>>(undefined);
  const recovery = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = createTranslationRuntime(createTransport, setState);
    runtime.current = current;
    return () => {
      runtime.current = undefined;
      void current.dispose();
    };
  }, [createTransport]);
  useEffect(() => {
    if (state.kind === 'error') recovery.current?.querySelector('button')?.focus();
  }, [state.kind]);
  const context = state.kind === 'loading' ? fallbackContext : (state.context ?? fallbackContext);
  const messages = messagesFor(context.locale);
  return (
    <PluginUiProvider context={context}>
      {state.kind === 'loading' ? <PluginFeedback kind="loading" description={messages.loading} /> : null}
      {state.kind === 'error' ? (
        <div ref={recovery}>
          <PluginFeedback
            kind="error"
            description={messages.sdkError}
            recoveryLabel={messages.sdkRetry}
            onRecovery={() => void runtime.current?.retry()}
          />
        </div>
      ) : null}
      {state.kind === 'ready' ? (
        <TranslationPage
          key={state.attempt}
          client={state.client}
          context={state.context}
          initialLocale={state.initialContext.locale}
          translate={translate}
        />
      ) : null}
    </PluginUiProvider>
  );
};
