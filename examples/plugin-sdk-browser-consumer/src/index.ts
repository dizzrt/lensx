import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';

const transport = createPluginWebviewTransport();
const client = createPluginSdk({ transport });
const main = document.createElement('main');
main.dataset.smoke =
  typeof transport.connect === 'function' && typeof client.initialize === 'function' ? 'ready' : 'failed';
main.textContent = 'Plugin SDK WebView entry loaded.';
document.body.append(main);
void client.dispose();
