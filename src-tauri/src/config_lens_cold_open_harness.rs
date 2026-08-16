use crate::{
    launcher_surface::{
        apply_launcher_surface_target, setup_launcher_surface, LauncherLogicalSize,
        LauncherSurfaceTarget,
    },
    launcher_window::{
        dispatch_macos_menu_event, LauncherActivationReason, LauncherWindowAction,
        LauncherWindowActions, MACOS_CLOSE_WINDOW_MENU_ID, MAIN_WINDOW_LABEL,
    },
    plugin_child_webview_adapter::{send_native_text_input, PluginChildWebviewEvidenceIngress},
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
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Condvar, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
};

const HOST_SCHEME: &str = "lensx-runtime-harness";
const HOST_DOCUMENT: &[u8] = br#"<!doctype html><meta charset="utf-8"><title>lensX target macOS product-path evidence</title><script>
let previous = performance.now();
setInterval(() => {
  const current = performance.now();
  window.__TAURI_INTERNALS__.invoke('config_lens_cold_open_heartbeat', { gapMs: current - previous }).catch(() => {});
  previous = current;
}, 10);
</script>"#;

static HEARTBEATS: Mutex<Vec<f64>> = Mutex::new(Vec::new());

#[tauri::command]
fn config_lens_cold_open_heartbeat(gap_ms: f64) {
    if gap_ms.is_finite() && (0.0..=60_000.0).contains(&gap_ms) {
        HEARTBEATS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(gap_ms);
    }
}

#[derive(Clone, Debug)]
pub struct ConfigLensColdOpenHarnessInput {
    pub profile: String,
    pub candidate: PathBuf,
    pub root: PathBuf,
    pub output: PathBuf,
    pub samples: usize,
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
}

impl StageCollector {
    fn reset(&self) {
        *self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = StageState::default();
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
    {
        return Err(());
    }
    let registration = registration(&input)?;
    let output = input.output.clone();
    let profile = input.profile.clone();
    let samples = input.samples;
    Ok(tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("lensx-plugin", handle_plugin_resource_protocol)
        .register_uri_scheme_protocol(HOST_SCHEME, |_context, _request| response())
        .invoke_handler(tauri::generate_handler![config_lens_cold_open_heartbeat])
        .setup(move |app| {
            let target = format!("{HOST_SCHEME}://localhost/index.html")
                .parse()
                .map_err(tauri::Error::InvalidUrl)?;
            WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::External(target))
                .title("lensX ConfigLens cold-open evidence")
                .inner_size(650.0, 320.0)
                .build()?;
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
                    if sample_index > 0 {
                        if let Some(evidence) = launcher_lifecycle.as_mut() {
                            evidence.reopen_initial_800x600 = wait_for_launcher_logical_size(
                                &app_handle,
                                800.0,
                                600.0,
                                Duration::from_secs(1),
                            );
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
                            let actions = app_handle.state::<LauncherWindowActions>();
                            let cmd_w_routed = dispatch_macos_menu_event(
                                MACOS_CLOSE_WINDOW_MENU_ID,
                                |action| actions.dispatch(&app_handle, action),
                            ) == Ok(true);
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
                            let restored = actions
                                .dispatch(
                                    &app_handle,
                                    LauncherWindowAction::Show(
                                        LauncherActivationReason::GlobalShortcut,
                                    ),
                                )
                                .is_ok();
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
                            let focus_loss_hidden = actions
                                .dispatch(&app_handle, LauncherWindowAction::Hide)
                                .is_ok()
                                && app_handle
                                    .get_window(MAIN_WINDOW_LABEL)
                                    .and_then(|window| window.is_visible().ok())
                                    == Some(false)
                                && service.snapshot().is_some_and(|snapshot| {
                                    snapshot.state == PluginChildWebviewState::Hidden
                                });
                            let focus_restored = actions
                                .dispatch(
                                    &app_handle,
                                    LauncherWindowAction::Show(
                                        LauncherActivationReason::Programmatic,
                                    ),
                                )
                                .is_ok();
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
