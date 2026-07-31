import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import App from '../src/App';
import { AppBootstrap, type AppStartupState } from '../src/app/AppBootstrap';
import { useAppLocale } from '../src/app/i18n';
import type { AppPreferencesClient } from '../src/app/preferences';
import { AppPreferencesError, DEFAULT_APP_PREFERENCES } from '../src/app/preferences';
import { useAppTheme } from '../src/app/theme';

const inertActivationSource = {
  subscribe: async () => () => undefined,
};

const ProviderReadout = ({ startupState }: { startupState: AppStartupState }) => {
  const { locale } = useAppLocale();
  const { themeMode } = useAppTheme();

  return (
    <>
      <output aria-label="locale">{locale}</output>
      <output aria-label="theme">{themeMode}</output>
      <output aria-label="startup error">{startupState.preferencesErrorCode ?? 'none'}</output>
    </>
  );
};

const renderBootstrap = (preferencesClient: AppPreferencesClient) =>
  render(
    <AppBootstrap
      preferencesClient={preferencesClient}
      renderApp={(startupState) => <ProviderReadout startupState={startupState} />}
    />,
  );

describe('application preferences bootstrap', () => {
  test('waits for saved preferences and initializes root providers with the restored snapshot', async () => {
    renderBootstrap({
      read: async () => ({ theme_mode: 'dark', locale: 'zh-CN' }),
      write: async (preferences) => preferences,
    });

    expect(screen.queryByLabelText('locale')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('locale')).toHaveTextContent('zh-CN');
    expect(screen.getByLabelText('theme')).toHaveTextContent('dark');
    expect(screen.getByLabelText('startup error')).toHaveTextContent('none');
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN');
  });

  test('uses Rust defaults unchanged when the preferences file is missing', async () => {
    renderBootstrap({
      read: async () => DEFAULT_APP_PREFERENCES,
      write: async (preferences) => preferences,
    });

    expect(await screen.findByLabelText('locale')).toHaveTextContent('en-US');
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    expect(screen.getByLabelText('startup error')).toHaveTextContent('none');
  });

  test('falls back safely and exposes localized diagnostic feedback after a read failure', async () => {
    const preferencesClient: AppPreferencesClient = {
      read: async () => {
        throw new AppPreferencesError({
          code: 'preferences_read_failed',
          operation: 'read',
          message: 'Application preferences could not be read.',
        });
      },
      write: async (preferences) => preferences,
    };

    render(
      <AppBootstrap
        preferencesClient={preferencesClient}
        renderApp={(startupState) => (
          <>
            <App
              activationSource={inertActivationSource}
              startupPreferencesErrorCode={startupState.preferencesErrorCode}
            />
            <ProviderReadout startupState={startupState} />
          </>
        )}
      />,
    );

    expect(await screen.findByLabelText('locale')).toHaveTextContent('en-US');
    expect(screen.getByLabelText('theme')).toHaveTextContent('light');
    expect(screen.getByLabelText('startup error')).toHaveTextContent('preferences_read_failed');
    expect(screen.getByText('Saved preferences could not be restored. Safe defaults are in use.')).toHaveAttribute(
      'role',
      'status',
    );
  });
});
