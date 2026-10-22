import {
  createPluginSdk,
  type PluginRuntimeContext,
  type PluginSdkClient,
  type PluginSdkTransport,
} from '@lensx/plugin-sdk';

export type RuntimeState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      context: PluginRuntimeContext;
      initialContext: PluginRuntimeContext;
      client: PluginSdkClient;
      attempt: number;
    }
  | { kind: 'error'; context?: PluginRuntimeContext };

export const createTranslationRuntime = (
  createTransport: () => PluginSdkTransport,
  publish: (state: RuntimeState) => void,
) => {
  let attempt = 0;
  let disposed = false;
  let client: PluginSdkClient | undefined;
  let context: PluginRuntimeContext | undefined;
  const subscriptions: (() => void)[] = [];
  const release = async () => {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
    const previous = client;
    client = undefined;
    await previous?.dispose().catch(() => undefined);
  };
  const start = async () => {
    if (disposed) return;
    const currentAttempt = ++attempt;
    publish({ kind: 'loading' });
    await release();
    if (disposed || attempt !== currentAttempt) return;
    try {
      const currentClient = createPluginSdk({ transport: createTransport() });
      client = currentClient;
      const current = () => !disposed && currentAttempt === attempt && client === currentClient;
      subscriptions.push(
        currentClient.subscribeState((state) => {
          if (current() && (state === 'disconnected' || state === 'disposed')) {
            publish({ kind: 'error', context });
            void release();
          }
        }),
      );
      const initialContext = await currentClient.initialize();
      if (!current()) return;
      context = currentClient.context ?? initialContext;
      subscriptions.push(
        currentClient.subscribe('runtime.context_changed', ({ payload }) => {
          if (!current()) return;
          context = payload;
          publish({ kind: 'ready', context, initialContext, client: currentClient, attempt: currentAttempt });
        }),
      );
      publish({ kind: 'ready', context, initialContext, client: currentClient, attempt: currentAttempt });
    } catch {
      if (disposed || currentAttempt !== attempt) return;
      publish({ kind: 'error', context });
      await release();
    }
  };
  void start();
  return {
    retry: start,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      attempt += 1;
      await release();
    },
  };
};
