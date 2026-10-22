# Plugin Child WebView Runtime

## Shipped Surface Ownership

The Launcher keeps one trusted Host WebView and at most one current plugin
Child WebView in the same native window. React owns Page chrome, loading,
retry, errors, Settings, and the measured content slot. Rust owns native
creation, bounds, visibility, focus, navigation, bridge ingress, resource
authority, and destruction. A plugin cannot submit native bounds or obtain a
Tauri object.

When the trusted current Page resolution has `provider.kind: "plugin"`, React
selects one shared edge-to-edge Launcher body layout for external,
Development Mode, and official plugins. The Host keeps Page chrome outside the
plugin rectangle, removes body inline and bottom inset plus inter-region gap,
and adds no inner radius on the Runtime container. The outer Launcher surface
continues to own native-window clipping and radius. Home, Search, and
Host-owned Pages retain their existing layouts; plugin identity, Publisher,
repository location, provenance, and Runtime content do not select this state.

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

The shared container has three distinct identities. `Window("main")` is the
complete native Launcher and owns size, visibility, show/hide, focus, window
events, and native-dialog parenting. The trusted `Webview("main")` is only the
Host document and is the sole target of `launcher://activated`. The current
plugin Child WebView has a separate generated identity and never receives that
Host event. Post-creation Launcher operations must not convert the native
Window back into a single `WebviewWindow`.

## Session And Lifecycle

One attempt advances through native load, bridge ready, and SDK context ready
as distinct states. The Child WebView stays hidden behind Host feedback until
all current checks pass. Close, another Page, disable, uninstall, replacement,
upgrade, development reload, retry, disconnect, fatal bridge failure, Host
reload, app teardown, and process exit use one compare-current terminal path.

Presentation uses one Host-private asynchronous readiness wait bound to the
opaque current attempt. It settles exactly once on bridge readiness, a closed
failure, timeout, destruction, replacement, or app teardown. React does not
poll at a fixed interval; the snapshot read remains diagnostic only, and a late
completion after unmount or replacement cannot reveal or revive the WebView.

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

Launcher actions resolve their required native Window and Host WebView targets
before changing Child presentation. Hide remains Child-first and native-parent
second to prevent overlay leakage. If native parent hide fails, Rust restores
and refocuses only the same compare-current Child; a failed rollback tears that
attempt down, while a stale rollback is inert. Restore shows and focuses the
native parent before the same Child and preserves its current user-resized
size. A plugin Page close submits fixed `home` immediately, so the native Window
can return to `650×320` and non-resizable while
Child teardown finishes asynchronously; resize never waits for a
single-WebviewWindow conversion.

Each normalized Page carries a bounded initial logical size and `resizable`
flag. The Host owns the complete native Window transition and current-monitor
constraints. Window and scale changes produce trusted slot revisions for the
same Child WebView without reloading its document, Session, model, or Worker.
The plugin observes its ordinary Web viewport but receives no native size,
position, monitor, constraint, maximize, fullscreen, or Window-handle method.
React still measures only `.plugin-runtime-slot`: its DOM rectangle,
`ResizeObserver`, scale conversion, and serialized latest-wins presentation
revision feed the existing Rust-validated physical-bounds path. The
edge-to-edge layout adds no payload field, Tauri command, native setter,
Runtime reload, or Session replacement path.

## Native Editing Shortcuts

With the enabled Tauri `unstable` feature, both the initial Host `main` WebView
and plugin WebViews use the native `WindowChild` creation path. This shared
native layout does not change their separate document identities or authority.
Host search, ordinary external Web controls, and ConfigLens therefore use the
same native editing boundary.

The macOS Wry adapter delegates a Child key equivalent only while its native
window is visible and key, the Child and its ancestors are visible, and the
current first responder is a visible native view in that Child's subtree and
the same window. It passes the original event and modifiers to WKWebView at
most once per native callback and preserves the synchronous return value.
That return may mean asynchronous Web handling has started; it does not establish
final handling. An unfocused, hidden, detached, replaced, or unverifiable Child
cannot reclaim focus, reveal itself, or intercept another target.

The shared Tao parent forwards `doCommandBySelector:` to the NSView superclass
only when the current first responder is its visible native descendant in the
same visible key window. It forwards the original selector without interpreting
it. Tao's own raw-input focus keeps its existing behavior. This restores normal
command propagation, so WebKit can recognize an unhandled command and perform
its own legal event reentry; the existing application menu can then match its
accelerator, validate its item, and deliver the native action to the responder.
Web handling or cancellation does not trigger an extra default edit, and a
completed native action is not repeated. Wry's non-Child delegation is unchanged.

The adapter does not call the menu, add a second `keyDown` fallback, infer final
handling from the synchronous BOOL, or implement pending state, a completion
callback, an event queue, replay, or delayed target compensation. It retains no
routing target across callbacks. WebKit owns completion and reentry, including
its existing focus-change semantics; each lensX guard reads current native
ownership without focusing or reviving a view.

The application-local monitor remains authoritative for foreground `Cmd+W/Q`:
each event is consumed once for recoverable Hide or complete Quit. Standard
Select All, Copy, Cut, Paste, Undo, and Redo reuse the native menu/responder
contract; Find and other page commands remain owned by the Web document.
No plugin identity, Publisher, provenance, DOM selector, or Monaco type selects
a route. Existing compliant external plugins need a Host update, without source
changes, repackaging, a new SDK, or clipboard permission. There is no synthetic
keyboard event, new Host API, or exposed native handle.

The [validation guide](../development/validation.md) separates production Rust
policy tests, native wiring and Cargo compilation, modeled plain-control DOM
editing, and actual Monaco handlers with test clipboard data. None of those
alone proves operating-system event delivery. A temporary investigation of the
current macOS build confirmed unhandled-command propagation, WebKit reentry,
and a single existing-menu action; the user confirmed restored shortcuts after
the debugger was removed. That observation is limited to the exercised build
and scenarios, and does not establish every key/control matrix or another
platform. No native interaction harness or diagnostic entry is maintained.

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
provenance, and CI evidence never add Runtime authority.

The separate public `http.request` method is handled by a source-bound Rust
provider for public HTTPS text requests. It uses the same current Session and
cancellation/teardown boundary, keeps native transport private, and leaves
service signing and business logic in the plugin. Browser Fetch retains its
own CORS/CSP rules; no WebKit security option is disabled. See the
[Host HTTP contract](../plugin-development/host-api.md#httprequest) for destination,
DNS pinning, header/body, deadline, and concurrency limits.

## Development And CI

External, development, and official plugins use Manifest `0.4.0`,
`runtime.kind: "webview"`, and `@lensx/plugin-sdk/webview`. Templates and the
CLI build only this path. Development reload stages the next generation before
destroying the old current attempt; rejected staging leaves the current attempt
unchanged. Direct plugins use the same public Runtime, bridge and SDK,
interaction, and zero-residual teardown boundaries as external plugins; CI
does not grant a different Host path.

Use these deterministic commands:

```bash
pnpm run gate -- plugin-child-webview-runtime
pnpm run gate -- plugin-child-webview-session
pnpm run gate -- open-isolated-plugin-runtime
```

These Gates validate contracts, state machines, source and generation binding,
resource policy, bridge adapters, lifecycle races, cleanup, and malicious
boundaries. They do not launch or claim proof from a real WebView or native
product environment.
## Deterministic Resource And Lifecycle Checks

Container startup latency and target-environment interaction timing are not
maintained validation outputs. ConfigLens bundle and initial-resource budgets
are checked from production build artifacts. Runtime deadlines, bounded frames,
single-instance ownership, cancellation, replacement, terminal cleanup, and
late-event suppression remain enforced by Rust, TypeScript, React, package, and
boundary tests.
## Troubleshooting

1. If the Host stays in loading, distinguish native load from bridge ready and
   SDK context ready; inspect the responsible state transition instead of
   treating them as one timeout.
2. If content is hidden or misaligned, run the slot/bounds gate and verify
   scale factor, presentation revision, and Host overlay ordering.
3. If `Cmd+W`, focus loss, or Page close leaves a blank or incorrectly sized
   Launcher, run `pnpm run gate -- plugin-child-webview-window-lifecycle`. Verify
   post-creation paths resolve `Window("main")`, Host activation resolves only
   `Webview("main")`, and inspect native-hide rollback before changing teardown
   timing.
4. If a Web feature fails, use browser feature detection and check plugin CSP;
   do not add a Host permission or native fallback.
5. If reload or replacement fails, verify staging before teardown and confirm
   the old generation cannot send a late callback.
6. If a deterministic assertion changes, review the product invariant and
   update the responsible unit, state, package, or boundary test.

The Resource Service keeps a process-local 32 MiB/256-entry verified byte cache
keyed by entry, installed/development payload variant, resource generation, and
normalized path. A miss publishes bytes only after the complete path/file/read
and final-currentness proof. A hit still checks scope, Manager projection,
payload ownership, generation, current attempt/source, and pre/post identity.
Development snapshots use a bounded metadata seal after the first complete tree
proof. Lifecycle generation changes revoke eligibility and evict stale entries.
`Cache-Control: no-store` remains unchanged: browser caching is not authority.

## Legacy Migration

Manifest `0.3.x` and older packages, including legacy iframe packages, are incompatible
migration inputs only. They are never executed, rewritten, or routed through a
fallback. Rebuild with a current template and the public WebView SDK transport.
