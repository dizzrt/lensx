import { Button } from '@douyinfe/semi-ui';
import type { PluginRuntimeContext, PluginRuntimeLocale, PluginRuntimeTheme } from '@lensx/plugin-sdk';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { PluginFeedback, PluginPage, PluginUiProvider } from '../../src/index.js';
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

const publicTokens = [
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
    action: 'Refresh workspace',
    description:
      'A deliberately long English description verifies that plugin-owned content remains readable without relying on Host layout or private global styles.',
    normalBody: 'The plugin page is ready and owns this browser document.',
    normalTitle: 'Ready content',
    recoveryCount: 'Recovery requested',
    title: 'Independent research workspace',
  },
  'zh-CN': {
    action: '刷新工作区',
    description:
      '这是一段刻意加长的简体中文说明，用于验证插件自有内容在不依赖宿主布局或私有全局样式时，仍然能够完整换行、保持清晰并易于阅读。',
    normalBody: '插件页面已经就绪，并且独立拥有当前浏览器文档。',
    normalTitle: '正常内容',
    recoveryCount: '已请求恢复',
    title: '独立研究工作区',
  },
} as const;

const VisualFixture = () => {
  const [recoveryCount, setRecoveryCount] = useState(0);
  const messages = copy[locale];

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      const retryButton = document.querySelector<HTMLButtonElement>('.lensx-plugin-feedback__recovery');
      retryButton?.focus();
      window.requestAnimationFrame(() => {
        const bodyStyle = window.getComputedStyle(document.body);
        const page = document.querySelector<HTMLElement>('.lensx-plugin-page');
        const feedback = document.querySelector<HTMLElement>('.lensx-plugin-feedback');
        const retryStyle = retryButton === null ? undefined : window.getComputedStyle(retryButton);
        const tokenValues = Object.fromEntries(
          publicTokens.map((token) => [token, bodyStyle.getPropertyValue(token).trim()]),
        );
        const semanticsValid =
          document.querySelectorAll('main').length === 1 &&
          document.querySelectorAll('h1').length === 1 &&
          document.querySelectorAll('[role="status"]').length === 2 &&
          document.querySelectorAll('[role="alert"]').length === 1 &&
          document.querySelector('[aria-busy="true"][aria-live="polite"]') !== null &&
          document.querySelector('[role="alert"][aria-live="assertive"]') !== null;
        const stylesValid =
          page !== null &&
          feedback !== null &&
          window.getComputedStyle(page).paddingTop === '24px' &&
          window.getComputedStyle(feedback).borderTopStyle === 'solid' &&
          window.getComputedStyle(feedback).borderRadius === '12px' &&
          retryStyle !== undefined &&
          retryStyle.outlineStyle !== 'none' &&
          retryStyle.outlineWidth !== '0px';
        const tokensValid = Object.values(tokenValues).every((value) => value.length > 0);

        document.body.dataset.visualCheck = semanticsValid && stylesValid && tokensValid ? 'passed' : 'failed';
        document.body.dataset.backgroundToken = tokenValues['--lensx-plugin-color-background'];
        document.body.dataset.focusOutline = retryStyle?.outline ?? '';
        document.body.dataset.tokenCount = String(Object.keys(tokenValues).length);
      });
    });

    return () => window.cancelAnimationFrame(firstFrame);
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
        <div className="visual-grid">
          <section className="visual-ready-card">
            <span aria-hidden="true" className="visual-ready-card__mark">
              ✓
            </span>
            <h2>{messages.normalTitle}</h2>
            <p>{messages.normalBody}</p>
          </section>
          <PluginFeedback kind="loading" />
          <PluginFeedback kind="empty" />
          <PluginFeedback kind="error" onRecovery={() => setRecoveryCount((current) => current + 1)} />
        </div>
        <output aria-live="polite" className="visual-recovery-output" data-recovery-count={recoveryCount}>
          {messages.recoveryCount}: {recoveryCount}
        </output>
      </PluginPage>
    </PluginUiProvider>
  );
};

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing visual fixture root.');
}

createRoot(root).render(<VisualFixture />);
