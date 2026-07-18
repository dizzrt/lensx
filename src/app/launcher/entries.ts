import type { PluginAction, PluginManifest } from '@lensx/plugin-sdk';
import { resolvePluginDisplayName } from '@/app/plugin-host/display';
import type { PluginRegistryIndex } from '@/app/plugin-host/registry';

export type LauncherActionEntry = {
  id: string;
  action_id: string;
  title: string;
  plugin_name: string;
  detail: string;
};

export const createLauncherActionEntry = (
  action: PluginAction,
  plugin: PluginManifest,
  locale: string
): LauncherActionEntry => {
  const pluginName = resolvePluginDisplayName(plugin, locale);

  return {
    id: action.id,
    action_id: action.id,
    title: pluginName,
    plugin_name: pluginName,
    detail: `${pluginName} - ${action.id}`,
  };
};

export const resolveLauncherActionEntries = (
  registry: PluginRegistryIndex,
  actionIds: readonly string[],
  locale: string
): LauncherActionEntry[] => {
  const entries: LauncherActionEntry[] = [];
  const seenActionIds = new Set<string>();

  for (const actionId of actionIds) {
    if (seenActionIds.has(actionId)) {
      continue;
    }

    const action = registry.actionsById.get(actionId);
    if (!action) {
      continue;
    }

    const plugin = registry.pluginsById.get(action.plugin_id);
    if (!plugin) {
      continue;
    }

    seenActionIds.add(actionId);
    entries.push(createLauncherActionEntry(action, plugin, locale));
  }

  return entries;
};
