export const SUPPORTED_APP_LOCALES = ['zh-CN', 'en-US'] as const;

export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = 'zh-CN';
export const FALLBACK_APP_LOCALE: AppLocale = 'zh-CN';

export const isSupportedAppLocale = (locale: string): locale is AppLocale =>
  (SUPPORTED_APP_LOCALES as readonly string[]).includes(locale);

export const normalizeAppLocale = (locale: string): AppLocale =>
  isSupportedAppLocale(locale) ? locale : FALLBACK_APP_LOCALE;
