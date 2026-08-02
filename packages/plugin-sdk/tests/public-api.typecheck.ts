import { createPluginSdk, type PluginSdkCancellationSignal, type PluginSdkTransport } from '../src/index.js';

declare const transport: PluginSdkTransport;
declare const nativeSignal: AbortSignal;

const structuralSignal: PluginSdkCancellationSignal = {
  aborted: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

const client = createPluginSdk({ transport });
void client.initialize({ signal: structuralSignal });
void client.initialize({ signal: nativeSignal });

// @ts-expect-error The public client intentionally has no arbitrary raw Host method API.
void client.request('private.method', {});
