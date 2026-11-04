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
pub(crate) fn local_trigger(key: u16, flags: u64) -> Option<Trigger> {
    macos::local_trigger(key, flags)
}
pub(crate) fn local_key_down(key: u16) -> bool {
    macos::local_key_down(key)
}
pub(crate) struct DesktopService<R: Runtime> {
    inner: ShortcutService<FileStore, NativeRegistry<R>>,
    gesture: gesture::Gesture,
    monitor_epoch: u64,
    recording_epoch: u64,
    stopped: bool,
    sleeping: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct LocalShortcutFacts {
    pub configuration_revision: u64,
    pub detach: Option<Trigger>,
    pub recording_epoch: u64,
    pub recording: Option<RecordingLease>,
    pub suppressed_until_release: bool,
    pub stopped: bool,
    pub host_ready: bool,
    pub recovery_available: bool,
    pub local_available: bool,
}

pub(crate) fn local_shortcut_facts<R: Runtime>(app: &AppHandle<R>) -> Option<LocalShortcutFacts> {
    let state = app.try_state::<State<R>>()?;
    let mut service = state.try_lock().ok()?;
    service.synchronize_recording(macos::monotonic_millis());
    Some(LocalShortcutFacts {
        configuration_revision: service.inner.configuration_revision(),
        detach: service.inner.detach(),
        recording_epoch: service.inner.recording_epoch(),
        recording: service.inner.recording().cloned(),
        suppressed_until_release: service.inner.suppressed_until_release(),
        stopped: service.stopped || service.sleeping,
        host_ready: service.inner.host_ready,
        recovery_available: service.inner.recovery_available(),
        local_available: service.inner.local_available(),
    })
}

pub(crate) fn set_local_shortcut_available<R: Runtime>(app: &AppHandle<R>, available: bool) {
    let Some(installation) = app.try_state::<LocalMonitorAvailability>() else {
        return;
    };
    if !installation.set(available) {
        return;
    }
    // Persist the fact before any lock attempt. Publishing may wait off the
    // native thread; snapshots and admission already observe the new value.
    let Ok(state) = state(app) else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        let snapshot = state.lock().ok().map(|service| service.inner.snapshot());
        if let Some(snapshot) = snapshot {
            emit(&app, CHANGED, snapshot);
        }
    });
}

pub(crate) fn local_recording_input<R: Runtime>(
    app: &AppHandle<R>,
    key: u16,
    trigger: Option<Trigger>,
    down: bool,
    repeat: bool,
    expected_epoch: u64,
) -> Option<bool> {
    let (captured, effect) = {
        let state = app.try_state::<State<R>>()?;
        let mut service = state.try_lock().ok()?;
        if service.stopped || service.sleeping {
            return None;
        }
        let now = macos::monotonic_millis();
        service.synchronize_recording(now);
        service.inner.local_recording_press(
            key,
            trigger.as_ref(),
            down,
            repeat,
            expected_epoch,
            now,
        )
    };
    deliver(app, effect);
    Some(captured)
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
    layout: macos::KeyboardLayout,
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
        // A layout switch during a save must not register a newly reserved chord.
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
                // Reject staged registrations at receipt, and recheck their identity at delivery.
                if !callback_gate.load(Ordering::Acquire) {
                    return;
                }
                let gate = Arc::clone(&callback_gate);
                let trigger = callback_trigger.clone();
                let pressed = event.state() == ShortcutState::Pressed;
                let event_app = app.clone();
                let _ = app.run_on_main_thread(move || {
                    // A key-up must still clear held state if the layout changed since key-down.
                    if !gate.load(Ordering::Acquire) || (pressed && !macos::layout_allows(&trigger))
                    {
                        return;
                    }
                    let Some(state) = event_app.try_state::<State<R>>() else {
                        return;
                    };
                    let effect = {
                        let Ok(mut service) = state.lock() else {
                            return;
                        };
                        if service.stopped || service.sleeping {
                            return;
                        }
                        let now = macos::monotonic_millis();
                        let effect = service.inner.press(&trigger, generation, pressed, now);
                        service.gesture.input(gesture::Input::Interrupt, now);
                        effect
                    };
                    deliver(&event_app, effect);
                    publish_failures(&event_app);
                });
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
        self.layout.allows(trigger)
    }
    fn key_labels(&self) -> BTreeMap<String, String> {
        self.layout.labels.clone()
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
                if dispatch_app.try_state::<State<R>>().is_none_or(|state| {
                    state
                        .try_lock()
                        .map_or(true, |service| service.stopped || service.sleeping)
                }) {
                    return;
                }
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
        layout: macos::current_layout().ok_or_else(|| ShortcutError::new("unavailable"))?,
    };
    let inner = ShortcutService::start(FileStore::new(directory.join("shortcuts.json")), registry);
    app.manage(inner.local_availability());
    app.manage(inner.admission());
    let service = Arc::new(Mutex::new(DesktopService {
        inner,
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
    !recovery_available_now(app)
}

pub(crate) fn recovery_available_now<R: Runtime>(app: &AppHandle<R>) -> bool {
    admission_now(app).is_some_and(|facts| facts.recovery_available())
}

pub(crate) fn recording_active<R: Runtime>(app: &AppHandle<R>) -> bool {
    admission_now(app).is_none_or(|facts| facts.recording_active(macos::monotonic_millis()))
}

fn admission_now<R: Runtime>(app: &AppHandle<R>) -> Option<ShortcutAdmission> {
    let state = app.try_state::<State<R>>()?;
    if state.is_poisoned() {
        return None;
    }
    app.try_state::<ShortcutAdmission>()
        .map(|facts| facts.inner().clone())
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
    if let Some(facts) = app.try_state::<ShortcutAdmission>() {
        facts.stop();
    }
    set_local_shortcut_available(app, false);
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

// Capture the OS layout and perform registry changes on main. A worker never
// waits for main while holding the shortcut-service lock.
async fn with_current_layout(
    app: AppHandle,
    change: impl FnOnce(&mut DesktopService<tauri::Wry>) -> Result<Snapshot, ShortcutError>
        + Send
        + 'static,
) -> Result<Snapshot, ShortcutError> {
    let state = state(&app)?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let main_app = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            let layout =
                macos::current_layout().ok_or_else(|| ShortcutError::new("unavailable"))?;
            let mut service = state
                .lock()
                .map_err(|_| ShortcutError::new("unavailable"))?;
            if service.inner.registry.layout != layout {
                service.inner.registry.layout = layout;
                service.inner.refresh_layout();
            }
            let result = change(&mut service);
            let snapshot = service.inner.snapshot();
            drop(service);
            emit(&main_app, CHANGED, snapshot);
            publish_failures(&main_app);
            ensure_recovery_visible(&main_app);
            result
        })();
        let _ = sender.send(result);
    })
    .map_err(|_| ShortcutError::new("unavailable"))?;
    receiver
        .await
        .map_err(|_| ShortcutError::new("unavailable"))?
}

#[tauri::command]
pub async fn write_launcher_shortcuts(
    webview: Webview,
    app: AppHandle,
    expected_revision: u64,
    configuration: Configuration,
    resolve_launcher_migration: Option<bool>,
    resolve_detach_migration: Option<bool>,
) -> Result<Snapshot, ShortcutError> {
    authorize(&webview)?;
    with_current_layout(app, move |service| {
        let now = macos::monotonic_millis();
        service.gesture.reset(now);
        service.monitor_epoch += 1;
        service.inner.save_resolving_migrations(
            expected_revision,
            configuration,
            resolve_launcher_migration.unwrap_or(false),
            resolve_detach_migration.unwrap_or(false),
        )
    })
    .await
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
pub async fn update_launcher_shortcut_targets(
    webview: Webview,
    app: AppHandle,
    action_ids: Vec<String>,
) -> Result<Snapshot, ShortcutError> {
    authorize(&webview)?;
    with_current_layout(app, move |service| {
        service
            .inner
            .update_targets(action_ids.into_iter().collect())
    })
    .await
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
