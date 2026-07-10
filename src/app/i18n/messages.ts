import type { AppLocale } from './locales';

export const messages: Record<AppLocale, Record<string, string>> = {
  'zh-CN': {
    'launcher.input.placeholder': '输入关键词或命令',
    'launcher.option.example': '示例命令',
  },
  'en-US': {
    'launcher.input.placeholder': 'Type a keyword or command',
    'launcher.option.example': 'Example command',
  },
};
