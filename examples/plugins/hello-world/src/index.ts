import { createPluginClient } from '@lensx/plugin-sdk';

const client = createPluginClient();
const root = document.querySelector<HTMLDivElement>('#app');

const render = (message: string): void => {
  if (!root) {
    return;
  }

  root.textContent = '';

  const title = document.createElement('h1');
  title.textContent = 'Hello from lensX';

  const body = document.createElement('p');
  body.textContent = message;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Ask Host for runtime context';
  button.addEventListener('click', async () => {
    const context = await client.getRuntimeContext();
    render(`plugin_id=${context.plugin_id}, locale=${context.locale}, theme=${context.theme}`);
  });

  root.append(title, body, button);
};

client.on('runtime.context', (context) => {
  render(`plugin_id=${context.plugin_id}, locale=${context.locale}, theme=${context.theme}`);
});

client.on('runtime.theme_changed', ({ theme }) => {
  document.documentElement.dataset.theme = theme;
});

render('Waiting for runtime context...');
