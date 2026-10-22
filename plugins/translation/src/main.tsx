import '@lensx/plugin-ui/styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.less';

const element = document.getElementById('root');
if (element === null) throw new Error('Missing Translation root.');
const root = createRoot(element);
root.render(<App />);
let disposed = false;
const dispose = () => {
  if (disposed) return;
  disposed = true;
  window.removeEventListener('pagehide', dispose);
  window.removeEventListener('unload', dispose);
  root.unmount();
};
window.addEventListener('pagehide', dispose);
window.addEventListener('unload', dispose);
