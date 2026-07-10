import { createI18n } from 'vue-i18n';
import { type AppLocale, DEFAULT_APP_LOCALE, FALLBACK_APP_LOCALE } from './locales';
import { messages } from './messages';

type MessageSchema = (typeof messages)[typeof DEFAULT_APP_LOCALE];

export const i18n = createI18n<[MessageSchema], AppLocale>({
  legacy: false,
  locale: DEFAULT_APP_LOCALE,
  fallbackLocale: FALLBACK_APP_LOCALE,
  messages,
});
