<template>
  <n-layout class="side-navigation-layout wh-full" :style="layoutStyle" has-sider>
    <n-layout-sider
      class="side-navigation-layout__sider"
      :bordered="true"
      :native-scrollbar="false"
      :width="siderWidth"
    >
      <div class="side-navigation-layout__header flex flex-col gap-1">
        <h1 class="m-0">{{ title }}</h1>
        <p v-if="description" class="m-0">{{ description }}</p>
      </div>

      <n-menu
        class="side-navigation-layout__menu"
        :options="menuOptions"
        :value="modelValue"
        @update:value="handleMenuUpdate"
      />
    </n-layout-sider>

    <n-layout-content class="side-navigation-layout__content" :native-scrollbar="false">
      <slot />
    </n-layout-content>
  </n-layout>
</template>

<script setup lang="ts">
import type { MenuOption } from 'naive-ui';
import { NLayout, NLayoutContent, NLayoutSider, NMenu, useThemeVars } from 'naive-ui';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    menuOptions: MenuOption[];
    modelValue: string;
    siderWidth?: number;
  }>(),
  {
    description: '',
    siderWidth: 196,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const themeVars = useThemeVars();

const layoutStyle = computed<CSSProperties>(() => ({
  '--side-nav-body-color': themeVars.value.bodyColor,
  '--side-nav-card-color': themeVars.value.cardColor,
  '--side-nav-border-color': themeVars.value.borderColor,
  '--side-nav-text-color': themeVars.value.textColor1,
  '--side-nav-text-color-2': themeVars.value.textColor2,
  '--side-nav-text-color-3': themeVars.value.textColor3,
}));

const handleMenuUpdate = (value: string) => {
  emit('update:modelValue', value);
};
</script>

<style scoped lang="less">
.side-navigation-layout {
  min-height: var(--launcher-plugin-body-min-height, auto);
  overflow: hidden;
  border: 1px solid var(--side-nav-border-color);
  border-radius: 16px;
  background: var(--side-nav-card-color);
  color: var(--side-nav-text-color);
}

:global(.side-navigation-layout > .n-layout-scroll-container) {
  display: flex;
  align-items: stretch;
  min-height: inherit;
}

.side-navigation-layout__sider {
  align-self: stretch;
  min-height: inherit;
  background: color-mix(in srgb, var(--side-nav-body-color) 76%, transparent);
}

:global(.side-navigation-layout__sider > .n-layout-sider-scroll-container) {
  min-height: inherit;
}

.side-navigation-layout__content {
  min-width: 0;
  background: var(--side-nav-card-color);
  color: var(--side-nav-text-color);
}

:global(.side-navigation-layout__content > .n-layout-scroll-container) {
  height: auto;
}

.side-navigation-layout__header {
  padding: 16px 14px 10px;

  h1 {
    color: var(--side-nav-text-color);
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
  }

  p {
    color: var(--side-nav-text-color-3);
    font-size: 12px;
    line-height: 1.45;
  }
}

.side-navigation-layout__menu {
  padding: 4px 8px 12px;
}
</style>
