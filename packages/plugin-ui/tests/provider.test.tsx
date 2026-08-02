import { describe, expect, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';

import { PluginFeedback, PluginUiProvider } from '../src/index.js';
import { runtimeContext } from './fixtures.js';

describe('PluginUiProvider', () => {
  test('adapts English and light context without reading Host providers', async () => {
    render(
      <PluginUiProvider context={runtimeContext()}>
        <PluginFeedback kind="loading" />
      </PluginUiProvider>,
    );

    expect(await screen.findByText('Loading')).toBeVisible();
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('lang', 'en-US');
      expect(document.documentElement.style.colorScheme).toBe('light');
      expect(document.body).not.toHaveAttribute('theme-mode');
    });
  });

  test('adapts Chinese and dark context', async () => {
    render(
      <PluginUiProvider context={runtimeContext('zh-CN', 'dark')}>
        <PluginFeedback kind="error" />
      </PluginUiProvider>,
    );

    expect(await screen.findByText('出现错误')).toBeVisible();
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('lang', 'zh-CN');
      expect(document.documentElement.style.colorScheme).toBe('dark');
      expect(document.body).toHaveAttribute('theme-mode', 'dark');
    });
  });

  test('updates locale, theme, and built-in messages in both directions', async () => {
    const view = render(
      <PluginUiProvider context={runtimeContext()}>
        <PluginFeedback kind="empty" />
      </PluginUiProvider>,
    );
    expect(await screen.findByText('Nothing here yet')).toBeVisible();

    view.rerender(
      <PluginUiProvider context={runtimeContext('zh-CN', 'dark')}>
        <PluginFeedback kind="empty" />
      </PluginUiProvider>,
    );
    expect(await screen.findByText('暂无内容')).toBeVisible();
    expect(document.body).toHaveAttribute('theme-mode', 'dark');

    view.rerender(
      <PluginUiProvider context={runtimeContext('en-US', 'light')}>
        <PluginFeedback kind="empty" />
      </PluginUiProvider>,
    );
    expect(await screen.findByText('Nothing here yet')).toBeVisible();
    expect(document.body).not.toHaveAttribute('theme-mode');
  });

  test('keeps nested consumer messages isolated without package global state', async () => {
    render(
      <PluginUiProvider context={runtimeContext()}>
        <PluginFeedback kind="loading" />
        <PluginUiProvider context={runtimeContext('zh-CN', 'dark')}>
          <PluginFeedback kind="loading" />
        </PluginUiProvider>
      </PluginUiProvider>,
    );

    expect(await screen.findByText('Loading')).toBeVisible();
    expect(screen.getByText('正在加载')).toBeVisible();
  });

  test('restores pre-mount document state and leaves no listeners', async () => {
    document.documentElement.lang = 'fr';
    document.documentElement.style.colorScheme = 'normal';
    document.body.setAttribute('theme-mode', 'custom');
    const originalAddEventListener = window.addEventListener;

    const view = render(
      <PluginUiProvider context={runtimeContext('zh-CN', 'dark')}>
        <div>child</div>
      </PluginUiProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'zh-CN'));
    view.unmount();

    expect(document.documentElement).toHaveAttribute('lang', 'fr');
    expect(document.documentElement.style.colorScheme).toBe('normal');
    expect(document.body).toHaveAttribute('theme-mode', 'custom');
    expect(window.addEventListener).toBe(originalAddEventListener);
  });
});
