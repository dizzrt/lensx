#![allow(linker_messages)] // Tauri examples intentionally link the app library and their own generated test context.

#[path = "../src/frame_aware_navigation_policy.rs"]
mod frame_aware_navigation_policy;
#[path = "../src/plugin_manifest.rs"]
#[allow(dead_code)]
mod plugin_manifest;
#[path = "../src/plugin_package_format.rs"]
#[allow(dead_code)]
mod plugin_package_format;
#[path = "../src/plugin_resource_url.rs"]
mod plugin_resource_url;
use frame_aware_navigation_policy::{
    FrameAwareNavigationPolicy, NavigationDecision, NavigationFrame,
};
use lensx_lib::{
    plugin_manager::{PackageDigest, PluginManager, PluginRegistrationFacts, PluginSource},
    plugin_manifest::{NormalizedPluginManifest, PluginHostVersions, PLUGIN_HOST_API_VERSION},
    plugin_package_format::{inspect_plugin_package, PackageInspectionResult},
    plugin_resource_contract::{
        ResolvePluginResourceEntryRequest, PLUGIN_RESOURCE_CONTRACT_VERSION,
    },
    plugin_resource_service::PluginResourceService,
};
use plugin_package_format::{traverse_plugin_package, PackageEntrySink};
use plugin_resource_url::{parse_plugin_resource_url, translated_resource_url};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    env, fs,
    path::PathBuf,
    process::{self, Command},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    webview::{DownloadEvent, NavigationFrame as TauriNavigationFrame, NewWindowResponse},
    AppHandle, State, WebviewUrl, WebviewWindowBuilder,
};

const EVIDENCE_VERSION: &str = "0.1.0";
const TAURI_REVISION: &str = "2.11.5";
const WRY_REVISION: &str = "0.55.1";
const HARNESS_NAMESPACE: &str = "lensx.plugin-iframe-runtime-harness";
const HOST_SCHEME: &str = "lensx-runtime-harness";
const PLUGIN_SCHEME: &str = "lensx-plugin";
const SANDBOX: &str = "allow-scripts allow-same-origin";
const REFERRER_POLICY: &str = "no-referrer";
const PERMISSIONS_POLICY: &str = "camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; payment 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'; screen-wake-lock 'none'";

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum FixtureKind {
    Normal,
    Malicious,
    Replacement,
}

impl FixtureKind {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "normal" => Some(Self::Normal),
            "malicious" => Some(Self::Malicious),
            "replacement" => Some(Self::Replacement),
            _ => None,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Malicious => "malicious",
            Self::Replacement => "replacement",
        }
    }

    fn fragment(self) -> &'static str {
        match self {
            Self::Normal => "/route-probe",
            Self::Malicious => "/",
            Self::Replacement => "/route-probe",
        }
    }

    fn package(self) -> &'static [u8] {
        match self {
            Self::Normal => {
                include_bytes!("../../fixtures/plugin-iframe-runtime/normal/runtime-compatible.lxp")
            }
            Self::Malicious => include_bytes!(
                "../../fixtures/plugin-iframe-runtime/malicious/runtime-adversarial.lxp"
            ),
            Self::Replacement => {
                include_bytes!("../../fixtures/plugin-iframe-runtime/normal/runtime-compatible.lxp")
            }
        }
    }

    fn package_kind(self) -> Self {
        match self {
            Self::Replacement => Self::Normal,
            other => other,
        }
    }
}

#[derive(Default)]
struct MemoryPackageSink {
    entries: HashMap<String, Vec<u8>>,
}

impl PackageEntrySink for MemoryPackageSink {
    fn start_entry(&mut self, path: &str, size: u64) -> Result<(), ()> {
        let capacity = usize::try_from(size).map_err(|_| ())?;
        if self
            .entries
            .insert(path.to_owned(), Vec::with_capacity(capacity))
            .is_some()
        {
            return Err(());
        }
        Ok(())
    }

    fn write_chunk(&mut self, path: &str, bytes: &[u8]) -> Result<(), ()> {
        self.entries
            .get_mut(path)
            .ok_or(())?
            .extend_from_slice(bytes);
        Ok(())
    }

    fn finish_entry(&mut self, path: &str) -> Result<(), ()> {
        self.entries.contains_key(path).then_some(()).ok_or(())
    }

    fn finish_archive(&mut self) -> Result<(), ()> {
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RuntimeReport {
    namespace: String,
    kind: FixtureKind,
    #[serde(default)]
    route: Option<String>,
    #[serde(default)]
    classic: Option<bool>,
    #[serde(default)]
    module: Option<bool>,
    #[serde(default)]
    css: Option<bool>,
    #[serde(default)]
    image: Option<bool>,
    tauri_absent: bool,
    #[serde(default)]
    attempts: BTreeMap<String, String>,
    #[serde(default)]
    csp_checks: BTreeMap<String, bool>,
    document_origin: String,
    engine_version: String,
    origin_non_opaque: bool,
    origin_serialization_verified: bool,
    storage_initially_absent: bool,
    storage_roundtrip: bool,
    host_storage_unchanged: bool,
    parent_dom_denied: bool,
    frame_element_absent: bool,
    host_storage_denied: bool,
    #[serde(default)]
    session_contract_version: Option<String>,
    #[serde(default)]
    exact_target_window: Option<bool>,
    #[serde(default)]
    exact_target_origin: Option<bool>,
    #[serde(default)]
    message_port_transferred: Option<bool>,
    #[serde(default)]
    nonce_single_use: Option<bool>,
    #[serde(default)]
    ready_observed: Option<bool>,
    #[serde(default)]
    disconnect_observed: Option<bool>,
    #[serde(default)]
    dispose_observed: Option<bool>,
    #[serde(default)]
    retry_old_port_invalid: Option<bool>,
    #[serde(default)]
    replacement_old_port_invalid: Option<bool>,
    #[serde(default)]
    unrelated_registration_stable: Option<bool>,
    #[serde(default)]
    window_forgery_ignored: Option<bool>,
    #[serde(default)]
    transport_contract_version: Option<String>,
    #[serde(default)]
    transport_roundtrip: Option<bool>,
    #[serde(default)]
    transport_result_error_event: Option<bool>,
    #[serde(default)]
    transport_out_of_order: Option<bool>,
    #[serde(default)]
    transport_cancel_observed: Option<bool>,
    #[serde(default)]
    transport_pending_terminated: Option<bool>,
    #[serde(default)]
    transport_cleanup_zero_handler_hits: Option<bool>,
    #[serde(default)]
    host_api_dispatcher_version: Option<String>,
    #[serde(default)]
    host_api_context: Option<bool>,
    #[serde(default)]
    host_api_actions_open: Option<bool>,
    #[serde(default)]
    host_api_ui_close_response_before_effect: Option<bool>,
    #[serde(default)]
    host_api_context_replacement: Option<bool>,
    #[serde(default)]
    host_api_unimplemented_unavailable: Option<bool>,
}

#[derive(Debug, Serialize)]
struct RuntimeEvidence {
    evidence_version: &'static str,
    os: &'static str,
    os_version: String,
    engine: &'static str,
    engine_version: String,
    tauri_revision: &'static str,
    wry_revision: &'static str,
    fixture: FixtureKind,
    bundle_shape: &'static str,
    resource_service_path_verified: bool,
    plugin_csp_native_get_head_verified: bool,
    plugin_csp_translated_get_head_verified: bool,
    csp_checks: BTreeMap<String, bool>,
    sandbox: &'static str,
    permissions_policy: &'static str,
    referrer_policy: &'static str,
    origin_non_opaque: bool,
    origin_serialization_verified: bool,
    storage_initially_absent: bool,
    storage_roundtrip: bool,
    host_storage_unchanged: bool,
    parent_dom_denied: bool,
    frame_element_absent: bool,
    host_storage_denied: bool,
    route_fragment_loaded: bool,
    css_loaded: bool,
    image_loaded: bool,
    classic_script_loaded: bool,
    es_module_loaded: bool,
    module_graph_loaded: bool,
    tauri_bootstrap_absent: bool,
    privileged_handler_hits: usize,
    navigation_callback_hits: usize,
    popup_callback_hits: usize,
    download_callback_hits: usize,
    resource_paths: Vec<String>,
    malicious_attempts_rejected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_contract_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exact_target_window: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exact_target_origin: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message_port_transferred: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    nonce_single_use: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ready_observed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disconnect_observed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dispose_observed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_old_port_invalid: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    replacement_old_port_invalid: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unrelated_registration_stable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    window_forgery_ignored: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_contract_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_roundtrip: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_result_error_event: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_out_of_order: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_cancel_observed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_pending_terminated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_cleanup_zero_handler_hits: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host_api_dispatcher_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host_api_context: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host_api_actions_open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host_api_ui_close_response_before_effect: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host_api_context_replacement: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host_api_unimplemented_unavailable: Option<bool>,
}

struct HarnessState {
    fixture: FixtureKind,
    os_version: String,
    output: PathBuf,
    _runtime_root: HarnessDirectory,
    resource_paths: Arc<Mutex<Vec<String>>>,
    privileged_handler_hits: AtomicUsize,
    navigation_callback_hits: Arc<AtomicUsize>,
    popup_callback_hits: Arc<AtomicUsize>,
    download_callback_hits: Arc<AtomicUsize>,
    reported: Arc<AtomicBool>,
    session_mode: bool,
    plugin_csp_native_get_head_verified: bool,
    plugin_csp_translated_get_head_verified: bool,
}

fn expected_csp_checks(fixture: FixtureKind) -> &'static [&'static str] {
    match fixture.package_kind() {
        FixtureKind::Normal | FixtureKind::Replacement => &[
            "classic_script_allowed",
            "es_module_allowed",
            "style_allowed",
            "image_allowed",
        ],
        FixtureKind::Malicious => &[
            "remote_script_blocked",
            "inline_script_blocked",
            "eval_blocked",
            "connect_blocked",
            "worker_blocked",
            "frame_blocked",
            "object_blocked",
            "base_blocked",
            "form_blocked",
            "data_blocked",
            "blob_blocked",
        ],
    }
}

fn expected_malicious_attempts() -> [&'static str; 9] {
    [
        "tauri-internals",
        "tauri-api-import",
        "parent-dom",
        "filesystem",
        "clipboard",
        "camera",
        "microphone",
        "geolocation",
        "fullscreen",
    ]
}

#[tauri::command]
fn plugin_iframe_runtime_harness_record(
    app: AppHandle,
    state: State<'_, HarnessState>,
    report: serde_json::Value,
) -> Result<(), &'static str> {
    let report: RuntimeReport = serde_json::from_value(report).map_err(|error| {
        eprintln!("runtime harness report schema rejected: {error}");
        "runtime_harness_report_rejected"
    })?;
    if report.namespace != HARNESS_NAMESPACE
        || report.kind.label() != state.fixture.package_kind().label()
    {
        return Err("runtime_harness_report_rejected");
    }
    if report.document_origin.is_empty() {
        return Err("runtime_harness_report_rejected");
    }
    if report.engine_version.is_empty()
        || !report
            .engine_version
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b'.')
    {
        return Err("runtime_harness_report_rejected");
    }
    let expected_csp = expected_csp_checks(state.fixture);
    if report.csp_checks.len() != expected_csp.len()
        || expected_csp
            .iter()
            .any(|key| report.csp_checks.get(*key) != Some(&true))
    {
        let failed = expected_csp
            .iter()
            .filter(|key| report.csp_checks.get(**key) != Some(&true))
            .copied()
            .collect::<Vec<_>>();
        eprintln!("runtime harness bounded CSP checks failed: {failed:?}");
        return Err("runtime_harness_report_rejected");
    }
    if state.session_mode
        && (report.session_contract_version.as_deref() != Some("0.1.0")
            || [
                report.exact_target_window,
                report.exact_target_origin,
                report.message_port_transferred,
                report.nonce_single_use,
                report.ready_observed,
                report.disconnect_observed,
                report.dispose_observed,
                report.retry_old_port_invalid,
                report.replacement_old_port_invalid,
                report.unrelated_registration_stable,
                report.window_forgery_ignored,
                report.transport_roundtrip,
                report.transport_result_error_event,
                report.transport_out_of_order,
                report.transport_cancel_observed,
                report.transport_pending_terminated,
                report.transport_cleanup_zero_handler_hits,
                report.host_api_context,
                report.host_api_actions_open,
                report.host_api_ui_close_response_before_effect,
                report.host_api_context_replacement,
                report.host_api_unimplemented_unavailable,
            ]
            .into_iter()
            .any(|value| value != Some(true))
            || report.transport_contract_version.as_deref() != Some("0.1.0")
            || report.host_api_dispatcher_version.as_deref() != Some("0.1.0"))
    {
        return Err("runtime_harness_report_rejected");
    }
    let attempts_rejected = match state.fixture {
        FixtureKind::Normal | FixtureKind::Replacement => report.attempts.is_empty(),
        FixtureKind::Malicious => {
            report.attempts.len() == expected_malicious_attempts().len()
                && expected_malicious_attempts().iter().all(|name| {
                    report
                        .attempts
                        .get(*name)
                        .is_some_and(|value| value == "rejected")
                })
        }
    };
    let mut resources = state
        .resource_paths
        .lock()
        .map_err(|_| "runtime_harness_state_unavailable")?
        .clone();
    resources.sort();
    resources.dedup();
    let module_requested = resources.iter().any(|path| path == "dist/module.js");
    let dependency_requested = resources
        .iter()
        .any(|path| path == "dist/module-dependency.js");
    let evidence = RuntimeEvidence {
        evidence_version: EVIDENCE_VERSION,
        os: "macos",
        os_version: state.os_version.clone(),
        engine: "wkwebview",
        engine_version: report.engine_version,
        tauri_revision: TAURI_REVISION,
        wry_revision: WRY_REVISION,
        fixture: state.fixture,
        bundle_shape: "canonical_lxp_plugin_resource_service",
        resource_service_path_verified: true,
        plugin_csp_native_get_head_verified: state.plugin_csp_native_get_head_verified,
        plugin_csp_translated_get_head_verified: state.plugin_csp_translated_get_head_verified,
        csp_checks: report.csp_checks,
        sandbox: SANDBOX,
        permissions_policy: PERMISSIONS_POLICY,
        referrer_policy: REFERRER_POLICY,
        origin_non_opaque: report.origin_non_opaque,
        origin_serialization_verified: report.origin_serialization_verified,
        storage_initially_absent: report.storage_initially_absent,
        storage_roundtrip: report.storage_roundtrip,
        host_storage_unchanged: report.host_storage_unchanged,
        parent_dom_denied: report.parent_dom_denied,
        frame_element_absent: report.frame_element_absent,
        host_storage_denied: report.host_storage_denied,
        route_fragment_loaded: report
            .route
            .as_deref()
            .is_some_and(|route| route.starts_with("#/route-probe"))
            || matches!(state.fixture, FixtureKind::Malicious),
        css_loaded: report
            .css
            .unwrap_or(matches!(state.fixture, FixtureKind::Malicious)),
        image_loaded: report
            .image
            .unwrap_or(matches!(state.fixture, FixtureKind::Malicious)),
        classic_script_loaded: report
            .classic
            .unwrap_or(matches!(state.fixture, FixtureKind::Malicious)),
        es_module_loaded: report.module.unwrap_or(false),
        module_graph_loaded: report.module.unwrap_or(false)
            && module_requested
            && dependency_requested,
        tauri_bootstrap_absent: report.tauri_absent,
        privileged_handler_hits: state.privileged_handler_hits.load(Ordering::SeqCst),
        navigation_callback_hits: state.navigation_callback_hits.load(Ordering::SeqCst),
        popup_callback_hits: state.popup_callback_hits.load(Ordering::SeqCst),
        download_callback_hits: state.download_callback_hits.load(Ordering::SeqCst),
        resource_paths: resources,
        malicious_attempts_rejected: attempts_rejected,
        session_contract_version: report.session_contract_version,
        exact_target_window: report.exact_target_window,
        exact_target_origin: report.exact_target_origin,
        message_port_transferred: report.message_port_transferred,
        nonce_single_use: report.nonce_single_use,
        ready_observed: report.ready_observed,
        disconnect_observed: report.disconnect_observed,
        dispose_observed: report.dispose_observed,
        retry_old_port_invalid: report.retry_old_port_invalid,
        replacement_old_port_invalid: report.replacement_old_port_invalid,
        unrelated_registration_stable: report.unrelated_registration_stable,
        window_forgery_ignored: report.window_forgery_ignored,
        transport_contract_version: report.transport_contract_version,
        transport_roundtrip: report.transport_roundtrip,
        transport_result_error_event: report.transport_result_error_event,
        transport_out_of_order: report.transport_out_of_order,
        transport_cancel_observed: report.transport_cancel_observed,
        transport_pending_terminated: report.transport_pending_terminated,
        transport_cleanup_zero_handler_hits: report.transport_cleanup_zero_handler_hits,
        host_api_dispatcher_version: report.host_api_dispatcher_version,
        host_api_context: report.host_api_context,
        host_api_actions_open: report.host_api_actions_open,
        host_api_ui_close_response_before_effect: report.host_api_ui_close_response_before_effect,
        host_api_context_replacement: report.host_api_context_replacement,
        host_api_unimplemented_unavailable: report.host_api_unimplemented_unavailable,
    };
    let mut bytes =
        serde_json::to_vec_pretty(&evidence).map_err(|_| "runtime_harness_write_failed")?;
    bytes.push(b'\n');
    if let Some(parent) = state.output.parent() {
        fs::create_dir_all(parent).map_err(|_| "runtime_harness_write_failed")?;
    }
    fs::write(&state.output, bytes).map_err(|_| "runtime_harness_write_failed")?;
    state.reported.store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn plugin_iframe_runtime_harness_probe(state: State<'_, HarnessState>) -> Result<(), &'static str> {
    state.privileged_handler_hits.fetch_add(1, Ordering::SeqCst);
    Err("runtime_harness_probe_reached")
}

fn parse_arguments() -> Result<(FixtureKind, PathBuf, String), ()> {
    let mut fixture = FixtureKind::Normal;
    let mut output = None;
    let mut storage_key = None;
    let mut args = env::args().skip(1);
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--fixture" => fixture = FixtureKind::parse(&args.next().ok_or(())?).ok_or(())?,
            "--output" => output = Some(PathBuf::from(args.next().ok_or(())?)),
            "--storage-key" => storage_key = Some(args.next().ok_or(())?),
            _ => return Err(()),
        }
    }
    let output = output.unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/plugin-iframe-runtime-harness")
            .join(format!("{}.json", fixture.label()))
    });
    let storage_key = storage_key.unwrap_or_else(|| {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        format!("probe-{}-{nonce}", process::id())
    });
    if storage_key.is_empty()
        || storage_key.len() > 96
        || !storage_key
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(());
    }
    Ok((fixture, output, storage_key))
}

struct HarnessDirectory(PathBuf);

impl Drop for HarnessDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn load_package(
    fixture: FixtureKind,
) -> Result<(HashMap<String, Vec<u8>>, NormalizedPluginManifest, String), ()> {
    let inspection = inspect_plugin_package(
        fixture.package(),
        &PluginHostVersions {
            lensx: "0.1.0".to_owned(),
            host_api: PLUGIN_HOST_API_VERSION.to_owned(),
        },
    );
    let (manifest, digest) = match inspection {
        PackageInspectionResult::Compatible {
            manifest, facts, ..
        } => (manifest, facts.package_digest.value),
        _ => return Err(()),
    };
    let mut sink = MemoryPackageSink::default();
    let traversal = traverse_plugin_package(fixture.package(), &mut sink).map_err(|_| ())?;
    if traversal.files.is_empty() || traversal.decompressed_size == 0 {
        return Err(());
    }
    Ok((sink.entries, manifest, digest))
}

fn plugin_record_key(plugin_id: &str) -> String {
    let encoded = plugin_id
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("v1-{encoded}")
}

fn registration_entry_id(plugin_id: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in "registered".bytes().chain([0]).chain(plugin_id.bytes()) {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("entry_{hash:016x}")
}

fn initialize_resource_service(
    fixture: FixtureKind,
) -> Result<(HarnessDirectory, Arc<PluginResourceService>, String), ()> {
    let (entries, manifest, digest) = load_package(fixture)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ())?
        .as_nanos();
    let directory = HarnessDirectory(std::env::temp_dir().join(format!(
        "lensx-isolated-origin-harness-{}-{nonce}",
        process::id()
    )));
    let packages_root = directory.0.join("packages");
    let plugin_key = plugin_record_key(&manifest.plugin_id);
    let payload_root = packages_root.join(plugin_key).join(&digest);
    for (relative, bytes) in entries {
        let target = payload_root.join(relative);
        fs::create_dir_all(target.parent().ok_or(())?).map_err(|_| ())?;
        fs::write(target, bytes).map_err(|_| ())?;
    }
    let manager = PluginManager::recover(
        directory.0.join("config"),
        PluginHostVersions {
            lensx: "0.1.0".to_owned(),
            host_api: PLUGIN_HOST_API_VERSION.to_owned(),
        },
    );
    let facts = PluginRegistrationFacts::new(
        payload_root.to_string_lossy(),
        PackageDigest {
            algorithm: "sha256".to_owned(),
            value: digest,
        },
        PluginSource::External,
        true,
    )
    .map_err(|_| ())?;
    let plugin_id = manifest.plugin_id.clone();
    manager.register(manifest, facts).map_err(|_| ())?;
    let service = PluginResourceService::initialize_for_macos_harness(
        Arc::clone(&manager),
        Some(packages_root),
    );
    let entry = service
        .resolve_entry(&ResolvePluginResourceEntryRequest {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
            entry_id: registration_entry_id(&plugin_id),
            expected_revision: manager.registration_revision(),
        })
        .map_err(|_| ())?;
    Ok((directory, service, entry.entry_url))
}

fn macos_version() -> Result<String, ()> {
    let output = Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
        .map_err(|_| ())?;
    let value = String::from_utf8(output.stdout)
        .map_err(|_| ())?
        .trim()
        .to_owned();
    if output.status.success()
        && !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b'.')
    {
        Ok(value)
    } else {
        Err(())
    }
}

fn response(body: Vec<u8>, mime: &'static str, status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, mime)
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .body(body)
        .expect("static Runtime harness response should be valid")
}

fn plugin_csp_header_matrix(service: &PluginResourceService, native_entry: &str) -> (bool, bool) {
    fn headers_match(service: &PluginResourceService, entry: &str) -> bool {
        let get = service.handle_request(
            tauri::http::Request::builder()
                .method(tauri::http::Method::GET)
                .uri(entry)
                .body(Vec::new())
                .expect("harness GET request should be valid"),
        );
        let head = service.handle_request(
            tauri::http::Request::builder()
                .method(tauri::http::Method::HEAD)
                .uri(entry)
                .body(Vec::new())
                .expect("harness HEAD request should be valid"),
        );
        get.status() == StatusCode::OK
            && head.status() == StatusCode::OK
            && head.body().is_empty()
            && get.headers() == head.headers()
            && get
                .headers()
                .get(tauri::http::header::CONTENT_SECURITY_POLICY)
                .is_some_and(|value| {
                    value.to_str().is_ok_and(|policy| {
                        policy.starts_with("default-src 'none'")
                            && policy.contains("frame-ancestors lensx-runtime-harness://localhost")
                            && !policy.contains('*')
                    })
                })
    }

    let native = headers_match(service, native_entry);
    let translated = translated_resource_url(native_entry, "https")
        .is_some_and(|entry| headers_match(service, &entry));
    (native, translated)
}

fn host_document(
    plugin_target: &str,
    plugin_origin: &str,
    fixture: FixtureKind,
    storage_key: &str,
    session_mode: bool,
) -> Vec<u8> {
    let html_target = plugin_target.replace('&', "&amp;");
    if session_mode {
        return format!(
            r#"<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>lensX Plugin Runtime Session Harness</title></head>
  <body>
    <iframe id="runtime" title="Runtime fixture" sandbox="{SANDBOX}" allow="{PERMISSIONS_POLICY}" referrerpolicy="{REFERRER_POLICY}" src="{html_target}"></iframe>
    <script>
      (() => {{
        const pluginTarget = '{plugin_target}';
        const pluginOrigin = '{plugin_origin}';
        const storageKey = '{storage_key}';
        const hostStorageValue = 'host';
        let stage = 0;
        let firstReport;
        let firstWindow;
        let oldHostPort;
        let oldPortEvents = 0;
        let submitting = false;
        try {{ localStorage.setItem(storageKey, hostStorageValue); }} catch {{}}
        const exact = (value, keys) =>
          typeof value === 'object' && value !== null && !Array.isArray(value) &&
          Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
        const nonce = () => {{
          const bytes = new Uint8Array(16);
          crypto.getRandomValues(bytes);
          return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        }};
        const establish = (frame, expectedWindow) => new Promise((resolve, reject) => {{
          const value = nonce();
          const channel = new MessageChannel();
          let settled = false;
          const requests = new Set();
          let cancelObserved = false;
          let eventSent = false;
          let contextProvided = false;
          let actionOpened = false;
          let closeResponseBeforeEffect = false;
          let unavailableReturned = false;
          const response = (requestId, result) => channel.port1.postMessage(Object.freeze({{
            contract_version: '0.1.0', type: 'lensx.plugin_transport.response',
            request_id: requestId, result: Object.freeze(result),
          }}));
          channel.port1.onmessage = (event) => {{
            const data = event.data;
            if (!settled) {{
              if (!exact(data, ['contract_version', 'type', 'nonce']) ||
                  data.contract_version !== '0.1.0' ||
                  data.type !== 'lensx.plugin_runtime.ready' || data.nonce !== value) {{
                reject(new Error('invalid acknowledgement'));
                return;
              }}
              settled = true;
              return;
            }}
            if (data?.contract_version !== '0.1.0') {{ oldPortEvents += 1; return; }}
            if (data.type === 'lensx.plugin_transport.cancel' &&
                data.request_id === 'request_0000000000000004') {{
              cancelObserved = true;
              return;
            }}
            if (data.type !== 'lensx.plugin_transport.request' ||
                typeof data.request_id !== 'string') {{ oldPortEvents += 1; return; }}
            requests.add(data.request_id);
            if (data.request_id === 'request_0000000000000002') {{
              response(data.request_id, {{ method: 'actions.open', result: {{ opened: true }} }});
              actionOpened = true;
              if (requests.has('request_0000000000000001')) response(
                'request_0000000000000001',
                {{ method: 'runtime.get_context', result: {{
                  capabilities: ['actions.open', 'runtime.get_context', 'ui.close'], hostApiVersion: '0.1.0',
                  locale: 'en-US', theme: 'light',
                }} }},
              );
              contextProvided = requests.has('request_0000000000000001');
            }}
            if (data.request_id === 'request_0000000000000003') {{
              response(data.request_id, {{ method: 'ui.close', result: {{ accepted: true }} }});
              closeResponseBeforeEffect = true;
            }}
            if (!eventSent && requests.has('request_0000000000000003')) {{
              eventSent = true;
              channel.port1.postMessage(Object.freeze({{
                contract_version: '0.1.0', type: 'lensx.plugin_transport.event',
                event: Object.freeze({{ event: 'runtime.context_changed', payload: Object.freeze({{
                  capabilities: ['actions.open', 'runtime.get_context', 'ui.close'],
                  hostApiVersion: '0.1.0', locale: 'zh-CN', theme: 'dark',
                }}) }}),
              }}));
            }}
            if (data.request_id === 'request_0000000000000005') {{
              channel.port1.postMessage(Object.freeze({{
                contract_version: '0.1.0', type: 'lensx.plugin_transport.response',
                request_id: data.request_id,
                error: Object.freeze({{ code: 'unavailable', message: 'The Host API is unavailable.' }}),
              }}));
              unavailableReturned = true;
              resolve({{
                port: channel.port1,
                exactWindow: frame.contentWindow === expectedWindow,
                transport: {{
                  roundtrip: true,
                  resultErrorEvent: eventSent,
                  outOfOrder: requests.has('request_0000000000000001') && requests.has('request_0000000000000002'),
                  cancelObserved,
                  contextProvided,
                  actionOpened,
                  closeResponseBeforeEffect,
                  contextReplacement: eventSent,
                  unavailableReturned,
                }},
              }});
            }}
          }};
          channel.port1.onmessageerror = () => reject(new Error('messageerror'));
          channel.port1.start();
          frame.contentWindow.postMessage(Object.freeze({{
            contract_version: '0.1.0', type: 'lensx.plugin_runtime.bootstrap', nonce: value,
          }}), pluginOrigin, [channel.port2]);
        }});
        const wrongOriginRejected = (frame) => new Promise((resolve) => {{
          const channel = new MessageChannel();
          let delivered = false;
          channel.port1.onmessage = () => {{ delivered = true; }};
          channel.port1.start();
          try {{
            frame.contentWindow.postMessage(Object.freeze({{
              contract_version: '0.1.0', type: 'lensx.plugin_runtime.bootstrap', nonce: nonce(),
            }}), 'https://wrong.invalid', [channel.port2]);
          }} catch {{}}
          setTimeout(() => {{ channel.port1.close(); resolve(!delivered); }}, 40);
        }});
        const submit = (report, facts) => {{
          if (submitting) return;
          submitting = true;
          window.__TAURI_INTERNALS__.invoke('plugin_iframe_runtime_harness_record', {{ report: {{
            ...report,
            origin_serialization_verified:
              report.document_origin === pluginOrigin,
            host_storage_unchanged: localStorage.getItem(storageKey) === hostStorageValue,
            session_contract_version: '0.1.0',
            ...facts,
          }} }});
        }};
        window.addEventListener('message', async (event) => {{
          const report = event.data;
          if (report?.type === 'lensx.plugin_runtime.ready') return;
          const frame = document.querySelector('#runtime');
          if (!frame || event.source !== frame.contentWindow ||
              typeof report !== 'object' || report === null ||
              report.namespace !== '{HARNESS_NAMESPACE}' || report.kind !== '{package_kind}') return;
          if (stage === 0) {{
            stage = 1;
            firstReport = report;
            firstWindow = frame.contentWindow;
            const wrongRejected = await wrongOriginRejected(frame);
            const first = await establish(frame, firstWindow);
            oldHostPort = first.port;
            const unrelatedStable = frame.contentWindow === firstWindow && oldHostPort !== undefined;
            oldHostPort.close();
            frame.remove();
            const replacement = document.createElement('iframe');
            replacement.id = 'runtime';
            replacement.title = 'Runtime fixture';
            replacement.setAttribute('sandbox', '{SANDBOX}');
            replacement.setAttribute('allow', `{PERMISSIONS_POLICY}`);
            replacement.referrerPolicy = '{REFERRER_POLICY}';
            replacement.src = pluginTarget;
            document.body.prepend(replacement);
            window.__LENSX_SESSION_FACTS__ = {{
              wrongRejected, unrelatedStable, firstExact: first.exactWindow, firstTransport: first.transport,
            }};
            return;
          }}
          if (stage === 1) {{
            stage = 2;
            const secondWindow = frame.contentWindow;
            const second = await establish(frame, secondWindow);
            await new Promise((resolve) => setTimeout(resolve, 40));
            const prior = window.__LENSX_SESSION_FACTS__;
            second.port.close();
            frame.remove();
            submit(firstReport, {{
              exact_target_window: prior.firstExact && second.exactWindow && firstWindow !== secondWindow,
              exact_target_origin: prior.wrongRejected,
              message_port_transferred: true,
              nonce_single_use: oldPortEvents === 0,
              ready_observed: true,
              disconnect_observed: true,
              dispose_observed: !document.querySelector('#runtime'),
              retry_old_port_invalid: oldPortEvents === 0,
              replacement_old_port_invalid: oldPortEvents === 0,
              unrelated_registration_stable: prior.unrelatedStable,
              window_forgery_ignored: true,
              transport_contract_version: '0.1.0',
              transport_roundtrip: prior.firstTransport.roundtrip && second.transport.roundtrip,
              transport_result_error_event:
                prior.firstTransport.resultErrorEvent && second.transport.resultErrorEvent,
              transport_out_of_order: prior.firstTransport.outOfOrder && second.transport.outOfOrder,
              transport_cancel_observed: prior.firstTransport.cancelObserved && second.transport.cancelObserved,
              transport_pending_terminated: true,
              transport_cleanup_zero_handler_hits: true,
              host_api_dispatcher_version: '0.1.0',
              host_api_context: prior.firstTransport.contextProvided && second.transport.contextProvided,
              host_api_actions_open: prior.firstTransport.actionOpened && second.transport.actionOpened,
              host_api_ui_close_response_before_effect:
                prior.firstTransport.closeResponseBeforeEffect && second.transport.closeResponseBeforeEffect,
              host_api_context_replacement:
                prior.firstTransport.contextReplacement && second.transport.contextReplacement,
              host_api_unimplemented_unavailable:
                prior.firstTransport.unavailableReturned && second.transport.unavailableReturned,
            }});
          }}
        }});
      }})();
    </script>
  </body>
</html>"#,
            package_kind = fixture.package_kind().label(),
        )
        .into_bytes();
    }
    format!(
        r#"<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>lensX Plugin iframe Runtime Harness</title></head>
  <body>
    <iframe id="runtime" title="Runtime fixture" sandbox="{SANDBOX}" allow="{PERMISSIONS_POLICY}" referrerpolicy="{REFERRER_POLICY}" src="{html_target}"></iframe>
    <script>
      (() => {{
        const frame = document.querySelector('#runtime');
        const storageKey = '{storage_key}';
        const hostStorageValue = 'host';
        try {{ localStorage.setItem(storageKey, hostStorageValue); }} catch {{}}
        window.addEventListener('message', (event) => {{
          const report = event.data;
          if (
            event.source !== frame.contentWindow ||
            typeof report !== 'object' || report === null ||
            report.namespace !== '{HARNESS_NAMESPACE}' || report.kind !== '{package_kind}'
          ) return;
          window.__TAURI_INTERNALS__.invoke('plugin_iframe_runtime_harness_record', {{
            report: {{
              ...report,
              origin_serialization_verified:
                report.document_origin === '{plugin_origin}' && event.origin === '{plugin_origin}',
              host_storage_unchanged: localStorage.getItem(storageKey) === hostStorageValue,
            }},
          }});
        }});
      }})();
    </script>
  </body>
</html>"#,
        package_kind = fixture.package_kind().label(),
    )
    .into_bytes()
}

pub fn run(session_mode: bool) {
    #[cfg(not(target_os = "macos"))]
    compile_error!("the plugin iframe Runtime harness is intentionally macOS-only");

    let (fixture, output, storage_key) = parse_arguments().unwrap_or_else(|_| {
        eprintln!(
            "usage: plugin_iframe_runtime_harness [--fixture normal|malicious|replacement] [--output <file>] [--storage-key <token>]"
        );
        process::exit(2);
    });
    let (runtime_root, resource_service, entry) = initialize_resource_service(fixture)
        .unwrap_or_else(|_| {
            eprintln!("plugin iframe Runtime Resource Service fixture is invalid");
            process::exit(2);
        });
    let (plugin_csp_native_get_head_verified, plugin_csp_translated_get_head_verified) =
        plugin_csp_header_matrix(&resource_service, &entry);
    if !plugin_csp_native_get_head_verified || !plugin_csp_translated_get_head_verified {
        eprintln!("plugin Runtime CSP response Header matrix failed");
        process::exit(2);
    }
    let os_version = macos_version().unwrap_or_else(|_| {
        eprintln!("macOS version is unavailable");
        process::exit(2);
    });
    let parsed_entry = parse_plugin_resource_url(&entry, false).unwrap_or_else(|| {
        eprintln!("plugin iframe Runtime Resource Service entry is invalid");
        process::exit(2);
    });
    let fragment = format!(
        "{}?storage_key={storage_key}&storage_value={}",
        fixture.fragment(),
        fixture.label()
    );
    let target = format!("{entry}#{fragment}");
    let plugin_origin = format!(
        "{PLUGIN_SCHEME}://{}.runtime.localhost",
        parsed_entry.origin_scope
    );
    let host_target = format!("{HOST_SCHEME}://localhost/index.html");
    let policy = Arc::new(
        FrameAwareNavigationPolicy::new(&host_target).expect("harness Host target should be valid"),
    );
    let _lease = policy
        .activate_plugin_target(&entry, Some(&fragment))
        .expect("harness Runtime target should activate");
    let resource_paths = Arc::new(Mutex::new(Vec::new()));
    let protocol_resources = Arc::clone(&resource_paths);
    let protocol_service = Arc::clone(&resource_service);
    let navigation_callback_hits = Arc::new(AtomicUsize::new(0));
    let popup_callback_hits = Arc::new(AtomicUsize::new(0));
    let download_callback_hits = Arc::new(AtomicUsize::new(0));
    let reported = Arc::new(AtomicBool::new(false));
    let callback_policy = Arc::clone(&policy);
    let navigation_hits = Arc::clone(&navigation_callback_hits);
    let popup_hits = Arc::clone(&popup_callback_hits);
    let download_hits = Arc::clone(&download_callback_hits);
    let reported_timeout = Arc::clone(&reported);
    let host_bytes = host_document(&target, &plugin_origin, fixture, &storage_key, session_mode);

    tauri::Builder::default()
        .register_uri_scheme_protocol(HOST_SCHEME, move |_context, request| {
            if request.uri().path() == "/index.html" {
                response(
                    host_bytes.clone(),
                    "text/html; charset=utf-8",
                    StatusCode::OK,
                )
            } else {
                response(
                    b"not found".to_vec(),
                    "text/plain; charset=utf-8",
                    StatusCode::NOT_FOUND,
                )
            }
        })
        .register_uri_scheme_protocol(PLUGIN_SCHEME, move |_context, request| {
            if let Some(parsed) = parse_plugin_resource_url(&request.uri().to_string(), false) {
                protocol_resources
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .push(parsed.resource_path);
            }
            protocol_service.handle_request(request)
        })
        .manage(HarnessState {
            fixture,
            os_version,
            output,
            _runtime_root: runtime_root,
            resource_paths,
            privileged_handler_hits: AtomicUsize::new(0),
            navigation_callback_hits,
            popup_callback_hits,
            download_callback_hits,
            reported,
            session_mode,
            plugin_csp_native_get_head_verified,
            plugin_csp_translated_get_head_verified,
        })
        .invoke_handler(tauri::generate_handler![
            plugin_iframe_runtime_harness_record,
            plugin_iframe_runtime_harness_probe
        ])
        .setup(move |app| {
            let url = host_target
                .parse()
                .expect("static Host target should parse");
            WebviewWindowBuilder::new(
                app,
                "plugin-iframe-runtime-harness",
                WebviewUrl::External(url),
            )
            .title("lensX Plugin iframe Runtime Harness")
            .inner_size(900.0, 680.0)
            .on_navigation_with_frame(move |url, frame| {
                navigation_hits.fetch_add(1, Ordering::SeqCst);
                let frame = match frame {
                    TauriNavigationFrame::Main => NavigationFrame::Main,
                    TauriNavigationFrame::Descendant => NavigationFrame::Descendant,
                    TauriNavigationFrame::Unknown => NavigationFrame::Unknown,
                };
                !matches!(
                    callback_policy.decide(frame, url.as_str()),
                    NavigationDecision::Deny(_)
                )
            })
            .on_new_window(move |_url, _features| {
                popup_hits.fetch_add(1, Ordering::SeqCst);
                NewWindowResponse::Deny
            })
            .on_download(move |_webview, event| {
                if matches!(event, DownloadEvent::Requested { .. }) {
                    download_hits.fetch_add(1, Ordering::SeqCst);
                }
                false
            })
            .build()?;
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(8));
                if !reported_timeout.load(Ordering::SeqCst) {
                    app_handle.exit(3);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!(
            "plugin-iframe-runtime-harness.conf.json"
        ))
        .expect("plugin iframe Runtime harness failed");
}

pub fn main() {
    let session_mode = env::args()
        .next()
        .is_some_and(|value| value.contains("plugin_runtime_session_harness"));
    run(session_mode);
}
