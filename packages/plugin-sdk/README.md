# @lensx/plugin-sdk

Framework-neutral lifecycle, Runtime context, transport, version, cancellation,
timeout, and error foundations for lensX plugins.

Runtime Context shape and validation come from `@lensx/plugin-contract`; its
capabilities are sorted current Host API method IDs, not grants. Host API error
types remain distinct from SDK lifecycle errors.

Use the root entry for the client and semantic types. A plugin Child WebView
uses the official zero-configuration WebView entry:

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';

const sdk = createPluginSdk({ transport: createPluginWebviewTransport() });
const context = await sdk.initialize();

if (context.capabilities.includes('ui.close')) {
  const result = await sdk.request({ method: 'ui.close', params: {} });
  console.log(result.accepted);
}

sdk.subscribe('runtime.context_changed', ({ payload }) => {
  console.log(payload.locale, payload.theme);
});
```

The WebView entry discovers only the current document's Host-installed closed
bridge. It does not accept identity, origin, label, handle, bridge adapter,
wire codec, Tauri command, or Host executor configuration. The private request
IDs and frames are not public API or supported deep imports.

SDK `0.4.0` supports Host API `>=0.2.0 <0.4.0`. The current Host API is
`0.3.0`; older plugin bundles must update their SDK and Manifest compatibility
range and be rebuilt/repackaged before using that Host. No implicit protocol
negotiation or package rewriting is performed.

The current Host advertises base navigation/Context, scoped storage, and
controlled `http.request` only while each provider is available. HTTP uses
public HTTPS text requests through the same typed operation and cancellation
interface; signing and service logic remain plugin-owned. It provides no
arbitrary Tauri/native API or browser-fetch fallback. The generic SDK operation
timeout remains 10 seconds; explicitly choose a longer operation timeout when
using the native HTTP maximum of 15 seconds. Clipboard remains unavailable.
This package does not expose the Dispatcher, Host services, permission
decisions, plugin execution policy, or a public Testkit fake.
