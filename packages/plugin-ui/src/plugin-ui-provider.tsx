import { LocaleProvider } from '@douyinfe/semi-ui';
import type { PluginRuntimeContext } from '@lensx/plugin-sdk';
import { type ReactNode, useEffect, useRef } from 'react';

import { PluginUiMessagesProvider, semiLocales } from './locale.js';

export interface PluginUiProviderProps {
  readonly children: ReactNode;
  readonly context: Readonly<PluginRuntimeContext>;
}

export const PluginUiProvider = ({ children, context }: PluginUiProviderProps) => {
  const initialDocumentLanguage = useRef(document.documentElement.lang);
  const initialColorScheme = useRef(document.documentElement.style.colorScheme);
  const initialBodyTheme = useRef(document.body.getAttribute('theme-mode'));

  useEffect(() => {
    document.documentElement.lang = context.locale;
    document.documentElement.style.colorScheme = context.theme;

    if (context.theme === 'dark') {
      document.body.setAttribute('theme-mode', 'dark');
    } else {
      document.body.removeAttribute('theme-mode');
    }
  }, [context.locale, context.theme]);

  useEffect(
    () => () => {
      document.documentElement.lang = initialDocumentLanguage.current;
      document.documentElement.style.colorScheme = initialColorScheme.current;

      const previousBodyTheme = initialBodyTheme.current;
      if (previousBodyTheme === null) {
        document.body.removeAttribute('theme-mode');
      } else {
        document.body.setAttribute('theme-mode', previousBodyTheme);
      }
    },
    [],
  );

  return (
    <LocaleProvider locale={semiLocales[context.locale]}>
      <PluginUiMessagesProvider locale={context.locale}>{children}</PluginUiMessagesProvider>
    </LocaleProvider>
  );
};
