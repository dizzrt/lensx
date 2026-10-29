import { expect, test } from '@rstest/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import { createDefaultLauncherActionService } from '../src/app/launcher/actions';
import type { NativeActionInvocationPort } from '../src/app/launcher/actions/native-invocations';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import { AppNavigationService, PageRegistry } from '../src/app/navigation';

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const presentation of ['home', 'host', 'plugin'] as const) {
      test(`native invocation failures remain visible without stealing input in ${presentation}/${locale}/${theme}`, async () => {
        const pages = new PageRegistry([{ owner_id: 'lensx.core', page_id: 'settings', enabled: true }]);
        pages.replaceProviderBatch('com.test.plugin', {
          provider: { owner_id: 'com.test.plugin', kind: 'plugin', display_name: { 'en-US': 'Example' } },
          pages: [
            {
              owner_id: 'com.test.plugin',
              page_id: 'main',
              title: { 'en-US': 'Example' },
              route: '/',
              available: true,
              presentation: { initial_size: { width: 650, height: 600 }, resizable: false },
            },
          ],
        });
        const navigation = new AppNavigationService(pages);
        const actions = createDefaultLauncherActionService({ hideLauncher: async () => undefined }, navigation);
        let failed: (() => void) | undefined;
        const port: NativeActionInvocationPort = {
          listen: async (_receive, onFailure) => {
            failed = onFailure;
            return () => undefined;
          },
          ready: async () => [],
          claim: async () => false,
        };
        render(
          <AppProviders initialLocale={locale} initialThemeMode={theme}>
            <App
              actionService={actions}
              navigationService={navigation}
              nativeActionInvocationPort={port}
              activationSource={{ subscribe: async () => () => undefined }}
              collectionsClient={{
                read: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
                recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
                setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
              }}
              renderPage={() => <input aria-label="Current page input" defaultValue="preserved draft" />}
            />
          </AppProviders>,
        );
        await waitFor(() => expect(failed).toBeDefined());
        if (presentation !== 'home') {
          act(() =>
            navigation.openPage(
              presentation === 'host'
                ? { owner_id: 'lensx.core', page_id: 'settings' }
                : { owner_id: 'com.test.plugin', page_id: 'main' },
              presentation === 'host' ? 'lensx.core.open_settings' : 'com.test.plugin.open',
            ),
          );
          screen.getByRole('textbox', { name: 'Current page input' }).focus();
        }
        const focused = document.activeElement;
        act(() => failed?.());
        const message = screen.getByText(
          locale === 'en-US' ? 'The action could not be completed.' : '无法完成该操作。',
        );
        expect(message).toHaveClass('launcher-feedback');
        expect(message).not.toHaveClass('sr-only');
        expect(message).toHaveAttribute('aria-live', 'polite');
        expect(message).toHaveAttribute('data-feedback', 'error');
        expect(document.activeElement).toBe(focused);
        expect(message.closest('.launcher-content')).toBeNull();
        if (presentation !== 'home')
          expect(screen.getByRole('textbox', { name: 'Current page input' })).toHaveValue('preserved draft');
      });
    }
  }
}
