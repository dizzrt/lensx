//! Concrete native/shell composition for the retained migration policy.
//! All native work is confirmed on the main thread; broker waits stay on workers.
#[path = "plugin_detached_window_native_policy.rs"]
mod interactive_policy;
use crate::launcher_native_execution::{self, LauncherNativeFence};
use crate::launcher_surface::{
    LauncherSurfaceBindingResolver, LauncherSurfaceCheckpoint, LauncherSurfaceCoordinator,
    LauncherSurfaceTarget,
};
use crate::plugin_child_webview_adapter::{
    PluginChildWebviewHandle, PluginChildWebviewNativeHandle,
};
use crate::plugin_child_webview_execution::{
    NativeExecutionGuard, NativePresentationOperation, NativePresentationOutcome,
};
use crate::plugin_child_webview_owner::{
    PluginChildWebviewOwner, PluginChildWebviewOwnershipTransfer,
};
use crate::plugin_child_webview_presentation::PluginChildWebviewPresentationIdentity;
use crate::plugin_child_webview_service::{
    PluginChildWebviewAttempt, PluginChildWebviewBounds, PluginChildWebviewService,
    PluginChildWebviewSessionState, PluginChildWebviewState,
};
use crate::plugin_detached_window_host::{
    HostWindowControl, HostWindowGeometry, HostWindowOperationKind, HostWindowOutcome,
    PluginDetachedWindowHost,
};
use crate::plugin_detached_window_migration::{
    rollback_owner, DetachRequest, DetachedWindowMigrationAdapter,
    DetachedWindowRecoveryCoordinator, FinalPresentation, MigrationDiagnostic, MigrationFailure,
    MigrationStep, NativeOriginalOwnership, PublishOwnership, RecoveryActionResult, RecoveryStatus,
    RecoveryTicket,
};
use crate::plugin_manager::PluginManager;
use interactive_policy::{InteractiveBatch, InteractiveStep};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex, OnceLock, Weak,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, Webview, Window, WindowEvent, Wry};

const VERSION: &str = "0.1.0";
type Registry = PluginChildWebviewService<Wry>;
type Original = PluginChildWebviewHandle<Wry>;
type Recovery = DetachedWindowRecoveryCoordinator<Original, NativeDetachedAdapter>;

fn retained_execution_guard(guard: &NativeExecutionGuard) -> Arc<dyn Fn() -> bool + Send + Sync> {
    let guard = guard.clone();
    Arc::new(move || guard.is_current())
}

fn host_input_blocked(app: &AppHandle, host: &PluginDetachedWindowHost) -> bool {
    host.main_interaction_blocked()
        || crate::launcher_shortcuts::recording_active(app)
        || app
            .try_state::<crate::launcher_window::LauncherWindowActions>()
            .is_none_or(|actions| actions.native_dialog_active())
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct WindowSnapshot {
    frame: [f64; 4],
    size: [f64; 2],
    work_area: [f64; 2],
    resizable: bool,
    visible: bool,
}

struct NativeShell {
    epoch: String,
    window: Window,
    host: OnceLock<Webview>,
    intent: AtomicU64,
    destroyed: AtomicBool,
    intentional_close: AtomicBool,
    close_inflight: AtomicBool,
    initial_original: Arc<Original>,
    surface: LauncherSurfaceCoordinator,
    pending_windowed_page: Mutex<Option<(u64, LauncherSurfaceTarget)>>,
    refresh_after_fullscreen: AtomicBool,
    original_attempt: PluginChildWebviewAttempt,
}
impl NativeShell {
    fn guard(self: &Arc<Self>, upstream: &NativeExecutionGuard) -> NativeExecutionGuard {
        let revision = self.intent.load(Ordering::Acquire);
        self.guard_at(revision, upstream)
    }
    fn guard_at(
        self: &Arc<Self>,
        revision: u64,
        upstream: &NativeExecutionGuard,
    ) -> NativeExecutionGuard {
        let shell = Arc::clone(self);
        let upstream = upstream.clone();
        NativeExecutionGuard::new(move || {
            upstream.is_current()
                && !shell.destroyed.load(Ordering::Acquire)
                && shell.intent.load(Ordering::Acquire) == revision
        })
    }
}

#[derive(Clone, Default)]
struct ContextData {
    source: Option<Window>,
    original: Option<Arc<Original>>,
    token: Option<tauri::webview::WebviewReparentTransaction<Wry>>,
    shell_epoch: Option<String>,
    target: Option<Arc<NativeShell>>,
    main_epoch: Option<u64>,
    preliminary: Option<WindowSnapshot>,
    movement: Option<WindowSnapshot>,
    checkpoint: Option<LauncherSurfaceCheckpoint>,
    detached_checkpoint: Option<LauncherSurfaceCheckpoint>,
    bounds: Option<PluginChildWebviewBounds>,
    main_mutated: bool,
    original_mutated: bool,
    repair_hidden: bool,
    source_bounds: Option<PluginChildWebviewBounds>,
    close_revision: Option<String>,
    prepared: bool,
    navigation_transferred: bool,
    home_prepared: bool,
    restore_prepared: bool,
}
#[derive(Clone, Default)]
pub(crate) struct NativeDetachedContext {
    data: Arc<Mutex<ContextData>>,
}
impl NativeDetachedContext {
    fn read(&self) -> ContextData {
        self.data
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }
    fn update(&self, update: impl FnOnce(&mut ContextData)) {
        update(&mut self.data.lock().unwrap_or_else(|error| error.into_inner()));
    }
}

pub(crate) struct NativeDetachedAdapter {
    app: AppHandle,
    registry: Arc<Registry>,
    host: Arc<PluginDetachedWindowHost>,
    manager: Arc<PluginManager>,
    main: Arc<LauncherNativeFence>,
    shells: Mutex<BTreeMap<String, Arc<NativeShell>>>,
    admission: Mutex<Option<(PluginChildWebviewAttempt, Arc<Original>)>>,
    owner: OnceLock<Weak<NativeDetachedState>>,
}

impl NativeDetachedAdapter {
    fn detached_checkpoint(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        native: WindowSnapshot,
    ) -> Result<LauncherSurfaceCheckpoint, MigrationFailure> {
        let entry = self
            .registry
            .snapshot_attempt(transfer.attempt)
            .filter(|entry| {
                entry.owner == transfer.source && entry.source_label == transfer.source_label
            })
            .ok_or(MigrationFailure::Unavailable)?;
        let current = self
            .manager
            .read_resource_projection(entry.identity.entry_id(), None)
            .map_err(|_| MigrationFailure::Unavailable)?;
        if current.resource_generation != entry.identity.resource_generation()
            || current.plugin_id != entry.identity.plugin_id()
            || current.registration.manifest.version != entry.identity.version()
            || !current.registration.facts.enabled
            || !current.registration.compatibility.lensx
            || !current.registration.compatibility.host_api
        {
            return Err(MigrationFailure::Unavailable);
        }
        let page = current
            .registration
            .manifest
            .contributes
            .pages
            .iter()
            .find(|page| page.id == entry.identity.page_id())
            .ok_or(MigrationFailure::Unavailable)?;
        LauncherSurfaceCheckpoint::for_detached_attempt(
            transfer.attempt,
            native.size,
            native.work_area,
            native.resizable,
            page.presentation.resizable,
        )
        .map_err(|_| MigrationFailure::Unavailable)
    }
    fn native<T: Send + 'static>(
        &self,
        guard: &NativeExecutionGuard,
        budget: Duration,
        execute: impl FnOnce(&NativeExecutionGuard) -> Result<T, ()> + Send + 'static,
    ) -> Result<T, MigrationFailure> {
        launcher_native_execution::confirmed(&self.app, guard, budget, execute).map_err(|_| {
            if guard.is_unexpired() {
                MigrationFailure::Unavailable
            } else {
                MigrationFailure::Deadline
            }
        })
    }
    fn checked_move_step<T: Send + 'static>(
        &self,
        guard: &NativeExecutionGuard,
        budget: Duration,
        execute: impl FnOnce(&NativeExecutionGuard) -> Result<T, MigrationFailure> + Send + 'static,
    ) -> Result<T, MigrationFailure> {
        self.native(guard, budget, move |guard| Ok(execute(guard)))
            .map_err(move_execution_failure)?
    }
    fn main_guard(
        &self,
        context: &NativeDetachedContext,
        guard: &NativeExecutionGuard,
    ) -> Result<NativeExecutionGuard, MigrationFailure> {
        Ok(self.main.owned_guard(
            context
                .read()
                .main_epoch
                .ok_or(MigrationFailure::Unavailable)?,
            guard,
        ))
    }
    fn current_generation(&self, attempt: PluginChildWebviewAttempt) -> bool {
        let Some(snapshot) = self.registry.snapshot_attempt(attempt) else {
            return false;
        };
        self.manager
            .read_resource_projection(snapshot.identity.entry_id(), None)
            .is_ok_and(|projection| {
                projection.resource_generation == snapshot.identity.resource_generation()
                    && projection.plugin_id == snapshot.identity.plugin_id()
                    && projection.registration.manifest.version == snapshot.identity.version()
                    && projection.registration.facts.enabled
                    && projection.registration.compatibility.lensx
                    && projection.registration.compatibility.host_api
            })
    }
    fn confirm_foreground(
        &self,
        attempt: PluginChildWebviewAttempt,
        window: Window,
        guard: &NativeExecutionGuard,
        budget: Duration,
    ) -> Result<(), MigrationFailure> {
        if host_input_blocked(&self.app, &self.host) {
            return Err(MigrationFailure::HostInteractionBlocked);
        }
        if !self.current_generation(attempt) {
            return Err(MigrationFailure::SourceGenerationInvalid);
        }
        self.checked_move_step(guard, budget, move |guard| {
            if !guard.is_current() {
                return Err(MigrationFailure::NativeExecutionUnavailable);
            }
            native_main_input_status(&window)
        })
    }
    fn source_record(&self, request: &DetachRequest) -> Option<Arc<Original>> {
        if request.actual_host_source != "main"
            || request.owner.window_label != "main"
            || self.registry.main_hide_blocked()
            || self.registry.is_shutting_down()
        {
            return None;
        }
        let snapshot = self
            .registry
            .snapshot_owned(request.attempt, &request.owner)?;
        if snapshot.state != PluginChildWebviewState::Visible
            || snapshot.session_state != PluginChildWebviewSessionState::SdkReady
            || self.host.main_page_for_attempt(request.attempt).is_err()
        {
            return None;
        }
        self.registry
            .retained_native_handle(request.attempt, &snapshot.source_label)
    }
    fn ensure_token(
        &self,
        context: &NativeDetachedContext,
        guard: &NativeExecutionGuard,
        budget: Duration,
    ) -> Result<tauri::webview::WebviewReparentTransaction<Wry>, MigrationFailure> {
        if let Some(token) = context.read().token {
            return Ok(token);
        }
        let original = context
            .read()
            .original
            .ok_or(MigrationFailure::Unavailable)?;
        let held = context.clone();
        self.native(guard, budget, move |guard| {
            if !guard.is_current() || original.destroyed_confirmed() {
                return Err(());
            }
            let view = original.webview();
            let token = match view.pending_reparent() {
                Some(token) => token,
                None => view.begin_reparent().map_err(|_| ())?,
            };
            held.update(|data| data.token = Some(token.clone()));
            Ok(token)
        })
    }
    fn checked_geometry(
        &self,
        shell: &Arc<NativeShell>,
        guard: &NativeExecutionGuard,
        budget: Duration,
    ) -> Result<PluginChildWebviewBounds, MigrationFailure> {
        let deadline = Instant::now() + budget;
        let mut rejected_geometry = false;
        loop {
            let remaining =
                deadline
                    .checked_duration_since(Instant::now())
                    .ok_or(if rejected_geometry {
                        MigrationFailure::ShellGeometryUnavailable
                    } else {
                        MigrationFailure::ShellReadinessTimeout
                    })?;
            let geometry = self
                .host
                .wait_shell_ready(&shell.epoch, guard, remaining)
                .map_err(|error| match error.code {
                    crate::plugin_detached_window_host::HostWindowErrorCode::Timeout
                        if rejected_geometry =>
                    {
                        MigrationFailure::ShellGeometryUnavailable
                    }
                    crate::plugin_detached_window_host::HostWindowErrorCode::Timeout => {
                        MigrationFailure::ShellReadinessTimeout
                    }
                    _ => MigrationFailure::ShellReadinessUnavailable,
                })?;
            let window = shell.window.clone();
            if let Ok(bounds) = self.native(guard, remaining, move |_| {
                let size = window.inner_size().map_err(|_| ())?;
                let scale = window.scale_factor().map_err(|_| ())?;
                detached_geometry(geometry, scale, size.width, size.height).ok_or(())
            }) {
                return Ok(bounds);
            }
            if !guard.is_current() {
                return Err(MigrationFailure::Unavailable);
            }
            rejected_geometry = true;
            self.host
                .refresh_shell_geometry(&shell.epoch)
                .map_err(|_| MigrationFailure::ShellGeometryUnavailable)?;
        }
    }
    fn close_exact_target(
        &self,
        context: &NativeDetachedContext,
        guard: &NativeExecutionGuard,
        budget: Duration,
    ) -> Result<(), MigrationFailure> {
        let deadline = Instant::now() + budget;
        let data = context.read();
        if let Some(target) = data.target {
            if !target.destroyed.load(Ordering::Acquire) {
                if let Ok(snapshot) = self.host.snapshot(&target.epoch) {
                    let revision = data.close_revision.as_deref().unwrap_or(&snapshot.revision);
                    if !self.host.claim_shell_close(&target.epoch, revision) {
                        return Err(MigrationFailure::Unavailable);
                    }
                }
                let owns_close = !target.close_inflight.swap(true, Ordering::AcqRel);
                if owns_close {
                    let window = target.window.clone();
                    let target_for_close = target.clone();
                    target.intent.fetch_add(1, Ordering::AcqRel);
                    let result = self.native(
                        guard,
                        deadline.saturating_duration_since(Instant::now()),
                        move |guard| {
                            if !guard.is_current() {
                                return Err(());
                            }
                            if target_for_close.destroyed.load(Ordering::Acquire) {
                                return Ok(());
                            }
                            target_for_close
                                .intentional_close
                                .store(true, Ordering::Release);
                            if window.destroy().is_err() {
                                target_for_close
                                    .intentional_close
                                    .store(false, Ordering::Release);
                                return Err(());
                            }
                            Ok(())
                        },
                    );
                    if result.is_err() && !target.destroyed.load(Ordering::Acquire) {
                        target.close_inflight.store(false, Ordering::Release);
                        return result;
                    }
                }
                while !target.destroyed.load(Ordering::Acquire) {
                    if !guard.is_current() || Instant::now() >= deadline {
                        if owns_close {
                            target.close_inflight.store(false, Ordering::Release);
                        }
                        return Err(MigrationFailure::Deadline);
                    }
                    std::thread::sleep(Duration::from_millis(2));
                }
                if owns_close {
                    target.close_inflight.store(false, Ordering::Release);
                }
            }
            self.shells
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .remove(&target.epoch);
        }
        if let Some(epoch) = data.shell_epoch {
            self.host.unregister_shell(&epoch);
        }
        Ok(())
    }
    fn publish_settled(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &NativeDetachedContext,
        owner: &PluginChildWebviewOwner,
        outcome: HostWindowOutcome,
    ) {
        if let Some(epoch) = context.read().shell_epoch {
            self.host.publish_settled(transfer, &epoch, owner, outcome);
        }
    }
}

impl DetachedWindowMigrationAdapter for NativeDetachedAdapter {
    type Context = NativeDetachedContext;
    fn report_failure(&self, diagnostic: MigrationDiagnostic) {
        eprintln!("{diagnostic}");
    }
    fn now_ms(&self) -> u64 {
        static START: OnceLock<Instant> = OnceLock::new();
        START
            .get_or_init(Instant::now)
            .elapsed()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    }
    fn eligible(&self, request: &DetachRequest) -> bool {
        let Some(original) = self.source_record(request) else {
            return false;
        };
        let Some(window) = self.app.get_window("main") else {
            return false;
        };
        let guard = self.main.normal_guard(false);
        if self
            .confirm_foreground(request.attempt, window, &guard, Duration::from_secs(2))
            .is_err()
        {
            return false;
        }
        *self
            .admission
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some((request.attempt, original));
        true
    }
    fn recovery_available(&self) -> bool {
        crate::launcher_shortcuts::recovery_available_now(&self.app)
    }
    fn new_context(&self, transfer: &PluginChildWebviewOwnershipTransfer) -> Self::Context {
        let original = self
            .admission
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
            .filter(|(attempt, _)| *attempt == transfer.attempt)
            .map(|(_, handle)| handle)
            .or_else(|| {
                self.registry
                    .retained_native_handle(transfer.attempt, &transfer.source_label)
            });
        NativeDetachedContext {
            data: Arc::new(Mutex::new(ContextData {
                source: self.app.get_window("main"),
                original,
                ..ContextData::default()
            })),
        }
    }
    fn execute(
        &self,
        step: MigrationStep,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        guard: &NativeExecutionGuard,
        remaining: Duration,
    ) -> Result<(), MigrationFailure> {
        match step {
            MigrationStep::CaptureSource => {
                let epoch = self
                    .main
                    .begin_transfer()
                    .ok_or(MigrationFailure::Unavailable)?;
                context.update(|data| data.main_epoch = Some(epoch));
                let (page, prefs, binding) = self
                    .host
                    .main_page_for_attempt(transfer.attempt)
                    .map_err(|_| MigrationFailure::Unavailable)?;
                let shell = self
                    .host
                    .reserve_shell(transfer, page, prefs, binding)
                    .map_err(|_| MigrationFailure::Unavailable)?;
                context.update(|data| data.shell_epoch = Some(shell.shell_epoch.clone()));
                self.host
                    .dispatch_main_operation(
                        HostWindowOperationKind::PrepareTransfer,
                        transfer,
                        &shell.shell_epoch,
                        &transfer.target,
                        guard,
                        remaining,
                    )
                    .map_err(|_| MigrationFailure::Unavailable)?;
                context.update(|data| data.prepared = true);
                let data = context.read();
                let source = data.source.ok_or(MigrationFailure::Unavailable)?;
                let native_guard = self.main_guard(context, guard)?;
                let snapshot =
                    self.native(&native_guard, remaining, move |_| capture_window(&source))?;
                // The source's cache is rollback bookkeeping and can be empty or
                // still describe Home. The detached cache belongs to the actual
                // registered attempt, its current native size and its Manifest.
                let detached = self.detached_checkpoint(transfer, snapshot)?;
                context.update(|data| {
                    data.preliminary = Some(snapshot);
                    data.detached_checkpoint = Some(detached);
                });
                let deadline = Instant::now() + remaining;
                loop {
                    if let Ok(checkpoint) =
                        self.app.state::<LauncherSurfaceCoordinator>().checkpoint()
                    {
                        context.update(|data| data.checkpoint = Some(checkpoint));
                        break;
                    }
                    if !guard.is_current() || Instant::now() >= deadline {
                        return Err(MigrationFailure::Deadline);
                    }
                    std::thread::sleep(Duration::from_millis(2));
                }
                self.ensure_token(context, &native_guard, remaining)?;
                Ok(())
            }
            MigrationStep::PrepareHiddenTarget => {
                let data = context.read();
                let source = data.source.ok_or(MigrationFailure::Unavailable)?;
                self.confirm_foreground(transfer.attempt, source.clone(), guard, remaining)?;
                let snapshot = data.preliminary.ok_or(MigrationFailure::Unavailable)?;
                let epoch = data.shell_epoch.ok_or(MigrationFailure::Unavailable)?;
                let host = Arc::clone(&self.host);
                let app = self.app.clone();
                let held = context.clone();
                let label = transfer.target.window_label.clone();
                let original_attempt = transfer.attempt;
                let weak = self
                    .owner
                    .get()
                    .cloned()
                    .ok_or(MigrationFailure::Unavailable)?;
                let native_guard = self.main_guard(context, guard)?;
                let reserved_epoch = epoch.clone();
                let shell = self.native(&native_guard, remaining, move |guard| {
                    if !native_main_input_eligible(&source) || !guard.is_current() {
                        return Err(());
                    }
                    let title = host
                        .current_shell_title(&reserved_epoch, &label)
                        .ok_or(())?;
                    Ok(create_hidden_shell(
                        &app,
                        &label,
                        &reserved_epoch,
                        &title,
                        snapshot,
                        original_attempt,
                        weak,
                        guard,
                        &held,
                    ))
                })??;
                self.shells
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .insert(epoch, shell);
                Ok(())
            }
            MigrationStep::AwaitTargetReady => {
                let target = context.read().target.ok_or(MigrationFailure::Unavailable)?;
                let bounds = self.checked_geometry(&target, guard, remaining)?;
                context.update(|data| data.bounds = Some(bounds));
                Ok(())
            }
            MigrationStep::MoveWebview => {
                let data = context.read();
                let source = data
                    .source
                    .ok_or(MigrationFailure::SourceWindowUnavailable)?;
                let target = data.target.ok_or(MigrationFailure::ConfigureHiddenWindow)?;
                self.confirm_foreground(transfer.attempt, source.clone(), guard, remaining)?;
                let snapshot = self.checked_move_step(
                    &self.main_guard(context, guard)?,
                    remaining,
                    move |_| {
                        capture_window(&source)
                            .map_err(|_| MigrationFailure::SourceWindowUnavailable)
                    },
                )?;
                if Some(snapshot.resizable) != data.preliminary.map(|source| source.resizable) {
                    return Err(MigrationFailure::SourceGeometryChanged);
                }
                context.update(|data| data.movement = Some(snapshot));
                let target_window = target.window.clone();
                let target_guard = target.guard(guard);
                let fitted = self.checked_move_step(&target_guard, remaining, move |guard| {
                    configure_window(
                        &target_window,
                        snapshot.size,
                        snapshot.resizable,
                        None,
                        guard,
                    )
                    .map_err(|_| MigrationFailure::ConfigureHiddenWindow)
                })?;
                let checkpoint = data
                    .detached_checkpoint
                    .as_ref()
                    .ok_or(MigrationFailure::AdoptSourceCheckpoint)?;
                target
                    .surface
                    .adopt_detached_checkpoint(checkpoint, fitted.size, fitted.work_area)
                    .map_err(|_| MigrationFailure::AdoptSourceCheckpoint)?;
                self.host
                    .refresh_shell_geometry(&target.epoch)
                    .map_err(|_| MigrationFailure::ShellGeometryUnavailable)?;
                let bounds = self.checked_geometry(&target, guard, remaining)?;
                context.update(|data| data.bounds = Some(bounds));
                let token = self
                    .ensure_token(context, guard, remaining)
                    .map_err(move_execution_failure)?;
                let target_window = target.window.clone();
                let app = self.app.clone();
                let host = self.host.clone();
                let registry = self.registry.clone();
                let manager = self.manager.clone();
                let attempt = transfer.attempt;
                let held = context.clone();
                let source = context
                    .read()
                    .source
                    .ok_or(MigrationFailure::SourceWindowUnavailable)?;
                self.checked_move_step(guard, remaining, move |guard| {
                    if !guard.is_current() {
                        return Err(MigrationFailure::NativeExecutionUnavailable);
                    }
                    if host_input_blocked(&app, &host) {
                        return Err(MigrationFailure::HostInteractionBlocked);
                    }
                    native_main_input_status(&source)?;
                    let fresh = capture_window(&source)
                        .map_err(|_| MigrationFailure::SourceWindowUnavailable)?;
                    if fresh.size != snapshot.size || fresh.resizable != snapshot.resizable {
                        return Err(MigrationFailure::SourceGeometryChanged);
                    }
                    if !generation_is_current(&registry, &manager, attempt) {
                        return Err(MigrationFailure::SourceGenerationInvalid);
                    }
                    if !guard.is_current() {
                        return Err(MigrationFailure::NativeExecutionUnavailable);
                    }
                    held.update(|data| data.movement = Some(fresh));
                    let moved =
                        token.move_to_guarded(&target_window, retained_execution_guard(guard));
                    let actual = match token.actual_owner() {
                        Ok(tauri::webview::WebviewReparentOwnership::Window(window)) => {
                            NativeOriginalOwnership::Window(window.label().into())
                        }
                        Ok(tauri::webview::WebviewReparentOwnership::Destroyed) => {
                            NativeOriginalOwnership::Destroyed
                        }
                        Ok(tauri::webview::WebviewReparentOwnership::Unknown) | Err(_) => {
                            NativeOriginalOwnership::Unknown
                        }
                    };
                    let changed =
                        moved.is_ok() || actual != NativeOriginalOwnership::Window("main".into());
                    held.update(|data| {
                        data.original_mutated |= changed;
                        data.main_mutated |= changed;
                    });
                    let result =
                        classify_native_move(moved.is_ok(), &actual, target_window.label());
                    if changed
                        && guard.is_current()
                        && source.set_resizable(false).is_err()
                        && result.is_ok()
                    {
                        return Err(MigrationFailure::SourceResizeGuardUnavailable);
                    }
                    result
                })
            }
            MigrationStep::ApplyTargetBounds => {
                let data = context.read();
                let original = data.original.ok_or(MigrationFailure::Unavailable)?;
                let bounds = data.bounds.ok_or(MigrationFailure::Unavailable)?;
                let label = transfer.target.window_label.clone();
                self.native(guard, remaining, move |guard| {
                    (original.present_owned(
                        &label,
                        guard,
                        NativePresentationOperation::Bounds {
                            x: bounds.x,
                            y: bounds.y,
                            width: bounds.width,
                            height: bounds.height,
                        },
                    ) == NativePresentationOutcome::Applied)
                        .then_some(())
                        .ok_or(())
                })
            }
            MigrationStep::ConfirmTargetClip => {
                let target = context.read().target.ok_or(MigrationFailure::Unavailable)?;
                let window = target.window.clone();
                self.native(&target.guard(guard), remaining, move |_| {
                    crate::launcher_rounded_corners::ensure_launcher_rounded_corners(&window)
                        .map_err(|_| ())
                })
            }
            MigrationStep::TransferNavigation
            | MigrationStep::PrepareMainHome
            | MigrationStep::RestoreNavigation => {
                let data = context.read();
                let epoch = data.shell_epoch.ok_or(MigrationFailure::Unavailable)?;
                let (kind, owner) = match step {
                    MigrationStep::TransferNavigation => (
                        HostWindowOperationKind::TransferNavigation,
                        transfer.target.clone(),
                    ),
                    MigrationStep::PrepareMainHome => (
                        HostWindowOperationKind::SetMainHome,
                        transfer.target.clone(),
                    ),
                    _ => (
                        HostWindowOperationKind::RestoreNavigation,
                        rollback_owner(transfer),
                    ),
                };
                let geometry = self
                    .host
                    .dispatch_main_operation(kind, transfer, &epoch, &owner, guard, remaining)
                    .map_err(|_| MigrationFailure::Unavailable)?;
                if step == MigrationStep::RestoreNavigation {
                    let geometry = geometry.ok_or(MigrationFailure::Unavailable)?;
                    let source = data.source.clone().ok_or(MigrationFailure::Unavailable)?;
                    let bounds = self.native(guard, remaining, move |_| {
                        let size = source.inner_size().map_err(|_| ())?;
                        let scale = source.scale_factor().map_err(|_| ())?;
                        main_geometry(geometry, scale, size.width, size.height).ok_or(())
                    })?;
                    context.update(|data| data.source_bounds = Some(bounds));
                }
                context.update(|data| match step {
                    MigrationStep::TransferNavigation => data.navigation_transferred = true,
                    MigrationStep::PrepareMainHome => data.home_prepared = true,
                    MigrationStep::RestoreNavigation => data.restore_prepared = true,
                    _ => {}
                });
                Ok(())
            }
            MigrationStep::HideTarget => {
                let data = context.read();
                if let Some(epoch) = data.main_epoch {
                    let next = self
                        .main
                        .renew_transfer(epoch)
                        .ok_or(MigrationFailure::Unavailable)?;
                    context.update(|data| data.main_epoch = Some(next));
                }
                let Some(target) = data.target else {
                    return Ok(());
                };
                if target.destroyed.load(Ordering::Acquire) {
                    return Ok(());
                }
                let window = target.window.clone();
                self.native(&target.guard(guard), remaining, move |_| {
                    window.hide().map_err(|_| ())?;
                    window
                        .is_visible()
                        .is_ok_and(|visible| !visible)
                        .then_some(())
                        .ok_or(())
                })
            }
            MigrationStep::RestoreWebview => {
                let data = context.read();
                if !data.original_mutated && !data.repair_hidden {
                    return Ok(());
                }
                let source = data.source.ok_or(MigrationFailure::Unavailable)?;
                let token = self.ensure_token(context, guard, remaining)?;
                self.native(&self.main_guard(context, guard)?, remaining, move |_| {
                    source.hide().map_err(|_| ())?;
                    source
                        .is_visible()
                        .is_ok_and(|visible| !visible)
                        .then_some(())
                        .ok_or(())
                })?;
                self.native(guard, remaining, move |guard| {
                    token
                        .restore_original_guarded(retained_execution_guard(guard))
                        .map_err(|_| ())?;
                    if !guard.is_current() {
                        return Err(());
                    }
                    token
                        .set_visible_guarded(false, retained_execution_guard(guard))
                        .map_err(|_| ())?
                        .then_some(())
                        .ok_or(())
                })
            }
            MigrationStep::RestoreSourceBoundsAndClip => {
                let data = context.read();
                let source = data.source.ok_or(MigrationFailure::Unavailable)?;
                if data.main_mutated {
                    let snapshot = data
                        .movement
                        .or(data.preliminary)
                        .ok_or(MigrationFailure::Unavailable)?;
                    self.native(&self.main_guard(context, guard)?, remaining, move |guard| {
                        configure_window(
                            &source,
                            snapshot.size,
                            snapshot.resizable,
                            Some(snapshot.frame),
                            guard,
                        )
                    })?;
                }
                if let Some(checkpoint) = data.checkpoint {
                    self.app
                        .state::<LauncherSurfaceCoordinator>()
                        .restore_checkpoint(&checkpoint)
                        .map_err(|_| MigrationFailure::Unavailable)?;
                }
                Ok(())
            }
            MigrationStep::DestroyTarget => self.close_exact_target(context, guard, remaining),
            MigrationStep::PublishOwnership
            | MigrationStep::RevealTarget
            | MigrationStep::FocusTarget
            | MigrationStep::HideMain
            | MigrationStep::SetMainHome
            | MigrationStep::RestoreSourceVisibilityAndFocus => Err(MigrationFailure::Unavailable),
        }
    }
    fn original_native_owner(&self, context: &Self::Context) -> NativeOriginalOwnership {
        let data = context.read();
        let Some(original) = data.original else {
            return NativeOriginalOwnership::Unknown;
        };
        if original.destroyed_confirmed() {
            return NativeOriginalOwnership::Destroyed;
        }
        let guard = NativeExecutionGuard::new(|| true);
        if let Some(token) = data.token {
            return self
                .native(&guard, Duration::from_secs(2), move |_| {
                    Ok(match token.actual_owner().map_err(|_| ())? {
                        tauri::webview::WebviewReparentOwnership::Window(window) => {
                            NativeOriginalOwnership::Window(window.label().into())
                        }
                        tauri::webview::WebviewReparentOwnership::Destroyed => {
                            NativeOriginalOwnership::Destroyed
                        }
                        tauri::webview::WebviewReparentOwnership::Unknown => {
                            NativeOriginalOwnership::Unknown
                        }
                    })
                })
                .unwrap_or(NativeOriginalOwnership::Unknown);
        }
        self.native(&guard, Duration::from_secs(2), move |_| {
            read_original_owner(&original)
        })
        .unwrap_or(NativeOriginalOwnership::Unknown)
    }
    fn destroy_retained_original(
        &self,
        _: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        guard: &NativeExecutionGuard,
    ) -> Result<(), MigrationFailure> {
        let data = context.read();
        if let Some(token) = data.token {
            self.native(guard, Duration::from_secs(5), move |_| {
                token
                    .destroy_original()
                    .map_err(|_| ())?
                    .then_some(())
                    .ok_or(())
            })
        } else {
            let original = data.original.ok_or(MigrationFailure::Unavailable)?;
            self.native(guard, Duration::from_secs(5), move |_| original.destroy())
        }
    }
    fn show_main_repair(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        guard: &NativeExecutionGuard,
    ) -> Result<(), MigrationFailure> {
        let data = context.read();
        let source = data.source.ok_or(MigrationFailure::Unavailable)?;
        if self.original_native_owner(context) != NativeOriginalOwnership::Destroyed {
            let token = self.ensure_token(context, guard, Duration::from_secs(5))?;
            context.update(|data| data.repair_hidden = true);
            self.native(guard, Duration::from_secs(5), move |guard| {
                token
                    .set_visible_guarded(false, retained_execution_guard(guard))
                    .map_err(|_| ())?
                    .then_some(())
                    .ok_or(())
            })?;
        }
        let epoch = self
            .main
            .recovery(data.main_epoch.ok_or(MigrationFailure::Unavailable)?)
            .ok_or(MigrationFailure::Unavailable)?;
        context.update(|data| data.main_epoch = Some(epoch));
        self.publish_settled(
            transfer,
            context,
            &transfer.source,
            HostWindowOutcome::RecoveryRequired,
        );
        self.native(
            &self.main_guard(context, guard)?,
            Duration::from_secs(5),
            move |guard| {
                crate::launcher_rounded_corners::ensure_launcher_rounded_corners(&source)
                    .map_err(|_| ())?;
                if !guard.is_current() {
                    return Err(());
                }
                source.show().map_err(|_| ())?;
                if !source.is_visible().unwrap_or(false) {
                    return Err(());
                }
                if native_application_active() && guard.is_current() {
                    source.set_focus().map_err(|_| ())?;
                }
                Ok(())
            },
        )
    }
    fn publish_ownership(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        expected_owner: &PluginChildWebviewOwner,
        guard: &NativeExecutionGuard,
        remaining: Duration,
        publish: PublishOwnership,
    ) -> Result<bool, MigrationFailure> {
        let data = context.read();
        let target_commit = expected_owner.window_label != "main";
        if target_commit && (!data.prepared || !data.navigation_transferred || !data.home_prepared)
        {
            return Err(MigrationFailure::Unavailable);
        }
        if !target_commit
            && data.prepared
            && (!data.restore_prepared || data.source_bounds.is_none())
        {
            return Err(MigrationFailure::Unavailable);
        }
        let token = self.ensure_token(context, guard, remaining)?;
        if target_commit {
            let target = data.target.as_ref().ok_or(MigrationFailure::Unavailable)?;
            let bounds = self.checked_geometry(target, guard, remaining)?;
            context.update(|data| data.bounds = Some(bounds));
        }
        let batch = NativeInteractiveBatch {
            app: self.app.clone(),
            registry: self.registry.clone(),
            host: self.host.clone(),
            main: self.main.clone(),
            context: context.clone(),
            data: context.read(),
            transfer: transfer.clone(),
            expected: expected_owner.clone(),
            token,
            guard: guard.clone(),
            publish: Some(publish),
            applied_target_bounds: None,
            target_commit,
        };
        self.native(guard, remaining, move |_| {
            let mut batch = batch;
            if !batch.preflight() {
                return Err(());
            }
            let steps = if batch.target_commit {
                interactive_policy::TARGET_BATCH
            } else if batch.data.original_mutated || batch.data.repair_hidden {
                interactive_policy::SOURCE_BATCH
            } else {
                &[InteractiveStep::SourceBoundsAndClip]
            };
            interactive_policy::execute_batch(&mut batch, steps)
        })
    }
    fn cleanup_terminated_target(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
    ) -> Result<(), MigrationFailure> {
        if self.original_native_owner(context) != NativeOriginalOwnership::Destroyed {
            return Err(MigrationFailure::Unavailable);
        }
        let guard = NativeExecutionGuard::new(|| true);
        self.close_exact_target(context, &guard, Duration::from_secs(5))?;
        if let Some(token) = context.read().token {
            self.native(&guard, Duration::from_secs(5), move |_| {
                token
                    .finish_terminated()
                    .map_err(|_| ())?
                    .then_some(())
                    .ok_or(())
            })?;
        }
        let data = context.read();
        if let Some(epoch) = data.main_epoch {
            if self.main.epoch() == epoch && !data.main_mutated {
                if let Some(checkpoint) = data.checkpoint {
                    self.app
                        .state::<LauncherSurfaceCoordinator>()
                        .restore_checkpoint(&checkpoint)
                        .map_err(|_| MigrationFailure::Unavailable)?;
                }
            }
            self.main.finish(epoch);
        }
        self.publish_settled(
            transfer,
            context,
            &transfer.source,
            HostWindowOutcome::Terminated,
        );
        Ok(())
    }
}

struct NativeInteractiveBatch {
    app: AppHandle,
    registry: Arc<Registry>,
    host: Arc<PluginDetachedWindowHost>,
    main: Arc<LauncherNativeFence>,
    context: NativeDetachedContext,
    data: ContextData,
    transfer: PluginChildWebviewOwnershipTransfer,
    expected: PluginChildWebviewOwner,
    token: tauri::webview::WebviewReparentTransaction<Wry>,
    guard: NativeExecutionGuard,
    publish: Option<PublishOwnership>,
    applied_target_bounds: Option<PluginChildWebviewBounds>,
    target_commit: bool,
}
impl NativeInteractiveBatch {
    fn preflight(&self) -> bool {
        if !self.current()
            || !generation_is_current(&self.registry, &self.manager(), self.transfer.attempt)
        {
            return false;
        }
        if !matches!(self.token.actual_owner(),Ok(tauri::webview::WebviewReparentOwnership::Window(window))if window.label()==self.expected.window_label)
        {
            return false;
        }
        if self.target_commit {
            self.data
                .source
                .as_ref()
                .is_some_and(native_main_input_eligible)
                && !host_input_blocked(&self.app, &self.host)
                && crate::launcher_shortcuts::recovery_available_now(&self.app)
        } else {
            true
        }
    }
    fn manager(&self) -> Arc<PluginManager> {
        Arc::clone(self.app.state::<Arc<PluginManager>>().inner())
    }
    fn original(&self) -> Result<Arc<Original>, ()> {
        self.data.original.clone().ok_or(())
    }
    fn source(&self) -> Result<Window, ()> {
        self.data.source.clone().ok_or(())
    }
    fn present(&self, label: &str, operation: NativePresentationOperation) -> Result<(), ()> {
        (self
            .original()?
            .present_owned(label, &self.guard, operation)
            == NativePresentationOutcome::Applied)
            .then_some(())
            .ok_or(())
    }
    fn bounds(&self, label: &str, bounds: PluginChildWebviewBounds) -> Result<(), ()> {
        self.present(
            label,
            NativePresentationOperation::Bounds {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
            },
        )
    }
}
impl InteractiveBatch for NativeInteractiveBatch {
    fn current(&self) -> bool {
        self.guard.is_current()
            && self
                .data
                .main_epoch
                .is_some_and(|epoch| self.main.epoch() == epoch)
    }
    fn apply(&mut self, step: InteractiveStep) -> Result<(), ()> {
        match step {
            InteractiveStep::MainHome => {
                self.context.update(|data| data.main_mutated = true);
                let source = self.source()?;
                configure_window(&source, [650.0, 320.0], false, None, &self.guard)?;
                if !self.current() {
                    return Err(());
                }
                // Publish cache facts only after their native effect. This is a
                // nonblocking pure try-lock; no lock spans native work or waits.
                // A pre-batch terminal event must not leave a fictitious Home
                // cache that makes a new document skip its actual resize.
                self.app
                    .state::<LauncherSurfaceCoordinator>()
                    .prepare_home_cache(capture_window(&source)?.work_area)
            }
            InteractiveStep::TargetBoundsAndClip => {
                let target = self.data.target.as_ref().ok_or(())?;
                if target.destroyed.load(Ordering::Acquire)
                    || !self.host.shell_source_current(&target.epoch)
                {
                    return Err(());
                }
                let bounds = self.data.bounds.ok_or(())?;
                let size = target.window.inner_size().map_err(|_| ())?;
                if bounds.x != 0
                    || bounds.y != 0
                    || bounds.width != size.width
                    || bounds.height != size.height
                {
                    return Err(());
                }
                crate::launcher_rounded_corners::ensure_launcher_rounded_corners(&target.window)
                    .map_err(|_| ())?;
                self.bounds(&self.expected.window_label, bounds)?;
                self.applied_target_bounds = Some(bounds);
                Ok(())
            }
            InteractiveStep::RevealOriginal => self.present(
                &self.expected.window_label,
                NativePresentationOperation::Show,
            ),
            InteractiveStep::RevealTarget => {
                let target = self.data.target.as_ref().ok_or(())?;
                target.window.show().map_err(|_| ())?;
                target
                    .window
                    .is_visible()
                    .is_ok_and(|visible| visible)
                    .then_some(())
                    .ok_or(())
            }
            InteractiveStep::FocusTarget => {
                if !native_application_active() {
                    return Err(());
                }
                let target = self.data.target.as_ref().ok_or(())?;
                target.window.set_focus().map_err(|_| ())?;
                if !self.current() || !target.window.is_focused().unwrap_or(false) {
                    return Err(());
                }
                self.present(
                    &self.expected.window_label,
                    NativePresentationOperation::Focus,
                )
            }
            InteractiveStep::HideMain => {
                if !crate::launcher_shortcuts::recovery_available_now(&self.app) {
                    return Err(());
                }
                let source = self.source()?;
                source.hide().map_err(|_| ())?;
                source
                    .is_visible()
                    .is_ok_and(|visible| !visible)
                    .then_some(())
                    .ok_or(())
            }
            InteractiveStep::SourceBoundsAndClip => {
                crate::launcher_rounded_corners::ensure_launcher_rounded_corners(&self.source()?)
                    .map_err(|_| ())?;
                if let Some(bounds) = self.data.source_bounds {
                    self.bounds("main", bounds)?;
                }
                Ok(())
            }
            InteractiveStep::RevealSource => {
                let source = self.source()?;
                source.unminimize().map_err(|_| ())?;
                if !self.current() {
                    return Err(());
                }
                source.show().map_err(|_| ())?;
                source
                    .is_visible()
                    .is_ok_and(|visible| visible)
                    .then_some(())
                    .ok_or(())
            }
            InteractiveStep::FocusSource => {
                let source = self.source()?;
                if !native_restore_focus_allowed(
                    &source,
                    self.data.target.as_ref().map(|target| &target.window),
                ) {
                    return Ok(());
                }
                source.set_focus().map_err(|_| ())?;
                if !self.current() || !source.is_focused().unwrap_or(false) {
                    return Err(());
                }
                self.present("main", NativePresentationOperation::Focus)
            }
        }
    }
    fn publish(&mut self) -> Result<bool, ()> {
        let publish = self.publish.take().ok_or(())?;
        let presentation = if self.target_commit {
            FinalPresentation::Detached(self.applied_target_bounds.ok_or(())?)
        } else {
            FinalPresentation::Restored
        };
        let fence = self.main.clone();
        let epoch = self.data.main_epoch.ok_or(())?;
        let host = self.host.clone();
        let shell = self.data.shell_epoch.clone();
        let transfer = self.transfer.clone();
        let owner = self.expected.clone();
        let outcome = if self.target_commit {
            HostWindowOutcome::Committed
        } else {
            HostWindowOutcome::Restored
        };
        self.token
            .commit_with(move || {
                if !publish(presentation) {
                    return false;
                }
                // Durable publication owns these local finalizers; response loss or
                // stage expiration cannot leave normal presentation suspended.
                fence.finish(epoch);
                if let Some(shell) = shell {
                    host.publish_settled(&transfer, &shell, &owner, outcome);
                }
                true
            })
            .map_err(|_| ())
    }
    fn published(&self) -> bool {
        self.transfer.publication_receipt.read().is_some()
    }
    fn quiesce(&mut self) {
        if self.published() || (!self.data.original_mutated && !self.data.repair_hidden) {
            return;
        }
        // This exact retained view remains safe to hide even if parent lookup is
        // Unknown. Never retarget a Window by label or touch a published owner.
        let _ = self.token.set_visible(false);
        self.context.update(|data| data.repair_hidden = true);
        if let Some(target) = &self.data.target {
            if !target.destroyed.load(Ordering::Acquire)
                && self.registry.ownership_transfer_is_current(&self.transfer)
            {
                let _ = target.window.hide();
            }
        }
        if self
            .data
            .main_epoch
            .is_some_and(|epoch| self.main.epoch() == epoch)
            && self.registry.ownership_transfer_is_current(&self.transfer)
        {
            if let Some(source) = &self.data.source {
                let _ = source.hide();
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn native_restore_focus_allowed(source: &Window, target: Option<&Window>) -> bool {
    if !native_application_active() {
        return false;
    }
    let Some(marker) = objc2::MainThreadMarker::new() else {
        return false;
    };
    let application = objc2_app_kit::NSApplication::sharedApplication(marker);
    let Some(key) = application.keyWindow() else {
        return true;
    };
    let key = &*key as *const objc2_app_kit::NSWindow as usize;
    native_window(source)
        .is_ok_and(|window| &*window as *const objc2_app_kit::NSWindow as usize == key)
        || target.is_some_and(|target| {
            native_window(target)
                .is_ok_and(|window| &*window as *const objc2_app_kit::NSWindow as usize == key)
        })
}
#[cfg(not(target_os = "macos"))]
fn native_restore_focus_allowed(_source: &Window, _target: Option<&Window>) -> bool {
    false
}

fn generation_is_current(
    registry: &Registry,
    manager: &PluginManager,
    attempt: PluginChildWebviewAttempt,
) -> bool {
    registry.snapshot_attempt(attempt).is_some_and(|snapshot| {
        manager
            .read_resource_projection(snapshot.identity.entry_id(), None)
            .is_ok_and(|projection| {
                projection.resource_generation == snapshot.identity.resource_generation()
                    && projection.plugin_id == snapshot.identity.plugin_id()
                    && projection.registration.manifest.version == snapshot.identity.version()
                    && projection.registration.facts.enabled
                    && projection.registration.compatibility.lensx
                    && projection.registration.compatibility.host_api
            })
    })
}

#[cfg(target_os = "macos")]
use crate::launcher_surface::native_content_window as native_window;
#[cfg(target_os = "macos")]
fn capture_window(window: &Window) -> Result<WindowSnapshot, ()> {
    let native = native_window(window)?;
    let frame = native.frame();
    let content = native.contentRectForFrameRect(frame).size;
    Ok(WindowSnapshot {
        frame: [
            frame.origin.x,
            frame.origin.y,
            frame.size.width,
            frame.size.height,
        ],
        size: [content.width, content.height],
        work_area: {
            let size = native
                .contentRectForFrameRect(crate::launcher_surface::macos_frame_work_area(&native)?)
                .size;
            [size.width, size.height]
        },
        resizable: native.styleMask().0 & objc2_app_kit::NSWindowStyleMask::Resizable.0 != 0,
        visible: native.isVisible(),
    })
}
#[cfg(not(target_os = "macos"))]
fn capture_window(_window: &Window) -> Result<WindowSnapshot, ()> {
    Err(())
}

fn fitted_size(size: [f64; 2], work: [f64; 2]) -> Option<[f64; 2]> {
    if !size
        .iter()
        .chain(work.iter())
        .all(|value| value.is_finite() && *value > 0.0)
        || work[0] < 320.0
        || work[1] < 180.0
    {
        return None;
    }
    Some([
        size[0].clamp(320.0, work[0].min(4096.0)),
        size[1].clamp(180.0, work[1].min(4096.0)),
    ])
}
#[cfg(target_os = "macos")]
fn configure_window(
    window: &Window,
    size: [f64; 2],
    resizable: bool,
    frame: Option<[f64; 4]>,
    guard: &NativeExecutionGuard,
) -> Result<WindowSnapshot, ()> {
    use crate::launcher_surface::{
        set_macos_content_geometry, set_macos_resizable, ContentGeometry,
    };
    let native = native_window(window)?;
    if !guard.is_current() {
        return Err(());
    }
    if let Some(frame) = frame {
        native.setFrameOrigin(objc2_foundation::NSPoint::new(frame[0], frame[1]));
    }
    let work = crate::launcher_surface::macos_frame_work_area(&native)?;
    // The display's work area bounds the outer frame. A standard titlebar
    // consumes part of that frame, but never part of the plugin's content slot.
    let available = native.contentRectForFrameRect(work).size;
    let size = fitted_size(size, [available.width, available.height]).ok_or(())?;
    let hard_minimum = [320.0, 180.0];
    let hard_maximum = [available.width.min(4096.0), available.height.min(4096.0)];
    set_macos_resizable(window, &native, guard, false)?;
    set_macos_content_geometry(&native, guard, ContentGeometry::Minimum, hard_minimum)?;
    set_macos_content_geometry(&native, guard, ContentGeometry::Maximum, hard_maximum)?;
    set_macos_content_geometry(&native, guard, ContentGeometry::Size, size)?;
    if let Some(frame) = frame {
        if !guard.is_current() {
            return Err(());
        }
        let current = native.frame();
        let x = frame[0].clamp(
            work.origin.x,
            work.origin.x + (work.size.width - current.size.width).max(0.0),
        );
        let y = frame[1].clamp(
            work.origin.y,
            work.origin.y + (work.size.height - current.size.height).max(0.0),
        );
        native.setFrameOrigin(objc2_foundation::NSPoint::new(x, y));
    }
    set_macos_content_geometry(
        &native,
        guard,
        ContentGeometry::Minimum,
        if resizable { hard_minimum } else { size },
    )?;
    set_macos_content_geometry(
        &native,
        guard,
        ContentGeometry::Maximum,
        if resizable { hard_maximum } else { size },
    )?;
    set_macos_resizable(window, &native, guard, resizable)?;
    crate::launcher_rounded_corners::ensure_launcher_rounded_corners(window).map_err(|_| ())?;
    let actual = capture_window(window)?;
    (guard.is_current()
        && (actual.size[0] - size[0]).abs() < 1.0
        && (actual.size[1] - size[1]).abs() < 1.0
        && actual.resizable == resizable)
        .then_some(actual)
        .ok_or(())
}
#[cfg(not(target_os = "macos"))]
fn configure_window(
    _window: &Window,
    _size: [f64; 2],
    _resizable: bool,
    _frame: Option<[f64; 4]>,
    _guard: &NativeExecutionGuard,
) -> Result<WindowSnapshot, ()> {
    Err(())
}

#[cfg(target_os = "macos")]
fn native_application_active() -> bool {
    objc2_app_kit::NSRunningApplication::currentApplication().isActive()
}
#[cfg(not(target_os = "macos"))]
fn native_application_active() -> bool {
    false
}
fn move_execution_failure(failure: MigrationFailure) -> MigrationFailure {
    if failure == MigrationFailure::Unavailable {
        MigrationFailure::NativeExecutionUnavailable
    } else {
        failure
    }
}

fn classify_native_move(
    completed: bool,
    actual: &NativeOriginalOwnership,
    target_label: &str,
) -> Result<(), MigrationFailure> {
    match actual {
        NativeOriginalOwnership::Window(label) if label == target_label && completed => Ok(()),
        NativeOriginalOwnership::Window(label) if label == target_label => {
            Err(MigrationFailure::RetainedMoveRefusedAtTarget)
        }
        NativeOriginalOwnership::Window(label) if label == "main" => {
            Err(MigrationFailure::RetainedMoveAtSource)
        }
        NativeOriginalOwnership::Destroyed => Err(MigrationFailure::RetainedMoveOriginalDestroyed),
        _ => Err(MigrationFailure::RetainedMoveOwnerUnknown),
    }
}

fn native_main_input_eligible(window: &Window) -> bool {
    native_main_input_status(window).is_ok()
}

#[cfg(target_os = "macos")]
fn native_main_input_status(window: &Window) -> Result<(), MigrationFailure> {
    use objc2_foundation::NSObjectProtocol;
    if window.label() != "main" {
        return Err(MigrationFailure::SourceWindowUnavailable);
    }
    if !native_application_active() {
        return Err(MigrationFailure::SourceApplicationInactive);
    }
    let native = native_window(window).map_err(|_| MigrationFailure::SourceWindowUnavailable)?;
    if !native.isVisible() || !native.isKeyWindow() {
        return Err(MigrationFailure::SourceWindowNotKey);
    }
    if let Some(responder) = native.firstResponder() {
        if responder.respondsToSelector(objc2::sel!(hasMarkedText)) {
            let marked: objc2::runtime::Bool =
                unsafe { objc2::msg_send![&*responder, hasMarkedText] };
            if marked.as_bool() {
                return Err(MigrationFailure::SourceCompositionActive);
            }
        }
    }
    Ok(())
}
#[cfg(not(target_os = "macos"))]
fn native_main_input_status(_window: &Window) -> Result<(), MigrationFailure> {
    Err(MigrationFailure::SourceWindowUnavailable)
}

fn detached_geometry(
    geometry: HostWindowGeometry,
    scale: f64,
    width: u32,
    height: u32,
) -> Option<PluginChildWebviewBounds> {
    geometry
        .fills_detached_content(scale, width, height)
        .then_some(PluginChildWebviewBounds {
            x: 0,
            y: 0,
            width,
            height,
        })
}

fn main_geometry(
    geometry: HostWindowGeometry,
    scale: f64,
    width: u32,
    height: u32,
) -> Option<PluginChildWebviewBounds> {
    let bounds = geometry.physical_bounds;
    if !scale.is_finite()
        || scale <= 0.0
        || (geometry.scale_factor - scale).abs() > f64::EPSILON
        || ![bounds.x, bounds.y, bounds.width, bounds.height]
            .iter()
            .all(|value| value.is_finite() && *value >= 0.0 && value.fract() == 0.0)
        || bounds.x != 0.0
        || bounds.y <= 0.0
        || bounds.width != f64::from(width)
        || bounds.y + bounds.height != f64::from(height)
        || bounds.height <= 0.0
        || bounds.y > i32::MAX as f64
    {
        return None;
    }
    Some(PluginChildWebviewBounds {
        x: 0,
        y: bounds.y as i32,
        width,
        height: bounds.height as u32,
    })
}

#[cfg(target_os = "macos")]
fn configure_detached_titlebar(window: &Window, guard: &NativeExecutionGuard) -> Result<(), ()> {
    use objc2_app_kit::{
        NSWindowButton, NSWindowCollectionBehavior, NSWindowStyleMask, NSWindowTitleVisibility,
    };
    let native = native_window(window)?;
    if !guard.is_current() {
        return Err(());
    }
    native.setTitlebarAppearsTransparent(false);
    // Let AppKit's green button enter its own full-screen Space. The launcher
    // uses a different collection behavior so it can appear above other apps.
    let mut behavior = native.collectionBehavior();
    behavior.remove(
        NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::FullScreenNone,
    );
    behavior.insert(NSWindowCollectionBehavior::FullScreenPrimary);
    native.setCollectionBehavior(behavior);
    // Windowed Pages can have a fixed contentMaxSize. Full-screen layout
    // follows the current display, including when the window changes displays.
    let unbounded = f64::from(f32::MAX);
    native.setMaxFullScreenContentSize(objc2_foundation::NSSize::new(unbounded, unbounded));
    let style = native.styleMask();
    let buttons = [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ];
    (guard.is_current()
        && native.isOpaque()
        && native
            .collectionBehavior()
            .contains(NSWindowCollectionBehavior::FullScreenPrimary)
        && style.contains(
            NSWindowStyleMask::Titled
                | NSWindowStyleMask::Closable
                | NSWindowStyleMask::Miniaturizable,
        )
        && !style.contains(NSWindowStyleMask::FullSizeContentView)
        && native.titleVisibility() == NSWindowTitleVisibility::Hidden
        && !native.titlebarAppearsTransparent()
        && buttons.iter().all(|button| {
            native
                .standardWindowButton(*button)
                .is_some_and(|button| !button.isHidden())
        }))
    .then_some(())
    .ok_or(())
}

#[cfg(target_os = "macos")]
pub(crate) fn refresh_detached_window_title(
    app: &AppHandle,
    host: &Arc<PluginDetachedWindowHost>,
    snapshot: &crate::plugin_detached_window_host::HostWindowSnapshot,
) {
    let epoch = snapshot.shell_epoch.clone();
    let label = snapshot.owner.window_label.clone();
    let host = Arc::clone(host);
    let app_for_title = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = app_for_title.get_window(&label) else {
            return;
        };
        let Ok(native) = native_window(&window) else {
            return;
        };
        // A delayed locale or Page update must use the current title for this
        // registered shell, even if a later publication has already completed.
        if let Some(title) = host.current_shell_title(&epoch, &label) {
            native.setTitle(&objc2_foundation::NSString::from_str(&title));
        }
    });
}

#[cfg(target_os = "macos")]
fn create_hidden_shell(
    app: &AppHandle,
    label: &str,
    epoch: &str,
    title: &str,
    snapshot: WindowSnapshot,
    attempt: PluginChildWebviewAttempt,
    owner: Weak<NativeDetachedState>,
    guard: &NativeExecutionGuard,
    context: &NativeDetachedContext,
) -> Result<Arc<NativeShell>, MigrationFailure> {
    use crate::frame_aware_navigation_policy::{
        FrameAwareNavigationPolicy, NavigationDecision, NavigationFrame,
    };
    use tauri::webview::{NavigationFrame as NativeFrame, NewWindowResponse, WebviewBuilder};
    use tauri::{LogicalPosition, LogicalSize, WebviewUrl, WindowBuilder};
    if !guard.is_current() {
        return Err(MigrationFailure::Unavailable);
    }
    let initial_original = context
        .read()
        .original
        .ok_or(MigrationFailure::Unavailable)?;
    let window = WindowBuilder::new(app, label)
        .title(title)
        .visible(false)
        .focused(false)
        .decorations(true)
        // In this pinned runtime Visible selects full-size content. Start in
        // the non-overlay style and make the native titlebar opaque below.
        .title_bar_style(tauri::TitleBarStyle::Transparent)
        .hidden_title(true)
        .closable(true)
        .minimizable(true)
        .maximizable(true)
        .transparent(false)
        .always_on_top(false)
        .visible_on_all_workspaces(false)
        .resizable(snapshot.resizable)
        .fullscreen(false)
        .inner_size(snapshot.size[0], snapshot.size[1])
        .min_inner_size(320.0, 180.0)
        .max_inner_size(4096.0, 4096.0)
        .build()
        .map_err(|_| MigrationFailure::CreateHiddenWindow)?;
    let policy = Arc::clone(app.state::<Arc<FrameAwareNavigationPolicy>>().inner());
    let target = app.state::<Arc<crate::trusted_app_target::TrustedAppTarget>>();
    let target_url = target
        .document_url()
        .parse()
        .map_err(|_| MigrationFailure::AttachShellWebview)?;
    let builder = WebviewBuilder::new(label, WebviewUrl::External(target_url))
        .focused(false)
        .transparent(true)
        .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
        .auto_resize()
        .on_navigation_with_frame(move |url, frame| {
            matches!(
                policy.decide(
                    match frame {
                        NativeFrame::Main => NavigationFrame::Main,
                        NativeFrame::Descendant => NavigationFrame::Descendant,
                        NativeFrame::Unknown => NavigationFrame::Unknown,
                    },
                    url.as_str()
                ),
                NavigationDecision::Allow(_)
            )
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false);
    let shell = Arc::new(NativeShell {
        epoch: epoch.into(),
        window: window.clone(),
        host: OnceLock::new(),
        intent: AtomicU64::new(1),
        destroyed: AtomicBool::new(false),
        intentional_close: AtomicBool::new(false),
        close_inflight: AtomicBool::new(false),
        initial_original,
        surface: LauncherSurfaceCoordinator::default(),
        pending_windowed_page: Mutex::default(),
        refresh_after_fullscreen: AtomicBool::new(false),
        original_attempt: attempt,
    });
    context.update(|data| data.target = Some(Arc::clone(&shell)));
    let observed = Arc::downgrade(&shell);
    window.on_window_event(move |event| {
        let Some(observed) = observed.upgrade() else {
            return;
        };
        if matches!(event, WindowEvent::Destroyed) {
            observed.destroyed.store(true, Ordering::Release);
            observed.intent.fetch_add(1, Ordering::AcqRel);
        }
        if let Some(state) = owner.upgrade() {
            state.on_shell_event(observed, event);
        }
    });
    if !guard.is_current() {
        return Err(MigrationFailure::Unavailable);
    }
    configure_detached_titlebar(&window, guard)
        .map_err(|_| MigrationFailure::ConfigureHiddenWindow)?;
    let host = window
        .add_child(
            builder,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(snapshot.size[0], snapshot.size[1]),
        )
        .map_err(|_| MigrationFailure::AttachShellWebview)?;
    let _ = shell.host.set(host);
    if !guard.is_current() {
        return Err(MigrationFailure::Unavailable);
    }
    let fitted = configure_window(
        &window,
        snapshot.size,
        snapshot.resizable,
        Some(snapshot.frame),
        guard,
    )
    .map_err(|_| MigrationFailure::ConfigureHiddenWindow)?;
    let checkpoint = context
        .read()
        .detached_checkpoint
        .ok_or(MigrationFailure::AdoptSourceCheckpoint)?;
    shell
        .surface
        .adopt_detached_checkpoint(&checkpoint, fitted.size, fitted.work_area)
        .map_err(|_| MigrationFailure::AdoptSourceCheckpoint)?;
    if window
        .is_visible()
        .map_err(|_| MigrationFailure::ConfirmHiddenWindow)?
        || window
            .is_always_on_top()
            .map_err(|_| MigrationFailure::ConfirmHiddenWindow)?
    {
        return Err(MigrationFailure::ConfirmHiddenWindow);
    }
    Ok(shell)
}
#[cfg(not(target_os = "macos"))]
fn create_hidden_shell(
    _app: &AppHandle,
    _label: &str,
    _epoch: &str,
    _title: &str,
    _snapshot: WindowSnapshot,
    _attempt: PluginChildWebviewAttempt,
    _owner: Weak<NativeDetachedState>,
    _guard: &NativeExecutionGuard,
    _context: &NativeDetachedContext,
) -> Result<Arc<NativeShell>, MigrationFailure> {
    Err(MigrationFailure::Unavailable)
}

#[cfg(target_os = "macos")]
fn read_original_owner(original: &Arc<Original>) -> Result<NativeOriginalOwnership, ()> {
    if original.destroyed_confirmed() {
        return Ok(NativeOriginalOwnership::Destroyed);
    }
    let view = original.webview();
    let expected = view.window();
    let expected_label = expected.label().to_owned();
    let pointer = native_window(&expected)
        .ok()
        .map(|window| &*window as *const objc2_app_kit::NSWindow as usize);
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    view.with_webview_data(move |platform| {
        let native: &objc2_web_kit::WKWebView = unsafe { &*platform.inner().cast() };
        let owner = native
            .window()
            .map(|window| &*window as *const objc2_app_kit::NSWindow as usize);
        let result = if pointer.is_some() && owner == pointer {
            NativeOriginalOwnership::Window(expected_label)
        } else {
            NativeOriginalOwnership::Unknown
        };
        let _ = sender.send(result);
    })
    .map_err(|_| ())?;
    receiver.try_recv().map_err(|_| ())
}
#[cfg(not(target_os = "macos"))]
fn read_original_owner(_original: &Arc<Original>) -> Result<NativeOriginalOwnership, ()> {
    Ok(NativeOriginalOwnership::Unknown)
}

pub(crate) struct NativeDetachedState {
    adapter: Arc<NativeDetachedAdapter>,
    coordinator: Arc<Recovery>,
    next_window: AtomicU64,
    inflight: Mutex<BTreeMap<PluginChildWebviewAttempt, Arc<(Mutex<bool>, std::sync::Condvar)>>>,
    admission_failure: Mutex<Option<(PluginChildWebviewAttempt, PluginChildWebviewOwner)>>,
}
impl NativeDetachedState {
    fn reserve_detach(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Option<Arc<(Mutex<bool>, std::sync::Condvar)>> {
        let done = Arc::new((Mutex::new(false), std::sync::Condvar::new()));
        {
            let mut active = self
                .inflight
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if active.contains_key(&attempt) {
                return None;
            }
            active.insert(attempt, done.clone());
        }
        *self
            .admission_failure
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
        Some(done)
    }
    fn run_reserved_detach(
        &self,
        request: DetachRequest,
        done: Arc<(Mutex<bool>, std::sync::Condvar)>,
    ) -> RecoveryActionResult {
        let attempt = request.attempt;
        let result = self.coordinator.detach(request);
        if matches!(
            result,
            RecoveryActionResult::Rejected | RecoveryActionResult::Busy
        ) {
            self.record_admission_failure(attempt);
        }
        self.finish_detach(attempt, &done);
        result
    }
    fn finish_detach(
        &self,
        attempt: PluginChildWebviewAttempt,
        done: &Arc<(Mutex<bool>, std::sync::Condvar)>,
    ) {
        *done.0.lock().unwrap_or_else(|error| error.into_inner()) = true;
        done.1.notify_all();
        self.inflight
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&attempt);
        self.adapter
            .admission
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take();
        // Lifecycle invalidation can win immediately after the durable transfer
        // receipt but before shell publication. Reconcile the settled view too.
        self.reconcile_terminated_shells();
        self.notify_control_state(attempt);
    }
    fn notify_control_state(&self, attempt: PluginChildWebviewAttempt) {
        if let Some(main) = self.adapter.app.get_webview("main") {
            let _ = main.emit(
                "plugin-detached-window-state-changed",
                serde_json::json!({
                    "contract_version": VERSION, "attempt_id": attempt.opaque_id(),
                }),
            );
        }
    }
    fn record_admission_failure(&self, attempt: PluginChildWebviewAttempt) {
        let owner = self
            .adapter
            .registry
            .snapshot_attempt(attempt)
            .filter(|snapshot| {
                snapshot.owner.window_label == "main"
                    && snapshot.session_state == PluginChildWebviewSessionState::SdkReady
            })
            .map(|snapshot| snapshot.owner);
        *self
            .admission_failure
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = owner.map(|owner| (attempt, owner));
    }
    fn await_inflight(
        &self,
        attempt: PluginChildWebviewAttempt,
        timeout: Duration,
    ) -> Result<(), ()> {
        let Some(active) = self
            .inflight
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(&attempt)
            .cloned()
        else {
            return Ok(());
        };
        let done = active.0.lock().map_err(|_| ())?;
        let (done, wait) = active
            .1
            .wait_timeout_while(done, timeout, |done| !*done)
            .map_err(|_| ())?;
        if wait.timed_out() || !*done {
            Err(())
        } else {
            Ok(())
        }
    }
    fn on_shell_event(self: &Arc<Self>, shell: Arc<NativeShell>, event: &WindowEvent) {
        match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let state = Arc::clone(self);
                let epoch = shell.epoch.clone();
                let snapshot = self.adapter.host.snapshot(&epoch).ok();
                let attempt = self
                    .adapter
                    .registry
                    .snapshot_for_surface(shell.window.label())
                    .map(|value| value.attempt)
                    .unwrap_or(shell.original_attempt);
                if let Some(snapshot) = snapshot {
                    tauri::async_runtime::spawn_blocking(move || {
                        let _ = state.close_shell_exact(&epoch, &snapshot.revision, attempt);
                    });
                }
            }
            WindowEvent::Destroyed => {
                if shell.intentional_close.load(Ordering::Acquire) {
                    return;
                }
                let state = Arc::clone(self);
                let epoch = shell.epoch.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    state.shell_lost(&epoch, shell.original_attempt)
                });
            }
            WindowEvent::Moved(_)
            | WindowEvent::ScaleFactorChanged { .. }
            | WindowEvent::Resized(_) => {
                // AppKit can restore a window to the same origin on exiting
                // full screen. Tao still emits a resize in that case.
                if matches!(event, WindowEvent::Resized(_))
                    && !shell.refresh_after_fullscreen.swap(false, Ordering::AcqRel)
                {
                    return;
                }
                if shell.surface.request_environment_refresh() {
                    let state = Arc::clone(self);
                    let epoch = shell.epoch.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        shell
                            .surface
                            .run_environment_refresh(|| state.refresh_shell(&epoch))
                    });
                }
            }
            _ => {}
        }
    }
    fn shell(&self, epoch: &str) -> Result<Arc<NativeShell>, ()> {
        self.adapter
            .shells
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(epoch)
            .cloned()
            .ok_or(())
    }
    fn close_shell_exact(
        &self,
        epoch: &str,
        revision: &str,
        attempt: PluginChildWebviewAttempt,
    ) -> Result<(), ()> {
        let snapshot = self.adapter.host.snapshot(epoch).map_err(|_| ())?;
        if snapshot.revision != revision {
            return Err(());
        }
        let bound_attempt = snapshot
            .binding
            .as_ref()
            .and_then(|binding| PluginChildWebviewAttempt::from_opaque_id(&binding.attempt_id));
        if bound_attempt.is_some_and(|bound| bound != attempt)
            || !self.adapter.host.claim_shell_close(epoch, revision)
        {
            return Err(());
        }
        let shell = self.shell(epoch)?;
        if let Some(current) = self
            .adapter
            .registry
            .snapshot_for_surface(shell.window.label())
        {
            if bound_attempt.is_some_and(|bound| current.attempt != bound) {
                return Err(());
            }
            // A preparing shell was captured by revision before its Child
            // attached. The close claim prevents any successor Page intent.
            self.close_attempt(current.attempt)?;
            if bound_attempt.is_none() {
                self.adapter
                    .host
                    .publish_instance_closed(epoch, current.attempt, &current.owner);
                self.close_empty_shell(&shell)?;
            }
            Ok(())
        } else {
            self.adapter
                .registry
                .teardown_surface(shell.window.label())?;
            if self
                .adapter
                .registry
                .snapshot_attempt(attempt)
                .is_some_and(|entry| entry.owner.window_label == "main")
            {
                self.adapter.registry.compare_current_teardown(attempt)?;
                self.coordinator.reconcile_terminated();
            }
            self.close_empty_shell(&shell)
        }
    }
    fn close_empty_shell(&self, shell: &Arc<NativeShell>) -> Result<(), ()> {
        self.close_empty_shell_at(shell, None)
    }
    fn close_empty_shell_at(
        &self,
        shell: &Arc<NativeShell>,
        revision: Option<String>,
    ) -> Result<(), ()> {
        if self
            .adapter
            .registry
            .snapshot_for_surface(shell.window.label())
            .is_some()
            || self
                .adapter
                .registry
                .surface_has_pending(shell.window.label())
        {
            return Err(());
        }
        if !shell.destroyed.load(Ordering::Acquire) && !shell.initial_original.destroyed_confirmed()
        {
            let original = shell.initial_original.clone();
            let label = shell.window.label().to_owned();
            let owner = self
                .adapter
                .native(
                    &NativeExecutionGuard::new(|| true),
                    Duration::from_secs(2),
                    move |_| read_original_owner(&original),
                )
                .map_err(|_| ())?;
            let original_is_outside = match owner {
                NativeOriginalOwnership::Destroyed => true,
                NativeOriginalOwnership::Window(parent) => parent != label,
                NativeOriginalOwnership::Unknown => false,
            };
            if !original_is_outside {
                return Err(());
            }
        }
        let context = NativeDetachedContext::default();
        context.update(|data| {
            data.target = Some(shell.clone());
            data.shell_epoch = Some(shell.epoch.clone());
            data.close_revision = revision;
        });
        self.adapter
            .close_exact_target(
                &context,
                &NativeExecutionGuard::new(|| true),
                Duration::from_secs(5),
            )
            .map_err(|_| ())
    }
    fn close_attempt(&self, attempt: PluginChildWebviewAttempt) -> Result<(), ()> {
        let expected = self
            .adapter
            .registry
            .snapshot_attempt(attempt)
            .filter(|snapshot| snapshot.owner.window_label != "main")
            .and_then(|snapshot| {
                self.adapter
                    .host
                    .snapshot_for_window(&snapshot.owner.window_label)
                    .ok()
            })
            .filter(|snapshot| {
                snapshot
                    .binding
                    .as_ref()
                    .is_some_and(|binding| binding.attempt_id == attempt.opaque_id())
            });
        let owner = self
            .adapter
            .registry
            .teardown_with_owner(attempt)?
            .ok_or(())?;
        self.coordinator.reconcile_terminated();
        if owner.window_label != "main" {
            let snapshot = self
                .adapter
                .host
                .snapshot_for_window(&owner.window_label)
                .map_err(|_| ())?;
            let shell = self.shell(&snapshot.shell_epoch)?;
            if expected.as_ref().is_some_and(|expected| {
                expected.shell_epoch != snapshot.shell_epoch || expected.owner != snapshot.owner
            }) {
                return Ok(());
            }
            if snapshot.owner.native().as_ref() != Some(&owner) {
                return Ok(());
            }
            let still_original = snapshot
                .binding
                .as_ref()
                .is_some_and(|binding| binding.attempt_id == attempt.opaque_id())
                || snapshot.phase == crate::plugin_detached_window_host::HostWindowPhase::Preparing
                    && owner.revision > 1
                    && shell.original_attempt == attempt;
            if !still_original {
                return Ok(());
            }
            self.adapter
                .host
                .publish_instance_closed(&snapshot.shell_epoch, attempt, &owner);
            self.close_empty_shell_at(&shell, Some(snapshot.revision))?;
        }
        Ok(())
    }
    fn replace_attempt(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: PluginChildWebviewOwner,
    ) -> Result<(), ()> {
        self.adapter
            .registry
            .teardown_owned_instance(attempt, &owner)?
            .ok_or(())?;
        self.coordinator.reconcile_terminated();
        self.await_inflight(attempt, Duration::from_secs(10))
    }
    fn shell_lost(&self, epoch: &str, _attempt: PluginChildWebviewAttempt) {
        if let Ok(shell) = self.shell(epoch) {
            shell.intent.fetch_add(1, Ordering::AcqRel);
            let teardown = self.adapter.registry.teardown_surface(shell.window.label());
            self.coordinator.reconcile_terminated();
            match interactive_policy::shell_loss_cleanup(
                shell.destroyed.load(Ordering::Acquire),
                teardown.is_ok(),
            ) {
                interactive_policy::ShellLossCleanup::RetireDestroyed => {
                    self.adapter.host.unregister_shell(epoch);
                    if self
                        .adapter
                        .registry
                        .snapshot_for_surface(shell.window.label())
                        .is_none()
                    {
                        self.adapter
                            .shells
                            .lock()
                            .unwrap_or_else(|error| error.into_inner())
                            .remove(epoch);
                    }
                }
                interactive_policy::ShellLossCleanup::CloseLive => {
                    // A Host document reload is not native Window destruction.
                    // Keep its broker close identity until confirmed empty+closed.
                    // A target retaining an uncommitted original stays protected.
                    let _ = self.close_empty_shell(&shell);
                }
                interactive_policy::ShellLossCleanup::RetainForRetry => {}
            }
        }
    }
    fn main_lost(&self, epochs: Vec<String>) {
        for epoch in epochs {
            if let Ok(shell) = self.shell(&epoch) {
                let _ = self.adapter.registry.teardown_surface(shell.window.label());
                let _ = self
                    .adapter
                    .registry
                    .compare_current_teardown(shell.original_attempt);
                self.coordinator.reconcile_terminated();
                let _ = self.close_empty_shell(&shell);
            }
        }
    }
    fn reconcile_terminated_shells(&self) {
        self.cleanup_terminated_shells(self.capture_terminated_shells());
    }
    fn capture_terminated_shells(
        &self,
    ) -> Vec<(
        Arc<NativeShell>,
        String,
        PluginChildWebviewAttempt,
        crate::plugin_detached_window_host::HostWindowOwner,
    )> {
        let shells = self
            .adapter
            .shells
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .values()
            .cloned()
            .collect::<Vec<_>>();
        shells
            .into_iter()
            .filter_map(|shell| {
                let snapshot = self.adapter.host.snapshot(&shell.epoch).ok()?;
                let binding = snapshot.binding.as_ref()?;
                let attempt = PluginChildWebviewAttempt::from_opaque_id(&binding.attempt_id)?;
                (self.adapter.registry.snapshot_attempt(attempt).is_none()
                    && !self
                        .adapter
                        .registry
                        .surface_has_pending(shell.window.label()))
                .then_some((shell, snapshot.revision, attempt, snapshot.owner))
            })
            .collect()
    }
    fn cleanup_terminated_shells(
        &self,
        retired: Vec<(
            Arc<NativeShell>,
            String,
            PluginChildWebviewAttempt,
            crate::plugin_detached_window_host::HostWindowOwner,
        )>,
    ) {
        self.coordinator.reconcile_terminated();
        for (shell, revision, attempt, owner) in retired {
            if self
                .adapter
                .host
                .snapshot(&shell.epoch)
                .is_ok_and(|snapshot| {
                    snapshot.revision == revision
                        && snapshot
                            .binding
                            .as_ref()
                            .is_some_and(|binding| binding.attempt_id == attempt.opaque_id())
                })
            {
                if let Some(owner) = owner.native() {
                    self.adapter
                        .host
                        .publish_instance_closed(&shell.epoch, attempt, &owner);
                }
                let _ = self.close_empty_shell_at(&shell, Some(revision));
            }
        }
    }
    fn prepare_shell_page(
        &self,
        epoch: &str,
        identity: &PluginChildWebviewPresentationIdentity,
    ) -> Result<(), ()> {
        let shell = self.shell(epoch)?;
        let projection = self
            .adapter
            .manager
            .read_resource_projection(&identity.entry_id, Some(&identity.expected_revision))
            .map_err(|_| ())?;
        let page = projection
            .registration
            .manifest
            .contributes
            .pages
            .iter()
            .find(|page| page.id == identity.page_id)
            .ok_or(())?;
        if projection.plugin_id != identity.plugin_id
            || projection.registration.manifest.version != identity.version
            || !projection.registration.facts.enabled
        {
            return Err(());
        }
        let revision = shell.intent.fetch_add(1, Ordering::AcqRel) + 1;
        let target = LauncherSurfaceTarget::PluginPage {
            owner_id: identity.plugin_id.clone(),
            page_id: identity.page_id.clone(),
            page_attempt_id: format!("page_attempt_{revision}"),
            initial_size: crate::launcher_surface::LauncherLogicalSize {
                width: page.presentation.initial_size.width,
                height: page.presentation.initial_size.height,
            },
            resizable: page.presentation.resizable,
        };
        self.update_windowed_surface(shell, revision, Some(target))
    }
    fn refresh_shell(&self, epoch: &str) {
        let Ok(shell) = self.shell(epoch) else {
            return;
        };
        let revision = shell.intent.load(Ordering::Acquire);
        let _ = self.update_windowed_surface(shell, revision, None);
    }
    fn update_windowed_surface(
        &self,
        shell: Arc<NativeShell>,
        revision: u64,
        page: Option<LauncherSurfaceTarget>,
    ) -> Result<(), ()> {
        let host = Arc::clone(&self.adapter.host);
        let epoch = shell.epoch.clone();
        let source = NativeExecutionGuard::new(move || host.shell_source_current(&epoch));
        let guard = shell.guard_at(revision, &source);
        let manager = Arc::clone(&self.adapter.manager);
        // Serialize the fullscreen read and windowed geometry writes in one
        // AppKit turn. Never clamp a fullscreen Space to the desktop work area.
        launcher_native_execution::confirmed(
            &self.adapter.app,
            &guard,
            Duration::from_secs(5),
            move |guard| {
                let restoring = page.is_none();
                let target = {
                    let fullscreen = shell.window.is_fullscreen().map_err(|_| ())?;
                    let mut pending = shell.pending_windowed_page.lock().map_err(|_| ())?;
                    if fullscreen {
                        if let Some(page) = page {
                            if !manager.validates_target(&page) {
                                return Err(());
                            }
                            *pending = Some((revision, page));
                        }
                        shell
                            .refresh_after_fullscreen
                            .store(pending.is_some(), Ordering::Release);
                        return Ok(());
                    }
                    shell
                        .refresh_after_fullscreen
                        .store(false, Ordering::Release);
                    let deferred = pending.take().filter(|(intent, _)| *intent == revision);
                    page.or_else(|| deferred.map(|(_, page)| page))
                };
                if let Some(target) = target {
                    let result = crate::launcher_surface::apply_owned_window_surface(
                        &shell.window,
                        &shell.surface,
                        &manager,
                        &target,
                        guard.clone(),
                    );
                    if restoring
                        && result.is_err()
                        && guard.is_current()
                        && manager.validates_target(&target)
                    {
                        *shell.pending_windowed_page.lock().map_err(|_| ())? =
                            Some((revision, target));
                    }
                    result.map_err(|_| ())
                } else {
                    crate::launcher_surface::refresh_owned_window_surface(
                        &shell.window,
                        &shell.surface,
                        guard.clone(),
                    )
                }
            },
        )
    }
}
struct NativeHostControl(Weak<NativeDetachedState>);
impl HostWindowControl for NativeHostControl {
    fn close_attempt(&self, attempt: PluginChildWebviewAttempt) -> Result<(), ()> {
        self.0.upgrade().ok_or(())?.close_attempt(attempt)
    }
    fn replace_attempt(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: PluginChildWebviewOwner,
    ) -> Result<(), ()> {
        self.0.upgrade().ok_or(())?.replace_attempt(attempt, owner)
    }
    fn prepare_page(
        &self,
        epoch: &str,
        identity: &PluginChildWebviewPresentationIdentity,
    ) -> Result<(), ()> {
        self.0
            .upgrade()
            .ok_or(())?
            .prepare_shell_page(epoch, identity)
    }
    fn shell_lost(&self, epoch: &str, attempt: PluginChildWebviewAttempt) {
        if let Some(state) = self.0.upgrade() {
            state.shell_lost(epoch, attempt);
        }
    }
    fn main_lost(&self, epochs: Vec<String>) {
        if let Some(state) = self.0.upgrade() {
            state.main_lost(epochs);
        }
    }
}

pub(crate) fn setup_plugin_detached_window_native(
    app: &AppHandle,
    registry: Arc<Registry>,
    host: Arc<PluginDetachedWindowHost>,
    manager: Arc<PluginManager>,
) -> Arc<NativeDetachedState> {
    let adapter = Arc::new(NativeDetachedAdapter {
        app: app.clone(),
        registry: registry.clone(),
        host: host.clone(),
        manager,
        main: launcher_native_execution::fence(app),
        shells: Mutex::new(BTreeMap::new()),
        admission: Mutex::new(None),
        owner: OnceLock::new(),
    });
    let coordinator = Arc::new(DetachedWindowRecoveryCoordinator::new(
        registry,
        adapter.clone(),
    ));
    let state = Arc::new(NativeDetachedState {
        adapter: adapter.clone(),
        coordinator,
        next_window: AtomicU64::new(0),
        inflight: Mutex::new(BTreeMap::new()),
        admission_failure: Mutex::new(None),
    });
    let _ = adapter.owner.set(Arc::downgrade(&state));
    assert!(host.attach_control(Arc::new(NativeHostControl(Arc::downgrade(&state)))));
    assert!(app.manage(state.clone()));
    state
}

#[cfg(target_os = "macos")]
fn native_focus_in<R: tauri::Runtime>(window: &tauri::Window<R>, view: &tauri::Webview<R>) -> bool {
    if objc2::MainThreadMarker::new().is_none() {
        return false;
    }
    let Ok(expected) = window.ns_window() else {
        return false;
    };
    let expected = expected as usize;
    let (sender, receiver) = std::sync::mpsc::channel();
    if view
        .with_webview_data(move |platform| {
            let view: &objc2_web_kit::WKWebView = unsafe { &*platform.inner().cast() };
            let valid = view.window().is_some_and(|window| {
                (&*window as *const objc2_app_kit::NSWindow as usize) == expected
                    && window.isKeyWindow()
                    && window.firstResponder().is_some_and(|responder| {
                        responder
                            .downcast_ref::<objc2_app_kit::NSView>()
                            .is_some_and(|focused| {
                                !focused.isHiddenOrHasHiddenAncestor()
                                    && focused.isDescendantOf(view)
                            })
                    })
            });
            let _ = sender.send(valid);
        })
        .is_err()
    {
        return false;
    }
    receiver.try_recv().unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn native_detach_candidate(
    state: &NativeDetachedState,
) -> Option<crate::plugin_child_webview_service::PluginChildWebviewSnapshot> {
    let source = state.adapter.app.get_window("main")?;
    let snapshot = state.adapter.registry.snapshot_for_surface("main")?;
    let original = state
        .adapter
        .registry
        .retained_native_handle(snapshot.attempt, &snapshot.source_label)?;
    let host_focus = state.adapter.app.get_webview("main").is_some_and(|host| {
        state.adapter.host.authorize_main_webview(&host) && native_focus_in(&source, &host)
    });
    let facts = crate::launcher_window::local_commands::DetachSourceFacts {
        native_input_valid: native_main_input_eligible(&source),
        source_ready_and_current: snapshot.owner.window_label == "main"
            && snapshot.state == PluginChildWebviewState::Visible
            && snapshot.session_state == PluginChildWebviewSessionState::SdkReady
            && !state.adapter.registry.main_hide_blocked()
            && !state.adapter.registry.is_shutting_down()
            && state.adapter.main.normal_guard(false).is_current()
            && state
                .adapter
                .host
                .main_page_for_attempt(snapshot.attempt)
                .is_ok()
            && state.adapter.current_generation(snapshot.attempt)
            && !state
                .inflight
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .contains_key(&snapshot.attempt),
        trusted_responder: host_focus || native_focus_in(&source, &original.webview()),
        host_unblocked: !host_input_blocked(&state.adapter.app, &state.adapter.host),
        recovery_available: state.adapter.recovery_available(),
    };
    facts.eligible().then_some(snapshot)
}
/// Synchronous native admission before the monitor consumes the original key.
/// The worker receives this exact attempt/owner; it cannot look up a new Page.
#[cfg(target_os = "macos")]
pub(crate) fn dispatch_local_detach<R: tauri::Runtime>(
    app: &AppHandle<R>,
    configuration_revision: u64,
) -> bool {
    let Some(state) = app
        .try_state::<Arc<NativeDetachedState>>()
        .map(|state| Arc::clone(state.inner()))
    else {
        return false;
    };
    let Some(snapshot) = native_detach_candidate(&state) else {
        return false;
    };
    let sequence =
        match state
            .next_window
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
                value.checked_add(1)
            }) {
            Ok(previous) => previous + 1,
            Err(_) => return false,
        };
    let Some(target) = PluginChildWebviewOwner::detached(sequence) else {
        return false;
    };
    let request = DetachRequest {
        attempt: snapshot.attempt,
        actual_host_source: "main".into(),
        owner: snapshot.owner,
        target_window_label: target.window_label,
    };
    if state.adapter.source_record(&request).is_none()
        || !state.adapter.current_generation(request.attempt)
    {
        return false;
    }
    let epoch = state.adapter.main.epoch();
    let Some(done) = state.reserve_detach(request.attempt) else {
        return false;
    };
    tauri::async_runtime::spawn_blocking(move || {
        let current_configuration =
            crate::launcher_shortcuts::local_shortcut_facts(&state.adapter.app).is_some_and(
                |facts| !facts.stopped && facts.configuration_revision == configuration_revision,
            );
        if state.adapter.main.epoch() != epoch || !current_configuration {
            state.record_admission_failure(request.attempt);
            state.finish_detach(request.attempt, &done);
            return;
        }
        state.run_reserved_detach(request, done);
    });
    true
}

/// Close a native-key detached Window captured now; late work cannot switch to
/// a replacement Page or to main when this exact shell revision is retired.
#[cfg(target_os = "macos")]
pub(crate) fn dispatch_local_detached_close<R: tauri::Runtime>(
    app: &AppHandle<R>,
    key_window: usize,
) -> bool {
    let Some(state) = app
        .try_state::<Arc<NativeDetachedState>>()
        .map(|state| Arc::clone(state.inner()))
    else {
        return false;
    };
    let shells = state
        .adapter
        .shells
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .values()
        .cloned()
        .collect::<Vec<_>>();
    let Some(shell) = shells.into_iter().find(|shell| {
        native_window(&shell.window)
            .is_ok_and(|window| (&*window as *const objc2_app_kit::NSWindow as usize) == key_window)
    }) else {
        return false;
    };
    let Ok(snapshot) = state.adapter.host.snapshot(&shell.epoch) else {
        return false;
    };
    let attempt = snapshot
        .binding
        .as_ref()
        .and_then(|binding| PluginChildWebviewAttempt::from_opaque_id(&binding.attempt_id))
        .unwrap_or(shell.original_attempt);
    tauri::async_runtime::spawn_blocking(move || {
        let _ = state.close_shell_exact(&shell.epoch, &snapshot.revision, attempt);
    });
    true
}

/// Capture Window identities before Quit's worker starts. Native teardown still
/// runs while the application's event loop can acknowledge every operation.
pub(crate) fn prepare_detached_shutdown<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Option<Box<dyn FnOnce() + Send>> {
    let state = app
        .try_state::<Arc<NativeDetachedState>>()
        .map(|state| Arc::clone(state.inner()))?;
    let shells = state
        .adapter
        .shells
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .values()
        .cloned()
        .collect::<Vec<_>>();
    let inflight = state
        .inflight
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .keys()
        .copied()
        .collect::<Vec<_>>();
    for shell in &shells {
        shell.intent.fetch_add(1, Ordering::AcqRel);
    }
    Some(Box::new(move || {
        let deadline = Instant::now() + Duration::from_secs(10);
        for attempt in inflight {
            let _ =
                state.await_inflight(attempt, deadline.saturating_duration_since(Instant::now()));
        }
        state.coordinator.reconcile_terminated();
        for shell in shells {
            let _ = state.close_empty_shell(&shell);
        }
        state.adapter.host.close_subscriptions();
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecoveryWindowRequest {
    contract_version: String,
    attempt_id: String,
    transfer_token: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadWindowRequest {
    contract_version: String,
}
#[derive(Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeWindowError {
    code: &'static str,
    message: &'static str,
}
fn unavailable() -> NativeWindowError {
    NativeWindowError {
        code: "unavailable",
        message: "Plugin window operation is unavailable.",
    }
}
#[derive(Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeWindowResult {
    contract_version: &'static str,
    status: &'static str,
    owner: Option<crate::plugin_detached_window_host::HostWindowOwner>,
    attempt_id: Option<String>,
    transfer_token: Option<String>,
}
impl From<RecoveryActionResult> for NativeWindowResult {
    fn from(value: RecoveryActionResult) -> Self {
        let (status, owner, ticket) = match value {
            RecoveryActionResult::Rejected => ("rejected", None, None),
            RecoveryActionResult::Busy => ("busy", None, None),
            RecoveryActionResult::Committed(owner) => ("committed", Some(owner), None),
            RecoveryActionResult::RolledBack(restored) => ("restored", Some(restored.owner), None),
            RecoveryActionResult::RecoveryRequired(ticket) => {
                ("recovery_required", None, Some(ticket))
            }
            RecoveryActionResult::Closing(ticket) => ("closing", None, Some(ticket)),
            RecoveryActionResult::Terminated => ("terminated", None, None),
            RecoveryActionResult::Superseded => ("superseded", None, None),
        };
        Self {
            contract_version: VERSION,
            status,
            owner: owner.as_ref().map(Into::into),
            attempt_id: ticket.as_ref().map(|ticket| ticket.attempt.opaque_id()),
            transfer_token: ticket.map(|ticket| ticket.token.opaque_id()),
        }
    }
}
fn authorize(
    state: &NativeDetachedState,
    webview: &Webview,
    version: &str,
) -> Result<(), NativeWindowError> {
    (version == VERSION && state.adapter.host.authorize_main_webview(webview))
        .then_some(())
        .ok_or_else(unavailable)
}
fn recovery_ticket(
    state: &NativeDetachedState,
    request: &RecoveryWindowRequest,
) -> Result<RecoveryTicket, NativeWindowError> {
    state
        .coordinator
        .recovery_snapshots()
        .into_iter()
        .map(|snapshot| snapshot.ticket)
        .find(|ticket| {
            ticket.attempt.opaque_id() == request.attempt_id
                && ticket.token.opaque_id() == request.transfer_token
        })
        .ok_or_else(unavailable)
}
#[tauri::command]
pub(crate) async fn retry_detached_window_recovery(
    webview: Webview,
    state: State<'_, Arc<NativeDetachedState>>,
    request: RecoveryWindowRequest,
) -> Result<NativeWindowResult, NativeWindowError> {
    authorize(&state, &webview, &request.contract_version)?;
    let ticket = recovery_ticket(&state, &request)?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        state.coordinator.retry_recovery(&ticket, "main").into()
    })
    .await
    .map_err(|_| unavailable())
}
#[tauri::command]
pub(crate) async fn close_detached_window_recovery(
    webview: Webview,
    state: State<'_, Arc<NativeDetachedState>>,
    request: RecoveryWindowRequest,
) -> Result<NativeWindowResult, NativeWindowError> {
    authorize(&state, &webview, &request.contract_version)?;
    let ticket = recovery_ticket(&state, &request)?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        state.coordinator.close_recovery(&ticket, "main").into()
    })
    .await
    .map_err(|_| unavailable())
}
#[derive(Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeWindowStateSnapshot {
    contract_version: &'static str,
    pending_attempts: Vec<String>,
    admission_failure: Option<NativeAdmissionFailure>,
    recovery: Vec<NativeWindowResult>,
}
#[derive(Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeAdmissionFailure {
    attempt_id: String,
}
fn recovery_result(
    snapshot: crate::plugin_detached_window_migration::RecoverySnapshot,
) -> NativeWindowResult {
    NativeWindowResult {
        contract_version: VERSION,
        status: match snapshot.status {
            RecoveryStatus::RecoveryRequired => "recovery_required",
            RecoveryStatus::Recovering => "recovering",
            RecoveryStatus::Closing => "closing",
        },
        owner: None,
        attempt_id: Some(snapshot.ticket.attempt.opaque_id()),
        transfer_token: Some(snapshot.ticket.token.opaque_id()),
    }
}
#[tauri::command]
pub(crate) fn read_detached_window_state(
    webview: Webview,
    state: State<'_, Arc<NativeDetachedState>>,
    request: ReadWindowRequest,
) -> Result<NativeWindowStateSnapshot, NativeWindowError> {
    authorize(&state, &webview, &request.contract_version)?;
    let recovery = state
        .coordinator
        .recovery_snapshots()
        .into_iter()
        .map(recovery_result)
        .collect();
    let admission_failure = state
        .admission_failure
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
        .filter(|(attempt, owner)| {
            state
                .adapter
                .registry
                .snapshot_owned(*attempt, owner)
                .is_some_and(|snapshot| {
                    snapshot.session_state == PluginChildWebviewSessionState::SdkReady
                })
        })
        .map(|(attempt, _)| NativeAdmissionFailure {
            attempt_id: attempt.opaque_id(),
        });
    Ok(NativeWindowStateSnapshot {
        contract_version: VERSION,
        admission_failure,
        pending_attempts: state
            .inflight
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .keys()
            .map(|attempt| attempt.opaque_id())
            .collect(),
        recovery,
    })
}

#[derive(Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeQuitResult {
    contract_version: &'static str,
    accepted: bool,
}

#[tauri::command]
pub(crate) fn quit_plugin_windows(
    webview: Webview,
    state: State<'_, Arc<NativeDetachedState>>,
    request: ReadWindowRequest,
) -> Result<NativeQuitResult, NativeWindowError> {
    authorize(&state, &webview, &request.contract_version)?;
    #[cfg(target_os = "macos")]
    {
        crate::launcher_window::request_macos_application_quit(&state.adapter.app);
        Ok(NativeQuitResult {
            contract_version: VERSION,
            accepted: true,
        })
    }
    #[cfg(not(target_os = "macos"))]
    Err(unavailable())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_detached_window_host::HostWindowBounds;
    #[test]
    fn recovery_read_preserves_recovering_and_closing_without_exposing_diagnostics() {
        for (status, expected) in [
            (RecoveryStatus::RecoveryRequired, "recovery_required"),
            (RecoveryStatus::Recovering, "recovering"),
            (RecoveryStatus::Closing, "closing"),
        ] {
            let ticket = RecoveryTicket {
                attempt: PluginChildWebviewAttempt::from_opaque_id("attempt_0000000000000001")
                    .unwrap(),
                token: crate::plugin_child_webview_owner::PluginChildWebviewMigrationToken::new(1)
                    .unwrap(),
            };
            let result =
                recovery_result(crate::plugin_detached_window_migration::RecoverySnapshot {
                    ticket,
                    status,
                    failed_step: MigrationStep::MoveWebview,
                    recovery_step: MigrationStep::RestoreWebview,
                    repair_visible: true,
                });
            let wire = serde_json::to_value(result).unwrap();
            assert_eq!(wire["status"], expected);
            assert_eq!(wire["attempt_id"], "attempt_0000000000000001");
            assert!(wire["transfer_token"].as_str().is_some());
            assert!(wire.get("failed_step").is_none());
        }
    }
    #[test]
    fn current_display_fit_preserves_effective_size_and_hard_bounds() {
        assert_eq!(
            fitted_size([801.5, 601.5], [1440.0, 900.0]),
            Some([801.5, 601.5])
        );
        assert_eq!(
            fitted_size([2000.0, 1200.0], [1280.0, 800.0]),
            Some([1280.0, 800.0])
        );
        assert_eq!(fitted_size([800.0, 600.0], [200.0, 100.0]), None);
        assert_eq!(fitted_size([f64::NAN, 600.0], [1280.0, 800.0]), None);
    }
    #[test]
    fn move_success_requires_exact_retained_target_readback() {
        let target = "plugin-window-0000000000000001";
        let at_target = NativeOriginalOwnership::Window(target.into());
        assert_eq!(classify_native_move(true, &at_target, target), Ok(()));
        assert_eq!(
            classify_native_move(false, &at_target, target),
            Err(MigrationFailure::RetainedMoveRefusedAtTarget)
        );
        for completed in [true, false] {
            assert_eq!(
                classify_native_move(
                    completed,
                    &NativeOriginalOwnership::Window("main".into()),
                    target
                ),
                Err(MigrationFailure::RetainedMoveAtSource)
            );
            assert_eq!(
                classify_native_move(completed, &NativeOriginalOwnership::Unknown, target),
                Err(MigrationFailure::RetainedMoveOwnerUnknown)
            );
            assert_eq!(
                classify_native_move(
                    completed,
                    &NativeOriginalOwnership::Window("other".into()),
                    target
                ),
                Err(MigrationFailure::RetainedMoveOwnerUnknown)
            );
            assert_eq!(
                classify_native_move(completed, &NativeOriginalOwnership::Destroyed, target),
                Err(MigrationFailure::RetainedMoveOriginalDestroyed)
            );
        }
    }

    #[test]
    fn detached_slot_fills_native_content_and_main_restore_keeps_its_chrome() {
        let full = HostWindowGeometry {
            scale_factor: 2.0,
            physical_bounds: HostWindowBounds {
                x: 0.0,
                y: 0.0,
                width: 1600.0,
                height: 1200.0,
            },
        };
        let main = HostWindowGeometry {
            physical_bounds: HostWindowBounds {
                y: 80.0,
                height: 1120.0,
                ..full.physical_bounds
            },
            ..full
        };
        assert_eq!(
            detached_geometry(full, 2.0, 1600, 1200),
            Some(PluginChildWebviewBounds {
                x: 0,
                y: 0,
                width: 1600,
                height: 1200
            })
        );
        assert_eq!(
            main_geometry(main, 2.0, 1600, 1200),
            Some(PluginChildWebviewBounds {
                x: 0,
                y: 80,
                width: 1600,
                height: 1120
            })
        );
        assert!(main_geometry(full, 2.0, 1600, 1200).is_none());
        assert!(detached_geometry(main, 2.0, 1600, 1200).is_none());
        assert!(detached_geometry(full, 2.0, 1800, 1400).is_none());
        assert!(detached_geometry(full, 1.0, 1600, 1200).is_none());
    }
    #[test]
    fn recovery_wire_exposes_only_bounded_user_states_not_native_diagnostics() {
        let value =
            serde_json::to_value(NativeWindowResult::from(RecoveryActionResult::Rejected)).unwrap();
        assert_eq!(value["status"], "rejected");
        let encoded = value.to_string();
        for forbidden in [
            "native_handle",
            "source_label",
            "failed_step",
            "path",
            "exception",
        ] {
            assert!(!encoded.contains(forbidden));
        }
        let restored = RecoveryActionResult::RolledBack(
            crate::plugin_detached_window_migration::RestoredMigration {
                owner: PluginChildWebviewOwner::from_parts("main", 2).unwrap(),
                diagnostic: MigrationDiagnostic {
                    step: MigrationStep::PrepareHiddenTarget,
                    failure: MigrationFailure::AdoptSourceCheckpoint,
                    compensation_step: None,
                },
            },
        );
        assert_eq!(
            serde_json::to_value(NativeWindowResult::from(restored)).unwrap(),
            serde_json::json!({
                "contract_version": VERSION, "status": "restored",
                "owner": { "window_label": "main", "ownership_revision": "2" },
                "attempt_id": null, "transfer_token": null
            })
        );
    }
    #[test]
    fn trusted_shell_builder_is_hidden_registered_and_uses_one_existing_document() {
        let source = include_str!("plugin_detached_window_native.rs");
        let builder = source
            .split("fn create_hidden_shell(")
            .nth(1)
            .unwrap()
            .split("#[cfg(not(target_os")
            .next()
            .unwrap();
        assert!(builder.contains(".visible(false)"));
        assert!(builder.contains(".always_on_top(false)"));
        assert!(builder.contains(".focused(false)"));
        assert!(builder.contains("on_navigation_with_frame"));
        assert!(builder.contains(
            ".background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)"
        ));
        assert!(builder.find("context.update(").unwrap() < builder.find(".add_child(").unwrap());
        assert!(builder.contains("Arc::downgrade(&shell)"));
        let main = include_str!("frame_aware_navigation_setup.rs");
        let setup = main
            .split("pub(crate) fn setup_frame_aware_navigation_policy")
            .nth(1)
            .unwrap()
            .split("fn decide_tauri_navigation")
            .next()
            .unwrap();
        assert!(setup.contains(
            "background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)"
        ));
    }
    #[test]
    fn concrete_retained_mutations_use_stage_guards_and_home_cache_follows_native_effect() {
        let source = include_str!("plugin_detached_window_native.rs");
        let implementation = source.split("#[cfg(test)]\nmod tests").next().unwrap();
        for required in [
            "move_to_guarded(&target_window, retained_execution_guard(guard))",
            "restore_original_guarded(retained_execution_guard(guard))",
            "set_visible_guarded(false, retained_execution_guard(guard))",
        ] {
            assert!(implementation.contains(required));
        }
        let batch = implementation
            .split("InteractiveStep::MainHome => {")
            .nth(1)
            .unwrap()
            .split("InteractiveStep::TargetBoundsAndClip")
            .next()
            .unwrap();
        assert!(
            batch.find("configure_window(").unwrap() < batch.find("prepare_home_cache(").unwrap()
        );
        let publication = implementation
            .split("fn publish_ownership(")
            .nth(1)
            .unwrap()
            .split("fn cleanup_terminated_target(")
            .next()
            .unwrap();
        assert!(!publication.contains("prepare_home_cache("));
    }
}

/// Exit callbacks cannot wait for native WindowDestroyed events on their own UI
/// thread. Capture exact records, revoke their control sources, then clean them
/// from a worker while the runtime is still processing its exit boundary.
pub(crate) fn shutdown_plugin_detached_windows(app: &AppHandle) {
    let Some(state) = app
        .try_state::<Arc<NativeDetachedState>>()
        .map(|state| Arc::clone(state.inner()))
    else {
        return;
    };
    let shells = state
        .adapter
        .shells
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .values()
        .cloned()
        .collect::<Vec<_>>();
    for shell in &shells {
        shell.intent.fetch_add(1, Ordering::AcqRel);
    }
    tauri::async_runtime::spawn_blocking(move || {
        state.coordinator.reconcile_terminated();
        for shell in shells {
            let _ = state.close_empty_shell(&shell);
        }
    });
}

/// Resource lifecycle callbacks run after matching attempts were terminated.
/// Capture only exact old shell bindings; a replacement Page intent changes the
/// broker revision before native preparation and is never eligible for cleanup.
pub(crate) fn reconcile_plugin_detached_windows<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<Arc<NativeDetachedState>>() {
        let state = Arc::clone(state.inner());
        let retired = state.capture_terminated_shells();
        tauri::async_runtime::spawn_blocking(move || state.cleanup_terminated_shells(retired));
    }
}
