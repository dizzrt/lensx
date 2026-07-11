import type { PluginManifest } from '@lensx/plugin-sdk';
import type { PluginAliasOverride } from '@/app/preferences/api';

export type AddPluginAliasResult =
  | {
      ok: true;
      override: PluginAliasOverride;
      aliases: string[];
      restoredDefaultAlias: boolean;
    }
  | {
      ok: false;
      reason: 'empty' | 'duplicate';
      override: PluginAliasOverride;
      aliases: string[];
    };

const emptyOverride = (): PluginAliasOverride => ({
  added_aliases: [],
  disabled_default_aliases: [],
});

export const normalizePluginAlias = (alias: string, locale?: string): string => {
  const trimmed = alias.trim();
  return locale ? trimmed.toLocaleLowerCase(locale) : trimmed.toLocaleLowerCase();
};

const trimAlias = (alias: string): string => alias.trim();

const pushUniqueAlias = (aliases: string[], alias: string, seen: Set<string>, locale?: string): void => {
  const trimmed = trimAlias(alias);
  const normalized = normalizePluginAlias(trimmed, locale);
  if (!normalized || seen.has(normalized)) {
    return;
  }

  aliases.push(trimmed);
  seen.add(normalized);
};

const uniqueAliases = (aliases: readonly string[], locale?: string): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const alias of aliases) {
    pushUniqueAlias(result, alias, seen, locale);
  }

  return result;
};

const getOverride = (override: PluginAliasOverride | undefined): PluginAliasOverride => override ?? emptyOverride();

export const resolvePluginAliases = (
  plugin: PluginManifest,
  override: PluginAliasOverride | undefined,
  locale?: string
): string[] => {
  const currentOverride = getOverride(override);
  const disabledDefaultAliases = new Set(
    currentOverride.disabled_default_aliases.map((alias) => normalizePluginAlias(alias, locale))
  );
  const aliases: string[] = [];
  const seen = new Set<string>();

  for (const alias of plugin.default_aliases) {
    const normalized = normalizePluginAlias(alias, locale);
    if (disabledDefaultAliases.has(normalized)) {
      continue;
    }

    pushUniqueAlias(aliases, alias, seen, locale);
  }

  for (const alias of currentOverride.added_aliases) {
    pushUniqueAlias(aliases, alias, seen, locale);
  }

  return aliases;
};

const findDefaultAlias = (plugin: PluginManifest, normalizedAlias: string, locale?: string): string | undefined => {
  return plugin.default_aliases.find((alias) => normalizePluginAlias(alias, locale) === normalizedAlias)?.trim();
};

const isAliasActive = (
  plugin: PluginManifest,
  override: PluginAliasOverride | undefined,
  normalizedAlias: string,
  locale?: string
): boolean => {
  return resolvePluginAliases(plugin, override, locale).some(
    (alias) => normalizePluginAlias(alias, locale) === normalizedAlias
  );
};

export const addPluginAliasOverride = (
  plugin: PluginManifest,
  override: PluginAliasOverride | undefined,
  alias: string,
  locale?: string
): AddPluginAliasResult => {
  const currentOverride = getOverride(override);
  const trimmedAlias = trimAlias(alias);
  const normalizedAlias = normalizePluginAlias(trimmedAlias, locale);

  if (!normalizedAlias) {
    return {
      ok: false,
      reason: 'empty',
      override: currentOverride,
      aliases: resolvePluginAliases(plugin, currentOverride, locale),
    };
  }

  if (isAliasActive(plugin, currentOverride, normalizedAlias, locale)) {
    return {
      ok: false,
      reason: 'duplicate',
      override: currentOverride,
      aliases: resolvePluginAliases(plugin, currentOverride, locale),
    };
  }

  const defaultAlias = findDefaultAlias(plugin, normalizedAlias, locale);
  if (defaultAlias) {
    const overrideAfterRestore = {
      added_aliases: uniqueAliases(
        currentOverride.added_aliases.filter(
          (addedAlias) => normalizePluginAlias(addedAlias, locale) !== normalizedAlias
        ),
        locale
      ),
      disabled_default_aliases: uniqueAliases(
        currentOverride.disabled_default_aliases.filter(
          (disabledAlias) => normalizePluginAlias(disabledAlias, locale) !== normalizedAlias
        ),
        locale
      ),
    };

    return {
      ok: true,
      override: overrideAfterRestore,
      aliases: resolvePluginAliases(plugin, overrideAfterRestore, locale),
      restoredDefaultAlias: true,
    };
  }

  const overrideAfterAdd = {
    added_aliases: uniqueAliases([...currentOverride.added_aliases, trimmedAlias], locale),
    disabled_default_aliases: uniqueAliases(currentOverride.disabled_default_aliases, locale),
  };

  return {
    ok: true,
    override: overrideAfterAdd,
    aliases: resolvePluginAliases(plugin, overrideAfterAdd, locale),
    restoredDefaultAlias: false,
  };
};

export const removePluginAliasOverride = (
  plugin: PluginManifest,
  override: PluginAliasOverride | undefined,
  alias: string,
  locale?: string
): PluginAliasOverride => {
  const currentOverride = getOverride(override);
  const normalizedAlias = normalizePluginAlias(alias, locale);
  const defaultAlias = findDefaultAlias(plugin, normalizedAlias, locale);

  if (defaultAlias) {
    return {
      added_aliases: uniqueAliases(
        currentOverride.added_aliases.filter(
          (addedAlias) => normalizePluginAlias(addedAlias, locale) !== normalizedAlias
        ),
        locale
      ),
      disabled_default_aliases: uniqueAliases([...currentOverride.disabled_default_aliases, defaultAlias], locale),
    };
  }

  return {
    added_aliases: uniqueAliases(
      currentOverride.added_aliases.filter(
        (addedAlias) => normalizePluginAlias(addedAlias, locale) !== normalizedAlias
      ),
      locale
    ),
    disabled_default_aliases: uniqueAliases(currentOverride.disabled_default_aliases, locale),
  };
};
