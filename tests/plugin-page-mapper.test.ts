import { describe, expect, test } from '@rstest/core';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import { mapPluginRegistrationToPageProviderBatch } from '../src/app/plugins/pages';
import { parsePluginRegistrationDetailResponse } from '../src/app/plugins/registration';

const response = parsePluginRegistrationDetailResponse(
  structuredClone(validCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (response.detail.kind !== 'registered') {
  throw new Error('Healthy detail fixture must contain a registered plugin.');
}
const detail = response.detail;

describe('Plugin Page mapper', () => {
  test('maps a multi-Page graph with stable owner identity, private route, parent, and open-Web availability', () => {
    const batch = mapPluginRegistrationToPageProviderBatch(detail);
    expect(batch).toEqual({
      provider: {
        kind: 'plugin',
        owner_id: 'com.acme.workspace',
        display_name: { 'en-US': 'Workspace Tools', 'zh-CN': '工作区工具' },
      },
      pages: [
        {
          owner_id: 'com.acme.workspace',
          page_id: 'home',
          title: { 'en-US': 'Workspace Tools', 'zh-CN': '工作区工具' },
          route: '/',
          presentation: { initial_size: { width: 800, height: 600 }, resizable: true },
          available: true,
        },
        {
          owner_id: 'com.acme.workspace',
          page_id: 'open_project',
          title: { 'en-US': 'Open Project', 'zh-CN': '打开项目' },
          route: '/open-project',
          parent: { owner_id: 'com.acme.workspace', page_id: 'home' },
          presentation: { initial_size: { width: 650, height: 600 }, resizable: false },
          available: true,
        },
      ],
    });
    expect(Object.isFrozen(batch)).toBe(true);
    expect(batch?.pages[1]).not.toHaveProperty('required_permission_ids');
    expect(batch?.pages[0]?.presentation).not.toBe(detail.manifest.contributes.pages[0]?.presentation);
  });

  test('binds presentation to provider and Page identity without accepting route or action overrides', () => {
    const mutated = structuredClone(detail);
    const action = mutated.manifest.contributes.actions.at(0);
    expect(action).toBeDefined();
    if (!action) throw new TypeError('Expected one fixture Action.');
    (mutated.manifest.contributes.actions as unknown as Array<Record<string, unknown>>)[0] = {
      ...action,
      target: { kind: 'page', page_id: 'open_project' },
      presentation: { initial_size: { width: 4096, height: 4096 }, resizable: true },
    };
    (mutated.manifest.contributes.pages[1] as { route: string }).route = '/presentation/320/180/true';

    const batch = mapPluginRegistrationToPageProviderBatch(mutated);
    expect(batch?.pages[1]?.presentation).toEqual({
      initial_size: { width: 650, height: 600 },
      resizable: false,
    });
  });

  test('marks a valid contributed Page available without Host grants', () => {
    const batch = mapPluginRegistrationToPageProviderBatch({
      ...detail,
    });
    expect(batch?.pages.find(({ page_id: pageId }) => pageId === 'open_project')?.available).toBe(true);
  });

  test('fails closed for disabled or incompatible detail and ignores Publisher identity for ownership', () => {
    expect(mapPluginRegistrationToPageProviderBatch({ ...detail, enabled: false })).toBeUndefined();
    expect(
      mapPluginRegistrationToPageProviderBatch({
        ...detail,
        compatibility: { lensx: true, host_api: false },
      }),
    ).toBeUndefined();
    const batch = mapPluginRegistrationToPageProviderBatch({
      ...detail,
      manifest: { ...detail.manifest, publisher: { ...detail.manifest.publisher, author: 'lensx.core' } },
    });
    expect(batch?.provider.owner_id).toBe(detail.manifest.plugin_id);
    expect(batch?.pages.every(({ owner_id: ownerId }) => ownerId === detail.manifest.plugin_id)).toBe(true);
  });
});
