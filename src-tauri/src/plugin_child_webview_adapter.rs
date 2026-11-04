use crate::plugin_child_webview_execution::{
    perform_owned_presentation, NativeExecutionGuard, NativePresentationOperation,
    NativePresentationOutcome, NativePresentationStep,
};
use crate::plugin_resource_url::parse_plugin_resource_url;
use serde_json::Value;
use std::{
    fmt,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{
    webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Rect, Runtime, Size, Webview,
    WebviewUrl,
};
use url::Url;

#[cfg(test)]
const BRIDGE_PROBE_FRESHNESS: &str = "0123456789abcdef0123456789abcdef";
const PLUGIN_CHILD_WEBVIEW_BRIDGE_BOOTSTRAP: &str = r#"
(() => {
  'use strict';
  const rawPost = globalThis.ipc && typeof globalThis.ipc.postMessage === 'function'
    ? globalThis.ipc.postMessage.bind(globalThis.ipc)
    : undefined;
  const listeners = new Set();
  const pendingClose = new Set();
  const MAX_PENDING_CLOSE_RECEIPTS = 32;
  const bootstrap = Object.freeze({
    contract_version: '0.2.0',
    type: 'lensx.plugin_bridge.ready',
    freshness: '__LENSX_BRIDGE_FRESHNESS__'
  });
  const plain = (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };
  const exact = (value, keys) => {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  };
  const requestId = (value) => typeof value === 'string' && /^request_[0-9a-f]{16}$/.test(value);
  const closed = (frame) => {
    if (!plain(frame) || frame.contract_version !== '0.2.0' || typeof frame.type !== 'string') return false;
    switch (frame.type) {
      case 'lensx.plugin_bridge.ready':
        return exact(frame, ['contract_version', 'type', 'freshness'])
          && typeof frame.freshness === 'string'
          && /^[0-9a-f]{32}$/.test(frame.freshness);
      case 'lensx.plugin_bridge.request':
        return exact(frame, ['contract_version', 'type', 'request_id', 'request'])
          && requestId(frame.request_id);
      case 'lensx.plugin_bridge.response':
        return requestId(frame.request_id)
          && (exact(frame, ['contract_version', 'type', 'request_id', 'result'])
            || exact(frame, ['contract_version', 'type', 'request_id', 'error']));
      case 'lensx.plugin_bridge.event':
        return exact(frame, ['contract_version', 'type', 'event']);
      case 'lensx.plugin_bridge.cancel':
        return exact(frame, ['contract_version', 'type', 'request_id']) && requestId(frame.request_id);
      case 'lensx.plugin_bridge.disconnect':
        return exact(frame, ['contract_version', 'type']);
      default:
        return false;
    }
  };
  const encode = (frame) => {
    if (!closed(frame)) return undefined;
    try {
      const encoded = JSON.stringify(frame);
      return new TextEncoder().encode(encoded).byteLength <= 5242880 ? encoded : undefined;
    } catch {
      return undefined;
    }
  };
  const bridge = Object.freeze({
    bootstrap,
    send(frame) {
      const encoded = encode(frame);
      if (encoded === undefined || rawPost === undefined) return false;
      const closeRequest = frame.type === 'lensx.plugin_bridge.request' && frame.request?.method === 'ui.close';
      if (closeRequest && pendingClose.size < MAX_PENDING_CLOSE_RECEIPTS) pendingClose.add(frame.request_id);
      if (frame.type === 'lensx.plugin_bridge.cancel') pendingClose.delete(frame.request_id);
      if (frame.type === 'lensx.plugin_bridge.disconnect') pendingClose.clear();
      try { rawPost(encoded); } catch {
        if (frame.type === 'lensx.plugin_bridge.request') pendingClose.delete(frame.request_id);
        return false;
      }
      return true;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return undefined;
      listeners.add(listener);
      return Object.freeze(() => listeners.delete(listener));
    }
  });
  const deliver = Object.freeze((frame) => {
    if (!closed(frame) || listeners.size === 0) return false;
    const closeSuccess = frame.type === 'lensx.plugin_bridge.response' && frame.result?.method === 'ui.close';
    if (closeSuccess && !pendingClose.has(frame.request_id)) return false;
    let accepted = false;
    for (const listener of [...listeners]) {
      try { listener(frame); accepted = true; } catch {}
    }
    if (accepted && frame.type === 'lensx.plugin_bridge.response') pendingClose.delete(frame.request_id);
    if (frame.type === 'lensx.plugin_bridge.disconnect') pendingClose.clear();
    return accepted;
  });
  Object.defineProperty(globalThis, '__LENSX_PLUGIN_WEBVIEW_BRIDGE__', {
    value: bridge,
    enumerable: false,
    configurable: false,
    writable: false
  });
  Object.defineProperty(globalThis, '__LENSX_PLUGIN_WEBVIEW_DELIVER__', {
    value: deliver,
    enumerable: false,
    configurable: false,
    writable: false
  });
})();
"#;

fn plugin_child_webview_bridge_bootstrap(freshness: &str) -> Option<String> {
    valid_bridge_freshness(freshness).then(|| {
        PLUGIN_CHILD_WEBVIEW_BRIDGE_BOOTSTRAP.replace("__LENSX_BRIDGE_FRESHNESS__", freshness)
    })
}

fn valid_bridge_freshness(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

#[derive(Clone, Copy, Debug)]
pub struct PluginChildWebviewBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug)]
pub struct PluginChildWebviewAdapterError {
    code: &'static str,
}

impl PluginChildWebviewAdapterError {
    fn new(code: &'static str) -> Self {
        Self { code }
    }

    pub fn code(self) -> &'static str {
        self.code
    }
}

impl fmt::Display for PluginChildWebviewAdapterError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code)
    }
}

impl std::error::Error for PluginChildWebviewAdapterError {}

#[allow(dead_code)] // Task 2.7 connects the verified boundary to product WebView creation.
pub(crate) trait PluginChildWebviewCurrentSource: Send + Sync + 'static {
    fn is_current_source(&self, attempt_id: &str, source_label: &str) -> bool;
}

#[allow(dead_code)] // Task 2.7+ creation wiring consumes this source-bound ingress hook.
pub(crate) trait PluginChildWebviewBridgeIngress: Send + Sync + 'static {
    fn receive(&self, attempt_id: &str, actual_source_label: &str, body: &str);
}

#[allow(dead_code)] // Product creation wiring consumes the verified native load callback.
pub(crate) trait PluginChildWebviewLifecycleIngress: Send + Sync + 'static {
    fn native_loaded(&self, attempt_id: &str, actual_source_label: &str);
}

#[allow(dead_code)] // Product creation wiring follows after the bridge/session state is complete.
pub(crate) fn apply_plugin_child_webview_bridge_ingress<R: Runtime>(
    builder: WebviewBuilder<R>,
    attempt_id: String,
    freshness: &str,
    ingress: Arc<dyn PluginChildWebviewBridgeIngress>,
) -> Option<WebviewBuilder<R>> {
    let bootstrap = plugin_child_webview_bridge_bootstrap(freshness)?;
    Some(
        builder
            .initialization_script(bootstrap)
            .isolated_ipc_handler(move |actual_source_label, request| {
                ingress.receive(&attempt_id, &actual_source_label, request.body());
            }),
    )
}

#[allow(dead_code)] // Product creation wiring follows after the bridge/session state is complete.
pub(crate) fn apply_plugin_child_webview_load_ingress<R: Runtime>(
    builder: WebviewBuilder<R>,
    attempt_id: String,
    ingress: Arc<dyn PluginChildWebviewLifecycleIngress>,
) -> WebviewBuilder<R> {
    builder.on_page_load(move |webview, payload| {
        if payload.event() == PageLoadEvent::Finished {
            ingress.native_loaded(&attempt_id, webview.label());
        }
    })
}

pub(crate) struct PluginChildWebviewProductInput {
    pub(crate) attempt_id: String,
    pub(crate) source_label: String,
    pub(crate) exact_entry: Url,
    pub(crate) host_route: String,
    pub(crate) freshness: String,
    pub(crate) data_store_identifier: [u8; 16],
    pub(crate) bounds: PluginChildWebviewBounds,
}

pub(crate) fn create_plugin_child_webview<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    input: PluginChildWebviewProductInput,
    current_source: Arc<dyn PluginChildWebviewCurrentSource>,
    bridge_ingress: Arc<dyn PluginChildWebviewBridgeIngress>,
    lifecycle_ingress: Arc<dyn PluginChildWebviewLifecycleIngress>,
) -> Result<PluginChildWebviewHandle<R>, PluginChildWebviewAdapterError> {
    let parent = app
        .get_window(parent_label)
        .ok_or_else(|| PluginChildWebviewAdapterError::new("parent_unavailable"))?;
    let policy = PluginChildWebviewNavigationPolicy::new(
        input.attempt_id.clone(),
        input.source_label.clone(),
        input.exact_entry.clone(),
        &input.host_route,
    )
    .ok_or_else(|| PluginChildWebviewAdapterError::new("invalid_product_input"))?;
    let mut routed_entry = input.exact_entry.clone();
    routed_entry.set_fragment(Some(&input.host_route));
    let builder = WebviewBuilder::new(&input.source_label, WebviewUrl::External(routed_entry))
        .data_store_identifier(input.data_store_identifier)
        .incognito(true)
        .isolated_uri_scheme_protocols([input.exact_entry.scheme()]);
    let builder = apply_plugin_child_webview_bridge_ingress(
        builder,
        input.attempt_id.clone(),
        &input.freshness,
        bridge_ingress,
    )
    .ok_or_else(|| PluginChildWebviewAdapterError::new("invalid_bridge_freshness"))?;
    let builder = apply_plugin_child_webview_load_ingress(
        apply_plugin_child_webview_navigation_boundary(builder, policy, current_source),
        input.attempt_id,
        lifecycle_ingress,
    );
    let webview = parent
        .add_child(
            builder,
            PhysicalPosition::new(input.bounds.x, input.bounds.y),
            PhysicalSize::new(input.bounds.width, input.bounds.height),
        )
        .map_err(|_| PluginChildWebviewAdapterError::new("create_failed"))?;
    if webview.hide().is_err() {
        let _ = webview.close();
        return Err(PluginChildWebviewAdapterError::new("initial_hide_failed"));
    }
    Ok(PluginChildWebviewHandle::new(webview))
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[allow(dead_code)] // Task 2.7 connects the verified boundary to product WebView creation.
pub(crate) struct PluginChildWebviewNavigationPolicy {
    attempt_id: String,
    source_label: String,
    exact_entry: Url,
    routed_entry: Url,
}

impl PluginChildWebviewNavigationPolicy {
    #[allow(dead_code)] // Task 2.7 connects the verified boundary to product WebView creation.
    pub(crate) fn new(
        attempt_id: impl Into<String>,
        source_label: impl Into<String>,
        exact_entry: Url,
        host_route: &str,
    ) -> Option<Self> {
        let attempt_id = attempt_id.into();
        let source_label = source_label.into();
        if !valid_attempt_id(&attempt_id)
            || !valid_source_label(&source_label)
            || parse_plugin_resource_url(exact_entry.as_str(), false).is_none()
            || !valid_host_route(host_route)
        {
            return None;
        }
        let mut routed_entry = exact_entry.clone();
        routed_entry.set_fragment(Some(host_route));
        Some(Self {
            attempt_id,
            source_label,
            exact_entry,
            routed_entry,
        })
    }

    #[allow(dead_code)] // Task 2.7 connects the verified boundary to product WebView creation.
    fn allows_top_level(&self, candidate: &Url) -> bool {
        candidate == &self.exact_entry || candidate == &self.routed_entry
    }
}

#[allow(dead_code)] // Task 2.7 connects the verified boundary to product WebView creation.
pub(crate) fn apply_plugin_child_webview_navigation_boundary<R: Runtime>(
    builder: WebviewBuilder<R>,
    policy: PluginChildWebviewNavigationPolicy,
    current_source: Arc<dyn PluginChildWebviewCurrentSource>,
) -> WebviewBuilder<R> {
    builder
        .on_navigation(move |candidate| {
            current_source.is_current_source(&policy.attempt_id, &policy.source_label)
                && policy.allows_top_level(candidate)
        })
        .on_new_window(|_url, _features| NewWindowResponse::Deny)
        .on_download(|_webview, event| {
            match event {
                DownloadEvent::Requested { .. } | DownloadEvent::Finished { .. } => {}
                _ => {}
            }
            false
        })
}

fn valid_attempt_id(value: &str) -> bool {
    value.strip_prefix("attempt_").is_some_and(|hexadecimal| {
        hexadecimal.len() == 16
            && hexadecimal
                .bytes()
                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    })
}

pub(crate) fn valid_source_label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

pub(crate) fn valid_host_route(value: &str) -> bool {
    if value.is_empty()
        || value.len() > 512
        || !value.starts_with('/')
        || value.starts_with("//")
        || !value.is_ascii()
        || value.bytes().any(|byte| byte.is_ascii_control())
        || value.contains(['\\', '?', '#'])
        || value.contains("://")
    {
        return false;
    }
    value[1..].split('/').enumerate().all(|(index, segment)| {
        (segment.is_empty() && index == value[1..].split('/').count() - 1)
            || (!segment.is_empty() && !matches!(segment, "." | ".."))
    })
}

pub(crate) trait PluginChildWebviewNativeHandle: Send + Sync + 'static {
    fn present_owned(
        &self,
        _expected_window: &str,
        guard: &NativeExecutionGuard,
        operation: NativePresentationOperation,
    ) -> NativePresentationOutcome {
        perform_owned_presentation(guard, operation, |step| match step {
            NativePresentationStep::ConfirmClip => self.ensure_rounded_corners(),
            NativePresentationStep::HideUnconfirmed => self.hide_unconfirmed_content(),
            NativePresentationStep::Apply(NativePresentationOperation::Bounds {
                x,
                y,
                width,
                height,
            }) => self.update_bounds(x, y, width, height),
            NativePresentationStep::Apply(NativePresentationOperation::Show) => self.show(),
            NativePresentationStep::Apply(NativePresentationOperation::Hide) => self.hide(),
            NativePresentationStep::Apply(NativePresentationOperation::Focus) => self.focus(),
        })
    }
    fn source_label(&self) -> String;
    fn ensure_rounded_corners(&self) -> Result<(), ()>;
    fn hide_unconfirmed_content(&self) -> Result<(), ()>;
    fn update_bounds(&self, x: i32, y: i32, width: u32, height: u32) -> Result<(), ()>;
    fn show(&self) -> Result<(), ()>;
    fn hide(&self) -> Result<(), ()>;
    fn focus(&self) -> Result<(), ()>;
    fn deliver_bridge_frame(&self, frame: &Value) -> Result<(), ()>;
    fn deliver_bridge_frame_confirmed(
        &self,
        frame: &Value,
        guard: NativeExecutionGuard,
    ) -> Result<(), ()> {
        if !guard.is_current() {
            return Err(());
        }
        self.deliver_bridge_frame(frame)?;
        guard.is_current().then_some(()).ok_or(())
    }
    fn destroy(&self) -> Result<(), ()>;
}

#[allow(dead_code)] // Product construction is connected by the subsequent Child WebView service tasks.
pub(crate) struct PluginChildWebviewHandle<R: Runtime> {
    webview: Webview<R>,
    destroyed: AtomicBool,
}

#[allow(dead_code)] // Product construction is connected by the subsequent Child WebView service tasks.
impl<R: Runtime> PluginChildWebviewHandle<R> {
    pub(crate) fn new(webview: Webview<R>) -> Self {
        Self {
            webview,
            destroyed: AtomicBool::new(false),
        }
    }
    pub(crate) fn webview(&self) -> Webview<R> {
        self.webview.clone()
    }
    pub(crate) fn destroyed_confirmed(&self) -> bool {
        self.destroyed.load(Ordering::Acquire)
    }
}

impl<R: Runtime> PluginChildWebviewNativeHandle for PluginChildWebviewHandle<R> {
    fn present_owned(
        &self,
        expected_window: &str,
        guard: &NativeExecutionGuard,
        operation: NativePresentationOperation,
    ) -> NativePresentationOutcome {
        #[cfg(target_os = "macos")]
        {
            let webview = self.webview.clone();
            let expected_window = expected_window.to_owned();
            crate::plugin_child_webview_execution::confirm_native_execution(
                guard,
                std::time::Duration::from_secs(5),
                objc2::MainThreadMarker::new().is_some(),
                |job| self.webview.run_on_main_thread(job).map_err(|_| ()),
                move |guard| {
                    execute_owned_presentation_on_main_thread(
                        &webview,
                        &expected_window,
                        guard,
                        operation,
                    )
                },
            )
        }
        #[cfg(not(target_os = "macos"))]
        {
            if self.webview.window().label() != expected_window {
                return NativePresentationOutcome::Stale;
            }
            perform_owned_presentation(guard, operation, |step| match step {
                NativePresentationStep::ConfirmClip => self.ensure_rounded_corners(),
                NativePresentationStep::HideUnconfirmed => self.hide_unconfirmed_content(),
                NativePresentationStep::Apply(NativePresentationOperation::Bounds {
                    x,
                    y,
                    width,
                    height,
                }) => self.update_bounds(x, y, width, height),
                NativePresentationStep::Apply(NativePresentationOperation::Show) => self.show(),
                NativePresentationStep::Apply(NativePresentationOperation::Hide) => self.hide(),
                NativePresentationStep::Apply(NativePresentationOperation::Focus) => self.focus(),
            })
        }
    }

    fn ensure_rounded_corners(&self) -> Result<(), ()> {
        let parent = self.webview.window();
        crate::launcher_rounded_corners::ensure_launcher_rounded_corners(&parent).map_err(|_| ())
    }

    fn hide_unconfirmed_content(&self) -> Result<(), ()> {
        // Called only after the registry rechecks this current attempt. An
        // unconfirmed common container cannot safely present Host or Child.
        let child = self.webview.hide().map_err(|_| ());
        let parent = self.webview.window().hide().map_err(|_| ());
        child.and(parent)
    }

    fn source_label(&self) -> String {
        self.webview.label().to_owned()
    }

    fn update_bounds(&self, x: i32, y: i32, width: u32, height: u32) -> Result<(), ()> {
        self.webview
            .set_bounds(Rect {
                position: Position::Physical(PhysicalPosition::new(x, y)),
                size: Size::Physical(PhysicalSize::new(width, height)),
            })
            .map_err(|_| ())
    }

    fn show(&self) -> Result<(), ()> {
        self.webview.show().map_err(|_| ())
    }

    fn hide(&self) -> Result<(), ()> {
        self.webview.hide().map_err(|_| ())
    }

    fn focus(&self) -> Result<(), ()> {
        self.webview.set_focus().map_err(|_| ())
    }

    fn deliver_bridge_frame(&self, frame: &Value) -> Result<(), ()> {
        deliver_structured_plugin_child_webview_frame(&self.webview, frame).map_err(|_| ())
    }

    fn deliver_bridge_frame_confirmed(
        &self,
        frame: &Value,
        guard: NativeExecutionGuard,
    ) -> Result<(), ()> {
        deliver_confirmed_structured_frame(&self.webview, frame, guard)
    }

    fn destroy(&self) -> Result<(), ()> {
        #[cfg(target_os = "macos")]
        {
            let closed = self.webview.close_confirmed().map_err(|_| ())?;
            if closed {
                self.destroyed.store(true, Ordering::Release);
                Ok(())
            } else {
                Err(())
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            self.webview.close().map_err(|_| ())
        }
    }
}

#[cfg(target_os = "macos")]
fn execute_owned_presentation_on_main_thread<R: Runtime>(
    webview: &Webview<R>,
    expected_window: &str,
    guard: &NativeExecutionGuard,
    operation: NativePresentationOperation,
) -> NativePresentationOutcome {
    use objc2_app_kit::{NSView, NSWindow};
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use objc2_web_kit::WKWebView;

    if objc2::MainThreadMarker::new().is_none() || !guard.is_current() {
        return NativePresentationOutcome::Stale;
    }
    let window = webview.window();
    if window.label() != expected_window {
        return NativePresentationOutcome::Stale;
    }
    let Ok(expected_native_window) = window.ns_window() else {
        return NativePresentationOutcome::Failed;
    };
    let expected_native_window = expected_native_window as usize;
    let guard = guard.clone();
    let completion_guard = guard.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    // Already on the main thread: Tauri executes with_webview synchronously.
    // The result is read without waiting, so a runtime that fails to execute the
    // callback cannot deadlock the UI thread or be mistaken for native success.
    if webview
        .with_webview(move |platform| {
            // SAFETY: Tauri supplies the current WKWebView on its native UI thread.
            let view: &WKWebView = unsafe { &*platform.inner().cast() };
            let Some(native_window) = view.window() else {
                let _ = sender.send(NativePresentationOutcome::Stale);
                return;
            };
            if (&*native_window as *const NSWindow as usize) != expected_native_window {
                let _ = sender.send(NativePresentationOutcome::Stale);
                return;
            }
            let owns_focus = || {
                native_window.firstResponder().is_some_and(|responder| {
                    responder.downcast_ref::<NSView>().is_some_and(|focused| {
                        focused
                            .window()
                            .is_some_and(|owner| std::ptr::eq(&*owner, &*native_window))
                            && !focused.isHiddenOrHasHiddenAncestor()
                            && focused.isDescendantOf(view)
                    })
                })
            };
            let mut focus_unavailable = None;
            let result = perform_owned_presentation(&guard, operation, |step| {
                if !guard.is_current() {
                    return Err(());
                }
                match step {
                    NativePresentationStep::ConfirmClip => {
                        crate::launcher_rounded_corners::ensure_launcher_rounded_corners(&window)
                            .map_err(|_| ())
                    }
                    NativePresentationStep::HideUnconfirmed => {
                        view.setHidden(true);
                        if !guard.is_current() {
                            return Err(());
                        }
                        native_window.orderOut(None);
                        if !guard.is_current() {
                            return Err(());
                        }
                        (view.isHidden() && !native_window.isVisible())
                            .then_some(())
                            .ok_or(())
                    }
                    NativePresentationStep::Apply(NativePresentationOperation::Bounds {
                        x,
                        y,
                        width,
                        height,
                    }) => {
                        // SAFETY: the main-thread callback holds a live WKWebView.
                        let parent = unsafe { view.superview() }.ok_or(())?;
                        let [x, y, width, height] =
                            crate::plugin_child_webview_execution::logical_child_frame(
                                x,
                                y,
                                width,
                                height,
                                native_window.backingScaleFactor(),
                                parent.frame().size.height,
                                parent.isFlipped(),
                            )
                            .ok_or(())?;
                        let expected = NSRect::new(NSPoint::new(x, y), NSSize::new(width, height));
                        if !guard.is_current() {
                            return Err(());
                        }
                        view.setFrame(expected);
                        if !guard.is_current() {
                            return Err(());
                        }
                        (view.frame() == expected).then_some(()).ok_or(())
                    }
                    NativePresentationStep::Apply(NativePresentationOperation::Show) => {
                        view.setHidden(false);
                        if !guard.is_current() {
                            return Err(());
                        }
                        (!view.isHidden()).then_some(()).ok_or(())
                    }
                    NativePresentationStep::Apply(NativePresentationOperation::Hide) => {
                        view.setHidden(true);
                        if !guard.is_current() {
                            return Err(());
                        }
                        view.isHidden().then_some(()).ok_or(())
                    }
                    NativePresentationStep::Apply(NativePresentationOperation::Focus) => {
                        if view.isHiddenOrHasHiddenAncestor() || !native_window.isVisible() {
                            return Err(());
                        }
                        if !native_window.isKeyWindow() {
                            focus_unavailable = Some(true);
                            return Err(());
                        }
                        // Preserve a valid input responder already inside the Child.
                        if owns_focus() {
                            return Ok(());
                        }
                        if !guard.is_current() {
                            return Err(());
                        }
                        if !native_window.makeFirstResponder(Some(view)) {
                            focus_unavailable = Some(false);
                            return Err(());
                        }
                        if !guard.is_current() {
                            return Err(());
                        }
                        if owns_focus() {
                            Ok(())
                        } else {
                            focus_unavailable = Some(false);
                            Err(())
                        }
                    }
                }
            });
            // A visible attached WebView can remain healthy while AppKit is
            // choosing the key window or its responder refuses a focus request.
            let outcome = match (result, focus_unavailable) {
                (NativePresentationOutcome::Failed, Some(awaiting_key)) => {
                    NativePresentationOutcome::FocusUnavailable { awaiting_key }
                }
                _ => result,
            };
            let _ = sender.send(outcome);
        })
        .is_err()
    {
        completion_guard.expire();
        return NativePresentationOutcome::Failed;
    }
    let outcome = receiver
        .try_recv()
        .unwrap_or(NativePresentationOutcome::Failed);
    completion_guard.expire();
    outcome
}

#[cfg(target_os = "macos")]
fn deliver_structured_plugin_child_webview_frame<R: Runtime>(
    webview: &Webview<R>,
    frame: &Value,
) -> Result<(), PluginChildWebviewAdapterError> {
    use objc2::{runtime::AnyObject, AnyThread, MainThreadMarker};
    use objc2_foundation::{
        NSData, NSDictionary, NSJSONReadingOptions, NSJSONSerialization, NSString,
    };
    use objc2_web_kit::{WKContentWorld, WKWebView};

    const DELIVERY_BODY: &str = "return globalThis.__LENSX_PLUGIN_WEBVIEW_DELIVER__(frame);";
    let encoded = serde_json::to_vec(frame)
        .map_err(|_| PluginChildWebviewAdapterError::new("bridge_delivery_encode_failed"))?;
    if encoded.len() > crate::plugin_child_webview_rpc::PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES {
        return Err(PluginChildWebviewAdapterError::new(
            "bridge_delivery_frame_limit_exceeded",
        ));
    }
    webview
        .with_webview_data(move |platform| {
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            // SAFETY: Tauri invokes this closure on the WebView UI thread; the platform handle is
            // the current WKWebView. JSON is decoded into a Foundation object and passed through
            // WebKit's structured argument dictionary, never interpolated into JavaScript source.
            unsafe {
                let data = NSData::initWithBytes_length(
                    NSData::alloc(),
                    encoded.as_ptr().cast(),
                    encoded.len(),
                );
                let Ok(frame_object) = NSJSONSerialization::JSONObjectWithData_options_error(
                    &data,
                    NSJSONReadingOptions::FragmentsAllowed,
                ) else {
                    return;
                };
                let key = NSString::from_str("frame");
                let arguments =
                    NSDictionary::<NSString, AnyObject>::from_slices(&[&*key], &[&*frame_object]);
                let wk_webview: &WKWebView = &*platform.inner().cast();
                let world = WKContentWorld::pageWorld(mtm);
                wk_webview.callAsyncJavaScript_arguments_inFrame_inContentWorld_completionHandler(
                    &NSString::from_str(DELIVERY_BODY),
                    Some(&arguments),
                    None,
                    &world,
                    None,
                );
            }
        })
        .map_err(|_| PluginChildWebviewAdapterError::new("bridge_delivery_unavailable"))
}

#[cfg(target_os = "macos")]
fn deliver_confirmed_structured_frame<R: Runtime>(
    webview: &Webview<R>,
    frame: &Value,
    guard: NativeExecutionGuard,
) -> Result<(), ()> {
    use objc2::{runtime::AnyObject, AnyThread, MainThreadMarker};
    use objc2_foundation::{
        NSData, NSDictionary, NSError, NSJSONReadingOptions, NSJSONSerialization, NSNumber,
        NSString,
    };
    use objc2_web_kit::{WKContentWorld, WKWebView};
    // Awaiting WebKit completion on its own thread would deadlock. The dispatcher
    // invokes this narrow path from a worker after releasing its registry mutex.
    if MainThreadMarker::new().is_some() || !guard.is_current() {
        return Err(());
    }
    let encoded = serde_json::to_vec(frame).map_err(|_| ())?;
    if encoded.len() > crate::plugin_child_webview_rpc::PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES {
        return Err(());
    }
    let timeout = guard.remaining_timeout(std::time::Duration::from_secs(5));
    if timeout.is_zero() {
        return Err(());
    }
    let guard = guard.with_deadline(timeout);
    let execution = guard.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    let cancellation = sender.clone();
    guard.on_expire(move || {
        let _ = cancellation.send(Err(()));
    });
    webview
        .with_webview_data(move |platform| {
            let Some(marker) = MainThreadMarker::new() else {
                let _ = sender.send(Err(()));
                return;
            };
            if !execution.is_current() {
                let _ = sender.send(Err(()));
                return;
            }
            unsafe {
                let data = NSData::initWithBytes_length(
                    NSData::alloc(),
                    encoded.as_ptr().cast(),
                    encoded.len(),
                );
                let Ok(object) = NSJSONSerialization::JSONObjectWithData_options_error(
                    &data,
                    NSJSONReadingOptions::FragmentsAllowed,
                ) else {
                    let _ = sender.send(Err(()));
                    return;
                };
                let key = NSString::from_str("frame");
                let arguments =
                    NSDictionary::<NSString, AnyObject>::from_slices(&[&*key], &[&*object]);
                let view: &WKWebView = &*platform.inner().cast();
                let world = WKContentWorld::pageWorld(marker);
                let completion =
                    block2::RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
                        let accepted = execution.is_current()
                            && error.is_null()
                            && result
                                .as_ref()
                                .and_then(|object| object.downcast_ref::<NSNumber>())
                                .is_some_and(|number| number.boolValue());
                        let _ = sender.send(accepted.then_some(()).ok_or(()));
                    });
                view.callAsyncJavaScript_arguments_inFrame_inContentWorld_completionHandler(
                    &NSString::from_str(
                        "return globalThis.__LENSX_PLUGIN_WEBVIEW_DELIVER__(frame) === true;",
                    ),
                    Some(&arguments),
                    None,
                    &world,
                    Some(&completion),
                );
            }
        })
        .map_err(|_| ())?;
    match receiver.recv_timeout(timeout) {
        Ok(result) if guard.is_current() => result,
        _ => {
            guard.expire();
            Err(())
        }
    }
}
#[cfg(not(target_os = "macos"))]
fn deliver_confirmed_structured_frame<R: Runtime>(
    _webview: &Webview<R>,
    _frame: &Value,
    _guard: NativeExecutionGuard,
) -> Result<(), ()> {
    Err(())
}

#[cfg(not(target_os = "macos"))]
fn deliver_structured_plugin_child_webview_frame<R: Runtime>(
    _webview: &Webview<R>,
    _frame: &Value,
) -> Result<(), PluginChildWebviewAdapterError> {
    Err(PluginChildWebviewAdapterError::new(
        "bridge_delivery_unsupported_platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ENTRY: &str = "lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d65/1.2.3/dist/index.html";

    fn policy() -> PluginChildWebviewNavigationPolicy {
        PluginChildWebviewNavigationPolicy::new(
            "attempt_0000000000000001",
            "plugin-child-1",
            Url::parse(ENTRY).expect("entry parses"),
            "/settings",
        )
        .expect("navigation policy should be valid")
    }

    #[test]
    fn production_plugins_use_a_fresh_nonpersistent_native_store_without_sdk_changes() {
        let source = include_str!("plugin_child_webview_adapter.rs");
        let product = source
            .split("pub(crate) fn create_plugin_child_webview")
            .nth(1)
            .unwrap()
            .split("pub(crate) trait PluginChildWebviewNativeHandle")
            .next()
            .unwrap();
        assert!(product.contains(".incognito(true)"));
        assert!(product.contains(".data_store_identifier(input.data_store_identifier)"));
        assert!(!product.contains("background_throttling"));
        let native = include_str!("../../vendor/frame-aware-navigation/wry/src/wkwebview/mod.rs");
        let choice = native
            .split("let data_store = match (")
            .nth(1)
            .expect("native data store selector")
            .split("config.setWebsiteDataStore")
            .next()
            .unwrap();
        assert!(choice.contains("attributes.incognito"));
        let ephemeral = choice
            .find("(true, _, _) => WKWebsiteDataStore::nonPersistentDataStore(mtm)")
            .expect("fresh ephemeral store has first priority");
        let persistent = choice
            .find("(false, true, Some(data_store))")
            .expect("conditional persistent store branch");
        let default = choice
            .find("_ => WKWebsiteDataStore::defaultDataStore(mtm)")
            .expect("ordinary fallback");
        assert!(ephemeral < persistent && persistent < default);
    }

    #[test]
    fn exact_entry_and_host_derived_same_document_route_are_the_only_commits() {
        let policy = policy();
        for allowed in [ENTRY.to_owned(), format!("{ENTRY}#/settings")] {
            assert!(
                policy.allows_top_level(&Url::parse(&allowed).expect("allowed target parses")),
                "target should be allowed: {allowed}"
            );
        }
        for denied in [
            format!("{ENTRY}#/other"),
            format!("{ENTRY}?query=1"),
            ENTRY.replace("dist/index.html", "dist/other.html"),
            ENTRY.replace(
                "0123456789abcdef0123456789abcdef",
                "fedcba9876543210fedcba9876543210",
            ),
            "https://example.invalid/".to_owned(),
            "file:///tmp/plugin.html".to_owned(),
            "javascript:void(0)".to_owned(),
            "data:text/html,denied".to_owned(),
            "blob:https://example.invalid/id".to_owned(),
        ] {
            assert!(
                !policy.allows_top_level(&Url::parse(&denied).expect("denied target parses")),
                "target should be denied: {denied}"
            );
        }
    }

    #[test]
    fn invalid_entry_route_attempt_and_source_binding_fail_closed() {
        let entry = Url::parse(ENTRY).expect("entry parses");
        for route in [
            "",
            "settings",
            "//settings",
            "/../settings",
            "/a//b",
            "/a?b",
            "/a#b",
        ] {
            assert!(PluginChildWebviewNavigationPolicy::new(
                "attempt_0000000000000001",
                "plugin-child-1",
                entry.clone(),
                route,
            )
            .is_none());
        }
        assert!(PluginChildWebviewNavigationPolicy::new(
            "attempt_1",
            "plugin-child-1",
            entry.clone(),
            "/",
        )
        .is_none());
        assert!(PluginChildWebviewNavigationPolicy::new(
            "attempt_0000000000000001",
            "plugin/child",
            entry,
            "/",
        )
        .is_none());
        assert!(PluginChildWebviewNavigationPolicy::new(
            "attempt_0000000000000001",
            "plugin-child-1",
            Url::parse("https://example.invalid/index.html").expect("remote URL parses"),
            "/",
        )
        .is_none());
    }

    #[test]
    fn production_bridge_bootstrap_exposes_only_the_rpc_bridge() {
        let bootstrap = plugin_child_webview_bridge_bootstrap(BRIDGE_PROBE_FRESHNESS)
            .expect("maintained bridge freshness should build");
        assert!(!bootstrap.contains("elementFromPoint"));
        assert!(!bootstrap.contains("mousemove"));
        assert!(!bootstrap.contains("native_cursor"));
    }
}
