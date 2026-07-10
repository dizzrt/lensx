import { createApp, h } from 'vue';
import App from './App.vue';
import { i18n } from './app/i18n';
import AppProviders from './app/providers/AppProviders.vue';
import './index.css';

const app = createApp({
  render: () =>
    h(AppProviders, null, {
      default: () => h(App),
    }),
});
app.use(i18n);
app.mount('#app');
