import type { HostApiPermission } from '@lensx/plugin-contract';
import type { RegisteredPluginRegistrationDetail } from '../registration';
import { deriveEffectivePluginPermissions, PLUGIN_PERMISSION_CATALOG } from './catalog';
import { toSetPluginPermissionGrantRequest } from './parse';
import type {
  EffectivePluginPermission,
  PluginPermissionCatalogEntry,
  PluginPermissionMutationAdapter,
  SetPluginPermissionGrantResult,
} from './types';

export interface PluginPermissionService {
  readonly catalog: readonly PluginPermissionCatalogEntry[];
  readonly view: (detail: RegisteredPluginRegistrationDetail) => readonly EffectivePluginPermission[];
  readonly setGrant: (input: {
    readonly entry_id: string;
    readonly expected_revision: string;
    readonly permission_id: HostApiPermission;
    readonly granted: boolean;
  }) => Promise<SetPluginPermissionGrantResult>;
}
export const createPluginPermissionService = (
  mutation: PluginPermissionMutationAdapter,
  catalog: readonly PluginPermissionCatalogEntry[] = PLUGIN_PERMISSION_CATALOG,
): PluginPermissionService =>
  Object.freeze({
    catalog,
    view: (detail: RegisteredPluginRegistrationDetail) =>
      deriveEffectivePluginPermissions(detail.manifest, detail.granted_permission_ids, catalog),
    setGrant: (input: Parameters<PluginPermissionService['setGrant']>[0]) =>
      mutation.setGrant(toSetPluginPermissionGrantRequest(input)),
  });
