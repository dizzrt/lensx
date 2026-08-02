import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen } from '@testing-library/react';

import { PluginFeedback, PluginPage, PluginUiProvider } from '../src/index.js';
import { runtimeContext } from './fixtures.js';

const renderInProvider = (
  children: React.ReactNode,
  locale: 'en-US' | 'zh-CN' = 'en-US',
  theme: 'light' | 'dark' = 'light',
) => render(<PluginUiProvider context={runtimeContext(locale, theme)}>{children}</PluginUiProvider>);

describe('PluginPage', () => {
  test('renders one accessible page frame with heading, description, actions, and content', () => {
    renderInProvider(
      <PluginPage actions={<button type="button">Save</button>} description="A detailed plugin page" title="Workspace">
        <p>Content</p>
      </PluginPage>,
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAccessibleName('Workspace');
    expect(screen.getByRole('heading', { level: 1, name: 'Workspace' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
    expect(screen.getByText('A detailed plugin page')).toBeVisible();
    expect(screen.getByText('Content')).toBeVisible();
  });

  test('does not render optional empty regions for minimal props', () => {
    renderInProvider(<PluginPage title="Minimal">Only content</PluginPage>);

    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.queryByLabelText('Page actions')).not.toBeInTheDocument();
    expect(document.querySelector('.lensx-plugin-page__description')).not.toBeInTheDocument();
  });

  test('keeps long localized content in semantic text nodes', () => {
    const longChinese = '这是用于验证插件页面长文本在固定宽度下仍然完整可读且不会依赖宿主页面样式的示例内容。'.repeat(
      4,
    );
    renderInProvider(
      <PluginPage description={longChinese} title="很长的插件页面标题">
        {longChinese}
      </PluginPage>,
      'zh-CN',
      'dark',
    );

    expect(screen.getByRole('main')).toHaveTextContent(longChinese);
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
  });
});

describe('PluginFeedback', () => {
  test('exposes busy and polite status semantics while loading without taking focus', () => {
    renderInProvider(<PluginFeedback kind="loading" />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading');
    expect(document.activeElement).toBe(document.body);
  });

  test('uses non-error status semantics for empty content and supports overrides', () => {
    renderInProvider(<PluginFeedback description="No matching records" kind="empty" title="No results" />);

    expect(screen.getByRole('status')).toHaveTextContent('No results');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No matching records')).toBeVisible();
  });

  test('uses alert semantics and invokes only the provided recovery handler', () => {
    const onRecovery = rs.fn();
    renderInProvider(<PluginFeedback kind="error" onRecovery={onRecovery} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Something went wrong');
    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onRecovery).toHaveBeenCalledTimes(1);
  });

  test('updates all default feedback copy for Chinese while preserving overrides', () => {
    renderInProvider(
      <PluginFeedback description="插件自定义说明" kind="error" onRecovery={() => undefined} />,
      'zh-CN',
    );

    expect(screen.getByRole('alert')).toHaveTextContent('出现错误');
    expect(screen.getByRole('alert')).toHaveTextContent('插件自定义说明');
    expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
  });

  test('expresses every state with text and a non-color-only state marker', () => {
    const { rerender } = renderInProvider(<PluginFeedback kind="loading" />);
    for (const [kind, text] of [
      ['loading', 'Loading'],
      ['empty', 'Nothing here yet'],
      ['error', 'Something went wrong'],
    ] as const) {
      rerender(
        <PluginUiProvider context={runtimeContext()}>
          <PluginFeedback kind={kind} />
        </PluginUiProvider>,
      );
      const state = document.querySelector(`[data-kind="${kind}"]`);
      expect(state).toHaveTextContent(text);
      expect(state?.querySelector('.lensx-plugin-feedback__mark')).not.toBeNull();
    }
  });
});
