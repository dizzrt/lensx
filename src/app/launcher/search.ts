import type { PluginAction, PluginManifest } from '@lensx/plugin-sdk';
import type { PluginRegistryIndex } from '@/app/plugin-host/registry';

export type LauncherPluginActionSearchResult = {
  id: string;
  action_id: string;
  title: string;
  plugin_name: string;
  detail: string;
};

type MatchedPluginAction = {
  action: PluginAction;
  plugin: PluginManifest;
  index: number;
  score: number;
};

export const normalizeLauncherSearchQuery = (query: string): string => query.trim().toLocaleLowerCase();

const includesQuery = (value: string, query: string): boolean => value.toLocaleLowerCase().includes(query);

const getMatchScore = (plugin: PluginManifest, action: PluginAction, query: string): number | null => {
  if (includesQuery(action.title, query)) {
    return 0;
  }
  if (includesQuery(plugin.name, query)) {
    return 1;
  }
  if (includesQuery(action.id, query)) {
    return 2;
  }
  if (includesQuery(plugin.id, query)) {
    return 3;
  }

  return null;
};

export const searchPluginActions = (
  registry: PluginRegistryIndex,
  query: string
): LauncherPluginActionSearchResult[] => {
  const normalizedQuery = normalizeLauncherSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const matches: MatchedPluginAction[] = [];

  for (const plugin of registry.snapshot.plugins) {
    for (const action of plugin.actions) {
      const score = getMatchScore(plugin, action, normalizedQuery);
      if (score === null) {
        continue;
      }

      matches.push({
        action,
        plugin,
        index: matches.length,
        score,
      });
    }
  }

  return matches
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ action, plugin }) => ({
      id: action.id,
      action_id: action.id,
      title: action.title,
      plugin_name: plugin.name,
      detail: `${plugin.name} - ${action.id}`,
    }));
};
