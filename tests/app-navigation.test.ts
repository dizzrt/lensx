import { describe, expect, rs, test } from '@rstest/core';
import {
  AppNavigationError,
  AppNavigationService,
  HostPageCatalog,
  type PageProviderBatch,
} from '../src/app/navigation';

const settingsTarget = {
  owner_id: 'lensx.core',
  page_id: 'settings',
};

const pluginBatch = (available = true, title = 'Notes'): PageProviderBatch => ({
  provider: {
    kind: 'plugin',
    owner_id: 'com.acme.notes',
    display_name: { 'en-US': 'Acme Notes' },
  },
  pages: [
    {
      owner_id: 'com.acme.notes',
      page_id: 'home',
      title: { 'en-US': title },
      route: '/notes',
      available,
    },
  ],
});

describe('App navigation service', () => {
  test('preflights a trusted page and sends one flat active-page identity to the registered handler', () => {
    const service = new AppNavigationService(
      new HostPageCatalog([
        {
          ...settingsTarget,
          enabled: true,
        },
      ]),
    );
    const handler = rs.fn();
    const unregister = service.registerHandler(handler);

    expect(service.openPage(settingsTarget, 'lensx.core.open_settings')).toEqual({
      owner_id: 'lensx.core',
      page_id: 'settings',
      opened_by_action_id: 'lensx.core.open_settings',
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      owner_id: 'lensx.core',
      page_id: 'settings',
      opened_by_action_id: 'lensx.core.open_settings',
    });

    unregister();
    expect(() => service.openPage(settingsTarget, 'lensx.core.open_settings')).toThrow(AppNavigationError);
  });

  test('rejects missing or disabled pages before invoking a handler', () => {
    const service = new AppNavigationService(
      new HostPageCatalog([
        {
          ...settingsTarget,
          enabled: false,
        },
      ]),
    );
    const handler = rs.fn();
    service.registerHandler(handler);

    expect(() => service.openPage(settingsTarget, 'lensx.core.open_settings')).toThrow(
      expect.objectContaining({ code: 'page_unavailable' }),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  test('uses one safe unavailable error for unknown, unavailable, and missing-handler targets', () => {
    const registry = new HostPageCatalog([]);
    registry.replaceProviderBatch('com.acme.notes', pluginBatch(false));
    const service = new AppNavigationService(registry);
    service.registerHandler(rs.fn());

    expect(() => service.openPage({ owner_id: 'com.acme.notes', page_id: 'missing' }, 'notes.open')).toThrow(
      expect.objectContaining({ code: 'page_unavailable', message: 'The requested page is unavailable.' }),
    );
    expect(() => service.openPage({ owner_id: 'com.acme.notes', page_id: 'home' }, 'notes.open')).toThrow(
      expect.objectContaining({ code: 'page_unavailable', message: 'The requested page is unavailable.' }),
    );

    const availableService = new AppNavigationService(new HostPageCatalog([{ ...settingsTarget, enabled: true }]));
    expect(() => availableService.openPage(settingsTarget, 'lensx.core.open_settings')).toThrow(
      expect.objectContaining({ code: 'page_unavailable', message: 'The requested page is unavailable.' }),
    );
  });

  test('closes an active plugin Page when replacement removes availability but retains metadata-only updates', () => {
    const registry = new HostPageCatalog([{ ...settingsTarget, enabled: true }]);
    registry.replaceProviderBatch('com.acme.notes', pluginBatch());
    const service = new AppNavigationService(registry);
    const handler = rs.fn();
    service.registerHandler(handler);
    const target = { owner_id: 'com.acme.notes', page_id: 'home' };

    service.openPage(target, 'com.acme.notes.open');
    registry.replaceProviderBatch('com.acme.notes', pluginBatch(true, 'Updated Notes'));
    expect(handler).toHaveBeenCalledTimes(1);

    registry.replaceProviderBatch('com.acme.notes', pluginBatch(false));
    expect(handler).toHaveBeenLastCalledWith(undefined);

    service.openPage(settingsTarget, 'lensx.core.open_settings');
    registry.replaceProviderBatch('com.acme.notes', []);
    expect(handler).toHaveBeenLastCalledWith({
      owner_id: 'lensx.core',
      page_id: 'settings',
      opened_by_action_id: 'lensx.core.open_settings',
    });
  });

  test('closes only the currently matching trusted Page target', () => {
    const registry = new HostPageCatalog([{ ...settingsTarget, enabled: true }]);
    registry.replaceProviderBatch('com.acme.notes', pluginBatch());
    const service = new AppNavigationService(registry);
    const handler = rs.fn();
    service.registerHandler(handler);
    const pluginTarget = { owner_id: 'com.acme.notes', page_id: 'home' };

    service.openPage(pluginTarget, 'com.acme.notes.open');
    expect(service.isActivePage(pluginTarget)).toBe(true);
    expect(service.closePageIfMatches(settingsTarget)).toBe(false);
    expect(service.isActivePage(pluginTarget)).toBe(true);
    expect(service.closePageIfMatches(pluginTarget)).toBe(true);
    expect(service.closePageIfMatches(pluginTarget)).toBe(false);
    expect(handler).toHaveBeenLastCalledWith(undefined);
  });

  test('protects the single-handler lifecycle and allows registration after cleanup', () => {
    const service = new AppNavigationService(new HostPageCatalog([]));
    const unregister = service.registerHandler(() => undefined);

    expect(() => service.registerHandler(() => undefined)).toThrow(
      expect.objectContaining({ code: 'navigation_handler_already_registered' }),
    );

    unregister();
    expect(() => service.registerHandler(() => undefined)).not.toThrow();
  });
});
