# Plugin Development

External plugins are web applications packaged as `.lxplugin` archives. The
recommended stack is Vue 3 and TypeScript, but the host boundary is plain HTML,
JavaScript, manifest JSON, and `@lensx/plugin-sdk`.

## Package Shape

A package must contain at least:

```text
manifest.json
dist/index.html
assets/*
```

The host validates `manifest.json`, registers metadata, and loads `dist/index.html`
only when the page is opened.

## Manifest

Use strict three-part IDs and explicit references:

```json
{
  "id": "lensx.example.hello_world",
  "source": "external",
  "lifecycle": {
    "uninstallable": true,
    "disableable": true
  },
  "runtime": {
    "ui": "iframe",
    "entry": "dist"
  }
}
```

Declare pages, actions, and permissions in the same manifest. Actions open pages
through `target_page_id`; page hierarchy uses `parent_page_id`.

## SDK

Install the workspace SDK in local examples:

```bash
pnpm --filter lensx-plugin-hello-world install
```

Use the SDK instead of hand-written bridge messages:

```ts
import { createPluginClient } from '@lensx/plugin-sdk';

const client = createPluginClient();
const context = await client.getRuntimeContext();
```

The SDK wraps JSON-RPC request IDs, response parsing, standard errors, timeouts,
and runtime events such as locale and theme changes.

## Host API

Host API methods are declared by shared schema and SDK constants. Calls go
through JSON-RPC 2.0 over `postMessage`:

```text
iframe -> @lensx/plugin-sdk -> Plugin Bridge -> Host API Dispatcher -> Rust or Vue service
```

Every privileged call is checked against the plugin manifest, the method
permission, and the current authorization state.

## Restrictions

The first phase does not support sidecar execution, external Rust injection,
external native rendering, direct Tauri command access, direct access to the main
Vue store, background-resident plugins, plugin-to-plugin messaging, streaming
RPC, or large-file transfer.

External iframe resources must resolve inside the plugin installation directory.
The main launcher path must load only plugin metadata until a user opens a
plugin page.
