import { Button } from '@douyinfe/semi-ui';
import type { PluginRuntimeContext, PluginRuntimeLocale, PluginRuntimeTheme } from '@lensx/plugin-sdk';
import { PluginFeedback, PluginPage, PluginUiProvider } from '@lensx/plugin-ui';
import '@lensx/plugin-ui/styles.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/styles.less';
import './visual.less';

const parameters = new URLSearchParams(window.location.search);
const locale: PluginRuntimeLocale = parameters.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
const theme: PluginRuntimeTheme = parameters.get('theme') === 'dark' ? 'dark' : 'light';
const context: PluginRuntimeContext = Object.freeze({
  capabilities: Object.freeze([]),
  hostApiVersion: '0.1.0',
  locale,
  theme,
});
const tokens = [
  '--lensx-plugin-color-background',
  '--lensx-plugin-color-surface',
  '--lensx-plugin-color-text',
  '--lensx-plugin-color-text-secondary',
  '--lensx-plugin-color-border',
  '--lensx-plugin-color-accent',
  '--lensx-plugin-color-danger',
  '--lensx-plugin-color-focus',
  '--lensx-plugin-radius-page',
  '--lensx-plugin-space-page',
] as const;
const copy = {
  'en-US': {
    action: 'Local action',
    body: 'The plugin owns this entire React, Semi Design, and Plugin UI document.',
    description:
      'A deliberately long description verifies wrapping and spacing without relying on Host layout, Host Context, private styles, or injected framework globals.',
    error: 'The bounded error state contains no private Host diagnostic.',
    title: 'React and Semi starter',
  },
  'zh-CN': {
    action: '本地操作',
    body: '插件自行拥有此 React、Semi Design 与 Plugin UI 文档。',
    description:
      '这是一段刻意加长的说明，用于验证在不依赖宿主布局、宿主 Context、私有样式或注入框架全局变量时，文字仍能正确换行并保持清晰间距。',
    error: '有界错误状态不包含宿主私有诊断。',
    title: 'React 与 Semi 起步模板',
  },
} as const;

const VisualFixture = () => {
  const [retries, setRetries] = useState(0);
  const messages = copy[locale];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const retry = document.querySelector<HTMLButtonElement>('.lensx-plugin-feedback__recovery');
      retry?.focus();
      requestAnimationFrame(() => {
        const bodyStyle = getComputedStyle(document.body);
        const retryStyle = retry === null ? undefined : getComputedStyle(retry);
        const tokensValid = tokens.every((token) => bodyStyle.getPropertyValue(token).trim().length > 0);
        const semanticsValid =
          document.querySelectorAll('main').length === 1 &&
          document.querySelectorAll('[role="status"]').length === 2 &&
          document.querySelectorAll('[role="alert"]').length === 1;
        const focusValid =
          document.activeElement === retry &&
          retryStyle !== undefined &&
          retryStyle.outlineStyle !== 'none' &&
          retryStyle.outlineWidth !== '0px';
        document.body.dataset.visualCheck = tokensValid && semanticsValid && focusValid ? 'passed' : 'failed';
        document.body.dataset.tokenCount = String(tokens.length);
        document.body.dataset.backgroundToken = bodyStyle.getPropertyValue(tokens[0]).trim();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <PluginUiProvider context={context}>
      <PluginPage
        actions={
          <Button htmlType="button" theme="outline">
            {messages.action}
          </Button>
        }
        description={messages.description}
        title={messages.title}
      >
        <div className="template-visual-grid">
          <section className="starter-ready" role="status">
            <strong>{messages.body}</strong>
            <span>
              {locale} · {theme}
            </span>
          </section>
          <PluginFeedback kind="loading" />
          <PluginFeedback
            description={messages.error}
            kind="error"
            onRecovery={() => setRetries((value) => value + 1)}
          />
        </div>
        <output aria-live="polite" data-retry-count={retries}>
          Retries: {retries}
        </output>
      </PluginPage>
    </PluginUiProvider>
  );
};

const root = document.getElementById('root');
if (root === null) throw new Error('Missing visual fixture root.');
createRoot(root).render(<VisualFixture />);
