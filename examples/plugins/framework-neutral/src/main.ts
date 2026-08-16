import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';

import { createFrameworkNeutralRuntime } from './runtime.js';
import './styles.css';
import { renderFrameworkNeutralView } from './view.js';

const root = document.getElementById('app');
if (root === null) throw new Error('Missing plugin application root.');

let runtime: ReturnType<typeof createFrameworkNeutralRuntime>;
runtime = createFrameworkNeutralRuntime({
  createTransport: createPluginWebviewTransport,
  render: (state) => renderFrameworkNeutralView(root, state, () => void runtime.retry()),
});

const dispose = () => void runtime.dispose();
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('unload', dispose, { once: true });
