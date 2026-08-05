# @lensx/plugin-sdk

Framework-neutral lifecycle, Runtime context, transport, version, cancellation,
timeout, and error foundations for lensX plugins.

Runtime Context shape and validation come from `@lensx/plugin-contract`; its
capabilities are sorted current Host API method IDs, not grants. Host API error
types remain distinct from SDK lifecycle errors.

Use the root entry for the client and semantic types. An isolated browser
plugin uses the official zero-configuration iframe entry:

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginIframeTransport } from '@lensx/plugin-sdk/iframe';

const sdk = createPluginSdk({ transport: createPluginIframeTransport() });
const context = await sdk.initialize();

if (context.capabilities.includes('ui.close')) {
  const result = await sdk.request({ method: 'ui.close', params: {} });
  console.log(result.accepted);
}

sdk.subscribe('runtime.context_changed', ({ payload }) => {
  console.log(payload.locale, payload.theme);
});
```

The iframe entry consumes the Host-authenticated dedicated Port. It does not
accept identity, origin, nonce, Port, wire codec, or Host executor
configuration. The private request IDs and frames are not public API or
supported deep imports.

The production Host currently returns the Contract-valid `unavailable` error
for every request. This package does not provide Host API dispatch, permission
decisions, real application side effects, plugin execution policy, or a public
Testkit fake.
