import { Button } from '@douyinfe/semi-ui';
import type { PluginSdkTransport } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';
import { PluginFeedback, PluginPage, PluginUiProvider } from '@lensx/plugin-ui';
import { useEffect, useRef, useState } from 'react';

import { createReactPluginRuntime, type ReactPluginRuntimeState } from './runtime.js';

const fallbackContext = Object.freeze({
  capabilities: Object.freeze([]),
  hostApiVersion: '0.2.0',
  locale: 'en-US' as const,
  theme: 'light' as const,
});

const copy = {
  'en-US': {
    action: 'Local action',
    description: 'This page owns React, Semi Design, and Plugin UI inside its WebView bundle.',
    error: 'The plugin could not connect to lensX. Try again.',
    title: 'React and Semi starter',
  },
  'zh-CN': {
    action: '本地操作',
    description: '此页面在 WebView bundle 内自行拥有 React、Semi Design 与 Plugin UI。',
    error: '插件无法连接到 lensX，请重试。',
    title: 'React 与 Semi 起步模板',
  },
} as const;

export interface AppProps {
  readonly createTransport?: () => PluginSdkTransport;
}

export const App = ({ createTransport = createPluginWebviewTransport }: AppProps) => {
  const [state, setState] = useState<ReactPluginRuntimeState>({ kind: 'loading' });
  const runtimeRef = useRef<ReturnType<typeof createReactPluginRuntime>>(undefined);
  const errorRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const runtime = createReactPluginRuntime(createTransport, setState);
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = undefined;
      void runtime.dispose();
    };
  }, [createTransport]);

  useEffect(() => {
    if (state.kind === 'error') {
      errorRegionRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [state.kind]);

  const context =
    state.kind === 'ready' || state.kind === 'error' ? (state.context ?? fallbackContext) : fallbackContext;
  const messages = copy[context.locale] ?? copy['en-US'];

  return (
    <PluginUiProvider context={context}>
      {state.kind === 'loading' ? <PluginFeedback kind="loading" /> : null}
      {state.kind === 'error' ? (
        <div ref={errorRegionRef}>
          <PluginFeedback
            description={messages.error}
            kind="error"
            onRecovery={() => void runtimeRef.current?.retry()}
          />
        </div>
      ) : null}
      {state.kind === 'ready' ? (
        <PluginPage
          actions={
            <Button htmlType="button" theme="outline">
              {messages.action}
            </Button>
          }
          description={messages.description}
          title={messages.title}
        >
          <section className="starter-ready" role="status">
            <strong>{context.locale}</strong>
            <span>{context.theme}</span>
          </section>
        </PluginPage>
      ) : null}
    </PluginUiProvider>
  );
};
