<template>
  <div ref="launcherRef" class="launcher-root flex flex-col" :style="launcherThemeStyle" @mousedown="startPanelDrag">
    <header class="launcher-search flex items-center px-4 pt-4" @mousedown.stop="startHeaderDrag">
      <n-input
        v-if="!hasActivePluginPage"
        v-model:value="query"
        class="launcher-search-input launcher-no-drag"
        clearable
        size="large"
        :placeholder="t('launcher.input.placeholder')"
      />

      <div v-else class="launcher-active-plugin flex min-w-0 items-center gap-2">
        <span class="launcher-active-plugin-name min-w-0">{{ currentPluginName }}</span>
        <n-button
          class="launcher-active-plugin-close launcher-no-drag shrink-0"
          quaternary
          circle
          size="small"
          :aria-label="t('launcher.activePlugin.close')"
          :title="t('launcher.activePlugin.close')"
          @click="closeActivePlugin"
          @mousedown.stop
        >
          ×
        </n-button>
      </div>
    </header>

    <main
      class="launcher-body flex flex-col px-4 pt-3 pb-4"
      :class="hasActivePluginPage ? 'launcher-body--plugin' : 'gap-4'"
    >
      <plugin-page-outlet
        v-if="hasActivePluginPage && pluginRegistry"
        class="launcher-plugin-page"
        :page-id="pluginNavigation.currentPageId"
        :registry="pluginRegistry"
      />

      <template v-else-if="hasQuery">
        <section class="launcher-section">
          <div class="launcher-section-heading flex items-center justify-between gap-3">
            <h2 class="m-0">{{ t('launcher.section.matches.title') }}</h2>
          </div>

          <n-alert v-if="pluginHostError" type="error" :title="t('launcher.search.registryErrorTitle')">
            {{ pluginHostError }}
          </n-alert>

          <div v-else-if="searchResults.length > 0" class="launcher-grid grid grid-cols-2 gap-2">
            <launcher-action-card
              v-for="result in searchResults"
              :key="result.id"
              :entry="result"
              :pinned="isLauncherActionPinned(result.action_id)"
              @open="openPluginAction(result.action_id)"
              @toggle-pin="toggleLauncherActionPin(result.action_id)"
            />
          </div>

          <n-empty v-else class="launcher-no-drag" :description="t('launcher.search.empty')" />
        </section>
      </template>

      <template v-else>
        <section v-for="section in visibleSections" :key="section.id" class="launcher-section">
          <div class="launcher-section-heading flex items-center justify-between gap-3">
            <h2 class="m-0">{{ t(section.titleKey) }}</h2>
          </div>

          <div v-if="section.items.length > 0" class="launcher-grid grid grid-cols-2 gap-2">
            <launcher-action-card
              v-for="item in section.items"
              :key="item.id"
              :entry="item"
              :pinned="isLauncherActionPinned(item.action_id)"
              @open="openPluginAction(item.action_id)"
              @toggle-pin="toggleLauncherActionPin(item.action_id)"
            />
          </div>

          <n-empty
            v-else
            class="launcher-section-empty launcher-no-drag"
            :description="t(section.emptyKey)"
            :show-icon="false"
            size="small"
          />
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped lang="less">
.launcher-root {
  width: 650px;
  min-height: 180px;
  max-height: 800px;
  box-sizing: border-box;
  overflow: hidden;
  background:
    radial-gradient(
      circle at top left,
      color-mix(in srgb, var(--launcher-primary-color) 14%, transparent),
      transparent 34%
    ),
    var(--launcher-panel-color);
  border: 1px solid var(--launcher-border-color);
  border-radius: 18px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 -18px 36px rgba(0, 0, 0, 0.04) inset;
  color: var(--launcher-text-color);
  user-select: none;
}

.launcher-search {
  box-sizing: border-box;
}

.launcher-search-input {
  border-radius: 14px;
}

.launcher-active-plugin {
  max-width: 100%;
  height: 40px;
}

.launcher-active-plugin-name {
  overflow: hidden;
  color: var(--launcher-text-color);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher-active-plugin-close {
  color: var(--launcher-text-color-2);

  &:hover,
  &:focus-visible {
    color: var(--launcher-primary-color);
  }
}

.launcher-body {
  max-height: 690px;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--launcher-border-color) transparent;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--launcher-border-color);
    border-radius: 999px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.launcher-body--plugin {
  --launcher-plugin-body-min-height: 600px;

  align-items: stretch;
  min-height: var(--launcher-plugin-body-min-height);
}

.launcher-plugin-page {
  flex: 1;
  min-height: var(--launcher-plugin-body-min-height);
}

.launcher-section-heading {
  margin-bottom: 8px;
  color: var(--launcher-text-color-3);

  h2 {
    color: var(--launcher-text-color-2);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.08em;
  }

  span {
    font-size: 12px;
  }
}
</style>

<script setup lang="ts">
import type { PluginManifest, PluginPage, PluginRegistrySnapshot } from '@lensx/plugin-sdk';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { NAlert, NButton, NEmpty, NInput, useMessage, useThemeVars } from 'naive-ui';
import type { CSSProperties } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { appLocale } from '@/app/i18n/state';
import { type LauncherActionEntry, resolveLauncherActionEntries } from '@/app/launcher/entries';
import LauncherActionCard from '@/app/launcher/LauncherActionCard.vue';
import { normalizeLauncherSearchQuery, searchPluginActions } from '@/app/launcher/search';
import { createPluginActionDispatcher, type PluginNavigationState } from '@/app/plugin-host/actions';
import { resolvePluginDisplayName } from '@/app/plugin-host/display';
import PluginPageOutlet from '@/app/plugin-host/PluginPageOutlet.vue';
import { createPluginRegistryIndex, type PluginRegistryIndex } from '@/app/plugin-host/registry';
import {
  appPreferencesState,
  loadAppPreferences,
  recordLauncherAction,
  setLauncherActionPinned,
} from '@/app/preferences/api';

const { t } = useI18n();
const message = useMessage();
const themeVars = useThemeVars();

const WINDOW_WIDTH = 650;
const MIN_WINDOW_HEIGHT = 180;
const MAX_WINDOW_HEIGHT = 800;
const RESIZE_THRESHOLD = 1;

type LauncherSection = {
  id: 'recent' | 'pinned';
  titleKey: 'launcher.section.recent.title' | 'launcher.section.pinned.title';
  emptyKey: 'launcher.section.recent.empty' | 'launcher.section.pinned.empty';
  items: LauncherActionEntry[];
};

const query = ref('');
const launcherRef = ref<HTMLElement | null>(null);
const lastAppliedHeight = ref(0);
const pluginRegistry = ref<PluginRegistryIndex | null>(null);
const pluginHostError = ref('');
const pluginNavigation = ref<PluginNavigationState>({ currentPageId: null });
let resizeObserver: ResizeObserver | undefined;
let resizeFrame = 0;

const launcherThemeStyle = computed<CSSProperties>(() => ({
  '--launcher-panel-color': themeVars.value.cardColor || themeVars.value.bodyColor,
  '--launcher-item-color': themeVars.value.bodyColor,
  '--launcher-border-color': themeVars.value.borderColor,
  '--launcher-primary-color': themeVars.value.primaryColor,
  '--launcher-text-color': themeVars.value.textColor1,
  '--launcher-text-color-2': themeVars.value.textColor2,
  '--launcher-text-color-3': themeVars.value.textColor3,
}));

const normalizedQuery = computed(() => normalizeLauncherSearchQuery(query.value));
const hasQuery = computed(() => normalizedQuery.value.length > 0);
const currentPluginPage = computed<PluginPage | undefined>(() => {
  const currentPageId = pluginNavigation.value.currentPageId;
  return currentPageId && pluginRegistry.value ? pluginRegistry.value.pagesById.get(currentPageId) : undefined;
});
const currentPlugin = computed<PluginManifest | undefined>(() =>
  currentPluginPage.value && pluginRegistry.value
    ? pluginRegistry.value.pluginsById.get(currentPluginPage.value.plugin_id)
    : undefined
);
const currentPluginName = computed(() =>
  currentPlugin.value ? resolvePluginDisplayName(currentPlugin.value, appLocale.value) : ''
);
const hasActivePluginPage = computed(() => Boolean(currentPluginPage.value && currentPlugin.value));
const searchResults = computed(() =>
  pluginRegistry.value
    ? searchPluginActions(
        pluginRegistry.value,
        normalizedQuery.value,
        appLocale.value,
        appPreferencesState.value.preferences.plugin_alias_overrides
      )
    : []
);

const recentItems = computed(() =>
  pluginRegistry.value
    ? resolveLauncherActionEntries(
        pluginRegistry.value,
        appPreferencesState.value.preferences.recent_action_ids,
        appLocale.value
      )
    : []
);
const pinnedItems = computed(() =>
  pluginRegistry.value
    ? resolveLauncherActionEntries(
        pluginRegistry.value,
        appPreferencesState.value.preferences.pinned_action_ids,
        appLocale.value
      )
    : []
);
const visibleSections = computed<LauncherSection[]>(() => {
  const sections: LauncherSection[] = [
    {
      id: 'recent',
      titleKey: 'launcher.section.recent.title',
      emptyKey: 'launcher.section.recent.empty',
      items: recentItems.value,
    },
    {
      id: 'pinned',
      titleKey: 'launcher.section.pinned.title',
      emptyKey: 'launcher.section.pinned.empty',
      items: pinnedItems.value,
    },
  ];

  return sections;
});

const clampWindowHeight = (height: number) =>
  Math.min(MAX_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, Math.ceil(height)));

const resizeWindowToPanel = async () => {
  const panel = launcherRef.value;
  if (!panel) {
    return;
  }

  const targetHeight = clampWindowHeight(panel.getBoundingClientRect().height);
  if (Math.abs(targetHeight - lastAppliedHeight.value) < RESIZE_THRESHOLD) {
    return;
  }

  lastAppliedHeight.value = targetHeight;
  try {
    await getCurrentWindow().setSize(new LogicalSize(WINDOW_WIDTH, targetHeight));
  } catch (error) {
    console.warn('Failed to resize launcher window', error);
  }
};

const scheduleWindowResize = () => {
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    void resizeWindowToPanel();
  });
};

const startHeaderDrag = (event: MouseEvent) => {
  if (event.button !== 0) {
    return;
  }

  if (isNonDragTarget(event.target)) {
    return;
  }

  void getCurrentWindow().startDragging();
};

const isNonDragTarget = (target: EventTarget | null) =>
  target instanceof Element && target.closest('.launcher-no-drag, input, textarea, button, [role="button"], .n-input');

const startPanelDrag = (event: MouseEvent) => {
  if (!(event.target instanceof Element) || isNonDragTarget(event.target)) {
    return;
  }

  void getCurrentWindow().startDragging();
};

const loadPluginRegistry = async () => {
  try {
    const snapshot = await invoke<PluginRegistrySnapshot>('get_plugin_registry');
    pluginRegistry.value = createPluginRegistryIndex(snapshot.plugins);
  } catch (error) {
    pluginHostError.value = error instanceof Error ? error.message : String(error);
  }
};

const isLauncherActionPinned = (actionId: string): boolean =>
  appPreferencesState.value.preferences.pinned_action_ids.includes(actionId);

const showLauncherPersistenceError = (error: unknown) => {
  const diagnostic = error instanceof Error ? error.message : String(error);
  message.error(`${t('launcher.history.persistenceError')}: ${diagnostic}`);
};

const toggleLauncherActionPin = async (actionId: string) => {
  try {
    await setLauncherActionPinned(actionId, !isLauncherActionPinned(actionId));
  } catch (error) {
    showLauncherPersistenceError(error);
  }
};

const openPluginAction = (actionId: string) => {
  if (!pluginRegistry.value) {
    return;
  }

  try {
    const dispatch = createPluginActionDispatcher(pluginRegistry.value, pluginNavigation.value);
    dispatch(actionId);
    void recordLauncherAction(actionId).catch(showLauncherPersistenceError);
  } catch (error) {
    pluginHostError.value = error instanceof Error ? error.message : String(error);
  }
};

const closeActivePlugin = () => {
  pluginNavigation.value.currentPageId = null;
  query.value = '';
};

onMounted(() => {
  resizeObserver = new ResizeObserver(scheduleWindowResize);
  if (launcherRef.value) {
    resizeObserver.observe(launcherRef.value);
  }
  void loadAppPreferences().catch((error) => {
    console.warn('Failed to load app preferences', error);
  });
  void loadPluginRegistry();
  void nextTick(scheduleWindowResize);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
  }
});

watch([visibleSections, searchResults, hasQuery, () => pluginNavigation.value.currentPageId], () => {
  void nextTick(scheduleWindowResize);
});
</script>
