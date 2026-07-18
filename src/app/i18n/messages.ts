import enUS from './en-US';
import type { AppLocale } from './locales';
import zhCN from './zh-CN';

export const messages: Record<AppLocale, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
