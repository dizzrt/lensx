import '@lensx/plugin-ui/styles.css';
import { createRoot } from 'react-dom/client';

import { App, type ConfigLensInitialRuntime } from './App.js';
import './styles.less';

export interface MountConfigLensInput extends ConfigLensInitialRuntime {
  readonly onRetry: () => void;
  readonly root: HTMLElement;
}

export const mountConfigLens = ({ client, context, onRetry, root }: MountConfigLensInput): (() => void) => {
  const reactRoot = createRoot(root);
  reactRoot.render(<App initialRuntime={{ client, context }} onRetry={onRetry} />);
  return () => reactRoot.unmount();
};
