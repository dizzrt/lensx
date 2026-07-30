import '@douyinfe/semi-ui/dist/css/semi.min.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProviders } from './app/AppProviders';
import './styles/global.less';

const rootEl = document.getElementById('app');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </React.StrictMode>,
  );
}
