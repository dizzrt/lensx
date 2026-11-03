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
and adds no inner radius on the Runtime container. Host CSS clips its own DOM;
on macOS, Rust clips the common native content container as described below.
Home, Search, and Host-owned Pages retain their existing layouts; plugin identity,
Publisher, repository location, provenance, and Runtime content do not select
this state.

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

## Native Rounded Content

On macOS, Rust resolves the complete `Window("main")` and its current
`NSWindow.contentView`, the common ancestor of the Host and plugin native
siblings. On the main thread it enables layer backing and configures the
existing layer with a radius of 18 logical points and `masksToBounds = true`,
then reads the state back. This clips all four corners without replacing the
content view or layer, adding a wrapper, or changing the first responder or
view ordering. The layer adds no background fill, corner covers, or shadow.
The existing `NSWindow` shadow remains separate from content clipping.

The radius corresponds to `.launcher-surface`'s 18 CSS px and is never
multiplied by the backing scale. The layer's implicit bounds mask follows the
current content bounds during resize and monitor changes. Surface configuration
reconfirms the policy after fixed/resizable transitions and work-area fitting;
there is no separate physical mask path, resize polling, or plugin geometry
channel. Surface commands and coalesced monitor/scale refreshes run off the main
thread while retaining the existing serialized transaction and rollback order.
The native event callback only schedules work, so it cannot hold up main-thread
confirmation by waiting for that transaction. A notification during refresh is
retained for the next pass. The Child still receives the existing rectangular
physical bounds and latest-wins slot revision. Its viewport and resize permission
do not change.

The macOS main window is created hidden. After the Host view exists, clipping
is established before the plugin service can present content. Startup then
explicitly reveals the window using the existing activation and focus path,
including when shortcut registration fails. A missing native window, content
view, layer, or failed confirmation keeps startup hidden and returns a bounded
setup error. Hiding creation and performing this first reveal are one lifecycle
change; a rollback must revert both together with native clipping, or it can
leave a permanently hidden window.

Before a current Child's first reveal, same-attempt restore, or parent-window
restore, Rust reconfirms the same Window-owned policy. Successful queue
submission is not confirmation: a scheduled operation must report its actual
main-thread result before presentation proceeds. Main-thread callers execute
directly instead of waiting on their own queue. The Child registry releases its
lock while confirmation runs, then rechecks the attempt, native handle,
readiness, and latest private visibility intent before reveal or failure hiding.
A newer hide or reveal supersedes an older pending operation without changing
the slot's wire revision. The clipping operation does not load a document,
create a Session, Worker, or model, or acquire focus. Existing load, bridge, SDK
readiness, and compare-current checks still govern Child presentation.

If runtime confirmation fails, presentation cannot report a successful reveal
or expose an unconfirmed Child. A still-confirmable safe clip is retained;
otherwise the affected content stays hidden and the existing window/Runtime
failure path handles the error. Existing localized navigation, retry, and close
controls remain available only while the Host can be safely shown. Native
pointers, object labels, and platform diagnostics do not become plugin data or
product copy. No new user setting or public protocol field is introduced.

Clipping belongs to the Window, so Child teardown does not remove it. The same
rules apply to official, external, and Development Mode plugins; provenance,
background opacity, locale, and theme do not select another native path.

| Presentation or transition | Common clipping and retained behavior |
| --- | --- |
| Home, Search, Host Page, or Settings overlay | Host content stays inside the same outer outline; existing padding, overlay ordering, keyboard behavior, and focus targets remain owned by the Host. |
| Plugin loading, ready, blank, opaque, failed, or retry | The edge-to-edge rectangle has no inner top corners or added inset; existing readiness and failure UI remain authoritative. |
| Hide and same-attempt restore | Confirmation precedes reveal while the same document, Session, Worker, model, and user-resized size are retained. |
| Close/reopen or replacement from A to B | Close destroys the old attempt; late A updates, ready events, and teardown cannot remove the Window clip or operate on B. |
| Resize burst, work-area fitting, or scale change | The common content bounds drive clipping, the radius stays 18 logical points, and existing physical-bounds revisions converge independently. |

Deterministic policy, lifecycle, wiring, and compilation checks have distinct
roles in the [validation guide](../development/validation.md#native-rounded-content-validation).
They do not establish final macOS compositing pixels, antialiasing, native
shadow appearance, or edge hit-testing. Other platforms retain their existing
window behavior.

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

## Action Invocations And Shortcut Activation

The Host Action dispatcher gives every admitted call a frozen invocation with
an independent ID and `normal` or `shortcut` source. UI selection and plugin
`actions.open` always start a normal invocation. Only a current native Action
binding can start a shortcut invocation, after native Show and an atomic claim
of its binding revision. The ordinary Launcher shortcut still uses Toggle;
an Action retains its own behavior, including an eventual Hide.

Native delivery installs its listener before declaring the Host ready, then
merges the handshake batch with concurrent events in invocation order. Repeated
native IDs share one claim. Waiting admission is bounded at 32 invocations and
10 seconds; overload, stale bindings, unavailable targets, and expiry produce
safe failure feedback. The dispatcher rechecks the current binding revision and active status when a
queued shortcut begins execution, checks the current Action Registry, and emits successful-use observation once per invocation, regardless
of plugin callback outcomes.

`ActivePage` remains exactly `owner_id`, `page_id`, and `opened_by_action_id`.
A separate Page-attempt activation channel carries calls to the current Session.
Repeated calls to the same available Page update its opening Action and focus
the current Child without changing its React key, Runtime identity, surface
attempt, input, selection, or business state. Runtime replacement, close,
invalidated availability, or explicit retry revoke the old channel. Retry
starts an empty channel and does not replay old calls.

The private native-to-Host dispatch envelope carries the native presentation
attempt ID. The Host binds the activation provider only after that attempt
matches the current Page presentation; an early request can await presentation
creation, while a late old request cannot claim the new Page channel. This ID
never enters public Activation, Runtime Context, URL parameters, or plugin
request authority.

Host API `0.4.0` exposes separate `actions.get_activation` and
`actions.subscribe_activations` methods and the `actions.activated` event.
Activation contains only plugin-local `actionId`, a positive safe integer
`invocationId` increasing within the Page attempt, and `source`. The Session
atomically opens one stream and caches its initial batch of at most 32 calls;
repeated subscription returns that same batch. The cache does not consume later
stream capacity. The latest snapshot updates before an event is emitted.
An initial channel that cannot open within 10 seconds fails its Runtime attempt;
explicit retry starts fresh. Context remains its existing four fields and
advertises the activation methods only when the provider is actually available.

SDK `0.5.0` consumes this channel even without a business callback. The optional
factory `onShortcutActivated` runs only for shortcut calls, after the SDK is
ready. It does not automatically translate, format, clear input, reset results,
or wait for previous callback Promises. Plugin code owns business concurrency.
After an activation stream has been attempted, initialization failure terminates
that SDK transport and Session instead of replaying against the same attempt.
Disposal prevents future callbacks and consumes late Promise rejections; it
does not claim to undo external work that a callback already started.

These guarantees are covered by deterministic Action, navigation, Session,
SDK, and production-composition checks in `launcher-shortcuts` and the existing
Child WebView Gates. They do not establish real keyboard delivery, system
permission interaction, or a real WebView run.

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
