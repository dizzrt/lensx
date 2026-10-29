mod gesture;
mod macos;
pub mod model;
mod service;

use crate::launcher_window::{
    LauncherActivationReason, LauncherWindowAction, LauncherWindowActions, MAIN_WINDOW_LABEL,
};
use model::*;
use service::*;
use std::{
    collections::BTreeMap,
    str::FromStr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Instant,
};
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const CHANGED: &str = "launcher-shortcuts-changed";
const RECORDING: &str = "launcher-shortcut-recording";
const INVOCATION: &str = "launcher-shortcut-invocation";
const FAILED: &str = "launcher-shortcut-failed";

pub(crate) type State<R> = Arc<Mutex<DesktopService<R>>>;
pub(crate) struct DesktopService<R: Runtime> {
    inner: ShortcutService<FileStore, NativeRegistry<R>>,
    gesture: gesture::Gesture,
    monitor_epoch: u64,
    recording_epoch: u64,
    stopped: bool,
    sleeping: bool,
}

impl<R: Runtime> DesktopService<R> {
    fn synchronize_recording(&mut self, now: u64) {
        self.inner.expire(now);
        if self.recording_epoch != self.inner.recording_epoch() {
            self.recording_epoch = self.inner.recording_epoch();
            self.monitor_epoch += 1;
            self.gesture.reset(now);
        }
    }
}

struct NativeRegistry<R: Runtime> {
    app: AppHandle<R>,
    gates: BTreeMap<Trigger, (u64, Arc<AtomicBool>)>,
    key_labels: BTreeMap<String, String>,
}

fn native_shortcut(trigger: &Trigger) -> Result<Shortcut, ()> {
    let Trigger::Chord { modifiers, key } = trigger else {
        return Err(());
    };
    let mut native_modifiers = Modifiers::empty();
    for modifier in modifiers {
        native_modifiers |= match modifier.as_str() {
            "cmd" => Modifiers::SUPER,
            "ctrl" => Modifiers::CONTROL,
            "option" => Modifiers::ALT,
            "shift" => Modifiers::SHIFT,
            _ => return Err(()),
        };
    }
    let code = Code::from_str(key).map_err(|_| ())?;
    Ok(Shortcut::new(Some(native_modifiers), code))
}

impl<R: Runtime> Registry for NativeRegistry<R> {
    fn register(&mut self, trigger: &Trigger, generation: u64) -> Result<(), RegistrationFailure> {
        if !macos::layout_allows(trigger) {
            return Err(RegistrationFailure::Rejected);
        }
        let shortcut = native_shortcut(trigger).map_err(|_| RegistrationFailure::Rejected)?;
        let gate = Arc::new(AtomicBool::new(false));
        let callback_gate = Arc::clone(&gate);
        let callback_trigger = trigger.clone();
        self.app
            .global_shortcut()
            .on_shortcut(shortcut, move |app, _, event| {
                // Check before acquiring the service lock: events during staging must not
                // wait until publication and then execute under the new mapping.
                if !callback_gate.load(Ordering::Acquire)
                    || !macos::layout_allows(&callback_trigger)
                {
                    return;
                }
                let Some(state) = app.try_state::<State<R>>() else {
                    return;
                };
                let effect = {
                    let Ok(mut service) = state.lock() else {
                        return;
                    };
                    let now = macos::monotonic_millis();
                    let effect = service.inner.press(
                        &callback_trigger,
                        generation,
                        event.state() == ShortcutState::Pressed,
                        now,
                    );
                    service.gesture.input(gesture::Input::Interrupt, now);
                    effect
                };
                deliver(app, effect);
                publish_failures(app);
            })
            .map_err(|error| match error {
                tauri_plugin_global_shortcut::Error::GlobalHotkey(_) => {
                    RegistrationFailure::Rejected
                }
                _ => RegistrationFailure::Uncertain,
            })?;
        self.gates.insert(trigger.clone(), (generation, gate));
        Ok(())
    }
    fn unregister(&mut self, trigger: &Trigger) -> Result<(), ()> {
        if let Some((_, gate)) = self.gates.remove(trigger) {
            gate.store(false, Ordering::Release);
        }
        self.app
            .global_shortcut()
            .unregister(native_shortcut(trigger)?)
            .map_err(|_| ())
    }
    fn publish(&mut self, registrations: &BTreeMap<Trigger, u64>) {
        for (trigger, (generation, gate)) in &self.gates {
            gate.store(
                registrations.get(trigger) == Some(generation),
                Ordering::Release,
            );
        }
    }
    fn valid_in_layout(&self, trigger: &Trigger) -> bool {
        macos::layout_allows(trigger)
    }
    fn refresh_layout(&mut self) {
        self.key_labels = macos::key_labels();
    }
    fn key_labels(&self) -> BTreeMap<String, String> {
        self.key_labels.clone()
    }
}

#[derive(Clone, serde::Serialize)]
struct RecordingEvent {
    lease_id: String,
    trigger: Option<Trigger>,
    cancelled: bool,
}

fn emit<R: Runtime, T: serde::Serialize + Clone>(app: &AppHandle<R>, name: &str, payload: T) {
    if let Some(webview) = app.get_webview(MAIN_WINDOW_LABEL) {
        let _ = webview.emit(name, payload);
    }
}

fn publish_failures<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<State<R>>() else {
        return;
    };
    let failures = state
        .lock()
        .map(|mut service| {
            if service.inner.host_ready {
                service.inner.take_failures()
            } else {
                Vec::new()
            }
        })
        .unwrap_or_default();
    for failure in failures {
        emit(app, FAILED, failure);
    }
}

fn deliver<R: Runtime>(app: &AppHandle<R>, effect: Effect) {
    match effect {
        Effect::None => {}
        Effect::Candidate { lease_id, trigger } => emit(
            app,
            RECORDING,
            RecordingEvent {
                lease_id,
                trigger: Some(trigger),
                cancelled: false,
            },
        ),
        Effect::Toggle | Effect::Action(_) => {
            let app = app.clone();
            let dispatch_app = app.clone();
            let _ = app.run_on_main_thread(move || {
                let action = if matches!(effect, Effect::Toggle) {
                    LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut)
                } else {
                    LauncherWindowAction::Show(LauncherActivationReason::GlobalShortcut)
                };
                let success = dispatch_app
                    .try_state::<LauncherWindowActions>()
                    .is_some_and(|actions| actions.dispatch(&dispatch_app, action).is_ok());
                if let Effect::Action(invocation) = effect {
                    let Some(state) = dispatch_app.try_state::<State<R>>() else {
                        return;
                    };
                    let mut service = match state.lock() {
                        Ok(service) => service,
                        Err(_) => return,
                    };
                    if success && service.inner.host_ready {
                        drop(service);
                        emit(&dispatch_app, INVOCATION, invocation);
                    } else if !success {
                        service.inner.delivery_failed(invocation.invocation_id);
                        drop(service);
                        publish_failures(&dispatch_app);
                    }
                }
            });
        }
    }
}

fn authorize<R: Runtime>(webview: &Webview<R>) -> Result<(), ShortcutError> {
    if webview.label() == MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err(ShortcutError::new("unavailable"))
    }
}

fn state<R: Runtime>(app: &AppHandle<R>) -> Result<State<R>, ShortcutError> {
    app.try_state::<State<R>>()
        .map(|state| Arc::clone(state.inner()))
        .ok_or_else(|| ShortcutError::new("unavailable"))
}

pub(crate) fn setup<R: Runtime>(app: &AppHandle<R>) -> Result<(), ShortcutError> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| ShortcutError::new("storage_unavailable"))?;
    let registry = NativeRegistry {
        app: app.clone(),
        gates: BTreeMap::new(),
        key_labels: macos::key_labels(),
    };
    let service = Arc::new(Mutex::new(DesktopService {
        inner: ShortcutService::start(FileStore::new(directory.join("shortcuts.json")), registry),
        gesture: gesture::Gesture::default(),
        monitor_epoch: 0,
        recording_epoch: 0,
        stopped: false,
        sleeping: false,
    }));
    app.manage(Arc::clone(&service));
    ensure_recovery_visible(app);
    macos::start(app.clone(), service);
    Ok(())
}

pub(crate) fn recovery_degraded<R: Runtime>(app: &AppHandle<R>) -> bool {
    state(app)
        .ok()
        .and_then(|state| {
            state
                .lock()
                .ok()
                .map(|service| service.inner.snapshot().recovery_degraded)
        })
        .unwrap_or(true)
}

pub(crate) fn revoke_recording<R: Runtime>(app: &AppHandle<R>) {
    let Ok(state) = state(app) else {
        return;
    };
    let lease = if let Ok(mut service) = state.lock() {
        let now = macos::monotonic_millis();
        service.gesture.reset(now);
        service.monitor_epoch += 1;
        service.inner.end_recording()
    } else {
        None
    };
    if let Some(lease) = lease {
        emit(
            app,
            RECORDING,
            RecordingEvent {
                lease_id: lease.lease_id,
                trigger: None,
                cancelled: true,
            },
        );
    }
}

pub(crate) fn stop<R: Runtime>(app: &AppHandle<R>) {
    revoke_recording(app);
    if let Ok(state) = state(app) {
        if let Ok(mut service) = state.lock() {
            service.stopped = true;
        }
    }
}

pub(crate) fn invalidate_host<R: Runtime>(app: &AppHandle<R>) {
    revoke_recording(app);
    if let Ok(state) = state(app) {
        if let Ok(mut service) = state.lock() {
            let now = macos::monotonic_millis();
            service.inner.ready(false, now);
        }
    }
}

#[tauri::command]
pub fn read_launcher_shortcuts(
    webview: Webview,
    app: AppHandle,
) -> Result<Snapshot, ShortcutError> {
    authorize(&webview)?;
    state(&app)?
        .lock()
        .map(|service| service.inner.snapshot())
        .map_err(|_| ShortcutError::new("unavailable"))
}

#[tauri::command]
pub fn write_launcher_shortcuts(
    webview: Webview,
    app: AppHandle,
    expected_revision: u64,
    configuration: Configuration,
    resolve_launcher_migration: Option<bool>,
) -> Result<Snapshot, ShortcutError> {
    authorize(&webview)?;
    let state = state(&app)?;
    let result = {
        let mut service = state
            .lock()
            .map_err(|_| ShortcutError::new("unavailable"))?;
        let now = macos::monotonic_millis();
        service.gesture.reset(now);
        service.monitor_epoch += 1;
        service.inner.save_resolving_migration(
            expected_revision,
            configuration,
            resolve_launcher_migration.unwrap_or(false),
        )
    };
    if let Ok(service) = state.lock() {
        emit(&app, CHANGED, service.inner.snapshot());
    }
    publish_failures(&app);
    ensure_recovery_visible(&app);
    result
}

fn ensure_recovery_visible<R: Runtime>(app: &AppHandle<R>) {
    if recovery_degraded(app) {
        if let Some(actions) = app.try_state::<LauncherWindowActions>() {
            let _ = actions.dispatch(
                app,
                LauncherWindowAction::Show(LauncherActivationReason::Programmatic),
            );
        }
    }
}

fn publish_monitor_snapshot<R: Runtime>(app: &AppHandle<R>, snapshot: Snapshot) {
    let needs_recovery = snapshot.recovery_degraded;
    emit(app, CHANGED, snapshot);
    if needs_recovery {
        let recovery_app = app.clone();
        let _ = app.run_on_main_thread(move || ensure_recovery_visible(&recovery_app));
    }
}

#[tauri::command]
pub fn update_launcher_shortcut_targets(
    webview: Webview,
    app: AppHandle,
    action_ids: Vec<String>,
) -> Result<Snapshot, ShortcutError> {
    authorize(&webview)?;
    let state = state(&app)?;
    let snapshot = state
        .lock()
        .map_err(|_| ShortcutError::new("unavailable"))?
        .inner
        .update_targets(action_ids.into_iter().collect())?;
    emit(&app, CHANGED, snapshot.clone());
    publish_failures(&app);
    ensure_recovery_visible(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn set_launcher_shortcut_host_ready(
    webview: Webview,
    app: AppHandle,
    ready: bool,
) -> Result<Vec<Invocation>, ShortcutError> {
    authorize(&webview)?;
    let state = state(&app)?;
    let pending = {
        let mut service = state
            .lock()
            .map_err(|_| ShortcutError::new("unavailable"))?;
        let now = macos::monotonic_millis();
        service.inner.ready(ready, now)
    };
    publish_failures(&app);
    Ok(pending)
}

#[tauri::command]
pub fn ack_launcher_shortcut_invocation(
    webview: Webview,
    app: AppHandle,
    invocation_id: u64,
    outcome: String,
) -> Result<bool, ShortcutError> {
    authorize(&webview)?;
    if !matches!(outcome.as_str(), "accepted" | "failed") {
        return Err(ShortcutError::new("invalid_configuration"));
    }
    let state = state(&app)?;
    let mut service = state
        .lock()
        .map_err(|_| ShortcutError::new("unavailable"))?;
    let now = macos::monotonic_millis();
    Ok(service
        .inner
        .acknowledge(invocation_id, outcome == "accepted", now))
}

fn foreground<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_window(MAIN_WINDOW_LABEL).is_some_and(|window| {
        window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
    })
}

#[tauri::command]
pub fn begin_launcher_shortcut_recording(
    webview: Webview,
    app: AppHandle,
) -> Result<RecordingLease, ShortcutError> {
    authorize(&webview)?;
    if !foreground(&app) {
        return Err(ShortcutError::new("recording_unavailable"));
    }
    let state = state(&app)?;
    let mut service = state
        .lock()
        .map_err(|_| ShortcutError::new("unavailable"))?;
    let now = macos::monotonic_millis();
    service.gesture.reset(now);
    service.monitor_epoch += 1;
    Ok(service.inner.begin_recording(now))
}

#[tauri::command]
pub fn renew_launcher_shortcut_recording(
    webview: Webview,
    app: AppHandle,
    lease_id: String,
) -> Result<RecordingLease, ShortcutError> {
    authorize(&webview)?;
    if !foreground(&app) {
        revoke_recording(&app);
        return Err(ShortcutError::new("recording_unavailable"));
    }
    let state = state(&app)?;
    let mut service = state
        .lock()
        .map_err(|_| ShortcutError::new("unavailable"))?;
    let now = macos::monotonic_millis();
    service.inner.renew_recording(&lease_id, now)
}

#[tauri::command]
pub fn end_launcher_shortcut_recording(
    webview: Webview,
    app: AppHandle,
    lease_id: String,
) -> Result<(), ShortcutError> {
    authorize(&webview)?;
    let state = state(&app)?;
    let matches = state
        .lock()
        .map_err(|_| ShortcutError::new("unavailable"))?
        .inner
        .recording()
        .is_some_and(|lease| lease.lease_id == lease_id);
    if matches {
        revoke_recording(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn request_launcher_shortcut_monitor_permission(
    webview: Webview,
    app: AppHandle,
) -> Result<Snapshot, ShortcutError> {
    authorize(&webview)?;
    if !foreground(&app) {
        return Err(ShortcutError::new("unavailable"));
    }
    macos::request_permission();
    read_launcher_shortcuts(webview, app)
}
