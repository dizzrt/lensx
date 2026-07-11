<template>
  <div ref="launcherRef" class="launcher-root flex flex-col" :style="launcherThemeStyle" @mousedown="startPanelDrag">
    <header class="launcher-search flex items-center px-4 pt-4" @mousedown.stop="startHeaderDrag">
      <n-input
        v-model:value="query"
        class="launcher-search-input launcher-no-drag"
        clearable
        size="large"
        :placeholder="t('launcher.input.placeholder')"
      />
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

      <template v-else>
        <section v-for="section in visibleSections" :key="section.id" class="launcher-section">
          <div class="launcher-section-heading flex items-center justify-between gap-3">
            <h2 class="m-0">{{ t(section.titleKey) }}</h2>
            <span>{{ section.hint }}</span>
          </div>

          <div class="launcher-grid grid grid-cols-2 gap-2">
            <button
              v-for="item in section.items"
              :key="item.id"
              class="launcher-item launcher-no-drag flex items-center gap-3"
              type="button"
            >
              <span class="launcher-item-icon shrink-0" aria-hidden="true">{{ item.icon }}</span>
              <span class="launcher-item-main min-w-0">
                <span class="launcher-item-title">{{ t(item.titleKey) }}</span>
                <span class="launcher-item-description">{{ t(item.descriptionKey) }}</span>
              </span>
              <span class="launcher-item-meta shrink-0">
                <span class="launcher-item-badge">{{ t(item.badgeKey) }}</span>
                <span class="launcher-item-action">{{ t(item.actionKey) }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="launcher-section">
          <div class="launcher-section-heading flex items-center justify-between gap-3">
            <h2 class="m-0">{{ t('pluginHost.section.title') }}</h2>
            <span>{{ pluginHostHint }}</span>
          </div>

          <n-alert v-if="pluginHostError" type="error" :title="t('pluginHost.registry.errorTitle')">
            {{ pluginHostError }}
          </n-alert>

          <div v-else-if="pluginActions.length > 0" class="launcher-grid grid grid-cols-2 gap-2">
            <button
              v-for="action in pluginActions"
              :key="action.id"
              class="launcher-item launcher-no-drag flex items-center gap-3"
              type="button"
              @click="openPluginAction(action.id)"
            >
              <span class="launcher-item-icon shrink-0" aria-hidden="true">P</span>
              <span class="launcher-item-main min-w-0">
                <span class="launcher-item-title">{{ action.title }}</span>
                <span class="launcher-item-description">{{ action.id }}</span>
              </span>
              <span class="launcher-item-meta shrink-0">
                <span class="launcher-item-badge">{{ t('pluginHost.action.badge') }}</span>
                <span class="launcher-item-action">{{ t('launcher.item.action.open') }}</span>
              </span>
            </button>
          </div>

          <n-empty v-else class="launcher-no-drag" :description="t('pluginHost.registry.empty')" />
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

.launcher-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: color-mix(in srgb, var(--launcher-item-color) 78%, transparent);
  color: var(--launcher-text-color);
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;

  &:hover {
    border-color: color-mix(in srgb, var(--launcher-primary-color) 42%, var(--launcher-border-color));
    background: color-mix(in srgb, var(--launcher-primary-color) 12%, var(--launcher-panel-color));
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--launcher-primary-color);
    outline-offset: 2px;
  }
}

.launcher-item-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  background: color-mix(in srgb, var(--launcher-primary-color) 16%, var(--launcher-panel-color));
  color: var(--launcher-primary-color);
  font-size: 17px;
  font-weight: 700;
}

.launcher-item-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.launcher-item-title,
.launcher-item-description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher-item-title {
  color: var(--launcher-text-color);
  font-size: 14px;
  font-weight: 650;
}

.launcher-item-description {
  color: var(--launcher-text-color-3);
  font-size: 12px;
}

.launcher-item-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: var(--launcher-text-color-3);
  font-size: 11px;
}

.launcher-item-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--launcher-primary-color) 14%, transparent);
  color: var(--launcher-primary-color);
  font-weight: 650;
}

.launcher-item-action {
  opacity: 0;
  transition: opacity 0.16s ease;
}

.launcher-item:hover .launcher-item-action,
.launcher-item:focus-visible .launcher-item-action {
  opacity: 1;
}
</style>

<script setup lang="ts">
import type { PluginRegistrySnapshot } from '@lensx/plugin-sdk';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { NAlert, NEmpty, NInput, useThemeVars } from 'naive-ui';
import type { CSSProperties } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { createPluginActionDispatcher, type PluginNavigationState } from '@/app/plugin-host/actions';
import PluginPageOutlet from '@/app/plugin-host/PluginPageOutlet.vue';
import { createPluginRegistryIndex, type PluginRegistryIndex } from '@/app/plugin-host/registry';
import { loadAppPreferences } from '@/app/preferences/api';

const { t } = useI18n();
const themeVars = useThemeVars();

const WINDOW_WIDTH = 650;
const MIN_WINDOW_HEIGHT = 180;
const MAX_WINDOW_HEIGHT = 800;
const RESIZE_THRESHOLD = 1;

type LauncherItem = {
  id: string;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  badgeKey: string;
  actionKey: string;
};

type LauncherSection = {
  id: string;
  titleKey: string;
  hint: string;
  items: LauncherItem[];
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

const recentItems: LauncherItem[] = [
  {
    id: 'calculator',
    icon: '=',
    titleKey: 'launcher.item.calculator.title',
    descriptionKey: 'launcher.item.calculator.description',
    badgeKey: 'launcher.item.badge.tool',
    actionKey: 'launcher.item.action.open',
  },
  {
    id: 'clipboard',
    icon: 'C',
    titleKey: 'launcher.item.clipboard.title',
    descriptionKey: 'launcher.item.clipboard.description',
    badgeKey: 'launcher.item.badge.command',
    actionKey: 'launcher.item.action.run',
  },
  {
    id: 'notes',
    icon: 'N',
    titleKey: 'launcher.item.notes.title',
    descriptionKey: 'launcher.item.notes.description',
    badgeKey: 'launcher.item.badge.app',
    actionKey: 'launcher.item.action.open',
  },
];

const pinnedItems: LauncherItem[] = [
  {
    id: 'terminal',
    icon: '>',
    titleKey: 'launcher.item.terminal.title',
    descriptionKey: 'launcher.item.terminal.description',
    badgeKey: 'launcher.item.badge.command',
    actionKey: 'launcher.item.action.run',
  },
  {
    id: 'files',
    icon: 'F',
    titleKey: 'launcher.item.files.title',
    descriptionKey: 'launcher.item.files.description',
    badgeKey: 'launcher.item.badge.file',
    actionKey: 'launcher.item.action.open',
  },
  {
    id: 'settings',
    icon: 'S',
    titleKey: 'launcher.item.settings.title',
    descriptionKey: 'launcher.item.settings.description',
    badgeKey: 'launcher.item.badge.app',
    actionKey: 'launcher.item.action.open',
  },
];

const matchItems: LauncherItem[] = [
  ...recentItems,
  ...pinnedItems,
  {
    id: 'calendar',
    icon: 'D',
    titleKey: 'launcher.item.calendar.title',
    descriptionKey: 'launcher.item.calendar.description',
    badgeKey: 'launcher.item.badge.app',
    actionKey: 'launcher.item.action.open',
  },
  {
    id: 'snippets',
    icon: 'T',
    titleKey: 'launcher.item.snippets.title',
    descriptionKey: 'launcher.item.snippets.description',
    badgeKey: 'launcher.item.badge.command',
    actionKey: 'launcher.item.action.run',
  },
  {
    id: 'preview',
    icon: 'P',
    titleKey: 'launcher.item.preview.title',
    descriptionKey: 'launcher.item.preview.description',
    badgeKey: 'launcher.item.badge.tool',
    actionKey: 'launcher.item.action.open',
  },
];

const normalizedQuery = computed(() => query.value.trim());
const hasQuery = computed(() => normalizedQuery.value.length > 0);
const hasActivePluginPage = computed(() => pluginNavigation.value.currentPageId !== null);
const pluginActions = computed(() => (pluginRegistry.value ? [...pluginRegistry.value.actionsById.values()] : []));
const pluginHostHint = computed(() =>
  pluginRegistry.value
    ? t('pluginHost.section.hint', { count: pluginRegistry.value.snapshot.plugins.length })
    : t('pluginHost.section.loading')
);

const visibleSections = computed<LauncherSection[]>(() => {
  if (hasQuery.value) {
    return [
      {
        id: 'matches',
        titleKey: 'launcher.section.matches.title',
        hint: t('launcher.section.matches.hint', { query: normalizedQuery.value }),
        items: matchItems,
      },
    ];
  }

  return [
    {
      id: 'recent',
      titleKey: 'launcher.section.recent.title',
      hint: t('launcher.section.recent.hint'),
      items: recentItems,
    },
    {
      id: 'pinned',
      titleKey: 'launcher.section.pinned.title',
      hint: t('launcher.section.pinned.hint'),
      items: pinnedItems,
    },
  ];
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

  void getCurrentWindow().startDragging();
};

const startPanelDrag = (event: MouseEvent) => {
  const target = event.target;
  if (
    !(target instanceof Element) ||
    target.closest('.launcher-no-drag, input, textarea, button, [role="button"], .n-input')
  ) {
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

const openPluginAction = (actionId: string) => {
  if (!pluginRegistry.value) {
    return;
  }

  try {
    const dispatch = createPluginActionDispatcher(pluginRegistry.value, pluginNavigation.value);
    dispatch(actionId);
  } catch (error) {
    pluginHostError.value = error instanceof Error ? error.message : String(error);
  }
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

watch(visibleSections, () => {
  void nextTick(scheduleWindowResize);
});

watch([visibleSections, pluginActions, () => pluginNavigation.value.currentPageId], () => {
  void nextTick(scheduleWindowResize);
});
</script>
