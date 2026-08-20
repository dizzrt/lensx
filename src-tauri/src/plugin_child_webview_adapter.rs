use crate::plugin_resource_url::parse_plugin_resource_url;
use serde_json::Value;
use std::{fmt, sync::Arc};
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
      rawPost(encoded);
      return true;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return undefined;
      listeners.add(listener);
      return Object.freeze(() => listeners.delete(listener));
    }
  });
  const deliver = Object.freeze((frame) => {
    if (!closed(frame)) return false;
    for (const listener of [...listeners]) {
      try { listener(frame); } catch {}
    }
    return true;
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
        .get_webview_window(parent_label)
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
        .as_ref()
        .window()
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
    fn source_label(&self) -> String;
    fn update_bounds(&self, x: i32, y: i32, width: u32, height: u32) -> Result<(), ()>;
    fn show(&self) -> Result<(), ()>;
    fn hide(&self) -> Result<(), ()>;
    fn focus(&self) -> Result<(), ()>;
    fn deliver_bridge_frame(&self, frame: &Value) -> Result<(), ()>;
    fn destroy(&self) -> Result<(), ()>;
}

#[allow(dead_code)] // Product construction is connected by the subsequent Child WebView service tasks.
pub(crate) struct PluginChildWebviewHandle<R: Runtime> {
    webview: Webview<R>,
}

#[allow(dead_code)] // Product construction is connected by the subsequent Child WebView service tasks.
impl<R: Runtime> PluginChildWebviewHandle<R> {
    pub(crate) fn new(webview: Webview<R>) -> Self {
        Self { webview }
    }
}

impl<R: Runtime> PluginChildWebviewNativeHandle for PluginChildWebviewHandle<R> {
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

    fn destroy(&self) -> Result<(), ()> {
        self.webview.close().map_err(|_| ())
    }
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
        .with_webview(move |platform| {
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
