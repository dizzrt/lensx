<template>
  <section class="settings-panel flex flex-col gap-4" :style="panelStyle">
    <header class="settings-panel__header flex flex-col gap-1">
      <h2 class="m-0">{{ t('settingsPlugin.style.title') }}</h2>
    </header>

    <n-alert v-if="isPreferenceFileCorrupted" type="warning" :title="t('settingsPlugin.preferences.corruptedTitle')">
      {{ t('settingsPlugin.preferences.corruptedDescription') }}
      <span v-if="appPreferencesState.diagnostic"> {{ appPreferencesState.diagnostic }}</span>
    </n-alert>

    <n-alert v-if="appPreferencesLoadError" type="error" :title="t('settingsPlugin.preferences.loadErrorTitle')">
      {{ appPreferencesLoadError }}
    </n-alert>

    <n-card :bordered="true" size="small">
      <div class="settings-panel__field flex flex-col gap-3">
        <div class="settings-panel__field-copy flex flex-col gap-1">
          <strong>{{ t('settingsPlugin.style.themeLabel') }}</strong>
        </div>

        <n-radio-group :disabled="savingTheme" :value="currentThemeMode" @update:value="handleThemeChange">
          <n-radio-button value="light">{{ t('settingsPlugin.style.light') }}</n-radio-button>
          <n-radio-button value="dark">{{ t('settingsPlugin.style.dark') }}</n-radio-button>
        </n-radio-group>
      </div>
    </n-card>

    <n-alert v-if="saveError" type="error" :title="t('settingsPlugin.preferences.saveErrorTitle')">
      {{ saveError }}
    </n-alert>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NCard, NRadioButton, NRadioGroup, useThemeVars } from 'naive-ui';
import type { CSSProperties } from 'vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ThemeMode } from '@/app/preferences/api';
import { appPreferencesLoadError, appPreferencesState, updateAppPreferences } from '@/app/preferences/api';

const { t } = useI18n();
const themeVars = useThemeVars();
const savingTheme = ref(false);
const saveError = ref('');

const currentThemeMode = computed(() => appPreferencesState.value.preferences.theme_mode);
const isPreferenceFileCorrupted = computed(() => appPreferencesState.value.file_status === 'corrupted');

const panelStyle = computed<CSSProperties>(() => ({
  '--settings-text-color': themeVars.value.textColor1,
  '--settings-text-color-2': themeVars.value.textColor2,
  '--settings-text-color-3': themeVars.value.textColor3,
}));

const isThemeMode = (value: string | number | boolean): value is ThemeMode => value === 'light' || value === 'dark';

const handleThemeChange = async (value: string | number | boolean) => {
  if (!isThemeMode(value) || value === currentThemeMode.value) {
    return;
  }

  savingTheme.value = true;
  saveError.value = '';

  try {
    await updateAppPreferences({ theme_mode: value });
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingTheme.value = false;
  }
};
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

.settings-panel__field-copy {
  strong {
    color: var(--settings-text-color-2);
    font-size: 14px;
  }
}
</style>
