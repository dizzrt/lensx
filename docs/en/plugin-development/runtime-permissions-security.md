# Runtime And Security

## Runtime lifecycle

Each eligible plugin Page instance runs in a Host-owned native Child WebView.
Each owning window has at most one instance, and the same plugin may have
several independent instances. A live generation scope can share an origin
string, but each attempt has a distinct non-persistent data store, source lease
and Session. Use Host `storage.*` for persistent plugin configuration.
The Host waits separately for native load, bridge readiness and
`runtime.get_context`, and owns deadlines, retry, breaker, navigation,
presentation and final teardown.

Close, local Page replacement, retry and disconnect terminate only the affected
instance. Committed disable, uninstall, replacement or development reload
revokes all affected plugin-generation instances; rejected staging preserves
them. Host reload and application exit terminate every instance. Terminal
cleanup makes that instance's Worker, connection, timer, listener, bridge,
Session and source authority inert, without revoking a healthy sibling's lease.

Temporarily hiding and restoring the Launcher window is not Page close or
Runtime teardown. Each restore activation refreshes and revalidates current
Registration and Resource facts. If the current plugin's entry, Page, version,
origin, resource generation, and Runtime attempt are unchanged, the Host keeps
the same Child WebView, Session, and page memory. A global
Registration revision is only an invalidation hint; an unrelated plugin change
does not replace the current Runtime.

Host detachment also retains the same document, Session, SDK, Worker, request
sequence and temporary state. It changes only Host-owned presentation. Main
returning Home does not close the transferred instance; opening the same Page
from Launcher creates or reuses only main's own instance. A detached window
stays visible on blur. Its close ends that instance, and application exit does
not restore window layouts or temporary state on the next launch.

Shared plugin `storage.*` configuration remains separate from browser storage
and in-memory working state. Concurrent instances observe shared configuration
through their ordinary reads and writes; there is no automatic input/result
synchronization and no new multi-window Manifest declaration or permission.

## Context replacement

Initialize the SDK once per Child WebView attempt. `runtime.get_context` and later
context events provide complete Host API state: version, locale, theme, and
the current Session-bound method capabilities. Replace the whole context in
one state transition. Ordinary browser Worker/network support is not a Host API
method. The separate controlled `http.request` method appears only when its
Host provider is available.

## Open Web capabilities

The current macOS WKWebView baseline permits page-lifetime Dedicated Workers,
package/HTTPS/Data/Blob content, HTTPS/WSS connections, WASM, and browser origin
storage without Manifest fields or lensX grants. A plugin may add a stricter CSP
in its own HTML; the browser intersects it with the Host response policy, so it
can narrow behavior but cannot weaken Host isolation.

SharedWorker, ServiceWorker, detached background execution, and device/native
APIs are not promised. Camera, microphone, geolocation, fullscreen, and browser
clipboard may remain unavailable through WebView, Permissions Policy, or OS
behavior. lensX does not reinterpret that browser result as a grant decision.

## Controlled Host HTTP

The public `http.request` method transfers bounded UTF-8 requests to public
HTTPS destinations through Rust. It is separate from browser Fetch and is not
conditioned on CORS response headers. It does not disable browser security,
share cookies or system credentials, or permit local/private network access.
DNS validation and connection pinning, TLS checks, payload limits, deadlines,
concurrency, cancellation, and Runtime teardown remain Host-owned. Every plugin
source uses the same policy; service signing and business interpretation stay
in the plugin. See the [HTTP reference](host-api.md#httprequest).

## Failure and recovery

Handle unavailable browser features through standard feature detection and
rejection. Handle Host API `method_not_found`, `unavailable`, cancellation,
timeout, limits, disconnect, and incompatible context without blind retry.
After replacement or reload, create fresh Workers, connections, SDK state, and
subscriptions. Never reuse a previous generation's URL, port, cursor, or
browser state as Host authority.

Detachment recovery retries restoration of the original instance, not Runtime
Retry. If native compensation cannot be confirmed, the Host retains that
instance in an explicit recovery state with trusted restore, close and exit
controls. It does not reload or replay work. Ownership-sensitive `actions.open`
returns bounded `unavailable` until recovery resolves, while valid source and
Session checks remain mandatory and `ui.close` can request explicit termination.

## Security boundary

The open Web baseline does not expose the Host DOM, Tauri globals or IPC, Rust
commands, filesystem, Shell, process, native clipboard, another plugin origin,
or an old generation. The Host keeps the main WebView and plugin WebView as
native siblings, derives exact origin/generation/source bindings, scopes
resource paths, permits only the closed lensX bridge carrier, bounds RPC, and
owns deterministic teardown. Publisher, repository location, provenance, and
release metadata do not change this authority.

Installation is therefore a trust decision about code running in this isolated
Web Runtime. lensX does not inspect, approve, or continuously monitor how the
plugin uses data that the user gives it, nor does it grant ordinary Web
behavior item by item.

See [Plugin Child WebView Runtime](../architecture/plugin-child-webview-runtime.md)
for Host/native ownership, lifecycle ordering, evidence budgets, and maintainer
troubleshooting.
