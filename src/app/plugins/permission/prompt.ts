import type { HostApiPermission, NormalizedPluginManifest } from '@lensx/plugin-contract';
import type { LocalPluginInstallationCandidate, LocalPluginInstallationPermissionRequest } from '../installation';
import type { EffectivePluginPermission, PluginPermissionCatalogEntry, PluginPermissionRisk } from './types';

export type PluginPermissionPromptRisk = PluginPermissionRisk | 'unknown';
type NormalizedLocalizedText = NormalizedPluginManifest['display']['name'];

export interface PluginPermissionPromptItem {
  readonly permission_id: string;
  readonly host_name: NormalizedLocalizedText;
  readonly host_risk_description: NormalizedLocalizedText;
  readonly risk: PluginPermissionPromptRisk;
  readonly supported: boolean;
  readonly requested: boolean;
  readonly persisted_grant: boolean;
  readonly effective: EffectivePluginPermission['state'];
  readonly author_reason?: NormalizedLocalizedText;
  readonly publisher_unverified: true;
  readonly grant_available: boolean;
  readonly revoke_available: boolean;
}

export interface PluginPermissionPromptCandidate {
  readonly plugin_id: string;
  readonly version: string;
  readonly display_name: NormalizedLocalizedText;
  readonly publisher: LocalPluginInstallationCandidate['publisher'];
  readonly publisher_unverified: true;
  readonly permissions: readonly PluginPermissionPromptItem[];
}

const HOST_COPY: Readonly<
  Record<HostApiPermission, { readonly name: NormalizedLocalizedText; readonly risk: NormalizedLocalizedText }>
> = Object.freeze({
  'clipboard.read': Object.freeze({
    name: Object.freeze({ 'en-US': 'Read clipboard text', 'zh-CN': '读取剪贴板文本' }),
    risk: Object.freeze({
      'en-US': 'Can read text currently stored in your clipboard.',
      'zh-CN': '可以读取当前存储在剪贴板中的文本。',
    }),
  }),
  'clipboard.write': Object.freeze({
    name: Object.freeze({ 'en-US': 'Write clipboard text', 'zh-CN': '写入剪贴板文本' }),
    risk: Object.freeze({
      'en-US': 'Can replace text currently stored in your clipboard.',
      'zh-CN': '可以替换当前存储在剪贴板中的文本。',
    }),
  }),
});
const UNKNOWN_COPY = Object.freeze({
  name: Object.freeze({ 'en-US': 'Unsupported permission', 'zh-CN': '不支持的权限' }),
  risk: Object.freeze({
    'en-US': 'This Host does not recognize or grant this permission.',
    'zh-CN': '当前 Host 无法识别或授予此权限。',
  }),
});

const compareCodePoints = (left: string, right: string) => {
  const leftPoints = Array.from(left, (point) => point.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (point) => point.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};
const freezeLocalized = (value: NormalizedLocalizedText): NormalizedLocalizedText =>
  Object.freeze({ 'en-US': value['en-US'], ...(value['zh-CN'] ? { 'zh-CN': value['zh-CN'] } : {}) });
const promptItem = (
  permissionId: string,
  request: Pick<LocalPluginInstallationPermissionRequest, 'reason'> | undefined,
  effective: EffectivePluginPermission['state'],
  persistedGrant: boolean,
  catalog: readonly PluginPermissionCatalogEntry[],
  requestedOverride?: boolean,
): PluginPermissionPromptItem => {
  const catalogEntry = catalog.find((entry) => entry.permission_id === permissionId);
  const copy = catalogEntry ? HOST_COPY[catalogEntry.permission_id] : UNKNOWN_COPY;
  const requested = requestedOverride ?? request !== undefined;
  const supported = catalogEntry?.supported ?? false;
  return Object.freeze({
    permission_id: permissionId,
    host_name: copy.name,
    host_risk_description: copy.risk,
    risk: catalogEntry?.risk ?? 'unknown',
    supported,
    requested,
    persisted_grant: persistedGrant,
    effective,
    ...(request ? { author_reason: freezeLocalized(request.reason) } : {}),
    publisher_unverified: true,
    grant_available: requested && supported && effective === 'not_granted',
    revoke_available: persistedGrant,
  });
};

export const deriveInstallationPermissionPrompt = (
  candidate: LocalPluginInstallationCandidate,
  catalog: readonly PluginPermissionCatalogEntry[],
): PluginPermissionPromptCandidate =>
  Object.freeze({
    plugin_id: candidate.plugin_id,
    version: candidate.version,
    display_name: freezeLocalized(candidate.display_name),
    publisher: Object.freeze({ ...candidate.publisher }),
    publisher_unverified: true,
    permissions: Object.freeze(
      candidate.requested_permissions.map((request) => {
        const entry = catalog.find((catalogEntry) => catalogEntry.permission_id === request.permission_id);
        return promptItem(
          request.permission_id,
          request,
          entry?.supported ? 'not_granted' : 'unsupported',
          false,
          catalog,
        );
      }),
    ),
  });

export const deriveCurrentPermissionPrompt = (
  permissions: readonly EffectivePluginPermission[],
  catalog: readonly PluginPermissionCatalogEntry[],
): readonly PluginPermissionPromptItem[] =>
  Object.freeze(
    permissions.map((permission) =>
      promptItem(
        permission.permission_id,
        permission.reason ? { reason: permission.reason } : undefined,
        permission.state,
        permission.state === 'granted',
        catalog,
      ),
    ),
  );

export const deriveReplacementPermissionPrompt = (
  current: readonly PluginPermissionPromptItem[],
  addedPermissionIds: readonly string[],
  removedPermissionIds: readonly string[],
  catalog: readonly PluginPermissionCatalogEntry[],
) => {
  const removedIds = new Set(removedPermissionIds);
  const byId = new Map(current.map((item) => [item.permission_id, item]));
  const retained = current.filter((item) => item.persisted_grant && !removedIds.has(item.permission_id));
  const added = [...addedPermissionIds].sort(compareCodePoints).map((permissionId) => {
    const entry = catalog.find((catalogEntry) => catalogEntry.permission_id === permissionId);
    return promptItem(permissionId, undefined, entry?.supported ? 'not_granted' : 'unsupported', false, catalog, true);
  });
  const removed = [...removedPermissionIds]
    .sort(compareCodePoints)
    .map(
      (permissionId) => byId.get(permissionId) ?? promptItem(permissionId, undefined, 'not_requested', false, catalog),
    );
  return Object.freeze({
    retained: Object.freeze(retained),
    added: Object.freeze(added),
    removed: Object.freeze(removed),
  });
};
