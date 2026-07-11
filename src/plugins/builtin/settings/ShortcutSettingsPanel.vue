<template>
  <section class="settings-panel flex flex-col gap-4" :style="panelStyle">
    <header class="settings-panel__header flex flex-col gap-1">
      <h2 class="m-0">{{ t('settingsPlugin.shortcuts.title') }}</h2>
    </header>

    <n-alert v-if="loadError" type="error" :title="t('settingsPlugin.shortcuts.loadErrorTitle')">
      {{ loadError }}
    </n-alert>

    <n-spin :show="loading">
      <div class="settings-shortcut-list flex flex-col gap-2">
        <n-card v-for="binding in bindings" :key="binding.id" :bordered="true" size="small">
          <div class="settings-shortcut flex items-center justify-between gap-4">
            <div class="settings-shortcut__copy flex flex-col gap-1">
              <strong>{{ t(`settingsPlugin.shortcuts.binding.${binding.id}.title`) }}</strong>
            </div>
            <n-tag :bordered="false" size="large" type="info">{{ binding.shortcut }}</n-tag>
          </div>
        </n-card>
      </div>
    </n-spin>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NCard, NSpin, NTag, useThemeVars } from 'naive-ui';
import type { CSSProperties } from 'vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getDefaultShortcutBindings, type ShortcutBindingView } from '@/app/shortcuts/api';

const { t } = useI18n();
const themeVars = useThemeVars();
const bindings = ref<ShortcutBindingView[]>([]);
const loading = ref(true);
const loadError = ref('');

const panelStyle = computed<CSSProperties>(() => ({
  '--settings-text-color': themeVars.value.textColor1,
  '--settings-text-color-2': themeVars.value.textColor2,
  '--settings-text-color-3': themeVars.value.textColor3,
}));

onMounted(async () => {
  try {
    bindings.value = await getDefaultShortcutBindings();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="less">
.settings-panel {
  color: var(--settings-text-color);
}

.settings-panel__header {
  h2 {
    color: var(--settings-text-color);
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
  }
}

.settings-shortcut__copy {
  min-width: 0;

  strong {
    color: var(--settings-text-color-2);
    font-size: 14px;
  }
}
</style>
