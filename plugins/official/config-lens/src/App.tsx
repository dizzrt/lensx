import type { PluginSdkTransport } from '@lensx/plugin-sdk';
import { createPluginIframeTransport } from '@lensx/plugin-sdk/iframe';
import { PluginFeedback, PluginUiProvider } from '@lensx/plugin-ui';
import { useEffect, useRef, useState } from 'react';
import { ConfigLensPage } from './ConfigLensPage.js';
import { messagesFor } from './catalog.js';
import { type ConfigLensRuntimeState, createConfigLensRuntime } from './runtime.js';

const fallbackContext = Object.freeze({
  capabilities: Object.freeze([]),
  hostApiVersion: '0.2.0',
  locale: 'en-US' as const,
  theme: 'light' as const,
});

export interface AppProps {
  readonly createTransport?: () => PluginSdkTransport;
}

export const App = ({ createTransport = createPluginIframeTransport }: AppProps) => {
  const [state, setState] = useState<ConfigLensRuntimeState>({ kind: 'loading' });
  const runtimeRef = useRef<ReturnType<typeof createConfigLensRuntime>>(undefined);
  const errorRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const runtime = createConfigLensRuntime(createTransport, setState);
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = undefined;
      void runtime.dispose();
    };
  }, [createTransport]);

  useEffect(() => {
    if (state.kind === 'error') errorRegionRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [state.kind]);

  const context =
    state.kind === 'ready' || state.kind === 'error' ? (state.context ?? fallbackContext) : fallbackContext;
  const messages = messagesFor(context.locale);
  return (
    <PluginUiProvider context={context}>
      {state.kind === 'loading' ? <PluginFeedback description={messages.loading} kind="loading" /> : null}
      {state.kind === 'error' ? (
        <div ref={errorRegionRef}>
          <PluginFeedback
            description={messages.sdkError}
            kind="error"
            onRecovery={() => void runtimeRef.current?.retry()}
          />
        </div>
      ) : null}
      {state.kind === 'ready' ? <ConfigLensPage context={state.context} /> : null}
    </PluginUiProvider>
  );
};
