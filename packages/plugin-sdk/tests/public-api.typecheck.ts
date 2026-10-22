import {
  createPluginSdk,
  type HostApiError,
  type PluginSdkCancellationSignal,
  type PluginSdkTransport,
} from '../src/index.js';
import { createPluginWebviewTransport } from '../src/webview.js';

declare const transport: PluginSdkTransport;
declare const nativeSignal: AbortSignal;

const structuralSignal: PluginSdkCancellationSignal = {
  aborted: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

const client = createPluginSdk({ transport });
const webviewTransport: PluginSdkTransport = createPluginWebviewTransport();
void webviewTransport;
// @ts-expect-error The zero-configuration production factory accepts no bridge or Host adapter.
createPluginWebviewTransport({ bridge: {} });
declare const hostError: HostApiError;
void hostError.code;
void client.initialize({ signal: structuralSignal });
void client.initialize({ signal: nativeSignal });
const closeResult = client.request({ method: 'ui.close', params: {} });
void closeResult.then((result) => result.accepted);
const httpResult = client.request(
  {
    method: 'http.request',
    params: {
      url: 'https://example.com/api',
      method: 'POST',
      body: 'exact UTF-8 text',
      headers: [{ name: 'Content-Type', value: 'text/plain' }],
      timeoutMs: 15000,
    },
  },
  { signal: structuralSignal, timeoutMs: 16000 },
);
void httpResult.then((result) => {
  const status: number = result.status;
  const body: string = result.body;
  const headerName: string | undefined = result.headers[0]?.name;
  return { status, body, headerName };
});
// @ts-expect-error HTTP methods are a closed union rather than arbitrary strings.
void client.request({ method: 'http.request', params: { url: 'https://example.com/', method: 'CONNECT' } });
// @ts-expect-error HTTP bodies must be text rather than native or arbitrary object values.
void client.request({
  method: 'http.request',
  params: { url: 'https://example.com/', method: 'POST', body: true },
});
// @ts-expect-error Native clipboard methods were removed from Host API 0.2.0.
void client.request({ method: 'clipboard.read', params: {} });
client.subscribe('runtime.context_changed', (event) => event.payload.theme);

// @ts-expect-error The public client intentionally has no arbitrary raw Host method API.
void client.request('private.method', {});
// @ts-expect-error Declared method and params must remain paired.
void client.request({ method: 'actions.open', params: { key: 'private' } });
