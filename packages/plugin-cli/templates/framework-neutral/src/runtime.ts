import type { PluginRuntimeContext, PluginSdkClient, PluginSdkTransport } from '@lensx/plugin-sdk';
import { createPluginSdk } from '@lensx/plugin-sdk';

export type FrameworkNeutralRuntimeState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly context: PluginRuntimeContext }
  | { readonly kind: 'error'; readonly context?: PluginRuntimeContext };

export interface FrameworkNeutralRuntimeController {
  readonly retry: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export interface FrameworkNeutralRuntimeOptions {
  readonly createTransport: () => PluginSdkTransport;
  readonly render: (state: FrameworkNeutralRuntimeState) => void;
}

export const createFrameworkNeutralRuntime = ({
  createTransport,
  render,
}: FrameworkNeutralRuntimeOptions): FrameworkNeutralRuntimeController => {
  let attempt = 0;
  let client: PluginSdkClient | undefined;
  let unsubscribeContext: (() => void) | undefined;
  let unsubscribeState: (() => void) | undefined;
  let disposed = false;
  let lastContext: PluginRuntimeContext | undefined;

  const releaseCurrent = async (): Promise<void> => {
    unsubscribeContext?.();
    unsubscribeContext = undefined;
    unsubscribeState?.();
    unsubscribeState = undefined;
    const currentClient = client;
    client = undefined;
    await currentClient?.dispose().catch(() => undefined);
  };

  const start = async (): Promise<void> => {
    if (disposed) return;
    const currentAttempt = ++attempt;
    await releaseCurrent();
    if (disposed || currentAttempt !== attempt) return;

    render({ kind: 'loading' });
    const currentClient = createPluginSdk({ transport: createTransport() });
    client = currentClient;
    unsubscribeState = currentClient.subscribeState((state) => {
      if (state === 'disconnected' && !disposed && currentAttempt === attempt) {
        render({ kind: 'error', context: lastContext });
      }
    });

    try {
      const context = await currentClient.initialize();
      if (disposed || currentAttempt !== attempt || client !== currentClient) return;
      render({ kind: 'ready', context });
      lastContext = context;
      unsubscribeContext = currentClient.subscribe('runtime.context_changed', ({ payload }) => {
        if (!disposed && currentAttempt === attempt && client === currentClient) {
          lastContext = payload;
          render({ kind: 'ready', context: payload });
        }
      });
    } catch {
      if (!disposed && currentAttempt === attempt && client === currentClient) {
        render({ kind: 'error', context: lastContext });
      }
    }
  };

  void start();

  return Object.freeze({
    retry: start,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      attempt += 1;
      await releaseCurrent();
    },
  });
};
