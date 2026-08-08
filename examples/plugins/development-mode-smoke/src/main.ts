import { createPluginSdk, type PluginRuntimeContext } from '@lensx/plugin-sdk';
import { createPluginIframeTransport } from '@lensx/plugin-sdk/iframe';

import './styles.css';

declare const __LENSX_PLUGIN_DEVELOPMENT_SMOKE_PHASE__: 'initial' | 'reload';

const phase = __LENSX_PLUGIN_DEVELOPMENT_SMOKE_PHASE__;
const root = document.getElementById('app');
if (root === null) throw new Error('Missing plugin application root.');

const copy = {
  'en-US': {
    capability: 'Current non-privileged Host API context',
    connecting: 'Connecting to lensX…',
    error: 'The public SDK session could not connect.',
    generation: 'Development snapshot generation',
    openWeb: 'Open Web abilities do not require lensX grants',
    retry: 'Try again',
    title: 'Development Mode Smoke',
  },
  'zh-CN': {
    capability: '当前非特权 Host API 上下文',
    connecting: '正在连接 lensX…',
    error: '公共 SDK session 无法连接。',
    generation: '开发快照代际',
    openWeb: '开放 Web 能力无需 lensX grant',
    retry: '重试',
    title: '开发模式 Smoke',
  },
} as const;

const renderLoading = (): void => {
  root.replaceChildren();
  const status = document.createElement('p');
  status.setAttribute('aria-busy', 'true');
  status.setAttribute('role', 'status');
  status.textContent = copy['en-US'].connecting;
  root.append(status);
};

const renderReady = (context: PluginRuntimeContext): void => {
  const messages = copy[context.locale] ?? copy['en-US'];
  document.documentElement.lang = context.locale;
  document.documentElement.dataset.theme = context.theme;
  document.documentElement.style.colorScheme = context.theme;
  root.replaceChildren();

  const main = document.createElement('main');
  const heading = document.createElement('h1');
  heading.textContent = messages.title;
  const generation = document.createElement('p');
  generation.dataset.smokeGeneration = phase;
  generation.textContent = `${messages.generation}: ${phase === 'initial' ? 'A' : 'B'}`;
  const openWeb = document.createElement('p');
  openWeb.textContent = messages.openWeb;
  const capability = document.createElement('p');
  capability.dataset.smokeCapability = 'non-privileged-host-api';
  capability.textContent = `${messages.capability}: ${context.capabilities.join(', ')}`;
  const facts = document.createElement('code');
  facts.textContent = `${context.hostApiVersion} · ${context.locale} · ${context.theme}`;
  main.append(heading, generation, openWeb, capability, facts);
  root.append(main);
};

const client = createPluginSdk({ transport: createPluginIframeTransport() });
let unsubscribeContext: (() => void) | undefined;

const connect = async (): Promise<void> => {
  renderLoading();
  try {
    const context = await client.initialize();
    renderReady(context);
    unsubscribeContext?.();
    unsubscribeContext = client.subscribe('runtime.context_changed', ({ payload }) => renderReady(payload));
  } catch {
    root.replaceChildren();
    const alert = document.createElement('section');
    alert.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = copy['en-US'].error;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = copy['en-US'].retry;
    retry.addEventListener('click', () => void connect(), { once: true });
    alert.append(message, retry);
    root.append(alert);
    retry.focus();
  }
};

const dispose = (): void => {
  unsubscribeContext?.();
  unsubscribeContext = undefined;
  void client.dispose();
};

window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('unload', dispose, { once: true });
void connect();
