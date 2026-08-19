use crate::{
    launcher_surface::{
        apply_launcher_surface_target, setup_launcher_surface, LauncherLogicalSize,
        LauncherSurfaceTarget,
    },
    launcher_window::{
        LauncherActivationReason, LauncherWindowAction, LauncherWindowActions, MAIN_WINDOW_LABEL,
    },
    plugin_child_webview_adapter::{
        plugin_child_webview_evidence_bootstrap, send_native_text_input,
        PluginChildWebviewEvidenceIngress, PluginChildWebviewPointerObservation,
    },
    plugin_child_webview_presentation::create_config_lens_evidence_presentation,
    plugin_child_webview_rpc::PluginChildWebviewRpcIngressResult,
    plugin_child_webview_service::{
        setup_plugin_child_webview_service, PluginChildWebviewAttempt,
        PluginChildWebviewPresentationResult, PluginChildWebviewReadyDispatcher,
        PluginChildWebviewReadyFacts, PluginChildWebviewRpcCancellationFacts,
        PluginChildWebviewRpcDispatchFacts, PluginChildWebviewRpcDispatcher,
        PluginChildWebviewService, PluginChildWebviewState, PluginChildWebviewWaitReadiness,
    },
    plugin_development_snapshot::DevelopmentSnapshotStore,
    plugin_identity::plugin_record_key,
    plugin_manager::{
        current_plugin_host_versions, PackageDigest, PluginManager, PluginRegistrationFacts,
        PluginSource,
    },
    plugin_manifest::{validate_plugin_manifest, NormalizedPluginManifest},
    plugin_registration::healthy_entry_id,
    plugin_resource_service::{handle_plugin_resource_protocol, PluginResourceService},
    plugin_runtime_stage::{
        attach_plugin_runtime_stage_observer, record_plugin_runtime_stage, PluginRuntimeStage,
        PluginRuntimeStageObserver,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Condvar, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    webview::WebviewBuilder,
    window::WindowBuilder,
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
};

#[cfg(target_os = "macos")]
use {
    block2::RcBlock,
    core_graphics::{
        display::CGDisplay,
        event::{CGEvent, CGEventTapLocation, CGEventType, CGMouseButton},
        event_source::{CGEventSource, CGEventSourceStateID},
        geometry::CGPoint,
    },
    objc2::{rc::Retained, runtime::AnyObject, MainThreadMarker},
    objc2_app_kit::{NSApplication, NSCursor, NSEvent, NSEventMask, NSWindow},
    objc2_foundation::{NSPoint, NSRect, NSSize},
    std::{
        ptr::NonNull,
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc,
        },
    },
};

const HOST_SCHEME: &str = "lensx-runtime-harness";
const POINTER_MONACO_SCHEME: &str = "lensx-pointer-monaco";
const POINTER_PLAIN_SCHEME: &str = "lensx-pointer-plain";
const POINTER_CASE_A_LABEL: &str = "pointer-case-a";
const POINTER_CASE_D1_LABEL: &str = "pointer-case-d1";
const POINTER_CASE_B_HOST_LABEL: &str = "pointer-case-b-host";
const POINTER_CASE_B_CHILD_LABEL: &str = "pointer-case-b-child";

fn dispatch_launcher_action_on_main(app: &AppHandle<Wry>, action: LauncherWindowAction) -> bool {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let main_app = app.clone();
    app.run_on_main_thread(move || {
        let result = main_app
            .state::<LauncherWindowActions>()
            .dispatch(&main_app, action)
            .is_ok();
        let _ = sender.send(result);
    })
    .is_ok()
        && receiver
            .recv_timeout(Duration::from_secs(2))
            .unwrap_or(false)
}
const HOST_DOCUMENT: &[u8] = br#"<!doctype html><meta charset="utf-8"><title>lensX target macOS product-path evidence</title><script>
let previous = performance.now();
setInterval(() => {
  const current = performance.now();
  window.__TAURI_INTERNALS__.invoke('config_lens_cold_open_heartbeat', { gapMs: current - previous }).catch(() => {});
  previous = current;
}, 10);
addEventListener('mousemove', () => {
  window.__TAURI_INTERNALS__.invoke('config_lens_cold_open_host_pointer_move').catch(() => {});
}, { capture: true });
</script>"#;
const POINTER_PLAIN_DOCUMENT: &[u8] = br##"<!doctype html>
<meta charset="utf-8">
<title>lensX maintained generic Child WKWebView pointer fixture</title>
<style>
html,body{width:100%;height:100%;margin:0;overflow:hidden;font:14px -apple-system;color:#1f2329;background:#fff}
main{position:relative;width:800px;height:600px}
.editor{position:absolute;inset:0 0 80px 0;border:1px solid #d9d9d9;box-sizing:border-box}
.gutter{position:absolute;inset:0 auto 0 0;width:60px;background:#f5f6f7;cursor:default}
.text{position:absolute;inset:0 40px 0 60px;padding:80px 20px;box-sizing:border-box;white-space:pre;cursor:text}
.scrollbar{position:absolute;inset:0 0 0 auto;width:40px;background:#eef0f3;cursor:default}
.overlay{position:absolute;top:60px;left:60px;width:700px;height:24px;background:#fff;cursor:default}
footer{position:absolute;inset:auto 0 0 0;height:80px;border-top:1px solid #d9d9d9}
a{position:absolute;left:510px;top:28px;cursor:pointer}
button{position:absolute;left:660px;top:20px;width:100px;height:36px;cursor:default}
</style>
<main>
  <section class="editor">
    <div class="gutter" data-pointer-region="gutter"></div>
    <pre class="text" data-pointer-region="editor_text">ConfigLens pointer fixture
This maintained plain-text surface contains no user content.</pre>
    <div class="scrollbar" data-pointer-region="scrollbar"></div>
    <div class="overlay" data-pointer-region="overlay"></div>
  </section>
  <footer>
    <a data-pointer-region="link" href="#maintained">Maintained fixture</a>
    <button data-pointer-region="footer_control" type="button">Format</button>
  </footer>
</main>"##;

static HEARTBEATS: Mutex<Vec<f64>> = Mutex::new(Vec::new());

#[cfg(target_os = "macos")]
static HOST_POINTER_MOVE_COUNT: AtomicUsize = AtomicUsize::new(0);

#[cfg(target_os = "macos")]
static APPKIT_ORACLE_DELIVERY_COUNT: AtomicUsize = AtomicUsize::new(0);

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightPostEventAccess() -> bool;
    fn pthread_main_np() -> std::os::raw::c_int;
}

#[tauri::command]
fn config_lens_cold_open_heartbeat(gap_ms: f64) {
    if gap_ms.is_finite() && (0.0..=60_000.0).contains(&gap_ms) {
        HEARTBEATS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(gap_ms);
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn config_lens_cold_open_host_pointer_move() {
    let _ = HOST_POINTER_MOVE_COUNT.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |count| {
        (count < 256).then_some(count + 1)
    });
}

#[derive(Clone, Debug)]
pub struct ConfigLensColdOpenHarnessInput {
    pub profile: String,
    pub candidate: PathBuf,
    pub root: PathBuf,
    pub output: PathBuf,
    pub samples: usize,
    pub cursor_repetitions: usize,
}

#[derive(Default)]
struct StageState {
    expected_source: Option<String>,
    stages: BTreeMap<String, f64>,
    stage_counts: BTreeMap<String, usize>,
}

#[derive(Default)]
struct StageCollector {
    state: Mutex<StageState>,
    changed: Condvar,
    pointer_observations: Mutex<VecDeque<PluginChildWebviewPointerObservation>>,
    pointer_changed: Condvar,
}

impl StageCollector {
    fn reset(&self) {
        *self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = StageState::default();
        self.pointer_observations
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
    }

    fn expect_source(&self, source: String) {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .expected_source = Some(source);
    }

    fn record(&self, stage: &str, duration: Duration) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state
            .stages
            .insert(stage.to_owned(), duration.as_secs_f64() * 1000.0);
        *state.stage_counts.entry(stage.to_owned()).or_default() += 1;
        self.changed.notify_all();
    }

    fn wait(&self, stage: &str, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        while !state.stages.contains_key(stage) {
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                return false;
            };
            let (next, result) = self
                .changed
                .wait_timeout(state, remaining)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state = next;
            if result.timed_out() && !state.stages.contains_key(stage) {
                return false;
            }
        }
        true
    }

    fn snapshot(&self) -> BTreeMap<String, f64> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .stages
            .clone()
    }

    fn count(&self, stage: &str) -> usize {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .stage_counts
            .get(stage)
            .copied()
            .unwrap_or_default()
    }

    fn wait_pointer(
        &self,
        sequence: u16,
        timeout: Duration,
    ) -> Option<PluginChildWebviewPointerObservation> {
        let deadline = Instant::now() + timeout;
        let mut observations = self
            .pointer_observations
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        loop {
            if let Some(index) = observations
                .iter()
                .position(|observation| observation.sequence == sequence)
            {
                return observations.remove(index);
            }
            let remaining = deadline.checked_duration_since(Instant::now())?;
            let (next, result) = self
                .pointer_changed
                .wait_timeout(observations, remaining)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            observations = next;
            if result.timed_out() {
                return None;
            }
        }
    }
}

impl PluginRuntimeStageObserver for StageCollector {
    fn observe(&self, stage: PluginRuntimeStage, duration: Duration) {
        self.record(stage.as_str(), duration);
    }
}

impl PluginChildWebviewEvidenceIngress for StageCollector {
    fn observe(&self, actual_source_label: &str, stage: &str, duration: Duration) {
        let current = {
            self.state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .expected_source
                .as_deref()
                == Some(actual_source_label)
        };
        if current {
            self.record(stage, duration);
        }
    }

    fn observe_pointer(
        &self,
        actual_source_label: &str,
        observation: PluginChildWebviewPointerObservation,
    ) {
        let expected = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .expected_source
            .clone();
        let current = expected.as_deref() == Some(actual_source_label);
        if current {
            self.pointer_observations
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push_back(observation);
            self.pointer_changed.notify_all();
        } else {
            eprintln!(
                "ConfigLens cursor harness ignored pointer source: expected={} actual={actual_source_label}",
                expected.as_deref().unwrap_or("none")
            );
        }
    }
}

struct HarnessDispatcher {
    service: Arc<PluginChildWebviewService<Wry>>,
}

impl PluginChildWebviewReadyDispatcher for HarnessDispatcher {
    fn accept_ready(&self, _facts: &PluginChildWebviewReadyFacts) -> bool {
        true
    }
}

impl PluginChildWebviewRpcDispatcher for HarnessDispatcher {
    fn dispatch(&self, facts: &PluginChildWebviewRpcDispatchFacts) -> bool {
        if facts.method != "runtime.get_context" {
            return false;
        }
        self.service.settle_rpc_dispatch(
            facts.attempt,
            &facts.source_label,
            &facts.request_id,
            json!({
                "method": "runtime.get_context",
                "result": {
                    "hostApiVersion": "0.2.0",
                    "locale": "en-US",
                    "theme": "light",
                    "capabilities": ["runtime.get_context"]
                }
            }),
        ) == PluginChildWebviewRpcIngressResult::Responded
    }

    fn cancel(&self, _facts: &PluginChildWebviewRpcCancellationFacts) {}
    fn disconnect(&self, _attempt: PluginChildWebviewAttempt, _plugin_id: &str) {}
}

#[derive(Serialize)]
struct TerminalCleanup {
    webviews_absent: bool,
    sessions_absent: bool,
    workers_absent: bool,
    bridge_authority_absent: bool,
    resource_authority_absent: bool,
}

#[derive(Serialize)]
struct ColdSample {
    stage_ms: BTreeMap<String, f64>,
    terminal_cleanup: TerminalCleanup,
}

#[derive(Serialize)]
struct RestoreSample {
    restore_ms: f64,
}

#[derive(Clone, Serialize)]
struct LauncherLifecycleEvidence {
    home_650x320: bool,
    page_800x600: bool,
    page_resizable: bool,
    user_resize_1000x720: bool,
    same_user_size_restored: bool,
    close_home_650x320_before_teardown: bool,
    close_home_non_resizable: bool,
    reopen_initial_800x600: bool,
    user_size_not_persisted: bool,
    cmd_w_native_window_hidden: bool,
    cmd_w_process_alive: bool,
    focus_loss_native_window_hidden: bool,
    no_host_visible_plugin_hidden_blank_state: bool,
    global_shortcut_native_window_restored: bool,
    same_child_webview_restored: bool,
    same_runtime_attempt_restored: bool,
    same_session_restored: bool,
    monaco_model_not_reloaded: bool,
    worker_not_recreated: bool,
    page_close_destroyed_attempt: bool,
    zero_native_bridge_resource_authority: bool,
}

#[derive(Serialize)]
struct HarnessOutput {
    evidence_version: &'static str,
    profile: String,
    cold_samples: Vec<ColdSample>,
    restore_samples: Vec<RestoreSample>,
    heartbeat_gaps_ms: Vec<f64>,
    production_components: BTreeMap<&'static str, bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    launcher_lifecycle: Option<LauncherLifecycleEvidence>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pointer_oracle: Vec<AppKitCursorOracleEvidence>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pointer_cases: Vec<PointerCursorCaseEvidence>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pointer_host_controls: Vec<PointerCursorCaseEvidence>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pointer_host_seeded_controls: Vec<PointerCursorCaseEvidence>,
}

#[derive(Clone, Debug, Serialize)]
struct AppKitCursorOracleSample {
    sequence: u16,
    semantic_region: &'static str,
    expected_cursor: &'static str,
    native_cursor: &'static str,
    event_delivered: bool,
    elapsed_ms: f64,
}

#[derive(Clone, Debug, Serialize)]
struct AppKitCursorOracleEvidence {
    case_id: &'static str,
    repetition: usize,
    macos_version: String,
    execution_mode: String,
    operator_approved: bool,
    public_core_graphics_event_source: bool,
    post_event_access: bool,
    local_event_monitor: bool,
    temporary_profile: bool,
    graceful_shutdown: bool,
    pointer_restored: bool,
    monitor_removed: bool,
    cursor_rects_removed: bool,
    samples: Vec<AppKitCursorOracleSample>,
}

#[derive(Clone, Deserialize)]
struct PointerTrajectoryFixture {
    fixture_version: String,
    matrix_cases: Vec<String>,
    appkit_oracle: Vec<AppKitOracleFixturePoint>,
    viewport: PointerViewport,
    web_establishment: PointerEstablishmentFixture,
    editor_fixture: String,
    plain_text_fixture: String,
    trajectory: Vec<PointerTrajectoryPoint>,
}

#[derive(Clone, Deserialize)]
struct PointerEstablishmentFixture {
    maximum_event_count: usize,
    required_consecutive_ibeam: usize,
    snapshot_offsets_ms: Vec<u64>,
    points: Vec<PointerEstablishmentPoint>,
}

#[derive(Clone, Deserialize)]
struct PointerEstablishmentPoint {
    x: f64,
    y: f64,
}

#[derive(Clone, Deserialize)]
struct AppKitOracleFixturePoint {
    sequence: u16,
    region: String,
    expected_cursor: String,
}

#[derive(Clone, Deserialize)]
struct PointerViewport {
    width: u32,
    height: u32,
}

#[derive(Clone, Deserialize)]
struct PointerTrajectoryPoint {
    sequence: u16,
    region: String,
    x: f64,
    y: f64,
}

#[derive(Clone, Serialize)]
struct PointerCursorEnvironment {
    macos_version: String,
    webkit_version: String,
    tauri_version: &'static str,
    wry_version: &'static str,
    device_scale_factor: f64,
    viewport_width: f64,
    viewport_height: f64,
}

#[derive(Clone, Serialize)]
struct PointerCursorSample {
    sequence: u16,
    semantic_region: String,
    computed_cursor: String,
    event_delivered: bool,
    main_run_loop_heartbeat: bool,
    native_cursor_snapshots: Vec<PointerNativeCursorSnapshot>,
    document_identity: String,
    editor_identity: String,
    child_identity: String,
    session_identity: String,
    presentation_attempt: String,
    bounds_revision: u64,
    elapsed_ms: f64,
}

#[derive(Clone, Serialize)]
struct PointerNativeCursorSnapshot {
    offset_ms: u64,
    native_cursor: &'static str,
}

#[derive(Clone, Serialize)]
struct PointerCursorEstablishmentSample {
    sequence: u16,
    semantic_region: String,
    computed_cursor: String,
    native_cursor: &'static str,
    event_delivered: bool,
    main_run_loop_heartbeat: bool,
    document_identity: String,
    editor_identity: String,
    child_identity: String,
    session_identity: String,
    presentation_attempt: String,
    bounds_revision: u64,
    elapsed_ms: f64,
}

#[derive(Clone, Serialize)]
struct PointerCursorEstablishment {
    maximum_event_count: usize,
    required_consecutive_ibeam: usize,
    established: bool,
    first_ibeam_elapsed_ms: Option<f64>,
    established_elapsed_ms: Option<f64>,
    samples: Vec<PointerCursorEstablishmentSample>,
}

#[derive(Clone, Serialize)]
struct PointerCursorCaseEvidence {
    case_id: &'static str,
    repetition: usize,
    environment: PointerCursorEnvironment,
    execution_mode: String,
    operator_approved: bool,
    public_core_graphics_event_source: bool,
    post_event_access: bool,
    local_event_monitor: bool,
    monitor_removed: bool,
    content_view_flipped: bool,
    container_kind: &'static str,
    host_participation_mode: &'static str,
    host_isolation_mechanism: &'static str,
    host_move_delivery_count: usize,
    child_move_delivery_count: usize,
    host_establishment_move_delivery_count: usize,
    child_establishment_move_delivery_count: usize,
    host_steady_state_move_delivery_count: usize,
    child_steady_state_move_delivery_count: usize,
    host_restored: bool,
    host_restored_before_steady_state: bool,
    pre_steady_state_main_run_loop_heartbeat: bool,
    establishment: PointerCursorEstablishment,
    temporary_profile: bool,
    graceful_shutdown: bool,
    pointer_restored: bool,
    samples: Vec<PointerCursorSample>,
}

#[derive(Clone)]
struct PointerIdentity {
    child_identity: String,
    session_identity: String,
    presentation_attempt: String,
    bounds_revision: u64,
}

fn pointer_fixture() -> Result<PointerTrajectoryFixture, ()> {
    let fixture = serde_json::from_str::<PointerTrajectoryFixture>(include_str!(
        "../../fixtures/plugin-pointer-cursor/cases.json"
    ))
    .map_err(|_| ())?;
    let expected_matrix = [
        "appkit-oracle",
        "top-level-plain-text",
        "top-level-monaco",
        "generic-child-text",
        "production-config-lens",
    ];
    let expected_oracle = [
        ("text", "ibeam"),
        ("arrow", "arrow"),
        ("link", "pointing_hand"),
        ("column_resize", "resize_horizontal"),
        ("row_resize", "resize_vertical"),
    ];
    if fixture.fixture_version != "0.7.0"
        || fixture.matrix_cases != expected_matrix
        || fixture.appkit_oracle.len() != expected_oracle.len()
        || fixture
            .appkit_oracle
            .iter()
            .zip(expected_oracle)
            .enumerate()
            .any(|(index, (actual, expected))| {
                actual.sequence != index as u16 + 1
                    || actual.region != expected.0
                    || actual.expected_cursor != expected.1
            })
        || fixture.viewport.width != 800
        || fixture.viewport.height != 600
        || fixture.web_establishment.maximum_event_count != 12
        || fixture.web_establishment.required_consecutive_ibeam != 3
        || fixture.web_establishment.snapshot_offsets_ms != [5, 20, 35]
        || fixture.web_establishment.points.len() != 12
        || fixture
            .web_establishment
            .points
            .iter()
            .zip([
                (160.0, 96.0),
                (220.0, 112.0),
                (280.0, 128.0),
                (340.0, 144.0),
                (400.0, 160.0),
                (460.0, 176.0),
                (520.0, 192.0),
                (580.0, 208.0),
                (620.0, 224.0),
                (560.0, 240.0),
                (480.0, 256.0),
                (400.0, 272.0),
            ])
            .any(|(actual, expected)| actual.x != expected.0 || actual.y != expected.1)
        || fixture.editor_fixture != "editor.json"
        || fixture.plain_text_fixture != "surface.txt"
        || fixture.trajectory.len() != 18
        || fixture
            .trajectory
            .iter()
            .enumerate()
            .any(|(index, point)| point.sequence != index as u16 + 1)
    {
        return Err(());
    }
    Ok(fixture)
}

fn macos_version() -> String {
    Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty() && value.len() <= 64)
        .unwrap_or_else(|| "unknown".to_owned())
}

#[cfg(target_os = "macos")]
fn classify_native_cursor() -> &'static str {
    let current = NSCursor::currentCursor();
    let same = |candidate: objc2::rc::Retained<NSCursor>| std::ptr::eq(&*current, &*candidate);
    if same(NSCursor::IBeamCursor()) {
        "ibeam"
    } else if same(NSCursor::arrowCursor()) {
        "arrow"
    } else if same(NSCursor::pointingHandCursor()) {
        "pointing_hand"
    } else if same(NSCursor::columnResizeCursor()) {
        "resize_horizontal"
    } else if same(NSCursor::rowResizeCursor()) {
        "resize_vertical"
    } else {
        "unknown"
    }
}

fn validate_appkit_cursor_oracle(
    evidence: &AppKitCursorOracleEvidence,
) -> Result<(), &'static str> {
    if !evidence.operator_approved
        || !evidence.public_core_graphics_event_source
        || !evidence.post_event_access
        || !evidence.local_event_monitor
    {
        return Err("oracle_environment_invalid");
    }
    if evidence.samples.len() != 5
        || evidence
            .samples
            .iter()
            .enumerate()
            .any(|(index, sample)| sample.sequence != index as u16 + 1)
    {
        return Err("oracle_sequence_invalid");
    }
    if evidence
        .samples
        .iter()
        .any(|sample| !sample.event_delivered)
    {
        return Err("oracle_delivery_missing");
    }
    if evidence
        .samples
        .iter()
        .any(|sample| sample.native_cursor != sample.expected_cursor)
    {
        return Err("oracle_cursor_mismatch");
    }
    if !evidence.graceful_shutdown
        || !evidence.pointer_restored
        || !evidence.monitor_removed
        || !evidence.cursor_rects_removed
    {
        return Err("oracle_cleanup_incomplete");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
#[derive(Clone, Copy)]
struct AppKitOracleTarget {
    semantic_region: &'static str,
    expected_cursor: &'static str,
    global_point: CGPoint,
}

#[cfg(target_os = "macos")]
fn install_appkit_mouse_delivery_monitor() -> Result<usize, &'static str> {
    APPKIT_ORACLE_DELIVERY_COUNT.store(0, Ordering::SeqCst);
    let monitor_block = RcBlock::new(|event: NonNull<NSEvent>| -> *mut NSEvent {
        APPKIT_ORACLE_DELIVERY_COUNT.fetch_add(1, Ordering::SeqCst);
        event.as_ptr()
    });
    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(
            NSEventMask::MouseMoved,
            &monitor_block,
        )
    }
    .ok_or("oracle_local_monitor_unavailable")?;
    Ok(Retained::into_raw(monitor) as usize)
}

#[cfg(target_os = "macos")]
fn remove_appkit_mouse_delivery_monitor(monitor_pointer: usize) -> bool {
    let Some(monitor) =
        (unsafe { Retained::<AnyObject>::from_raw(monitor_pointer as *mut AnyObject) })
    else {
        return false;
    };
    unsafe { NSEvent::removeMonitor(&monitor) };
    true
}

#[cfg(target_os = "macos")]
fn activate_pointer_harness_application() -> Result<(), &'static str> {
    let marker = MainThreadMarker::new().ok_or("pointer_main_thread_marker_missing")?;
    NSApplication::sharedApplication(marker).activate();
    Ok(())
}

#[cfg(target_os = "macos")]
fn setup_appkit_cursor_oracle(
    ns_window_pointer: usize,
) -> Result<(usize, Vec<AppKitOracleTarget>), &'static str> {
    activate_pointer_harness_application()?;
    let window: &NSWindow = unsafe { &*(ns_window_pointer as *mut NSWindow) };
    let content = window.contentView().ok_or("oracle_content_view_missing")?;
    let frame = content.frame();
    if frame.size.width < 760.0 || frame.size.height < 200.0 {
        return Err("oracle_content_bounds_invalid");
    }
    window.makeKeyAndOrderFront(None);
    window.setAcceptsMouseMovedEvents(true);
    content.discardCursorRects();

    let regions = [
        ("text", "ibeam", 40.0, NSCursor::IBeamCursor()),
        ("arrow", "arrow", 190.0, NSCursor::arrowCursor()),
        (
            "link",
            "pointing_hand",
            340.0,
            NSCursor::pointingHandCursor(),
        ),
        (
            "column_resize",
            "resize_horizontal",
            490.0,
            NSCursor::columnResizeCursor(),
        ),
        (
            "row_resize",
            "resize_vertical",
            640.0,
            NSCursor::rowResizeCursor(),
        ),
    ];
    let main_display_height = CGDisplay::main().bounds().size.height;
    let y = frame.size.height / 2.0;
    let mut targets = Vec::with_capacity(regions.len());
    for (semantic_region, expected_cursor, x, cursor) in regions {
        let rect = NSRect::new(NSPoint::new(x, y - 50.0), NSSize::new(120.0, 100.0));
        content.addCursorRect_cursor(rect, &cursor);
        let window_point = content.convertPoint_toView(NSPoint::new(x + 60.0, y), None);
        let screen_point = window.convertPointToScreen(window_point);
        targets.push(AppKitOracleTarget {
            semantic_region,
            expected_cursor,
            global_point: CGPoint::new(screen_point.x, main_display_height - screen_point.y),
        });
    }

    Ok((install_appkit_mouse_delivery_monitor()?, targets))
}

#[cfg(target_os = "macos")]
fn cleanup_appkit_cursor_oracle(ns_window_pointer: usize, monitor_pointer: usize) -> (bool, bool) {
    let monitor_removed = remove_appkit_mouse_delivery_monitor(monitor_pointer);
    let window: &NSWindow = unsafe { &*(ns_window_pointer as *mut NSWindow) };
    let cursor_rects_removed = window.contentView().is_some_and(|content| {
        content.discardCursorRects();
        true
    });
    window.setAcceptsMouseMovedEvents(false);
    (monitor_removed, cursor_rects_removed)
}

#[cfg(target_os = "macos")]
fn setup_web_pointer_stimulus(
    ns_window_pointer: usize,
    logical_points: &[(f64, f64)],
) -> Result<(usize, Vec<CGPoint>, bool), &'static str> {
    activate_pointer_harness_application()?;
    let window: &NSWindow = unsafe { &*(ns_window_pointer as *mut NSWindow) };
    let content = window.contentView().ok_or("pointer_content_view_missing")?;
    let frame = content.frame();
    if frame.size.width < 799.0 || frame.size.height < 300.0 {
        return Err("pointer_content_bounds_invalid");
    }
    window.makeKeyAndOrderFront(None);
    window.setAcceptsMouseMovedEvents(true);
    let content_view_flipped = content.isFlipped();
    let main_display_height = CGDisplay::main().bounds().size.height;
    let points = logical_points
        .iter()
        .map(|(x, y)| {
            let local_y = if content_view_flipped {
                *y
            } else {
                frame.size.height - *y
            };
            let window_point = content.convertPoint_toView(NSPoint::new(*x, local_y), None);
            let screen_point = window.convertPointToScreen(window_point);
            CGPoint::new(screen_point.x, main_display_height - screen_point.y)
        })
        .collect();
    Ok((
        install_appkit_mouse_delivery_monitor()?,
        points,
        content_view_flipped,
    ))
}

#[cfg(target_os = "macos")]
fn cleanup_web_pointer_stimulus(ns_window_pointer: usize, monitor_pointer: usize) -> bool {
    let monitor_removed = remove_appkit_mouse_delivery_monitor(monitor_pointer);
    let window: &NSWindow = unsafe { &*(ns_window_pointer as *mut NSWindow) };
    window.setAcceptsMouseMovedEvents(false);
    monitor_removed
}

#[cfg(target_os = "macos")]
fn wait_for_appkit_oracle_delivery(previous_count: usize, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while APPKIT_ORACLE_DELIVERY_COUNT.load(Ordering::SeqCst) <= previous_count {
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(5));
    }
    true
}

#[cfg(target_os = "macos")]
fn wait_for_main_run_loop_heartbeat(window: &tauri::Window<Wry>, timeout: Duration) -> bool {
    let (sender, receiver) = mpsc::channel();
    window
        .run_on_main_thread(move || {
            let _ = sender.send(());
        })
        .is_ok()
        && receiver.recv_timeout(timeout).is_ok()
}

#[cfg(target_os = "macos")]
fn sample_native_cursor_timeline(offsets_ms: &[u64]) -> Vec<PointerNativeCursorSnapshot> {
    let started = Instant::now();
    offsets_ms
        .iter()
        .map(|offset_ms| {
            let target = Duration::from_millis(*offset_ms);
            if let Some(remaining) = target.checked_sub(started.elapsed()) {
                thread::sleep(remaining);
            }
            PointerNativeCursorSnapshot {
                offset_ms: *offset_ms,
                native_cursor: classify_native_cursor(),
            }
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn run_appkit_cursor_oracle_case(
    app: &tauri::AppHandle<Wry>,
    repetition: usize,
) -> Result<AppKitCursorOracleEvidence, &'static str> {
    let execution_mode =
        std::env::var("LENSX_MACOS_CURSOR_EXECUTION_MODE").map_err(|_| "execution_mode_missing")?;
    if !matches!(
        execution_mode.as_str(),
        "dedicated_session" | "operator_approved_quiescent_desktop"
    ) || std::env::var("LENSX_MACOS_CURSOR_OPERATOR_APPROVED").as_deref() != Ok("1")
    {
        return Err("operator_approval_missing");
    }
    pointer_fixture().map_err(|()| "pointer_fixture_invalid")?;
    let post_event_access = unsafe { CGPreflightPostEventAccess() };
    if !post_event_access {
        return Err("post_event_access_missing");
    }
    let event_source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .map_err(|()| "event_source_failed")?;
    let initial_cursor = CGEvent::new(event_source.clone())
        .map_err(|()| "cursor_snapshot_failed")?
        .location();
    let window_label = format!("pointer-appkit-oracle-{repetition}");
    let window = WindowBuilder::new(app, window_label)
        .title("lensX AppKit cursor oracle")
        .inner_size(800.0, 600.0)
        .resizable(false)
        .build()
        .map_err(|error| {
            eprintln!("ConfigLens AppKit cursor oracle window build failed: {error}");
            "oracle_window_build_failed"
        })?;
    window
        .set_focus()
        .map_err(|_| "oracle_window_focus_failed")?;
    thread::sleep(Duration::from_millis(150));

    let ns_window_pointer = window
        .ns_window()
        .map_err(|_| "oracle_native_window_missing")? as usize;
    let (setup_sender, setup_receiver) = mpsc::sync_channel(1);
    window
        .run_on_main_thread(move || {
            let _ = setup_sender.send(setup_appkit_cursor_oracle(ns_window_pointer));
        })
        .map_err(|_| "oracle_main_thread_setup_failed")?;
    let (monitor_pointer, targets) = setup_receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "oracle_setup_timeout")??;
    thread::sleep(Duration::from_millis(150));

    let started = Instant::now();
    let mut samples = Vec::with_capacity(targets.len());
    for (index, target) in targets.iter().enumerate() {
        let previous_count = APPKIT_ORACLE_DELIVERY_COUNT.load(Ordering::SeqCst);
        let event = CGEvent::new_mouse_event(
            event_source.clone(),
            CGEventType::MouseMoved,
            target.global_point,
            CGMouseButton::Left,
        );
        let event_created = match event {
            Ok(event) => {
                event.post(CGEventTapLocation::HID);
                true
            }
            Err(()) => false,
        };
        let event_delivered = event_created
            && wait_for_appkit_oracle_delivery(previous_count, Duration::from_millis(500));
        thread::sleep(Duration::from_millis(35));
        samples.push(AppKitCursorOracleSample {
            sequence: index as u16 + 1,
            semantic_region: target.semantic_region,
            expected_cursor: target.expected_cursor,
            native_cursor: classify_native_cursor(),
            event_delivered,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        });
    }

    let (cleanup_sender, cleanup_receiver) = mpsc::sync_channel(1);
    window
        .run_on_main_thread(move || {
            let _ = cleanup_sender.send(cleanup_appkit_cursor_oracle(
                ns_window_pointer,
                monitor_pointer,
            ));
        })
        .map_err(|_| "oracle_main_thread_cleanup_failed")?;
    let (monitor_removed, cursor_rects_removed) = cleanup_receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "oracle_cleanup_timeout")?;
    let pointer_restored = CGEvent::new_mouse_event(
        event_source,
        CGEventType::MouseMoved,
        initial_cursor,
        CGMouseButton::Left,
    )
    .map(|event| event.post(CGEventTapLocation::HID))
    .is_ok();
    let graceful_shutdown = window.close().is_ok();
    let evidence = AppKitCursorOracleEvidence {
        case_id: "appkit-oracle",
        repetition,
        macos_version: macos_version(),
        execution_mode,
        operator_approved: true,
        public_core_graphics_event_source: true,
        post_event_access,
        local_event_monitor: true,
        temporary_profile: true,
        graceful_shutdown,
        pointer_restored,
        monitor_removed,
        cursor_rects_removed,
        samples,
    };
    if let Err(error) = validate_appkit_cursor_oracle(&evidence) {
        let diagnostic = evidence
            .samples
            .iter()
            .map(|sample| {
                format!(
                    "{}:{}>{}:delivered={}",
                    sample.semantic_region,
                    sample.expected_cursor,
                    sample.native_cursor,
                    sample.event_delivered
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        eprintln!("ConfigLens AppKit cursor oracle diagnostic: {error} [{diagnostic}]");
        return Err(error);
    }
    Ok(evidence)
}

#[cfg(target_os = "macos")]
fn run_repeated_appkit_cursor_oracle(
    app: &tauri::AppHandle<Wry>,
    repetitions: usize,
) -> Result<Vec<AppKitCursorOracleEvidence>, &'static str> {
    (1..=repetitions)
        .map(|repetition| run_appkit_cursor_oracle_case(app, repetition))
        .collect()
}

fn sample_pointer_trajectory(
    app: &tauri::AppHandle<Wry>,
    case_id: &'static str,
    host_participation_mode: &'static str,
    repetition: usize,
    window_label: &str,
    webview_label: &str,
    collector: &StageCollector,
    identity: PointerIdentity,
) -> Result<PointerCursorCaseEvidence, &'static str> {
    let execution_mode =
        std::env::var("LENSX_MACOS_CURSOR_EXECUTION_MODE").map_err(|_| "execution_mode_missing")?;
    if !matches!(
        execution_mode.as_str(),
        "dedicated_session" | "operator_approved_quiescent_desktop"
    ) || std::env::var("LENSX_MACOS_CURSOR_OPERATOR_APPROVED").as_deref() != Ok("1")
    {
        return Err("operator_approval_missing");
    }
    if unsafe { pthread_main_np() } != 0 {
        return Err("pointer_sampler_main_thread");
    }
    let post_event_access = unsafe { CGPreflightPostEventAccess() };
    if !post_event_access {
        return Err("post_event_access_missing");
    }
    let fixture = pointer_fixture().map_err(|()| "pointer_fixture_invalid")?;
    let window = app.get_window(window_label).ok_or("window_lookup_failed")?;
    let webview = app
        .get_webview(webview_label)
        .ok_or("webview_lookup_failed")?;
    if host_participation_mode != "not_applicable" {
        HOST_POINTER_MOVE_COUNT.store(0, Ordering::SeqCst);
        webview
            .eval("globalThis.__LENSX_PLUGIN_EVIDENCE_RESET_MOVE_DELIVERY__?.()")
            .map_err(|_| "pointer_move_delivery_reset_failed")?;
    }
    let event_source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .map_err(|()| "event_source_failed")?;
    let initial_cursor = CGEvent::new(event_source.clone())
        .map_err(|()| "cursor_snapshot_failed")?
        .location();
    window.set_focus().map_err(|_| "window_focus_failed")?;
    webview.set_focus().map_err(|_| "webview_focus_failed")?;
    let ns_window_pointer = window.ns_window().map_err(|_| "native_window_missing")? as usize;
    let establishment_point_count = fixture.web_establishment.points.len();
    let logical_points = fixture
        .web_establishment
        .points
        .iter()
        .map(|point| (point.x, point.y))
        .chain(fixture.trajectory.iter().map(|point| (point.x, point.y)))
        .collect::<Vec<_>>();
    let (setup_sender, setup_receiver) = mpsc::sync_channel(1);
    window
        .run_on_main_thread(move || {
            let _ = setup_sender.send(setup_web_pointer_stimulus(
                ns_window_pointer,
                &logical_points,
            ));
        })
        .map_err(|_| "pointer_main_thread_setup_failed")?;
    let (monitor_pointer, global_points, content_view_flipped) = setup_receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "pointer_setup_timeout")??;
    thread::sleep(Duration::from_millis(150));
    let (establishment_global_points, global_points) =
        global_points.split_at(establishment_point_count);
    let started = Instant::now();
    let mut establishment_samples = Vec::new();
    let mut consecutive_ibeam = 0;
    let mut first_ibeam_elapsed_ms = None;
    let mut established_elapsed_ms = None;
    let mut samples = Vec::new();
    let mut environment = None;
    let mut child_move_delivery_count = 0;
    let mut sampling_error = None;
    for (index, (point, global_point)) in fixture
        .web_establishment
        .points
        .iter()
        .zip(establishment_global_points)
        .enumerate()
    {
        let previous_count = APPKIT_ORACLE_DELIVERY_COUNT.load(Ordering::SeqCst);
        let event_created = CGEvent::new_mouse_event(
            event_source.clone(),
            CGEventType::MouseMoved,
            *global_point,
            CGMouseButton::Left,
        )
        .map(|event| event.post(CGEventTapLocation::HID))
        .is_ok();
        let event_delivered = event_created
            && wait_for_appkit_oracle_delivery(previous_count, Duration::from_millis(500));
        let main_run_loop_heartbeat =
            wait_for_main_run_loop_heartbeat(&window, Duration::from_millis(500));
        let native_cursor = if main_run_loop_heartbeat {
            sample_native_cursor_timeline(&fixture.web_establishment.snapshot_offsets_ms)
                .last()
                .map_or("unknown", |snapshot| snapshot.native_cursor)
        } else {
            "unknown"
        };
        let sequence = index as u16 + 1;
        if webview
            .eval(format!(
                "globalThis.__LENSX_PLUGIN_EVIDENCE_SAMPLE_POINTER__?.({}, {}, {})",
                sequence, point.x, point.y
            ))
            .is_err()
        {
            sampling_error = Some("webview_establishment_eval_failed");
            break;
        }
        let observation = match collector.wait_pointer(sequence, Duration::from_secs(2)) {
            Some(observation) => observation,
            None => {
                sampling_error = Some("pointer_establishment_observation_timeout");
                break;
            }
        };
        if environment.is_none() {
            environment = Some(PointerCursorEnvironment {
                macos_version: macos_version(),
                webkit_version: observation.webkit_version.clone(),
                tauri_version: "2.11.5",
                wry_version: "0.55.1",
                device_scale_factor: observation.device_scale_factor,
                viewport_width: observation.viewport_width,
                viewport_height: observation.viewport_height,
            });
        }
        child_move_delivery_count = child_move_delivery_count.max(observation.move_delivery_count);
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        let valid_ibeam = event_delivered
            && main_run_loop_heartbeat
            && observation.semantic_region == "editor_text"
            && observation.computed_cursor == "text"
            && native_cursor == "ibeam";
        if valid_ibeam {
            first_ibeam_elapsed_ms.get_or_insert(elapsed_ms);
            consecutive_ibeam += 1;
        } else {
            consecutive_ibeam = 0;
        }
        establishment_samples.push(PointerCursorEstablishmentSample {
            sequence,
            semantic_region: observation.semantic_region,
            computed_cursor: observation.computed_cursor,
            native_cursor,
            event_delivered,
            main_run_loop_heartbeat,
            document_identity: observation.document_identity,
            editor_identity: observation.editor_identity,
            child_identity: identity.child_identity.clone(),
            session_identity: identity.session_identity.clone(),
            presentation_attempt: identity.presentation_attempt.clone(),
            bounds_revision: identity.bounds_revision,
            elapsed_ms,
        });
        if consecutive_ibeam == fixture.web_establishment.required_consecutive_ibeam {
            established_elapsed_ms = Some(elapsed_ms);
            break;
        }
    }
    let establishment = PointerCursorEstablishment {
        maximum_event_count: fixture.web_establishment.maximum_event_count,
        required_consecutive_ibeam: fixture.web_establishment.required_consecutive_ibeam,
        established: established_elapsed_ms.is_some(),
        first_ibeam_elapsed_ms,
        established_elapsed_ms,
        samples: establishment_samples,
    };
    let host_establishment_move_delivery_count = if host_participation_mode == "not_applicable" {
        0
    } else {
        HOST_POINTER_MOVE_COUNT.load(Ordering::SeqCst)
    };
    let child_establishment_move_delivery_count = if host_participation_mode == "not_applicable" {
        0
    } else {
        child_move_delivery_count
    };
    let mut host_restored_before_steady_state = false;
    let mut pre_steady_state_main_run_loop_heartbeat = false;
    if establishment.established && host_participation_mode == "seeded" {
        let host = app
            .get_webview(MAIN_WINDOW_LABEL)
            .ok_or("seeded_host_lookup_failed")?;
        host.show().map_err(|_| "seeded_host_restore_failed")?;
        window
            .set_focus()
            .map_err(|_| "seeded_window_focus_failed")?;
        webview
            .set_focus()
            .map_err(|_| "seeded_webview_focus_failed")?;
        let verification_point = *establishment_global_points
            .last()
            .ok_or("seeded_verification_point_missing")?;
        let previous_delivery = APPKIT_ORACLE_DELIVERY_COUNT.load(Ordering::SeqCst);
        let previous_host_delivery = HOST_POINTER_MOVE_COUNT.load(Ordering::SeqCst);
        let verification_event_delivered = CGEvent::new_mouse_event(
            event_source.clone(),
            CGEventType::MouseMoved,
            verification_point,
            CGMouseButton::Left,
        )
        .map(|event| event.post(CGEventTapLocation::HID))
        .is_ok()
            && wait_for_appkit_oracle_delivery(previous_delivery, Duration::from_millis(500));
        pre_steady_state_main_run_loop_heartbeat =
            wait_for_main_run_loop_heartbeat(&window, Duration::from_millis(500));
        let host_delivery_deadline = Instant::now() + Duration::from_millis(500);
        while HOST_POINTER_MOVE_COUNT.load(Ordering::SeqCst) <= previous_host_delivery
            && Instant::now() < host_delivery_deadline
        {
            thread::sleep(Duration::from_millis(5));
        }
        host_restored_before_steady_state = verification_event_delivered
            && pre_steady_state_main_run_loop_heartbeat
            && HOST_POINTER_MOVE_COUNT.load(Ordering::SeqCst) > previous_host_delivery;
        if !host_restored_before_steady_state {
            sampling_error = Some("seeded_host_delivery_not_restored");
        }
    }
    if establishment.established {
        for (point, global_point) in fixture.trajectory.iter().zip(global_points) {
            let native_edge = point.region == "native_resize_edge";
            let previous_count = APPKIT_ORACLE_DELIVERY_COUNT.load(Ordering::SeqCst);
            let event_created = CGEvent::new_mouse_event(
                event_source.clone(),
                CGEventType::MouseMoved,
                *global_point,
                CGMouseButton::Left,
            )
            .map(|event| event.post(CGEventTapLocation::HID))
            .is_ok();
            let event_delivered = event_created
                && wait_for_appkit_oracle_delivery(previous_count, Duration::from_millis(500));
            let main_run_loop_heartbeat =
                wait_for_main_run_loop_heartbeat(&window, Duration::from_millis(500));
            let native_cursor_snapshots = if main_run_loop_heartbeat {
                sample_native_cursor_timeline(&fixture.web_establishment.snapshot_offsets_ms)
            } else {
                Vec::new()
            };
            let web_sequence =
                fixture.web_establishment.maximum_event_count as u16 + point.sequence;
            if !native_edge
                && webview
                    .eval(format!(
                        "globalThis.__LENSX_PLUGIN_EVIDENCE_SAMPLE_POINTER__?.({}, {}, {})",
                        web_sequence, point.x, point.y
                    ))
                    .is_err()
            {
                sampling_error = Some("webview_eval_failed");
                break;
            }
            let observation = if native_edge {
                None
            } else {
                match collector.wait_pointer(web_sequence, Duration::from_secs(2)) {
                    Some(observation) => Some(observation),
                    None => {
                        eprintln!(
                        "ConfigLens cursor harness missed pointer observation: case={case_id} repetition={repetition} sequence={}",
                        point.sequence
                    );
                        sampling_error = Some("pointer_observation_timeout");
                        break;
                    }
                }
            };
            let (semantic_region, computed_cursor, document_identity, editor_identity) =
                observation
                    .as_ref()
                    .map(|observation| {
                        (
                            observation.semantic_region.clone(),
                            observation.computed_cursor.clone(),
                            observation.document_identity.clone(),
                            observation.editor_identity.clone(),
                        )
                    })
                    .unwrap_or_else(|| {
                        (
                            point.region.clone(),
                            "default".to_owned(),
                            "document_current".to_owned(),
                            if matches!(case_id, "generic-child-text" | "top-level-plain-text") {
                                "not_applicable".to_owned()
                            } else {
                                "editor_current".to_owned()
                            },
                        )
                    });
            if environment.is_none() {
                let observation = observation
                    .as_ref()
                    .ok_or("environment_observation_missing")?;
                environment = Some(PointerCursorEnvironment {
                    macos_version: macos_version(),
                    webkit_version: observation.webkit_version.clone(),
                    tauri_version: "2.11.5",
                    wry_version: "0.55.1",
                    device_scale_factor: observation.device_scale_factor,
                    viewport_width: observation.viewport_width,
                    viewport_height: observation.viewport_height,
                });
            }
            if let Some(observation) = observation.as_ref() {
                child_move_delivery_count =
                    child_move_delivery_count.max(observation.move_delivery_count);
            }
            samples.push(PointerCursorSample {
                sequence: point.sequence,
                semantic_region,
                computed_cursor,
                event_delivered,
                main_run_loop_heartbeat,
                native_cursor_snapshots,
                document_identity,
                editor_identity,
                child_identity: identity.child_identity.clone(),
                session_identity: identity.session_identity.clone(),
                presentation_attempt: identity.presentation_attempt.clone(),
                bounds_revision: identity.bounds_revision,
                elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            });
        }
    }
    let (cleanup_sender, cleanup_receiver) = mpsc::sync_channel(1);
    let monitor_cleanup_scheduled = window
        .run_on_main_thread(move || {
            let _ = cleanup_sender.send(cleanup_web_pointer_stimulus(
                ns_window_pointer,
                monitor_pointer,
            ));
        })
        .is_ok();
    let monitor_removed = monitor_cleanup_scheduled
        && cleanup_receiver
            .recv_timeout(Duration::from_secs(2))
            .unwrap_or(false);
    let pointer_restored = CGEvent::new_mouse_event(
        event_source,
        CGEventType::MouseMoved,
        initial_cursor,
        CGMouseButton::Left,
    )
    .map(|event| event.post(CGEventTapLocation::HID))
    .is_ok();
    if let Some(error) = sampling_error {
        return Err(error);
    }
    Ok(PointerCursorCaseEvidence {
        case_id,
        repetition,
        environment: environment.ok_or("environment_missing")?,
        execution_mode,
        operator_approved: true,
        public_core_graphics_event_source: true,
        post_event_access,
        local_event_monitor: true,
        monitor_removed,
        content_view_flipped,
        container_kind: match case_id {
            "top-level-plain-text" | "top-level-monaco" => "top_level_wkwebview",
            "generic-child-text" => "pure_native_window_single_child",
            _ => "production_host_child",
        },
        host_participation_mode,
        host_isolation_mechanism: if matches!(host_participation_mode, "isolated" | "seeded") {
            "public_webview_visibility"
        } else {
            "none"
        },
        host_move_delivery_count: if host_participation_mode == "not_applicable" {
            0
        } else {
            HOST_POINTER_MOVE_COUNT.load(Ordering::SeqCst)
        },
        child_move_delivery_count: if host_participation_mode == "not_applicable" {
            0
        } else {
            child_move_delivery_count
        },
        host_establishment_move_delivery_count,
        child_establishment_move_delivery_count,
        host_steady_state_move_delivery_count: if host_participation_mode == "not_applicable" {
            0
        } else {
            HOST_POINTER_MOVE_COUNT
                .load(Ordering::SeqCst)
                .saturating_sub(host_establishment_move_delivery_count)
        },
        child_steady_state_move_delivery_count: if host_participation_mode == "not_applicable" {
            0
        } else {
            child_move_delivery_count.saturating_sub(child_establishment_move_delivery_count)
        },
        host_restored: true,
        host_restored_before_steady_state,
        pre_steady_state_main_run_loop_heartbeat,
        establishment,
        temporary_profile: true,
        graceful_shutdown: false,
        pointer_restored,
        samples,
    })
}

fn pointer_content_type(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        _ => "application/octet-stream",
    }
}

fn run_top_level_plain_pointer_case(
    app: &tauri::AppHandle<Wry>,
    repetition: usize,
) -> Result<PointerCursorCaseEvidence, ()> {
    let collector = Arc::new(StageCollector::default());
    collector.expect_source(POINTER_CASE_D1_LABEL.to_owned());
    let observed = Arc::clone(&collector);
    let target = format!("{POINTER_PLAIN_SCHEME}://localhost/index.html")
        .parse()
        .map_err(|_| ())?;
    let window =
        WebviewWindowBuilder::new(app, POINTER_CASE_D1_LABEL, WebviewUrl::External(target))
            .title("lensX top-level plain WKWebView pointer evidence")
            .inner_size(800.0, 600.0)
            .resizable(true)
            .data_store_identifier([0xD1_u8.wrapping_add(repetition as u8); 16])
            .initialization_script(plugin_child_webview_evidence_bootstrap())
            .on_document_title_changed(move |webview, title| {
                let Some(body) = title.strip_prefix("lensx-pointer:") else {
                    return;
                };
                let Ok(observation) =
                    serde_json::from_str::<PluginChildWebviewPointerObservation>(body)
                else {
                    return;
                };
                if observation.valid() {
                    observed.observe_pointer(webview.label(), observation);
                }
            })
            .build()
            .map_err(|error| {
                eprintln!("ConfigLens cursor harness top-level plain build failed: {error}");
            })?;
    thread::sleep(Duration::from_millis(500));
    let mut evidence = sample_pointer_trajectory(
        app,
        "top-level-plain-text",
        "not_applicable",
        repetition,
        POINTER_CASE_D1_LABEL,
        POINTER_CASE_D1_LABEL,
        &collector,
        PointerIdentity {
            child_identity: "not_applicable".to_owned(),
            session_identity: "not_applicable".to_owned(),
            presentation_attempt: "harness_current".to_owned(),
            bounds_revision: 1,
        },
    )
    .map_err(|error| {
        eprintln!("ConfigLens cursor harness top-level plain sampling failed: {error}");
    })?;
    evidence.graceful_shutdown = window.close().is_ok();
    Ok(evidence)
}

fn run_top_level_monaco_pointer_case(
    app: &tauri::AppHandle<Wry>,
    repetition: usize,
) -> Result<PointerCursorCaseEvidence, ()> {
    let collector = Arc::new(StageCollector::default());
    collector.expect_source(POINTER_CASE_A_LABEL.to_owned());
    let observed = Arc::clone(&collector);
    let target = format!("{POINTER_MONACO_SCHEME}://localhost/index.html?mode=pointer")
        .parse()
        .map_err(|_| ())?;
    let window = WebviewWindowBuilder::new(app, POINTER_CASE_A_LABEL, WebviewUrl::External(target))
        .title("lensX top-level Monaco pointer evidence")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .data_store_identifier([0xA0_u8.wrapping_add(repetition as u8); 16])
        .initialization_script(plugin_child_webview_evidence_bootstrap())
        .on_document_title_changed(move |webview, title| {
            let Some(body) = title.strip_prefix("lensx-pointer:") else {
                return;
            };
            let Ok(observation) =
                serde_json::from_str::<PluginChildWebviewPointerObservation>(body)
            else {
                return;
            };
            if observation.valid() {
                observed.observe_pointer(webview.label(), observation);
            }
        })
        .build()
        .map_err(|_| ())?;
    thread::sleep(Duration::from_secs(2));
    let mut evidence = sample_pointer_trajectory(
        app,
        "top-level-monaco",
        "not_applicable",
        repetition,
        POINTER_CASE_A_LABEL,
        POINTER_CASE_A_LABEL,
        &collector,
        PointerIdentity {
            child_identity: "not_applicable".to_owned(),
            session_identity: "not_applicable".to_owned(),
            presentation_attempt: "harness_current".to_owned(),
            bounds_revision: 1,
        },
    )
    .map_err(|error| {
        eprintln!("ConfigLens cursor harness top-level sampling failed: {error}");
    })?;
    evidence.graceful_shutdown = window.close().is_ok();
    Ok(evidence)
}

fn run_generic_child_pointer_case(
    app: &tauri::AppHandle<Wry>,
    repetition: usize,
) -> Result<PointerCursorCaseEvidence, ()> {
    let host = WindowBuilder::new(app, POINTER_CASE_B_HOST_LABEL)
        .title("lensX generic Child WKWebView pointer evidence")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .build()
        .map_err(|error| {
            eprintln!("ConfigLens cursor harness generic host build failed: {error}");
        })?;
    let collector = Arc::new(StageCollector::default());
    collector.expect_source(POINTER_CASE_B_CHILD_LABEL.to_owned());
    let observed = Arc::clone(&collector);
    let child_target = format!("{POINTER_PLAIN_SCHEME}://localhost/index.html")
        .parse()
        .map_err(|_| ())?;
    let builder = WebviewBuilder::new(
        POINTER_CASE_B_CHILD_LABEL,
        WebviewUrl::External(child_target),
    )
    .data_store_identifier([0xB0_u8.wrapping_add(repetition as u8); 16])
    .isolated_uri_scheme_protocols([POINTER_PLAIN_SCHEME])
    .initialization_script(plugin_child_webview_evidence_bootstrap())
    .isolated_ipc_handler(move |actual_source_label, request| {
        let observation =
            match serde_json::from_str::<PluginChildWebviewPointerObservation>(request.body()) {
                Ok(observation) => observation,
                Err(_) => {
                    eprintln!(
                        "ConfigLens cursor harness received invalid pointer IPC: source={actual_source_label} bytes={}",
                        request.body().len()
                    );
                    return;
                }
            };
        if observation.valid() {
            observed.observe_pointer(&actual_source_label, observation);
        } else {
            eprintln!(
                "ConfigLens cursor harness received out-of-contract pointer IPC: source={actual_source_label}"
            );
        }
    });
    let child = host
        .add_child(
            builder,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(800.0, 600.0),
        )
        .map_err(|error| {
            eprintln!("ConfigLens cursor harness generic child build failed: {error}");
        })?;
    thread::sleep(Duration::from_millis(500));
    let mut evidence = sample_pointer_trajectory(
        app,
        "generic-child-text",
        "not_applicable",
        repetition,
        POINTER_CASE_B_HOST_LABEL,
        POINTER_CASE_B_CHILD_LABEL,
        &collector,
        PointerIdentity {
            child_identity: "child_current".to_owned(),
            session_identity: "not_applicable".to_owned(),
            presentation_attempt: "harness_current".to_owned(),
            bounds_revision: 1,
        },
    )
    .map_err(|error| {
        eprintln!("ConfigLens cursor harness generic sampling failed: {error}");
    })?;
    evidence.graceful_shutdown = child.close().is_ok() && host.close().is_ok();
    Ok(evidence)
}

fn run_preproduction_pointer_cases(
    app: &tauri::AppHandle<Wry>,
    repetitions: usize,
) -> Result<Vec<PointerCursorCaseEvidence>, ()> {
    let mut evidence = Vec::with_capacity(repetitions * 3);
    for repetition in 1..=repetitions {
        evidence.push(
            run_top_level_plain_pointer_case(app, repetition).map_err(|()| {
                eprintln!("ConfigLens cursor harness failed: top_level_plain_{repetition}");
            })?,
        );
        evidence.push(
            run_top_level_monaco_pointer_case(app, repetition).map_err(|()| {
                eprintln!("ConfigLens cursor harness failed: top_level_monaco_{repetition}");
            })?,
        );
        evidence.push(
            run_generic_child_pointer_case(app, repetition).map_err(|()| {
                eprintln!("ConfigLens cursor harness failed: generic_child_{repetition}");
            })?,
        );
    }
    Ok(evidence)
}

fn launcher_has_logical_size(app: &tauri::AppHandle<Wry>, width: f64, height: f64) -> bool {
    let Some(window) = app.get_window(MAIN_WINDOW_LABEL) else {
        return false;
    };
    let Ok(size) = window.inner_size() else {
        return false;
    };
    let Ok(scale_factor) = window.scale_factor() else {
        return false;
    };
    let logical = size.to_logical::<f64>(scale_factor);
    (logical.width - width).abs() < 0.5 && (logical.height - height).abs() < 0.5
}

fn wait_for_launcher_logical_size(
    app: &tauri::AppHandle<Wry>,
    width: f64,
    height: f64,
    timeout: Duration,
) -> bool {
    let deadline = Instant::now() + timeout;
    while !launcher_has_logical_size(app, width, height) {
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(10));
    }
    true
}

struct Registration {
    manager: Arc<PluginManager>,
    resources: Arc<PluginResourceService>,
    entry_id: String,
    plugin_id: String,
    version: String,
}

fn copy_tree(source: &Path, target: &Path) -> Result<(), ()> {
    fs::create_dir_all(target).map_err(|_| ())?;
    for entry in fs::read_dir(source).map_err(|_| ())? {
        let entry = entry.map_err(|_| ())?;
        let source = entry.path();
        let target = target.join(entry.file_name());
        if entry.file_type().map_err(|_| ())?.is_dir() {
            copy_tree(&source, &target)?;
        } else {
            fs::copy(source, target).map_err(|_| ())?;
        }
    }
    Ok(())
}

fn manifest(candidate: &Path) -> Result<NormalizedPluginManifest, ()> {
    let value = serde_json::from_slice::<Value>(
        &fs::read(candidate.join("manifest.json")).map_err(|_| ())?,
    )
    .map_err(|_| ())?;
    validate_plugin_manifest(&value, &current_plugin_host_versions("0.1.0"))
        .manifest
        .ok_or(())
}

fn registration(input: &ConfigLensColdOpenHarnessInput) -> Result<Registration, ()> {
    let manifest = manifest(&input.candidate)?;
    let manager = PluginManager::recover(
        input.root.join("config"),
        current_plugin_host_versions("0.1.0"),
    );
    let resources;
    if input.profile == "release_like" {
        let digest = "a".repeat(64);
        let packages = input.root.join("packages");
        let payload = packages
            .join(plugin_record_key(&manifest.plugin_id))
            .join(&digest);
        copy_tree(&input.candidate, &payload)?;
        let facts = PluginRegistrationFacts::new(
            payload.to_string_lossy(),
            PackageDigest {
                algorithm: "sha256".to_owned(),
                value: digest,
            },
            PluginSource::External,
            true,
        )
        .map_err(|_| ())?;
        manager.register(manifest.clone(), facts).map_err(|_| ())?;
        resources = PluginResourceService::initialize_for_macos_harness(
            Arc::clone(&manager),
            Some(packages),
        );
    } else if input.profile == "development_snapshot" {
        let source = input.root.join("source");
        copy_tree(&input.candidate, &source)?;
        let snapshots = Arc::new(
            DevelopmentSnapshotStore::initialize(input.root.join("snapshots")).map_err(|_| ())?,
        );
        let snapshot = snapshots
            .publish_from_source(&source, &current_plugin_host_versions("0.1.0"))
            .map_err(|_| ())?;
        let facts =
            PluginRegistrationFacts::development(snapshot.root, snapshot.identity, source, true)
                .map_err(|_| ())?;
        manager
            .register_development(snapshot.manifest, facts)
            .map_err(|_| ())?;
        resources = PluginResourceService::initialize_for_macos_harness(Arc::clone(&manager), None);
        resources.attach_development_snapshots(Some(snapshots));
    } else {
        return Err(());
    }
    let current = manager.registration(&manifest.plugin_id).ok_or(())?;
    Ok(Registration {
        entry_id: healthy_entry_id(&current),
        plugin_id: manifest.plugin_id,
        version: manifest.version,
        manager,
        resources,
    })
}

fn response() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .body(HOST_DOCUMENT.to_vec())
        .expect("static harness response")
}

pub fn builder(input: ConfigLensColdOpenHarnessInput) -> Result<tauri::Builder<Wry>, ()> {
    if !cfg!(target_os = "macos")
        || !input.candidate.is_absolute()
        || !input.root.is_absolute()
        || !input.output.is_absolute()
        || input.samples == 0
        || input.samples > 100
        || (input.cursor_repetitions != 0
            && (!(2..=10).contains(&input.cursor_repetitions)
                || input.profile != "release_like"
                || input.samples < input.cursor_repetitions))
    {
        return Err(());
    }
    let pointer_dist =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../plugins/config-lens/wkwebview/dist");
    if input.cursor_repetitions > 0 && !pointer_dist.join("index.html").is_file() {
        return Err(());
    }
    let registration = registration(&input)?;
    let output = input.output.clone();
    let profile = input.profile.clone();
    let samples = input.samples;
    let cursor_repetitions = input.cursor_repetitions;
    Ok(tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("lensx-plugin", handle_plugin_resource_protocol)
        .register_uri_scheme_protocol(HOST_SCHEME, |_context, _request| response())
        .register_uri_scheme_protocol(POINTER_PLAIN_SCHEME, |_context, request| {
            if request.uri().path() != "/index.html" {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .expect("bounded pointer failure response");
            }
            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "text/html; charset=utf-8")
                .header("cache-control", "no-store")
                .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
                .body(POINTER_PLAIN_DOCUMENT.to_vec())
                .expect("maintained pointer fixture response")
        })
        .register_uri_scheme_protocol(POINTER_MONACO_SCHEME, move |_context, request| {
            let relative = request.uri().path().trim_start_matches('/');
            if relative.is_empty()
                || relative.contains("..")
                || relative.contains('\\')
                || !relative
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"/-_.".contains(&byte))
            {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .expect("bounded pointer missing response");
            }
            let body = match fs::read(pointer_dist.join(relative)) {
                Ok(body) => body,
                Err(_) => {
                    return Response::builder()
                        .status(StatusCode::NOT_FOUND)
                        .body(Vec::new())
                        .expect("bounded pointer missing response");
                }
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, pointer_content_type(relative))
                .header("cache-control", "no-store")
                .header("x-content-type-options", "nosniff")
                .header("content-security-policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
                .body(body)
                .expect("maintained Monaco pointer fixture response")
        })
        .invoke_handler(tauri::generate_handler![
            config_lens_cold_open_heartbeat,
            config_lens_cold_open_host_pointer_move
        ])
        .setup(move |app| {
            crate::macos_launcher::setup_macos_accessory_application(app)
                .map_err(|error| tauri::Error::AssetNotFound(error.to_string()))?;
            let target = format!("{HOST_SCHEME}://localhost/index.html")
                .parse()
                .map_err(tauri::Error::InvalidUrl)?;
            WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::External(target))
                .title("lensX ConfigLens cold-open evidence")
                .inner_size(650.0, 320.0)
                .always_on_top(true)
                .build()?;
            crate::macos_launcher::setup_macos_launcher_window_collection(app.handle())
                .map_err(|error| tauri::Error::AssetNotFound(error.to_string()))?;
            let home_size_before_page = launcher_has_logical_size(app.handle(), 650.0, 320.0);
            let service = setup_plugin_child_webview_service(app.handle());
            assert!(app.manage(LauncherWindowActions::default()));
            let dispatcher = Arc::new(HarnessDispatcher {
                service: Arc::clone(&service),
            });
            assert!(service.attach_ready_dispatcher(dispatcher.clone()));
            assert!(service.attach_rpc_dispatcher(dispatcher));
            assert!(service.attach_resource_authority(registration.resources.clone()));
            assert!(app.manage(registration.manager.clone()));
            assert!(app.manage(registration.resources.clone()));
            setup_launcher_surface(app.handle());
            let collector = Arc::new(StageCollector::default());
            let guard =
                attach_plugin_runtime_stage_observer(collector.clone()).ok_or_else(|| {
                    tauri::Error::AssetNotFound("stage_observer_unavailable".to_owned())
                })?;
            let app_handle = app.handle().clone();
            let profile = profile.clone();
            thread::spawn(move || {
                let _guard = guard;
                let mut cold_samples = Vec::new();
                let mut restore_samples = Vec::new();
                let mut launcher_lifecycle: Option<LauncherLifecycleEvidence> = None;
                let pointer_oracle = if cursor_repetitions == 0 {
                    Vec::new()
                } else {
                    match run_repeated_appkit_cursor_oracle(&app_handle, cursor_repetitions) {
                        Ok(evidence) => evidence,
                        Err(error) => {
                            eprintln!("ConfigLens cursor harness failed: appkit_oracle {error}");
                            app_handle.exit(3);
                            return;
                        }
                    }
                };
                let mut pointer_cases = if cursor_repetitions == 0 {
                    Vec::new()
                } else {
                    match run_preproduction_pointer_cases(&app_handle, cursor_repetitions) {
                        Ok(evidence) => evidence,
                        Err(()) => {
                            eprintln!("ConfigLens cursor harness failed: controlled_cases");
                            app_handle.exit(3);
                            return;
                        }
                    }
                };
                let mut pointer_host_controls = Vec::with_capacity(cursor_repetitions);
                let mut pointer_host_seeded_controls = Vec::with_capacity(cursor_repetitions);
                for sample_index in 0..samples {
                    if service.snapshot().is_some() {
                        eprintln!("ConfigLens cold-open harness failed: current_not_absent");
                        app_handle.exit(3);
                        return;
                    }
                    if apply_launcher_surface_target(
                        &app_handle,
                        LauncherSurfaceTarget::PluginPage {
                            owner_id: registration.plugin_id.clone(),
                            page_id: "main".to_owned(),
                            page_attempt_id: format!("page_attempt_{}", sample_index + 1),
                            initial_size: LauncherLogicalSize {
                                width: 800,
                                height: 600,
                            },
                            resizable: true,
                        },
                    )
                    .is_err()
                    {
                        eprintln!("ConfigLens cold-open harness failed: page_resize");
                        app_handle.exit(3);
                        return;
                    }
                    let page_size_ready = wait_for_launcher_logical_size(
                        &app_handle,
                        800.0,
                        600.0,
                        Duration::from_secs(1),
                    );
                    if !page_size_ready {
                        eprintln!("ConfigLens cold-open harness failed: page_resize_timeout");
                        app_handle.exit(3);
                        return;
                    }
                    if sample_index > 0 {
                        if let Some(evidence) = launcher_lifecycle.as_mut() {
                            evidence.reopen_initial_800x600 = page_size_ready;
                            evidence.user_size_not_persisted = evidence.reopen_initial_800x600
                                && app_handle
                                    .get_window(MAIN_WINDOW_LABEL)
                                    .and_then(|window| window.is_resizable().ok())
                                    == Some(true);
                        }
                    }
                    collector.reset();
                    let resolve_started = Instant::now();
                    let revision = registration.manager.registration_revision();
                    if registration
                        .manager
                        .registration(&registration.plugin_id)
                        .is_none()
                    {
                        eprintln!("ConfigLens cold-open harness failed: registration_not_current");
                        app_handle.exit(3);
                        return;
                    }
                    record_plugin_runtime_stage(
                        PluginRuntimeStage::Resolve,
                        resolve_started.elapsed(),
                    );
                    let loading_started = Instant::now();
                    let attempt = match create_config_lens_evidence_presentation(
                        &app_handle,
                        &registration.manager,
                        &registration.resources,
                        &service,
                        registration.entry_id.clone(),
                        registration.plugin_id.clone(),
                        registration.version.clone(),
                        "main".to_owned(),
                        revision,
                        collector.clone(),
                    ) {
                        Ok(attempt) => attempt,
                        Err(error) => {
                            eprintln!("ConfigLens cold-open harness failed: create {error:?}");
                            app_handle.exit(3);
                            return;
                        }
                    };
                    let source_label = service.snapshot().map(|snapshot| snapshot.source_label);
                    let Some(source_label) = source_label else {
                        eprintln!("ConfigLens cold-open harness failed: source_label_absent");
                        app_handle.exit(3);
                        return;
                    };
                    collector.expect_source(source_label.clone());
                    let readiness = service.wait_presentation_readiness(attempt);
                    let shown = service.show_current(attempt);
                    if readiness != PluginChildWebviewWaitReadiness::Ready
                        || shown != PluginChildWebviewPresentationResult::Applied
                    {
                        eprintln!("ConfigLens cold-open harness failed: readiness {readiness:?} show {shown:?}");
                        app_handle.exit(3);
                        return;
                    }
                    collector.record("host_loading", loading_started.elapsed());
                    if !collector.wait("editor", Duration::from_secs(10)) {
                        eprintln!("ConfigLens cold-open harness failed: editor_timeout {:?}", collector.snapshot());
                        app_handle.exit(3);
                        return;
                    }
                    if service.focus_current(attempt)
                        != PluginChildWebviewPresentationResult::Applied
                    {
                        eprintln!("ConfigLens cold-open harness failed: focus");
                        app_handle.exit(3);
                        return;
                    }
                    let Some(webview) = app_handle.get_webview(&source_label) else {
                        eprintln!("ConfigLens cold-open harness failed: webview_lookup");
                        app_handle.exit(3);
                        return;
                    };
                    let _ =
                        webview.eval("document.querySelector('.monaco-editor textarea')?.focus()");
                    thread::sleep(Duration::from_millis(40));
                    for _ in 0..3 {
                        if let Err(error) = send_native_text_input(&webview) {
                            eprintln!("ConfigLens cold-open harness native input: {}", error.code());
                        }
                        if collector.wait("first_interactive", Duration::from_millis(500)) {
                            break;
                        }
                    }
                    if !collector.wait("first_interactive", Duration::from_secs(5)) {
                        eprintln!("ConfigLens cold-open harness failed: first_interactive_timeout {:?}", collector.snapshot());
                        app_handle.exit(3);
                        return;
                    }
                    let mut pending_pointer_case = None;
                    let mut pending_pointer_host_control = None;
                    let mut pending_pointer_host_seeded_control = None;
                    if sample_index < cursor_repetitions {
                        let snapshot = service.snapshot();
                        let Some(snapshot) = snapshot else {
                            app_handle.exit(3);
                            return;
                        };
                        match sample_pointer_trajectory(
                            &app_handle,
                            "production-config-lens",
                            "normal",
                            sample_index + 1,
                            MAIN_WINDOW_LABEL,
                            &source_label,
                            &collector,
                            PointerIdentity {
                                child_identity: source_label.clone(),
                                session_identity: "session_current".to_owned(),
                                presentation_attempt: snapshot.attempt.opaque_id(),
                                bounds_revision: snapshot.presentation_revision,
                            },
                        ) {
                            Ok(evidence) => pending_pointer_case = Some(evidence),
                            Err(error) => {
                                eprintln!(
                                    "ConfigLens cursor harness failed: production_case {error}"
                                );
                                app_handle.exit(3);
                                return;
                            }
                        }
                        let Some(host_webview) = app_handle.get_webview(MAIN_WINDOW_LABEL) else {
                            app_handle.exit(3);
                            return;
                        };
                        if host_webview.hide().is_err() {
                            eprintln!("ConfigLens cursor harness failed: host_control_hide");
                            app_handle.exit(3);
                            return;
                        }
                        let control_result = sample_pointer_trajectory(
                            &app_handle,
                            "production-config-lens-host-isolated",
                            "isolated",
                            sample_index + 1,
                            MAIN_WINDOW_LABEL,
                            &source_label,
                            &collector,
                            PointerIdentity {
                                child_identity: source_label.clone(),
                                session_identity: "session_current".to_owned(),
                                presentation_attempt: snapshot.attempt.opaque_id(),
                                bounds_revision: snapshot.presentation_revision,
                            },
                        );
                        let host_restored = host_webview.show().is_ok();
                        match control_result {
                            Ok(mut evidence) if host_restored => {
                                evidence.host_restored = true;
                                pending_pointer_host_control = Some(evidence);
                            }
                            Ok(_) => {
                                eprintln!("ConfigLens cursor harness failed: host_control_restore");
                                app_handle.exit(3);
                                return;
                            }
                            Err(error) => {
                                eprintln!(
                                    "ConfigLens cursor harness failed: host_control {error}"
                                );
                                app_handle.exit(3);
                                return;
                            }
                        }
                        if host_webview.hide().is_err() {
                            eprintln!("ConfigLens cursor harness failed: host_seeded_hide");
                            app_handle.exit(3);
                            return;
                        }
                        let seeded_result = sample_pointer_trajectory(
                            &app_handle,
                            "production-config-lens-host-seeded",
                            "seeded",
                            sample_index + 1,
                            MAIN_WINDOW_LABEL,
                            &source_label,
                            &collector,
                            PointerIdentity {
                                child_identity: source_label.clone(),
                                session_identity: "session_current".to_owned(),
                                presentation_attempt: snapshot.attempt.opaque_id(),
                                bounds_revision: snapshot.presentation_revision,
                            },
                        );
                        let seeded_host_restored = host_webview.show().is_ok();
                        match seeded_result {
                            Ok(evidence)
                                if seeded_host_restored
                                    && (!evidence.establishment.established
                                        || (evidence.host_restored_before_steady_state
                                            && evidence
                                                .pre_steady_state_main_run_loop_heartbeat)) =>
                            {
                                pending_pointer_host_seeded_control = Some(evidence);
                            }
                            Ok(_) => {
                                eprintln!("ConfigLens cursor harness failed: host_seeded_restore");
                                app_handle.exit(3);
                                return;
                            }
                            Err(error) => {
                                let _ = host_webview.show();
                                eprintln!("ConfigLens cursor harness failed: host_seeded {error}");
                                app_handle.exit(3);
                                return;
                            }
                        }
                    }
                    let mut pending_lifecycle = None;
                    if profile == "release_like" {
                        for _ in 0..2 {
                            if service.hide_current(attempt)
                                != PluginChildWebviewPresentationResult::Applied
                            {
                                app_handle.exit(3);
                                return;
                            }
                            let restore_started = Instant::now();
                            if service.show_current(attempt)
                                != PluginChildWebviewPresentationResult::Applied
                                || service.focus_current(attempt)
                                    != PluginChildWebviewPresentationResult::Applied
                                || service.snapshot().map(|snapshot| snapshot.attempt)
                                    != Some(attempt)
                            {
                                app_handle.exit(3);
                                return;
                            }
                            restore_samples.push(RestoreSample {
                                restore_ms: restore_started.elapsed().as_secs_f64() * 1000.0,
                            });
                        }
                        if launcher_lifecycle.is_none() {
                            let page_800x600 = launcher_has_logical_size(&app_handle, 800.0, 600.0);
                            let page_resizable = app_handle
                                .get_window(MAIN_WINDOW_LABEL)
                                .and_then(|window| window.is_resizable().ok())
                                == Some(true);
                            let user_resize_1000x720 = app_handle
                                .get_window(MAIN_WINDOW_LABEL)
                                .is_some_and(|window| {
                                    window.set_size(LogicalSize::new(1000.0, 720.0)).is_ok()
                                })
                                && wait_for_launcher_logical_size(
                                    &app_handle,
                                    1000.0,
                                    720.0,
                                    Duration::from_secs(1),
                                );
                            let before_restore = service.snapshot();
                            let editor_count = collector.count("editor");
                            let worker_count = collector.count("worker");
                            let cmd_w_routed = dispatch_launcher_action_on_main(
                                &app_handle,
                                LauncherWindowAction::Hide,
                            );
                            let cmd_w_native_window_hidden = cmd_w_routed
                                && app_handle
                                    .get_window(MAIN_WINDOW_LABEL)
                                    .and_then(|window| window.is_visible().ok())
                                    == Some(false);
                            let child_hidden_after_cmd_w = service
                                .snapshot()
                                .is_some_and(|snapshot| snapshot.state == PluginChildWebviewState::Hidden);
                            let cmd_w_process_alive = service.snapshot().is_some()
                                && app_handle.get_window(MAIN_WINDOW_LABEL).is_some();
                            let restored = dispatch_launcher_action_on_main(
                                &app_handle,
                                LauncherWindowAction::Show(
                                    LauncherActivationReason::GlobalShortcut,
                                ),
                            );
                            let after_restore = service.snapshot();
                            let global_shortcut_native_window_restored = restored
                                && app_handle
                                    .get_window(MAIN_WINDOW_LABEL)
                                    .and_then(|window| window.is_visible().ok())
                                    == Some(true);
                            let same_runtime_attempt_restored = before_restore
                                .as_ref()
                                .zip(after_restore.as_ref())
                                .is_some_and(|(before, after)| before.attempt == after.attempt);
                            let same_session_restored = before_restore
                                .as_ref()
                                .zip(after_restore.as_ref())
                                .is_some_and(|(before, after)| {
                                    before.session_state == after.session_state
                                        && before.bridge_ready == after.bridge_ready
                                });
                            let same_child_webview_restored = after_restore
                                .as_ref()
                                .is_some_and(|snapshot| {
                                    snapshot.source_label == source_label
                                        && snapshot.state == PluginChildWebviewState::Visible
                                        && app_handle.get_webview(&source_label).is_some()
                                });
                            let same_user_size_restored =
                                launcher_has_logical_size(&app_handle, 1000.0, 720.0);
                            let monaco_model_not_reloaded = collector.count("editor") == editor_count;
                            let worker_not_recreated = collector.count("worker") == worker_count;
                            let focus_loss_hidden = dispatch_launcher_action_on_main(
                                &app_handle,
                                LauncherWindowAction::Hide,
                            )
                                && app_handle
                                    .get_window(MAIN_WINDOW_LABEL)
                                    .and_then(|window| window.is_visible().ok())
                                    == Some(false)
                                && service.snapshot().is_some_and(|snapshot| {
                                    snapshot.state == PluginChildWebviewState::Hidden
                                });
                            let focus_restored = dispatch_launcher_action_on_main(
                                &app_handle,
                                LauncherWindowAction::Show(
                                    LauncherActivationReason::Programmatic,
                                ),
                            );
                            let no_blank_state = child_hidden_after_cmd_w
                                && cmd_w_native_window_hidden
                                && focus_loss_hidden
                                && focus_restored
                                && service.snapshot().is_some_and(|snapshot| {
                                    snapshot.state == PluginChildWebviewState::Visible
                                });
                            let close_home_650x320_before_teardown =
                                apply_launcher_surface_target(
                                    &app_handle,
                                    LauncherSurfaceTarget::Home,
                                )
                                .is_ok()
                                    && service.snapshot().is_some()
                                    && wait_for_launcher_logical_size(
                                        &app_handle,
                                        650.0,
                                        320.0,
                                        Duration::from_secs(1),
                                    )
                                    && service.snapshot().is_some();
                            let close_home_non_resizable = app_handle
                                .get_window(MAIN_WINDOW_LABEL)
                                .and_then(|window| window.is_resizable().ok())
                                == Some(false);
                            pending_lifecycle = Some(LauncherLifecycleEvidence {
                                home_650x320: home_size_before_page,
                                page_800x600,
                                page_resizable,
                                user_resize_1000x720,
                                same_user_size_restored,
                                close_home_650x320_before_teardown,
                                close_home_non_resizable,
                                reopen_initial_800x600: false,
                                user_size_not_persisted: false,
                                cmd_w_native_window_hidden,
                                cmd_w_process_alive,
                                focus_loss_native_window_hidden: focus_loss_hidden,
                                no_host_visible_plugin_hidden_blank_state: no_blank_state,
                                global_shortcut_native_window_restored,
                                same_child_webview_restored,
                                same_runtime_attempt_restored,
                                same_session_restored,
                                monaco_model_not_reloaded,
                                worker_not_recreated,
                                page_close_destroyed_attempt: false,
                                zero_native_bridge_resource_authority: false,
                            });
                        }
                    }
                    if service.compare_current_teardown(attempt) != Ok(true) {
                        app_handle.exit(3);
                        return;
                    }
                    let terminal = TerminalCleanup {
                        webviews_absent: app_handle.get_webview(&source_label).is_none(),
                        sessions_absent: service.snapshot().is_none(),
                        workers_absent: app_handle.get_webview(&source_label).is_none(),
                        bridge_authority_absent: service.snapshot().is_none(),
                        resource_authority_absent: registration
                            .resources
                            .evidence_runtime_authority_absent(),
                    };
                    if !terminal.webviews_absent
                        || !terminal.sessions_absent
                        || !terminal.workers_absent
                        || !terminal.bridge_authority_absent
                        || !terminal.resource_authority_absent
                    {
                        app_handle.exit(3);
                        return;
                    }
                    if let Some(mut evidence) = pending_pointer_case {
                        evidence.graceful_shutdown = terminal.webviews_absent
                            && terminal.sessions_absent
                            && terminal.resource_authority_absent;
                        pointer_cases.push(evidence);
                    }
                    if let Some(mut evidence) = pending_pointer_host_control {
                        evidence.graceful_shutdown = terminal.webviews_absent
                            && terminal.sessions_absent
                            && terminal.resource_authority_absent;
                        pointer_host_controls.push(evidence);
                    }
                    if let Some(mut evidence) = pending_pointer_host_seeded_control {
                        evidence.graceful_shutdown = terminal.webviews_absent
                            && terminal.sessions_absent
                            && terminal.resource_authority_absent;
                        pointer_host_seeded_controls.push(evidence);
                    }
                    if let Some(mut evidence) = pending_lifecycle {
                        evidence.page_close_destroyed_attempt = terminal.webviews_absent
                            && terminal.sessions_absent
                            && service.snapshot().is_none();
                        evidence.zero_native_bridge_resource_authority = terminal.webviews_absent
                            && terminal.bridge_authority_absent
                            && terminal.resource_authority_absent;
                        launcher_lifecycle = Some(evidence);
                    }
                    let stages = collector.snapshot();
                    if [
                        "resolve",
                        "create",
                        "navigation",
                        "load",
                        "bridge",
                        "sdk",
                        "ui_bundle",
                        "editor",
                        "worker",
                        "host_loading",
                        "first_interactive",
                    ]
                    .iter()
                    .any(|stage| !stages.contains_key(*stage))
                    {
                        app_handle.exit(3);
                        return;
                    }
                    cold_samples.push(ColdSample {
                        stage_ms: stages,
                        terminal_cleanup: terminal,
                    });
                }
                let heartbeat_gaps_ms = HEARTBEATS
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .clone();
                let result = HarnessOutput {
                    evidence_version: "0.1.0",
                    profile,
                    cold_samples,
                    restore_samples,
                    heartbeat_gaps_ms,
                    production_components: BTreeMap::from([
                        ("bridge_rpc_sdk", true),
                        ("config_lens_candidate", true),
                        ("presentation", true),
                        ("resource_service", true),
                    ]),
                    launcher_lifecycle,
                    pointer_oracle,
                    pointer_cases,
                    pointer_host_controls,
                    pointer_host_seeded_controls,
                };
                match serde_json::to_vec_pretty(&result)
                    .ok()
                    .and_then(|bytes| fs::write(&output, bytes).ok())
                {
                    Some(()) => app_handle.exit(0),
                    None => app_handle.exit(3),
                }
            });
            Ok(())
        }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_appkit_oracle() -> AppKitCursorOracleEvidence {
        let expected = [
            ("text", "ibeam"),
            ("arrow", "arrow"),
            ("link", "pointing_hand"),
            ("column_resize", "resize_horizontal"),
            ("row_resize", "resize_vertical"),
        ];
        AppKitCursorOracleEvidence {
            case_id: "appkit-oracle",
            repetition: 1,
            macos_version: "26.6".to_owned(),
            execution_mode: "operator_approved_quiescent_desktop".to_owned(),
            operator_approved: true,
            public_core_graphics_event_source: true,
            post_event_access: true,
            local_event_monitor: true,
            temporary_profile: true,
            graceful_shutdown: true,
            pointer_restored: true,
            monitor_removed: true,
            cursor_rects_removed: true,
            samples: expected
                .into_iter()
                .enumerate()
                .map(
                    |(index, (semantic_region, expected_cursor))| AppKitCursorOracleSample {
                        sequence: index as u16 + 1,
                        semantic_region,
                        expected_cursor,
                        native_cursor: expected_cursor,
                        event_delivered: true,
                        elapsed_ms: index as f64 * 20.0,
                    },
                )
                .collect(),
        }
    }

    #[test]
    fn appkit_oracle_requires_delivery_for_every_bounded_point() {
        let mut evidence = valid_appkit_oracle();
        assert_eq!(validate_appkit_cursor_oracle(&evidence), Ok(()));
        evidence.samples[2].event_delivered = false;
        assert_eq!(
            validate_appkit_cursor_oracle(&evidence),
            Err("oracle_delivery_missing")
        );
        evidence = valid_appkit_oracle();
        evidence.samples.pop();
        assert_eq!(
            validate_appkit_cursor_oracle(&evidence),
            Err("oracle_sequence_invalid")
        );
    }

    #[test]
    fn appkit_oracle_rejects_permission_or_monitor_environment_failure() {
        let mut evidence = valid_appkit_oracle();
        evidence.post_event_access = false;
        assert_eq!(
            validate_appkit_cursor_oracle(&evidence),
            Err("oracle_environment_invalid")
        );
        evidence = valid_appkit_oracle();
        evidence.local_event_monitor = false;
        assert_eq!(
            validate_appkit_cursor_oracle(&evidence),
            Err("oracle_environment_invalid")
        );
    }

    #[test]
    fn appkit_oracle_rejects_cursor_mismatch_and_incomplete_cleanup() {
        let mut evidence = valid_appkit_oracle();
        evidence.samples[0].native_cursor = "arrow";
        assert_eq!(
            validate_appkit_cursor_oracle(&evidence),
            Err("oracle_cursor_mismatch")
        );
        evidence = valid_appkit_oracle();
        evidence.monitor_removed = false;
        assert_eq!(
            validate_appkit_cursor_oracle(&evidence),
            Err("oracle_cleanup_incomplete")
        );
        evidence = valid_appkit_oracle();
        evidence.pointer_restored = false;
        assert_eq!(
            validate_appkit_cursor_oracle(&evidence),
            Err("oracle_cleanup_incomplete")
        );
    }
}
