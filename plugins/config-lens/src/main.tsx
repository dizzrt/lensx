import { createPluginSdk, type PluginSdkClient } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';

import { disposeMonacoWorkers, loadMonaco } from './editor/monaco.js';
import { recordConfigLensStage } from './startup-stages.js';
import './startup.css';

const root = document.getElementById('root');
const startup = document.getElementById('config-lens-startup');
const retry = document.getElementById('config-lens-startup-retry');
if (root === null || startup === null || !(retry instanceof HTMLButtonElement)) {
  throw new Error('Missing ConfigLens bootstrap surface.');
}

let generation = 0;
let client: PluginSdkClient | undefined;
let unmount: (() => void) | undefined;

const release = async () => {
  unmount?.();
  unmount = undefined;
  const currentClient = client;
  client = undefined;
  await currentClient?.dispose().catch(() => undefined);
  disposeMonacoWorkers();
};

const start = async () => {
  const currentGeneration = ++generation;
  await release();
  if (currentGeneration !== generation) return;
  startup.dataset.state = 'loading';
  startup.setAttribute('aria-busy', 'true');
  retry.hidden = true;
  root.hidden = true;
  const currentClient = createPluginSdk({ transport: createPluginWebviewTransport() });
  client = currentClient;
  try {
    const sdkStarted = performance.now();
    const context = await currentClient.initialize();
    recordConfigLensStage('sdk', performance.now() - sdkStarted);
    if (currentGeneration !== generation || client !== currentClient) return;
    const uiBundleStarted = performance.now();
    const [mountModule] = await Promise.all([import('./mount.js'), loadMonaco()]);
    recordConfigLensStage('ui_bundle', performance.now() - uiBundleStarted);
    if (currentGeneration !== generation || client !== currentClient) return;
    startup.hidden = true;
    root.hidden = false;
    unmount = mountModule.mountConfigLens({
      client: currentClient,
      context,
      onRetry: () => void start(),
      root,
    });
  } catch {
    if (currentGeneration !== generation || client !== currentClient) return;
    startup.dataset.state = 'error';
    startup.setAttribute('aria-busy', 'false');
    retry.hidden = false;
    retry.focus();
  }
};

retry.addEventListener('click', () => void start());
const dispose = () => {
  generation += 1;
  void release();
};
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('unload', dispose, { once: true });
void start();
