import type { PluginRuntimeContext, PluginSdkClient, PluginSdkTransport } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';
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
  readonly initialRuntime?: ConfigLensInitialRuntime;
  readonly onRetry?: () => void;
}

export interface ConfigLensInitialRuntime {
  readonly client: PluginSdkClient;
  readonly context: PluginRuntimeContext;
}

export const App = ({ createTransport = createPluginWebviewTransport, initialRuntime, onRetry }: AppProps) => {
  const [state, setState] = useState<ConfigLensRuntimeState>(() =>
    initialRuntime === undefined ? { kind: 'loading' } : { kind: 'ready', context: initialRuntime.context },
  );
  const runtimeRef = useRef<ReturnType<typeof createConfigLensRuntime>>(undefined);
  const errorRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialRuntime !== undefined) {
      let active = true;
      const unsubscribeState = initialRuntime.client.subscribeState((clientState) => {
        if (active && clientState === 'disconnected') {
          setState({ kind: 'error', context: initialRuntime.context });
        }
      });
      const unsubscribeContext = initialRuntime.client.subscribe('runtime.context_changed', ({ payload }) => {
        if (active) setState({ kind: 'ready', context: payload });
      });
      return () => {
        active = false;
        unsubscribeContext();
        unsubscribeState();
        void initialRuntime.client.dispose().catch(() => undefined);
      };
    }
    const runtime = createConfigLensRuntime(createTransport, setState);
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = undefined;
      void runtime.dispose();
    };
  }, [createTransport, initialRuntime]);

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
            onRecovery={() => (onRetry === undefined ? void runtimeRef.current?.retry() : onRetry())}
          />
        </div>
      ) : null}
      {state.kind === 'ready' ? <ConfigLensPage context={state.context} /> : null}
    </PluginUiProvider>
  );
};
