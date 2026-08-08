# Runtime And Security

## Runtime lifecycle

Each eligible plugin Page runs in one isolated iframe with a scoped plugin
origin. The Host creates a private session, transfers the SDK transport, waits
for ready, and owns the deadline, retry, breaker, navigation lease, and final
teardown. Close, navigation, disable, uninstall, replacement, development
reload, disconnect, Host reload, and app unmount make the old iframe, Worker,
connection, Blob URL, timer, listener, session, and port inert.

## Context replacement

Initialize the SDK once per iframe attempt. `runtime.get_context` and later
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
or an old generation. The Host keeps an exact trusted ancestor, isolated
origin and generation, scoped resource paths, `nosniff`, `no-store`, no Host
CORS authority, iframe sandbox, referrer policy, device restrictions, bounded
RPC, deadline, breaker, and deterministic teardown.

Installation is therefore a trust decision about code running in this isolated
Web Runtime. lensX does not inspect, approve, or continuously monitor how the
plugin uses data that the user gives it, nor does it grant ordinary Web
behavior item by item.
