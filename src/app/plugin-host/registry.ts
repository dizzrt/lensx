import type {
  PluginAction,
  PluginManifest,
  PluginPage,
  PluginPermission,
  PluginRegistrySnapshot,
} from '@lensx/plugin-sdk';
import { validatePluginRegistry } from './validation';

export type PluginRegistryIndex = {
  pluginsById: ReadonlyMap<string, PluginManifest>;
  pagesById: ReadonlyMap<string, PluginPage>;
  actionsById: ReadonlyMap<string, PluginAction>;
  permissionsById: ReadonlyMap<string, PluginPermission>;
  snapshot: PluginRegistrySnapshot;
};

export const createPluginRegistryIndex = (plugins: readonly PluginManifest[]): PluginRegistryIndex => {
  const validation = validatePluginRegistry(plugins);
  if (!validation.ok) {
    throw new Error(`Invalid plugin registry:\n${validation.errors.join('\n')}`);
  }

  const pluginsById = new Map<string, PluginManifest>();
  const pagesById = new Map<string, PluginPage>();
  const actionsById = new Map<string, PluginAction>();
  const permissionsById = new Map<string, PluginPermission>();

  for (const plugin of plugins) {
    pluginsById.set(plugin.id, plugin);
    for (const page of plugin.pages) {
      pagesById.set(page.id, page);
    }
    for (const action of plugin.actions) {
      actionsById.set(action.id, action);
    }
    for (const permission of plugin.permissions) {
      permissionsById.set(permission.id, permission);
    }
  }

  return {
    pluginsById,
    pagesById,
    actionsById,
    permissionsById,
    snapshot: {
      plugins: [...plugins],
      pages: [...pagesById.values()],
      actions: [...actionsById.values()],
      permissions: [...permissionsById.values()],
    },
  };
};
