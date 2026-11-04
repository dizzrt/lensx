use super::model::*;
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
        Arc,
    },
};

/// Native installation status is independent of the shortcut transaction lock.
/// The service and native installer read/write the same durable process fact.
#[derive(Clone, Default)]
pub struct LocalMonitorAvailability(Arc<AtomicBool>);

impl LocalMonitorAvailability {
    pub fn set(&self, available: bool) -> bool {
        self.0.swap(available, Ordering::AcqRel) != available
    }
    fn available(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}

/// Native admission reads confirmed shortcut facts without waiting on the
/// service mutex used by ordinary input polling and configuration transactions.
#[derive(Clone, Default)]
pub struct ShortcutAdmission(Arc<AdmissionState>);

#[derive(Default)]
struct AdmissionState {
    recovery: AtomicU8,
    recording_deadline: AtomicU64,
}

impl ShortcutAdmission {
    const CHORD: u8 = 1;
    const DOUBLE_TAP: u8 = 2;
    const MONITOR: u8 = 4;
    const SLEEPING: u8 = 8;
    const STOPPED: u8 = 16;

    fn change(&self, clear: u8, set: u8) {
        let _ = self
            .0
            .recovery
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |state| {
                Some((state & !clear) | set)
            });
    }
    fn publish_selected(&self, selected: Option<&Trigger>) {
        let selected = match selected {
            Some(Trigger::Chord { .. }) => Self::CHORD,
            Some(Trigger::ModifierDoubleTap { .. }) => Self::DOUBLE_TAP,
            None => 0,
        };
        self.change(Self::CHORD | Self::DOUBLE_TAP, selected);
    }
    pub fn set_monitor(&self, active: bool) {
        self.change(Self::MONITOR, if active { Self::MONITOR } else { 0 });
    }
    pub fn set_sleeping(&self, sleeping: bool) {
        self.change(
            Self::SLEEPING | Self::MONITOR,
            if sleeping { Self::SLEEPING } else { 0 },
        );
    }
    pub fn stop(&self) {
        self.change(0, Self::STOPPED);
    }
    pub fn recovery_available(&self) -> bool {
        let state = self.0.recovery.load(Ordering::Acquire);
        state & (Self::SLEEPING | Self::STOPPED) == 0
            && (state & Self::CHORD != 0
                || state & (Self::DOUBLE_TAP | Self::MONITOR) == Self::DOUBLE_TAP | Self::MONITOR)
    }
    fn publish_recording(&self, deadline: u64) {
        self.0.recording_deadline.store(deadline, Ordering::Release);
    }
    pub fn recording_active(&self, now: u64) -> bool {
        self.0.recording_deadline.load(Ordering::Acquire) > now
    }
}

pub trait Registry {
    fn register(&mut self, trigger: &Trigger, generation: u64) -> Result<(), RegistrationFailure>;
    fn unregister(&mut self, trigger: &Trigger) -> Result<(), ()>;
    fn publish(&mut self, registrations: &BTreeMap<Trigger, u64>);
    fn valid_in_layout(&self, _trigger: &Trigger) -> bool {
        true
    }
    fn key_labels(&self) -> BTreeMap<String, String> {
        BTreeMap::new()
    }
}

#[derive(Clone, Copy, Debug)]
pub enum RegistrationFailure {
    Rejected,
    Uncertain,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Stored {
    Missing,
    Configuration(Configuration),
    ConfigurationWithMigration {
        configuration: Configuration,
        migration: DetachMigration,
    },
    VersionTwo {
        configuration: Configuration,
        migration: Option<DetachMigration>,
    },
    VersionOne {
        configuration: Configuration,
        migration: Option<LauncherMigration>,
        detach_migration: Option<DetachMigration>,
    },
    Invalid,
    Unavailable,
}

impl Stored {
    fn current(configuration: Configuration, migration: Option<DetachMigration>) -> Self {
        match migration {
            Some(migration) => Self::ConfigurationWithMigration {
                configuration,
                migration,
            },
            None => Self::Configuration(configuration),
        }
    }
}

pub trait Store {
    fn read(&self) -> Stored;
    fn stage(
        &mut self,
        configuration: &Configuration,
        detach_migration: Option<&DetachMigration>,
    ) -> Result<(), ()>;
    fn commit(&mut self) -> Result<(), ()>;
    fn discard(&mut self);
}

pub struct FileStore {
    path: PathBuf,
    staged: Option<PathBuf>,
}
impl FileStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path, staged: None }
    }
}

impl Store for FileStore {
    fn read(&self) -> Stored {
        let bytes = match fs::read(&self.path) {
            Ok(bytes) if bytes.len() <= 1024 * 1024 => bytes,
            Ok(_) => return Stored::Invalid,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Stored::Missing,
            Err(_) => return Stored::Unavailable,
        };
        let Ok(mut value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            return Stored::Invalid;
        };
        match value.get("version").and_then(serde_json::Value::as_u64) {
            Some(3) => {
                let migration = value
                    .as_object_mut()
                    .and_then(|object| object.remove("detach_migration"));
                let migration = match migration {
                    Some(value) => match serde_json::from_value::<DetachMigration>(value) {
                        Ok(migration) if migration.valid() => Some(migration),
                        _ => return Stored::Invalid,
                    },
                    None => None,
                };
                serde_json::from_value::<Configuration>(value)
                    .ok()
                    .and_then(|configuration| configuration.normalized().ok())
                    .filter(|configuration| migration.is_none() || configuration.detach.is_none())
                    .map(|configuration| Stored::current(configuration, migration))
                    .unwrap_or(Stored::Invalid)
            }
            Some(2) => serde_json::from_value::<VersionTwoConfiguration>(value)
                .ok()
                .and_then(|configuration| configuration.project().ok())
                .map(|(configuration, migration)| Stored::VersionTwo {
                    configuration,
                    migration,
                })
                .unwrap_or(Stored::Invalid),
            Some(1) => serde_json::from_value::<VersionOneConfiguration>(value)
                .ok()
                .and_then(|configuration| configuration.project().ok())
                .map(
                    |(configuration, migration, detach_migration)| Stored::VersionOne {
                        configuration,
                        migration,
                        detach_migration,
                    },
                )
                .unwrap_or(Stored::Invalid),
            _ => Stored::Invalid,
        }
    }

    fn stage(
        &mut self,
        configuration: &Configuration,
        detach_migration: Option<&DetachMigration>,
    ) -> Result<(), ()> {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        self.discard();
        let parent = self.path.parent().ok_or(())?;
        fs::create_dir_all(parent).map_err(|_| ())?;
        let path = parent.join(format!(
            ".shortcuts.{}.{}.tmp",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        self.staged = Some(path.clone());
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .map_err(|_| ())?;
        let mut value = serde_json::to_value(configuration).map_err(|_| ())?;
        if let Some(migration) = detach_migration {
            value["detach_migration"] = serde_json::to_value(migration).map_err(|_| ())?;
        }
        let bytes = serde_json::to_vec_pretty(&value).map_err(|_| ())?;
        file.write_all(&bytes)
            .and_then(|_| file.write_all(b"\n"))
            .and_then(|_| file.sync_all())
            .map_err(|_| ())
    }

    fn commit(&mut self) -> Result<(), ()> {
        let staged = self.staged.as_ref().ok_or(())?;
        fs::rename(staged, &self.path).map_err(|_| ())?;
        // A sync failure is an uncertain commit, reconciled by the caller's read.
        let parent = self.path.parent().ok_or(())?;
        std::fs::File::open(parent)
            .and_then(|file| file.sync_all())
            .map_err(|_| ())?;
        self.staged = None;
        Ok(())
    }
    fn discard(&mut self) {
        if let Some(path) = self.staged.take() {
            let _ = fs::remove_file(path);
        }
    }
}

#[derive(Clone, Debug)]
struct Registration {
    target: String,
    generation: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MonitorStatus {
    Active,
    PermissionRequired,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct RecordingLease {
    pub lease_id: String,
    pub expires_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Invocation {
    pub invocation_id: u64,
    pub binding_revision: u64,
    pub action_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Failure {
    pub invocation_id: u64,
    pub code: &'static str,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Effect {
    Toggle,
    Action(Invocation),
    Candidate { lease_id: String, trigger: Trigger },
    None,
}

pub struct ShortcutService<S: Store, R: Registry> {
    store: S,
    pub(super) registry: R,
    configuration: Configuration,
    legacy_file: bool,
    launcher_migration: Option<LauncherMigration>,
    detach_migration: Option<DetachMigration>,
    local_available: LocalMonitorAvailability,
    admission: ShortcutAdmission,
    local_pressed: BTreeMap<u16, Option<Trigger>>,
    recording_chords: BTreeSet<Trigger>,
    registrations: BTreeMap<Trigger, Registration>,
    residual: BTreeSet<Trigger>,
    targets: BTreeSet<String>,
    generation: u64,
    monitor: MonitorStatus,
    diagnostics: Vec<&'static str>,
    pressed: BTreeSet<(Trigger, u64)>,
    recording: Option<RecordingLease>,
    recording_epoch: u64,
    lease_sequence: u64,
    suppressed_until_release: bool,
    invocation_sequence: u64,
    pending: BTreeMap<u64, (Invocation, u64)>,
    failures: Vec<Failure>,
    pub host_ready: bool,
}

impl<S: Store, R: Registry> ShortcutService<S, R> {
    pub fn start(store: S, registry: R) -> Self {
        let (
            mut configuration,
            mut launcher_migration,
            mut detach_migration,
            mut legacy_file,
            mut diagnostics,
        ) = match store.read() {
            Stored::Configuration(configuration) => (configuration, None, None, false, vec![]),
            Stored::ConfigurationWithMigration {
                configuration,
                migration,
            } => (configuration, None, Some(migration), false, vec![]),
            Stored::VersionTwo {
                configuration,
                migration,
            } => (configuration, None, migration, true, vec![]),
            Stored::VersionOne {
                configuration,
                migration,
                detach_migration,
            } => (configuration, migration, detach_migration, true, vec![]),
            Stored::Missing => (Configuration::default(), None, None, false, vec![]),
            Stored::Invalid => (
                Configuration::default(),
                None,
                None,
                false,
                vec!["invalid_configuration"],
            ),
            Stored::Unavailable => (
                Configuration::default(),
                None,
                None,
                false,
                vec!["storage_unavailable"],
            ),
        };
        if launcher_migration.is_none()
            && configuration
                .bindings()
                .values()
                .any(|trigger| !registry.valid_in_layout(trigger))
        {
            configuration = Configuration::default();
            launcher_migration = None;
            detach_migration = None;
            legacy_file = false;
            diagnostics = vec!["invalid_configuration"];
        }
        let mut service = Self {
            store,
            registry,
            configuration,
            legacy_file,
            launcher_migration,
            detach_migration,
            local_available: LocalMonitorAvailability::default(),
            admission: ShortcutAdmission::default(),
            local_pressed: BTreeMap::new(),
            recording_chords: BTreeSet::new(),
            registrations: BTreeMap::new(),
            residual: BTreeSet::new(),
            targets: BTreeSet::new(),
            generation: 0,
            monitor: MonitorStatus::PermissionRequired,
            diagnostics,
            pressed: BTreeSet::new(),
            recording: None,
            recording_epoch: 0,
            lease_sequence: 0,
            suppressed_until_release: false,
            invocation_sequence: 0,
            pending: BTreeMap::new(),
            failures: Vec::new(),
            host_ready: false,
        };
        if service.launcher_migration.is_none()
            && matches!(service.configuration.launcher, Trigger::Chord { .. })
        {
            let trigger = service.configuration.launcher.clone();
            let _ = service.install(trigger, LAUNCHER.into());
        }
        service.publish();
        service
    }

    pub fn snapshot(&self) -> Snapshot {
        let bindings = self
            .configuration
            .all_bindings()
            .into_iter()
            .map(|(target, trigger)| {
                let status = if target == DETACH {
                    if self.local_available.available()
                        && !self.diagnostics.contains(&"storage_uncertain")
                        && self.registry.valid_in_layout(&trigger)
                    {
                        BindingStatus::Active
                    } else {
                        BindingStatus::LocalUnavailable
                    }
                } else if self.diagnostics.contains(&"storage_uncertain")
                    || (target == LAUNCHER && self.launcher_migration.is_some())
                {
                    BindingStatus::Degraded
                } else if !self.available(&target) {
                    BindingStatus::TargetUnavailable
                } else if self.residual.contains(&trigger) {
                    BindingStatus::Degraded
                } else {
                    match trigger {
                        Trigger::Chord { .. } => {
                            if self
                                .registrations
                                .get(&trigger)
                                .is_some_and(|entry| entry.target == target)
                            {
                                BindingStatus::Active
                            } else {
                                BindingStatus::RegistrationFailed
                            }
                        }
                        Trigger::ModifierDoubleTap { .. } => match self.monitor {
                            MonitorStatus::Active => BindingStatus::Active,
                            MonitorStatus::PermissionRequired => BindingStatus::PermissionRequired,
                            MonitorStatus::Unavailable => BindingStatus::MonitorUnavailable,
                        },
                    }
                };
                BindingState { target, status }
            })
            .collect::<Vec<_>>();
        Snapshot {
            configuration: self.configuration.clone(),
            recovery_degraded: !self.recovery_available(),
            bindings,
            diagnostics: self.diagnostics.clone(),
            key_labels: self.registry.key_labels(),
            launcher_migration: self.launcher_migration.clone(),
            detach_migration: self.detach_migration.clone(),
        }
    }

    fn available(&self, target: &str) -> bool {
        (target == LAUNCHER && self.launcher_migration.is_none()) || self.targets.contains(target)
    }

    fn publish(&mut self) {
        self.registry.publish(
            &self
                .registrations
                .iter()
                .map(|(trigger, entry)| (trigger.clone(), entry.generation))
                .collect(),
        );
        let launcher = &self.configuration.launcher;
        let confirmed = !self.diagnostics.contains(&"storage_uncertain")
            && self.launcher_migration.is_none()
            && !self.residual.contains(launcher)
            && (matches!(launcher, Trigger::ModifierDoubleTap { .. })
                || self
                    .registrations
                    .get(launcher)
                    .is_some_and(|binding| binding.target == LAUNCHER));
        self.admission
            .publish_selected(confirmed.then_some(launcher));
    }

    fn suspend_publication(&mut self) {
        self.admission.publish_selected(None);
        self.registry.publish(&BTreeMap::new());
    }

    fn reconcile_publication(&mut self, desired: &BTreeMap<Trigger, String>) {
        if self.residual.is_empty()
            && self.registrations.len() == desired.len()
            && desired.iter().all(|(trigger, target)| {
                self.registrations
                    .get(trigger)
                    .is_some_and(|binding| &binding.target == target)
            })
        {
            return;
        }
        self.suspend_publication();
        self.reconcile(desired);
        self.publish();
    }

    fn desired(&self, configuration: &Configuration) -> BTreeMap<Trigger, String> {
        if self.diagnostics.contains(&"storage_uncertain") {
            return BTreeMap::new();
        }
        self.eligible(configuration)
            .into_iter()
            .filter(|(_, target)| target != LAUNCHER || self.launcher_migration.is_none())
            .collect()
    }

    fn eligible(&self, configuration: &Configuration) -> BTreeMap<Trigger, String> {
        configuration
            .bindings()
            .into_iter()
            .filter(|(target, trigger)| {
                (target == LAUNCHER || self.targets.contains(target))
                    && matches!(trigger, Trigger::Chord { .. })
                    && self.registry.valid_in_layout(trigger)
            })
            .map(|(target, trigger)| (trigger, target))
            .collect()
    }

    fn install(&mut self, trigger: Trigger, target: String) -> Result<(), ()> {
        self.generation = self.generation.checked_add(1).ok_or(())?;
        match self.registry.register(&trigger, self.generation) {
            Ok(()) => {
                self.residual.remove(&trigger);
                self.registrations.insert(
                    trigger,
                    Registration {
                        target,
                        generation: self.generation,
                    },
                );
                Ok(())
            }
            Err(RegistrationFailure::Rejected) => Err(()),
            Err(RegistrationFailure::Uncertain) => {
                self.residual.insert(trigger);
                Err(())
            }
        }
    }

    fn remove(&mut self, trigger: &Trigger) -> Result<(), ()> {
        // On failure neither the OS ownership nor the callback remains trusted.
        self.registrations.remove(trigger);
        match self.registry.unregister(trigger) {
            Ok(()) => {
                self.residual.remove(trigger);
                Ok(())
            }
            Err(()) => {
                self.residual.insert(trigger.clone());
                Err(())
            }
        }
    }

    fn reconcile(&mut self, desired: &BTreeMap<Trigger, String>) -> bool {
        let mut succeeded = true;
        let stale = self
            .registrations
            .iter()
            .filter(|(trigger, entry)| desired.get(*trigger) != Some(&entry.target))
            .map(|(trigger, _)| trigger.clone())
            .chain(self.residual.iter().cloned())
            .collect::<BTreeSet<_>>();
        for trigger in stale {
            if self.remove(&trigger).is_err() {
                succeeded = false;
            }
        }
        for (trigger, target) in desired {
            if !self.registrations.contains_key(trigger) {
                if self.residual.contains(trigger)
                    || self.install(trigger.clone(), target.clone()).is_err()
                {
                    succeeded = false;
                }
            }
        }
        succeeded
    }

    #[cfg(test)]
    pub fn save(
        &mut self,
        expected_revision: u64,
        configuration: Configuration,
    ) -> Result<Snapshot, ShortcutError> {
        self.save_resolving_migrations(expected_revision, configuration, false, false)
    }

    #[cfg(test)]
    pub fn save_resolving_migration(
        &mut self,
        expected_revision: u64,
        configuration: Configuration,
        resolve_launcher_migration: bool,
    ) -> Result<Snapshot, ShortcutError> {
        self.save_resolving_migrations(
            expected_revision,
            configuration,
            resolve_launcher_migration,
            false,
        )
    }

    pub fn save_resolving_migrations(
        &mut self,
        expected_revision: u64,
        configuration: Configuration,
        resolve_launcher_migration: bool,
        resolve_detach_migration: bool,
    ) -> Result<Snapshot, ShortcutError> {
        let fail = |code| ShortcutError::new(code);
        if expected_revision != self.configuration.revision
            || configuration.revision != expected_revision
        {
            return Err(fail("revision_conflict").with_snapshot(self.snapshot()));
        }
        if self.launcher_migration.is_some() && !resolve_launcher_migration {
            return Err(fail("launcher_choice_required").with_snapshot(self.snapshot()));
        }
        if self.detach_migration.is_some()
            && !resolve_detach_migration
            && configuration.detach != self.configuration.detach
        {
            return Err(fail("detach_choice_required").with_snapshot(self.snapshot()));
        }
        let candidate_detach_migration = if resolve_detach_migration {
            None
        } else {
            self.detach_migration.clone()
        };
        let mut candidate = configuration.clone().normalized().map_err(|mut error| {
            if error.code == "conflicting_trigger" {
                let previous = self.configuration.all_bindings();
                let normalized = configuration
                    .all_bindings()
                    .into_iter()
                    .filter_map(|(target, trigger)| {
                        trigger.normalized().ok().map(|trigger| (target, trigger))
                    })
                    .collect::<BTreeMap<_, _>>();
                // Identify the unchanged occupant, rather than blaming the edited
                // target merely because its identifier sorts first.
                if let Some((target, _)) = normalized.iter().find(|(target, trigger)| {
                    previous.get(*target) == Some(*trigger)
                        && normalized
                            .iter()
                            .any(|(other, value)| other != *target && value == *trigger)
                }) {
                    error.conflicting_target = Some(target.clone());
                }
            }
            error.with_snapshot(self.snapshot())
        })?;
        if candidate
            .all_bindings()
            .values()
            .any(|trigger| !self.registry.valid_in_layout(trigger))
        {
            return Err(fail("reserved_trigger").with_snapshot(self.snapshot()));
        }
        if candidate == self.configuration
            && candidate_detach_migration == self.detach_migration
            && !self.legacy_file
            && self.diagnostics.is_empty()
            && self.residual.is_empty()
        {
            return Ok(self.snapshot());
        }
        candidate.revision = expected_revision
            .checked_add(1)
            .filter(|revision| *revision <= MAX_SAFE_INTEGER)
            .ok_or_else(|| fail("revision_conflict").with_snapshot(self.snapshot()))?;
        if self
            .store
            .stage(&candidate, candidate_detach_migration.as_ref())
            .is_err()
        {
            self.store.discard();
            return Err(fail("storage_failed").with_snapshot(self.snapshot()));
        }
        self.end_recording();
        self.suppressed_until_release = !self.pressed.is_empty() || !self.local_pressed.is_empty();
        self.suspend_publication();
        self.fail_pending("stale_binding");
        let previous = self.configuration.clone();
        let previous_desired = self.desired(&previous);
        let next_desired = self.eligible(&candidate);
        let mut error = None;
        // Pre-register genuinely new keys while the old recovery registration remains.
        for (trigger, target) in &next_desired {
            if !previous_desired.contains_key(trigger)
                && self.install(trigger.clone(), target.clone()).is_err()
            {
                error = Some("registration_failed");
                break;
            }
        }
        if error.is_none() {
            for (trigger, target) in &previous_desired {
                if next_desired.get(trigger) != Some(target) && self.remove(trigger).is_err() {
                    error = Some("unregistration_failed");
                    break;
                }
            }
        }
        if error.is_none() {
            for (trigger, target) in &next_desired {
                if !self
                    .registrations
                    .get(trigger)
                    .is_some_and(|entry| &entry.target == target)
                    && self.install(trigger.clone(), target.clone()).is_err()
                {
                    error = Some("registration_failed");
                    break;
                }
            }
        }
        if error.is_none() {
            if self.store.commit().is_ok() {
                self.configuration = candidate;
                self.legacy_file = false;
                self.launcher_migration = None;
                self.detach_migration = candidate_detach_migration;
                self.diagnostics.clear();
                self.store.discard();
                self.publish();
                return Ok(self.snapshot());
            }
            error = Some("storage_failed");
            // A failed rename/fsync may have committed. Never overwrite an uncertain file.
            match self.store.read() {
                actual
                    if actual
                        == Stored::current(
                            candidate.clone(),
                            candidate_detach_migration.clone(),
                        ) =>
                {
                    self.configuration = candidate;
                    self.legacy_file = false;
                    self.launcher_migration = None;
                    self.detach_migration = candidate_detach_migration;
                    self.diagnostics = vec!["commit_reconciled"];
                    self.store.discard();
                    self.publish();
                    return Err(fail("storage_failed").with_snapshot(self.snapshot()));
                }
                actual
                    if actual
                        == Stored::current(previous.clone(), self.detach_migration.clone())
                        && !self.legacy_file => {}
                Stored::VersionTwo {
                    configuration: actual,
                    migration,
                } if self.legacy_file
                    && actual == previous
                    && migration == self.detach_migration => {}
                Stored::VersionOne {
                    configuration: actual,
                    migration,
                    detach_migration,
                } if self.legacy_file
                    && actual == previous
                    && migration == self.launcher_migration
                    && detach_migration == self.detach_migration => {}
                Stored::Missing if previous.revision == 0 && !self.legacy_file => {}
                _ => {
                    self.diagnostics = vec!["storage_uncertain"];
                    self.store.discard();
                    // No configuration can be safely claimed as current; disable dispatch and hiding.
                    let keys = self.registrations.keys().cloned().collect::<Vec<_>>();
                    for trigger in keys {
                        let _ = self.remove(&trigger);
                    }
                    return Err(fail("degraded").with_snapshot(self.snapshot()));
                }
            }
        }
        let compensated = self.reconcile(&previous_desired);
        self.store.discard();
        if !compensated {
            self.diagnostics = vec!["compensation_failed"];
        }
        self.publish();
        Err(fail(if compensated {
            error.unwrap_or("storage_failed")
        } else {
            "degraded"
        })
        .with_snapshot(self.snapshot()))
    }

    pub fn update_targets(&mut self, targets: BTreeSet<String>) -> Result<Snapshot, ShortcutError> {
        if targets.len() > 4096 || targets.iter().any(|id| !valid_action_id(id)) {
            return Err(ShortcutError::new("invalid_configuration"));
        }
        self.targets = targets;
        let desired = self.desired(&self.configuration);
        self.reconcile_publication(&desired);
        let stale = self
            .pending
            .iter()
            .filter(|(_, (invocation, _))| !self.targets.contains(&invocation.action_id))
            .map(|(id, _)| *id)
            .collect::<Vec<_>>();
        for id in stale {
            self.pending.remove(&id);
            self.queue_failure(id, "target_unavailable");
        }
        Ok(self.snapshot())
    }

    pub fn set_monitor(&mut self, status: MonitorStatus) -> bool {
        let changed = self.monitor != status;
        self.monitor = status;
        self.admission.set_monitor(status == MonitorStatus::Active);
        changed
    }
    pub fn local_availability(&self) -> LocalMonitorAvailability {
        self.local_available.clone()
    }
    pub fn admission(&self) -> ShortcutAdmission {
        self.admission.clone()
    }
    #[cfg(test)]
    pub fn set_local_available(&self, available: bool) -> bool {
        self.local_available.set(available)
    }
    pub fn local_available(&self) -> bool {
        self.local_available.available()
            && !self.diagnostics.contains(&"storage_uncertain")
            && self
                .configuration
                .detach
                .as_ref()
                .is_none_or(|trigger| self.registry.valid_in_layout(trigger))
    }
    pub fn recovery_available(&self) -> bool {
        self.admission.recovery_available()
    }
    pub fn detach(&self) -> Option<Trigger> {
        self.configuration.detach.clone()
    }
    pub fn configuration_revision(&self) -> u64 {
        self.configuration.revision
    }
    pub fn suppressed_until_release(&self) -> bool {
        self.suppressed_until_release
    }

    /// Local candidates share held-chord identity with registered global
    /// callbacks. Keys remain claimed through lease revocation until release.
    pub fn local_recording_press(
        &mut self,
        key: u16,
        trigger: Option<&Trigger>,
        down: bool,
        repeat: bool,
        expected_epoch: u64,
        now: u64,
    ) -> (bool, Effect) {
        self.expire(now);
        if !down {
            let captured = self.local_pressed.remove(&key);
            if let Some(Some(trigger)) = &captured {
                if !self.pressed.iter().any(|(pressed, _)| pressed == trigger) {
                    self.recording_chords.remove(trigger);
                }
            }
            if self.local_pressed.is_empty() && self.pressed.is_empty() {
                self.suppressed_until_release = false;
            }
            return (captured.is_some(), Effect::None);
        }
        if self.local_pressed.contains_key(&key) {
            return (true, Effect::None);
        }
        if self.recording_epoch != expected_epoch || self.recording.is_none() {
            return (false, Effect::None);
        }
        let trigger = trigger
            .and_then(|trigger| trigger.normalized().ok())
            .filter(|trigger| matches!(trigger, Trigger::Chord { .. }));
        self.local_pressed.insert(key, trigger.clone());
        let effect = if repeat {
            Effect::None
        } else {
            trigger
                .map(|trigger| self.recording_candidate(&trigger))
                .unwrap_or(Effect::None)
        };
        (true, effect)
    }
    pub fn refresh_layout(&mut self) {
        let desired = self.desired(&self.configuration);
        self.reconcile_publication(&desired);
    }
    pub fn wants_monitor(&self) -> bool {
        self.configuration
            .bindings()
            .values()
            .any(|trigger| matches!(trigger, Trigger::ModifierDoubleTap { .. }))
            || self.recording.is_some()
    }
    pub fn begin_recording(&mut self, now: u64) -> RecordingLease {
        self.end_recording();
        self.fail_pending("delivery_failed");
        self.lease_sequence += 1;
        self.recording_epoch += 1;
        let lease = RecordingLease {
            lease_id: format!("recording_{}", self.lease_sequence),
            expires_at: now.saturating_add(30_000),
        };
        self.recording = Some(lease.clone());
        self.admission.publish_recording(lease.expires_at);
        lease
    }
    pub fn renew_recording(
        &mut self,
        lease_id: &str,
        now: u64,
    ) -> Result<RecordingLease, ShortcutError> {
        self.expire(now);
        let lease = self
            .recording
            .as_mut()
            .filter(|lease| lease.lease_id == lease_id)
            .ok_or_else(|| ShortcutError::new("recording_unavailable"))?;
        lease.expires_at = now.saturating_add(30_000);
        self.admission.publish_recording(lease.expires_at);
        Ok(lease.clone())
    }
    pub fn recording(&self) -> Option<&RecordingLease> {
        self.recording.as_ref()
    }
    pub fn recording_epoch(&self) -> u64 {
        self.recording_epoch
    }
    pub fn end_recording(&mut self) -> Option<RecordingLease> {
        let lease = self.recording.take();
        if lease.is_some() {
            self.admission.publish_recording(0);
            self.recording_epoch += 1;
            self.suppressed_until_release =
                !self.pressed.is_empty() || !self.local_pressed.is_empty();
            if !self.suppressed_until_release {
                self.recording_chords.clear();
            }
        }
        lease
    }
    pub fn expire(&mut self, now: u64) {
        if self
            .recording
            .as_ref()
            .is_some_and(|lease| now >= lease.expires_at)
        {
            self.end_recording();
        }
        let expired = self
            .pending
            .iter()
            .filter(|(_, (_, deadline))| now >= *deadline)
            .map(|(id, _)| *id)
            .collect::<Vec<_>>();
        for id in expired {
            self.pending.remove(&id);
            self.queue_failure(id, "expired");
        }
    }
    pub fn take_failures(&mut self) -> Vec<Failure> {
        std::mem::take(&mut self.failures)
    }
    pub fn delivery_failed(&mut self, id: u64) {
        if self.pending.remove(&id).is_some() {
            self.queue_failure(id, "delivery_failed");
        }
    }
    fn queue_failure(&mut self, invocation_id: u64, code: &'static str) {
        // Busy inputs were never admitted. Keep their latest safe feedback, while
        // retaining the outcome of every admitted invocation until Host readiness.
        if code == "busy" {
            self.failures.retain(|failure| failure.code != "busy");
        }
        self.failures.push(Failure {
            invocation_id,
            code,
        });
    }
    fn fail_pending(&mut self, code: &'static str) {
        for invocation_id in self.pending.keys().copied().collect::<Vec<_>>() {
            self.queue_failure(invocation_id, code);
        }
        self.pending.clear();
    }
    pub fn ready(&mut self, ready: bool, now: u64) -> Vec<Invocation> {
        self.expire(now);
        self.host_ready = ready;
        if !ready {
            self.end_recording();
        }
        if ready {
            self.pending
                .values()
                .map(|(invocation, _)| invocation.clone())
                .collect()
        } else {
            vec![]
        }
    }
    pub fn acknowledge(&mut self, id: u64, accepted: bool, now: u64) -> bool {
        self.expire(now);
        self.pending.remove(&id).is_some_and(|(invocation, _)| {
            accepted
                && invocation.binding_revision == self.configuration.revision
                && self.targets.contains(&invocation.action_id)
        })
    }
    pub fn press(&mut self, trigger: &Trigger, generation: u64, pressed: bool, now: u64) -> Effect {
        self.expire(now);
        let identity = (trigger.clone(), generation);
        if !pressed {
            // Re-registration while held changes generation but not the physical key.
            self.pressed.retain(|(existing, _)| existing != trigger);
            if !self
                .local_pressed
                .values()
                .any(|held| held.as_ref() == Some(trigger))
            {
                self.recording_chords.remove(trigger);
            }
            if self.pressed.is_empty() && self.local_pressed.is_empty() {
                self.suppressed_until_release = false;
            }
            return Effect::None;
        }
        if !self
            .registrations
            .get(trigger)
            .is_some_and(|entry| entry.generation == generation)
            || !self.pressed.insert(identity)
            || self.suppressed_until_release
        {
            return Effect::None;
        }
        self.trigger(trigger, now)
    }
    pub fn trigger(&mut self, trigger: &Trigger, now: u64) -> Effect {
        let recording_epoch = self.recording_epoch;
        self.expire(now);
        if recording_epoch != self.recording_epoch
            || self.diagnostics.contains(&"storage_uncertain")
        {
            return Effect::None;
        }
        if self.recording.is_some() {
            return self.recording_candidate(trigger);
        }
        if self.suppressed_until_release {
            return Effect::None;
        }
        if matches!(trigger, Trigger::ModifierDoubleTap { .. })
            && self.monitor != MonitorStatus::Active
        {
            return Effect::None;
        }
        let target = self
            .configuration
            .bindings()
            .into_iter()
            .find_map(|(target, configured)| {
                (configured == *trigger && self.available(&target)).then_some(target)
            });
        let Some(target) = target else {
            return Effect::None;
        };
        if target == LAUNCHER {
            return Effect::Toggle;
        }
        self.invocation_sequence += 1;
        let invocation_id = self.invocation_sequence;
        if self.pending.len()
            + self
                .failures
                .iter()
                .filter(|failure| failure.code != "busy")
                .count()
            >= 32
        {
            self.queue_failure(invocation_id, "busy");
            return Effect::None;
        }
        let invocation = Invocation {
            invocation_id,
            binding_revision: self.configuration.revision,
            action_id: target,
        };
        self.pending.insert(
            invocation_id,
            (invocation.clone(), now.saturating_add(10_000)),
        );
        Effect::Action(invocation)
    }

    fn recording_candidate(&mut self, trigger: &Trigger) -> Effect {
        if matches!(trigger, Trigger::Chord { .. })
            && !self.recording_chords.insert(trigger.clone())
        {
            return Effect::None;
        }
        Effect::Candidate {
            lease_id: self.recording.as_ref().unwrap().lease_id.clone(),
            trigger: trigger.clone(),
        }
    }
}

#[cfg(test)]
mod tests;
