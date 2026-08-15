import '@lensx/plugin-ui/styles.css';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.less';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing ConfigLens application root.');

const reactRoot = createRoot(root);
reactRoot.render(<App />);

const dispose = () => reactRoot.unmount();
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('unload', dispose, { once: true });
