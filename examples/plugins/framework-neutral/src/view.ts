import type { FrameworkNeutralRuntimeState } from './runtime.js';

const copy = {
  'en-US': {
    description: 'This page uses only the public lensX SDK and browser DOM.',
    ready: 'Plugin ready',
    error: 'The plugin could not connect to lensX. Try again.',
    errorTitle: 'Connection unavailable',
    retry: 'Try again',
  },
  'zh-CN': {
    description: '此页面仅使用公开 lensX SDK 与浏览器 DOM。',
    ready: '插件已就绪',
    error: '插件无法连接到 lensX，请重试。',
    errorTitle: '连接不可用',
    retry: '重试',
  },
} as const;

export const renderFrameworkNeutralView = (
  root: HTMLElement,
  state: FrameworkNeutralRuntimeState,
  onRetry: () => void,
): void => {
  root.replaceChildren();
  if (state.kind === 'loading') {
    const section = document.createElement('section');
    section.className = 'starter-feedback';
    section.setAttribute('aria-busy', 'true');
    section.setAttribute('aria-live', 'polite');
    section.setAttribute('role', 'status');
    section.textContent = 'Connecting to lensX…';
    root.append(section);
    return;
  }
  if (state.kind === 'error') {
    const messages = copy[state.context?.locale ?? 'en-US'] ?? copy['en-US'];
    if (state.context !== undefined) {
      document.documentElement.lang = state.context.locale;
      document.documentElement.dataset.theme = state.context.theme;
      document.documentElement.style.colorScheme = state.context.theme;
    }
    const section = document.createElement('section');
    section.className = 'starter-feedback';
    section.setAttribute('aria-live', 'assertive');
    section.setAttribute('role', 'alert');
    const heading = document.createElement('h1');
    heading.textContent = messages.errorTitle;
    const description = document.createElement('p');
    description.textContent = messages.error;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = messages.retry;
    retry.addEventListener('click', onRetry, { once: true });
    section.append(heading, description, retry);
    root.append(section);
    retry.focus();
    return;
  }

  const messages = copy[state.context.locale] ?? copy['en-US'];
  document.documentElement.lang = state.context.locale;
  document.documentElement.dataset.theme = state.context.theme;
  document.documentElement.style.colorScheme = state.context.theme;
  const main = document.createElement('main');
  main.className = 'starter-page';
  const heading = document.createElement('h1');
  heading.textContent = messages.ready;
  const description = document.createElement('p');
  description.textContent = messages.description;
  const context = document.createElement('p');
  context.textContent = `${state.context.locale} · ${state.context.theme}`;
  main.append(heading, description, context);
  root.append(main);
};
