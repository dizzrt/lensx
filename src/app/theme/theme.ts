import type { GlobalTheme } from 'naive-ui';
import { darkTheme } from 'naive-ui';
import { computed, ref } from 'vue';

export type AppThemeMode = 'light' | 'dark';

export const DEFAULT_THEME_MODE: AppThemeMode = 'light';

export const appThemeMode = ref<AppThemeMode>(DEFAULT_THEME_MODE);

export const useNaiveTheme = () =>
  computed<GlobalTheme | null>(() => (appThemeMode.value === 'dark' ? darkTheme : null));
