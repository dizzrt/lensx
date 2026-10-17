# lensX macOS frame-aware navigation patch

This directory vendors the exact crates selected by `src-tauri/Cargo.lock`:

- `tauri 2.11.5`
- `tauri-runtime 2.11.3`
- `tauri-runtime-wry 2.11.4`
- `wry 0.55.1`
- `tao 0.35.3`

The source comes from the corresponding crates.io releases. Original package metadata and license files remain in each directory: Apache-2.0/MIT for the Tauri/Wry layers and Apache-2.0 (`LICENSE` and `LICENSE.spdx`) for Tao.

The lensX patch adds one macOS document-navigation fact: `main | descendant | unknown`. Wry derives it synchronously from `WKNavigationAction.targetFrame` and `isMainFrame`; the Tauri runtime layers carry it to a new macOS-only builder callback. Existing URL-only handlers and plugin hooks remain intact and all handlers must allow a navigation before WKWebView commits it.

The patch also adds a per-WebView isolated IPC mode used only by the Host-private plugin Child WebView adapter. In that mode Tauri initialization, plugin global APIs, built-in `tauri`/`ipc`/asset/isolation protocols, and the standard Tauri message router are absent. Only explicitly allowlisted application protocols and one raw Wry handler remain; the handler validates lensX closed carrier frames before dispatch.

The Tao patch protects macOS `set_resizable` at its main-thread execution point. It stores the desired internal state, defers style edits during native fullscreen, and skips unchanged masks. Necessary edits retain the actual first responder and restore it only if it changed and still belongs to the same window. Nil, removed, or unverifiable targets are left alone; restoration refusal produces a bounded developer warning. It never redirects this setter to the original Tao view or activates the window. Other setters and fullscreen exit behavior retain their upstream implementation.

The reviewed source changes are limited to:

- `wry/src/lib.rs`
- `wry/src/wkwebview/class/wry_navigation_delegate.rs`
- `wry/src/wkwebview/mod.rs`
- `wry/src/wkwebview/navigation.rs`
- `wry/src/wkwebview/download.rs`
- `tauri-runtime/src/webview.rs`
- `tauri-runtime-wry/src/lib.rs`
- `tauri/src/manager/webview.rs`
- `tauri/src/webview/mod.rs`
- `tauri/src/webview/webview_window.rs`
- `tao/Cargo.toml`
- `tao/src/platform/macos.rs`
- `tao/src/platform_impl/macos/app.rs`
- `tao/src/platform_impl/macos/app_delegate.rs`
- `tao/src/platform_impl/macos/event.rs`
- `tao/src/platform_impl/macos/event_loop.rs`
- `tao/src/platform_impl/macos/file_drop.rs`
- `tao/src/platform_impl/macos/icon.rs`
- `tao/src/platform_impl/macos/mod.rs`
- `tao/src/platform_impl/macos/monitor.rs`
- `tao/src/platform_impl/macos/resizable.rs`
- `tao/src/platform_impl/macos/util/async.rs`
- `tao/src/platform_impl/macos/util/mod.rs`
- `tao/src/platform_impl/macos/window.rs`
- `tao/src/platform_impl/macos/window_delegate.rs`
- `tao/src/window.rs`

No Windows or Linux adapter is included in the lensX patch. Remove this directory and the `[patch.crates-io]` entries after an audited upstream release provides equivalent frame context, isolated IPC, and responder protection and passes the deterministic capability Gates.

`launcher-input-focus` reuses the dependency maintenance Gate to compile and run the private Tao policies without AppKit interaction; Cargo check/build validates the real adapter. These checks establish state and operation boundaries, not real input-method candidate-window behavior or Finder/AppKit dragging.

Tao diagnostic maintenance removes unused macOS remnants and obsolete aliases, limits shared hit testing to its Windows/Linux/BSD consumers, and retains the validated RGBA payload with one documented field-level `allow(dead_code)`. Existing unrelated upstream lint exceptions remain. File dragging uses checked NSURL file-URL reads at Enter/Prepare/Drop, filters invalid candidates through the production `file_drop.rs` policy, preserves ordered per-file events and single Exit cancellation, and registers the correct NSDragOperation/BOOL callback types. Binding features are declared directly in the active manifest; original release metadata is unchanged.

The read-only `frame-aware-navigation-dependency-drift` Gate checks versions, patch paths, and all vendored file hashes. It compares application/selected-package Tao paths, versions, and features before Darwin-only strict Tao compilation with `-D warnings`. Portable steps run the production resizable and file-drop policies with cleanup on success/failure and check every reviewed Tao Rust file with two-space rustfmt. Review the same-version upstream diff before updating the baseline with `pnpm run generate -- frame-aware-navigation-dependency-drift --write`; validation never regenerates it.
