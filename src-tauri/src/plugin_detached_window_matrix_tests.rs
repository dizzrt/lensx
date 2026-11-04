//! Cross-layer deterministic composition: real Manager/resource/instance/RPC and
//! migration coordinators, with only native views and Host transport substituted.
use crate::plugin_child_webview_adapter::PluginChildWebviewNativeHandle;
use crate::plugin_child_webview_execution::NativeExecutionGuard;
use crate::plugin_child_webview_host_dispatcher::*;
use crate::plugin_child_webview_owner::*;
use crate::plugin_child_webview_rpc::PluginChildWebviewRpcIngressResult;
use crate::plugin_child_webview_service::*;
use crate::plugin_detached_window_migration::*;
use crate::plugin_manager::{PackageDigest, PluginManager, PluginRegistrationFacts, PluginSource};
use crate::plugin_manifest::{validate_plugin_manifest, PluginHostVersions};
use crate::plugin_registration::healthy_entry_id;
use crate::plugin_resource_contract::{
    ResolvePluginResourceEntryRequest, PLUGIN_RESOURCE_CONTRACT_VERSION,
};
use crate::plugin_resource_service::PluginResourceService;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::http;

const A: &str = "com.acme.matrix-a";
const B: &str = "com.acme.matrix-b";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOUNDS: PluginChildWebviewBounds = PluginChildWebviewBounds {
    x: 0,
    y: 44,
    width: 900,
    height: 656,
};

struct ViewState {
    window: String,
    alive: bool,
    visible: bool,
    bounds: PluginChildWebviewBounds,
    destroys: usize,
    frames: Vec<Value>,
}
#[derive(Clone)]
struct View {
    source: String,
    state: Arc<Mutex<ViewState>>,
}
impl PluginChildWebviewNativeHandle for View {
    fn source_label(&self) -> String {
        self.source.clone()
    }
    fn ensure_rounded_corners(&self) -> Result<(), ()> {
        Ok(())
    }
    fn hide_unconfirmed_content(&self) -> Result<(), ()> {
        self.hide()
    }
    fn update_bounds(&self, x: i32, y: i32, width: u32, height: u32) -> Result<(), ()> {
        self.state.lock().unwrap().bounds = PluginChildWebviewBounds {
            x,
            y,
            width,
            height,
        };
        Ok(())
    }
    fn show(&self) -> Result<(), ()> {
        self.state.lock().unwrap().visible = true;
        Ok(())
    }
    fn hide(&self) -> Result<(), ()> {
        self.state.lock().unwrap().visible = false;
        Ok(())
    }
    fn focus(&self) -> Result<(), ()> {
        Ok(())
    }
    fn deliver_bridge_frame(&self, frame: &Value) -> Result<(), ()> {
        let mut state = self.state.lock().unwrap();
        if !state.alive {
            return Err(());
        }
        state.frames.push(frame.clone());
        Ok(())
    }
    fn destroy(&self) -> Result<(), ()> {
        let mut state = self.state.lock().unwrap();
        state.destroys += 1;
        state.alive = false;
        state.visible = false;
        Ok(())
    }
}
#[derive(Default)]
struct Transport {
    requests: Mutex<Vec<PluginChildWebviewHostDispatchEvent>>,
    cancels: Mutex<Vec<PluginChildWebviewHostCancelEvent>>,
    disconnected: Mutex<Vec<String>>,
}
impl PluginChildWebviewHostEmitter for Transport {
    fn dispatch(&self, event: &PluginChildWebviewHostDispatchEvent) -> bool {
        self.requests.lock().unwrap().push(event.clone());
        true
    }
    fn cancel(&self, event: &PluginChildWebviewHostCancelEvent) {
        self.cancels.lock().unwrap().push(event.clone());
    }
    fn disconnect(&self, event: &PluginChildWebviewHostDisconnectEvent) {
        self.disconnected
            .lock()
            .unwrap()
            .push(event.session_id.clone());
    }
}
struct NativeContext {
    view: Arc<View>,
    original_window: String,
    retained: Arc<AtomicUsize>,
}
impl Drop for NativeContext {
    fn drop(&mut self) {
        self.retained.fetch_sub(1, Ordering::SeqCst);
    }
}
struct NativeBoundary {
    instances: Arc<PluginChildWebviewRegistry<View>>,
    views: Mutex<BTreeMap<String, View>>,
    windows: Mutex<BTreeSet<String>>,
    retained: Arc<AtomicUsize>,
    fail_forward: AtomicBool,
    fail_restore: AtomicBool,
}
impl NativeBoundary {
    fn retire_confirmed_empty_windows(&self) {
        let views = self.views.lock().unwrap();
        self.windows.lock().unwrap().retain(|window| {
            views.values().any(|view| {
                let state = view.state.lock().unwrap();
                state.alive && &state.window == window
            })
        });
    }
}
impl DetachedWindowMigrationAdapter for NativeBoundary {
    type Context = NativeContext;
    fn now_ms(&self) -> u64 {
        0
    }
    fn eligible(&self, request: &DetachRequest) -> bool {
        self.instances
            .snapshot_owned(request.attempt, &request.owner)
            .is_some_and(|snapshot| {
                snapshot.session_state == PluginChildWebviewSessionState::SdkReady
            })
    }
    fn recovery_available(&self) -> bool {
        true
    }
    fn new_context(&self, transfer: &PluginChildWebviewOwnershipTransfer) -> NativeContext {
        let view = self.instances.handle_for_transfer(transfer).unwrap();
        let original_window = view.state.lock().unwrap().window.clone();
        self.retained.fetch_add(1, Ordering::SeqCst);
        NativeContext {
            view,
            original_window,
            retained: self.retained.clone(),
        }
    }
    fn execute(
        &self,
        step: MigrationStep,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut NativeContext,
        guard: &NativeExecutionGuard,
        _: Duration,
    ) -> Result<(), MigrationFailure> {
        if !guard.is_current() {
            return Err(MigrationFailure::Unavailable);
        }
        if step == MigrationStep::ConfirmTargetClip && self.fail_forward.load(Ordering::SeqCst)
            || step == MigrationStep::RestoreWebview && self.fail_restore.load(Ordering::SeqCst)
        {
            return Err(MigrationFailure::Unavailable);
        }
        match step {
            MigrationStep::PrepareHiddenTarget => {
                assert!(self
                    .windows
                    .lock()
                    .unwrap()
                    .insert(transfer.target.window_label.clone()));
            }
            MigrationStep::MoveWebview => {
                let mut view = context.view.state.lock().unwrap();
                view.window = transfer.target.window_label.clone();
                view.visible = false;
            }
            MigrationStep::ApplyTargetBounds | MigrationStep::RestoreSourceBoundsAndClip => {
                context
                    .view
                    .update_bounds(BOUNDS.x, BOUNDS.y, BOUNDS.width, BOUNDS.height)
                    .unwrap();
            }
            MigrationStep::RestoreWebview => {
                context.view.state.lock().unwrap().window = context.original_window.clone();
            }
            MigrationStep::DestroyTarget => {
                self.cleanup_terminated_target(transfer, context)?;
            }
            MigrationStep::HideTarget => {
                context.view.hide().unwrap();
            }
            _ => {}
        }
        Ok(())
    }
    fn original_native_owner(&self, context: &NativeContext) -> NativeOriginalOwnership {
        let state = context.view.state.lock().unwrap();
        if state.alive {
            NativeOriginalOwnership::Window(state.window.clone())
        } else {
            NativeOriginalOwnership::Destroyed
        }
    }
    fn destroy_retained_original(
        &self,
        _: &PluginChildWebviewOwnershipTransfer,
        context: &mut NativeContext,
        guard: &NativeExecutionGuard,
    ) -> Result<(), MigrationFailure> {
        if !guard.is_current() {
            return Err(MigrationFailure::Unavailable);
        }
        if context.view.state.lock().unwrap().alive {
            context.view.destroy().unwrap();
        }
        Ok(())
    }
    fn show_main_repair(
        &self,
        _: &PluginChildWebviewOwnershipTransfer,
        context: &mut NativeContext,
        guard: &NativeExecutionGuard,
    ) -> Result<(), MigrationFailure> {
        if !guard.is_current() {
            return Err(MigrationFailure::Unavailable);
        }
        context.view.hide().unwrap();
        Ok(())
    }
    fn publish_ownership(
        &self,
        _: &PluginChildWebviewOwnershipTransfer,
        context: &mut NativeContext,
        expected: &PluginChildWebviewOwner,
        guard: &NativeExecutionGuard,
        _: Duration,
        publish: PublishOwnership,
    ) -> Result<bool, MigrationFailure> {
        if !guard.is_current()
            || self.original_native_owner(context)
                != NativeOriginalOwnership::Window(expected.window_label.clone())
        {
            return Err(MigrationFailure::Unavailable);
        }
        context.view.show().unwrap();
        let presentation = if expected.window_label == "main" {
            FinalPresentation::Restored
        } else {
            FinalPresentation::Detached(context.view.state.lock().unwrap().bounds)
        };
        Ok(publish(presentation))
    }
    fn cleanup_terminated_target(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut NativeContext,
    ) -> Result<(), MigrationFailure> {
        if self.original_native_owner(context)
            == NativeOriginalOwnership::Window(transfer.target.window_label.clone())
        {
            return Err(MigrationFailure::Unavailable);
        }
        self.windows
            .lock()
            .unwrap()
            .remove(&transfer.target.window_label);
        Ok(())
    }
}

struct Instance {
    attempt: PluginChildWebviewAttempt,
    source: String,
    url: String,
    view: View,
    creation: PluginChildWebviewCreationFacts,
}
struct Matrix {
    root: PathBuf,
    manager: Arc<PluginManager>,
    resources: Arc<PluginResourceService>,
    instances: Arc<PluginChildWebviewRegistry<View>>,
    dispatcher: Arc<PluginChildWebviewHostDispatcher<View>>,
    transport: Arc<Transport>,
    native: Arc<NativeBoundary>,
    coordinator: DetachedWindowRecoveryCoordinator<View, NativeBoundary>,
}
impl Drop for Matrix {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
impl Matrix {
    fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "lensx-detach-matrix-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let versions = PluginHostVersions {
            lensx: "0.1.0".into(),
            host_api: "0.2.0".into(),
        };
        let manager = PluginManager::recover(root.join("config"), versions.clone());
        let packages = root.join("plugins/packages");
        for plugin in [A, B] {
            let payload = packages
                .join(crate::plugin_identity::plugin_record_key(plugin))
                .join(DIGEST);
            std::fs::create_dir_all(payload.join("dist")).unwrap();
            std::fs::write(payload.join("dist/plugin.html"), format!("<p>{plugin}</p>")).unwrap();
            let mut manifest: Value = serde_json::from_str(include_str!(
                "../../packages/plugin-contract/tests/fixtures/base.json"
            ))
            .unwrap();
            manifest["plugin_id"] = json!(plugin);
            let manifest = validate_plugin_manifest(&manifest, &versions)
                .manifest
                .unwrap();
            manager
                .register(
                    manifest,
                    PluginRegistrationFacts::new(
                        payload.to_string_lossy(),
                        PackageDigest {
                            algorithm: "sha256".into(),
                            value: DIGEST.into(),
                        },
                        PluginSource::External,
                        true,
                    )
                    .unwrap(),
                )
                .unwrap();
        }
        let resources = PluginResourceService::initialize(manager.clone(), Some(packages));
        let instances = Arc::new(PluginChildWebviewRegistry::default());
        assert!(instances.attach_resource_authority(resources.clone()));
        let transport = Arc::new(Transport::default());
        let dispatcher = Arc::new(PluginChildWebviewHostDispatcher::for_test(
            instances.clone(),
            transport.clone(),
        ));
        assert!(instances.attach_ready_dispatcher(dispatcher.clone()));
        assert!(instances.attach_rpc_dispatcher(dispatcher.clone()));
        let native = Arc::new(NativeBoundary {
            instances: instances.clone(),
            views: Mutex::new(BTreeMap::new()),
            windows: Mutex::new(BTreeSet::new()),
            retained: Arc::new(AtomicUsize::new(0)),
            fail_forward: AtomicBool::new(false),
            fail_restore: AtomicBool::new(false),
        });
        let coordinator = DetachedWindowRecoveryCoordinator::new(instances.clone(), native.clone());
        Self {
            root,
            manager,
            resources,
            instances,
            dispatcher,
            transport,
            native,
            coordinator,
        }
    }
    fn entry(&self, plugin: &str) -> String {
        healthy_entry_id(&self.manager.registration(plugin).unwrap())
    }
    fn open_main(&self, plugin: &str) -> Instance {
        let entry = self.entry(plugin);
        let projection = self.manager.read_resource_projection(&entry, None).unwrap();
        let creation = self
            .instances
            .reserve_creation_for_entry(
                PluginChildWebviewOwner::main(),
                &entry,
                projection.resource_generation,
            )
            .unwrap();
        let reservation = self
            .resources
            .reserve_entry_for_attempt(
                &ResolvePluginResourceEntryRequest {
                    contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
                    entry_id: entry.clone(),
                    expected_revision: self.manager.registration_revision(),
                },
                &creation.attempt.opaque_id(),
            )
            .unwrap();
        let url = reservation.entry.entry_url.clone();
        let identity = PluginChildWebviewIdentity::new(
            plugin,
            "home",
            &entry,
            &projection.registration.manifest.version,
            projection.resource_generation,
            url.parse().unwrap(),
            "/",
        )
        .unwrap();
        let attempt = self
            .instances
            .bind_creation_reservation(&creation, identity)
            .unwrap();
        assert!(self.instances.prepare_current_creation(attempt));
        let facts = self.instances.creation_facts(attempt).unwrap();
        let view = View {
            source: facts.source_label.clone(),
            state: Arc::new(Mutex::new(ViewState {
                window: "main".into(),
                alive: true,
                visible: false,
                bounds: BOUNDS,
                destroys: 0,
                frames: Vec::new(),
            })),
        };
        self.native
            .views
            .lock()
            .unwrap()
            .insert(view.source.clone(), view.clone());
        assert!(self.instances.attach_current(attempt, view.clone()));
        assert!(self.instances.mark_native_loaded(attempt, &view.source));
        assert_eq!(self.instances.accept_ready_ingress(attempt, &view.source, &json!({"contract_version":"0.2.0","type":"lensx.plugin_bridge.ready","freshness":facts.freshness}).to_string()), PluginChildWebviewReadyResult::Accepted);
        let instance = Instance {
            attempt,
            source: view.source.clone(),
            url,
            view,
            creation: facts,
        };
        let context = self.request(&instance, 1, "runtime.get_context");
        assert!(self.dispatcher.settle(&context.dispatch_id, json!({"method":"runtime.get_context","result":{"hostApiVersion":"0.2.0","locale":"en-US","theme":"light","capabilities":[]}})));
        assert_eq!(
            self.instances
                .snapshot_attempt(attempt)
                .unwrap()
                .session_state,
            PluginChildWebviewSessionState::SdkReady
        );
        instance
    }
    fn request(
        &self,
        instance: &Instance,
        sequence: u64,
        method: &str,
    ) -> PluginChildWebviewHostDispatchEvent {
        let params = if method == "storage.get" {
            json!({"key":"pending"})
        } else {
            json!({})
        };
        assert_eq!(self.instances.accept_rpc_ingress(instance.attempt, &instance.source, &json!({"contract_version":"0.2.0","type":"lensx.plugin_bridge.request","request_id":format!("request_{sequence:016x}"),"request":{"method":method,"params":params}}).to_string()), PluginChildWebviewRpcIngressResult::Dispatched);
        self.transport
            .requests
            .lock()
            .unwrap()
            .last()
            .unwrap()
            .clone()
    }
    fn detach(&self, instance: &Instance, window: u64) -> RecoveryActionResult {
        self.coordinator.detach(DetachRequest {
            attempt: instance.attempt,
            actual_host_source: "main".into(),
            owner: self
                .instances
                .snapshot_attempt(instance.attempt)
                .unwrap()
                .owner,
            target_window_label: PluginChildWebviewOwner::detached(window)
                .unwrap()
                .window_label,
        })
    }
    fn resource_status(&self, instance: &Instance) -> http::StatusCode {
        self.resources
            .handle_request_from_source(
                &instance.source,
                http::Request::builder()
                    .uri(&instance.url)
                    .body(Vec::new())
                    .unwrap(),
            )
            .status()
    }
    fn invalidate(&self, plugin: &str) {
        self.manager.set_enabled(plugin, false).unwrap();
        let entry = self.entry(plugin);
        self.resources.revoke_entry_eligibility(&entry);
        reconcile_entry_instances(&self.instances, &self.manager, &entry);
        self.coordinator.reconcile_terminated();
        self.native.retire_confirmed_empty_windows();
    }
    fn quit(&self) {
        self.instances.teardown_all().unwrap();
        self.coordinator.reconcile_terminated();
        self.native.retire_confirmed_empty_windows();
    }
    fn assert_empty(&self) {
        assert!(self.instances.snapshots().is_empty());
        assert_eq!(self.resources.live_authority_counts(), (0, 0, 0));
        assert_eq!(self.dispatcher.live_binding_counts(), (0, 0, 0));
        assert!(self.coordinator.recovery_snapshots().is_empty());
        assert!(!self.instances.main_hide_blocked());
        assert!(self.native.windows.lock().unwrap().is_empty());
        assert_eq!(self.native.retained.load(Ordering::SeqCst), 0);
        for view in self.native.views.lock().unwrap().values() {
            let state = view.state.lock().unwrap();
            assert!(!state.alive);
            assert_eq!(state.destroys, 1);
        }
        assert!(self
            .instances
            .reserve_creation(PluginChildWebviewOwner::main())
            .is_none());
    }
}

#[test]
fn sequential_detach_sibling_completion_generation_invalidation_and_quit_preserve_exact_authority()
{
    let matrix = Matrix::new("sequential");
    let a1 = matrix.open_main(A);
    assert!(matches!(
        matrix.detach(&a1, 1),
        RecoveryActionResult::Committed(_)
    ));
    let a2 = matrix.open_main(A);
    let pending = matrix.request(&a2, 2, "storage.get");
    assert!(matches!(
        matrix.detach(&a2, 2),
        RecoveryActionResult::Committed(_)
    ));
    let b = matrix.open_main(B);
    let b_pending = matrix.request(&b, 2, "storage.get");
    assert_eq!(matrix.instances.snapshots().len(), 3);
    assert_eq!(matrix.dispatcher.live_binding_counts(), (3, 2, 0));
    assert_ne!(pending.session_id, b_pending.session_id);
    assert_ne!(pending.dispatch_id, b_pending.dispatch_id);
    assert_eq!(matrix.resources.live_authority_counts(), (2, 3, 0));
    assert_eq!(a1.url, a2.url);
    assert_ne!(
        a1.creation.data_store_identifier,
        a2.creation.data_store_identifier
    );
    for instance in [&a1, &a2] {
        let current = matrix.instances.creation_facts(instance.attempt).unwrap();
        assert_eq!(current.source_label, instance.creation.source_label);
        assert_eq!(current.freshness, instance.creation.freshness);
        assert_eq!(
            current.data_store_identifier,
            instance.creation.data_store_identifier
        );
    }
    assert!(matrix
        .instances
        .compare_current_teardown(a1.attempt)
        .unwrap());
    matrix.native.retire_confirmed_empty_windows();
    assert_eq!(matrix.resource_status(&a1), http::StatusCode::NOT_FOUND);
    assert_eq!(matrix.resource_status(&a2), http::StatusCode::OK);
    assert_eq!(matrix.resource_status(&b), http::StatusCode::OK);
    assert!(matrix.dispatcher.settle(
        &pending.dispatch_id,
        json!({"method":"storage.get","result":{"found":true,"value":"A2 completion"}})
    ));
    assert_eq!(
        a2.view.state.lock().unwrap().frames.last().unwrap()["result"]["result"]["value"],
        "A2 completion"
    );
    assert!(!matrix.dispatcher.settle(&pending.dispatch_id, json!({})));
    let retired = matrix.request(&a2, 3, "storage.get");
    assert_eq!(retired.session_id, pending.session_id);
    matrix.invalidate(A);
    assert_eq!(matrix.resource_status(&a2), http::StatusCode::NOT_FOUND);
    assert_eq!(matrix.resource_status(&b), http::StatusCode::OK);
    assert!(!matrix.dispatcher.settle(
        &retired.dispatch_id,
        json!({"method":"storage.get","result":{"found":false}})
    ));
    assert!(matrix
        .transport
        .cancels
        .lock()
        .unwrap()
        .iter()
        .any(|event| event.dispatch_id == retired.dispatch_id));
    assert!(matrix.dispatcher.settle(
        &b_pending.dispatch_id,
        json!({"method":"storage.get","result":{"found":true,"value":"B survives"}})
    ));
    assert_eq!(matrix.instances.snapshots().len(), 1);
    assert_eq!(matrix.dispatcher.live_binding_counts(), (1, 0, 0));
    assert_eq!(matrix.resources.live_authority_counts(), (1, 1, 0));
    matrix.quit();
    matrix.assert_empty();
}

#[test]
fn retained_recovery_context_composes_with_explicit_recover_close_invalidation_and_quit() {
    for outcome in ["recover", "close", "generation", "quit"] {
        let matrix = Matrix::new(outcome);
        let original = matrix.open_main(A);
        let pending = matrix.request(&original, 2, "storage.get");
        matrix.native.fail_forward.store(true, Ordering::SeqCst);
        matrix.native.fail_restore.store(true, Ordering::SeqCst);
        let RecoveryActionResult::RecoveryRequired(ticket) = matrix.detach(&original, 1) else {
            panic!("compensation must remain pending");
        };
        assert_eq!(matrix.native.retained.load(Ordering::SeqCst), 1);
        assert_eq!(matrix.coordinator.recovery_snapshots().len(), 1);
        assert!(matrix.instances.main_hide_blocked());
        assert!(matrix
            .instances
            .wait_for_stable_owner(original.attempt, Duration::ZERO)
            .is_none());
        assert_eq!(matrix.resource_status(&original), http::StatusCode::OK);
        assert_eq!(
            matrix
                .instances
                .snapshot_attempt(original.attempt)
                .unwrap()
                .rpc_pending_requests,
            1
        );
        assert!(matches!(
            matrix.detach(&original, 2),
            RecoveryActionResult::Rejected
        ));
        assert_eq!(matrix.native.views.lock().unwrap().len(), 1);
        assert_eq!(matrix.native.windows.lock().unwrap().len(), 1);
        match outcome {
            "recover" => {
                matrix.native.fail_restore.store(false, Ordering::SeqCst);
                assert!(matches!(
                    matrix.coordinator.retry_recovery(&ticket, "main"),
                    RecoveryActionResult::RolledBack(_)
                ));
                assert_eq!(
                    matrix
                        .instances
                        .creation_facts(original.attempt)
                        .unwrap()
                        .data_store_identifier,
                    original.creation.data_store_identifier
                );
                assert_eq!(matrix.native.retained.load(Ordering::SeqCst), 0);
                assert_eq!(
                    matrix
                        .instances
                        .wait_for_stable_owner(original.attempt, Duration::ZERO)
                        .unwrap(),
                    PluginChildWebviewOwner::from_parts("main", 2).unwrap()
                );
                assert!(matrix.dispatcher.settle(
                    &pending.dispatch_id,
                    json!({"method":"storage.get","result":{"found":true,"value":"same Session"}})
                ));
                assert_eq!(original.view.state.lock().unwrap().destroys, 0);
            }
            "close" => {
                assert!(matches!(
                    matrix.coordinator.close_recovery(&ticket, "main"),
                    RecoveryActionResult::Terminated
                ));
            }
            "generation" => matrix.invalidate(A),
            "quit" => matrix.quit(),
            _ => unreachable!(),
        }
        if outcome != "recover" {
            assert!(matches!(
                matrix.coordinator.retry_recovery(&ticket, "main"),
                RecoveryActionResult::Rejected
            ));
            assert!(!matrix.dispatcher.settle(
                &pending.dispatch_id,
                json!({"method":"storage.get","result":{"found":false}})
            ));
            assert_eq!(
                matrix.resource_status(&original),
                http::StatusCode::NOT_FOUND
            );
            assert_eq!(original.view.state.lock().unwrap().destroys, 1);
        }
        matrix.quit();
        matrix.assert_empty();
    }
}
