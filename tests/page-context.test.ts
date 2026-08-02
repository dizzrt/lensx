import { describe, expect, test } from '@rstest/core';
import type { LauncherActionDescriptor } from '../src/app/launcher/actions';
import { resolvePageContext } from '../src/app/navigation';

const openingAction: LauncherActionDescriptor = Object.freeze({
  action_id: 'lensx.core.open_settings',
  owner_id: 'lensx.core',
  title: Object.freeze({ 'en-US': 'Open settings', 'zh-CN': '打开设置' }),
  default_keywords: Object.freeze({}),
  icon: Object.freeze({ kind: 'host', token: 'settings' }),
  enabled: true,
});

const activePage = Object.freeze({
  owner_id: 'lensx.core',
  page_id: 'settings',
  opened_by_action_id: openingAction.action_id,
});

describe('page context resolution', () => {
  test('resolves localized lensX Host presentation independently from the opening Action icon', () => {
    expect(
      resolvePageContext({
        activePage,
        hostOwnerName: 'lensX',
        locale: 'zh-CN',
        pageTitleFallback: '设置',
        snapshot: [openingAction],
      }),
    ).toEqual({
      action_name: '打开设置',
      owner_icon: { kind: 'host', token: 'lensx-owner' },
      owner_name: 'lensX',
    });
  });

  test('falls back to the localized page title when the opening Action is missing', () => {
    expect(
      resolvePageContext({
        activePage,
        hostOwnerName: 'lensX',
        locale: 'en-US',
        pageTitleFallback: 'Settings',
        snapshot: [],
      }),
    ).toEqual({
      action_name: 'Settings',
      owner_icon: { kind: 'host', token: 'lensx-owner' },
      owner_name: 'lensX',
    });
  });

  test('returns only frozen plain serializable display data', () => {
    const context = resolvePageContext({
      activePage,
      hostOwnerName: 'lensX',
      locale: 'en-US',
      pageTitleFallback: 'Settings',
      snapshot: [openingAction],
    });

    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.owner_icon)).toBe(true);
    expect(Object.values(context).some((value) => typeof value === 'function')).toBe(false);
    expect(context).not.toHaveProperty('reactNode');
    expect(context).not.toHaveProperty('component');
    expect(context.owner_icon).not.toHaveProperty('url');
    expect(context.owner_icon).not.toHaveProperty('path');
  });

  test('keeps unknown owners as text and leaves icon selection to the stable fallback', () => {
    expect(
      resolvePageContext({
        activePage: { ...activePage, owner_id: 'example.provider' },
        hostOwnerName: 'lensX',
        locale: 'en-US',
        pageTitleFallback: 'Example page',
        snapshot: [],
      }),
    ).toEqual({
      action_name: 'Example page',
      owner_name: 'example.provider',
    });
  });
});
