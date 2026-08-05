import {
  HOST_API_METHOD_CATALOG,
  HOST_API_PERMISSION_CATALOG,
  type HostApiMethod,
  type HostApiPermission,
  type NormalizedPluginManifest,
} from '@lensx/plugin-contract';
import type { EffectivePluginPermission, PluginPermissionCatalogEntry } from './types';

const compareCodePoints = (left: string, right: string) => {
  const leftPoints = Array.from(left, (point) => point.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (point) => point.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};
const methodsFor = (permission: HostApiPermission): readonly HostApiMethod[] =>
  Object.freeze(
    HOST_API_METHOD_CATALOG.filter((entry) => entry.permission === permission)
      .map(({ method }) => method)
      .sort(compareCodePoints),
  );
export const createPluginPermissionCatalog = (clipboardAvailable = true): readonly PluginPermissionCatalogEntry[] =>
  Object.freeze(
    HOST_API_PERMISSION_CATALOG.map(({ permission }) =>
      Object.freeze({
        permission_id: permission,
        risk: 'sensitive' as const,
        methods: methodsFor(permission),
        supported: clipboardAvailable,
      }),
    ).sort((left, right) => compareCodePoints(left.permission_id, right.permission_id)),
  );
export const PLUGIN_PERMISSION_CATALOG = createPluginPermissionCatalog();

export const deriveEffectivePluginPermissions = (
  manifest: Pick<NormalizedPluginManifest, 'requested_permissions'>,
  grantedPermissionIds: readonly string[],
  catalog: readonly PluginPermissionCatalogEntry[] = PLUGIN_PERMISSION_CATALOG,
): readonly EffectivePluginPermission[] => {
  const requests = new Map(manifest.requested_permissions.map((request) => [request.permission_id, request]));
  const grants = new Set(grantedPermissionIds);
  const catalogById = new Map(catalog.map((entry) => [entry.permission_id, entry]));
  const ids = [...new Set([...catalogById.keys(), ...requests.keys(), ...grants])].sort(compareCodePoints);
  return Object.freeze(
    ids.map((permissionId) => {
      const request = requests.get(permissionId);
      const entry = catalogById.get(permissionId as HostApiPermission);
      const state = !request
        ? 'not_requested'
        : !entry?.supported
          ? 'unsupported'
          : grants.has(permissionId)
            ? 'granted'
            : 'not_granted';
      return Object.freeze({
        permission_id: permissionId,
        ...(entry ? { risk: entry.risk } : {}),
        methods: entry?.methods ?? Object.freeze([]),
        supported: entry?.supported ?? false,
        state,
        ...(request ? { reason: request.reason } : {}),
      }) satisfies EffectivePluginPermission;
    }),
  );
};
