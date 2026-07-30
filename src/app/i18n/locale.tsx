import enUS from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { appI18n } from './i18n';
import { type AppLocale, DEFAULT_APP_LOCALE } from './types';

const semiLocales = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

export const getSemiLocale = (locale: AppLocale) => semiLocales[locale];

interface AppLocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

interface AppLocaleProviderProps {
  children: ReactNode;
  initialLocale?: AppLocale;
}

export const AppLocaleProvider = ({ children, initialLocale = DEFAULT_APP_LOCALE }: AppLocaleProviderProps) => {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const contextValue = useMemo(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  useEffect(() => {
    const previousLanguage = appI18n.resolvedLanguage ?? DEFAULT_APP_LOCALE;
    const previousDocumentLanguage = document.documentElement.lang;

    void appI18n.changeLanguage(locale);
    document.documentElement.lang = locale;

    return () => {
      void appI18n.changeLanguage(previousLanguage);
      document.documentElement.lang = previousDocumentLanguage;
    };
  }, [locale]);

  return (
    <I18nextProvider i18n={appI18n}>
      <AppLocaleContext.Provider value={contextValue}>{children}</AppLocaleContext.Provider>
    </I18nextProvider>
  );
};

export const useAppLocale = () => {
  const context = useContext(AppLocaleContext);

  if (!context) {
    throw new Error('useAppLocale must be used within AppLocaleProvider');
  }

  return context;
};
