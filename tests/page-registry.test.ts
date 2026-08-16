import { describe, expect, rs, test } from '@rstest/core';
import { type ActivePage, type PageContext, type PageProviderBatch, PageRegistry } from '../src/app/navigation';

const hostPage = {
  owner_id: 'lensx.core',
  page_id: 'settings',
  enabled: true,
  title: { 'en-US': 'Settings', 'zh-CN': '设置' },
  route: '/settings',
} as const;

const pluginBatch = (ownerId = 'com.acme.notes'): PageProviderBatch => ({
  provider: {
    kind: 'plugin',
    owner_id: ownerId,
    display_name: { 'en-US': 'Acme Notes', 'zh-CN': 'Acme 笔记' },
  },
  pages: [
    {
      owner_id: ownerId,
      page_id: 'home',
      title: { 'en-US': 'Notes' },
      route: '/private/home',
      presentation: { initial_size: { width: 720, height: 540 }, resizable: true },
      available: true,
    },
    {
      owner_id: ownerId,
      page_id: 'settings',
      title: { 'en-US': 'Note settings' },
      route: '/private/settings',
      parent: { owner_id: ownerId, page_id: 'home' },
      available: false,
      presentation: { initial_size: { width: 650, height: 600 }, resizable: false },
    },
  ],
});

describe('Page Registry', () => {
  test('keeps ActivePage and PageContext free of private descriptor and bookkeeping fields at the type boundary', () => {
    type AssertFalse<Value extends false> = Value;
    type ActiveHasRoute = 'route' extends keyof ActivePage ? true : false;
    type ActiveHasPermissions = 'required_permission_ids' extends keyof ActivePage ? true : false;
    type ContextHasRoute = 'route' extends keyof PageContext ? true : false;
    type ContextHasBookkeeping = 'providerOwner' extends keyof PageContext ? true : false;
    const assertions: [
      AssertFalse<ActiveHasRoute>,
      AssertFalse<ActiveHasPermissions>,
      AssertFalse<ContextHasRoute>,
      AssertFalse<ContextHasBookkeeping>,
    ] = [false, false, false, false];
    expect(assertions).toEqual([false, false, false, false]);
  });

  test('atomically replaces and unregisters one plugin provider while protecting Host Pages', () => {
    const registry = new PageRegistry([hostPage]);
    const listener = rs.fn();
    registry.subscribe(listener);

    expect(registry.replaceProviderBatch('com.acme.notes', pluginBatch()).ok).toBe(true);
    expect(registry.snapshot().map(({ page }) => `${page.owner_id}/${page.page_id}`)).toEqual([
      'com.acme.notes/home',
      'com.acme.notes/settings',
      'lensx.core/settings',
    ]);
    expect(registry.lookup({ owner_id: 'com.acme.notes', page_id: 'home' })?.page.available).toBe(true);
    expect(registry.replaceProviderBatch('com.acme.notes', [])).toMatchObject({ ok: true, pages: [] });
    expect(registry.lookup({ owner_id: 'com.acme.notes', page_id: 'home' })).toBeUndefined();
    expect(registry.hasAvailablePage({ owner_id: 'lensx.core', page_id: 'settings' })).toBe(true);
    expect(registry.replaceProviderBatch('lensx.core', [])).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'protected_host_owner' }],
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('rejects duplicate identities, cross-owner parents, and invalid owners without partial mutation', () => {
    const registry = new PageRegistry([hostPage]);
    expect(registry.replaceProviderBatch('com.acme.notes', pluginBatch()).ok).toBe(true);
    const before = registry.snapshot();

    const duplicate = pluginBatch();
    const duplicatePage = duplicate.pages[0];
    if (!duplicatePage) {
      throw new Error('Plugin batch fixture must contain a Page.');
    }
    const duplicateResult = registry.replaceProviderBatch('com.acme.notes', {
      ...duplicate,
      pages: [duplicatePage, duplicatePage],
    });
    expect(duplicateResult).toMatchObject({ ok: false, diagnostics: [{ code: 'duplicate_page_identity' }] });
    expect(registry.snapshot()).toEqual(before);

    const crossParent = pluginBatch();
    const [parentPage, childPage] = crossParent.pages;
    if (!parentPage || !childPage) {
      throw new Error('Plugin batch fixture must contain a Page hierarchy.');
    }
    const crossParentResult = registry.replaceProviderBatch('com.acme.notes', {
      ...crossParent,
      pages: [parentPage, { ...childPage, parent: { owner_id: 'com.other.plugin', page_id: 'home' } }],
    });
    expect(crossParentResult).toMatchObject({ ok: false, diagnostics: [{ code: 'invalid_parent' }] });
    expect(registry.snapshot()).toEqual(before);
  });

  test('requires exact bounded plugin presentation and keeps Host Pages presentation-free', () => {
    const registry = new PageRegistry([hostPage]);
    const invalid = structuredClone(pluginBatch()) as unknown as PageProviderBatch;
    const first = invalid.pages[0] as unknown as Record<string, unknown>;
    first.presentation = {
      initial_size: { width: 720, height: 540 },
      resizable: true,
      monitor: 'primary',
    };
    expect(registry.replaceProviderBatch('com.acme.notes', invalid)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid_descriptor', path: '/pages/0/presentation/monitor' }],
    });
    expect(registry.lookup({ owner_id: 'lensx.core', page_id: 'settings' })?.page).not.toHaveProperty('presentation');
  });

  test('isolates mutable inputs and returns deeply frozen lookup and snapshot copies', () => {
    const registry = new PageRegistry([hostPage]);
    const batch = structuredClone(pluginBatch()) as {
      provider: { display_name: { 'en-US': string }; kind: 'plugin'; owner_id: string };
      pages: Array<{
        available: boolean;
        owner_id: string;
        page_id: string;
        route: string;
        title: { 'en-US': string };
        presentation: { initial_size: { width: number; height: number }; resizable: boolean };
      }>;
    };
    expect(registry.replaceProviderBatch('com.acme.notes', batch).ok).toBe(true);
    const mutablePage = batch.pages[0];
    if (!mutablePage) {
      throw new Error('Plugin batch fixture must contain a mutable Page.');
    }
    batch.provider.display_name['en-US'] = 'Mutated';
    mutablePage.title['en-US'] = 'Mutated';
    mutablePage.presentation.initial_size.width = 4096;

    const lookup = registry.lookup({ owner_id: 'com.acme.notes', page_id: 'home' });
    expect(lookup?.provider.display_name['en-US']).toBe('Acme Notes');
    expect(lookup?.page.title['en-US']).toBe('Notes');
    expect(lookup?.page.presentation?.initial_size.width).toBe(720);
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(lookup?.provider.display_name)).toBe(true);
    expect(Object.isFrozen(registry.snapshot())).toBe(true);
    expect(lookup).not.toHaveProperty('providerOwner');
  });
});
