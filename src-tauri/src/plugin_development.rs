use crate::{
    launcher_window::begin_launcher_native_dialog,
    plugin_development_snapshot::{
        DevelopmentSnapshotFailure, DevelopmentSnapshotStore, PublishedDevelopmentSnapshot,
    },
    plugin_manager::{
        PluginManager, PluginManagerDiagnostic, PluginManagerDiagnosticCode,
        PluginManagerLifecycleEntry, PluginRegistrationFacts,
    },
    plugin_registration::{
        emit_plugin_registration_changed, healthy_entry_id, is_valid_plugin_registration_entry_id,
        PluginRegistrationEventEmitter, PluginRegistrationSource, PluginRegistrationSummary,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    ffi::OsString,
    fmt, fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

pub const PLUGIN_DEVELOPMENT_CONTRACT_VERSION: &str = "0.1.0";
pub const PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV: &str = "LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginDevelopmentStartupConfig {
    root: PathBuf,
}

impl PluginDevelopmentStartupConfig {
    pub fn from_environment() -> Result<Option<Self>, PluginDevelopmentBootstrapError> {
        Self::from_value(std::env::var_os(PLUGIN_DEVELOPMENT_STARTUP_ROOT_ENV))
    }

    fn from_value(
        value: Option<OsString>,
    ) -> Result<Option<Self>, PluginDevelopmentBootstrapError> {
        let Some(value) = value else {
            return Ok(None);
        };
        let root = PathBuf::from(value);
        if !root.is_absolute() || root.as_os_str().is_empty() {
            return Err(PluginDevelopmentBootstrapError::new(
                PluginDevelopmentBootstrapErrorCode::InvalidConfig,
            ));
        }
        Ok(Some(Self { root }))
    }

    fn root(&self) -> &Path {
        &self.root
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PluginDevelopmentBootstrapErrorCode {
    InvalidConfig,
    Conflict,
    Infrastructure,
    AlreadyStarted,
}

impl PluginDevelopmentBootstrapErrorCode {
    fn as_str(self) -> &'static str {
        match self {
            Self::InvalidConfig => "invalid_config",
            Self::Conflict => "conflict",
            Self::Infrastructure => "infrastructure",
            Self::AlreadyStarted => "already_started",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginDevelopmentBootstrapError {
    code: PluginDevelopmentBootstrapErrorCode,
}

impl PluginDevelopmentBootstrapError {
    fn new(code: PluginDevelopmentBootstrapErrorCode) -> Self {
        Self { code }
    }
}

impl fmt::Display for PluginDevelopmentBootstrapError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "[plugin-development-bootstrap/{}] Plugin development bootstrap failed.",
            self.code.as_str()
        )
    }
}

impl std::error::Error for PluginDevelopmentBootstrapError {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PluginDevelopmentBootstrapDiagnosticCode {
    InvalidMember,
    RootUnavailable,
    Invalid,
    Incompatible,
    SourceChanged,
    Unsafe,
    Unavailable,
}

impl PluginDevelopmentBootstrapDiagnosticCode {
    fn as_str(self) -> &'static str {
        match self {
            Self::InvalidMember => "invalid_member",
            Self::RootUnavailable => "root_unavailable",
            Self::Invalid => "invalid",
            Self::Incompatible => "incompatible",
            Self::SourceChanged => "source_changed",
            Self::Unsafe => "unsafe",
            Self::Unavailable => "unavailable",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PluginDevelopmentBootstrapDiagnostic {
    member: String,
    code: PluginDevelopmentBootstrapDiagnosticCode,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PluginDevelopmentBootstrapSummary {
    loaded: usize,
    skipped: usize,
    loaded_members: Vec<String>,
    diagnostics: Vec<PluginDevelopmentBootstrapDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginDevelopmentCapabilitySnapshot {
    pub contract_version: String,
    pub supported: bool,
    pub enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
struct SetPluginDevelopmentModeRequest {
    contract_version: String,
    enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
struct PluginDevelopmentEntryRequest {
    contract_version: String,
    entry_id: String,
    expected_revision: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginDevelopmentOperation {
    ReadCapability,
    SetMode,
    Register,
    Reload,
    Remove,
    Cleanup,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginDevelopmentErrorCode {
    InvalidRequest,
    Disabled,
    Unavailable,
    Invalid,
    Incompatible,
    SourceChanged,
    Conflict,
    UnsafeState,
    CleanupPending,
    Internal,
}

impl PluginDevelopmentErrorCode {
    fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "The plugin development request is invalid.",
            Self::Disabled => "Plugin Development Mode is disabled.",
            Self::Unavailable => "Plugin Development Mode is unavailable.",
            Self::Invalid => "The selected development directory is invalid.",
            Self::Incompatible => {
                "The selected plugin is not compatible with this version of lensX."
            }
            Self::SourceChanged => "The development directory changed while it was being read.",
            Self::Conflict => "Plugin development state changed before the operation completed.",
            Self::UnsafeState => "Plugin development storage state is unsafe.",
            Self::CleanupPending => {
                "The operation completed, but snapshot cleanup is still pending."
            }
            Self::Internal => "The plugin development operation failed.",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginDevelopmentError {
    pub contract_version: String,
    pub code: PluginDevelopmentErrorCode,
    pub operation: PluginDevelopmentOperation,
    pub message: String,
}

impl PluginDevelopmentError {
    fn new(code: PluginDevelopmentErrorCode, operation: PluginDevelopmentOperation) -> Self {
        Self {
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
            code,
            operation,
            message: code.message().to_owned(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginDevelopmentCleanupStatus {
    Complete,
    Pending,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginDevelopmentResult {
    Cancelled {
        contract_version: String,
    },
    ModeUpdated {
        contract_version: String,
        enabled: bool,
        changed: bool,
    },
    Registered {
        contract_version: String,
        entry_id: String,
        plugin_id: String,
        version: String,
        revision: String,
    },
    Reloaded {
        contract_version: String,
        entry_id: String,
        plugin_id: String,
        version: String,
        revision: String,
        cleanup: PluginDevelopmentCleanupStatus,
    },
    Removed {
        contract_version: String,
        revision: String,
        cleanup: PluginDevelopmentCleanupStatus,
    },
}

impl PluginDevelopmentResult {
    fn mode_updated(enabled: bool, changed: bool) -> Self {
        Self::ModeUpdated {
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
            enabled,
            changed,
        }
    }

    fn cancelled() -> Self {
        Self::Cancelled {
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
        }
    }
}

struct PluginDevelopmentCoordinator {
    manager: Arc<PluginManager>,
    snapshots: Arc<DevelopmentSnapshotStore>,
}

pub struct PluginDevelopmentModeState {
    enabled: Mutex<bool>,
    operation: Mutex<()>,
    bootstrap_started: Mutex<bool>,
    coordinator: Option<PluginDevelopmentCoordinator>,
}

impl Default for PluginDevelopmentModeState {
    fn default() -> Self {
        Self {
            enabled: Mutex::new(false),
            operation: Mutex::new(()),
            bootstrap_started: Mutex::new(false),
            coordinator: None,
        }
    }
}

impl PluginDevelopmentModeState {
    fn lock_enabled(&self) -> MutexGuard<'_, bool> {
        self.enabled
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn lock_operation(&self) -> MutexGuard<'_, ()> {
        self.operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn begin_bootstrap(&self) -> Result<(), PluginDevelopmentBootstrapError> {
        let mut started = self
            .bootstrap_started
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if *started {
            return Err(PluginDevelopmentBootstrapError::new(
                PluginDevelopmentBootstrapErrorCode::AlreadyStarted,
            ));
        }
        *started = true;
        Ok(())
    }

    fn coordinator(
        &self,
        operation: PluginDevelopmentOperation,
    ) -> Result<&PluginDevelopmentCoordinator, PluginDevelopmentError> {
        self.coordinator.as_ref().ok_or_else(|| {
            PluginDevelopmentError::new(PluginDevelopmentErrorCode::Unavailable, operation)
        })
    }

    pub fn capability_snapshot(&self) -> PluginDevelopmentCapabilitySnapshot {
        PluginDevelopmentCapabilitySnapshot {
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
            supported: true,
            enabled: *self.lock_enabled(),
        }
    }

    pub fn is_enabled(&self) -> bool {
        *self.lock_enabled()
    }

    pub(crate) fn snapshot_store(&self) -> Option<Arc<DevelopmentSnapshotStore>> {
        self.coordinator
            .as_ref()
            .map(|coordinator| Arc::clone(&coordinator.snapshots))
    }

    fn update(
        &self,
        enabled: bool,
        quiesce: impl FnOnce() -> Result<(), PluginDevelopmentError>,
    ) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
        let mut current = self.lock_enabled();
        if *current == enabled {
            return Ok(PluginDevelopmentResult::mode_updated(enabled, false));
        }
        if !enabled {
            quiesce()?;
        }
        *current = enabled;
        Ok(PluginDevelopmentResult::mode_updated(enabled, true))
    }

    fn require_enabled(
        &self,
        operation: PluginDevelopmentOperation,
    ) -> Result<(), PluginDevelopmentError> {
        self.is_enabled().then_some(()).ok_or_else(|| {
            PluginDevelopmentError::new(PluginDevelopmentErrorCode::Disabled, operation)
        })
    }
}

fn is_revision(value: &str) -> bool {
    value == "0"
        || (value
            .bytes()
            .next()
            .is_some_and(|byte| matches!(byte, b'1'..=b'9'))
            && value.bytes().all(|byte| byte.is_ascii_digit()))
}

fn map_snapshot_failure(
    failure: DevelopmentSnapshotFailure,
    operation: PluginDevelopmentOperation,
) -> PluginDevelopmentError {
    let code = match failure {
        DevelopmentSnapshotFailure::Invalid => PluginDevelopmentErrorCode::Invalid,
        DevelopmentSnapshotFailure::Incompatible => PluginDevelopmentErrorCode::Incompatible,
        DevelopmentSnapshotFailure::SourceChanged => PluginDevelopmentErrorCode::SourceChanged,
        DevelopmentSnapshotFailure::Unsafe => PluginDevelopmentErrorCode::UnsafeState,
        DevelopmentSnapshotFailure::Unavailable => PluginDevelopmentErrorCode::Unavailable,
        DevelopmentSnapshotFailure::Internal => PluginDevelopmentErrorCode::Internal,
    };
    PluginDevelopmentError::new(code, operation)
}

fn map_manager_failure(
    failure: PluginManagerDiagnostic,
    operation: PluginDevelopmentOperation,
) -> PluginDevelopmentError {
    let code = match failure.code() {
        PluginManagerDiagnosticCode::DuplicateIdentity
        | PluginManagerDiagnosticCode::IdentityMismatch
        | PluginManagerDiagnosticCode::InvalidState
        | PluginManagerDiagnosticCode::NotFound
        | PluginManagerDiagnosticCode::StaleRevision => PluginDevelopmentErrorCode::Conflict,
        PluginManagerDiagnosticCode::StoreUnavailable
        | PluginManagerDiagnosticCode::PersistFailed => PluginDevelopmentErrorCode::Unavailable,
        PluginManagerDiagnosticCode::InvalidRegistration
        | PluginManagerDiagnosticCode::RecordUnreadable
        | PluginManagerDiagnosticCode::RecordInvalid
        | PluginManagerDiagnosticCode::UnsupportedFormatVersion => {
            PluginDevelopmentErrorCode::Internal
        }
    };
    PluginDevelopmentError::new(code, operation)
}

fn development_facts(
    snapshot: &PublishedDevelopmentSnapshot,
    source_directory: std::path::PathBuf,
    enabled: bool,
    operation: PluginDevelopmentOperation,
) -> Result<PluginRegistrationFacts, PluginDevelopmentError> {
    PluginRegistrationFacts::development(
        snapshot.root.clone(),
        snapshot.identity.clone(),
        source_directory,
        enabled,
    )
    .map_err(|failure| map_manager_failure(failure, operation))
}

struct PreparedDevelopmentCandidate {
    member: String,
    source_directory: PathBuf,
    snapshot: PublishedDevelopmentSnapshot,
}

fn portable_member_label(value: &OsString) -> Option<String> {
    let value = value.to_str()?;
    let normalized = value.to_ascii_lowercase();
    let stem = normalized.split('.').next().unwrap_or_default();
    let reserved = matches!(
        stem,
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    );
    (!value.is_empty()
        && value.len() <= 128
        && !value.starts_with('.')
        && !value.ends_with(['.', ' '])
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        && !reserved)
        .then_some(value.to_owned())
}

fn bootstrap_diagnostic_code(
    failure: &DevelopmentSnapshotFailure,
) -> PluginDevelopmentBootstrapDiagnosticCode {
    match failure {
        DevelopmentSnapshotFailure::Invalid => PluginDevelopmentBootstrapDiagnosticCode::Invalid,
        DevelopmentSnapshotFailure::Incompatible => {
            PluginDevelopmentBootstrapDiagnosticCode::Incompatible
        }
        DevelopmentSnapshotFailure::SourceChanged => {
            PluginDevelopmentBootstrapDiagnosticCode::SourceChanged
        }
        DevelopmentSnapshotFailure::Unsafe => PluginDevelopmentBootstrapDiagnosticCode::Unsafe,
        DevelopmentSnapshotFailure::Unavailable | DevelopmentSnapshotFailure::Internal => {
            PluginDevelopmentBootstrapDiagnosticCode::Unavailable
        }
    }
}

fn report_bootstrap_summary(summary: &PluginDevelopmentBootstrapSummary) {
    for member in &summary.loaded_members {
        eprintln!(
            "[lensx/plugin-development-bootstrap] member={} status=loaded",
            member
        );
    }
    for diagnostic in &summary.diagnostics {
        eprintln!(
            "[lensx/plugin-development-bootstrap] member={} status=skipped code={}",
            diagnostic.member,
            diagnostic.code.as_str()
        );
    }
    eprintln!(
        "[lensx/plugin-development-bootstrap] loaded={} skipped={}",
        summary.loaded, summary.skipped
    );
}

impl PluginDevelopmentCoordinator {
    fn prepare_startup_candidates(
        &self,
        root: &Path,
        summary: &mut PluginDevelopmentBootstrapSummary,
    ) -> Result<Vec<PreparedDevelopmentCandidate>, PluginDevelopmentBootstrapError> {
        let entries = match fs::read_dir(root) {
            Ok(entries) => entries,
            Err(_) => {
                summary
                    .diagnostics
                    .push(PluginDevelopmentBootstrapDiagnostic {
                        member: "root".to_owned(),
                        code: PluginDevelopmentBootstrapDiagnosticCode::RootUnavailable,
                    });
                return Ok(Vec::new());
            }
        };
        let mut discovered = Vec::new();
        for entry in entries {
            let Ok(entry) = entry else {
                summary.skipped += 1;
                summary
                    .diagnostics
                    .push(PluginDevelopmentBootstrapDiagnostic {
                        member: "unreadable".to_owned(),
                        code: PluginDevelopmentBootstrapDiagnosticCode::Unavailable,
                    });
                continue;
            };
            let raw_label = entry.file_name();
            if raw_label.to_string_lossy().starts_with('.') {
                continue;
            }
            let Some(member) = portable_member_label(&raw_label) else {
                summary.skipped += 1;
                summary
                    .diagnostics
                    .push(PluginDevelopmentBootstrapDiagnostic {
                        member: "invalid".to_owned(),
                        code: PluginDevelopmentBootstrapDiagnosticCode::InvalidMember,
                    });
                continue;
            };
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => {
                    summary.skipped += 1;
                    summary
                        .diagnostics
                        .push(PluginDevelopmentBootstrapDiagnostic {
                            member,
                            code: PluginDevelopmentBootstrapDiagnosticCode::Unavailable,
                        });
                    continue;
                }
            };
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }
            let dist = entry.path().join("dist");
            let metadata = match fs::symlink_metadata(&dist) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(_) => {
                    summary.skipped += 1;
                    summary
                        .diagnostics
                        .push(PluginDevelopmentBootstrapDiagnostic {
                            member,
                            code: PluginDevelopmentBootstrapDiagnosticCode::Unavailable,
                        });
                    continue;
                }
            };
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                summary.skipped += 1;
                summary
                    .diagnostics
                    .push(PluginDevelopmentBootstrapDiagnostic {
                        member,
                        code: PluginDevelopmentBootstrapDiagnosticCode::Unsafe,
                    });
                continue;
            }
            discovered.push((member, dist));
        }
        discovered.sort_by(|left, right| left.0.cmp(&right.0));

        let mut prepared = Vec::new();
        for (member, source_directory) in discovered {
            match self
                .snapshots
                .publish_from_source(&source_directory, &self.manager.host_versions())
            {
                Ok(snapshot) => prepared.push(PreparedDevelopmentCandidate {
                    member,
                    source_directory,
                    snapshot,
                }),
                Err(failure) => {
                    summary.skipped += 1;
                    summary
                        .diagnostics
                        .push(PluginDevelopmentBootstrapDiagnostic {
                            member,
                            code: bootstrap_diagnostic_code(&failure),
                        });
                }
            }
        }
        Ok(prepared)
    }

    fn discard_candidates(&self, candidates: &[PreparedDevelopmentCandidate]) {
        for candidate in candidates {
            self.snapshots.discard_uncommitted(&candidate.snapshot.root);
        }
    }

    fn preflight_startup_candidates(
        &self,
        candidates: &[PreparedDevelopmentCandidate],
    ) -> Result<(), PluginDevelopmentBootstrapError> {
        let mut plugin_ids = BTreeSet::new();
        for candidate in candidates {
            let plugin_id = &candidate.snapshot.manifest.plugin_id;
            if !plugin_ids.insert(plugin_id.clone()) || self.manager.has_plugin_identity(plugin_id)
            {
                self.discard_candidates(candidates);
                return Err(PluginDevelopmentBootstrapError::new(
                    PluginDevelopmentBootstrapErrorCode::Conflict,
                ));
            }
        }
        Ok(())
    }

    fn rollback_startup_candidates(
        &self,
        candidates: &[PreparedDevelopmentCandidate],
        committed_entry_ids: &[String],
    ) {
        for entry_id in committed_entry_ids.iter().rev() {
            let revision = self.manager.registration_revision();
            let _ = self.manager.remove_development_entry(entry_id, &revision);
        }
        self.discard_candidates(candidates);
    }

    fn commit_startup_candidates(
        &self,
        candidates: &[PreparedDevelopmentCandidate],
        summary: &mut PluginDevelopmentBootstrapSummary,
    ) -> Result<(), PluginDevelopmentBootstrapError> {
        let mut committed_entry_ids = Vec::new();
        for candidate in candidates {
            let operation = PluginDevelopmentOperation::Register;
            let facts = match development_facts(
                &candidate.snapshot,
                candidate.source_directory.clone(),
                true,
                operation,
            ) {
                Ok(facts) => facts,
                Err(_) => {
                    self.rollback_startup_candidates(candidates, &committed_entry_ids);
                    return Err(PluginDevelopmentBootstrapError::new(
                        PluginDevelopmentBootstrapErrorCode::Infrastructure,
                    ));
                }
            };
            let registration = crate::plugin_manager::PluginRegistration {
                manifest: candidate.snapshot.manifest.clone(),
                facts: facts.clone(),
                compatibility: candidate.snapshot.compatibility.clone(),
                runtime: crate::plugin_manager::PluginRuntimeState::Inactive,
            };
            let entry_id = healthy_entry_id(&registration);
            if let Err(failure) = self
                .manager
                .register_development(candidate.snapshot.manifest.clone(), facts)
            {
                self.rollback_startup_candidates(candidates, &committed_entry_ids);
                let code = if failure.code() == PluginManagerDiagnosticCode::DuplicateIdentity {
                    PluginDevelopmentBootstrapErrorCode::Conflict
                } else {
                    PluginDevelopmentBootstrapErrorCode::Infrastructure
                };
                return Err(PluginDevelopmentBootstrapError::new(code));
            }
            committed_entry_ids.push(entry_id);
            summary.loaded_members.push(candidate.member.clone());
        }
        summary.loaded = summary.loaded_members.len();
        Ok(())
    }

    fn bootstrap(
        &self,
        root: &Path,
    ) -> Result<PluginDevelopmentBootstrapSummary, PluginDevelopmentBootstrapError> {
        let mut summary = PluginDevelopmentBootstrapSummary::default();
        let candidates = self.prepare_startup_candidates(root, &mut summary)?;
        self.preflight_startup_candidates(&candidates)?;
        self.commit_startup_candidates(&candidates, &mut summary)?;
        summary.diagnostics.sort_by(|left, right| {
            left.member
                .cmp(&right.member)
                .then_with(|| left.code.as_str().cmp(right.code.as_str()))
        });
        Ok(summary)
    }

    fn register(
        &self,
        emitter: &impl PluginRegistrationEventEmitter,
        source_directory: std::path::PathBuf,
    ) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
        let operation = PluginDevelopmentOperation::Register;
        let snapshot = self
            .snapshots
            .publish_from_source(&source_directory, &self.manager.host_versions())
            .map_err(|failure| map_snapshot_failure(failure, operation))?;
        let facts = development_facts(&snapshot, source_directory, true, operation)?;
        let manifest = snapshot.manifest.clone();
        let registration = crate::plugin_manager::PluginRegistration {
            manifest: manifest.clone(),
            facts: facts.clone(),
            compatibility: snapshot.compatibility.clone(),
            runtime: crate::plugin_manager::PluginRuntimeState::Inactive,
        };
        let entry_id = healthy_entry_id(&registration);
        let change = match self.manager.register_development(manifest.clone(), facts) {
            Ok(change) => change,
            Err(failure) => {
                self.snapshots.discard_uncommitted(&snapshot.root);
                return Err(map_manager_failure(failure, operation));
            }
        };
        let _ = emit_plugin_registration_changed(emitter, &change);
        Ok(PluginDevelopmentResult::Registered {
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
            entry_id,
            plugin_id: manifest.plugin_id,
            version: manifest.version,
            revision: change.revision,
        })
    }

    fn reload(
        &self,
        emitter: &impl PluginRegistrationEventEmitter,
        request: PluginDevelopmentEntryRequest,
    ) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
        let operation = PluginDevelopmentOperation::Reload;
        let current = self
            .manager
            .resolve_lifecycle_entry(&request.entry_id, &request.expected_revision)
            .map_err(|failure| map_manager_failure(failure, operation))?;
        let PluginManagerLifecycleEntry::Healthy {
            registration: current,
            ..
        } = current
        else {
            return Err(PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::Conflict,
                operation,
            ));
        };
        let Some((old_root, old_identity, source_directory)) = current.facts.development_payload()
        else {
            return Err(PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::Conflict,
                operation,
            ));
        };
        if !self.snapshots.owns_current_snapshot(
            old_root,
            old_identity,
            &self.manager.host_versions(),
        ) {
            return Err(PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::UnsafeState,
                operation,
            ));
        }
        let old_root = old_root.to_path_buf();
        let source_directory = source_directory.to_path_buf();
        let snapshot = self
            .snapshots
            .publish_from_source(&source_directory, &self.manager.host_versions())
            .map_err(|failure| map_snapshot_failure(failure, operation))?;
        let facts = development_facts(
            &snapshot,
            source_directory,
            current.facts.enabled,
            operation,
        )?;
        let manifest = snapshot.manifest.clone();
        let replacement = match self.manager.reload_development_entry(
            &request.entry_id,
            &request.expected_revision,
            manifest.clone(),
            facts,
        ) {
            Ok(replacement) => replacement,
            Err(failure) => {
                self.snapshots.discard_uncommitted(&snapshot.root);
                return Err(map_manager_failure(failure, operation));
            }
        };
        let _ = emit_plugin_registration_changed(emitter, &replacement.change);
        let cleanup = if self.snapshots.retire(&old_root) {
            PluginDevelopmentCleanupStatus::Complete
        } else {
            PluginDevelopmentCleanupStatus::Pending
        };
        Ok(PluginDevelopmentResult::Reloaded {
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
            entry_id: request.entry_id,
            plugin_id: manifest.plugin_id,
            version: manifest.version,
            revision: replacement.change.revision,
            cleanup,
        })
    }

    fn remove(
        &self,
        emitter: &impl PluginRegistrationEventEmitter,
        request: PluginDevelopmentEntryRequest,
    ) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
        let operation = PluginDevelopmentOperation::Remove;
        let current = self
            .manager
            .resolve_lifecycle_entry(&request.entry_id, &request.expected_revision)
            .map_err(|failure| map_manager_failure(failure, operation))?;
        let PluginManagerLifecycleEntry::Healthy { registration, .. } = &current else {
            return Err(PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::Conflict,
                operation,
            ));
        };
        let Some((snapshot_root, snapshot_identity, _)) = registration.facts.development_payload()
        else {
            return Err(PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::Conflict,
                operation,
            ));
        };
        if !self.snapshots.owns_current_snapshot(
            snapshot_root,
            snapshot_identity,
            &self.manager.host_versions(),
        ) {
            return Err(PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::UnsafeState,
                operation,
            ));
        }
        let snapshot_root = snapshot_root.to_path_buf();
        let removal = self
            .manager
            .remove_development_entry(&request.entry_id, &request.expected_revision)
            .map_err(|failure| map_manager_failure(failure, operation))?;
        let _ = emit_plugin_registration_changed(emitter, &removal.change);
        let cleanup = if self.snapshots.retire(&snapshot_root) {
            PluginDevelopmentCleanupStatus::Complete
        } else {
            PluginDevelopmentCleanupStatus::Pending
        };
        Ok(PluginDevelopmentResult::Removed {
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
            revision: removal.change.revision,
            cleanup,
        })
    }

    fn quiesce(
        &self,
        emitter: &impl PluginRegistrationEventEmitter,
    ) -> Result<(), PluginDevelopmentError> {
        loop {
            let snapshot = self.manager.read_registration_snapshot();
            let next = snapshot.entries.into_iter().find_map(|entry| match entry {
                PluginRegistrationSummary::Registered {
                    entry_id,
                    source: PluginRegistrationSource::Development,
                    ..
                } => Some(entry_id),
                _ => None,
            });
            let Some(entry_id) = next else {
                return Ok(());
            };
            self.remove(
                emitter,
                PluginDevelopmentEntryRequest {
                    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
                    entry_id,
                    expected_revision: snapshot.revision,
                },
            )?;
        }
    }
}

fn parse_mode_request(
    value: Value,
) -> Result<SetPluginDevelopmentModeRequest, PluginDevelopmentError> {
    let request =
        serde_json::from_value::<SetPluginDevelopmentModeRequest>(value).map_err(|_| {
            PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::InvalidRequest,
                PluginDevelopmentOperation::SetMode,
            )
        })?;
    if request.contract_version != PLUGIN_DEVELOPMENT_CONTRACT_VERSION {
        return Err(PluginDevelopmentError::new(
            PluginDevelopmentErrorCode::InvalidRequest,
            PluginDevelopmentOperation::SetMode,
        ));
    }
    Ok(request)
}

fn parse_entry_request(
    value: Value,
    operation: PluginDevelopmentOperation,
) -> Result<PluginDevelopmentEntryRequest, PluginDevelopmentError> {
    let request = serde_json::from_value::<PluginDevelopmentEntryRequest>(value).map_err(|_| {
        PluginDevelopmentError::new(PluginDevelopmentErrorCode::InvalidRequest, operation)
    })?;
    if request.contract_version != PLUGIN_DEVELOPMENT_CONTRACT_VERSION
        || !is_valid_plugin_registration_entry_id(&request.entry_id)
        || !is_revision(&request.expected_revision)
    {
        return Err(PluginDevelopmentError::new(
            PluginDevelopmentErrorCode::InvalidRequest,
            operation,
        ));
    }
    Ok(request)
}

#[tauri::command]
pub fn read_plugin_development_capability(
    state: State<'_, Arc<PluginDevelopmentModeState>>,
) -> PluginDevelopmentCapabilitySnapshot {
    state.capability_snapshot()
}

#[tauri::command]
pub fn set_plugin_development_mode<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<PluginDevelopmentModeState>>,
    request: Value,
) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
    let request = parse_mode_request(request)?;
    let _operation = state.lock_operation();
    state.update(request.enabled, || {
        state
            .coordinator(PluginDevelopmentOperation::SetMode)?
            .quiesce(&app)
    })
}

#[tauri::command]
pub async fn register_plugin_development_directory<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<PluginDevelopmentModeState>>,
) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
    let _operation = state.lock_operation();
    state.require_enabled(PluginDevelopmentOperation::Register)?;
    let Some((_dialog_guard, parent)) = begin_launcher_native_dialog(&app) else {
        return Err(PluginDevelopmentError::new(
            PluginDevelopmentErrorCode::Unavailable,
            PluginDevelopmentOperation::Register,
        ));
    };
    let selected = app
        .dialog()
        .file()
        .set_parent(&parent)
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(PluginDevelopmentResult::cancelled());
    };
    let source_directory = selected.into_path().map_err(|_| {
        PluginDevelopmentError::new(
            PluginDevelopmentErrorCode::Unavailable,
            PluginDevelopmentOperation::Register,
        )
    })?;
    state
        .coordinator(PluginDevelopmentOperation::Register)?
        .register(&app, source_directory)
}

#[tauri::command]
pub fn reload_plugin_development_entry<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<PluginDevelopmentModeState>>,
    request: Value,
) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
    let _operation = state.lock_operation();
    state.require_enabled(PluginDevelopmentOperation::Reload)?;
    let request = parse_entry_request(request, PluginDevelopmentOperation::Reload)?;
    state
        .coordinator(PluginDevelopmentOperation::Reload)?
        .reload(&app, request)
}

#[tauri::command]
pub fn remove_plugin_development_entry<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<PluginDevelopmentModeState>>,
    request: Value,
) -> Result<PluginDevelopmentResult, PluginDevelopmentError> {
    let _operation = state.lock_operation();
    state.require_enabled(PluginDevelopmentOperation::Remove)?;
    let request = parse_entry_request(request, PluginDevelopmentOperation::Remove)?;
    state
        .coordinator(PluginDevelopmentOperation::Remove)?
        .remove(&app, request)
}

pub fn setup_plugin_development_mode<R: Runtime>(
    app: &AppHandle<R>,
    manager: Arc<PluginManager>,
    startup: Option<&PluginDevelopmentStartupConfig>,
) -> Result<Arc<PluginDevelopmentModeState>, PluginDevelopmentBootstrapError> {
    let coordinator = app
        .path()
        .app_cache_dir()
        .ok()
        .and_then(|cache_dir| DevelopmentSnapshotStore::initialize(cache_dir).ok())
        .map(|snapshots| PluginDevelopmentCoordinator {
            manager,
            snapshots: Arc::new(snapshots),
        });
    if startup.is_some() && coordinator.is_none() {
        return Err(PluginDevelopmentBootstrapError::new(
            PluginDevelopmentBootstrapErrorCode::Infrastructure,
        ));
    }
    let state = Arc::new(PluginDevelopmentModeState {
        enabled: Mutex::new(startup.is_some()),
        operation: Mutex::new(()),
        bootstrap_started: Mutex::new(false),
        coordinator,
    });
    let managed = app.manage(Arc::clone(&state));
    debug_assert!(
        managed,
        "Plugin Development Mode state should only be managed once"
    );
    Ok(state)
}

pub fn bootstrap_plugin_development_mode(
    state: &Arc<PluginDevelopmentModeState>,
    startup: &PluginDevelopmentStartupConfig,
) -> Result<PluginDevelopmentBootstrapSummary, PluginDevelopmentBootstrapError> {
    let _operation = state.lock_operation();
    state.begin_bootstrap()?;
    if !state.is_enabled() {
        return Err(PluginDevelopmentBootstrapError::new(
            PluginDevelopmentBootstrapErrorCode::Infrastructure,
        ));
    }
    let coordinator = state.coordinator.as_ref().ok_or_else(|| {
        PluginDevelopmentBootstrapError::new(PluginDevelopmentBootstrapErrorCode::Infrastructure)
    })?;
    let summary = coordinator.bootstrap(startup.root())?;
    report_bootstrap_summary(&summary);
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_manager::{current_plugin_host_versions, PackageDigest, PluginSource},
        plugin_registration::PluginRegistrationChangedEvent,
    };
    use serde_json::json;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "lensx-plugin-development-{name}-{}-{}",
                std::process::id(),
                getrandom::u64().unwrap()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn source(&self) -> PathBuf {
            let source = self.0.join("dist");
            fs::create_dir_all(source.join("dist")).unwrap();
            fs::create_dir_all(source.join("assets")).unwrap();
            fs::write(
                source.join("manifest.json"),
                include_bytes!("../../packages/plugin-contract/tests/fixtures/base.json"),
            )
            .unwrap();
            fs::write(source.join("dist/plugin.html"), b"<!doctype html>").unwrap();
            fs::write(source.join("assets/plugin-icon.svg"), b"<svg/>").unwrap();
            fs::write(source.join("assets/home.svg"), b"<svg/>").unwrap();
            source
        }

        fn candidate(&self, member: &str, plugin_id: &str) -> PathBuf {
            let source = self.0.join("plugins").join(member).join("dist");
            fs::create_dir_all(source.join("dist")).unwrap();
            fs::create_dir_all(source.join("assets")).unwrap();
            let mut manifest: serde_json::Value = serde_json::from_slice(include_bytes!(
                "../../packages/plugin-contract/tests/fixtures/base.json"
            ))
            .unwrap();
            manifest["plugin_id"] = json!(plugin_id);
            fs::write(
                source.join("manifest.json"),
                serde_json::to_vec(&manifest).unwrap(),
            )
            .unwrap();
            fs::write(source.join("dist/plugin.html"), b"<!doctype html>").unwrap();
            fs::write(source.join("assets/plugin-icon.svg"), b"<svg/>").unwrap();
            fs::write(source.join("assets/home.svg"), b"<svg/>").unwrap();
            source
        }

        fn plugins_root(&self) -> PathBuf {
            self.0.join("plugins")
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[derive(Default)]
    struct TestEmitter(Mutex<Vec<String>>);

    impl PluginRegistrationEventEmitter for TestEmitter {
        fn emit_registration_changed(
            &self,
            payload: &PluginRegistrationChangedEvent,
        ) -> Result<(), ()> {
            self.0.lock().unwrap().push(payload.revision.clone());
            Ok(())
        }
    }

    fn coordinator(directory: &TestDirectory) -> PluginDevelopmentCoordinator {
        let manager = PluginManager::recover(
            directory.0.join("config"),
            current_plugin_host_versions("0.1.0"),
        );
        let snapshots =
            Arc::new(DevelopmentSnapshotStore::initialize(directory.0.join("cache")).unwrap());
        PluginDevelopmentCoordinator { manager, snapshots }
    }

    fn startup_state(directory: &TestDirectory, enabled: bool) -> Arc<PluginDevelopmentModeState> {
        Arc::new(PluginDevelopmentModeState {
            enabled: Mutex::new(enabled),
            operation: Mutex::new(()),
            bootstrap_started: Mutex::new(false),
            coordinator: Some(coordinator(directory)),
        })
    }

    #[test]
    fn startup_config_is_absolute_optional_and_pathless_on_error() {
        assert_eq!(PluginDevelopmentStartupConfig::from_value(None), Ok(None));
        let absolute = std::env::temp_dir().join("lensx plugins");
        assert_eq!(
            PluginDevelopmentStartupConfig::from_value(Some(absolute.clone().into_os_string()))
                .unwrap()
                .unwrap()
                .root(),
            absolute
        );
        let error = PluginDevelopmentStartupConfig::from_value(Some(OsString::from("relative")))
            .unwrap_err();
        assert_eq!(
            error.code,
            PluginDevelopmentBootstrapErrorCode::InvalidConfig
        );
        assert!(!error.to_string().contains("relative"));
    }

    #[test]
    fn bootstrap_discovers_sorted_direct_dist_members_and_keeps_runtime_inactive() {
        let directory = TestDirectory::new("bootstrap-discovery");
        directory.candidate("zeta", "com.acme.zeta");
        directory.candidate("alpha", "com.acme.alpha");
        directory.candidate(".hidden", "com.acme.hidden");
        fs::create_dir_all(directory.plugins_root().join("unbuilt")).unwrap();
        fs::write(directory.plugins_root().join("README.md"), b"ignored").unwrap();
        let coordinator = coordinator(&directory);

        let summary = coordinator.bootstrap(&directory.plugins_root()).unwrap();
        assert_eq!(summary.loaded, 2);
        assert_eq!(summary.skipped, 0);
        assert_eq!(summary.loaded_members, ["alpha", "zeta"]);
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 2);
        let snapshot = coordinator.manager.read_registration_snapshot();
        assert_eq!(snapshot.entries.len(), 2);
        for plugin_id in ["com.acme.alpha", "com.acme.zeta"] {
            let registration = coordinator.manager.registration(plugin_id).unwrap();
            assert_eq!(registration.facts.source, PluginSource::Development);
            assert!(registration.facts.enabled);
            assert_eq!(
                registration.runtime,
                crate::plugin_manager::PluginRuntimeState::Inactive
            );
        }
        assert!(coordinator
            .manager
            .registration("com.acme.hidden")
            .is_none());
    }

    #[test]
    fn bootstrap_skips_invalid_candidates_and_unavailable_roots_with_bounded_diagnostics() {
        let directory = TestDirectory::new("bootstrap-skips");
        directory.candidate("valid", "com.acme.valid");
        let invalid = directory.candidate("invalid", "com.acme.invalid");
        fs::write(invalid.join("manifest.json"), b"not-json").unwrap();
        let incompatible = directory.candidate("incompatible", "com.acme.incompatible");
        let mut incompatible_manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(incompatible.join("manifest.json")).unwrap()).unwrap();
        incompatible_manifest["compatibility"]["lensx"]["min_version"] = json!("9.0.0");
        incompatible_manifest["compatibility"]["lensx"]["max_version_exclusive"] = json!("10.0.0");
        incompatible_manifest["compatibility"]["host_api"]["min_version"] = json!("9.0.0");
        incompatible_manifest["compatibility"]["host_api"]["max_version_exclusive"] =
            json!("10.0.0");
        fs::write(
            incompatible.join("manifest.json"),
            serde_json::to_vec(&incompatible_manifest).unwrap(),
        )
        .unwrap();
        directory.candidate("not portable", "com.acme.nonportable");
        let coordinator = coordinator(&directory);

        let summary = coordinator.bootstrap(&directory.plugins_root()).unwrap();
        assert_eq!(summary.loaded, 1);
        assert_eq!(summary.skipped, 3);
        assert_eq!(summary.loaded_members, ["valid"]);
        assert_eq!(
            summary.diagnostics,
            [
                PluginDevelopmentBootstrapDiagnostic {
                    member: "incompatible".to_owned(),
                    code: PluginDevelopmentBootstrapDiagnosticCode::Incompatible,
                },
                PluginDevelopmentBootstrapDiagnostic {
                    member: "invalid".to_owned(),
                    code: PluginDevelopmentBootstrapDiagnosticCode::Invalid,
                },
                PluginDevelopmentBootstrapDiagnostic {
                    member: "invalid".to_owned(),
                    code: PluginDevelopmentBootstrapDiagnosticCode::InvalidMember,
                },
            ]
        );

        let missing = coordinator.bootstrap(&directory.0.join("missing")).unwrap();
        assert_eq!(missing.loaded, 0);
        assert_eq!(missing.skipped, 0);
        assert_eq!(
            missing.diagnostics[0].code,
            PluginDevelopmentBootstrapDiagnosticCode::RootUnavailable
        );
        let serialized = format!("{missing:?}");
        assert!(!serialized.contains(directory.0.to_string_lossy().as_ref()));

        let file_root = directory.0.join("not-a-directory");
        fs::write(&file_root, b"bounded").unwrap();
        let unreadable = coordinator.bootstrap(&file_root).unwrap();
        assert_eq!(
            unreadable.diagnostics[0].code,
            PluginDevelopmentBootstrapDiagnosticCode::RootUnavailable
        );
        assert_eq!(
            bootstrap_diagnostic_code(&DevelopmentSnapshotFailure::SourceChanged),
            PluginDevelopmentBootstrapDiagnosticCode::SourceChanged
        );
    }

    #[test]
    fn bootstrap_preflight_rejects_batch_and_installed_identity_conflicts_atomically() {
        let duplicate_directory = TestDirectory::new("bootstrap-duplicate");
        duplicate_directory.candidate("alpha", "com.acme.duplicate");
        duplicate_directory.candidate("beta", "com.acme.duplicate");
        let duplicate = coordinator(&duplicate_directory);
        let error = duplicate
            .bootstrap(&duplicate_directory.plugins_root())
            .unwrap_err();
        assert_eq!(error.code, PluginDevelopmentBootstrapErrorCode::Conflict);
        assert!(duplicate
            .manager
            .read_registration_snapshot()
            .entries
            .is_empty());
        assert_eq!(duplicate.snapshots.current_snapshot_count(), 0);

        let installed_directory = TestDirectory::new("bootstrap-installed-conflict");
        installed_directory.candidate("candidate", "com.acme.installed");
        let installed = coordinator(&installed_directory);
        let mut prepared_summary = PluginDevelopmentBootstrapSummary::default();
        let prepared = installed
            .prepare_startup_candidates(&installed_directory.plugins_root(), &mut prepared_summary)
            .unwrap();
        let manifest = prepared[0].snapshot.manifest.clone();
        let installed_payload = installed_directory.0.join("installed");
        fs::create_dir_all(&installed_payload).unwrap();
        installed
            .manager
            .register(
                manifest,
                PluginRegistrationFacts::new(
                    installed_payload.to_string_lossy(),
                    PackageDigest {
                        algorithm: "sha256".to_owned(),
                        value: "ab".repeat(32),
                    },
                    PluginSource::External,
                    true,
                )
                .unwrap(),
            )
            .unwrap();
        let error = installed
            .preflight_startup_candidates(&prepared)
            .unwrap_err();
        assert_eq!(error.code, PluginDevelopmentBootstrapErrorCode::Conflict);
        assert!(installed
            .manager
            .registration("com.acme.installed")
            .is_some());
        assert_eq!(installed.snapshots.current_snapshot_count(), 0);
    }

    #[test]
    fn bootstrap_commit_failure_rolls_back_only_the_current_batch() {
        let directory = TestDirectory::new("bootstrap-rollback");
        directory.candidate("alpha", "com.acme.alpha");
        directory.candidate("beta", "com.acme.beta");
        let coordinator = coordinator(&directory);
        let mut summary = PluginDevelopmentBootstrapSummary::default();
        let prepared = coordinator
            .prepare_startup_candidates(&directory.plugins_root(), &mut summary)
            .unwrap();
        coordinator.preflight_startup_candidates(&prepared).unwrap();

        let racer = directory.candidate("racer", "com.acme.beta");
        coordinator
            .register(&TestEmitter::default(), racer)
            .unwrap();
        let error = coordinator
            .commit_startup_candidates(&prepared, &mut summary)
            .unwrap_err();
        assert_eq!(error.code, PluginDevelopmentBootstrapErrorCode::Conflict);
        assert!(coordinator.manager.registration("com.acme.alpha").is_none());
        assert!(coordinator.manager.registration("com.acme.beta").is_some());
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 1);
    }

    #[test]
    fn auto_enabled_state_bootstraps_once_and_disable_does_not_reenable_it() {
        let directory = TestDirectory::new("bootstrap-once");
        directory.candidate("alpha", "com.acme.alpha");
        let state = startup_state(&directory, true);
        let startup = PluginDevelopmentStartupConfig {
            root: directory.plugins_root(),
        };
        let summary = bootstrap_plugin_development_mode(&state, &startup).unwrap();
        assert_eq!(summary.loaded, 1);
        assert!(state.is_enabled());
        let emitter = TestEmitter::default();
        state
            .update(false, || {
                state.coordinator.as_ref().unwrap().quiesce(&emitter)
            })
            .unwrap();
        assert!(!state.is_enabled());
        let error = bootstrap_plugin_development_mode(&state, &startup).unwrap_err();
        assert_eq!(
            error.code,
            PluginDevelopmentBootstrapErrorCode::AlreadyStarted
        );
        assert!(!state.is_enabled());
        assert!(state
            .coordinator
            .as_ref()
            .unwrap()
            .manager
            .read_registration_snapshot()
            .entries
            .is_empty());
    }

    #[test]
    fn starts_disabled_and_requires_explicit_process_local_enable() {
        let state = PluginDevelopmentModeState::default();
        assert_eq!(
            state.capability_snapshot(),
            PluginDevelopmentCapabilitySnapshot {
                contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
                supported: true,
                enabled: false,
            }
        );
        assert_eq!(
            state.update(true, || Ok(())).unwrap(),
            PluginDevelopmentResult::mode_updated(true, true)
        );
        assert_eq!(
            state
                .update(true, || panic!("no-op enable must not quiesce"))
                .unwrap(),
            PluginDevelopmentResult::mode_updated(true, false)
        );
    }

    #[test]
    fn disable_quiesces_before_revoking_the_switch_and_is_retryable() {
        let state = PluginDevelopmentModeState::default();
        state.update(true, || Ok(())).unwrap();
        let calls = AtomicUsize::new(0);
        let failure = state.update(false, || {
            calls.fetch_add(1, Ordering::Relaxed);
            Err(PluginDevelopmentError::new(
                PluginDevelopmentErrorCode::CleanupPending,
                PluginDevelopmentOperation::Cleanup,
            ))
        });
        assert!(failure.is_err());
        assert!(state.is_enabled());
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        assert_eq!(
            state.update(false, || Ok(())).unwrap(),
            PluginDevelopmentResult::mode_updated(false, true)
        );
        assert!(!state.is_enabled());
    }

    #[test]
    fn strict_requests_reject_versions_unknown_fields_and_stale_shapes() {
        assert!(parse_mode_request(json!({
            "contract_version": "0.1.0",
            "enabled": true
        }))
        .is_ok());
        for value in [
            json!({"contract_version":"0.0.0","enabled":true}),
            json!({"contract_version":"0.1.0","enabled":true,"path":"/private/secret"}),
        ] {
            assert!(parse_mode_request(value).is_err());
        }
        assert!(parse_entry_request(
            json!({
                "contract_version":"0.1.0",
                "entry_id":"entry_0123456789abcdef",
                "expected_revision":"7"
            }),
            PluginDevelopmentOperation::Reload,
        )
        .is_ok());
        for value in [
            json!({"contract_version":"0.1.0","entry_id":"com.acme.plugin","expected_revision":"7"}),
            json!({"contract_version":"0.1.0","entry_id":"entry_0123456789abcdef","expected_revision":"07"}),
            json!({"contract_version":"0.1.0","entry_id":"entry_0123456789abcdef","expected_revision":"7","path":"/private/secret"}),
        ] {
            assert!(parse_entry_request(value, PluginDevelopmentOperation::Reload).is_err());
        }
    }

    #[test]
    fn serialized_contracts_are_bounded_and_do_not_expose_private_facts() {
        let error = PluginDevelopmentError::new(
            PluginDevelopmentErrorCode::SourceChanged,
            PluginDevelopmentOperation::Reload,
        );
        let encoded = serde_json::to_string(&error).unwrap();
        for forbidden in [
            "/private/",
            "snapshot_identity",
            "operation_token",
            "raw_error",
            "bytes",
        ] {
            assert!(!encoded.contains(forbidden));
        }
        assert_eq!(error.message, error.code.message());
    }

    #[test]
    fn coordinator_register_reload_remove_and_shutdown_are_revision_bound() {
        let directory = TestDirectory::new("transactions");
        let source = directory.source();
        let coordinator = coordinator(&directory);
        let emitter = TestEmitter::default();

        let PluginDevelopmentResult::Registered {
            entry_id, revision, ..
        } = coordinator.register(&emitter, source.clone()).unwrap()
        else {
            panic!("register should publish a development entry")
        };
        assert_eq!(revision, "1");
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 1);

        let PluginDevelopmentResult::Reloaded {
            revision, cleanup, ..
        } = coordinator
            .reload(
                &emitter,
                PluginDevelopmentEntryRequest {
                    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
                    entry_id: entry_id.clone(),
                    expected_revision: "1".to_owned(),
                },
            )
            .unwrap()
        else {
            panic!("reload should replace the current generation")
        };
        assert_eq!(revision, "2");
        assert_eq!(cleanup, PluginDevelopmentCleanupStatus::Complete);
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 1);

        let stale = coordinator.reload(
            &emitter,
            PluginDevelopmentEntryRequest {
                contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
                entry_id: entry_id.clone(),
                expected_revision: "1".to_owned(),
            },
        );
        assert!(matches!(
            stale,
            Err(PluginDevelopmentError {
                code: PluginDevelopmentErrorCode::Conflict,
                ..
            })
        ));
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 1);

        let PluginDevelopmentResult::Removed {
            revision, cleanup, ..
        } = coordinator
            .remove(
                &emitter,
                PluginDevelopmentEntryRequest {
                    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
                    entry_id,
                    expected_revision: "2".to_owned(),
                },
            )
            .unwrap()
        else {
            panic!("remove should revoke the entry")
        };
        assert_eq!(revision, "3");
        assert_eq!(cleanup, PluginDevelopmentCleanupStatus::Complete);
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 0);
        assert!(coordinator
            .manager
            .read_registration_snapshot()
            .entries
            .is_empty());
        assert_eq!(*emitter.0.lock().unwrap(), ["1", "2", "3"]);
    }

    #[test]
    fn rejected_legacy_reload_keeps_the_current_snapshot_and_registration() {
        let directory = TestDirectory::new("legacy-reload");
        let source = directory.source();
        let coordinator = coordinator(&directory);
        let emitter = TestEmitter::default();

        let PluginDevelopmentResult::Registered { entry_id, .. } =
            coordinator.register(&emitter, source.clone()).unwrap()
        else {
            panic!("register should publish a development entry")
        };
        let before = coordinator
            .manager
            .registration("com.acme.workspace")
            .expect("current registration");
        let mut legacy: serde_json::Value =
            serde_json::from_slice(&fs::read(source.join("manifest.json")).unwrap()).unwrap();
        legacy["manifest_version"] = serde_json::Value::String("0.2.0".to_owned());
        legacy["runtime"]["kind"] = serde_json::Value::String("iframe".to_owned());
        fs::write(
            source.join("manifest.json"),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();

        let rejected = coordinator.reload(
            &emitter,
            PluginDevelopmentEntryRequest {
                contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION.to_owned(),
                entry_id,
                expected_revision: "1".to_owned(),
            },
        );
        assert!(matches!(
            rejected,
            Err(PluginDevelopmentError {
                code: PluginDevelopmentErrorCode::Incompatible,
                ..
            })
        ));
        assert_eq!(coordinator.manager.registration_revision(), "1");
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 1);
        let after = coordinator
            .manager
            .registration("com.acme.workspace")
            .expect("current registration remains");
        assert_eq!(after, before);
        assert_eq!(*emitter.0.lock().unwrap(), ["1"]);
    }

    #[test]
    fn conflict_cleanup_and_mode_quiescence_leave_no_development_authority() {
        let directory = TestDirectory::new("conflict-cleanup");
        let source = directory.source();
        let coordinator = coordinator(&directory);
        let emitter = TestEmitter::default();

        coordinator.register(&emitter, source.clone()).unwrap();
        let duplicate = coordinator.register(&emitter, source);
        assert!(matches!(
            duplicate,
            Err(PluginDevelopmentError {
                code: PluginDevelopmentErrorCode::Conflict,
                ..
            })
        ));
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 1);

        coordinator.quiesce(&emitter).unwrap();
        assert!(coordinator
            .manager
            .read_registration_snapshot()
            .entries
            .is_empty());
        assert_eq!(coordinator.snapshots.current_snapshot_count(), 0);
    }
}
