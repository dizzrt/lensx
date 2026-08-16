# Runtime And Security

## Runtime lifecycle

Each eligible plugin Page runs in the Launcher's single current native Child
WebView with a generation-scoped origin and data store. The Host creates the
WebView and private bridge Session, waits separately for native load, bridge
ready, and `runtime.get_context`, and owns deadlines, retry, breaker,
navigation, presentation, and final teardown. Close, navigation, disable,
uninstall, replacement, development reload, disconnect, Host reload, and app
unmount destroy the old WebView and make its Worker, connection, timer,
listener, bridge, Session, and resource authority inert.

Temporarily hiding and restoring the Launcher window is not Page close or
Runtime teardown. Each restore activation refreshes and revalidates current
Registration and Resource facts. If the current plugin's entry, Page, version,
origin, resource generation, and Runtime attempt are unchanged, the Host keeps
the same Child WebView, Session, and page memory. A global
Registration revision is only an invalidation hint; an unrelated plugin change
does not replace the current Runtime.

## Context replacement

Initialize the SDK once per Child WebView attempt. `runtime.get_context` and later
context events provide complete Host API state: version, locale, theme, and
the current non-privileged method capabilities. Replace the whole context in
one state transition. Worker/network support is not a Host API method and does
not appear in the capability list.

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

## Failure and recovery

Handle unavailable browser features through standard feature detection and
rejection. Handle Host API `method_not_found`, `unavailable`, cancellation,
timeout, limits, disconnect, and incompatible context without blind retry.
After replacement or reload, create fresh Workers, connections, SDK state, and
subscriptions. Never reuse a previous generation's URL, port, cursor, or
browser state as Host authority.

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
