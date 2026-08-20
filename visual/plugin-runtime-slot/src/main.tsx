import '@douyinfe/semi-ui/dist/css/semi.min.css';
import '../../../src/styles/global.less';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '../../../src/app/AppProviders';
import type { ActivePage, PageResolution } from '../../../src/app/navigation';
import {
  createPluginRuntimeLifecycleService,
  type PluginChildWebviewPresentationController,
  type PluginPageRuntimeDescriptor,
  PluginRuntimeSlot,
} from '../../../src/app/plugins/runtime';
import './visual.less';

const params = new URLSearchParams(window.location.search);
const locale = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const state = params.get('state') === 'failure' ? 'failure' : 'loading';
const activePage: ActivePage = {
  owner_id: 'com.acme.workspace',
  page_id: 'home',
  opened_by_action_id: 'com.acme.workspace.open',
};
const pageResolution: PageResolution = {
  provider: { kind: 'plugin', owner_id: activePage.owner_id, display_name: { 'en-US': 'Workspace Tools' } },
  page: {
    owner_id: activePage.owner_id,
    page_id: activePage.page_id,
    available: true,
    route: '/home',
    title: { 'en-US': 'Workspace Home', 'zh-CN': '工作区主页' },
  },
};
const descriptor: PluginPageRuntimeDescriptor = {
  runtime_key: 'visual-runtime',
  entry_url:
    'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html',
  host_fragment: '/home',
  iframe_src:
    'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html#/home',
  entry_id: 'entry_0123456789abcdef',
  plugin_id: activePage.owner_id,
  version: '1.2.3',
  page_id: activePage.page_id,
  expected_origin: 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'visual-attempt',
  registration_revision: '7',
};
const pendingReadiness = new Promise<never>(() => undefined);
const presentationController: PluginChildWebviewPresentationController = {
  create: async () => ({ attemptId: 'attempt_0123456789abcdef' }),
  updateSlot: async () => undefined,
  readReadiness: async () =>
    state === 'failure' ? { status: 'failed', failureCode: 'runtime_handshake_timeout' } : { status: 'loading' },
  waitReadiness: async () =>
    state === 'failure' ? { status: 'failed', failureCode: 'runtime_handshake_timeout' } : pendingReadiness,
  setVisible: async () => undefined,
  destroy: async () => true,
};

const VisualFixture = () => {
  useEffect(() => {
    const timer = window.setInterval(() => {
      const settled =
        state === 'failure' ? document.querySelector('[role="alert"]') : document.querySelector('[role="status"]');
      if (!settled) return;
      document.body.dataset.visualCheck = 'passed';
      document.body.dataset.state = state;
      window.clearInterval(timer);
    }, 20);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <main className="plugin-runtime-visual-shell">
      <PluginRuntimeSlot
        activePage={activePage}
        lifecycleService={createPluginRuntimeLifecycleService()}
        pageResolution={pageResolution}
        pageTitle={locale === 'zh-CN' ? '工作区主页' : 'Workspace Home'}
        presentationController={presentationController}
        resolver={{ resolve: async () => descriptor }}
      />
    </main>
  );
};

const root = document.getElementById('root');
if (root === null) throw new Error('Missing Plugin Runtime visual root.');

createRoot(root).render(
  <AppProviders initialLocale={locale} initialThemeMode={theme}>
    <VisualFixture />
  </AppProviders>,
);
