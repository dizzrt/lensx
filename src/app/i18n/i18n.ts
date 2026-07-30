import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUSMessages, zhCNMessages } from './messages';
import { DEFAULT_APP_LOCALE } from './types';

export const appI18n = createInstance();

void appI18n.use(initReactI18next).init({
  fallbackLng: DEFAULT_APP_LOCALE,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
  keySeparator: '.',
  lng: DEFAULT_APP_LOCALE,
  resources: {
    'en-US': {
      translation: enUSMessages,
    },
    'zh-CN': {
      translation: zhCNMessages,
    },
  },
  supportedLngs: ['en-US', 'zh-CN'],
});
