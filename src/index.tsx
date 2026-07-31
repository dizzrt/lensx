import '@douyinfe/semi-ui/dist/css/semi.min.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppBootstrap } from './app/AppBootstrap';
import './styles/global.less';

const rootEl = document.getElementById('app');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <AppBootstrap />
    </React.StrictMode>,
  );
}
