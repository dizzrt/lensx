import { describe, expect, test } from '@rstest/core';
import type { LocalPluginInstallationCandidate } from '../src/app/plugins/installation';
import {
  createPluginPermissionCatalog,
  deriveCurrentPermissionPrompt,
  deriveInstallationPermissionPrompt,
  deriveReplacementPermissionPrompt,
} from '../src/app/plugins/permission';

const candidate = (
  requestedPermissions: LocalPluginInstallationCandidate['requested_permissions'],
): LocalPluginInstallationCandidate =>
  Object.freeze({
    plugin_id: 'com.acme.workspace',
    version: '1.2.3',
    display_name: Object.freeze({ 'en-US': 'Workspace', 'zh-CN': '工作区' }),
    publisher: Object.freeze({
      author: 'lensX official verified',
      homepage: 'https://example.com',
      repository: 'https://example.com/repository',
    }),
    requested_permissions: Object.freeze(requestedPermissions),
  });

describe('Host-private plugin permission prompts', () => {
  test('separates Host risk, author reason, publisher text, support, and grant state', () => {
    const prompt = deriveInstallationPermissionPrompt(
      candidate([
        Object.freeze({
          permission_id: 'clipboard.read',
          reason: Object.freeze({ 'en-US': 'Read selected text.', 'zh-CN': '读取选中文本。' }),
        }),
        Object.freeze({ permission_id: 'future.permission', reason: Object.freeze({ 'en-US': 'Trust me.' }) }),
      ]),
      createPluginPermissionCatalog(true),
    );
    expect(prompt.publisher_unverified).toBe(true);
    expect(prompt.permissions[0]).toMatchObject({
      permission_id: 'clipboard.read',
      risk: 'sensitive',
      supported: true,
      effective: 'not_granted',
      grant_available: true,
      publisher_unverified: true,
    });
    expect(prompt.permissions[0]?.host_risk_description['en-US']).not.toBe(
      prompt.permissions[0]?.author_reason?.['en-US'],
    );
    expect(prompt.permissions[1]).toMatchObject({
      permission_id: 'future.permission',
      risk: 'unknown',
      supported: false,
      effective: 'unsupported',
      grant_available: false,
    });
    expect(Object.isFrozen(prompt.permissions)).toBe(true);
    expect(Object.isFrozen(prompt.permissions[0]?.author_reason)).toBe(true);
  });

  test('preserves bilingual reasons for locale fallback and supports empty requests', () => {
    const prompt = deriveInstallationPermissionPrompt(
      candidate([
        Object.freeze({ permission_id: 'clipboard.write', reason: Object.freeze({ 'en-US': 'A'.repeat(4096) }) }),
      ]),
      createPluginPermissionCatalog(true),
    );
    expect(
      prompt.permissions[0]?.author_reason?.['zh-CN'] ?? prompt.permissions[0]?.author_reason?.['en-US'],
    ).toHaveLength(4096);
    expect(deriveInstallationPermissionPrompt(candidate([]), createPluginPermissionCatalog(true)).permissions).toEqual(
      [],
    );
  });

  test('derives partial current grants and retained, added, and removed replacement groups', () => {
    const current = deriveCurrentPermissionPrompt(
      [
        Object.freeze({
          permission_id: 'clipboard.read',
          risk: 'sensitive',
          methods: Object.freeze(['clipboard.read' as const]),
          supported: true,
          state: 'granted',
          reason: Object.freeze({ 'en-US': 'Read.' }),
        }),
        Object.freeze({
          permission_id: 'clipboard.write',
          risk: 'sensitive',
          methods: Object.freeze(['clipboard.write' as const]),
          supported: true,
          state: 'not_granted',
          reason: Object.freeze({ 'en-US': 'Write.' }),
        }),
      ],
      createPluginPermissionCatalog(true),
    );
    expect(current.map(({ persisted_grant, effective }) => ({ persisted_grant, effective }))).toEqual([
      { persisted_grant: true, effective: 'granted' },
      { persisted_grant: false, effective: 'not_granted' },
    ]);
    const diff = deriveReplacementPermissionPrompt(
      current,
      ['clipboard.write'],
      ['clipboard.read'],
      createPluginPermissionCatalog(true),
    );
    expect(diff.retained).toEqual([]);
    expect(diff.added[0]).toMatchObject({
      permission_id: 'clipboard.write',
      grant_available: true,
      persisted_grant: false,
    });
    expect(diff.removed[0]).toMatchObject({ permission_id: 'clipboard.read', persisted_grant: true });
  });
});
