import type { NDateLocale, NLocale } from 'naive-ui';
import { dateEnUS, dateZhCN, enUS, zhCN } from 'naive-ui';
import { type AppLocale, FALLBACK_APP_LOCALE } from '@/app/i18n/locales';

type NaiveLocaleBundle = {
  locale: NLocale;
  dateLocale: NDateLocale;
};

const naiveLocaleBundles: Record<AppLocale, NaiveLocaleBundle> = {
  'zh-CN': {
    locale: zhCN,
    dateLocale: dateZhCN,
  },
  'en-US': {
    locale: enUS,
    dateLocale: dateEnUS,
  },
};

export const getNaiveLocaleBundle = (appLocale: AppLocale): NaiveLocaleBundle =>
  naiveLocaleBundles[appLocale] ?? naiveLocaleBundles[FALLBACK_APP_LOCALE];
