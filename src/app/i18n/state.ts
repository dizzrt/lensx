import { ref } from 'vue';
import { type AppLocale, DEFAULT_APP_LOCALE } from './locales';

export const appLocale = ref<AppLocale>(DEFAULT_APP_LOCALE);
