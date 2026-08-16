# Plugin Child WebView Runtime

## Shipped Surface Ownership

The Launcher keeps one trusted Host WebView and at most one current plugin
Child WebView in the same native window. React owns Page chrome, loading,
retry, errors, Settings, and the measured content slot. Rust owns native
creation, bounds, visibility, focus, navigation, bridge ingress, resource
authority, and destruction. A plugin cannot submit native bounds or obtain a
Tauri object.

```mermaid
flowchart LR
  A["React Host WebView<br/>chrome and slot intent"] -->|"validated physical bounds<br/>and presentation revision"| B["Rust presentation and<br/>Child WebView service"]
  B --> C["One current Child WebView<br/>plugin document"]
  D["Resource service<br/>generation-bound package bytes"] --> C
  C -->|"closed bridge frames<br/>native source identity"| E["Host API dispatcher"]
  B -->|"hide or destroy first"| A
```

The Host and plugin documents are native siblings. Correctness does not assume
OS process isolation or that WebKit assigns them different processes.

## Session And Lifecycle

One attempt advances through native load, bridge ready, and SDK context ready
as distinct states. The Child WebView stays hidden behind Host feedback until
all current checks pass. Close, another Page, disable, uninstall, replacement,
upgrade, development reload, retry, disconnect, fatal bridge failure, Host
reload, app teardown, and process exit use one compare-current terminal path.

The public WebView SDK transport waits for the plugin document load event and
crosses one task boundary before it discovers the bridge and reports ready.
This preserves the native `Finished` load event as the authoritative transition
to `Loaded` and prevents early module or React startup from racing that event.

```mermaid
stateDiagram-v2
  [*] --> Creating
  Creating --> Loaded: exact document finished
  Loaded --> BridgeReady: current source and freshness
  BridgeReady --> SDKReady: runtime.get_context succeeds
  SDKReady --> Hidden: Launcher hide
  Hidden --> SDKReady: same-attempt restore
  Creating --> Terminal: timeout or failure
  Loaded --> Terminal: timeout or failure
  BridgeReady --> Terminal: context failure
  SDKReady --> Terminal: close or invalidation
  Hidden --> Terminal: close or invalidation
  Terminal --> [*]: revoke then destroy
```

Hide/restore preserves the same attempt only while plugin, Page, entry,
version, resource generation, and native source remain current. A real close
or generation change destroys it before a fresh reopen. There is no hidden
Runtime, preload pool, background Page, or second current plugin WebView.

## Security And Web Capabilities

Each generation has an isolated origin, data-store identity, resource scope,
native label, and opaque attempt. Native ingress supplies the source identity;
plugin frames cannot choose it. The document receives only the frozen lensX
bridge carrier. Generic Tauri core/plugin/app commands, global events, window
and WebView control, Host DOM, other plugins, and old generations remain
unavailable. Top-level escape, popup/new-window, and download are denied.

The page may use ordinary Web features such as package modules, Dedicated
Workers, Fetch/HTTPS, WebSocket, WASM, and origin storage. These are browser
capabilities, not Host grants. SharedWorker, ServiceWorker, detached execution,
device access, and native APIs are not promised. Publisher, repository,
provenance, and official release metadata never add Runtime authority.

## Development And Release

External, development, and official plugins use Manifest `0.3.0`,
`runtime.kind: "webview"`, and `@lensx/plugin-sdk/webview`. Templates and the
CLI build only this path. Development reload stages the next generation before
destroying the old current attempt; rejected staging leaves the current attempt
unchanged. Official candidates pass the same local installation, native
Runtime, bridge/SDK, interaction, and zero-residual teardown gates as external
plugins.

Use these maintained commands:

```bash
pnpm run check:plugin-child-webview-macos-evidence
pnpm run evidence:plugin-child-webview-macos
pnpm run check:open-isolated-plugin-runtime
```

The `evidence:` command opens temporary macOS WKWebView harness windows. The
ordinary `check:` command validates the committed bounded evidence and is safe
for non-interactive aggregate validation.

## Performance Budgets And Evidence Schema

Cold create and same-attempt restore are measured separately. ConfigLens warm
format is also independent of container startup.

| Measurement | Maintained budget | Method |
| --- | ---: | --- |
| Child WebView cold create p95 | 1000 ms | Five automated cold opens; resolve, create, navigation, load, bridge, SDK, bundle, editor, Worker, and first-interactive stages are recorded separately. |
| First interactive p95 | 2000 ms | End-to-end cold-open stage clock. |
| Same-attempt hide/restore | 250 ms | Native hide/show call and current-document verification without reload. |
| Terminal destroy | 1000 ms | Close through absence from the native WebView registry. |
| ConfigLens warm small-JSON format p95 | 100 ms | Forty action-to-model-update samples over the maintained four-case corpus. |
| Host heartbeat p95 gap | 50 ms | A 16 ms Host timer while plugin startup or work runs. |

The committed matrix uses schema version `0.1.0`, platform `macos`, engine
`wkwebview`, boolean positive/negative outcomes, bounded stage summaries, and
explicit privacy flags. Evidence records no user content, raw payload/error,
complete URL, origin, path, nonce, native label, data-store identifier, or
Host-private token. Memory/resource release is established by registry absence,
destroyed WebViews, inert late callbacks, terminated Workers/connections, and
zero remaining bridge/resource authority; process separation is not measured
or assumed.

## Troubleshooting

1. If the Host stays in loading, distinguish native load from bridge ready and
   SDK context ready; do not treat them as one timeout.
2. If content is hidden or misaligned, run the slot/bounds gate and verify
   scale factor, presentation revision, and Host overlay ordering.
3. If a Web feature fails, use browser feature detection and check plugin CSP;
   do not add a Host permission or native fallback.
4. If reload or replacement fails, verify staging before teardown and confirm
   the old generation cannot send a late callback.
5. If evidence changes, rerun the real macOS matrix and review the bounded
   result. Never edit a positive boolean to bypass a failed harness.

## Legacy Migration

Legacy Manifest `0.2.x` packages using the iframe Runtime are incompatible
migration inputs only. They are never executed, rewritten, or routed through a
fallback. Rebuild with a current template and the public WebView SDK transport.
