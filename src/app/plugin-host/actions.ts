import type { PluginAction, PluginPage } from '@lensx/plugin-sdk';
import type { PluginRegistryIndex } from './registry';

export type PluginNavigationState = {
  currentPageId: string | null;
};

export const createPluginActionDispatcher = (
  registry: PluginRegistryIndex,
  navigation: PluginNavigationState
): ((action: PluginAction | string) => PluginPage) => {
  return (actionOrId) => {
    const action = typeof actionOrId === 'string' ? registry.actionsById.get(actionOrId) : actionOrId;
    if (!action) {
      throw new Error(`Plugin action not found: ${actionOrId}`);
    }

    const page = registry.pagesById.get(action.target_page_id);
    if (!page) {
      throw new Error(`Plugin action target page not found: ${action.target_page_id}`);
    }

    navigation.currentPageId = page.id;
    return page;
  };
};
