import { describe, expect, test } from '@rstest/core';
import type { LauncherActionDescriptor } from '../src/app/launcher/actions';
import { type PageResolution, resolvePageContext } from '../src/app/navigation';

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

const hostResolution: PageResolution = Object.freeze({
  provider: Object.freeze({
    kind: 'host',
    owner_id: 'lensx.core',
    display_name: Object.freeze({ 'en-US': 'lensX' }),
  }),
  page: Object.freeze({
    owner_id: 'lensx.core',
    page_id: 'settings',
    title: Object.freeze({ 'en-US': 'Settings', 'zh-CN': '设置' }),
    route: '/settings',
    available: true,
  }),
});

const pluginResolution: PageResolution = Object.freeze({
  provider: Object.freeze({
    kind: 'plugin',
    owner_id: 'com.acme.notes',
    display_name: Object.freeze({ 'en-US': 'Acme Notes' }),
  }),
  page: Object.freeze({
    owner_id: 'com.acme.notes',
    page_id: 'home',
    title: Object.freeze({ 'en-US': 'Notes Home', 'zh-CN': '笔记主页' }),
    route: '/private-notes',
    available: true,
  }),
});

describe('page context resolution', () => {
  test('resolves localized lensX Host presentation independently from the opening Action icon', () => {
    expect(
      resolvePageContext({
        activePage,
        hostOwnerName: 'lensX',
        locale: 'zh-CN',
        resolution: hostResolution,
        snapshot: [openingAction],
      }),
    ).toEqual({
      action_name: '打开设置',
      owner_icon: { kind: 'host', token: 'lensx-owner' },
      owner_name: 'lensX',
      page_title: '设置',
    });
  });

  test('falls back to the localized page title when the opening Action is missing', () => {
    expect(
      resolvePageContext({
        activePage,
        hostOwnerName: 'lensX',
        locale: 'en-US',
        resolution: hostResolution,
        snapshot: [],
      }),
    ).toEqual({
      action_name: 'Settings',
      owner_icon: { kind: 'host', token: 'lensx-owner' },
      owner_name: 'lensX',
      page_title: 'Settings',
    });
  });

  test('uses plugin display locale fallback and stable generic owner presentation', () => {
    const context = resolvePageContext({
      activePage: { ...activePage, owner_id: 'com.acme.notes', page_id: 'home' },
      hostOwnerName: 'lensX',
      locale: 'zh-CN',
      resolution: pluginResolution,
      snapshot: [],
    });

    expect(context).toEqual({
      action_name: '笔记主页',
      owner_icon: { kind: 'plugin', token: 'generic-provider' },
      owner_name: 'Acme Notes',
      page_title: '笔记主页',
    });
    expect(JSON.stringify(context)).not.toMatch(/private-notes|notes\.read|publisher/u);
  });

  test('returns only frozen plain serializable display data', () => {
    const context = resolvePageContext({
      activePage,
      hostOwnerName: 'lensX',
      locale: 'en-US',
      resolution: hostResolution,
      snapshot: [openingAction],
    });

    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.owner_icon)).toBe(true);
    expect(Object.values(context).some((value) => typeof value === 'function')).toBe(false);
    expect(context).not.toHaveProperty('route');
    expect(context).not.toHaveProperty('required_permission_ids');
    expect(context.owner_icon).not.toHaveProperty('url');
    expect(context.owner_icon).not.toHaveProperty('path');
  });
});
