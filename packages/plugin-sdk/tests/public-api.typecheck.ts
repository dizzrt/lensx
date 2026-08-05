import {
  createPluginSdk,
  type HostApiError,
  type PluginSdkCancellationSignal,
  type PluginSdkTransport,
} from '../src/index.js';

declare const transport: PluginSdkTransport;
declare const nativeSignal: AbortSignal;

const structuralSignal: PluginSdkCancellationSignal = {
  aborted: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

const client = createPluginSdk({ transport });
declare const hostError: HostApiError;
void hostError.code;
void client.initialize({ signal: structuralSignal });
void client.initialize({ signal: nativeSignal });
const closeResult = client.request({ method: 'ui.close', params: {} });
void closeResult.then((result) => result.accepted);
client.subscribe('runtime.context_changed', (event) => event.payload.theme);

// @ts-expect-error The public client intentionally has no arbitrary raw Host method API.
void client.request('private.method', {});
// @ts-expect-error Declared method and params must remain paired.
void client.request({ method: 'actions.open', params: { key: 'private' } });
