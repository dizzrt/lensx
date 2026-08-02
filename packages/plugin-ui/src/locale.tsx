import enUS from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN';
import type { PluginRuntimeLocale } from '@lensx/plugin-sdk';
import { createContext, type ReactNode, useContext } from 'react';

export interface PluginUiMessages {
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
  readonly pageActions: string;
}

export const semiLocales = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

export const pluginUiMessages: Readonly<Record<PluginRuntimeLocale, PluginUiMessages>> = {
  'en-US': {
    loadingTitle: 'Loading',
    loadingDescription: 'Please wait while the plugin content loads.',
    emptyTitle: 'Nothing here yet',
    emptyDescription: 'There is no content to display.',
    errorTitle: 'Something went wrong',
    errorDescription: 'The plugin could not load this content.',
    retry: 'Try again',
    pageActions: 'Page actions',
  },
  'zh-CN': {
    loadingTitle: '正在加载',
    loadingDescription: '请稍候，插件内容正在加载。',
    emptyTitle: '暂无内容',
    emptyDescription: '当前没有可显示的内容。',
    errorTitle: '出现错误',
    errorDescription: '插件无法加载此内容。',
    retry: '重试',
    pageActions: '页面操作',
  },
};

const PluginUiMessagesContext = createContext<PluginUiMessages>(pluginUiMessages['en-US']);

export interface PluginUiMessagesProviderProps {
  readonly children: ReactNode;
  readonly locale: PluginRuntimeLocale;
}

export const PluginUiMessagesProvider = ({ children, locale }: PluginUiMessagesProviderProps) => (
  <PluginUiMessagesContext.Provider value={pluginUiMessages[locale]}>{children}</PluginUiMessagesContext.Provider>
);

export const usePluginUiMessages = (): PluginUiMessages => useContext(PluginUiMessagesContext);
