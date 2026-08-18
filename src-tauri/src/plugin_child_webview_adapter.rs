use crate::plugin_resource_url::parse_plugin_resource_url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fmt,
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position,
    Rect, Runtime, Size, Webview, WebviewUrl,
};
use url::Url;

const LOAD_DEADLINE: Duration = Duration::from_secs(8);
const DESTROY_DEADLINE: Duration = Duration::from_secs(2);
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

#[cfg(feature = "config-lens-cold-open-harness")]
const PLUGIN_CHILD_WEBVIEW_EVIDENCE_BOOTSTRAP: &str = r#"
(() => {
  'use strict';
  const rawPost = globalThis.ipc && typeof globalThis.ipc.postMessage === 'function'
    ? globalThis.ipc.postMessage.bind(globalThis.ipc)
    : undefined;
  const stages = new Set(['ui_bundle', 'editor', 'worker', 'first_interactive']);
  const pointerRegions = Object.freeze([
    ['gutter', '.margin, [data-pointer-region="gutter"]'],
    ['scrollbar', '.scrollbar, [data-pointer-region="scrollbar"]'],
    ['footer_control', 'button, [role="button"], [data-pointer-region="footer_control"]'],
    ['link', 'a, [data-pointer-region="link"]'],
    ['overlay', '.overlayWidgets, .suggest-widget, [data-pointer-region="overlay"]'],
    ['editor_text', '.view-lines, .view-line, textarea.inputarea, .monaco-editor, [data-pointer-region="editor_text"]']
  ]);
  let pointerMoveDeliveryCount = 0;
  addEventListener('mousemove', () => {
    pointerMoveDeliveryCount = Math.min(pointerMoveDeliveryCount + 1, 256);
  }, { capture: true });
  const send = (payload) => {
    const encoded = JSON.stringify(payload);
    if (rawPost !== undefined) rawPost(encoded);
    if (rawPost === undefined || location.protocol === 'lensx-pointer-monaco:'
      || location.protocol === 'lensx-pointer-plain:') {
      document.title = `lensx-pointer:${encoded}`;
    }
  };
  const report = (stage, duration_ms) => {
    if (rawPost === undefined || !stages.has(stage) || typeof duration_ms !== 'number'
      || !Number.isFinite(duration_ms) || duration_ms < 0 || duration_ms > 60000) return;
    rawPost(JSON.stringify({
      contract_version: '0.1.0',
      type: 'lensx.plugin_evidence.stage',
      stage,
      duration_ms
    }));
  };
  const reportPointer = (sequence, x, y) => {
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 256
      || !Number.isFinite(x) || !Number.isFinite(y)
      || x < 0 || x > 4096 || y < 0 || y > 2160) return;
    const target = document.elementFromPoint(x, y);
    let semanticRegion = 'overlay';
    if (target !== null) {
      for (const [region, selector] of pointerRegions) {
        if (target.closest(selector) !== null) {
          semanticRegion = region;
          break;
        }
      }
    }
    const computedCursor = target === null ? 'unknown' : getComputedStyle(target).cursor;
    send({
      contract_version: '0.1.0',
      type: 'lensx.plugin_evidence.pointer',
      sequence,
      semantic_region: semanticRegion,
      computed_cursor: /^[a-z-]{1,32}$/.test(computedCursor) ? computedCursor : 'unknown',
      document_identity: document === globalThis.document ? 'document_current' : 'document_unknown',
      editor_identity: document.querySelector('.monaco-editor') === null ? 'not_applicable' : 'editor_current',
      webkit_version: navigator.userAgent.match(/AppleWebKit\/([0-9.]+)/)?.[1] || 'unknown',
      device_scale_factor: devicePixelRatio,
      viewport_width: innerWidth,
      viewport_height: innerHeight,
      move_delivery_count: pointerMoveDeliveryCount
    });
  };
  Object.defineProperty(globalThis, '__LENSX_PLUGIN_EVIDENCE_STAGE__', {
    value: Object.freeze(report),
    enumerable: false,
    configurable: false,
    writable: false
  });
  Object.defineProperty(globalThis, '__LENSX_PLUGIN_EVIDENCE_SAMPLE_POINTER__', {
    value: Object.freeze(reportPointer),
    enumerable: false,
    configurable: false,
    writable: false
  });
  Object.defineProperty(globalThis, '__LENSX_PLUGIN_EVIDENCE_RESET_MOVE_DELIVERY__', {
    value: Object.freeze(() => { pointerMoveDeliveryCount = 0; }),
    enumerable: false,
    configurable: false,
    writable: false
  });
})();
"#;

#[cfg(feature = "config-lens-cold-open-harness")]
const PLUGIN_CHILD_WEBVIEW_EVIDENCE_BOUNDARIES: &str = r#"
(() => {
  'use strict';
  const install = () => {
    if (document.querySelector('[data-lensx-pointer-boundaries]') !== null) return;
    const container = document.createElement('div');
    container.dataset.lensxPointerBoundaries = 'controlled';
    const boundaries = Object.freeze([
      ['scrollbar', 'position:fixed;z-index:2147483640;top:0;right:0;width:40px;height:520px;cursor:default'],
      ['footer_control', 'position:fixed;z-index:2147483641;top:532px;left:660px;width:100px;height:36px;cursor:default'],
      ['link', 'position:fixed;z-index:2147483641;top:548px;left:510px;width:100px;height:20px;cursor:pointer'],
      ['overlay', 'position:fixed;z-index:2147483642;top:60px;left:60px;width:700px;height:24px;cursor:default']
    ]);
    for (const [region, cssText] of boundaries) {
      const boundary = document.createElement('div');
      boundary.dataset.pointerRegion = region;
      boundary.setAttribute('aria-hidden', 'true');
      boundary.style.cssText = `${cssText};background:transparent`;
      container.append(boundary);
    }
    document.body.append(container);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
"#;

#[cfg(feature = "config-lens-cold-open-harness")]
pub(crate) fn plugin_child_webview_evidence_bootstrap() -> &'static str {
    PLUGIN_CHILD_WEBVIEW_EVIDENCE_BOOTSTRAP
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

#[derive(Clone, Debug, Serialize)]
pub struct PluginChildWebviewSpikeEvidence {
    pub created: bool,
    pub exact_top_level_navigation: bool,
    pub bounds: bool,
    pub hidden: bool,
    pub shown: bool,
    pub same_attempt_restore: bool,
    pub hide_restore_ms: u64,
    pub focused: bool,
    pub popup_denied: bool,
    pub download_denied: bool,
    pub destroyed: bool,
    pub zero_residual_webviews: bool,
    pub destroy_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct PluginChildWebviewAclEvidence {
    pub created: bool,
    pub tauri_globals_absent: bool,
    pub tauri_core_handler_hits: usize,
    pub tauri_plugin_handler_hits: usize,
    pub app_command_handler_hits: usize,
    pub global_event_handler_hits: usize,
    pub window_authority_unchanged: bool,
    pub webview_authority_unchanged: bool,
    pub rejected_tauri_envelopes: usize,
    pub lensx_bridge_ready_hits: usize,
    pub native_source_identity_mismatch_hits: usize,
    pub malformed_carriers_rejected: usize,
    pub destroyed: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct PluginChildWebviewSlotEvidence {
    pub created: bool,
    pub retina_scale_factor: f64,
    pub retina_bounds_scale_correct: bool,
    pub resize_converged: bool,
    pub host_overlay_visible_after_child_hidden: bool,
    pub keyboard_focus_reached_plugin_input: bool,
    pub keyboard_input_observed: bool,
    pub ime_composition_observed: bool,
    pub destroyed: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct PluginChildWebviewWebCapabilityEvidence {
    pub phase: String,
    pub module_loaded: bool,
    pub dedicated_worker_loaded: bool,
    pub fetch_loaded: bool,
    pub wasm_loaded: bool,
    pub host_dom_unreachable: bool,
    pub exact_origin: bool,
    pub local_storage_isolated: bool,
    pub indexed_db_isolated: bool,
    pub destroyed: bool,
    pub late_callback_inert: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginChildWebviewSlotInputReport {
    r#type: String,
    active_input: bool,
    keyboard_events: usize,
    keyboard_value: String,
    composition_events: usize,
    ime_value: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginChildWebviewWebCapabilityReport {
    r#type: String,
    phase: String,
    module_loaded: bool,
    dedicated_worker_loaded: bool,
    fetch_loaded: bool,
    wasm_loaded: bool,
    host_dom_unreachable: bool,
    exact_origin: bool,
    local_storage_before: Option<String>,
    indexed_db_before: bool,
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

#[allow(dead_code)] // Evidence ingress is constructed only by explicit macOS harness features.
pub(crate) trait PluginChildWebviewEvidenceIngress: Send + Sync + 'static {
    fn observe(&self, actual_source_label: &str, stage: &str, duration: Duration);

    #[cfg(feature = "config-lens-cold-open-harness")]
    fn observe_pointer(
        &self,
        _actual_source_label: &str,
        _observation: PluginChildWebviewPointerObservation,
    ) {
    }
}

#[cfg(feature = "config-lens-cold-open-harness")]
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginChildWebviewEvidenceStage {
    contract_version: String,
    r#type: String,
    stage: String,
    duration_ms: f64,
}

#[cfg(feature = "config-lens-cold-open-harness")]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewPointerObservation {
    pub(crate) contract_version: String,
    pub(crate) r#type: String,
    pub(crate) sequence: u16,
    pub(crate) semantic_region: String,
    pub(crate) computed_cursor: String,
    pub(crate) document_identity: String,
    pub(crate) editor_identity: String,
    pub(crate) webkit_version: String,
    pub(crate) device_scale_factor: f64,
    pub(crate) viewport_width: f64,
    pub(crate) viewport_height: f64,
    pub(crate) move_delivery_count: usize,
}

#[cfg(feature = "config-lens-cold-open-harness")]
impl PluginChildWebviewPointerObservation {
    pub(crate) fn valid(&self) -> bool {
        self.contract_version == "0.1.0"
            && self.r#type == "lensx.plugin_evidence.pointer"
            && (1..=256).contains(&self.sequence)
            && matches!(
                self.semantic_region.as_str(),
                "editor_text" | "gutter" | "scrollbar" | "footer_control" | "link" | "overlay"
            )
            && !self.computed_cursor.is_empty()
            && self.computed_cursor.len() <= 32
            && self
                .computed_cursor
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
            && matches!(
                self.document_identity.as_str(),
                "document_current" | "document_unknown"
            )
            && matches!(
                self.editor_identity.as_str(),
                "editor_current" | "not_applicable"
            )
            && !self.webkit_version.is_empty()
            && self.webkit_version.len() <= 64
            && self
                .webkit_version
                .bytes()
                .all(|byte| byte.is_ascii_digit() || byte == b'.')
            && self.device_scale_factor.is_finite()
            && (1.0..=8.0).contains(&self.device_scale_factor)
            && self.viewport_width.is_finite()
            && (320.0..=4096.0).contains(&self.viewport_width)
            && self.viewport_height.is_finite()
            && (240.0..=2160.0).contains(&self.viewport_height)
            && self.move_delivery_count <= 256
    }
}

#[allow(dead_code)] // Product creation wiring follows after the bridge/session state is complete.
pub(crate) fn apply_plugin_child_webview_bridge_ingress<R: Runtime>(
    builder: WebviewBuilder<R>,
    attempt_id: String,
    freshness: &str,
    ingress: Arc<dyn PluginChildWebviewBridgeIngress>,
    evidence: Option<Arc<dyn PluginChildWebviewEvidenceIngress>>,
) -> Option<WebviewBuilder<R>> {
    let bridge_bootstrap = plugin_child_webview_bridge_bootstrap(freshness)?;
    #[cfg(feature = "config-lens-cold-open-harness")]
    let bootstrap = if evidence.is_some() {
        format!(
            "{bridge_bootstrap}{PLUGIN_CHILD_WEBVIEW_EVIDENCE_BOOTSTRAP}{PLUGIN_CHILD_WEBVIEW_EVIDENCE_BOUNDARIES}"
        )
    } else {
        bridge_bootstrap
    };
    #[cfg(not(feature = "config-lens-cold-open-harness"))]
    let bootstrap = bridge_bootstrap;
    Some(
        builder
            .initialization_script(bootstrap)
            .isolated_ipc_handler(move |actual_source_label, request| {
                #[cfg(feature = "config-lens-cold-open-harness")]
                if let Some(evidence) = evidence.as_ref() {
                    if let Ok(observation) =
                        serde_json::from_str::<PluginChildWebviewPointerObservation>(request.body())
                    {
                        if observation.valid() {
                            evidence.observe_pointer(&actual_source_label, observation);
                            return;
                        }
                    }
                    if let Ok(observation) =
                        serde_json::from_str::<PluginChildWebviewEvidenceStage>(request.body())
                    {
                        if observation.contract_version == "0.1.0"
                            && observation.r#type == "lensx.plugin_evidence.stage"
                            && matches!(
                                observation.stage.as_str(),
                                "ui_bundle" | "editor" | "worker" | "first_interactive"
                            )
                            && observation.duration_ms.is_finite()
                            && (0.0..=60_000.0).contains(&observation.duration_ms)
                        {
                            evidence.observe(
                                &actual_source_label,
                                &observation.stage,
                                Duration::from_secs_f64(observation.duration_ms / 1000.0),
                            );
                            return;
                        }
                    }
                }
                #[cfg(not(feature = "config-lens-cold-open-harness"))]
                let _ = &evidence;
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
    create_plugin_child_webview_with_evidence(
        app,
        parent_label,
        input,
        current_source,
        bridge_ingress,
        lifecycle_ingress,
        None,
    )
}

pub(crate) fn create_plugin_child_webview_with_evidence<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    input: PluginChildWebviewProductInput,
    current_source: Arc<dyn PluginChildWebviewCurrentSource>,
    bridge_ingress: Arc<dyn PluginChildWebviewBridgeIngress>,
    lifecycle_ingress: Arc<dyn PluginChildWebviewLifecycleIngress>,
    evidence: Option<Arc<dyn PluginChildWebviewEvidenceIngress>>,
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
        evidence,
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

pub struct PluginChildWebviewSpike<R: Runtime> {
    app: AppHandle<R>,
    webview: Option<Webview<R>>,
    label: String,
    exact_url: Url,
    finished_loads: Receiver<String>,
    allowed_navigation_hits: Arc<AtomicUsize>,
    rejected_navigation_hits: Arc<AtomicUsize>,
    popup_hits: Arc<AtomicUsize>,
    download_hits: Arc<AtomicUsize>,
}

#[allow(dead_code)] // Product construction is connected by the subsequent Child WebView service tasks.
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

pub struct PluginChildWebviewAclProbe<R: Runtime> {
    app: AppHandle<R>,
    parent: tauri::Window<R>,
    webview: Option<Webview<R>>,
    label: String,
    finished_loads: Receiver<String>,
    expected_url: Url,
    initial_position: PhysicalPosition<i32>,
    initial_size: PhysicalSize<u32>,
    rejected_categories: Arc<Mutex<HashSet<String>>>,
    bridge_ready_hits: Arc<AtomicUsize>,
    source_identity_mismatch_hits: Arc<AtomicUsize>,
    malformed_carrier_hits: Arc<AtomicUsize>,
}

pub struct PluginChildWebviewSlotProbe<R: Runtime> {
    app: AppHandle<R>,
    parent: tauri::Window<R>,
    parent_webview: Webview<R>,
    webview: Option<Webview<R>>,
    label: String,
    finished_loads: Receiver<String>,
    expected_url: Url,
    input_report: Arc<Mutex<Option<PluginChildWebviewSlotInputReport>>>,
}

pub struct PluginChildWebviewWebCapabilityProbe<R: Runtime> {
    app: AppHandle<R>,
    webview: Option<Webview<R>>,
    label: String,
    finished_loads: Receiver<String>,
    expected_url: Url,
    report: Arc<Mutex<Option<PluginChildWebviewWebCapabilityReport>>>,
    late_message_hits: Arc<AtomicUsize>,
}

const ACL_CATEGORIES: [&str; 6] = ["core", "plugin", "app", "event", "window", "webview"];

fn classify_acl_command(command: &str) -> Option<&'static str> {
    match command {
        "plugin:app|version" => Some("core"),
        "plugin:lensx-acl-probe|probe" => Some("plugin"),
        "lensx_acl_probe" => Some("app"),
        "plugin:event|emit" => Some("event"),
        "plugin:window|hide" => Some("window"),
        "plugin:webview|set_webview_position" => Some("webview"),
        _ => None,
    }
}

fn is_bridge_ready(value: &serde_json::Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    object.len() == 3
        && object
            .get("contract_version")
            .and_then(|value| value.as_str())
            == Some("0.2.0")
        && object.get("type").and_then(|value| value.as_str()) == Some("lensx.plugin_bridge.ready")
        && object
            .get("freshness")
            .and_then(|value| value.as_str())
            .is_some_and(|freshness| {
                freshness.len() == 32
                    && freshness
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
}

#[cfg(target_os = "macos")]
pub(crate) fn send_native_text_input<R: Runtime>(
    webview: &Webview<R>,
) -> Result<(), PluginChildWebviewAdapterError> {
    use objc2::{msg_send, sel};
    use objc2_app_kit::NSWindow;
    use objc2_foundation::{NSObjectProtocol, NSRange, NSString};

    let (sender, receiver) = mpsc::sync_channel(1);
    webview
        .with_webview(move |platform| {
            let plain = NSString::from_str("k");
            let marked = NSString::from_str("中文");
            let sent = unsafe {
                let window: &NSWindow = &*platform.ns_window().cast();
                window.firstResponder().is_some_and(|responder| {
                    let insert = sel!(insertText:replacementRange:);
                    let set_marked = sel!(setMarkedText:selectedRange:replacementRange:);
                    if !responder.respondsToSelector(insert)
                        || !responder.respondsToSelector(set_marked)
                    {
                        return false;
                    }
                    let replacement = NSRange::new(usize::MAX, 0);
                    let _: () = msg_send![
                        &*responder,
                        insertText: &*plain,
                        replacementRange: replacement
                    ];
                    let _: () = msg_send![
                        &*responder,
                        setMarkedText: &*marked,
                        selectedRange: NSRange::new(2, 0),
                        replacementRange: replacement
                    ];
                    let _: () = msg_send![
                        &*responder,
                        insertText: &*marked,
                        replacementRange: replacement
                    ];
                    true
                })
            };
            let _ = sender.send(sent);
        })
        .map_err(|_| PluginChildWebviewAdapterError::new("native_input_dispatch_failed"))?;
    if receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| PluginChildWebviewAdapterError::new("native_input_timeout"))?
    {
        Ok(())
    } else {
        Err(PluginChildWebviewAdapterError::new(
            "native_input_responder_unavailable",
        ))
    }
}

pub fn create_plugin_child_webview_acl_probe<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    child_label: &str,
    exact_url: &str,
) -> Result<PluginChildWebviewAclProbe<R>, PluginChildWebviewAdapterError> {
    let parent = app
        .get_webview_window(parent_label)
        .ok_or_else(|| PluginChildWebviewAdapterError::new("parent_unavailable"))?;
    let exact_url = Url::parse(exact_url)
        .map_err(|_| PluginChildWebviewAdapterError::new("invalid_exact_url"))?;
    let expected_url = exact_url.clone();
    let rejected_categories = Arc::new(Mutex::new(HashSet::new()));
    let bridge_ready_hits = Arc::new(AtomicUsize::new(0));
    let source_identity_mismatch_hits = Arc::new(AtomicUsize::new(0));
    let malformed_carrier_hits = Arc::new(AtomicUsize::new(0));
    let observed_categories = Arc::clone(&rejected_categories);
    let observed_ready = Arc::clone(&bridge_ready_hits);
    let observed_source_mismatches = Arc::clone(&source_identity_mismatch_hits);
    let observed_malformed_carriers = Arc::clone(&malformed_carrier_hits);
    let expected_source_label = child_label.to_owned();
    let (load_sender, finished_loads) = mpsc::channel();
    let builder = WebviewBuilder::new(child_label, WebviewUrl::External(exact_url))
        .initialization_script(
            plugin_child_webview_bridge_bootstrap(BRIDGE_PROBE_FRESHNESS)
                .expect("static bridge freshness should be valid"),
        )
        .isolated_uri_scheme_protocols([expected_url.scheme()])
        .isolated_ipc_handler(move |source_label, request| {
            if source_label != expected_source_label {
                observed_source_mismatches.fetch_add(1, Ordering::SeqCst);
                return;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(request.body()) else {
                observed_malformed_carriers.fetch_add(1, Ordering::SeqCst);
                return;
            };
            if is_bridge_ready(&value) {
                observed_ready.fetch_add(1, Ordering::SeqCst);
                return;
            }
            if let Some(category) = value
                .get("cmd")
                .and_then(|command| command.as_str())
                .and_then(classify_acl_command)
            {
                if let Ok(mut categories) = observed_categories.lock() {
                    categories.insert(category.to_owned());
                }
            } else {
                observed_malformed_carriers.fetch_add(1, Ordering::SeqCst);
            }
        })
        .on_navigation({
            let expected_url = expected_url.clone();
            move |candidate| candidate == &expected_url
        })
        .on_page_load(move |_webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = load_sender.send(payload.url().to_string());
            }
        });
    let parent_window = parent.as_ref().window();
    let webview = parent_window
        .add_child(
            builder,
            LogicalPosition::new(24.0, 32.0),
            LogicalSize::new(320.0, 220.0),
        )
        .map_err(|_| PluginChildWebviewAdapterError::new("create_failed"))?;
    let initial_position = webview
        .position()
        .map_err(|_| PluginChildWebviewAdapterError::new("bounds_read_failed"))?;
    let initial_size = webview
        .size()
        .map_err(|_| PluginChildWebviewAdapterError::new("bounds_read_failed"))?;

    Ok(PluginChildWebviewAclProbe {
        app: app.clone(),
        parent: parent_window,
        webview: Some(webview),
        label: child_label.to_owned(),
        finished_loads,
        expected_url,
        initial_position,
        initial_size,
        rejected_categories,
        bridge_ready_hits,
        source_identity_mismatch_hits,
        malformed_carrier_hits,
    })
}

pub fn create_plugin_child_webview_slot_probe<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    child_label: &str,
    exact_url: &str,
) -> Result<PluginChildWebviewSlotProbe<R>, PluginChildWebviewAdapterError> {
    let parent = app
        .get_webview_window(parent_label)
        .ok_or_else(|| PluginChildWebviewAdapterError::new("parent_unavailable"))?;
    let parent_webview = parent.as_ref().clone();
    let parent_window = parent.as_ref().window();
    let exact_url = Url::parse(exact_url)
        .map_err(|_| PluginChildWebviewAdapterError::new("invalid_exact_url"))?;
    let expected_url = exact_url.clone();
    let input_report = Arc::new(Mutex::new(None));
    let received_report = Arc::clone(&input_report);
    let (load_sender, finished_loads) = mpsc::channel();
    let builder = WebviewBuilder::new(child_label, WebviewUrl::External(exact_url))
        .initialization_script(
            plugin_child_webview_bridge_bootstrap(BRIDGE_PROBE_FRESHNESS)
                .expect("static bridge freshness should be valid"),
        )
        .isolated_uri_scheme_protocols([expected_url.scheme()])
        .isolated_ipc_handler(move |_source_label, request| {
            let Ok(report) =
                serde_json::from_str::<PluginChildWebviewSlotInputReport>(request.body())
            else {
                return;
            };
            if report.r#type == "lensx.slot_probe.input" {
                if let Ok(mut slot) = received_report.lock() {
                    *slot = Some(report);
                }
            }
        })
        .on_navigation({
            let expected_url = expected_url.clone();
            move |candidate| candidate == &expected_url
        })
        .on_page_load(move |_webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = load_sender.send(payload.url().to_string());
            }
        });
    let webview = parent_window
        .add_child(
            builder,
            LogicalPosition::new(40.0, 72.0),
            LogicalSize::new(420.0, 260.0),
        )
        .map_err(|_| PluginChildWebviewAdapterError::new("create_failed"))?;

    Ok(PluginChildWebviewSlotProbe {
        app: app.clone(),
        parent: parent_window,
        parent_webview,
        webview: Some(webview),
        label: child_label.to_owned(),
        finished_loads,
        expected_url,
        input_report,
    })
}

pub fn create_plugin_child_webview_web_capability_probe<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    child_label: &str,
    exact_url: &str,
    data_store_identifier: [u8; 16],
) -> Result<PluginChildWebviewWebCapabilityProbe<R>, PluginChildWebviewAdapterError> {
    let parent = app
        .get_webview_window(parent_label)
        .ok_or_else(|| PluginChildWebviewAdapterError::new("parent_unavailable"))?;
    let exact_url = Url::parse(exact_url)
        .map_err(|_| PluginChildWebviewAdapterError::new("invalid_exact_url"))?;
    let expected_url = exact_url.clone();
    let report = Arc::new(Mutex::new(None));
    let received_report = Arc::clone(&report);
    let late_message_hits = Arc::new(AtomicUsize::new(0));
    let observed_late_messages = Arc::clone(&late_message_hits);
    let (load_sender, finished_loads) = mpsc::channel();
    let builder = WebviewBuilder::new(child_label, WebviewUrl::External(exact_url))
        .data_store_identifier(data_store_identifier)
        .initialization_script(
            plugin_child_webview_bridge_bootstrap(BRIDGE_PROBE_FRESHNESS)
                .expect("static bridge freshness should be valid"),
        )
        .isolated_uri_scheme_protocols([expected_url.scheme()])
        .isolated_ipc_handler(move |_source_label, request| {
            if serde_json::from_str::<serde_json::Value>(request.body())
                .ok()
                .and_then(|value| value.as_object().cloned())
                .is_some_and(|object| {
                    object.len() == 1
                        && object.get("type").and_then(Value::as_str)
                            == Some("lensx.web_capability_probe.late")
                })
            {
                observed_late_messages.fetch_add(1, Ordering::SeqCst);
                return;
            }
            let Ok(value) =
                serde_json::from_str::<PluginChildWebviewWebCapabilityReport>(request.body())
            else {
                return;
            };
            if value.r#type == "lensx.web_capability_probe.result" {
                if let Ok(mut report) = received_report.lock() {
                    *report = Some(value);
                }
            }
        })
        .on_navigation({
            let expected_url = expected_url.clone();
            move |candidate| candidate == &expected_url
        })
        .on_page_load(move |_webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = load_sender.send(payload.url().to_string());
            }
        });
    let webview = parent
        .as_ref()
        .window()
        .add_child(
            builder,
            LogicalPosition::new(40.0, 72.0),
            LogicalSize::new(420.0, 260.0),
        )
        .map_err(|_| PluginChildWebviewAdapterError::new("create_failed"))?;
    Ok(PluginChildWebviewWebCapabilityProbe {
        app: app.clone(),
        webview: Some(webview),
        label: child_label.to_owned(),
        finished_loads,
        expected_url,
        report,
        late_message_hits,
    })
}

pub fn create_plugin_child_webview_spike<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    child_label: &str,
    exact_url: &str,
) -> Result<PluginChildWebviewSpike<R>, PluginChildWebviewAdapterError> {
    let parent = app
        .get_webview_window(parent_label)
        .ok_or_else(|| PluginChildWebviewAdapterError::new("parent_unavailable"))?;
    let exact_url = Url::parse(exact_url)
        .map_err(|_| PluginChildWebviewAdapterError::new("invalid_exact_url"))?;
    let navigation_url = exact_url.clone();
    let allowed_navigation_hits = Arc::new(AtomicUsize::new(0));
    let rejected_navigation_hits = Arc::new(AtomicUsize::new(0));
    let navigation_allowed = Arc::clone(&allowed_navigation_hits);
    let navigation_rejected = Arc::clone(&rejected_navigation_hits);
    let popup_hits = Arc::new(AtomicUsize::new(0));
    let observed_popups = Arc::clone(&popup_hits);
    let download_hits = Arc::new(AtomicUsize::new(0));
    let observed_downloads = Arc::clone(&download_hits);
    let (load_sender, finished_loads) = mpsc::channel();
    let builder = WebviewBuilder::new(child_label, WebviewUrl::External(exact_url.clone()))
        .on_navigation(move |candidate| {
            let allowed = candidate == &navigation_url;
            if allowed {
                navigation_allowed.fetch_add(1, Ordering::SeqCst);
            } else {
                navigation_rejected.fetch_add(1, Ordering::SeqCst);
            }
            allowed
        })
        .on_new_window(move |_url, _features| {
            observed_popups.fetch_add(1, Ordering::SeqCst);
            NewWindowResponse::Deny
        })
        .on_download(move |_webview, event| {
            if matches!(event, DownloadEvent::Requested { .. }) {
                observed_downloads.fetch_add(1, Ordering::SeqCst);
            }
            false
        })
        .on_page_load(move |_webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = load_sender.send(payload.url().to_string());
            }
        });
    let webview = parent
        .as_ref()
        .window()
        .add_child(
            builder,
            LogicalPosition::new(24.0, 32.0),
            LogicalSize::new(320.0, 220.0),
        )
        .map_err(|_| PluginChildWebviewAdapterError::new("create_failed"))?;

    Ok(PluginChildWebviewSpike {
        app: app.clone(),
        webview: Some(webview),
        label: child_label.to_owned(),
        exact_url,
        finished_loads,
        allowed_navigation_hits,
        rejected_navigation_hits,
        popup_hits,
        download_hits,
    })
}

impl<R: Runtime> PluginChildWebviewSpike<R> {
    pub fn validate(
        mut self,
        bounds: PluginChildWebviewBounds,
    ) -> Result<PluginChildWebviewSpikeEvidence, PluginChildWebviewAdapterError> {
        let webview = self
            .webview
            .as_ref()
            .ok_or_else(|| PluginChildWebviewAdapterError::new("destroyed"))?;
        let loaded = self
            .finished_loads
            .recv_timeout(LOAD_DEADLINE)
            .map_err(|_| PluginChildWebviewAdapterError::new("load_timeout"))?;
        if loaded != self.exact_url.as_str()
            || webview
                .url()
                .map_err(|_| PluginChildWebviewAdapterError::new("url_read_failed"))?
                != self.exact_url
            || self.allowed_navigation_hits.load(Ordering::SeqCst) == 0
        {
            return Err(PluginChildWebviewAdapterError::new(
                "exact_navigation_failed",
            ));
        }

        let forbidden = Url::parse("https://example.invalid/")
            .map_err(|_| PluginChildWebviewAdapterError::new("invalid_forbidden_url"))?;
        let _ = webview.navigate(forbidden);
        let navigation_deadline = Instant::now() + Duration::from_secs(2);
        while self.rejected_navigation_hits.load(Ordering::SeqCst) == 0
            && Instant::now() < navigation_deadline
        {
            thread::sleep(Duration::from_millis(10));
        }
        if self.rejected_navigation_hits.load(Ordering::SeqCst) == 0
            || webview
                .url()
                .map_err(|_| PluginChildWebviewAdapterError::new("url_read_failed"))?
                != self.exact_url
        {
            return Err(PluginChildWebviewAdapterError::new("navigation_escape"));
        }

        webview
            .set_bounds(Rect {
                position: Position::Physical(PhysicalPosition::new(bounds.x, bounds.y)),
                size: Size::Physical(PhysicalSize::new(bounds.width, bounds.height)),
            })
            .map_err(|_| PluginChildWebviewAdapterError::new("bounds_update_failed"))?;
        if webview
            .position()
            .map_err(|_| PluginChildWebviewAdapterError::new("bounds_read_failed"))?
            != PhysicalPosition::new(bounds.x, bounds.y)
            || webview
                .size()
                .map_err(|_| PluginChildWebviewAdapterError::new("bounds_read_failed"))?
                != PhysicalSize::new(bounds.width, bounds.height)
        {
            return Err(PluginChildWebviewAdapterError::new("bounds_mismatch"));
        }
        let restore_started = Instant::now();
        webview
            .hide()
            .map_err(|_| PluginChildWebviewAdapterError::new("hide_failed"))?;
        webview
            .show()
            .map_err(|_| PluginChildWebviewAdapterError::new("show_failed"))?;
        let same_attempt_restore = webview
            .url()
            .map_err(|_| PluginChildWebviewAdapterError::new("url_read_failed"))?
            == self.exact_url;
        if !same_attempt_restore {
            return Err(PluginChildWebviewAdapterError::new("restore_reloaded"));
        }
        let hide_restore_ms = restore_started.elapsed().as_millis() as u64;
        webview
            .set_focus()
            .map_err(|_| PluginChildWebviewAdapterError::new("focus_failed"))?;
        webview
            .eval("window.open('https://example.invalid/', '_blank');")
            .map_err(|_| PluginChildWebviewAdapterError::new("popup_probe_failed"))?;
        webview
            .eval(
                "const link=document.createElement('a');link.href='data:application/octet-stream;base64,WA==';link.download='probe.bin';document.body.append(link);link.click();link.remove();",
            )
            .map_err(|_| PluginChildWebviewAdapterError::new("download_probe_failed"))?;
        let interaction_deadline = Instant::now() + Duration::from_secs(2);
        while (self.popup_hits.load(Ordering::SeqCst) == 0
            || self.download_hits.load(Ordering::SeqCst) == 0)
            && Instant::now() < interaction_deadline
        {
            thread::sleep(Duration::from_millis(10));
        }
        if self.popup_hits.load(Ordering::SeqCst) == 0 {
            return Err(PluginChildWebviewAdapterError::new("popup_not_observed"));
        }
        if self.download_hits.load(Ordering::SeqCst) == 0 {
            return Err(PluginChildWebviewAdapterError::new("download_not_observed"));
        }
        let destroy_started = Instant::now();
        webview
            .close()
            .map_err(|_| PluginChildWebviewAdapterError::new("destroy_failed"))?;
        self.webview = None;

        let destroy_deadline = Instant::now() + DESTROY_DEADLINE;
        while self.app.get_webview(&self.label).is_some() && Instant::now() < destroy_deadline {
            thread::sleep(Duration::from_millis(10));
        }
        if self.app.get_webview(&self.label).is_some() {
            return Err(PluginChildWebviewAdapterError::new("destroy_incomplete"));
        }
        let destroy_ms = destroy_started.elapsed().as_millis() as u64;

        Ok(PluginChildWebviewSpikeEvidence {
            created: true,
            exact_top_level_navigation: true,
            bounds: true,
            hidden: true,
            shown: true,
            same_attempt_restore,
            hide_restore_ms,
            focused: true,
            popup_denied: true,
            download_denied: true,
            destroyed: true,
            zero_residual_webviews: true,
            destroy_ms,
        })
    }
}

impl<R: Runtime> Drop for PluginChildWebviewSpike<R> {
    fn drop(&mut self) {
        if let Some(webview) = self.webview.take() {
            let _ = webview.hide();
            let _ = webview.close();
        }
    }
}

impl<R: Runtime> PluginChildWebviewAclProbe<R> {
    pub fn validate(
        mut self,
        app_command_handler: &AtomicUsize,
        tauri_plugin_handler: &AtomicUsize,
        global_event_handler: &AtomicUsize,
    ) -> Result<PluginChildWebviewAclEvidence, PluginChildWebviewAdapterError> {
        let webview = self
            .webview
            .as_ref()
            .ok_or_else(|| PluginChildWebviewAdapterError::new("destroyed"))?;
        let loaded = self
            .finished_loads
            .recv_timeout(LOAD_DEADLINE)
            .map_err(|_| PluginChildWebviewAdapterError::new("load_timeout"))?;
        if loaded != self.expected_url.as_str() {
            return Err(PluginChildWebviewAdapterError::new(
                "exact_navigation_failed",
            ));
        }

        let message_deadline = Instant::now() + Duration::from_secs(3);
        loop {
            let rejected = self
                .rejected_categories
                .lock()
                .map_err(|_| PluginChildWebviewAdapterError::new("acl_state_poisoned"))?
                .len();
            if rejected == ACL_CATEGORIES.len()
                && self.bridge_ready_hits.load(Ordering::SeqCst) == 1
                && self.malformed_carrier_hits.load(Ordering::SeqCst) == 3
            {
                break;
            }
            if Instant::now() >= message_deadline {
                return Err(PluginChildWebviewAdapterError::new(
                    "acl_messages_incomplete",
                ));
            }
            thread::sleep(Duration::from_millis(10));
        }

        let rejected_tauri_envelopes = self
            .rejected_categories
            .lock()
            .map_err(|_| PluginChildWebviewAdapterError::new("acl_state_poisoned"))?
            .len();
        let window_authority_unchanged = self
            .parent
            .is_visible()
            .map_err(|_| PluginChildWebviewAdapterError::new("window_state_read_failed"))?;
        let webview_authority_unchanged = webview
            .position()
            .map_err(|_| PluginChildWebviewAdapterError::new("webview_state_read_failed"))?
            == self.initial_position
            && webview
                .size()
                .map_err(|_| PluginChildWebviewAdapterError::new("webview_state_read_failed"))?
                == self.initial_size;
        let lensx_bridge_ready_hits = self.bridge_ready_hits.load(Ordering::SeqCst);
        let native_source_identity_mismatch_hits =
            self.source_identity_mismatch_hits.load(Ordering::SeqCst);
        let malformed_carriers_rejected = self.malformed_carrier_hits.load(Ordering::SeqCst);
        let app_command_handler_hits = app_command_handler.load(Ordering::SeqCst);
        let tauri_plugin_handler_hits = tauri_plugin_handler.load(Ordering::SeqCst);
        let global_event_handler_hits = global_event_handler.load(Ordering::SeqCst);

        if app_command_handler_hits != 0
            || tauri_plugin_handler_hits != 0
            || global_event_handler_hits != 0
            || !window_authority_unchanged
            || !webview_authority_unchanged
            || rejected_tauri_envelopes != ACL_CATEGORIES.len()
            || lensx_bridge_ready_hits != 1
            || native_source_identity_mismatch_hits != 0
            || malformed_carriers_rejected != 3
        {
            return Err(PluginChildWebviewAdapterError::new("acl_authority_escape"));
        }

        webview
            .close()
            .map_err(|_| PluginChildWebviewAdapterError::new("destroy_failed"))?;
        self.webview = None;
        let destroy_deadline = Instant::now() + DESTROY_DEADLINE;
        while self.app.get_webview(&self.label).is_some() && Instant::now() < destroy_deadline {
            thread::sleep(Duration::from_millis(10));
        }
        if self.app.get_webview(&self.label).is_some() {
            return Err(PluginChildWebviewAdapterError::new("destroy_incomplete"));
        }

        Ok(PluginChildWebviewAclEvidence {
            created: true,
            tauri_globals_absent: true,
            tauri_core_handler_hits: 0,
            tauri_plugin_handler_hits,
            app_command_handler_hits,
            global_event_handler_hits,
            window_authority_unchanged,
            webview_authority_unchanged,
            rejected_tauri_envelopes,
            lensx_bridge_ready_hits,
            native_source_identity_mismatch_hits,
            malformed_carriers_rejected,
            destroyed: true,
        })
    }
}

impl<R: Runtime> Drop for PluginChildWebviewAclProbe<R> {
    fn drop(&mut self) {
        if let Some(webview) = self.webview.take() {
            let _ = webview.hide();
            let _ = webview.close();
        }
    }
}

impl<R: Runtime> PluginChildWebviewSlotProbe<R> {
    pub fn validate(
        mut self,
        host_overlay_handler: &AtomicUsize,
    ) -> Result<PluginChildWebviewSlotEvidence, PluginChildWebviewAdapterError> {
        let webview = self
            .webview
            .as_ref()
            .ok_or_else(|| PluginChildWebviewAdapterError::new("destroyed"))?;
        let loaded = self
            .finished_loads
            .recv_timeout(LOAD_DEADLINE)
            .map_err(|_| PluginChildWebviewAdapterError::new("load_timeout"))?;
        if loaded != self.expected_url.as_str() {
            return Err(PluginChildWebviewAdapterError::new(
                "exact_navigation_failed",
            ));
        }

        let scale_factor = self
            .parent
            .scale_factor()
            .map_err(|_| PluginChildWebviewAdapterError::new("scale_read_failed"))?;
        if scale_factor < 2.0 {
            return Err(PluginChildWebviewAdapterError::new(
                "retina_scale_unavailable",
            ));
        }
        let physical = |logical: f64| (logical * scale_factor).round() as i32;
        let retina_bounds_scale_correct = webview
            .position()
            .map_err(|_| PluginChildWebviewAdapterError::new("bounds_read_failed"))?
            == PhysicalPosition::new(physical(40.0), physical(72.0))
            && webview
                .size()
                .map_err(|_| PluginChildWebviewAdapterError::new("bounds_read_failed"))?
                == PhysicalSize::new(physical(420.0) as u32, physical(260.0) as u32);
        if !retina_bounds_scale_correct {
            return Err(PluginChildWebviewAdapterError::new(
                "retina_bounds_mismatch",
            ));
        }

        self.parent
            .set_size(LogicalSize::new(900.0, 700.0))
            .map_err(|_| PluginChildWebviewAdapterError::new("window_resize_failed"))?;
        let resized_position = PhysicalPosition::new(physical(60.0), physical(96.0));
        let resized_size = PhysicalSize::new(physical(520.0) as u32, physical(360.0) as u32);
        webview
            .set_bounds(Rect {
                position: Position::Physical(resized_position),
                size: Size::Physical(resized_size),
            })
            .map_err(|_| PluginChildWebviewAdapterError::new("bounds_update_failed"))?;
        let resize_deadline = Instant::now() + Duration::from_secs(2);
        let resize_converged = loop {
            let matches = webview.position().ok() == Some(resized_position)
                && webview.size().ok() == Some(resized_size);
            if matches || Instant::now() >= resize_deadline {
                break matches;
            }
            thread::sleep(Duration::from_millis(10));
        };
        if !resize_converged {
            return Err(PluginChildWebviewAdapterError::new(
                "resize_did_not_converge",
            ));
        }

        webview
            .set_focus()
            .map_err(|_| PluginChildWebviewAdapterError::new("focus_failed"))?;
        webview
            .eval("window.prepareSlotInputProbe()")
            .map_err(|_| PluginChildWebviewAdapterError::new("input_probe_eval_failed"))?;
        thread::sleep(Duration::from_millis(100));
        #[cfg(target_os = "macos")]
        send_native_text_input(webview)?;
        thread::sleep(Duration::from_millis(100));
        webview
            .eval("window.reportSlotInputProbe()")
            .map_err(|_| PluginChildWebviewAdapterError::new("input_probe_eval_failed"))?;
        let report_deadline = Instant::now() + Duration::from_secs(3);
        let report = loop {
            if let Some(report) = self
                .input_report
                .lock()
                .map_err(|_| PluginChildWebviewAdapterError::new("slot_state_poisoned"))?
                .clone()
            {
                break report;
            }
            if Instant::now() >= report_deadline {
                return Err(PluginChildWebviewAdapterError::new("input_report_timeout"));
            }
            thread::sleep(Duration::from_millis(10));
        };
        let keyboard_focus_reached_plugin_input = report.active_input;
        let keyboard_input_observed = report.keyboard_events == 1 && report.keyboard_value == "k";
        let ime_composition_observed =
            report.composition_events == 3 && report.ime_value == "k中文";
        if !keyboard_focus_reached_plugin_input
            || !keyboard_input_observed
            || !ime_composition_observed
        {
            return Err(PluginChildWebviewAdapterError::new("input_path_failed"));
        }

        webview
            .hide()
            .map_err(|_| PluginChildWebviewAdapterError::new("hide_failed"))?;
        self.parent_webview
            .eval(
                r#"
                (() => {
                  const overlay = document.createElement('button');
                  overlay.id = 'trusted-host-overlay';
                  overlay.textContent = 'Trusted Host overlay';
                  Object.assign(overlay.style, {
                    position: 'fixed', inset: '0', zIndex: '2147483647'
                  });
                  document.body.append(overlay);
                  overlay.focus();
                  const visible = document.activeElement === overlay
                    && document.elementFromPoint(innerWidth / 2, innerHeight / 2) === overlay;
                  if (visible) {
                    window.__TAURI_INTERNALS__.invoke('plugin_child_webview_slot_overlay_probe');
                  }
                })();
                "#,
            )
            .map_err(|_| PluginChildWebviewAdapterError::new("overlay_probe_eval_failed"))?;
        let overlay_deadline = Instant::now() + Duration::from_secs(3);
        while host_overlay_handler.load(Ordering::SeqCst) == 0 && Instant::now() < overlay_deadline
        {
            thread::sleep(Duration::from_millis(10));
        }
        let host_overlay_visible_after_child_hidden =
            host_overlay_handler.load(Ordering::SeqCst) == 1;
        if !host_overlay_visible_after_child_hidden {
            return Err(PluginChildWebviewAdapterError::new("host_overlay_obscured"));
        }

        webview
            .close()
            .map_err(|_| PluginChildWebviewAdapterError::new("destroy_failed"))?;
        self.webview = None;
        let destroy_deadline = Instant::now() + DESTROY_DEADLINE;
        while self.app.get_webview(&self.label).is_some() && Instant::now() < destroy_deadline {
            thread::sleep(Duration::from_millis(10));
        }
        if self.app.get_webview(&self.label).is_some() {
            return Err(PluginChildWebviewAdapterError::new("destroy_incomplete"));
        }

        Ok(PluginChildWebviewSlotEvidence {
            created: true,
            retina_scale_factor: scale_factor,
            retina_bounds_scale_correct,
            resize_converged,
            host_overlay_visible_after_child_hidden,
            keyboard_focus_reached_plugin_input,
            keyboard_input_observed,
            ime_composition_observed,
            destroyed: true,
        })
    }
}

impl<R: Runtime> Drop for PluginChildWebviewSlotProbe<R> {
    fn drop(&mut self) {
        if let Some(webview) = self.webview.take() {
            let _ = webview.hide();
            let _ = webview.close();
        }
    }
}

impl<R: Runtime> PluginChildWebviewWebCapabilityProbe<R> {
    pub fn validate(
        mut self,
        expected_phase: &str,
    ) -> Result<PluginChildWebviewWebCapabilityEvidence, PluginChildWebviewAdapterError> {
        let loaded = self
            .finished_loads
            .recv_timeout(LOAD_DEADLINE)
            .map_err(|_| PluginChildWebviewAdapterError::new("load_timeout"))?;
        if loaded != self.expected_url.as_str() {
            return Err(PluginChildWebviewAdapterError::new(
                "exact_navigation_failed",
            ));
        }
        let report_deadline = Instant::now() + Duration::from_secs(8);
        let report = loop {
            if let Some(report) = self
                .report
                .lock()
                .map_err(|_| PluginChildWebviewAdapterError::new("web_probe_state_poisoned"))?
                .clone()
            {
                break report;
            }
            if Instant::now() >= report_deadline {
                return Err(PluginChildWebviewAdapterError::new("web_probe_timeout"));
            }
            thread::sleep(Duration::from_millis(10));
        };
        for (valid, code) in [
            (report.phase == expected_phase, "web_probe_phase_failed"),
            (report.module_loaded, "web_probe_module_failed"),
            (report.dedicated_worker_loaded, "web_probe_worker_failed"),
            (report.fetch_loaded, "web_probe_fetch_failed"),
            (report.wasm_loaded, "web_probe_wasm_failed"),
            (
                report.host_dom_unreachable,
                "web_probe_host_dom_boundary_failed",
            ),
            (report.exact_origin, "web_probe_origin_failed"),
            (
                report.local_storage_before.is_none(),
                "web_probe_local_storage_failed",
            ),
            (!report.indexed_db_before, "web_probe_indexed_db_failed"),
        ] {
            if !valid {
                return Err(PluginChildWebviewAdapterError::new(code));
            }
        }
        let webview = self
            .webview
            .as_ref()
            .ok_or_else(|| PluginChildWebviewAdapterError::new("destroyed"))?;
        webview
            .close()
            .map_err(|_| PluginChildWebviewAdapterError::new("destroy_failed"))?;
        self.webview = None;
        let destroy_deadline = Instant::now() + DESTROY_DEADLINE;
        while self.app.get_webview(&self.label).is_some() && Instant::now() < destroy_deadline {
            thread::sleep(Duration::from_millis(10));
        }
        if self.app.get_webview(&self.label).is_some() {
            return Err(PluginChildWebviewAdapterError::new("destroy_incomplete"));
        }
        thread::sleep(Duration::from_millis(700));
        if self.late_message_hits.load(Ordering::SeqCst) != 0 {
            return Err(PluginChildWebviewAdapterError::new(
                "late_callback_after_destroy",
            ));
        }
        Ok(PluginChildWebviewWebCapabilityEvidence {
            phase: report.phase,
            module_loaded: report.module_loaded,
            dedicated_worker_loaded: report.dedicated_worker_loaded,
            fetch_loaded: report.fetch_loaded,
            wasm_loaded: report.wasm_loaded,
            host_dom_unreachable: report.host_dom_unreachable,
            exact_origin: report.exact_origin,
            local_storage_isolated: true,
            indexed_db_isolated: true,
            destroyed: true,
            late_callback_inert: true,
        })
    }
}

impl<R: Runtime> Drop for PluginChildWebviewWebCapabilityProbe<R> {
    fn drop(&mut self) {
        if let Some(webview) = self.webview.take() {
            let _ = webview.hide();
            let _ = webview.close();
        }
    }
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
    fn production_bridge_bootstrap_has_no_pointer_evidence_capability() {
        let bootstrap = plugin_child_webview_bridge_bootstrap(BRIDGE_PROBE_FRESHNESS)
            .expect("maintained bridge freshness should build");
        assert!(!bootstrap.contains("plugin_evidence.pointer"));
        assert!(!bootstrap.contains("PLUGIN_EVIDENCE_ARM_POINTER"));
        assert!(!bootstrap.contains("PLUGIN_EVIDENCE_SAMPLE_POINTER"));
        assert!(!bootstrap.contains("native_cursor"));
    }
}
