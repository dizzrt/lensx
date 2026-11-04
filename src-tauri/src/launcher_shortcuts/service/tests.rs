use super::*;
use std::{cell::RefCell, collections::VecDeque, rc::Rc};

#[derive(Clone)]
struct FakeStore(Rc<RefCell<Disk>>);
struct Disk {
    stored: Stored,
    staged: Option<Stored>,
    fail_stage: bool,
    commit: &'static str,
}
impl FakeStore {
    fn new(stored: Stored) -> Self {
        Self(Rc::new(RefCell::new(Disk {
            stored,
            staged: None,
            fail_stage: false,
            commit: "ok",
        })))
    }
}
impl Store for FakeStore {
    fn read(&self) -> Stored {
        self.0.borrow().stored.clone()
    }
    fn stage(
        &mut self,
        configuration: &Configuration,
        detach_migration: Option<&DetachMigration>,
    ) -> Result<(), ()> {
        let mut disk = self.0.borrow_mut();
        if disk.fail_stage {
            return Err(());
        }
        disk.staged = Some(Stored::current(
            configuration.clone(),
            detach_migration.cloned(),
        ));
        Ok(())
    }
    fn commit(&mut self) -> Result<(), ()> {
        let mut disk = self.0.borrow_mut();
        match disk.commit {
            "before" => Err(()),
            "unknown" => {
                disk.stored = Stored::Unavailable;
                Err(())
            }
            mode => {
                disk.stored = disk.staged.take().unwrap();
                if mode == "after" {
                    Err(())
                } else {
                    Ok(())
                }
            }
        }
    }
    fn discard(&mut self) {
        self.0.borrow_mut().staged = None;
    }
}

#[derive(Clone, Default)]
struct FakeRegistry(Rc<RefCell<Native>>);
#[derive(Default)]
struct Native {
    keys: BTreeMap<Trigger, u64>,
    calls: Vec<String>,
    failures: VecDeque<&'static str>,
    blocked: BTreeSet<Trigger>,
    admission_probe: Option<ShortcutAdmission>,
    recovery_during_publication: Vec<bool>,
}
impl Registry for FakeRegistry {
    fn register(&mut self, trigger: &Trigger, generation: u64) -> Result<(), RegistrationFailure> {
        let mut native = self.0.borrow_mut();
        native.calls.push("register".into());
        if native.failures.front() == Some(&"register") {
            native.failures.pop_front();
            return Err(RegistrationFailure::Rejected);
        }
        if native.failures.front() == Some(&"register_after") {
            native.failures.pop_front();
            native.keys.insert(trigger.clone(), generation);
            return Err(RegistrationFailure::Uncertain);
        }
        if native.keys.contains_key(trigger) {
            return Err(RegistrationFailure::Rejected);
        }
        native.keys.insert(trigger.clone(), generation);
        Ok(())
    }
    fn unregister(&mut self, trigger: &Trigger) -> Result<(), ()> {
        let mut native = self.0.borrow_mut();
        native.calls.push("unregister".into());
        if native.failures.front() == Some(&"unregister") {
            native.failures.pop_front();
            return Err(());
        }
        if native.failures.front() == Some(&"unregister_after") {
            native.failures.pop_front();
            native.keys.remove(trigger);
            return Err(());
        }
        native.keys.remove(trigger);
        Ok(())
    }
    fn publish(&mut self, registrations: &BTreeMap<Trigger, u64>) {
        let mut native = self.0.borrow_mut();
        if let Some(probe) = &native.admission_probe {
            let available = probe.recovery_available();
            native.recovery_during_publication.push(available);
        }
        native
            .calls
            .push(format!("publish:{}", registrations.len()));
    }
    fn valid_in_layout(&self, trigger: &Trigger) -> bool {
        !self.0.borrow().blocked.contains(trigger)
    }
}
fn chord(key: &str) -> Trigger {
    Trigger::Chord {
        modifiers: vec!["ctrl".into(), "shift".into()],
        key: key.into(),
    }
}
fn fixture() -> (
    ShortcutService<FakeStore, FakeRegistry>,
    FakeStore,
    FakeRegistry,
) {
    let disk = FakeStore::new(Stored::Missing);
    let native = FakeRegistry::default();
    (
        ShortcutService::start(disk.clone(), native.clone()),
        disk,
        native,
    )
}
fn changed(service: &ShortcutService<FakeStore, FakeRegistry>) -> Configuration {
    let mut configuration = service.configuration.clone();
    configuration.launcher = chord("KeyK");
    configuration
}
fn available(service: &mut ShortcutService<FakeStore, FakeRegistry>) {
    service
        .update_targets(["com.test.open".into()].into())
        .unwrap();
}
fn action_configuration(service: &ShortcutService<FakeStore, FakeRegistry>) -> Configuration {
    let mut configuration = service.configuration.clone();
    configuration
        .actions
        .insert("com.test.open".into(), chord("KeyK"));
    configuration
}

#[test]
fn startup_defaults_invalid_snapshots_and_valid_custom_failure_keep_distinct_recovery() {
    for stored in [Stored::Missing, Stored::Invalid, Stored::Unavailable] {
        let disk = FakeStore::new(stored.clone());
        let native = FakeRegistry::default();
        let service = ShortcutService::start(disk.clone(), native);
        assert_eq!(service.configuration, Configuration::default());
        assert!(!service.snapshot().recovery_degraded);
        assert_eq!(disk.read(), stored);
    }
    let mut configuration = Configuration::default();
    configuration.launcher = chord("KeyK");
    configuration
        .actions
        .insert("com.test.open".into(), Configuration::default().launcher);
    let disk = FakeStore::new(Stored::Configuration(configuration.clone()));
    let native = FakeRegistry::default();
    native.0.borrow_mut().failures.push_back("register");
    let mut service = ShortcutService::start(disk, native.clone());
    assert!(service.snapshot().recovery_degraded);
    assert_eq!(service.configuration, configuration);
    // A default chord owned by an Action never becomes an implicit recovery fallback.
    assert!(native.0.borrow().keys.is_empty());
    available(&mut service);
    assert_eq!(
        service
            .registrations
            .get(&Configuration::default().launcher)
            .unwrap()
            .target,
        "com.test.open"
    );
}

#[test]
fn save_is_staged_pre_registered_removed_committed_and_published_and_noop_is_quiet() {
    let (mut service, disk, native) = fixture();
    let next = changed(&service);
    native.0.borrow_mut().calls.clear();
    let snapshot = service.save(0, next).unwrap();
    assert_eq!(snapshot.configuration.revision, 1);
    assert!(!snapshot.recovery_degraded);
    assert_eq!(
        disk.read(),
        Stored::Configuration(snapshot.configuration.clone())
    );
    assert_eq!(
        native.0.borrow().calls,
        vec!["publish:0", "register", "unregister", "publish:1"]
    );
    native.0.borrow_mut().calls.clear();
    service.save(1, snapshot.configuration.clone()).unwrap();
    assert!(native.0.borrow().calls.is_empty());
    assert_eq!(
        service.save(0, snapshot.configuration).unwrap_err().code,
        "revision_conflict"
    );
}

#[test]
fn failure_at_each_transaction_step_restores_confirmed_old_snapshot() {
    for failure in [
        "register",
        "register_after",
        "unregister",
        "unregister_after",
        "stage",
        "commit",
    ] {
        let (mut service, disk, native) = fixture();
        let old = service.snapshot();
        let next = changed(&service);
        match failure {
            "stage" => disk.0.borrow_mut().fail_stage = true,
            "commit" => disk.0.borrow_mut().commit = "before",
            other => native.0.borrow_mut().failures.push_back(other),
        }
        let error = service.save(0, next).unwrap_err();
        assert_eq!(
            error.snapshot.as_ref().unwrap().configuration,
            old.configuration,
            "{failure}"
        );
        assert!(!service.snapshot().recovery_degraded, "{failure}");
        assert_eq!(native.0.borrow().keys.len(), 1, "{failure}");
        assert!(disk.0.borrow().staged.is_none());
    }
}

#[test]
fn uncertain_commits_read_actual_disk_and_never_blindly_overwrite() {
    let (mut service, disk, _) = fixture();
    disk.0.borrow_mut().commit = "after";
    let next = changed(&service);
    let error = service.save(0, next).unwrap_err();
    assert_eq!(error.code, "storage_failed");
    assert_eq!(service.configuration.revision, 1);
    assert_eq!(
        disk.read(),
        Stored::Configuration(service.configuration.clone())
    );
    assert!(!service.snapshot().recovery_degraded);
    let (mut service, disk, native) = fixture();
    disk.0.borrow_mut().commit = "unknown";
    let next = changed(&service);
    assert_eq!(service.save(0, next).unwrap_err().code, "degraded");
    assert!(service.snapshot().recovery_degraded);
    assert!(native.0.borrow().keys.is_empty());
    assert_eq!(disk.read(), Stored::Unavailable);
}

#[test]
fn compensation_failure_reports_residual_ownership_and_disables_hiding_if_recovery_unproven() {
    let (mut service, disk, native) = fixture();
    disk.0.borrow_mut().commit = "before";
    let next = changed(&service);
    native
        .0
        .borrow_mut()
        .failures
        .extend(["unregister", "unregister", "register"]);
    let error = service.save(0, next).unwrap_err();
    assert_eq!(error.code, "degraded");
    assert!(service.snapshot().recovery_degraded);
    assert!(!service.residual.is_empty());
    assert!(service
        .snapshot()
        .diagnostics
        .contains(&"compensation_failed"));
}

#[test]
fn target_unavailability_retains_configuration_and_reactivation_uses_fresh_registration() {
    let (mut service, _, native) = fixture();
    available(&mut service);
    let next = action_configuration(&service);
    service.save(0, next).unwrap();
    let generation = service
        .registrations
        .get(&chord("KeyK"))
        .unwrap()
        .generation;
    service.update_targets(BTreeSet::new()).unwrap();
    assert!(service.configuration.actions.contains_key("com.test.open"));
    assert!(!native.0.borrow().keys.contains_key(&chord("KeyK")));
    assert_eq!(
        service.press(&chord("KeyK"), generation, true, 1),
        Effect::None
    );
    native.0.borrow_mut().failures.push_back("register");
    available(&mut service);
    assert_ne!(
        service
            .snapshot()
            .bindings
            .iter()
            .find(|entry| entry.target == "com.test.open")
            .unwrap()
            .status,
        BindingStatus::Active
    );
    available(&mut service);
    let fresh = service
        .registrations
        .get(&chord("KeyK"))
        .unwrap()
        .generation;
    assert_ne!(fresh, generation);
    assert_eq!(
        service.press(&chord("KeyK"), generation, true, 2),
        Effect::None
    );
    assert!(matches!(
        service.press(&chord("KeyK"), fresh, true, 3),
        Effect::Action(_)
    ));
}

#[test]
fn press_release_is_single_shot_and_action_routes_show_separately_from_toggle() {
    let (mut service, _, _) = fixture();
    let trigger = service.configuration.launcher.clone();
    let generation = service.registrations[&trigger].generation;
    assert_eq!(service.press(&trigger, generation, true, 0), Effect::Toggle);
    assert_eq!(service.press(&trigger, generation, true, 1), Effect::None);
    assert_eq!(service.press(&trigger, generation, false, 2), Effect::None);
    assert_eq!(service.press(&trigger, generation, true, 3), Effect::Toggle);
    service.press(&trigger, generation, false, 3);
    available(&mut service);
    let configuration = action_configuration(&service);
    service.save(0, configuration).unwrap();
    let generation = service.registrations[&chord("KeyK")].generation;
    assert!(matches!(
        service.press(&chord("KeyK"), generation, true, 4),
        Effect::Action(_)
    ));
}

#[test]
fn leases_expire_renew_revoke_and_swallow_bound_key_tails() {
    let (mut service, _, _) = fixture();
    let trigger = service.configuration.launcher.clone();
    let generation = service.registrations[&trigger].generation;
    let lease = service.begin_recording(0);
    assert_eq!(lease.expires_at, 30_000);
    assert!(matches!(
        service.press(&trigger, generation, true, 1),
        Effect::Candidate { .. }
    ));
    service.end_recording();
    assert_eq!(service.press(&trigger, generation, true, 2), Effect::None);
    service.press(&trigger, generation, false, 3);
    assert_eq!(service.press(&trigger, generation, true, 4), Effect::Toggle);
    service.press(&trigger, generation, false, 5);
    let lease = service.begin_recording(6);
    assert_eq!(
        service
            .renew_recording(&lease.lease_id, 100)
            .unwrap()
            .expires_at,
        30_100
    );
    service.expire(30_100);
    assert!(service.recording().is_none());
    assert!(service.renew_recording(&lease.lease_id, 30_101).is_err());
    let lease = service.begin_recording(40_000);
    service.ready(false, 40_001);
    assert!(service.recording().is_none());
    assert!(service.renew_recording(&lease.lease_id, 40_002).is_err());
}

#[test]
fn pending_delivery_is_bounded_expires_and_claims_current_bindings_once() {
    let (mut service, _, _) = fixture();
    available(&mut service);
    let configuration = action_configuration(&service);
    service.save(0, configuration).unwrap();
    for _ in 0..32 {
        assert!(matches!(
            service.trigger(&chord("KeyK"), 0),
            Effect::Action(_)
        ));
    }
    assert_eq!(service.trigger(&chord("KeyK"), 0), Effect::None);
    assert_eq!(service.take_failures()[0].code, "busy");
    assert_eq!(service.ready(true, 1).len(), 32);
    assert!(service.acknowledge(1, true, 2));
    assert!(!service.acknowledge(1, true, 3));
    service.expire(10_000);
    assert_eq!(service.take_failures().len(), 31);
    let Effect::Action(invocation) = service.trigger(&chord("KeyK"), 11_000) else {
        panic!()
    };
    service.update_targets(BTreeSet::new()).unwrap();
    assert!(!service.acknowledge(invocation.invocation_id, true, 11_001));
    assert_eq!(service.take_failures()[0].code, "target_unavailable");
}

#[test]
fn saved_double_taps_are_inactive_without_permission_and_snapshot_is_safe() {
    let (mut service, _, _) = fixture();
    let mut configuration = service.configuration.clone();
    let trigger = Trigger::ModifierDoubleTap {
        modifier: "cmd".into(),
    };
    configuration.launcher = trigger.clone();
    let snapshot = service.save(0, configuration).unwrap();
    assert_eq!(
        snapshot
            .bindings
            .iter()
            .find(|entry| entry.target == LAUNCHER)
            .unwrap()
            .status,
        BindingStatus::PermissionRequired
    );
    assert_eq!(service.trigger(&trigger, 0), Effect::None);
    service.set_monitor(MonitorStatus::Active);
    assert_eq!(service.trigger(&trigger, 0), Effect::Toggle);
    service.set_monitor(MonitorStatus::Unavailable);
    assert_eq!(service.trigger(&trigger, 0), Effect::None);
    let serialized =
        serde_json::to_string(&ShortcutError::new("storage_failed").with_snapshot(snapshot))
            .unwrap();
    assert!(!serialized.contains("/Users/"));
}

#[test]
fn filesystem_is_independent_of_preferences_and_preserves_corrupt_files_until_explicit_save() {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let root = std::env::temp_dir().join(format!(
        "lensx-shortcuts-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&root).unwrap();
    fs::write(
        root.join("preferences.json"),
        br#"{"theme_mode":"dark","locale":"zh-CN"}"#,
    )
    .unwrap();
    let mut disk = FileStore::new(root.join("shortcuts.json"));
    assert_eq!(disk.read(), Stored::Missing);
    fs::write(root.join("shortcuts.json"), b"broken").unwrap();
    assert_eq!(disk.read(), Stored::Invalid);
    assert_eq!(fs::read(root.join("shortcuts.json")).unwrap(), b"broken");
    let configuration = Configuration::default();
    disk.stage(&configuration, None).unwrap();
    disk.commit().unwrap();
    assert_eq!(disk.read(), Stored::Configuration(configuration));
    assert_eq!(
        fs::read(root.join("preferences.json")).unwrap(),
        br#"{"theme_mode":"dark","locale":"zh-CN"}"#
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn layout_reserved_keys_cannot_execute_or_remain_registered_after_layout_change() {
    let (mut service, _, native) = fixture();
    let configuration = changed(&service);
    service.save(0, configuration).unwrap();
    native.0.borrow_mut().blocked.insert(chord("KeyK"));
    service.refresh_layout();
    assert!(service.snapshot().recovery_degraded);
    assert!(!native.0.borrow().keys.contains_key(&chord("KeyK")));
}

#[test]
fn expired_recording_keeps_current_press_suspended_until_physical_release() {
    let (mut service, _, _) = fixture();
    let trigger = service.configuration.launcher.clone();
    let generation = service.registrations[&trigger].generation;
    let lease = service.begin_recording(0);
    assert!(service.renew_recording("foreign", 1).is_err());
    assert!(matches!(
        service.press(&trigger, generation, true, 29_999),
        Effect::Candidate { .. }
    ));
    service.expire(30_000);
    assert!(service.recording().is_none());
    assert_eq!(
        service.press(&trigger, generation, true, 30_001),
        Effect::None
    );
    assert!(service.renew_recording(&lease.lease_id, 30_002).is_err());
    service.press(&trigger, generation, false, 30_003);
    assert_eq!(
        service.press(&trigger, generation, true, 30_004),
        Effect::Toggle
    );
}

#[test]
fn unreported_admitted_failures_are_bounded_and_preserved_until_host_ready() {
    let (mut service, _, _) = fixture();
    available(&mut service);
    let configuration = action_configuration(&service);
    service.save(0, configuration).unwrap();
    for _ in 0..32 {
        assert!(matches!(
            service.trigger(&chord("KeyK"), 0),
            Effect::Action(_)
        ));
    }
    service.expire(10_000);
    for _ in 0..100 {
        assert_eq!(service.trigger(&chord("KeyK"), 10_001), Effect::None);
    }
    assert_eq!(service.failures.len(), 33);
    assert_eq!(
        service
            .failures
            .iter()
            .filter(|failure| failure.code == "expired")
            .count(),
        32
    );
    assert!(service.ready(true, 10_002).is_empty());
    assert_eq!(service.take_failures().len(), 33);
    assert!(matches!(
        service.trigger(&chord("KeyK"), 10_003),
        Effect::Action(_)
    ));
}

#[test]
fn reset_defaults_uses_full_transaction_and_single_recovery_edit_keeps_conflicts() {
    let (mut service, disk, _) = fixture();
    available(&mut service);
    let mut configuration = changed(&service);
    configuration
        .actions
        .insert("com.test.open".into(), Configuration::default().launcher);
    configuration.launcher = Trigger::ModifierDoubleTap {
        modifier: "shift".into(),
    };
    service.save(0, configuration).unwrap();
    let mut recovery_only = service.configuration.clone();
    recovery_only.launcher = Configuration::default().launcher;
    assert_eq!(
        service.save(1, recovery_only).unwrap_err().code,
        "conflicting_trigger"
    );
    let mut defaults = Configuration::default();
    defaults.revision = 1;
    disk.0.borrow_mut().commit = "before";
    assert!(service.save(1, defaults.clone()).is_err());
    assert_eq!(service.configuration.actions.len(), 1);
    disk.0.borrow_mut().commit = "ok";
    let snapshot = service.save(1, defaults).unwrap();
    assert!(snapshot.configuration.actions.is_empty());
    assert_eq!(
        snapshot.configuration.launcher,
        Configuration::default().launcher
    );
    assert_eq!(snapshot.configuration.revision, 2);
}

#[test]
fn uncertain_storage_stays_quarantined_across_periodic_layout_and_target_reconciliation() {
    let (mut service, disk, native) = fixture();
    disk.0.borrow_mut().commit = "unknown";
    let next = changed(&service);
    assert_eq!(service.save(0, next).unwrap_err().code, "degraded");
    service.refresh_layout();
    available(&mut service);
    assert!(service.snapshot().recovery_degraded);
    assert!(native.0.borrow().keys.is_empty());
    assert_eq!(
        service.trigger(&Configuration::default().launcher, 1),
        Effect::None
    );
    disk.0.borrow_mut().commit = "ok";
    let next = changed(&service);
    assert!(!service.save(0, next).unwrap().recovery_degraded);
}

#[test]
fn show_failure_is_retained_until_ready_and_recording_revocation_advances_input_epoch() {
    let (mut service, _, _) = fixture();
    available(&mut service);
    let next = action_configuration(&service);
    service.save(0, next).unwrap();
    let Effect::Action(invocation) = service.trigger(&chord("KeyK"), 0) else {
        panic!()
    };
    service.delivery_failed(invocation.invocation_id);
    assert!(!service.host_ready);
    assert!(service.pending.is_empty());
    assert_eq!(service.failures[0].code, "delivery_failed");
    assert!(service.ready(true, 1).is_empty());
    assert_eq!(
        service.take_failures()[0].invocation_id,
        invocation.invocation_id
    );
    for revoke in ["explicit", "expire", "renew", "host"] {
        let lease = service.begin_recording(100);
        let epoch = service.recording_epoch();
        match revoke {
            "explicit" => {
                service.end_recording();
            }
            "expire" => service.expire(30_100),
            "renew" => {
                assert!(service.renew_recording(&lease.lease_id, 30_100).is_err());
            }
            _ => {
                service.ready(false, 101);
            }
        }
        assert!(service.recording_epoch() > epoch);
        assert!(service.recording().is_none());
    }
}

#[test]
fn concurrent_preferences_writes_never_replace_shortcut_snapshots() {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let root = std::env::temp_dir().join(format!(
        "lensx-shortcut-concurrent-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&root).unwrap();
    let preferences = root.join("preferences.json");
    let worker_path = preferences.clone();
    let worker = std::thread::spawn(move || {
        for index in 0..32 {
            fs::write(
                &worker_path,
                if index % 2 == 0 {
                    br#"{"theme_mode":"light","locale":"en-US"}"#.as_slice()
                } else {
                    br#"{"theme_mode":"dark","locale":"zh-CN"}"#.as_slice()
                },
            )
            .unwrap();
        }
    });
    let mut disk = FileStore::new(root.join("shortcuts.json"));
    for revision in 0..32 {
        let mut configuration = Configuration::default();
        configuration.revision = revision;
        disk.stage(&configuration, None).unwrap();
        disk.commit().unwrap();
        assert_eq!(disk.read(), Stored::Configuration(configuration));
    }
    worker.join().unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&fs::read(preferences).unwrap()).unwrap()
            ["theme_mode"],
        "dark"
    );
    let Stored::Configuration(configuration) = disk.read() else {
        panic!()
    };
    assert_eq!(configuration.revision, 31);
    fs::remove_dir_all(root).unwrap();
}

fn legacy_fixture(
    double: bool,
) -> (
    ShortcutService<FakeStore, FakeRegistry>,
    FakeStore,
    FakeRegistry,
) {
    let raw = serde_json::json!({
        "version":1,"revision":7,
        "launcher":{"chord":chord("KeyK"),"double_tap":if double {serde_json::json!({"kind":"modifier_double_tap","modifier":"cmd"})} else {serde_json::Value::Null}},
        "actions":{"com.test.open":chord("KeyL")}
    });
    let (configuration, migration, detach_migration) =
        serde_json::from_value::<VersionOneConfiguration>(raw)
            .unwrap()
            .project()
            .unwrap();
    let disk = FakeStore::new(Stored::VersionOne {
        configuration,
        migration,
        detach_migration,
    });
    let native = FakeRegistry::default();
    (
        ShortcutService::start(disk.clone(), native.clone()),
        disk,
        native,
    )
}

#[test]
fn versioned_configuration_fixtures_are_strict_and_reads_preserve_original_bytes() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/launcher-shortcuts/configurations.json"
    ))
    .unwrap();
    let root = std::env::temp_dir().join(format!(
        "lensx-shortcuts-version-fixtures-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("shortcuts.json");
    for case in fixture["valid"].as_array().unwrap() {
        let bytes = serde_json::to_vec(&case["input"]).unwrap();
        fs::write(&file, &bytes).unwrap();
        let service = ShortcutService::start(FileStore::new(file.clone()), FakeRegistry::default());
        let snapshot = service.snapshot();
        assert_eq!(
            serde_json::to_value(snapshot.configuration).unwrap(),
            case["configuration"]
        );
        assert_eq!(
            serde_json::to_value(snapshot.launcher_migration).unwrap(),
            case.get("launcher_migration")
                .cloned()
                .unwrap_or(serde_json::Value::Null)
        );
        assert_eq!(service.legacy_file, case["source_version"] != 3);
        assert_eq!(
            serde_json::to_value(snapshot.detach_migration).unwrap(),
            case.get("detach_migration")
                .cloned()
                .unwrap_or(serde_json::Value::Null)
        );
        assert_eq!(fs::read(&file).unwrap(), bytes);
    }
    for input in fixture["invalid"].as_array().unwrap() {
        let bytes = serde_json::to_vec(input).unwrap();
        fs::write(&file, &bytes).unwrap();
        assert_eq!(
            FileStore::new(file.clone()).read(),
            Stored::Invalid,
            "{input}"
        );
        assert_eq!(fs::read(&file).unwrap(), bytes);
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn legacy_single_chord_upgrades_on_explicit_save_even_when_binding_is_unchanged() {
    let (mut service, disk, native) = legacy_fixture(false);
    let before = disk.read();
    let snapshot = service.snapshot();
    assert_eq!(snapshot.configuration.version, 3);
    assert!(snapshot.launcher_migration.is_none());
    assert!(!snapshot.recovery_degraded);
    assert_eq!(disk.read(), before);
    assert_eq!(native.0.borrow().keys.len(), 1);
    let saved = service.save(7, snapshot.configuration).unwrap();
    assert_eq!(saved.configuration.revision, 8);
    assert!(!service.legacy_file);
    assert_eq!(disk.read(), Stored::Configuration(saved.configuration));
}

fn detach_conflict_fixture(
    launcher: bool,
) -> (
    ShortcutService<FakeStore, FakeRegistry>,
    FakeStore,
    FakeRegistry,
) {
    let mut original = Configuration::default();
    if launcher {
        original.launcher = default_detach();
    } else {
        original
            .actions
            .insert("com.test.unavailable".into(), default_detach());
    }
    let (configuration, migration) = VersionTwoConfiguration {
        version: 2,
        revision: 17,
        launcher: original.launcher,
        actions: original.actions,
    }
    .project()
    .unwrap();
    let disk = FakeStore::new(Stored::VersionTwo {
        configuration,
        migration,
    });
    let native = FakeRegistry::default();
    (
        ShortcutService::start(disk.clone(), native.clone()),
        disk,
        native,
    )
}

#[test]
fn detach_is_canonical_but_never_registered_or_invoked_as_a_global_target() {
    let (mut service, _, native) = fixture();
    service.set_local_available(true);
    let before = native.0.borrow().keys.clone();
    assert!(!before.contains_key(&default_detach()));
    assert_eq!(service.trigger(&default_detach(), 0), Effect::None);
    let mut candidate = service.configuration.clone();
    candidate.detach = Some(chord("KeyL"));
    let saved = service.save(0, candidate).unwrap();
    assert_eq!(native.0.borrow().keys, before);
    assert!(saved
        .bindings
        .iter()
        .any(|binding| binding.target == DETACH && binding.status == BindingStatus::Active));
    assert_eq!(service.trigger(&chord("KeyL"), 1), Effect::None);
    let mut candidate = service.configuration.clone();
    candidate.detach = Some(service.configuration.launcher.clone());
    assert_eq!(
        service
            .save(1, candidate)
            .unwrap_err()
            .conflicting_target
            .as_deref(),
        Some(LAUNCHER)
    );
    let mut candidate = service.configuration.clone();
    candidate.launcher = chord("KeyL");
    assert_eq!(
        service
            .save(1, candidate)
            .unwrap_err()
            .conflicting_target
            .as_deref(),
        Some(DETACH)
    );
    let mut candidate = service.configuration.clone();
    candidate
        .actions
        .insert("com.test.unavailable".into(), chord("KeyL"));
    assert_eq!(
        service
            .save(1, candidate)
            .unwrap_err()
            .conflicting_target
            .as_deref(),
        Some(DETACH)
    );
    assert_eq!(service.configuration, saved.configuration);
    assert_eq!(native.0.borrow().keys, before);
}

#[test]
fn unavailable_detach_does_not_degrade_or_change_global_recovery() {
    let (mut service, _, native) = fixture();
    let global = service.configuration.launcher.clone();
    let initial = native.0.borrow().keys.clone();
    assert!(!service.snapshot().recovery_degraded);
    assert!(service.snapshot().bindings.iter().any(
        |binding| binding.target == DETACH && binding.status == BindingStatus::LocalUnavailable
    ));
    service.set_local_available(true);
    native.0.borrow_mut().blocked.insert(default_detach());
    service.refresh_layout();
    assert!(!service.local_available());
    assert!(!service.snapshot().recovery_degraded);
    assert_eq!(service.trigger(&global, 0), Effect::Toggle);
    assert_eq!(native.0.borrow().keys, initial);
    native.0.borrow_mut().blocked.clear();
    service.set_local_available(false);
    let mut candidate = service.configuration.clone();
    candidate.detach = Some(chord("KeyK"));
    let saved = service.save(0, candidate).unwrap();
    assert!(!saved.recovery_degraded);
    assert_eq!(
        saved
            .bindings
            .iter()
            .find(|binding| binding.target == DETACH)
            .unwrap()
            .status,
        BindingStatus::LocalUnavailable
    );
    assert_eq!(native.0.borrow().keys, initial);
}

#[test]
fn startup_monitor_availability_arms_default_detach_despite_service_lock_contention() {
    let (service, _, native) = fixture();
    let installation = service.local_availability();
    let service = std::sync::Mutex::new(service);
    let held = service.lock().unwrap();
    assert!(service.try_lock().is_err());
    assert!(!held.local_available());
    let globals = native.0.borrow().keys.clone();
    // Exactly the installer publication path: it never needs the held lock.
    assert!(installation.set(true));
    assert_eq!(held.detach(), Some(default_detach()));
    assert!(held.local_available());
    assert!(held
        .snapshot()
        .bindings
        .iter()
        .any(|binding| binding.target == DETACH && binding.status == BindingStatus::Active));
    assert!(held.recovery_available());
    assert_eq!(native.0.borrow().keys, globals);
    assert!(installation.set(false));
    assert!(!held.local_available());
    assert!(held.recovery_available());
    assert_eq!(native.0.borrow().keys, globals);
    drop(held);
    assert!(!service.lock().unwrap().local_available());
}

#[test]
fn ordinary_shortcut_mutex_contention_does_not_remove_recovery_or_invent_recording() {
    let (service, _, native) = fixture();
    let facts = service.admission();
    let service = std::sync::Mutex::new(service);
    let mut held = service.lock().unwrap();
    let probe = facts.clone();
    assert_eq!(
        std::thread::spawn(move || (probe.recovery_available(), probe.recording_active(10)))
            .join()
            .unwrap(),
        (true, false)
    );
    let lease = held.begin_recording(10);
    assert!(facts.recording_active(11));
    held.renew_recording(&lease.lease_id, 20).unwrap();
    assert!(facts.recording_active(30_019));
    assert!(!facts.recording_active(30_020));
    held.end_recording();
    assert!(!facts.recording_active(21));
    native.0.borrow_mut().calls.clear();
    held.refresh_layout();
    held.update_targets(Default::default()).unwrap();
    assert!(native.0.borrow().calls.is_empty());
    assert!(facts.recovery_available());
}

#[test]
fn recovery_is_revoked_before_registration_changes_and_reconfirmed_only_after_publication() {
    let (mut service, _, native) = fixture();
    let facts = service.admission();
    native.0.borrow_mut().admission_probe = Some(facts.clone());
    service.save(0, changed(&service)).unwrap();
    assert_eq!(
        native.0.borrow().recovery_during_publication,
        vec![false, false]
    );
    assert!(facts.recovery_available());
    let selected = service.configuration.launcher.clone();
    native.0.borrow_mut().blocked.insert(selected);
    service.refresh_layout();
    assert!(!facts.recovery_available());
    assert!(service.snapshot().recovery_degraded);
    native.0.borrow_mut().blocked.clear();
    service.refresh_layout();
    assert!(facts.recovery_available());
}

#[test]
fn double_tap_monitor_loss_sleep_and_stop_revoke_only_confirmed_recovery() {
    let (mut service, _, _) = fixture();
    let facts = service.admission();
    service.set_monitor(MonitorStatus::Unavailable);
    assert!(facts.recovery_available());
    let mut candidate = service.configuration.clone();
    candidate.launcher = Trigger::ModifierDoubleTap {
        modifier: "cmd".into(),
    };
    service.save(0, candidate).unwrap();
    assert!(!facts.recovery_available());
    service.set_monitor(MonitorStatus::Active);
    assert!(facts.recovery_available());
    facts.set_monitor(false);
    assert!(!facts.recovery_available());
    service.set_monitor(MonitorStatus::Active);
    facts.set_sleeping(true);
    assert!(!facts.recovery_available());
    facts.set_sleeping(false);
    assert!(!facts.recovery_available());
    service.set_monitor(MonitorStatus::Active);
    assert!(facts.recovery_available());
    facts.stop();
    service.set_monitor(MonitorStatus::Active);
    service.publish();
    assert!(!facts.recovery_available());
}

#[test]
fn legacy_cmd_d_keeps_global_owner_and_unrelated_saves_persist_unresolved_choice() {
    for launcher in [true, false] {
        let (mut service, disk, native) = detach_conflict_fixture(launcher);
        let initial = disk.read();
        let snapshot = service.snapshot();
        assert_eq!(snapshot.configuration.revision, 17);
        assert_eq!(snapshot.configuration.detach, None);
        assert!(!snapshot.recovery_degraded);
        assert_eq!(
            snapshot
                .detach_migration
                .as_ref()
                .unwrap()
                .conflicting_target,
            if launcher {
                LAUNCHER
            } else {
                "com.test.unavailable"
            }
        );
        assert_eq!(disk.read(), initial);
        if launcher {
            assert_eq!(service.trigger(&default_detach(), 0), Effect::Toggle);
        } else {
            assert!(!native.0.borrow().keys.contains_key(&default_detach()));
        }
        let mut unrelated = service.configuration.clone();
        // Removing/changing the former occupant is not an explicit detach choice.
        if launcher {
            unrelated.launcher = chord("KeyJ");
        } else {
            unrelated.actions.clear();
        }
        let saved = service.save(17, unrelated).unwrap();
        assert_eq!(saved.detach_migration, snapshot.detach_migration);
        let restarted = ShortcutService::start(disk.clone(), FakeRegistry::default());
        assert_eq!(
            restarted.snapshot().detach_migration,
            snapshot.detach_migration
        );
        assert!(!restarted.legacy_file);
        let mut candidate = service.configuration.clone();
        candidate.detach = Some(default_detach());
        assert_eq!(
            service.save(18, candidate.clone()).unwrap_err().code,
            "detach_choice_required"
        );
        let resolved = service
            .save_resolving_migrations(18, candidate, false, true)
            .unwrap();
        assert!(resolved.detach_migration.is_none());
        assert_eq!(resolved.configuration.detach, Some(default_detach()));
        assert!(
            ShortcutService::start(disk.clone(), FakeRegistry::default())
                .detach_migration
                .is_none()
        );
    }
}

#[test]
fn explicit_detach_null_resolution_and_failed_default_restore_keep_confirmed_state() {
    let (mut service, disk, native) = detach_conflict_fixture(true);
    let before = disk.read();
    let mut candidate = service.configuration.clone();
    candidate.detach = Some(default_detach());
    let error = service
        .save_resolving_migrations(17, candidate, false, true)
        .unwrap_err();
    assert_eq!(error.conflicting_target.as_deref(), Some(LAUNCHER));
    assert_eq!(disk.read(), before);
    assert!(native.0.borrow().keys.contains_key(&default_detach()));
    let saved = service
        .save_resolving_migrations(17, service.configuration.clone(), false, true)
        .unwrap();
    assert!(saved.detach_migration.is_none());
    assert!(saved.configuration.detach.is_none());
    assert_eq!(saved.configuration.revision, 18);
    assert!(!saved.recovery_degraded);
}

#[test]
fn detach_resolution_storage_failures_preserve_marker_until_commit_is_confirmed() {
    for failure in ["stage", "before", "after", "unknown"] {
        let (mut service, disk, _) = detach_conflict_fixture(false);
        let marker = service.detach_migration.clone();
        if failure == "stage" {
            disk.0.borrow_mut().fail_stage = true;
        } else {
            disk.0.borrow_mut().commit = failure;
        }
        let error = service
            .save_resolving_migrations(17, service.configuration.clone(), false, true)
            .unwrap_err();
        let snapshot = error.snapshot.unwrap();
        assert_eq!(
            snapshot.detach_migration,
            if failure == "after" { None } else { marker }
        );
        assert_eq!(
            snapshot.configuration.revision,
            if failure == "after" { 18 } else { 17 }
        );
        assert_eq!(snapshot.recovery_degraded, failure == "unknown");
    }
}

#[test]
fn local_recording_is_permission_independent_and_owns_only_current_lease_gesture() {
    let (mut service, _, native) = fixture();
    assert_eq!(service.monitor, MonitorStatus::PermissionRequired);
    let lease = service.begin_recording(10);
    let epoch = service.recording_epoch();
    let trigger = default_detach();
    let globals = native.0.borrow().keys.clone();
    assert_eq!(
        service.local_recording_press(2, Some(&trigger), true, false, epoch, 11),
        (
            true,
            Effect::Candidate {
                lease_id: lease.lease_id,
                trigger: trigger.clone()
            }
        )
    );
    // Global callbacks cannot emit a second ordinary chord candidate.
    assert_eq!(service.trigger(&trigger, 11), Effect::None);
    assert_eq!(
        service.local_recording_press(2, Some(&trigger), true, true, epoch, 12),
        (true, Effect::None)
    );
    service.end_recording();
    assert!(service.suppressed_until_release());
    assert_eq!(
        service.local_recording_press(2, Some(&trigger), true, true, epoch, 13),
        (true, Effect::None)
    );
    assert_eq!(
        service.local_recording_press(2, None, false, false, epoch, 14),
        (true, Effect::None)
    );
    assert!(!service.suppressed_until_release());
    service.begin_recording(15);
    assert_eq!(
        service.local_recording_press(2, Some(&trigger), true, false, epoch, 16),
        (false, Effect::None)
    );
    let fresh = service.recording_epoch();
    service.local_recording_press(2, Some(&trigger), true, false, fresh, 17);
    assert_eq!(
        service.local_recording_press(2, Some(&trigger), true, true, fresh, 30_015),
        (true, Effect::None)
    );
    assert!(service.recording().is_none());
    assert_eq!(native.0.borrow().keys, globals);
}

#[test]
fn global_and_local_recording_callbacks_share_one_candidate_in_either_order() {
    for local_first in [true, false] {
        let (mut service, _, _) = fixture();
        service.begin_recording(0);
        let epoch = service.recording_epoch();
        let trigger = service.configuration.launcher.clone();
        let generation = service.registrations[&trigger].generation;
        let (first, second) = if local_first {
            let first = service
                .local_recording_press(49, Some(&trigger), true, false, epoch, 1)
                .1;
            (first, service.press(&trigger, generation, true, 1))
        } else {
            let first = service.press(&trigger, generation, true, 1);
            (
                first,
                service
                    .local_recording_press(49, Some(&trigger), true, false, epoch, 1)
                    .1,
            )
        };
        assert!(matches!(first, Effect::Candidate { .. }));
        assert_eq!(second, Effect::None);
        service.end_recording();
        service.press(&trigger, generation, false, 2);
        assert!(service.suppressed_until_release());
        service.local_recording_press(49, None, false, false, epoch, 2);
        assert!(!service.suppressed_until_release());
        assert_eq!(service.press(&trigger, generation, true, 3), Effect::Toggle);
    }
}

#[test]
fn real_v2_file_retains_host_migration_record_across_unrelated_v3_save_and_restart() {
    let root = std::env::temp_dir().join(format!(
        "lensx-detach-shortcuts-migration-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    let path = root.join("shortcuts.json");
    let original = serde_json::to_vec(&serde_json::json!({"version":2,"revision":23,"launcher":Configuration::default().launcher,"actions":{"com.test.removed":default_detach()}})).unwrap();
    fs::write(&path, &original).unwrap();
    let mut service = ShortcutService::start(FileStore::new(path.clone()), FakeRegistry::default());
    assert_eq!(fs::read(&path).unwrap(), original);
    let marker = service.snapshot().detach_migration.unwrap();
    let mut candidate = service.configuration.clone();
    candidate.actions.clear();
    service.save(23, candidate).unwrap();
    let persisted: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(persisted["version"], 3);
    assert_eq!(
        persisted["detach_migration"],
        serde_json::to_value(&marker).unwrap()
    );
    // Host-owned persisted metadata cannot be supplied as editable configuration.
    assert!(serde_json::from_value::<Configuration>(persisted).is_err());
    let mut restarted =
        ShortcutService::start(FileStore::new(path.clone()), FakeRegistry::default());
    assert_eq!(restarted.snapshot().detach_migration, Some(marker));
    let saved = restarted
        .save_resolving_migrations(24, restarted.configuration.clone(), false, true)
        .unwrap();
    assert!(saved.detach_migration.is_none());
    let persisted: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert!(persisted.get("detach_migration").is_none());
    assert!(serde_json::from_value::<Configuration>(persisted)
        .unwrap()
        .detach
        .is_none());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn legacy_dual_entries_require_choice_and_neither_launcher_candidate_executes() {
    let (mut service, disk, native) = legacy_fixture(true);
    let before = disk.read();
    available(&mut service);
    service.set_monitor(MonitorStatus::Active);
    assert!(service.snapshot().recovery_degraded);
    assert!(service.snapshot().launcher_migration.is_some());
    assert_eq!(
        service
            .snapshot()
            .bindings
            .iter()
            .find(|binding| binding.target == LAUNCHER)
            .unwrap()
            .status,
        BindingStatus::Degraded
    );
    assert!(!native.0.borrow().keys.contains_key(&chord("KeyK")));
    assert!(native.0.borrow().keys.contains_key(&chord("KeyL")));
    let double = service
        .launcher_migration
        .as_ref()
        .unwrap()
        .double_tap
        .clone();
    assert_eq!(service.trigger(&chord("KeyK"), 0), Effect::None);
    assert_eq!(service.trigger(&double, 0), Effect::None);
    let mut candidate = service.configuration.clone();
    candidate.launcher = double.clone();
    let error = service.save(7, candidate.clone()).unwrap_err();
    assert_eq!(error.code, "launcher_choice_required");
    assert!(error.snapshot.unwrap().launcher_migration.is_some());
    assert_eq!(disk.read(), before);
    let saved = service
        .save_resolving_migration(7, candidate, true)
        .unwrap();
    assert!(saved.launcher_migration.is_none());
    assert!(!saved.recovery_degraded);
    assert_eq!(service.trigger(&double, 1), Effect::Toggle);
    assert_eq!(service.trigger(&chord("KeyK"), 1), Effect::None);
    assert_eq!(native.0.borrow().keys.len(), 1);
    assert_eq!(disk.read(), Stored::Configuration(saved.configuration));
}

#[test]
fn migration_failures_keep_legacy_choice_and_uncertain_commits_follow_actual_disk() {
    for failure in ["stage", "register", "register_after", "before", "unknown"] {
        let (mut service, disk, native) = legacy_fixture(true);
        let before = disk.read();
        let candidate = service.configuration.clone();
        match failure {
            "stage" => disk.0.borrow_mut().fail_stage = true,
            "register" | "register_after" => native.0.borrow_mut().failures.push_back(failure),
            mode => disk.0.borrow_mut().commit = mode,
        }
        assert!(
            service
                .save_resolving_migration(7, candidate, true)
                .is_err(),
            "{failure}"
        );
        assert!(service.snapshot().launcher_migration.is_some(), "{failure}");
        assert!(service.snapshot().recovery_degraded, "{failure}");
        service.refresh_layout();
        assert!(
            !native.0.borrow().keys.contains_key(&chord("KeyK")),
            "{failure}"
        );
        if failure != "unknown" {
            assert_eq!(disk.read(), before, "{failure}");
        }
    }
    let (mut service, disk, _) = legacy_fixture(true);
    disk.0.borrow_mut().commit = "after";
    let candidate = service.configuration.clone();
    let error = service
        .save_resolving_migration(7, candidate, true)
        .unwrap_err();
    assert_eq!(error.code, "storage_failed");
    let snapshot = error.snapshot.unwrap();
    assert!(snapshot.launcher_migration.is_none());
    assert_eq!(snapshot.configuration.revision, 8);
    assert!(!snapshot.recovery_degraded);
    assert_eq!(disk.read(), Stored::Configuration(snapshot.configuration));
}

#[test]
fn only_the_selected_launcher_trigger_is_registered_and_monitored_for_recovery() {
    let (mut service, _, native) = fixture();
    let old = service.configuration.launcher.clone();
    let old_generation = service.registrations[&old].generation;
    let double = Trigger::ModifierDoubleTap {
        modifier: "cmd".into(),
    };
    let mut candidate = service.configuration.clone();
    candidate.launcher = double.clone();
    let saved = service.save(0, candidate).unwrap();
    assert!(saved.recovery_degraded);
    assert!(native.0.borrow().keys.is_empty());
    assert_eq!(service.press(&old, old_generation, true, 1), Effect::None);
    assert_eq!(service.trigger(&old, 1), Effect::None);
    for monitor in [
        MonitorStatus::Active,
        MonitorStatus::PermissionRequired,
        MonitorStatus::Active,
        MonitorStatus::Unavailable,
        MonitorStatus::Active,
    ] {
        service.set_monitor(monitor);
        assert_eq!(
            service.snapshot().recovery_degraded,
            monitor != MonitorStatus::Active
        );
        assert_eq!(
            service.trigger(&double, 2),
            if monitor == MonitorStatus::Active {
                Effect::Toggle
            } else {
                Effect::None
            }
        );
        assert!(native.0.borrow().keys.is_empty());
    }
    let mut candidate = service.configuration.clone();
    candidate.launcher = chord("KeyK");
    native.0.borrow_mut().failures.push_back("register");
    assert!(service.save(1, candidate.clone()).is_err());
    assert_eq!(service.configuration.launcher, double);
    assert!(!service.snapshot().recovery_degraded);
    assert!(!service.save(1, candidate).unwrap().recovery_degraded);
    service.set_monitor(MonitorStatus::Unavailable);
    assert!(!service.snapshot().recovery_degraded);
    assert_eq!(service.trigger(&double, 3), Effect::None);
}

#[test]
fn double_tap_only_startup_never_retargets_default_chord_owned_by_an_action() {
    let double = Trigger::ModifierDoubleTap {
        modifier: "shift".into(),
    };
    let mut configuration = Configuration::default();
    configuration.launcher = double.clone();
    configuration
        .actions
        .insert("com.test.open".into(), Configuration::default().launcher);
    let disk = FakeStore::new(Stored::Configuration(configuration));
    let native = FakeRegistry::default();
    let mut service = ShortcutService::start(disk, native.clone());
    assert!(service.snapshot().recovery_degraded);
    assert!(native.0.borrow().keys.is_empty());
    available(&mut service);
    assert_eq!(
        service.registrations[&Configuration::default().launcher].target,
        "com.test.open"
    );
    service.set_monitor(MonitorStatus::Active);
    assert!(!service.snapshot().recovery_degraded);
    service.set_monitor(MonitorStatus::PermissionRequired);
    assert!(service.snapshot().recovery_degraded);
    assert!(matches!(
        service.trigger(&Configuration::default().launcher, 1),
        Effect::Action(_)
    ));
    assert_eq!(service.trigger(&double, 2), Effect::None);
}

#[test]
fn real_legacy_file_is_only_replaced_after_confirmed_selection() {
    let root = std::env::temp_dir().join(format!(
        "lensx-shortcuts-real-migration-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("shortcuts.json");
    let original=serde_json::to_vec(&serde_json::json!({"version":1,"revision":4,"launcher":{"chord":chord("KeyK"),"double_tap":{"kind":"modifier_double_tap","modifier":"cmd"}},"actions":{"com.test.open":chord("KeyL")}})).unwrap();
    fs::write(&file, &original).unwrap();
    let mut service = ShortcutService::start(FileStore::new(file.clone()), FakeRegistry::default());
    let snapshot = service.snapshot();
    assert_eq!(fs::read(&file).unwrap(), original);
    let mut choice = snapshot.configuration;
    choice.launcher = snapshot.launcher_migration.unwrap().double_tap;
    assert_eq!(
        service.save(4, choice.clone()).unwrap_err().code,
        "launcher_choice_required"
    );
    assert_eq!(fs::read(&file).unwrap(), original);
    let saved = service.save_resolving_migration(4, choice, true).unwrap();
    assert_eq!(saved.configuration.revision, 5);
    assert!(saved.launcher_migration.is_none());
    assert!(saved.recovery_degraded);
    let persisted: serde_json::Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    assert_eq!(persisted["version"], 3);
    assert_eq!(persisted["launcher"]["kind"], "modifier_double_tap");
    assert!(persisted["launcher"].get("chord").is_none());
    assert_eq!(persisted["actions"].as_object().unwrap().len(), 1);
    let restarted = ShortcutService::start(FileStore::new(file.clone()), FakeRegistry::default());
    assert!(restarted.launcher_migration.is_none());
    assert_eq!(restarted.configuration, saved.configuration);
    assert!(restarted.snapshot().recovery_degraded);
    fs::remove_dir_all(root).unwrap();
}
