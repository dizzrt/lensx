import type { PluginAction, PluginManifest, PluginPage, PluginPermission } from '@lensx/plugin-sdk';
import { validateLensxId } from './id';

export type PluginValidationResult = {
  ok: boolean;
  errors: string[];
};

const requiredString = (value: unknown, label: string): string[] =>
  typeof value === 'string' && value.trim().length > 0 ? [] : [`${label} is required`];

const validatePluginIdReference = (value: string, expected: string, label: string): string[] =>
  value === expected ? [] : [`${label} must reference plugin_id "${expected}", got "${value}"`];

const validatePermissionRefs = (
  ownerId: string,
  permissionIds: readonly string[] | undefined,
  declaredPermissionIds: ReadonlySet<string>
): string[] => {
  const errors: string[] = [];

  for (const permissionId of permissionIds ?? []) {
    errors.push(...validateLensxId(permissionId, `${ownerId}.required_permissions`));
    if (!declaredPermissionIds.has(permissionId)) {
      errors.push(`${ownerId} references undeclared permission "${permissionId}"`);
    }
  }

  return errors;
};

const validatePageCycles = (pages: readonly PluginPage[]): string[] => {
  const parentByPage = new Map<string, string>();
  const pageIds = new Set(pages.map((page) => page.id));
  const errors: string[] = [];

  for (const page of pages) {
    if (!page.parent_page_id) {
      continue;
    }

    if (!pageIds.has(page.parent_page_id)) {
      errors.push(`page "${page.id}" references missing parent_page_id "${page.parent_page_id}"`);
      continue;
    }

    parentByPage.set(page.id, page.parent_page_id);
  }

  for (const page of pages) {
    const seen = new Set<string>();
    let cursor: string | undefined = page.id;

    while (cursor) {
      if (seen.has(cursor)) {
        errors.push(`page "${page.id}" forms a parent_page_id cycle at "${cursor}"`);
        break;
      }

      seen.add(cursor);
      cursor = parentByPage.get(cursor);
    }
  }

  return errors;
};

export const validatePluginManifest = (manifest: PluginManifest): PluginValidationResult => {
  const errors: string[] = [];
  const ids = new Set<string>();
  const pageIds = new Set<string>();
  const permissionIds = new Set<string>();

  errors.push(...requiredString(manifest.name, 'name'));
  errors.push(...requiredString(manifest.version, 'version'));
  errors.push(...validateLensxId(manifest.id, 'plugin.id'));

  if (manifest.source !== 'builtin' && manifest.source !== 'external') {
    errors.push(`source must be "builtin" or "external"`);
  }

  if (typeof manifest.lifecycle?.disableable !== 'boolean' || typeof manifest.lifecycle?.uninstallable !== 'boolean') {
    errors.push('lifecycle.disableable and lifecycle.uninstallable must be boolean');
  }

  if (manifest.runtime?.ui !== 'vue_module' && manifest.runtime?.ui !== 'iframe') {
    errors.push('runtime.ui must be "vue_module" or "iframe"');
  }

  const collectId = (id: string, label: string): void => {
    errors.push(...validateLensxId(id, label));
    if (ids.has(id)) {
      errors.push(`duplicate ID "${id}"`);
      return;
    }

    ids.add(id);
  };

  collectId(manifest.id, 'plugin.id');

  for (const permission of manifest.permissions ?? []) {
    validatePermission(permission, manifest.id, errors);
    collectId(permission.id, `permission "${permission.id}"`);
    permissionIds.add(permission.id);
  }

  for (const page of manifest.pages ?? []) {
    validatePage(page, manifest.id, permissionIds, errors);
    collectId(page.id, `page "${page.id}"`);
    pageIds.add(page.id);
  }

  for (const action of manifest.actions ?? []) {
    validateAction(action, manifest.id, pageIds, permissionIds, errors);
    collectId(action.id, `action "${action.id}"`);
  }

  if (manifest.sidecar) {
    if (typeof manifest.sidecar.enabled !== 'boolean') {
      errors.push('sidecar.enabled must be boolean');
    }
    if (manifest.sidecar.enabled) {
      errors.push('sidecar is reserved and cannot be enabled in this phase');
    }
  }

  errors.push(...validatePageCycles(manifest.pages ?? []));

  return {
    ok: errors.length === 0,
    errors,
  };
};

export const validatePluginRegistry = (manifests: readonly PluginManifest[]): PluginValidationResult => {
  const errors: string[] = [];
  const globalIds = new Set<string>();

  for (const manifest of manifests) {
    const result = validatePluginManifest(manifest);
    errors.push(...result.errors);

    for (const item of [manifest, ...manifest.pages, ...manifest.actions, ...manifest.permissions]) {
      if (globalIds.has(item.id)) {
        errors.push(`global duplicate ID "${item.id}"`);
        continue;
      }

      globalIds.add(item.id);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

const validatePermission = (permission: PluginPermission, pluginId: string, errors: string[]): void => {
  errors.push(...requiredString(permission.title, `permission "${permission.id}".title`));
  errors.push(...validatePluginIdReference(permission.plugin_id, pluginId, `permission "${permission.id}".plugin_id`));
};

const validatePage = (
  page: PluginPage,
  pluginId: string,
  permissionIds: ReadonlySet<string>,
  errors: string[]
): void => {
  errors.push(...requiredString(page.title, `page "${page.id}".title`));
  errors.push(...requiredString(page.entry, `page "${page.id}".entry`));
  errors.push(...validatePluginIdReference(page.plugin_id, pluginId, `page "${page.id}".plugin_id`));
  errors.push(...validatePermissionRefs(page.id, page.required_permissions, permissionIds));
};

const validateAction = (
  action: PluginAction,
  pluginId: string,
  pageIds: ReadonlySet<string>,
  permissionIds: ReadonlySet<string>,
  errors: string[]
): void => {
  errors.push(...requiredString(action.title, `action "${action.id}".title`));
  errors.push(...validatePluginIdReference(action.plugin_id, pluginId, `action "${action.id}".plugin_id`));
  if (!pageIds.has(action.target_page_id)) {
    errors.push(`action "${action.id}" references missing target_page_id "${action.target_page_id}"`);
  }
  errors.push(...validatePermissionRefs(action.id, action.required_permissions, permissionIds));
};
