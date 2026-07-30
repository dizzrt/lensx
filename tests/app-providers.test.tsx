import enUS from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN';
import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '../src/app/AppProviders';
import { getSemiLocale, useAppLocale } from '../src/app/i18n';
import { useAppTheme } from '../src/app/theme';

const FoundationProbe = () => {
  const { t } = useTranslation();
  const { locale, setLocale } = useAppLocale();
  const { setThemeMode, themeMode } = useAppTheme();

  return (
    <div>
      <p data-testid="message">{t('app.description')}</p>
      <output data-testid="locale">{locale}</output>
      <output data-testid="theme">{themeMode}</output>
      <button onClick={() => setLocale('zh-CN')} type="button">
        Use Chinese
      </button>
      <button onClick={() => setLocale('en-US')} type="button">
        Use English
      </button>
      <button onClick={() => setThemeMode('dark')} type="button">
        Use dark theme
      </button>
      <button onClick={() => setThemeMode('light')} type="button">
        Use light theme
      </button>
    </div>
  );
};

const ThemeReadout = ({ label }: { label: string }) => {
  const { themeMode } = useAppTheme();

  return <output aria-label={label}>{themeMode}</output>;
};

const RenderFailure = () => {
  throw new Error('Sensitive internal render detail');
};

describe('application locale foundation', () => {
  test('defaults to English and switches both directions from one locale source', async () => {
    render(
      <AppProviders>
        <FoundationProbe />
      </AppProviders>,
    );

    expect(screen.getByTestId('locale')).toHaveTextContent('en-US');
    expect(screen.getByTestId('message')).toHaveTextContent(
      'A lightweight, keyboard-first desktop productivity launcher.',
    );
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'en-US'));

    fireEvent.click(screen.getByRole('button', { name: 'Use Chinese' }));

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN');
      expect(screen.getByTestId('message')).toHaveTextContent('一款轻量、键盘优先的桌面效率启动器。');
      expect(document.documentElement).toHaveAttribute('lang', 'zh-CN');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use English' }));

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('en-US');
      expect(screen.getByTestId('message')).toHaveTextContent(
        'A lightweight, keyboard-first desktop productivity launcher.',
      );
      expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    });
  });

  test('maps supported app locales to the official Semi Design locale packs', () => {
    expect(getSemiLocale('en-US')).toBe(enUS);
    expect(getSemiLocale('zh-CN')).toBe(zhCN);
  });
});

describe('application theme foundation', () => {
  test('switches light and dark modes, synchronizes the document, and restores prior global state', async () => {
    document.body.setAttribute('theme-mode', 'host-theme');
    document.documentElement.style.colorScheme = 'normal';

    const { unmount } = render(
      <AppProviders>
        <FoundationProbe />
        <ThemeReadout label="second theme consumer" />
      </AppProviders>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByLabelText('second theme consumer')).toHaveTextContent('light');
    await waitFor(() => {
      expect(document.body).not.toHaveAttribute('theme-mode');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(screen.getByLabelText('second theme consumer')).toHaveTextContent('dark');
      expect(document.body).toHaveAttribute('theme-mode', 'dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }));

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(screen.getByLabelText('second theme consumer')).toHaveTextContent('light');
      expect(document.body).not.toHaveAttribute('theme-mode');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    unmount();

    expect(document.body).toHaveAttribute('theme-mode', 'host-theme');
    expect(document.documentElement.style.colorScheme).toBe('normal');
  });
});

describe('application error boundary', () => {
  test('shows a localized accessible fallback and requests a reload without exposing error details', () => {
    const reload = rs.fn();
    const consoleError = rs.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppProviders initialLocale="zh-CN" initialThemeMode="dark" onReload={reload}>
        <RenderFailure />
      </AppProviders>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '出现了问题' })).toBeInTheDocument();
    expect(screen.getByText('lensX 无法显示此界面。请重新加载应用后再试。')).toBeInTheDocument();
    expect(screen.queryByText(/Sensitive internal render detail/)).not.toBeInTheDocument();
    expect(document.body).toHaveAttribute('theme-mode', 'dark');

    fireEvent.click(screen.getByRole('button', { name: '重新加载 lensX' }));

    expect(reload).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
