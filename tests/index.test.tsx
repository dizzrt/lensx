import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';

describe('lensX app shell', () => {
  test('renders the product-owned English root interface by default', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'lensX' })).toBeInTheDocument();
    expect(screen.getByText('A lightweight, keyboard-first desktop productivity launcher.')).toBeInTheDocument();
    expect(screen.queryByText(/Rsbuild/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('renders the Simplified Chinese product message when requested', async () => {
    render(
      <AppProviders initialLocale="zh-CN">
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText('一款轻量、键盘优先的桌面效率启动器。')).toBeInTheDocument();
    expect(screen.queryByText(/Rsbuild/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
