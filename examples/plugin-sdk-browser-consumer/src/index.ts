import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginIframeTransport } from '@lensx/plugin-sdk/iframe';

const transport = createPluginIframeTransport();
const client = createPluginSdk({ transport });
const main = document.createElement('main');
main.dataset.smoke =
  typeof transport.connect === 'function' && typeof client.initialize === 'function' ? 'ready' : 'failed';
main.textContent = 'Plugin SDK iframe entry loaded.';
document.body.append(main);
void client.dispose();
