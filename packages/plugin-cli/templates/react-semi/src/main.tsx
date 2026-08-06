import '@lensx/plugin-ui/styles.css';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.less';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing plugin application root.');

createRoot(root).render(<App />);
