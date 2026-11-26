use super::*;
use std::{path::PathBuf, sync::atomic::AtomicU64};

pub(super) struct ConfigurationDirectory(PathBuf);

impl Drop for ConfigurationDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(super) fn monitored_service<R: Runtime>(
    app: &AppHandle<R>,
) -> (State<R>, ConfigurationDirectory) {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let directory = ConfigurationDirectory(std::env::temp_dir().join(format!(
        "lensx-monitor-exit-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )));
    std::fs::create_dir_all(&directory.0).unwrap();
    let path = directory.0.join("shortcuts.json");
    let configuration = Configuration {
        launcher: Trigger::ModifierDoubleTap {
            modifier: "cmd".into(),
        },
        ..Configuration::default()
    };
    std::fs::write(&path, serde_json::to_vec(&configuration).unwrap()).unwrap();
    // A double tap has no OS registration. Do not install a native shortcut
    // plugin, create a Window or start the observation worker in these tests.
    let registry = NativeRegistry {
        app: app.clone(),
        gates: BTreeMap::new(),
        layout: macos::KeyboardLayout::default(),
    };
    let mut inner = ShortcutService::start(FileStore::new(path), registry);
    inner.set_monitor(MonitorStatus::Active);
    assert!(!inner.snapshot().recovery_degraded);
    assert!(app.manage(inner.admission()));
    let workspace = macos::WorkspaceSession::default();
    app.manage(workspace.clone());
    app.manage(Mutex::new(repair::RepairQueue::default()));
    let state = Arc::new(Mutex::new(DesktopService {
        workspace,
        workspace_epoch: 0,
        inner,
        gesture: gesture::Gesture::default(),
        monitor_epoch: 0,
        recording_epoch: 0,
        stopped: false,
        sleeping: false,
    }));
    assert!(app.manage(Arc::clone(&state)));
    (state, directory)
}

fn pending_double_tap(gesture: &mut gesture::Gesture) {
    for (at, down) in [(0, true), (100, false), (200, true), (300, false)] {
        let input = if down {
            gesture::Input::ModifierDown {
                physical: 55,
                modifier: "cmd",
                repeat: false,
            }
        } else {
            gesture::Input::ModifierUp { physical: 55 }
        };
        assert_eq!(gesture.input(input, at), None);
    }
    assert_eq!(gesture.clone().tick(601), Some("cmd"));
}

#[test]
fn observation_exit_revokes_admission_recording_and_pending_gesture() {
    let app = tauri::test::mock_app();
    let (state, _directory) = monitored_service(app.handle());
    {
        let mut service = state.lock().unwrap();
        service.inner.begin_recording(macos::monotonic_millis());
        pending_double_tap(&mut service.gesture);
    }
    assert!(recording_active(app.handle()));
    assert!(recovery_available_now(app.handle()));

    finish_observation(app.handle(), &state);

    assert!(!recording_active(app.handle()));
    assert!(recovery_degraded(app.handle()));
    let mut service = state.lock().unwrap();
    assert!(service.inner.recording().is_none());
    let snapshot = service.inner.snapshot();
    assert!(snapshot.recovery_degraded);
    assert_eq!(
        snapshot
            .bindings
            .iter()
            .find(|binding| binding.target == LAUNCHER)
            .unwrap()
            .status,
        BindingStatus::MonitorUnavailable
    );
    assert_eq!(
        service
            .gesture
            .tick(macos::monotonic_millis().saturating_add(60_000)),
        None
    );
}

#[test]
fn poisoned_observation_exit_revokes_independent_admission_and_fails_closed() {
    let app = tauri::test::mock_app();
    let (state, _directory) = monitored_service(app.handle());
    assert!(recovery_available_now(app.handle()));
    let admission = admission_now(app.handle()).unwrap();
    let interrupted = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _held = state.lock().unwrap();
        panic!("controlled observation-service poison");
    }));
    assert!(interrupted.is_err());
    assert!(state.is_poisoned());

    finish_observation(app.handle(), &state);

    assert!(!admission.recovery_available());
    assert!(admission_now(app.handle()).is_none());
    assert!(recovery_degraded(app.handle()));
    assert!(recording_active(app.handle()));
    assert!(local_shortcut_facts(app.handle()).is_none());
    // A second finish must also tolerate the same poisoned state.
    finish_observation(app.handle(), &state);
    assert!(!admission.recovery_available());
}

#[test]
fn stopped_observation_exit_cannot_restore_confirmed_recovery() {
    let app = tauri::test::mock_app();
    let (state, _directory) = monitored_service(app.handle());
    let admission = admission_now(app.handle()).unwrap();
    {
        let mut service = state.lock().unwrap();
        service.stopped = true;
        admission.stop();
    }
    finish_observation(app.handle(), &state);
    assert!(state.lock().unwrap().stopped);
    assert!(recovery_degraded(app.handle()));
    admission.set_monitor(true);
    assert!(!admission.recovery_available());
}
