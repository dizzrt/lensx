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

The production Host-private Dispatcher currently advertises and implements
`runtime.get_context`, `ui.close`, and `actions.open`. Storage and clipboard
methods are not advertised and remain unavailable until their dedicated Host
providers ship. This package still does not expose the Dispatcher, permission
decisions, Host services, plugin execution policy, or a public Testkit fake.
