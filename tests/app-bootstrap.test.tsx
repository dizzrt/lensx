import { describe, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import App from '../src/App';
import { AppBootstrap, type AppStartupState, useProductionPluginLifecycleComposition } from '../src/app/AppBootstrap';
import { useAppLocale } from '../src/app/i18n';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import type { LocalPluginInstallationClient } from '../src/app/plugins/installation';
import type { ProductionPluginLifecycleComposition } from '../src/app/plugins/lifecycle';
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
  test('recreates the production plugin composition across the StrictMode setup-cleanup-setup cycle', async () => {
    type TestComposition = ProductionPluginLifecycleComposition & { readonly id: string };
    const created: TestComposition[] = [];
    const createComposition = () => {
      const composition = {
        id: `composition-${created.length + 1}`,
        initialize: rs.fn(async () => undefined),
        destroy: rs.fn(async () => undefined),
      } as unknown as TestComposition;
      created.push(composition);
      return composition;
    };
    const installationClient: LocalPluginInstallationClient = {
      prepare: async () => ({ status: 'cancelled', contract_version: '0.2.0', operation: 'prepare' }),
      commit: async () => {
        throw new Error('not prepared');
      },
      cancel: async () => ({ status: 'cancelled', contract_version: '0.2.0', operation: 'cancel' }),
    };
    const Probe = () => {
      const composition = useProductionPluginLifecycleComposition(installationClient, createComposition);
      return (
        <output aria-label="plugin composition">{(composition as TestComposition | undefined)?.id ?? 'pending'}</output>
      );
    };

    const rendered = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    expect(await screen.findByLabelText('plugin composition')).toHaveTextContent('composition-2');
    expect(created).toHaveLength(2);
    expect(created[0]?.initialize).toHaveBeenCalledTimes(1);
    expect(created[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(created[1]?.initialize).toHaveBeenCalledTimes(1);
    expect(created[1]?.destroy).not.toHaveBeenCalled();

    rendered.unmount();
    expect(created[1]?.destroy).toHaveBeenCalledTimes(1);
  });

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
              collectionsClient={{
                read: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
                recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
                setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
              }}
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
