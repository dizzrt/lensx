<template>
  <side-navigation-layout v-model="activeSection" :menu-options="menuOptions" :title="t('settingsPlugin.title')">
    <div class="settings-page flex flex-col">
      <style-settings-panel v-if="activeSection === 'style'" />
      <shortcut-settings-panel v-else />
    </div>
  </side-navigation-layout>
</template>

<script setup lang="ts">
import type { MenuOption } from 'naive-ui';
import { computed, h, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SideNavigationLayout } from '@/app/layouts';
import ShortcutSettingsPanel from './ShortcutSettingsPanel.vue';
import StyleSettingsPanel from './StyleSettingsPanel.vue';

type SettingsSection = 'style' | 'shortcuts';

const { t } = useI18n();
const activeSection = ref<SettingsSection>('style');

const menuOptions = computed<MenuOption[]>(() => [
  {
    key: 'style',
    label: () => h('span', t('settingsPlugin.menu.style')),
  },
  {
    key: 'shortcuts',
    label: () => h('span', t('settingsPlugin.menu.shortcuts')),
  },
]);
</script>

<style scoped lang="less">
.settings-page {
  padding: 18px;
  box-sizing: border-box;
}
</style>
