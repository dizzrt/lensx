<template>
  <section class="settings-panel flex flex-col gap-4" :style="panelStyle">
    <header class="settings-panel__header flex flex-col gap-1">
      <h2 class="m-0">{{ t('settingsPlugin.aliases.title') }}</h2>
    </header>

    <n-alert v-if="loadError" type="error" :title="t('settingsPlugin.aliases.loadErrorTitle')">{{ loadError }}</n-alert>

    <n-alert v-if="saveError" type="error" :title="t('settingsPlugin.preferences.saveErrorTitle')">
      {{ saveError }}
    </n-alert>

    <n-spin :show="loading">
      <div v-if="plugins.length > 0" class="settings-alias-list flex flex-col gap-3">
        <n-card v-for="plugin in plugins" :key="plugin.id" :bordered="true" size="small">
          <div class="settings-alias-plugin flex flex-col gap-3">
            <div class="settings-alias-plugin__heading flex items-center justify-between gap-3">
              <div class="settings-alias-plugin__copy min-w-0 flex flex-col gap-1">
                <strong>{{ resolvePluginDisplayName(plugin, appLocale) }}</strong>
                <span>{{ plugin.id }}</span>
              </div>
            </div>

            <div class="settings-alias-tags flex flex-wrap gap-2">
              <n-tag
                v-for="alias in aliasesByPlugin[plugin.id]"
                :key="alias"
                :closable="savingPluginId !== plugin.id"
                @close="removeAlias(plugin, alias)"
              >
                {{ alias }}
              </n-tag>
              <n-empty
                v-if="aliasesByPlugin[plugin.id]?.length === 0"
                class="settings-alias-empty"
                size="small"
                :description="t('settingsPlugin.aliases.emptyAliases')"
              />
            </div>

            <div class="settings-alias-form flex items-start gap-2">
              <n-input
                v-model:value="aliasDrafts[plugin.id]"
                class="flex-1"
                :disabled="savingPluginId === plugin.id"
                :placeholder="t('settingsPlugin.aliases.inputPlaceholder')"
                clearable
                @keyup.enter="addAlias(plugin)"
              />
              <n-button
                type="primary"
                :loading="savingPluginId === plugin.id"
                :disabled="savingPluginId === plugin.id"
                @click="addAlias(plugin)"
              >
                {{ t('settingsPlugin.aliases.add') }}
              </n-button>
            </div>

            <n-alert v-if="validationErrors[plugin.id]" type="warning">{{ validationErrors[plugin.id] }}</n-alert>
          </div>
        </n-card>
      </div>

      <n-empty v-else-if="!loadError" :description="t('settingsPlugin.aliases.emptyPlugins')" />
    </n-spin>
  </section>
</template>

<script setup lang="ts">
import type { PluginManifest, PluginRegistrySnapshot } from '@lensx/plugin-sdk';
import { invoke } from '@tauri-apps/api/core';
import { NAlert, NButton, NCard, NEmpty, NInput, NSpin, NTag, useThemeVars } from 'naive-ui';
import type { CSSProperties } from 'vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { appLocale } from '@/app/i18n/state';
import { addPluginAliasOverride, removePluginAliasOverride, resolvePluginAliases } from '@/app/plugin-host/aliases';
import { resolvePluginDisplayName } from '@/app/plugin-host/display';
import { createPluginRegistryIndex } from '@/app/plugin-host/registry';
import { appPreferencesState, type PluginAliasOverride, updateAppPreferences } from '@/app/preferences/api';

const { t } = useI18n();
const themeVars = useThemeVars();
const plugins = ref<PluginManifest[]>([]);
const loading = ref(true);
const loadError = ref('');
const saveError = ref('');
const savingPluginId = ref('');
const aliasDrafts = ref<Record<string, string>>({});
const validationErrors = ref<Record<string, string>>({});

const panelStyle = computed<CSSProperties>(() => ({
  '--settings-text-color': themeVars.value.textColor1,
  '--settings-text-color-2': themeVars.value.textColor2,
  '--settings-text-color-3': themeVars.value.textColor3,
}));

const aliasesByPlugin = computed<Record<string, string[]>>(() => {
  return Object.fromEntries(
    plugins.value.map((plugin) => [
      plugin.id,
      resolvePluginAliases(
        plugin,
        appPreferencesState.value.preferences.plugin_alias_overrides[plugin.id],
        appLocale.value
      ),
    ])
  );
});

const persistPluginOverride = async (pluginId: string, override: PluginAliasOverride) => {
  const nextOverrides = {
    ...appPreferencesState.value.preferences.plugin_alias_overrides,
    [pluginId]: override,
  };

  await updateAppPreferences({ plugin_alias_overrides: nextOverrides });
};

const addAlias = async (plugin: PluginManifest) => {
  const result = addPluginAliasOverride(
    plugin,
    appPreferencesState.value.preferences.plugin_alias_overrides[plugin.id],
    aliasDrafts.value[plugin.id] ?? '',
    appLocale.value
  );

  if (!result.ok) {
    validationErrors.value = {
      ...validationErrors.value,
      [plugin.id]:
        result.reason === 'empty' ? t('settingsPlugin.aliases.errorEmpty') : t('settingsPlugin.aliases.errorDuplicate'),
    };
    return;
  }

  savingPluginId.value = plugin.id;
  saveError.value = '';
  validationErrors.value = { ...validationErrors.value, [plugin.id]: '' };

  try {
    await persistPluginOverride(plugin.id, result.override);
    aliasDrafts.value = { ...aliasDrafts.value, [plugin.id]: '' };
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingPluginId.value = '';
  }
};

const removeAlias = async (plugin: PluginManifest, alias: string) => {
  const override = removePluginAliasOverride(
    plugin,
    appPreferencesState.value.preferences.plugin_alias_overrides[plugin.id],
    alias,
    appLocale.value
  );

  savingPluginId.value = plugin.id;
  saveError.value = '';
  validationErrors.value = { ...validationErrors.value, [plugin.id]: '' };

  try {
    await persistPluginOverride(plugin.id, override);
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingPluginId.value = '';
  }
};

onMounted(async () => {
  try {
    const snapshot = await invoke<PluginRegistrySnapshot>('get_plugin_registry');
    const registry = createPluginRegistryIndex(snapshot.plugins);
    plugins.value = registry.snapshot.plugins.sort((left, right) =>
      resolvePluginDisplayName(left, appLocale.value).localeCompare(resolvePluginDisplayName(right, appLocale.value))
    );
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

.settings-alias-plugin__copy {
  strong {
    color: var(--settings-text-color-2);
    font-size: 14px;
  }

  span {
    color: var(--settings-text-color-3);
    font-size: 12px;
  }
}

.settings-alias-empty {
  width: 100%;
  padding: 4px 0;
}
</style>
