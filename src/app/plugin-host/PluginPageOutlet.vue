<template>
  <section class="plugin-outlet flex flex-col gap-3">
    <n-alert v-if="errorMessage" type="error" :title="t('pluginHost.outlet.errorTitle')">{{ errorMessage }}</n-alert>

    <n-empty v-else-if="!page || !plugin" :description="t('pluginHost.outlet.empty')" />

    <component :is="builtinComponent" v-else-if="builtinComponent" />

    <external-plugin-frame
      v-else-if="plugin.runtime.ui === 'iframe'"
      :entry-url="resolveExternalEntry(plugin, page)"
      :is-active="true"
      :page="page"
      :plugin="plugin"
    />

    <n-alert v-else type="warning" :title="t('pluginHost.outlet.unavailableTitle')">
      {{ t('pluginHost.outlet.unavailable') }}
    </n-alert>
  </section>
</template>

<script setup lang="ts">
import { NAlert, NEmpty } from 'naive-ui';
import type { Component } from 'vue';
import { computed, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { loadBuiltinPluginPage } from '@/plugins/builtin';
import ExternalPluginFrame from './ExternalPluginFrame.vue';
import type { PluginRegistryIndex } from './registry';

const props = defineProps<{
  registry: PluginRegistryIndex;
  pageId: string | null;
}>();

const { t } = useI18n();
const builtinComponent = ref<Component | null>(null);
const errorMessage = ref('');

const page = computed(() => (props.pageId ? props.registry.pagesById.get(props.pageId) : undefined));
const plugin = computed(() => (page.value ? props.registry.pluginsById.get(page.value.plugin_id) : undefined));

const resolveExternalEntry = (
  currentPlugin: NonNullable<typeof plugin.value>,
  currentPage: NonNullable<typeof page.value>
) => {
  if (currentPlugin.runtime.ui !== 'iframe') {
    return currentPage.entry;
  }

  const baseEntry = currentPlugin.runtime.entry.replace(/\/+$/, '');
  const pageEntry = currentPage.entry.replace(/^\/+/, '');
  return `${baseEntry}/${pageEntry}`;
};

watchEffect(async () => {
  builtinComponent.value = null;
  errorMessage.value = '';

  if (!page.value || !plugin.value || plugin.value.runtime.ui !== 'vue_module') {
    return;
  }

  try {
    const component = await loadBuiltinPluginPage(page.value.id);
    if (!component) {
      errorMessage.value = t('pluginHost.outlet.builtinMissing', { id: page.value.id });
      return;
    }

    builtinComponent.value = component;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('pluginHost.outlet.loadFailed');
  }
});
</script>

<style scoped lang="less">
.plugin-outlet {
  color: var(--launcher-text-color);
}
</style>
