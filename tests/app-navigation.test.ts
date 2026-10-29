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
      presentation: {
        initial_size: { width: 650, height: 600 },
        resizable: false,
      },
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

describe('Page invocation identity and revocation', () => {
  test('binds a Session only to its native presentation attempt, including dispatch-before-create and late old dispatches', async () => {
    const registry = new HostPageCatalog([]);
    registry.replaceProviderBatch('com.acme.notes', pluginBatch());
    const service = new AppNavigationService(registry);
    service.registerHandler(rs.fn());
    const target = { owner_id: 'com.acme.notes', page_id: 'home' };
    service.openPage(target, 'com.acme.notes.open', { invocationId: 1, source: 'shortcut' });
    const early = service.bindNativeActivations(target, 'attempt_0000000000000001');
    service.attachNativeActivationAttempt(target, 'attempt_0000000000000001');
    const original = await early;
    expect(original?.subscribe(() => true)).toEqual([{ actionId: 'open', invocationId: 1, source: 'shortcut' }]);
    service.restartActivationAttempt(target);
    const late = service.bindNativeActivations(target, 'attempt_0000000000000001');
    const next = service.bindNativeActivations(target, 'attempt_0000000000000002');
    service.attachNativeActivationAttempt(target, 'attempt_0000000000000002');
    expect(await late).toBeUndefined();
    expect(service.isNativeActivationAttemptCurrent(target, 'attempt_0000000000000001')).toBe(false);
    expect((await next)?.subscribe(() => true)).toEqual([]);
    expect(original?.available()).toBe(false);
    service.destroy();
  });

  test('reuses one attempt across same-page actions and never replays after switching or retrying', () => {
    const registry = new HostPageCatalog([{ ...settingsTarget, enabled: true }]);
    registry.replaceProviderBatch('com.acme.notes', pluginBatch());
    const service = new AppNavigationService(registry);
    const handler = rs.fn();
    service.registerHandler(handler);
    const target = { owner_id: 'com.acme.notes', page_id: 'home' };
    const opened = service.openPage(target, 'com.acme.notes.open', { invocationId: 1, source: 'normal' });
    expect(Object.keys(opened).sort()).toEqual(['opened_by_action_id', 'owner_id', 'page_id']);
    service.openPage(target, 'com.acme.notes.alternate', { invocationId: 2, source: 'shortcut' });
    const session = service.bindActivations(target);
    const emit = rs.fn(() => true);
    expect(session?.subscribe(emit)).toEqual([
      { actionId: 'open', invocationId: 1, source: 'normal' },
      { actionId: 'alternate', invocationId: 2, source: 'shortcut' },
    ]);
    service.openPage(target, 'com.acme.notes.open', { invocationId: 3, source: 'normal' });
    expect(emit).toHaveBeenCalledWith({ actionId: 'open', invocationId: 3, source: 'normal' });
    expect(session?.current()).toEqual({ actionId: 'open', invocationId: 3, source: 'normal' });
    service.openPage(settingsTarget, 'lensx.core.open_settings', { invocationId: 4, source: 'normal' });
    expect(session?.available()).toBe(false);
    expect(service.bindActivations(target)).toBeUndefined();
    service.openPage(target, 'com.acme.notes.open', { invocationId: 5, source: 'shortcut' });
    const replacement = service.bindActivations(target);
    expect(replacement?.subscribe(emit)).toEqual([{ actionId: 'open', invocationId: 1, source: 'shortcut' }]);
    replacement?.dispose();
    expect(service.bindActivations(target)).toBeUndefined();
    service.restartActivationAttempt(target);
    const retried = service.bindActivations(target);
    expect(retried?.subscribe(emit)).toEqual([]);
    service.destroy();
    expect(retried?.available()).toBe(false);
  });
});
