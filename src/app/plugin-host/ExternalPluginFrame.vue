<template>
  <n-card class="plugin-frame-card launcher-no-drag" size="small" :title="page.title">
    <template #header-extra>
      <n-tag size="small" type="info">{{ t('pluginHost.external.badge') }}</n-tag>
    </template>

    <div class="plugin-frame-card-content">
      <n-alert v-if="loadError" type="error" :title="t('pluginHost.external.errorTitle')">{{ loadError }}</n-alert>

      <iframe
        v-else-if="isActive"
        ref="frameRef"
        class="plugin-frame"
        :sandbox="sandbox"
        :src="entryUrl"
        :title="page.title"
        @error="handleLoadError"
        @load="handleLoaded"
      />

      <n-empty v-else :description="t('pluginHost.external.empty')" />
    </div>
  </n-card>
</template>

<script setup lang="ts">
import {
  HOST_API_METHODS,
  HOST_API_PERMISSIONS,
  type PluginManifest,
  type PluginPage,
  type PluginRuntimeContext,
} from '@lensx/plugin-sdk';
import { NAlert, NCard, NEmpty, NTag } from 'naive-ui';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { appLocale } from '@/app/i18n/state';
import { appThemeMode } from '@/app/theme/theme';
import { type HostApiRegistration, PluginBridge } from './rpc';

const props = defineProps<{
  plugin: PluginManifest;
  page: PluginPage;
  entryUrl: string;
  isActive: boolean;
}>();

const { t } = useI18n();
const frameRef = ref<HTMLIFrameElement | null>(null);
const loadError = ref('');
const bridge = ref<PluginBridge | null>(null);

const sandbox = computed(() => {
  const runtimeSandbox = props.plugin.runtime.ui === 'iframe' ? props.plugin.runtime.sandbox : undefined;
  return (runtimeSandbox ?? ['allow-scripts', 'allow-forms']).join(' ');
});

const declaredPermissions = computed(() => new Set(props.plugin.permissions.map((permission) => permission.id)));
const grantedPermissions = computed(() => new Set(props.plugin.permissions.map((permission) => permission.id)));

const runtimeContext = computed<PluginRuntimeContext>(() => ({
  plugin_id: props.plugin.id,
  host_version: '0.1.0',
  locale: appLocale.value,
  theme: appThemeMode.value,
  permissions: Object.fromEntries(props.plugin.permissions.map((permission) => [permission.id, true])),
}));

const methods = computed<HostApiRegistration[]>(() => [
  {
    method: HOST_API_METHODS.runtimeGetContext,
    handler: () => runtimeContext.value,
  },
  {
    method: HOST_API_METHODS.actionsOpen,
    handler: () => ({ ok: true }),
  },
  {
    method: HOST_API_METHODS.eventsEmit,
    handler: () => ({ ok: true }),
  },
  {
    method: HOST_API_METHODS.uiClose,
    handler: () => ({ ok: true }),
  },
  {
    method: HOST_API_METHODS.preferencesGet,
    permission: HOST_API_PERMISSIONS.preferencesRead,
    handler: () => null,
  },
]);

const handleLoaded = (): void => {
  loadError.value = '';
  resetBridge();
  bridge.value?.notify('runtime.context', runtimeContext.value);
};

const handleLoadError = (): void => {
  loadError.value = t('pluginHost.external.loadFailed');
  resetBridge();
};

const resetBridge = (): void => {
  bridge.value?.stop();
  bridge.value = null;

  if (!frameRef.value?.contentWindow) {
    return;
  }

  bridge.value = new PluginBridge({
    pluginId: props.plugin.id,
    source: frameRef.value.contentWindow,
    targetOrigin: '*',
    declaredPermissions: declaredPermissions.value,
    grantedPermissions: grantedPermissions.value,
    methods: methods.value,
  });
  bridge.value.start();
};

watch(appThemeMode, (theme) => {
  bridge.value?.notify('runtime.theme_changed', { theme });
});

watch(appLocale, (locale) => {
  bridge.value?.notify('runtime.locale_changed', { locale });
});

watch(
  () => props.isActive,
  (isActive) => {
    if (!isActive) {
      bridge.value?.stop();
      bridge.value = null;
    }
  }
);

onBeforeUnmount(() => {
  bridge.value?.stop();
});
</script>

<style scoped lang="less">
.plugin-frame-card {
  border-color: var(--launcher-border-color);
  background: color-mix(in srgb, var(--launcher-item-color) 76%, transparent);
}

.plugin-frame-card-content {
  min-height: 320px;
  overflow: hidden;
}

.plugin-frame {
  display: block;
  width: 100%;
  min-height: 320px;
  border: 0;
  background: var(--launcher-panel-color);
}
</style>
