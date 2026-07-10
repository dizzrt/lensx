import type { Component } from 'vue';

export type BuiltinPluginModule = {
  default: Component;
};

const builtinPageModules = new Map<string, () => Promise<BuiltinPluginModule>>();

export const registerBuiltinPluginPage = (pageId: string, loader: () => Promise<BuiltinPluginModule>): void => {
  builtinPageModules.set(pageId, loader);
};

export const loadBuiltinPluginPage = async (pageId: string): Promise<Component | undefined> => {
  const loader = builtinPageModules.get(pageId);
  if (!loader) {
    return undefined;
  }

  const module = await loader();
  return module.default;
};

export const listBuiltinPluginPageIds = (): string[] => [...builtinPageModules.keys()];
