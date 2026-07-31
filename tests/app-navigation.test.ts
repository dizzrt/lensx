import { describe, expect, rs, test } from '@rstest/core';
import { AppNavigationError, AppNavigationService, HostPageCatalog } from '../src/app/navigation';

const settingsTarget = {
  owner_id: 'lensx.core',
  page_id: 'settings',
};

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
