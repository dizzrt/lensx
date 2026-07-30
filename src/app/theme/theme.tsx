import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export const DEFAULT_THEME_MODE: ThemeMode = 'light';

interface AppThemeContextValue {
  setThemeMode: (themeMode: ThemeMode) => void;
  themeMode: ThemeMode;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

interface AppThemeProviderProps {
  children: ReactNode;
  initialThemeMode?: ThemeMode;
}

export const AppThemeProvider = ({ children, initialThemeMode = DEFAULT_THEME_MODE }: AppThemeProviderProps) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(initialThemeMode);
  const initialBodyTheme = useRef(document.body.getAttribute('theme-mode'));
  const initialColorScheme = useRef(document.documentElement.style.colorScheme);

  const setThemeMode = useCallback((nextThemeMode: ThemeMode) => {
    setThemeModeState(nextThemeMode);
  }, []);

  const contextValue = useMemo(
    () => ({
      setThemeMode,
      themeMode,
    }),
    [setThemeMode, themeMode],
  );

  useEffect(() => {
    if (themeMode === 'dark') {
      document.body.setAttribute('theme-mode', 'dark');
    } else {
      document.body.removeAttribute('theme-mode');
    }

    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  useEffect(
    () => () => {
      const previousBodyTheme = initialBodyTheme.current;

      if (previousBodyTheme) {
        document.body.setAttribute('theme-mode', previousBodyTheme);
      } else {
        document.body.removeAttribute('theme-mode');
      }

      document.documentElement.style.colorScheme = initialColorScheme.current;
    },
    [],
  );

  return <AppThemeContext.Provider value={contextValue}>{children}</AppThemeContext.Provider>;
};

export const useAppTheme = () => {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }

  return context;
};
