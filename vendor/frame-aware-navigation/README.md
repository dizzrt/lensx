# lensX macOS frame-aware navigation patch

This directory vendors the exact crates selected by `src-tauri/Cargo.lock`:

- `tauri 2.11.5`
- `tauri-runtime 2.11.3`
- `tauri-runtime-wry 2.11.4`
- `wry 0.55.1`

The source comes from the corresponding crates.io releases. Their original Apache-2.0/MIT license files and package metadata remain in each directory.

The lensX patch adds one macOS document-navigation fact: `main | descendant | unknown`. Wry derives it synchronously from `WKNavigationAction.targetFrame` and `isMainFrame`; the Tauri runtime layers carry it to a new macOS-only builder callback. Existing URL-only handlers and plugin hooks remain intact and all handlers must allow a navigation before WKWebView commits it.

The patch also adds a per-WebView isolated IPC mode used only by the Host-private plugin Child WebView adapter. In that mode Tauri initialization, plugin global APIs, built-in `tauri`/`ipc`/asset/isolation protocols, and the standard Tauri message router are absent. Only explicitly allowlisted application protocols and one raw Wry handler remain; the handler validates lensX closed carrier frames before dispatch.

The reviewed source changes are limited to:

- `wry/src/lib.rs`
- `wry/src/wkwebview/class/wry_navigation_delegate.rs`
- `wry/src/wkwebview/mod.rs`
- `wry/src/wkwebview/navigation.rs`
- `tauri-runtime/src/webview.rs`
- `tauri-runtime-wry/src/lib.rs`
- `tauri/src/manager/webview.rs`
- `tauri/src/webview/mod.rs`
- `tauri/src/webview/webview_window.rs`

No Windows or Linux adapter is included. Remove this directory and the `[patch.crates-io]` entries after an audited upstream release exposes equivalent macOS frame context and passes the real WKWebView evidence gate.
