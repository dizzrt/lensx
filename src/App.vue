<template>
  <div data-tauri-drag-region class="launcher-root wh-full">
    <div class="flex wh-full">
      <div data-tauri-drag-region class="launcher-drag-handle w-4"></div>
      <n-auto-complete
        v-model:value="value"
        class="flex-1"
        :options="options"
        :placeholder="t('launcher.input.placeholder')"
      />
    </div>
  </div>
</template>

<style scoped lang="less">
.launcher-root {
  background: var(--n-color);
}

.launcher-drag-handle {
  background: var(--n-primary-color);
}
</style>

<script setup lang="ts">
import { NAutoComplete } from 'naive-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const value = ref('');
const options = computed(() => [
  {
    label: t('launcher.option.example'),
    value: 'example',
  },
]);
</script>
