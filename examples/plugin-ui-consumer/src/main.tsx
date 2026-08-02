import type { PluginRuntimeContext } from '@lensx/plugin-sdk';
import { PluginFeedback, PluginPage, PluginUiProvider } from '@lensx/plugin-ui';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@lensx/plugin-ui/styles.css';

const context: PluginRuntimeContext = Object.freeze({
  capabilities: Object.freeze([]),
  hostApiVersion: '0.1.0',
  locale: 'en-US',
  theme: 'light',
});

const ConsumerSmoke = () => {
  useEffect(() => {
    document.body.dataset.smoke = 'ready';
  }, []);

  return (
    <PluginUiProvider context={context}>
      <PluginPage description="A browser bundle using only published package entries." title="Independent plugin">
        <PluginFeedback kind="loading" />
      </PluginPage>
    </PluginUiProvider>
  );
};

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing consumer root.');
}

createRoot(root).render(<ConsumerSmoke />);
