import type { PluginManifest } from '@lensx/plugin-sdk';

export const resolvePluginDisplayName = (plugin: PluginManifest, locale: string): string => {
  return plugin.display_names.locales?.[locale] || plugin.display_names.en;
};
