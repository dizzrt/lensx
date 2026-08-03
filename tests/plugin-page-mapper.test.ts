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
  test('maps a multi-Page graph with stable owner identity, private route, parent, and grant-subset availability', () => {
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
          required_permission_ids: [],
          available: true,
        },
        {
          owner_id: 'com.acme.workspace',
          page_id: 'open_project',
          title: { 'en-US': 'Open Project', 'zh-CN': '打开项目' },
          route: '/open-project',
          parent: { owner_id: 'com.acme.workspace', page_id: 'home' },
          required_permission_ids: ['lensx.filesystem.read_selected'],
          available: false,
        },
      ],
    });
    expect(Object.isFrozen(batch)).toBe(true);
    expect(Object.isFrozen(batch?.pages[1]?.required_permission_ids)).toBe(true);
  });

  test('marks a Page available only after every required grant is present', () => {
    const batch = mapPluginRegistrationToPageProviderBatch({
      ...detail,
      granted_permission_ids: ['lensx.filesystem.read_selected'],
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
