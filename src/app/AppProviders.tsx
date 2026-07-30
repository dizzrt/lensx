import { LocaleProvider } from '@douyinfe/semi-ui';
import type { ReactNode } from 'react';
import { AppErrorBoundary } from './AppErrorBoundary';
import { type AppLocale, AppLocaleProvider, DEFAULT_APP_LOCALE, getSemiLocale, useAppLocale } from './i18n';
import { AppThemeProvider, DEFAULT_THEME_MODE, type ThemeMode } from './theme';

interface ProviderCompositionProps {
  children: ReactNode;
  initialThemeMode: ThemeMode;
  onReload?: () => void;
}

const ProviderComposition = ({ children, initialThemeMode, onReload }: ProviderCompositionProps) => {
  const { locale } = useAppLocale();

  return (
    <AppThemeProvider initialThemeMode={initialThemeMode}>
      <LocaleProvider locale={getSemiLocale(locale)}>
        <AppErrorBoundary onReload={onReload}>{children}</AppErrorBoundary>
      </LocaleProvider>
    </AppThemeProvider>
  );
};

interface AppProvidersProps {
  children: ReactNode;
  initialLocale?: AppLocale;
  initialThemeMode?: ThemeMode;
  onReload?: () => void;
}

export const AppProviders = ({
  children,
  initialLocale = DEFAULT_APP_LOCALE,
  initialThemeMode = DEFAULT_THEME_MODE,
  onReload,
}: AppProvidersProps) => (
  <AppLocaleProvider initialLocale={initialLocale}>
    <ProviderComposition initialThemeMode={initialThemeMode} onReload={onReload}>
      {children}
    </ProviderComposition>
  </AppLocaleProvider>
);
