<template>
  <n-config-provider :date-locale="naiveDateLocale" :locale="naiveLocale" :theme="naiveTheme">
    <n-global-style />
    <n-message-provider>
      <div class="app-shell wh-full">
        <slot />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, NMessageProvider } from 'naive-ui';
import { computed, watchEffect } from 'vue';
import { getNaiveLocaleBundle } from '@/app/naive/locale';
import { useNaiveTheme } from '@/app/theme/theme';
import { i18n } from '../i18n';
import { normalizeAppLocale } from '../i18n/locales';
import { appLocale } from '../i18n/state';
import './app-shell.less';

const normalizedLocale = computed(() => normalizeAppLocale(appLocale.value));
const naiveLocaleBundle = computed(() => getNaiveLocaleBundle(normalizedLocale.value));
const naiveLocale = computed(() => naiveLocaleBundle.value.locale);
const naiveDateLocale = computed(() => naiveLocaleBundle.value.dateLocale);
const naiveTheme = useNaiveTheme();

watchEffect(() => {
  i18n.global.locale.value = normalizedLocale.value;
});
</script>
