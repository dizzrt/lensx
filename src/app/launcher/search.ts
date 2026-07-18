import type { PluginAction, PluginManifest } from '@lensx/plugin-sdk';
import { resolvePluginAliases } from '@/app/plugin-host/aliases';
import { resolvePluginDisplayName } from '@/app/plugin-host/display';
import type { PluginRegistryIndex } from '@/app/plugin-host/registry';
import type { PluginAliasOverride } from '@/app/preferences/api';

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

const includesAnyQuery = (values: readonly string[], query: string): boolean =>
  values.some((value) => includesQuery(value, query));

const getMatchScore = (
  plugin: PluginManifest,
  action: PluginAction,
  query: string,
  locale: string,
  aliasOverride: PluginAliasOverride | undefined
): number | null => {
  if (includesQuery(action.title, query)) {
    return 0;
  }
  if (includesQuery(action.id, query)) {
    return 1;
  }
  if (includesQuery(plugin.id, query)) {
    return 2;
  }
  if (includesQuery(plugin.display_names.en, query)) {
    return 3;
  }
  if (includesQuery(resolvePluginDisplayName(plugin, locale), query)) {
    return 4;
  }
  if (includesAnyQuery(resolvePluginAliases(plugin, aliasOverride, locale), query)) {
    return 5;
  }

  return null;
};

export const searchPluginActions = (
  registry: PluginRegistryIndex,
  query: string,
  locale: string,
  aliasOverrides: Record<string, PluginAliasOverride>
): LauncherPluginActionSearchResult[] => {
  const normalizedQuery = normalizeLauncherSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const matches: MatchedPluginAction[] = [];

  for (const plugin of registry.snapshot.plugins) {
    const aliasOverride = aliasOverrides[plugin.id];
    for (const action of plugin.actions) {
      const score = getMatchScore(plugin, action, normalizedQuery, locale, aliasOverride);
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
    .map(({ action, plugin }) => {
      const pluginName = resolvePluginDisplayName(plugin, locale);
      return {
        id: action.id,
        action_id: action.id,
        title: pluginName,
        plugin_name: pluginName,
        detail: `${pluginName} - ${action.id}`,
      };
    });
};
