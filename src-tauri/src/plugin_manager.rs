use crate::plugin_identity::plugin_record_key;
use crate::plugin_manifest::{
    validate_plugin_manifest, NormalizedPluginManifest, PluginHostVersions,
    PluginManifestCompatibility, PluginManifestValidationStatus, PLUGIN_HOST_API_VERSION,
};
use crate::plugin_registration::{
    healthy_entry_id, project_plugin_registration_detail, project_plugin_registration_snapshot,
    quarantine_entry_id, PluginRegistrationChangedEvent, PluginRegistrationDetailResponse,
    PluginRegistrationQueryError, PluginRegistrationSnapshot,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
};
use tauri::{AppHandle, Manager, Runtime};

const PLUGIN_MANAGER_DIRECTORY: &str = "plugin-manager";
const RECORD_FORMAT_VERSION: u32 = 1;
const RECORD_FILE_EXTENSION: &str = "json";
const MAX_DIAGNOSTICS: usize = 32;
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginSource {
    Builtin,
    External,
    Development,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PackageDigest {
    pub algorithm: String,
    pub value: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginManagerDiagnosticCode {
    DuplicateIdentity,
    InvalidRegistration,
    StoreUnavailable,
    PersistFailed,
    RecordUnreadable,
    RecordInvalid,
    UnsupportedFormatVersion,
    IdentityMismatch,
    InvalidState,
    NotFound,
    StaleRevision,
}

impl PluginManagerDiagnosticCode {
    fn message(self) -> &'static str {
        match self {
            Self::DuplicateIdentity => "Plugin identity is already registered.",
            Self::InvalidRegistration => "Plugin registration is invalid.",
            Self::StoreUnavailable => "Plugin Manager storage is unavailable.",
            Self::PersistFailed => "Plugin registration could not be saved.",
            Self::RecordUnreadable => "Plugin record could not be read.",
            Self::RecordInvalid => "Plugin record is invalid.",
            Self::UnsupportedFormatVersion => "Plugin record format version is unsupported.",
            Self::IdentityMismatch => "Plugin record identity does not match its record key.",
            Self::InvalidState => "Plugin registration state does not allow this operation.",
            Self::NotFound => "Plugin registration entry was not found.",
            Self::StaleRevision => "Plugin registration revision is stale.",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginManagerDiagnosticPhase {
    Validate,
    Persist,
    Recover,
    Initialize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginManagerDiagnostic {
    code: PluginManagerDiagnosticCode,
    phase: PluginManagerDiagnosticPhase,
    message: String,
}

impl PluginManagerDiagnostic {
    pub fn new(code: PluginManagerDiagnosticCode, phase: PluginManagerDiagnosticPhase) -> Self {
        Self {
            code,
            phase,
            message: code.message().to_owned(),
        }
    }

    pub fn code(&self) -> PluginManagerDiagnosticCode {
        self.code
    }

    pub fn phase(&self) -> PluginManagerDiagnosticPhase {
        self.phase
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    fn is_canonical(&self) -> bool {
        self.message == self.code.message()
    }

    fn invalid_registration() -> Self {
        Self::new(
            PluginManagerDiagnosticCode::InvalidRegistration,
            PluginManagerDiagnosticPhase::Validate,
        )
    }

    fn persist_failed() -> Self {
        Self::new(
            PluginManagerDiagnosticCode::PersistFailed,
            PluginManagerDiagnosticPhase::Persist,
        )
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub enum PluginRegistrationPayload {
    InstalledPackage {
        installation_path: String,
        package_digest: PackageDigest,
    },
    #[cfg(feature = "plugin-development-mode")]
    DevelopmentSnapshot {
        snapshot_root: PathBuf,
        snapshot_identity: String,
        source_directory: PathBuf,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginRegistrationFacts {
    pub payload: PluginRegistrationPayload,
    pub source: PluginSource,
    pub enabled: bool,
    pub granted_permission_ids: Vec<String>,
    pub diagnostics: Vec<PluginManagerDiagnostic>,
}

impl PluginRegistrationFacts {
    pub fn new(
        installation_path: impl Into<String>,
        package_digest: PackageDigest,
        source: PluginSource,
        enabled: bool,
    ) -> Result<Self, PluginManagerDiagnostic> {
        Self::with_grants(
            installation_path,
            package_digest,
            source,
            enabled,
            Vec::new(),
        )
    }

    pub fn with_grants(
        installation_path: impl Into<String>,
        package_digest: PackageDigest,
        source: PluginSource,
        enabled: bool,
        granted_permission_ids: Vec<String>,
    ) -> Result<Self, PluginManagerDiagnostic> {
        let mut granted_permission_ids = granted_permission_ids;
        granted_permission_ids.sort();
        granted_permission_ids.dedup();
        let facts = Self {
            payload: PluginRegistrationPayload::InstalledPackage {
                installation_path: installation_path.into(),
                package_digest,
            },
            source,
            enabled,
            granted_permission_ids,
            diagnostics: Vec::new(),
        };
        facts.validate()?;
        Ok(facts)
    }

    #[cfg(feature = "plugin-development-mode")]
    pub(crate) fn development(
        snapshot_root: PathBuf,
        snapshot_identity: String,
        source_directory: PathBuf,
        enabled: bool,
        granted_permission_ids: Vec<String>,
    ) -> Result<Self, PluginManagerDiagnostic> {
        let mut granted_permission_ids = granted_permission_ids;
        granted_permission_ids.sort();
        granted_permission_ids.dedup();
        let facts = Self {
            payload: PluginRegistrationPayload::DevelopmentSnapshot {
                snapshot_root,
                snapshot_identity,
                source_directory,
            },
            source: PluginSource::Development,
            enabled,
            granted_permission_ids,
            diagnostics: Vec::new(),
        };
        facts.validate()?;
        Ok(facts)
    }

    pub(crate) fn installed_payload(&self) -> Option<(&Path, &PackageDigest)> {
        match &self.payload {
            PluginRegistrationPayload::InstalledPackage {
                installation_path,
                package_digest,
            } => Some((Path::new(installation_path), package_digest)),
            #[cfg(feature = "plugin-development-mode")]
            PluginRegistrationPayload::DevelopmentSnapshot { .. } => None,
        }
    }

    pub(crate) fn installed_payload_mut(&mut self) -> Option<(&mut String, &mut PackageDigest)> {
        match &mut self.payload {
            PluginRegistrationPayload::InstalledPackage {
                installation_path,
                package_digest,
            } => Some((installation_path, package_digest)),
            #[cfg(feature = "plugin-development-mode")]
            PluginRegistrationPayload::DevelopmentSnapshot { .. } => None,
        }
    }

    #[cfg(feature = "plugin-development-mode")]
    pub(crate) fn development_payload(&self) -> Option<(&Path, &str, &Path)> {
        match &self.payload {
            PluginRegistrationPayload::DevelopmentSnapshot {
                snapshot_root,
                snapshot_identity,
                source_directory,
            } => Some((snapshot_root, snapshot_identity, source_directory)),
            PluginRegistrationPayload::InstalledPackage { .. } => None,
        }
    }

    fn validate(&self) -> Result<(), PluginManagerDiagnostic> {
        let payload_valid = match &self.payload {
            PluginRegistrationPayload::InstalledPackage {
                installation_path,
                package_digest,
            } => {
                self.source != PluginSource::Development
                    && Path::new(installation_path).is_absolute()
                    && is_safe_token(&package_digest.algorithm)
                    && !package_digest.value.is_empty()
                    && package_digest
                        .value
                        .bytes()
                        .all(|byte| byte.is_ascii_hexdigit())
            }
            #[cfg(feature = "plugin-development-mode")]
            PluginRegistrationPayload::DevelopmentSnapshot {
                snapshot_root,
                snapshot_identity,
                source_directory,
            } => {
                self.source == PluginSource::Development
                    && snapshot_root.is_absolute()
                    && source_directory.is_absolute()
                    && snapshot_identity.len() == 64
                    && snapshot_identity
                        .bytes()
                        .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
            }
        };
        if !payload_valid
            || !is_sorted_unique(&self.granted_permission_ids)
            || self
                .granted_permission_ids
                .iter()
                .any(|permission_id| !is_safe_permission_id(permission_id))
            || self.diagnostics.len() > MAX_DIAGNOSTICS
            || self
                .diagnostics
                .iter()
                .any(|diagnostic| !diagnostic.is_canonical())
        {
            return Err(PluginManagerDiagnostic::invalid_registration());
        }
        Ok(())
    }

    fn push_diagnostic(&mut self, diagnostic: PluginManagerDiagnostic) {
        if self.diagnostics.len() == MAX_DIAGNOSTICS {
            self.diagnostics.remove(0);
        }
        self.diagnostics.push(diagnostic);
    }
}

fn is_safe_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_'
        })
}

fn is_safe_permission_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'-' | b'_')
        })
}

fn is_sorted_unique(values: &[String]) -> bool {
    values.windows(2).all(|pair| pair[0] < pair[1])
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PluginRuntimeState {
    Inactive,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PluginRegistration {
    pub manifest: NormalizedPluginManifest,
    pub facts: PluginRegistrationFacts,
    pub compatibility: PluginManifestCompatibility,
    pub runtime: PluginRuntimeState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuarantineStub {
    pub record_key: String,
    pub plugin_id: Option<String>,
    pub diagnostic: PluginManagerDiagnostic,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum PluginManagerLifecycleEntry {
    Healthy {
        entry_id: String,
        plugin_id: String,
        record_key: String,
        registration: PluginRegistration,
    },
    Quarantined {
        entry_id: String,
        record_key: String,
        stub: QuarantineStub,
    },
}

impl PluginManagerLifecycleEntry {
    pub(crate) fn record_key(&self) -> &str {
        match self {
            Self::Healthy { record_key, .. } | Self::Quarantined { record_key, .. } => record_key,
        }
    }

    pub(crate) fn plugin_id(&self) -> Option<&str> {
        match self {
            Self::Healthy { plugin_id, .. } => Some(plugin_id),
            Self::Quarantined { stub, .. } => stub.plugin_id.as_deref(),
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct PluginManagerRemoval {
    pub entry: PluginManagerLifecycleEntry,
    pub change: PluginRegistrationChangedEvent,
}

#[derive(Clone, Debug)]
pub(crate) struct PluginManagerReplacement {
    pub change: PluginRegistrationChangedEvent,
}

#[derive(Clone, Debug)]
pub(crate) struct PluginManagerGrantMutation {
    pub change: Option<PluginRegistrationChangedEvent>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginManagerPermissionCheckError {
    InvalidIdentity,
    PermissionDenied,
    StaleSession,
    Unavailable,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PluginManagerRecoveryReport {
    pub degraded: bool,
    pub healthy_records: usize,
    pub quarantined_records: usize,
    pub diagnostics: Vec<PluginManagerDiagnostic>,
}

#[derive(Clone, Debug)]
pub(crate) struct PluginInstallerRecoveryFacts {
    pub healthy_installation_paths: Vec<(String, PathBuf)>,
    pub quarantined_record_keys: Vec<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct PluginManagerResourceProjection {
    pub revision: String,
    pub entry_id: String,
    pub plugin_id: String,
    pub record_key: String,
    pub registration: PluginRegistration,
    pub resource_generation: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginManagerResourceProjectionError {
    Degraded,
    StaleRevision,
    NotFound,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PluginRecordV1 {
    format_version: u32,
    record_key: String,
    manifest: NormalizedPluginManifest,
    registration: InstalledPluginRegistrationRecordFacts,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct InstalledPluginRegistrationRecordFacts {
    installation_path: String,
    package_digest: PackageDigest,
    source: PluginSource,
    enabled: bool,
    #[serde(default)]
    granted_permission_ids: Vec<String>,
    #[serde(default)]
    diagnostics: Vec<PluginManagerDiagnostic>,
}

impl PluginRecordV1 {
    fn from_registration(
        registration: &PluginRegistration,
    ) -> Result<Self, PluginManagerDiagnostic> {
        let (installation_path, package_digest) = registration
            .facts
            .installed_payload()
            .ok_or_else(PluginManagerDiagnostic::invalid_registration)?;
        Ok(Self {
            format_version: RECORD_FORMAT_VERSION,
            record_key: plugin_record_key(&registration.manifest.plugin_id),
            manifest: registration.manifest.clone(),
            registration: InstalledPluginRegistrationRecordFacts {
                installation_path: installation_path.to_string_lossy().into_owned(),
                package_digest: package_digest.clone(),
                source: registration.facts.source,
                enabled: registration.facts.enabled,
                granted_permission_ids: registration.facts.granted_permission_ids.clone(),
                diagnostics: registration.facts.diagnostics.clone(),
            },
        })
    }
}

impl InstalledPluginRegistrationRecordFacts {
    fn into_registration_facts(self) -> Result<PluginRegistrationFacts, PluginManagerDiagnostic> {
        let facts = PluginRegistrationFacts {
            payload: PluginRegistrationPayload::InstalledPackage {
                installation_path: self.installation_path,
                package_digest: self.package_digest,
            },
            source: self.source,
            enabled: self.enabled,
            granted_permission_ids: self.granted_permission_ids,
            diagnostics: self.diagnostics,
        };
        facts.validate()?;
        Ok(facts)
    }
}

#[derive(Clone, Debug, Default)]
struct PluginManagerSnapshot {
    revision: u64,
    healthy: BTreeMap<String, PluginRegistration>,
    quarantined: BTreeMap<String, QuarantineStub>,
    resource_generations: BTreeMap<String, u64>,
    relevant_revisions: BTreeMap<String, u64>,
    next_resource_generation: u64,
}

#[derive(Debug)]
pub struct PluginManager {
    store: PluginManagerStore,
    versions: PluginHostVersions,
    snapshot: Mutex<PluginManagerSnapshot>,
    recovery_report: PluginManagerRecoveryReport,
}

impl PluginManager {
    pub fn recover(config_dir: impl AsRef<Path>, versions: PluginHostVersions) -> Arc<Self> {
        Self::recover_store(PluginManagerStore::new(config_dir), versions)
    }

    fn recover_store(store: PluginManagerStore, versions: PluginHostVersions) -> Arc<Self> {
        let mut snapshot = PluginManagerSnapshot::default();
        let mut report = PluginManagerRecoveryReport::default();
        match store.read_candidates() {
            Ok(candidates) => {
                for candidate in candidates {
                    match recover_candidate(candidate, &versions) {
                        Ok(registration) => {
                            let plugin_id = registration.manifest.plugin_id.clone();
                            if snapshot.healthy.contains_key(&plugin_id) {
                                let key = plugin_record_key(&plugin_id);
                                snapshot.quarantined.insert(
                                    key.clone(),
                                    QuarantineStub {
                                        record_key: key,
                                        plugin_id: Some(plugin_id),
                                        diagnostic: PluginManagerDiagnostic::new(
                                            PluginManagerDiagnosticCode::DuplicateIdentity,
                                            PluginManagerDiagnosticPhase::Recover,
                                        ),
                                    },
                                );
                            } else {
                                snapshot.relevant_revisions.insert(plugin_id.clone(), 0);
                                snapshot.healthy.insert(plugin_id, registration);
                            }
                        }
                        Err(stub) => {
                            snapshot.quarantined.insert(stub.record_key.clone(), stub);
                        }
                    }
                }
                report.healthy_records = snapshot.healthy.len();
                report.quarantined_records = snapshot.quarantined.len();
                for plugin_id in snapshot.healthy.keys().cloned().collect::<Vec<_>>() {
                    snapshot.advance_resource_generation(&plugin_id);
                }
            }
            Err(diagnostic) => {
                report.degraded = true;
                report.diagnostics.push(diagnostic);
            }
        }
        Arc::new(Self {
            store,
            versions,
            snapshot: Mutex::new(snapshot),
            recovery_report: report,
        })
    }

    fn degraded(versions: PluginHostVersions) -> Arc<Self> {
        Arc::new(Self {
            store: PluginManagerStore::unavailable(),
            versions,
            snapshot: Mutex::new(PluginManagerSnapshot::default()),
            recovery_report: PluginManagerRecoveryReport {
                degraded: true,
                diagnostics: vec![PluginManagerDiagnostic::new(
                    PluginManagerDiagnosticCode::StoreUnavailable,
                    PluginManagerDiagnosticPhase::Initialize,
                )],
                ..PluginManagerRecoveryReport::default()
            },
        })
    }

    pub fn recovery_report(&self) -> &PluginManagerRecoveryReport {
        &self.recovery_report
    }

    pub fn registration(&self, plugin_id: &str) -> Option<PluginRegistration> {
        self.lock_snapshot().healthy.get(plugin_id).cloned()
    }

    pub fn quarantine(&self, key: &str) -> Option<QuarantineStub> {
        self.lock_snapshot().quarantined.get(key).cloned()
    }

    pub fn registration_revision(&self) -> String {
        self.lock_snapshot().revision.to_string()
    }

    fn reject_degraded_write(&self) -> Result<(), PluginManagerDiagnostic> {
        if self.recovery_report.degraded {
            Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StoreUnavailable,
                PluginManagerDiagnosticPhase::Persist,
            ))
        } else {
            Ok(())
        }
    }

    fn resolve_lifecycle_entry_locked(
        snapshot: &PluginManagerSnapshot,
        entry_id: &str,
    ) -> Result<PluginManagerLifecycleEntry, PluginManagerDiagnostic> {
        if let Some((plugin_id, registration)) = snapshot
            .healthy
            .iter()
            .find(|(_, registration)| healthy_entry_id(registration) == entry_id)
        {
            return Ok(PluginManagerLifecycleEntry::Healthy {
                entry_id: entry_id.to_owned(),
                plugin_id: plugin_id.clone(),
                record_key: plugin_record_key(plugin_id),
                registration: registration.clone(),
            });
        }
        if let Some((record_key, stub)) = snapshot
            .quarantined
            .iter()
            .find(|(_, stub)| quarantine_entry_id(stub) == entry_id)
        {
            return Ok(PluginManagerLifecycleEntry::Quarantined {
                entry_id: entry_id.to_owned(),
                record_key: record_key.clone(),
                stub: stub.clone(),
            });
        }
        Err(PluginManagerDiagnostic::new(
            PluginManagerDiagnosticCode::NotFound,
            PluginManagerDiagnosticPhase::Validate,
        ))
    }

    pub(crate) fn resolve_lifecycle_entry(
        &self,
        entry_id: &str,
        expected_revision: &str,
    ) -> Result<PluginManagerLifecycleEntry, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        let snapshot = self.lock_snapshot();
        if snapshot.revision.to_string() != expected_revision {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StaleRevision,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        Self::resolve_lifecycle_entry_locked(&snapshot, entry_id)
    }

    pub(crate) fn host_versions(&self) -> PluginHostVersions {
        self.versions.clone()
    }

    pub(crate) fn installer_recovery_facts(&self) -> PluginInstallerRecoveryFacts {
        let snapshot = self.lock_snapshot();
        PluginInstallerRecoveryFacts {
            healthy_installation_paths: snapshot
                .healthy
                .values()
                .filter_map(|registration| {
                    registration.facts.installed_payload().map(|(path, _)| {
                        (
                            plugin_record_key(&registration.manifest.plugin_id),
                            path.to_path_buf(),
                        )
                    })
                })
                .collect(),
            quarantined_record_keys: snapshot.quarantined.keys().cloned().collect(),
        }
    }

    pub(crate) fn read_resource_projection(
        &self,
        entry_id: &str,
        expected_revision: Option<&str>,
    ) -> Result<PluginManagerResourceProjection, PluginManagerResourceProjectionError> {
        if self.recovery_report.degraded {
            return Err(PluginManagerResourceProjectionError::Degraded);
        }
        let snapshot = self.lock_snapshot();
        if expected_revision.is_some_and(|expected| expected != snapshot.revision.to_string()) {
            return Err(PluginManagerResourceProjectionError::StaleRevision);
        }
        let (plugin_id, registration) = snapshot
            .healthy
            .iter()
            .find(|(_, registration)| healthy_entry_id(registration) == entry_id)
            .ok_or(PluginManagerResourceProjectionError::NotFound)?;
        let resource_generation = snapshot
            .resource_generations
            .get(plugin_id)
            .copied()
            .ok_or(PluginManagerResourceProjectionError::NotFound)?;
        Ok(PluginManagerResourceProjection {
            revision: snapshot.revision.to_string(),
            entry_id: entry_id.to_owned(),
            plugin_id: plugin_id.clone(),
            record_key: plugin_record_key(plugin_id),
            registration: registration.clone(),
            resource_generation,
        })
    }

    pub(crate) fn read_storage_plugin_key(
        &self,
        entry_id: &str,
        plugin_id: &str,
        version: &str,
    ) -> Result<String, ()> {
        if self.recovery_report.degraded {
            return Err(());
        }
        let snapshot = self.lock_snapshot();
        let registration = snapshot.healthy.get(plugin_id).ok_or(())?;
        if !registration.facts.enabled
            || registration.manifest.version != version
            || healthy_entry_id(registration) != entry_id
        {
            return Err(());
        }
        Ok(plugin_record_key(plugin_id))
    }

    pub fn read_registration_snapshot(&self) -> PluginRegistrationSnapshot {
        let snapshot = self.lock_snapshot();
        project_plugin_registration_snapshot(
            snapshot.revision,
            &self.recovery_report,
            snapshot.healthy.values(),
            snapshot.quarantined.values(),
        )
    }

    pub fn read_registration_detail(
        &self,
        entry_id: &str,
    ) -> Result<PluginRegistrationDetailResponse, PluginRegistrationQueryError> {
        let snapshot = self.lock_snapshot();
        project_plugin_registration_detail(
            snapshot.revision,
            entry_id,
            snapshot.healthy.values(),
            snapshot.quarantined.values(),
        )
    }

    pub fn register(
        &self,
        manifest: NormalizedPluginManifest,
        facts: PluginRegistrationFacts,
    ) -> Result<Option<PluginRegistrationChangedEvent>, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        facts.validate()?;
        if facts.installed_payload().is_none() {
            return Err(PluginManagerDiagnostic::invalid_registration());
        }
        let compatibility = validate_normalized_manifest(&manifest, &self.versions)?;
        let plugin_id = manifest.plugin_id.clone();
        let key = plugin_record_key(&plugin_id);
        let mut snapshot = self.lock_snapshot();
        if snapshot.healthy.contains_key(&plugin_id) {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::DuplicateIdentity,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let registration = PluginRegistration {
            manifest,
            facts,
            compatibility,
            runtime: PluginRuntimeState::Inactive,
        };
        self.persist_registration(&registration)?;
        snapshot.quarantined.remove(&key);
        snapshot.healthy.insert(plugin_id.clone(), registration);
        snapshot.advance_resource_generation(&plugin_id);
        Ok(Some(snapshot.commit_relevant_change(&plugin_id)))
    }

    #[cfg(feature = "plugin-development-mode")]
    pub(crate) fn register_development(
        &self,
        manifest: NormalizedPluginManifest,
        facts: PluginRegistrationFacts,
    ) -> Result<PluginRegistrationChangedEvent, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        facts.validate()?;
        if facts.source != PluginSource::Development || facts.development_payload().is_none() {
            return Err(PluginManagerDiagnostic::invalid_registration());
        }
        let compatibility = validate_normalized_manifest(&manifest, &self.versions)?;
        let plugin_id = manifest.plugin_id.clone();
        let key = plugin_record_key(&plugin_id);
        let mut snapshot = self.lock_snapshot();
        if snapshot.healthy.contains_key(&plugin_id) || snapshot.quarantined.contains_key(&key) {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::DuplicateIdentity,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let registration = PluginRegistration {
            manifest,
            facts,
            compatibility,
            runtime: PluginRuntimeState::Inactive,
        };
        snapshot.healthy.insert(plugin_id.clone(), registration);
        snapshot.advance_resource_generation(&plugin_id);
        Ok(snapshot.commit_relevant_change(&plugin_id))
    }

    #[cfg(feature = "plugin-development-mode")]
    pub(crate) fn reload_development_entry(
        &self,
        entry_id: &str,
        expected_revision: &str,
        manifest: NormalizedPluginManifest,
        mut facts: PluginRegistrationFacts,
    ) -> Result<PluginManagerReplacement, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        facts.validate()?;
        if facts.source != PluginSource::Development || facts.development_payload().is_none() {
            return Err(PluginManagerDiagnostic::invalid_registration());
        }
        let compatibility = validate_normalized_manifest(&manifest, &self.versions)?;
        let mut snapshot = self.lock_snapshot();
        if snapshot.revision.to_string() != expected_revision {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StaleRevision,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let entry = Self::resolve_lifecycle_entry_locked(&snapshot, entry_id)?;
        let PluginManagerLifecycleEntry::Healthy {
            plugin_id,
            registration: current,
            ..
        } = entry
        else {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        };
        if current.facts.source != PluginSource::Development
            || manifest.plugin_id != plugin_id
            || facts.enabled != current.facts.enabled
        {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::IdentityMismatch,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let requested = manifest
            .requested_permissions
            .iter()
            .map(|request| request.permission_id.as_str())
            .collect::<std::collections::BTreeSet<_>>();
        facts.granted_permission_ids = current
            .facts
            .granted_permission_ids
            .iter()
            .filter(|permission| requested.contains(permission.as_str()))
            .cloned()
            .collect();
        facts.validate()?;
        let registration = PluginRegistration {
            manifest,
            facts,
            compatibility,
            runtime: PluginRuntimeState::Inactive,
        };
        snapshot.healthy.insert(plugin_id.clone(), registration);
        snapshot.advance_resource_generation(&plugin_id);
        Ok(PluginManagerReplacement {
            change: snapshot.commit_relevant_change(&plugin_id),
        })
    }

    #[cfg(feature = "plugin-development-mode")]
    pub(crate) fn remove_development_entry(
        &self,
        entry_id: &str,
        expected_revision: &str,
    ) -> Result<PluginManagerRemoval, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        let mut snapshot = self.lock_snapshot();
        if snapshot.revision.to_string() != expected_revision {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StaleRevision,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let entry = Self::resolve_lifecycle_entry_locked(&snapshot, entry_id)?;
        let PluginManagerLifecycleEntry::Healthy {
            plugin_id,
            registration,
            ..
        } = &entry
        else {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        };
        if registration.facts.source != PluginSource::Development {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let plugin_id = plugin_id.clone();
        snapshot.healthy.remove(&plugin_id);
        snapshot.resource_generations.remove(&plugin_id);
        snapshot.relevant_revisions.remove(&plugin_id);
        Ok(PluginManagerRemoval {
            entry,
            change: snapshot.commit_change(),
        })
    }

    pub fn set_enabled(
        &self,
        plugin_id: &str,
        enabled: bool,
    ) -> Result<Option<PluginRegistrationChangedEvent>, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        let mut snapshot = self.lock_snapshot();
        let mut next = snapshot
            .healthy
            .get(plugin_id)
            .cloned()
            .ok_or_else(PluginManagerDiagnostic::invalid_registration)?;
        if next.facts.enabled == enabled {
            return Ok(None);
        }
        next.facts.enabled = enabled;
        next.facts.validate()?;
        self.persist_registration(&next)?;
        snapshot.healthy.insert(plugin_id.to_owned(), next);
        snapshot.advance_resource_generation(plugin_id);
        Ok(Some(snapshot.commit_relevant_change(plugin_id)))
    }

    pub(crate) fn replace_entry(
        &self,
        entry_id: &str,
        expected_revision: &str,
        manifest: NormalizedPluginManifest,
        facts: PluginRegistrationFacts,
    ) -> Result<PluginManagerReplacement, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        facts.validate()?;
        let compatibility = validate_normalized_manifest(&manifest, &self.versions)?;
        let mut snapshot = self.lock_snapshot();
        if snapshot.revision.to_string() != expected_revision {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StaleRevision,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let entry = Self::resolve_lifecycle_entry_locked(&snapshot, entry_id)?;
        let PluginManagerLifecycleEntry::Healthy {
            plugin_id,
            registration: current,
            ..
        } = entry
        else {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        };
        if manifest.plugin_id != plugin_id
            || facts.source != current.facts.source
            || facts.enabled != current.facts.enabled
        {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::IdentityMismatch,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let registration = PluginRegistration {
            manifest,
            facts,
            compatibility,
            runtime: PluginRuntimeState::Inactive,
        };
        self.persist_registration(&registration)?;
        snapshot.healthy.insert(plugin_id.clone(), registration);
        snapshot.advance_resource_generation(&plugin_id);
        Ok(PluginManagerReplacement {
            change: snapshot.commit_relevant_change(&plugin_id),
        })
    }

    pub(crate) fn set_enabled_entry(
        &self,
        entry_id: &str,
        expected_revision: &str,
        enabled: bool,
    ) -> Result<(PluginRegistration, Option<PluginRegistrationChangedEvent>), PluginManagerDiagnostic>
    {
        self.reject_degraded_write()?;
        let mut snapshot = self.lock_snapshot();
        if snapshot.revision.to_string() != expected_revision {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StaleRevision,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let entry = Self::resolve_lifecycle_entry_locked(&snapshot, entry_id)?;
        let PluginManagerLifecycleEntry::Healthy {
            plugin_id,
            mut registration,
            ..
        } = entry
        else {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        };
        if registration.facts.enabled == enabled {
            return Ok((registration, None));
        }
        registration.facts.enabled = enabled;
        registration.facts.validate()?;
        self.persist_registration(&registration)?;
        snapshot
            .healthy
            .insert(plugin_id.clone(), registration.clone());
        snapshot.advance_resource_generation(&plugin_id);
        Ok((
            registration,
            Some(snapshot.commit_relevant_change(&plugin_id)),
        ))
    }

    pub(crate) fn set_permission_grant(
        &self,
        entry_id: &str,
        expected_revision: &str,
        permission_id: &str,
        granted: bool,
        host_supported: bool,
    ) -> Result<PluginManagerGrantMutation, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        if !is_safe_permission_id(permission_id) {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let mut snapshot = self.lock_snapshot();
        if snapshot.revision.to_string() != expected_revision {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StaleRevision,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let entry = Self::resolve_lifecycle_entry_locked(&snapshot, entry_id)?;
        let PluginManagerLifecycleEntry::Healthy {
            plugin_id,
            mut registration,
            ..
        } = entry
        else {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        };
        let currently_granted = registration
            .facts
            .granted_permission_ids
            .binary_search_by(|candidate| candidate.as_str().cmp(permission_id))
            .is_ok();
        if currently_granted == granted {
            return Ok(PluginManagerGrantMutation { change: None });
        }
        if granted
            && (!host_supported
                || !registration
                    .manifest
                    .requested_permissions
                    .iter()
                    .any(|request| request.permission_id == permission_id))
        {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        if granted {
            registration
                .facts
                .granted_permission_ids
                .push(permission_id.to_owned());
            registration.facts.granted_permission_ids.sort();
            registration.facts.granted_permission_ids.dedup();
        } else {
            registration
                .facts
                .granted_permission_ids
                .retain(|candidate| candidate != permission_id);
        }
        registration.facts.validate()?;
        self.persist_registration(&registration)?;
        snapshot
            .healthy
            .insert(plugin_id.clone(), registration.clone());
        let change = snapshot.commit_relevant_change(&plugin_id);
        Ok(PluginManagerGrantMutation {
            change: Some(change),
        })
    }

    pub(crate) fn authorize_permission_call(
        &self,
        entry_id: &str,
        plugin_id: &str,
        version: &str,
        session_revision: &str,
        permission_id: &str,
    ) -> Result<(), PluginManagerPermissionCheckError> {
        if self.recovery_report.degraded {
            return Err(PluginManagerPermissionCheckError::Unavailable);
        }
        let session_revision = session_revision
            .parse::<u64>()
            .map_err(|_| PluginManagerPermissionCheckError::InvalidIdentity)?;
        let snapshot = self.lock_snapshot();
        let registration = snapshot
            .healthy
            .get(plugin_id)
            .ok_or(PluginManagerPermissionCheckError::InvalidIdentity)?;
        if healthy_entry_id(registration) != entry_id || registration.manifest.version != version {
            return Err(PluginManagerPermissionCheckError::InvalidIdentity);
        }
        if session_revision
            < snapshot
                .relevant_revisions
                .get(plugin_id)
                .copied()
                .unwrap_or_default()
        {
            return Err(PluginManagerPermissionCheckError::StaleSession);
        }
        if !registration.facts.enabled
            || !registration.compatibility.lensx
            || !registration.compatibility.host_api
        {
            return Err(PluginManagerPermissionCheckError::Unavailable);
        }
        if !registration
            .manifest
            .requested_permissions
            .iter()
            .any(|request| request.permission_id == permission_id)
            || registration
                .facts
                .granted_permission_ids
                .binary_search_by(|candidate| candidate.as_str().cmp(permission_id))
                .is_err()
        {
            return Err(PluginManagerPermissionCheckError::PermissionDenied);
        }
        Ok(())
    }

    pub(crate) fn remove_entry(
        &self,
        entry_id: &str,
        expected_revision: &str,
    ) -> Result<PluginManagerRemoval, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        let mut snapshot = self.lock_snapshot();
        if snapshot.revision.to_string() != expected_revision {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StaleRevision,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        let entry = Self::resolve_lifecycle_entry_locked(&snapshot, entry_id)?;
        if matches!(
            &entry,
            PluginManagerLifecycleEntry::Healthy { registration, .. }
                if registration.facts.installed_payload().is_none()
        ) {
            return Err(PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::InvalidState,
                PluginManagerDiagnosticPhase::Validate,
            ));
        }
        self.store.remove_record(entry.record_key())?;
        match &entry {
            PluginManagerLifecycleEntry::Healthy { plugin_id, .. } => {
                snapshot.healthy.remove(plugin_id);
                snapshot.resource_generations.remove(plugin_id);
                snapshot.relevant_revisions.remove(plugin_id);
            }
            PluginManagerLifecycleEntry::Quarantined { record_key, .. } => {
                snapshot.quarantined.remove(record_key);
            }
        }
        Ok(PluginManagerRemoval {
            entry,
            change: snapshot.commit_change(),
        })
    }

    pub fn append_diagnostic(
        &self,
        plugin_id: &str,
        diagnostic: PluginManagerDiagnostic,
    ) -> Result<Option<PluginRegistrationChangedEvent>, PluginManagerDiagnostic> {
        self.reject_degraded_write()?;
        let mut snapshot = self.lock_snapshot();
        let mut next = snapshot
            .healthy
            .get(plugin_id)
            .cloned()
            .ok_or_else(PluginManagerDiagnostic::invalid_registration)?;
        next.facts.push_diagnostic(diagnostic);
        self.persist_registration(&next)?;
        snapshot.healthy.insert(plugin_id.to_owned(), next);
        Ok(Some(snapshot.commit_change()))
    }

    fn lock_snapshot(&self) -> MutexGuard<'_, PluginManagerSnapshot> {
        self.snapshot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn persist_registration(
        &self,
        registration: &PluginRegistration,
    ) -> Result<(), PluginManagerDiagnostic> {
        if registration.facts.installed_payload().is_none() {
            return Ok(());
        }
        let record = PluginRecordV1::from_registration(registration)?;
        self.store.write_record(&record)
    }

    #[cfg(test)]
    pub(crate) fn set_write_fault(&self, fault: Option<WriteFault>) {
        *self
            .store
            .write_fault
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = fault;
    }
}

impl PluginManagerSnapshot {
    fn advance_resource_generation(&mut self, plugin_id: &str) -> u64 {
        self.next_resource_generation = self
            .next_resource_generation
            .checked_add(1)
            .expect("Plugin resource generation should not overflow during one process");
        self.resource_generations
            .insert(plugin_id.to_owned(), self.next_resource_generation);
        self.next_resource_generation
    }

    fn commit_change(&mut self) -> PluginRegistrationChangedEvent {
        self.revision = self
            .revision
            .checked_add(1)
            .expect("Plugin Manager revision should not overflow during one process");
        PluginRegistrationChangedEvent::new(self.revision)
    }

    fn commit_relevant_change(&mut self, plugin_id: &str) -> PluginRegistrationChangedEvent {
        let change = self.commit_change();
        self.relevant_revisions
            .insert(plugin_id.to_owned(), self.revision);
        change
    }
}

fn validate_normalized_manifest(
    manifest: &NormalizedPluginManifest,
    versions: &PluginHostVersions,
) -> Result<PluginManifestCompatibility, PluginManagerDiagnostic> {
    let value = serde_json::to_value(manifest)
        .map_err(|_| PluginManagerDiagnostic::invalid_registration())?;
    let result = validate_plugin_manifest(&value, versions);
    if result.status == PluginManifestValidationStatus::Invalid
        || result.manifest.as_ref() != Some(manifest)
    {
        return Err(PluginManagerDiagnostic::invalid_registration());
    }
    result
        .compatibility
        .ok_or_else(PluginManagerDiagnostic::invalid_registration)
}

enum StoredCandidate {
    Contents { record_key: String, bytes: Vec<u8> },
    Unreadable { record_key: String },
}

fn recover_candidate(
    candidate: StoredCandidate,
    versions: &PluginHostVersions,
) -> Result<PluginRegistration, QuarantineStub> {
    let (candidate_key, bytes) = match candidate {
        StoredCandidate::Contents { record_key, bytes } => (record_key, bytes),
        StoredCandidate::Unreadable { record_key } => {
            return Err(QuarantineStub {
                record_key,
                plugin_id: None,
                diagnostic: PluginManagerDiagnostic::new(
                    PluginManagerDiagnosticCode::RecordUnreadable,
                    PluginManagerDiagnosticPhase::Recover,
                ),
            });
        }
    };
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| QuarantineStub {
        record_key: candidate_key.clone(),
        plugin_id: None,
        diagnostic: PluginManagerDiagnostic::new(
            PluginManagerDiagnosticCode::RecordInvalid,
            PluginManagerDiagnosticPhase::Recover,
        ),
    })?;
    if value.get("format_version").and_then(Value::as_u64) != Some(RECORD_FORMAT_VERSION.into()) {
        return Err(QuarantineStub {
            record_key: candidate_key,
            plugin_id: None,
            diagnostic: PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::UnsupportedFormatVersion,
                PluginManagerDiagnosticPhase::Recover,
            ),
        });
    }
    let record: PluginRecordV1 = serde_json::from_value(value).map_err(|_| QuarantineStub {
        record_key: candidate_key.clone(),
        plugin_id: None,
        diagnostic: PluginManagerDiagnostic::new(
            PluginManagerDiagnosticCode::RecordInvalid,
            PluginManagerDiagnosticPhase::Recover,
        ),
    })?;
    let plugin_id = record.manifest.plugin_id.clone();
    if record.record_key != candidate_key || plugin_record_key(&plugin_id) != candidate_key {
        return Err(QuarantineStub {
            record_key: candidate_key,
            plugin_id: Some(plugin_id),
            diagnostic: PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::IdentityMismatch,
                PluginManagerDiagnosticPhase::Recover,
            ),
        });
    }
    let registration_facts = record
        .registration
        .clone()
        .into_registration_facts()
        .map_err(|_| QuarantineStub {
            record_key: candidate_key.clone(),
            plugin_id: Some(plugin_id.clone()),
            diagnostic: PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::RecordInvalid,
                PluginManagerDiagnosticPhase::Recover,
            ),
        })?;
    let compatibility =
        validate_normalized_manifest(&record.manifest, versions).map_err(|_| QuarantineStub {
            record_key: candidate_key,
            plugin_id: Some(plugin_id.clone()),
            diagnostic: PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::RecordInvalid,
                PluginManagerDiagnosticPhase::Recover,
            ),
        })?;
    Ok(PluginRegistration {
        manifest: record.manifest,
        facts: registration_facts,
        compatibility,
        runtime: PluginRuntimeState::Inactive,
    })
}

#[derive(Debug)]
struct PluginManagerStore {
    directory: Option<PathBuf>,
    #[cfg(test)]
    write_fault: Mutex<Option<WriteFault>>,
}

impl PluginManagerStore {
    fn new(config_dir: impl AsRef<Path>) -> Self {
        Self {
            directory: Some(config_dir.as_ref().join(PLUGIN_MANAGER_DIRECTORY)),
            #[cfg(test)]
            write_fault: Mutex::new(None),
        }
    }

    fn unavailable() -> Self {
        Self {
            directory: None,
            #[cfg(test)]
            write_fault: Mutex::new(None),
        }
    }

    fn read_candidates(&self) -> Result<Vec<StoredCandidate>, PluginManagerDiagnostic> {
        let directory = self.directory.as_ref().ok_or_else(|| {
            PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::StoreUnavailable,
                PluginManagerDiagnosticPhase::Recover,
            )
        })?;
        let entries = match fs::read_dir(directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(_) => {
                return Err(PluginManagerDiagnostic::new(
                    PluginManagerDiagnosticCode::StoreUnavailable,
                    PluginManagerDiagnosticPhase::Recover,
                ));
            }
        };
        let mut paths = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|_| {
                PluginManagerDiagnostic::new(
                    PluginManagerDiagnosticCode::StoreUnavailable,
                    PluginManagerDiagnosticPhase::Recover,
                )
            })?;
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str())
                == Some(RECORD_FILE_EXTENSION)
            {
                paths.push(path);
            }
        }
        paths.sort();
        Ok(paths
            .into_iter()
            .filter_map(|path| {
                let key = path.file_stem()?.to_str()?.to_owned();
                Some(match fs::read(path) {
                    Ok(bytes) => StoredCandidate::Contents {
                        record_key: key,
                        bytes,
                    },
                    Err(_) => StoredCandidate::Unreadable { record_key: key },
                })
            })
            .collect())
    }

    fn write_record(&self, record: &PluginRecordV1) -> Result<(), PluginManagerDiagnostic> {
        record.registration.clone().into_registration_facts()?;
        if record.format_version != RECORD_FORMAT_VERSION
            || record.record_key != plugin_record_key(&record.manifest.plugin_id)
        {
            return Err(PluginManagerDiagnostic::invalid_registration());
        }
        let directory = self
            .directory
            .as_ref()
            .ok_or_else(PluginManagerDiagnostic::persist_failed)?;
        fs::create_dir_all(directory).map_err(|_| PluginManagerDiagnostic::persist_failed())?;
        let contents = serde_json::to_vec_pretty(record)
            .map_err(|_| PluginManagerDiagnostic::persist_failed())?;
        let target_path = directory.join(format!("{}.json", record.record_key));
        let previous = match fs::read(&target_path) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => return Err(PluginManagerDiagnostic::persist_failed()),
        };
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temp_path = directory.join(format!(
            ".{}.{}.{}.tmp",
            record.record_key,
            std::process::id(),
            sequence
        ));
        let write_result = (|| {
            self.fail_if_requested(WriteFault::Create)?;
            let mut temp_file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temp_path)
                .map_err(|_| PluginManagerDiagnostic::persist_failed())?;
            self.fail_if_requested(WriteFault::Write)?;
            temp_file
                .write_all(&contents)
                .and_then(|_| temp_file.write_all(b"\n"))
                .map_err(|_| PluginManagerDiagnostic::persist_failed())?;
            self.fail_if_requested(WriteFault::Sync)?;
            temp_file
                .sync_all()
                .map_err(|_| PluginManagerDiagnostic::persist_failed())?;
            self.fail_if_requested(WriteFault::Replace)?;
            fs::rename(&temp_path, &target_path)
                .map_err(|_| PluginManagerDiagnostic::persist_failed())?;
            self.fail_if_requested(WriteFault::ParentSync)?;
            sync_directory(directory)
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&temp_path);
            match previous {
                Some(bytes) => {
                    let _ = restore_record_bytes(&target_path, &bytes);
                }
                None => {
                    let _ = fs::remove_file(&target_path);
                }
            }
            let _ = sync_directory(directory);
        }
        write_result
    }

    fn remove_record(&self, record_key: &str) -> Result<(), PluginManagerDiagnostic> {
        let directory = self
            .directory
            .as_ref()
            .ok_or_else(PluginManagerDiagnostic::persist_failed)?;
        let target_path = directory.join(format!("{record_key}.{RECORD_FILE_EXTENSION}"));
        let previous =
            fs::read(&target_path).map_err(|_| PluginManagerDiagnostic::persist_failed())?;
        self.fail_if_requested(WriteFault::Remove)?;
        fs::remove_file(&target_path).map_err(|_| PluginManagerDiagnostic::persist_failed())?;
        let sync_result = (|| {
            self.fail_if_requested(WriteFault::ParentSync)?;
            sync_directory(directory)
        })();
        if sync_result.is_err() {
            let _ = restore_record_bytes(&target_path, &previous);
            let _ = sync_directory(directory);
            return Err(PluginManagerDiagnostic::persist_failed());
        }
        Ok(())
    }

    #[cfg(test)]
    fn fail_if_requested(&self, stage: WriteFault) -> Result<(), PluginManagerDiagnostic> {
        if self
            .write_fault
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
            == Some(&stage)
        {
            Err(PluginManagerDiagnostic::persist_failed())
        } else {
            Ok(())
        }
    }

    #[cfg(not(test))]
    fn fail_if_requested(&self, _stage: WriteFault) -> Result<(), PluginManagerDiagnostic> {
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum WriteFault {
    Create,
    Write,
    Sync,
    Replace,
    Remove,
    ParentSync,
}

fn sync_directory(path: &Path) -> Result<(), PluginManagerDiagnostic> {
    #[cfg(unix)]
    {
        fs::File::open(path)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| PluginManagerDiagnostic::persist_failed())
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(())
    }
}

fn restore_record_bytes(path: &Path, bytes: &[u8]) -> Result<(), PluginManagerDiagnostic> {
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|_| PluginManagerDiagnostic::persist_failed())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| PluginManagerDiagnostic::persist_failed())
}

pub fn current_plugin_host_versions(lensx_version: impl Into<String>) -> PluginHostVersions {
    PluginHostVersions {
        lensx: lensx_version.into(),
        host_api: PLUGIN_HOST_API_VERSION.to_owned(),
    }
}

fn initialize_plugin_manager(
    config_dir: Result<PathBuf, ()>,
    versions: PluginHostVersions,
) -> Arc<PluginManager> {
    match config_dir {
        Ok(config_dir) => PluginManager::recover(config_dir, versions),
        Err(()) => PluginManager::degraded(versions),
    }
}

fn manage_plugin_manager<R: Runtime>(app: &AppHandle<R>, manager: Arc<PluginManager>) -> bool {
    app.manage(manager)
}

pub fn setup_plugin_manager<R: Runtime>(app: &AppHandle<R>) -> Arc<PluginManager> {
    let versions = current_plugin_host_versions(app.package_info().version.to_string());
    let config_dir = app.path().app_config_dir().map_err(|_| ());
    let manager = initialize_plugin_manager(config_dir, versions);
    let managed = manage_plugin_manager(app, Arc::clone(&manager));
    debug_assert!(managed, "Plugin Manager state should only be managed once");
    manager
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::test::{mock_app, MockRuntime};

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should follow the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "lensx-plugin-manager-{name}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self { path }
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn versions(version: &str) -> PluginHostVersions {
        PluginHostVersions {
            lensx: version.to_owned(),
            host_api: version.to_owned(),
        }
    }

    fn manifest(plugin_id: &str, maximum: &str) -> NormalizedPluginManifest {
        let mut input: Value = serde_json::from_str(include_str!(
            "../../packages/plugin-contract/tests/fixtures/base.json"
        ))
        .expect("base fixture should be valid JSON");
        input["plugin_id"] = json!(plugin_id);
        input["compatibility"]["lensx"]["max_version_exclusive"] = json!(maximum);
        input["compatibility"]["host_api"]["max_version_exclusive"] = json!(maximum);
        validate_plugin_manifest(&input, &versions("0.1.0"))
            .manifest
            .expect("fixture should normalize")
    }

    fn facts(enabled: bool) -> PluginRegistrationFacts {
        PluginRegistrationFacts::new(
            "/tmp/lensx-plugin",
            PackageDigest {
                algorithm: "sha256".to_owned(),
                value: "aabbccdd".to_owned(),
            },
            PluginSource::External,
            enabled,
        )
        .expect("facts should be valid")
    }

    fn record_facts(enabled: bool) -> InstalledPluginRegistrationRecordFacts {
        let facts = facts(enabled);
        let (installation_path, package_digest) = facts.installed_payload().unwrap();
        InstalledPluginRegistrationRecordFacts {
            installation_path: installation_path.to_string_lossy().into_owned(),
            package_digest: package_digest.clone(),
            source: facts.source,
            enabled: facts.enabled,
            granted_permission_ids: facts.granted_permission_ids,
            diagnostics: facts.diagnostics,
        }
    }

    #[cfg(feature = "plugin-development-mode")]
    fn development_facts(
        directory: &TestDirectory,
        generation: &str,
        enabled: bool,
        grants: Vec<String>,
    ) -> PluginRegistrationFacts {
        let source = directory.path.join("author-dist");
        let snapshot = directory.path.join("cache").join(generation);
        fs::create_dir_all(&source).expect("source directory should exist");
        fs::create_dir_all(&snapshot).expect("snapshot directory should exist");
        PluginRegistrationFacts::development(snapshot, "ab".repeat(32), source, enabled, grants)
            .expect("development facts should be valid")
    }

    fn persist_diagnostic(index: usize) -> PluginManagerDiagnostic {
        if index % 2 == 0 {
            PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::PersistFailed,
                PluginManagerDiagnosticPhase::Persist,
            )
        } else {
            PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::RecordInvalid,
                PluginManagerDiagnosticPhase::Recover,
            )
        }
    }

    fn assert_managed(app: &tauri::App<MockRuntime>, manager: Arc<PluginManager>) {
        assert!(manage_plugin_manager(app.handle(), Arc::clone(&manager)));
        let state = app.state::<Arc<PluginManager>>();
        assert!(Arc::ptr_eq(&manager, &state));
    }

    fn entry_id(manager: &PluginManager, plugin_id: &str) -> String {
        manager
            .read_registration_snapshot()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                crate::plugin_registration::PluginRegistrationSummary::Registered {
                    entry_id,
                    plugin_id: current,
                    ..
                } if current == plugin_id => Some(entry_id),
                crate::plugin_registration::PluginRegistrationSummary::Quarantined {
                    entry_id,
                    plugin_id: Some(current),
                    ..
                } if current == plugin_id => Some(entry_id),
                _ => None,
            })
            .expect("entry should be present")
    }

    #[test]
    fn registration_keeps_author_and_host_facts_layered_with_empty_grants() {
        let directory = TestDirectory::new("layering");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.layered", "0.2.0"), facts(true))
            .expect("registration should succeed");
        let registration = manager
            .registration("com.acme.layered")
            .expect("registration should exist");
        assert!(registration.facts.granted_permission_ids.is_empty());
        assert_eq!(registration.facts.source, PluginSource::External);
        let manifest_json = serde_json::to_value(registration.manifest)
            .expect("Manifest should serialize independently");
        for host_field in [
            "installation_path",
            "package_digest",
            "source",
            "enabled",
            "granted_permission_ids",
        ] {
            assert!(manifest_json.get(host_field).is_none());
        }
    }

    #[test]
    fn grants_are_sorted_and_deduplicated() {
        let facts = PluginRegistrationFacts::with_grants(
            "/tmp/lensx-plugin",
            PackageDigest {
                algorithm: "sha256".to_owned(),
                value: "abcd".to_owned(),
            },
            PluginSource::External,
            false,
            vec![
                "files.read".to_owned(),
                "clipboard.read".to_owned(),
                "files.read".to_owned(),
            ],
        )
        .expect("facts should normalize grants");
        assert_eq!(
            facts.granted_permission_ids,
            vec!["clipboard.read".to_owned(), "files.read".to_owned()]
        );
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn development_entries_share_projection_without_writing_store_records() {
        let directory = TestDirectory::new("development-register");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        let change = manager
            .register_development(
                manifest("com.acme.development", "0.2.0"),
                development_facts(&directory, "generation-a", true, Vec::new()),
            )
            .expect("development registration should commit");
        assert_eq!(change.revision, "1");
        let registration = manager.registration("com.acme.development").unwrap();
        assert_eq!(registration.facts.source, PluginSource::Development);
        assert!(registration.facts.granted_permission_ids.is_empty());
        assert!(registration.facts.development_payload().is_some());
        assert!(!directory.path.join(PLUGIN_MANAGER_DIRECTORY).exists());
        let snapshot = manager.read_registration_snapshot();
        assert!(matches!(
            snapshot.entries.as_slice(),
            [
                crate::plugin_registration::PluginRegistrationSummary::Registered {
                    source: crate::plugin_registration::PluginRegistrationSource::Development,
                    ..
                }
            ]
        ));
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn development_reload_is_revision_bound_forces_generation_and_reconciles_grants() {
        let directory = TestDirectory::new("development-reload");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        let manifest = manifest("com.acme.development", "0.2.0");
        manager
            .register_development(
                manifest.clone(),
                development_facts(&directory, "generation-a", true, Vec::new()),
            )
            .unwrap();
        let entry = entry_id(&manager, "com.acme.development");
        let permission = manifest.requested_permissions[0].permission_id.clone();
        manager
            .set_permission_grant(&entry, "1", &permission, true, true)
            .expect("declared grant should commit");
        let before = manager
            .read_resource_projection(&entry, None)
            .unwrap()
            .resource_generation;
        let stale = manager
            .reload_development_entry(
                &entry,
                "1",
                manifest.clone(),
                development_facts(&directory, "generation-b", true, Vec::new()),
            )
            .expect_err("stale reload should fail");
        assert_eq!(stale.code(), PluginManagerDiagnosticCode::StaleRevision);
        let replacement = manager
            .reload_development_entry(
                &entry,
                "2",
                manifest,
                development_facts(&directory, "generation-b", true, Vec::new()),
            )
            .expect("same-byte explicit reload should commit");
        assert_eq!(replacement.change.revision, "3");
        let current = manager.registration("com.acme.development").unwrap();
        assert_eq!(current.facts.granted_permission_ids, vec![permission]);
        let after = manager
            .read_resource_projection(&entry, None)
            .unwrap()
            .resource_generation;
        assert!(after > before);
        assert!(!directory.path.join(PLUGIN_MANAGER_DIRECTORY).exists());
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn development_reload_drops_removed_grants_and_never_restores_them_implicitly() {
        let directory = TestDirectory::new("development-permission-delta");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        let initial = manifest("com.acme.development", "0.2.0");
        let permission = initial.requested_permissions[0].permission_id.clone();
        manager
            .register_development(
                initial.clone(),
                development_facts(&directory, "generation-a", true, Vec::new()),
            )
            .unwrap();
        let entry = entry_id(&manager, "com.acme.development");
        manager
            .set_permission_grant(&entry, "1", &permission, true, true)
            .unwrap();

        let mut without_permission = initial.clone();
        without_permission.requested_permissions.clear();
        for page in &mut without_permission.contributes.pages {
            page.required_permissions.clear();
        }
        manager
            .reload_development_entry(
                &entry,
                "2",
                without_permission,
                development_facts(&directory, "generation-b", true, vec![permission.clone()]),
            )
            .unwrap();
        assert!(manager
            .registration("com.acme.development")
            .unwrap()
            .facts
            .granted_permission_ids
            .is_empty());

        manager
            .reload_development_entry(
                &entry,
                "3",
                initial,
                development_facts(&directory, "generation-c", true, vec![permission]),
            )
            .unwrap();
        assert!(manager
            .registration("com.acme.development")
            .unwrap()
            .facts
            .granted_permission_ids
            .is_empty());
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn development_mutations_lose_stale_disable_grant_reload_and_remove_races() {
        let directory = TestDirectory::new("development-races");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        let manifest = manifest("com.acme.development", "0.2.0");
        let permission = manifest.requested_permissions[0].permission_id.clone();
        manager
            .register_development(
                manifest.clone(),
                development_facts(&directory, "generation-a", true, Vec::new()),
            )
            .unwrap();
        let entry = entry_id(&manager, "com.acme.development");
        manager.set_enabled_entry(&entry, "1", false).unwrap();

        let stale_grant = manager
            .set_permission_grant(&entry, "1", &permission, true, true)
            .expect_err("grant must compare current revision");
        let stale_reload = manager
            .reload_development_entry(
                &entry,
                "1",
                manifest,
                development_facts(&directory, "generation-b", false, Vec::new()),
            )
            .expect_err("reload must compare current revision");
        let stale_remove = manager
            .remove_development_entry(&entry, "1")
            .expect_err("remove must compare current revision");
        for error in [stale_grant, stale_reload, stale_remove] {
            assert_eq!(error.code(), PluginManagerDiagnosticCode::StaleRevision);
        }
        assert!(
            !manager
                .registration("com.acme.development")
                .unwrap()
                .facts
                .enabled
        );
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn development_reload_rejects_identity_changes_and_remove_is_process_only() {
        let directory = TestDirectory::new("development-remove");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register_development(
                manifest("com.acme.development", "0.2.0"),
                development_facts(&directory, "generation-a", true, Vec::new()),
            )
            .unwrap();
        let entry = entry_id(&manager, "com.acme.development");
        let changed_identity = manager
            .reload_development_entry(
                &entry,
                "1",
                manifest("com.acme.other", "0.2.0"),
                development_facts(&directory, "generation-b", true, Vec::new()),
            )
            .expect_err("reload must preserve plugin ID");
        assert_eq!(
            changed_identity.code(),
            PluginManagerDiagnosticCode::IdentityMismatch
        );
        let removed = manager
            .remove_development_entry(&entry, "1")
            .expect("development remove should commit without Store access");
        assert_eq!(removed.change.revision, "2");
        assert!(manager.registration("com.acme.development").is_none());
        assert!(!directory.path.join(PLUGIN_MANAGER_DIRECTORY).exists());
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn development_identity_collides_with_installed_and_quarantine_entries() {
        let installed_directory = TestDirectory::new("development-installed-collision");
        let installed = PluginManager::recover(&installed_directory.path, versions("0.1.0"));
        installed
            .register(manifest("com.acme.collision", "0.2.0"), facts(true))
            .unwrap();
        let error = installed
            .register_development(
                manifest("com.acme.collision", "0.2.0"),
                development_facts(&installed_directory, "generation-a", true, Vec::new()),
            )
            .expect_err("installed identity must not be shadowed");
        assert_eq!(error.code(), PluginManagerDiagnosticCode::DuplicateIdentity);

        let quarantine_directory = TestDirectory::new("development-quarantine-collision");
        let key = plugin_record_key("com.acme.collision");
        let store = quarantine_directory.path.join(PLUGIN_MANAGER_DIRECTORY);
        fs::create_dir_all(&store).unwrap();
        fs::write(store.join(format!("{key}.json")), b"invalid").unwrap();
        let quarantined = PluginManager::recover(&quarantine_directory.path, versions("0.1.0"));
        let error = quarantined
            .register_development(
                manifest("com.acme.collision", "0.2.0"),
                development_facts(&quarantine_directory, "generation-a", true, Vec::new()),
            )
            .expect_err("quarantine identity must not be repaired by development register");
        assert_eq!(error.code(), PluginManagerDiagnosticCode::DuplicateIdentity);
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn restart_recovers_installed_records_but_not_development_facts() {
        let directory = TestDirectory::new("development-restart");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.installed", "0.2.0"), facts(true))
            .unwrap();
        manager
            .register_development(
                manifest("com.acme.development", "0.2.0"),
                development_facts(&directory, "generation-a", true, Vec::new()),
            )
            .unwrap();
        drop(manager);

        let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert!(recovered.registration("com.acme.installed").is_some());
        assert!(recovered.registration("com.acme.development").is_none());
        assert_eq!(recovered.recovery_report().healthy_records, 1);
        assert_eq!(recovered.registration_revision(), "0");
    }

    #[test]
    fn duplicate_identity_does_not_change_existing_state() {
        let directory = TestDirectory::new("duplicate");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.duplicate", "0.2.0"), facts(true))
            .expect("first registration should succeed");
        let error = manager
            .register(manifest("com.acme.duplicate", "0.3.0"), facts(false))
            .expect_err("duplicate should fail");
        assert_eq!(error.code, PluginManagerDiagnosticCode::DuplicateIdentity);
        assert_eq!(manager.registration_revision(), "1");
        assert!(
            manager
                .registration("com.acme.duplicate")
                .expect("original should remain")
                .facts
                .enabled
        );
    }

    #[test]
    fn replacement_is_revision_bound_atomic_and_keeps_register_duplicate_semantics() {
        let directory = TestDirectory::new("replacement");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        let mut current = manifest("com.acme.replace", "0.2.0");
        current.version = "1.0.0".to_owned();
        manager
            .register(current, facts(true))
            .expect("initial registration should succeed");
        let entry = entry_id(&manager, "com.acme.replace");
        let mut candidate = manifest("com.acme.replace", "0.2.0");
        candidate.version = "2.0.0".to_owned();
        let next_facts = PluginRegistrationFacts::with_grants(
            "/tmp/lensx-plugin-next",
            PackageDigest {
                algorithm: "sha256".to_owned(),
                value: "eeff0011".to_owned(),
            },
            PluginSource::External,
            true,
            vec!["lensx.filesystem.read_selected".to_owned()],
        )
        .expect("replacement facts should be valid");

        let stale = manager
            .replace_entry(&entry, "0", candidate.clone(), next_facts.clone())
            .expect_err("stale revision should fail");
        assert_eq!(stale.code(), PluginManagerDiagnosticCode::StaleRevision);
        assert_eq!(manager.registration_revision(), "1");

        let cross_identity = manager
            .replace_entry(
                &entry,
                "1",
                manifest("com.other.plugin", "0.2.0"),
                next_facts.clone(),
            )
            .expect_err("cross identity replacement should fail");
        assert_eq!(
            cross_identity.code(),
            PluginManagerDiagnosticCode::IdentityMismatch
        );

        let replacement = manager
            .replace_entry(&entry, "1", candidate, next_facts)
            .expect("replacement should commit");
        assert_eq!(replacement.change.revision, "2");
        let current = manager
            .registration("com.acme.replace")
            .expect("replacement registration should exist");
        assert_eq!(current.manifest.version, "2.0.0");
        assert_eq!(current.runtime, PluginRuntimeState::Inactive);
        assert_eq!(manager.registration_revision(), "2");
        let duplicate = manager
            .register(manifest("com.acme.replace", "0.2.0"), facts(true))
            .expect_err("register must continue rejecting duplicate identity");
        assert_eq!(
            duplicate.code(),
            PluginManagerDiagnosticCode::DuplicateIdentity
        );
        assert_eq!(manager.registration_revision(), "2");
    }

    #[test]
    fn replacement_write_faults_preserve_old_memory_and_disk_record() {
        for fault in [
            WriteFault::Create,
            WriteFault::Write,
            WriteFault::Sync,
            WriteFault::Replace,
            WriteFault::ParentSync,
        ] {
            let directory = TestDirectory::new("replacement-write-fault");
            let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
            let mut current = manifest("com.acme.atomicreplace", "0.2.0");
            current.version = "1.0.0".to_owned();
            manager
                .register(current, facts(true))
                .expect("initial registration should succeed");
            let entry = entry_id(&manager, "com.acme.atomicreplace");
            let mut candidate = manifest("com.acme.atomicreplace", "0.2.0");
            candidate.version = "2.0.0".to_owned();
            manager.set_write_fault(Some(fault));
            manager
                .replace_entry(&entry, "1", candidate, facts(true))
                .expect_err("write fault should preserve current registration");
            assert_eq!(manager.registration_revision(), "1");
            assert_eq!(
                manager
                    .registration("com.acme.atomicreplace")
                    .expect("current registration should remain")
                    .manifest
                    .version,
                "1.0.0"
            );
            manager.set_write_fault(None);
            let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
            assert_eq!(
                recovered
                    .registration("com.acme.atomicreplace")
                    .expect("old disk record should remain")
                    .manifest
                    .version,
                "1.0.0"
            );
        }
    }

    #[test]
    fn the_thirty_third_diagnostic_evicts_the_oldest() {
        let directory = TestDirectory::new("diagnostics");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.diagnostics", "0.2.0"), facts(true))
            .expect("registration should succeed");
        for index in 0..33 {
            manager
                .append_diagnostic("com.acme.diagnostics", persist_diagnostic(index))
                .expect("diagnostic should persist");
        }
        let diagnostics = manager
            .registration("com.acme.diagnostics")
            .expect("registration should exist")
            .facts
            .diagnostics;
        assert_eq!(diagnostics.len(), MAX_DIAGNOSTICS);
        assert_eq!(
            diagnostics.first().map(PluginManagerDiagnostic::code),
            Some(PluginManagerDiagnosticCode::RecordInvalid)
        );
        assert_eq!(
            diagnostics.last().map(PluginManagerDiagnostic::code),
            Some(PluginManagerDiagnosticCode::PersistFailed)
        );
    }

    #[test]
    fn recovery_recomputes_compatibility_and_resets_runtime() {
        let directory = TestDirectory::new("compatibility");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.compatibility", "0.2.0"), facts(true))
            .expect("registration should succeed");
        assert_eq!(
            manager
                .registration("com.acme.compatibility")
                .expect("registration should exist")
                .compatibility,
            PluginManifestCompatibility {
                lensx: true,
                host_api: true,
            }
        );
        let recovered = PluginManager::recover(&directory.path, versions("0.2.0"));
        let registration = recovered
            .registration("com.acme.compatibility")
            .expect("registration should recover");
        assert_eq!(
            registration.compatibility,
            PluginManifestCompatibility {
                lensx: false,
                host_api: false,
            }
        );
        assert_eq!(registration.runtime, PluginRuntimeState::Inactive);
        assert!(registration.facts.enabled);
    }

    #[test]
    fn records_round_trip_independently_and_ignore_temp_files() {
        let directory = TestDirectory::new("round-trip");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.one", "0.2.0"), facts(true))
            .expect("first registration should succeed");
        manager
            .register(manifest("com.acme.two", "0.2.0"), facts(false))
            .expect("second registration should succeed");
        manager
            .set_enabled("com.acme.two", true)
            .expect("second registration should update independently");
        let store_dir = directory.path.join(PLUGIN_MANAGER_DIRECTORY);
        fs::write(store_dir.join(".unfinished.tmp"), b"not json")
            .expect("temporary file should be written");
        let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert_eq!(recovered.recovery_report().healthy_records, 2);
        assert_eq!(recovered.recovery_report().quarantined_records, 0);
        assert!(recovered.registration("com.acme.one").is_some());
        assert!(
            recovered
                .registration("com.acme.one")
                .expect("first registration should remain")
                .facts
                .enabled
        );
        assert!(
            recovered
                .registration("com.acme.two")
                .expect("second registration should remain")
                .facts
                .enabled
        );
    }

    #[test]
    fn each_write_stage_failure_preserves_memory_disk_and_cleans_temp_files() {
        for fault in [
            WriteFault::Create,
            WriteFault::Write,
            WriteFault::Sync,
            WriteFault::Replace,
        ] {
            let directory = TestDirectory::new("write-fault");
            let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
            manager
                .register(manifest("com.acme.atomic", "0.2.0"), facts(false))
                .expect("initial registration should succeed");
            assert_eq!(manager.registration_revision(), "1");
            manager.set_write_fault(Some(fault));
            let error = manager
                .set_enabled("com.acme.atomic", true)
                .expect_err("fault should reject transition");
            assert_eq!(error.code, PluginManagerDiagnosticCode::PersistFailed);
            assert_eq!(manager.registration_revision(), "1");
            assert!(
                !manager
                    .registration("com.acme.atomic")
                    .expect("old state should remain")
                    .facts
                    .enabled
            );
            manager.set_write_fault(None);
            let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
            assert!(
                !recovered
                    .registration("com.acme.atomic")
                    .expect("old disk state should remain")
                    .facts
                    .enabled
            );
            let temp_files = fs::read_dir(directory.path.join(PLUGIN_MANAGER_DIRECTORY))
                .expect("store should be readable")
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry.path().extension().and_then(|value| value.to_str()) == Some("tmp")
                })
                .count();
            assert_eq!(temp_files, 0);
        }
    }

    #[test]
    fn lifecycle_resolution_enable_noop_and_removal_use_current_entry_and_revision() {
        let directory = TestDirectory::new("lifecycle-transitions");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.lifecycle", "0.2.0"), facts(false))
            .expect("registration should succeed");
        manager
            .register(manifest("com.acme.independent", "0.2.0"), facts(true))
            .expect("independent registration should succeed");
        let entry_id = entry_id(&manager, "com.acme.lifecycle");
        let revision = manager.registration_revision();

        let resolved = manager
            .resolve_lifecycle_entry(&entry_id, &revision)
            .expect("current entry should resolve");
        match &resolved {
            PluginManagerLifecycleEntry::Healthy {
                entry_id: resolved_id,
                ..
            } => assert_eq!(resolved_id, &entry_id),
            PluginManagerLifecycleEntry::Quarantined { .. } => {
                panic!("healthy entry should resolve as healthy")
            }
        }
        assert_eq!(resolved.plugin_id(), Some("com.acme.lifecycle"));

        let (unchanged, event) = manager
            .set_enabled_entry(&entry_id, &revision, false)
            .expect("matching enabled intent should be a no-op");
        assert!(!unchanged.facts.enabled);
        assert!(event.is_none());
        assert_eq!(manager.registration_revision(), revision);

        let (_, event) = manager
            .set_enabled_entry(&entry_id, &revision, true)
            .expect("enabled intent should persist");
        let event = event.expect("real transition should return an event");
        assert_eq!(event.revision, "3");
        assert!(
            manager
                .registration("com.acme.independent")
                .expect("independent record should remain")
                .facts
                .enabled
        );

        let removal = manager
            .remove_entry(&entry_id, &event.revision)
            .expect("healthy entry removal should persist");
        assert_eq!(removal.change.revision, "4");
        assert_eq!(removal.entry.plugin_id(), Some("com.acme.lifecycle"));
        assert!(manager.registration("com.acme.lifecycle").is_none());
        assert!(manager.registration("com.acme.independent").is_some());

        let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert!(recovered.registration("com.acme.lifecycle").is_none());
        assert!(recovered.registration("com.acme.independent").is_some());
    }

    #[test]
    fn lifecycle_rejects_stale_quarantine_and_degraded_transitions() {
        let directory = TestDirectory::new("lifecycle-rejections");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.current", "0.2.0"), facts(false))
            .expect("registration should succeed");
        let current_entry = entry_id(&manager, "com.acme.current");
        let stale = manager
            .set_enabled_entry(&current_entry, "0", true)
            .expect_err("stale revision should fail");
        assert_eq!(stale.code(), PluginManagerDiagnosticCode::StaleRevision);
        assert!(
            !manager
                .registration("com.acme.current")
                .expect("record should remain")
                .facts
                .enabled
        );

        let plugin_id = "com.acme.quarantine-lifecycle";
        let key = plugin_record_key(plugin_id);
        let store = directory.path.join(PLUGIN_MANAGER_DIRECTORY);
        fs::write(store.join(format!("{key}.json")), b"{")
            .expect("damaged record should be written");
        let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
        let quarantine_entry = quarantine_entry_id(
            &recovered
                .quarantine(&key)
                .expect("damaged record should be quarantined"),
        );
        let quarantine_error = recovered
            .set_enabled_entry(&quarantine_entry, &recovered.registration_revision(), true)
            .expect_err("quarantine cannot be enabled");
        assert_eq!(
            quarantine_error.code(),
            PluginManagerDiagnosticCode::InvalidState
        );
        let removal = recovered
            .remove_entry(&quarantine_entry, &recovered.registration_revision())
            .expect("quarantine removal should persist");
        assert_eq!(removal.entry.plugin_id(), None);
        assert!(recovered.quarantine(&key).is_none());

        let degraded_directory = TestDirectory::new("lifecycle-degraded");
        fs::write(
            degraded_directory.path.join(PLUGIN_MANAGER_DIRECTORY),
            b"preserve",
        )
        .expect("blocking file should exist");
        let degraded = PluginManager::recover(&degraded_directory.path, versions("0.1.0"));
        let error = degraded
            .resolve_lifecycle_entry("entry_0000000000000000", "0")
            .expect_err("degraded Store must reject writes");
        assert_eq!(error.code(), PluginManagerDiagnosticCode::StoreUnavailable);
        assert_eq!(
            fs::read(degraded_directory.path.join(PLUGIN_MANAGER_DIRECTORY)).unwrap(),
            b"preserve"
        );
    }

    #[test]
    fn removal_faults_preserve_memory_disk_and_revision() {
        for fault in [WriteFault::Remove, WriteFault::ParentSync] {
            let directory = TestDirectory::new("remove-fault");
            let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
            manager
                .register(manifest("com.acme.remove", "0.2.0"), facts(true))
                .expect("registration should succeed");
            let entry_id = entry_id(&manager, "com.acme.remove");
            manager.set_write_fault(Some(fault));
            let error = manager
                .remove_entry(&entry_id, "1")
                .expect_err("injected removal failure should fail");
            assert_eq!(error.code(), PluginManagerDiagnosticCode::PersistFailed);
            assert_eq!(manager.registration_revision(), "1");
            assert!(manager.registration("com.acme.remove").is_some());
            manager.set_write_fault(None);
            let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
            assert!(recovered.registration("com.acme.remove").is_some());
        }
    }

    #[test]
    fn damaged_unknown_and_mismatched_records_are_quarantined_independently() {
        let directory = TestDirectory::new("quarantine");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        manager
            .register(manifest("com.acme.healthy", "0.2.0"), facts(true))
            .expect("healthy registration should succeed");
        let store_dir = directory.path.join(PLUGIN_MANAGER_DIRECTORY);
        fs::write(store_dir.join("v1-dead.json"), b"{").expect("damaged record should be written");
        fs::write(
            store_dir.join("v1-beef.json"),
            serde_json::to_vec(&json!({"format_version": 2})).expect("JSON should serialize"),
        )
        .expect("unknown record should be written");
        let wrong_manifest = manifest("com.acme.wrong", "0.2.0");
        let wrong_record = PluginRecordV1 {
            format_version: RECORD_FORMAT_VERSION,
            record_key: "v1-cafe".to_owned(),
            manifest: wrong_manifest,
            registration: record_facts(false),
        };
        fs::write(
            store_dir.join("v1-cafe.json"),
            serde_json::to_vec(&wrong_record).expect("record should serialize"),
        )
        .expect("mismatch record should be written");
        let inconsistent_manifest = manifest("com.acme.inconsistent", "0.2.0");
        let inconsistent_key = plugin_record_key(&inconsistent_manifest.plugin_id);
        let mut inconsistent_facts = record_facts(false);
        inconsistent_facts.granted_permission_ids =
            vec!["files.read".to_owned(), "clipboard.read".to_owned()];
        let inconsistent_record = PluginRecordV1 {
            format_version: RECORD_FORMAT_VERSION,
            record_key: inconsistent_key.clone(),
            manifest: inconsistent_manifest,
            registration: inconsistent_facts,
        };
        fs::write(
            store_dir.join(format!("{inconsistent_key}.json")),
            serde_json::to_vec(&inconsistent_record).expect("record should serialize"),
        )
        .expect("inconsistent record should be written");
        let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert_eq!(recovered.recovery_report().healthy_records, 1);
        assert_eq!(recovered.recovery_report().quarantined_records, 4);
        assert_eq!(
            recovered
                .quarantine("v1-dead")
                .expect("damaged record should be quarantined")
                .diagnostic
                .code,
            PluginManagerDiagnosticCode::RecordInvalid
        );
        assert_eq!(
            recovered
                .quarantine("v1-beef")
                .expect("unknown record should be quarantined")
                .diagnostic
                .code,
            PluginManagerDiagnosticCode::UnsupportedFormatVersion
        );
        assert_eq!(
            recovered
                .quarantine("v1-cafe")
                .expect("mismatch record should be quarantined")
                .diagnostic
                .code,
            PluginManagerDiagnosticCode::IdentityMismatch
        );
        assert_eq!(
            recovered
                .quarantine(&inconsistent_key)
                .expect("inconsistent record should be quarantined")
                .diagnostic
                .code,
            PluginManagerDiagnosticCode::RecordInvalid
        );
        assert!(store_dir.join("v1-dead.json").exists());
    }

    #[test]
    fn quarantine_is_replaced_only_by_a_complete_healthy_registration() {
        let directory = TestDirectory::new("quarantine-replacement");
        let plugin_id = "com.acme.replacement";
        let key = plugin_record_key(plugin_id);
        let store_dir = directory.path.join(PLUGIN_MANAGER_DIRECTORY);
        fs::create_dir_all(&store_dir).expect("store should exist");
        fs::write(store_dir.join(format!("{key}.json")), b"{")
            .expect("damaged record should be written");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert_eq!(manager.registration_revision(), "0");
        assert!(manager.quarantine(&key).is_some());
        let mut invalid = manifest(plugin_id, "0.2.0");
        invalid.publisher.homepage = "not-https".to_owned();
        assert!(manager.register(invalid, facts(false)).is_err());
        assert_eq!(manager.registration_revision(), "0");
        assert!(manager.quarantine(&key).is_some());
        assert_eq!(
            fs::read(store_dir.join(format!("{key}.json"))).expect("damaged record should remain"),
            b"{"
        );
        assert!(manager
            .register(manifest(plugin_id, "0.2.0"), facts(true))
            .is_ok());
        assert_eq!(manager.registration_revision(), "1");
        assert!(manager.quarantine(&key).is_none());
        assert!(
            manager
                .registration(plugin_id)
                .expect("replacement should exist")
                .facts
                .enabled
        );
    }

    #[test]
    fn real_changes_increment_revision_and_return_post_commit_events() {
        let directory = TestDirectory::new("revision");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert_eq!(manager.registration_revision(), "0");

        let registered = manager
            .register(manifest("com.acme.revision", "0.2.0"), facts(false))
            .expect("registration should succeed")
            .expect("registration should change state");
        assert_eq!(registered.revision, "1");

        assert!(manager
            .set_enabled("com.acme.revision", false)
            .expect("no-op should succeed")
            .is_none());
        assert_eq!(manager.registration_revision(), "1");

        let enabled = manager
            .set_enabled("com.acme.revision", true)
            .expect("enable should persist")
            .expect("enable should change state");
        assert_eq!(enabled.revision, "2");

        let diagnosed = manager
            .append_diagnostic("com.acme.revision", persist_diagnostic(0))
            .expect("diagnostic should persist")
            .expect("diagnostic should change state");
        assert_eq!(diagnosed.revision, "3");
        assert_eq!(manager.registration_revision(), "3");

        let recovered = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert_eq!(recovered.registration_revision(), "0");
        assert!(recovered.registration("com.acme.revision").is_some());
    }

    #[test]
    fn resource_generation_is_targeted_process_local_and_never_persisted_or_projected() {
        let directory = TestDirectory::new("resource-generation");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        let plugin_id = "com.acme.resource";
        manager
            .register(manifest(plugin_id, "0.2.0"), facts(false))
            .expect("registration should succeed");
        let registration = manager
            .registration(plugin_id)
            .expect("registration should exist");
        let entry_id = healthy_entry_id(&registration);
        let initial = manager
            .read_resource_projection(&entry_id, Some("1"))
            .expect("projection should exist");

        assert!(manager
            .set_enabled(plugin_id, false)
            .expect("no-op should succeed")
            .is_none());
        manager
            .append_diagnostic(plugin_id, persist_diagnostic(1))
            .expect("diagnostic should persist");
        let after_diagnostic = manager
            .read_resource_projection(&entry_id, None)
            .expect("projection should remain");
        assert_eq!(
            initial.resource_generation,
            after_diagnostic.resource_generation
        );

        manager
            .register(manifest("com.acme.unrelated", "0.2.0"), facts(true))
            .expect("unrelated registration should succeed");
        assert_eq!(
            initial.resource_generation,
            manager
                .read_resource_projection(&entry_id, None)
                .expect("projection should remain")
                .resource_generation
        );

        manager
            .set_enabled(plugin_id, true)
            .expect("enable should persist");
        let enabled = manager
            .read_resource_projection(&entry_id, None)
            .expect("projection should remain");
        assert_ne!(initial.resource_generation, enabled.resource_generation);

        manager.set_write_fault(Some(WriteFault::Write));
        assert!(manager.set_enabled(plugin_id, false).is_err());
        manager.set_write_fault(None);
        assert_eq!(
            enabled.resource_generation,
            manager
                .read_resource_projection(&entry_id, None)
                .expect("failed write should preserve projection")
                .resource_generation
        );

        let revision = manager.registration_revision();
        manager
            .replace_entry(
                &entry_id,
                &revision,
                manifest(plugin_id, "0.2.0"),
                facts(true),
            )
            .expect("replacement should persist");
        let replaced = manager
            .read_resource_projection(&entry_id, None)
            .expect("replacement projection should exist");
        assert_ne!(enabled.resource_generation, replaced.resource_generation);

        let store_file = directory
            .path
            .join(PLUGIN_MANAGER_DIRECTORY)
            .join(format!("{}.json", plugin_record_key(plugin_id)));
        let stored = fs::read_to_string(store_file).expect("record should be readable");
        assert!(!stored.contains("resource_generation"));
        let snapshot = serde_json::to_string(&manager.read_registration_snapshot())
            .expect("snapshot should serialize");
        let detail = serde_json::to_string(
            &manager
                .read_registration_detail(&entry_id)
                .expect("detail should exist"),
        )
        .expect("detail should serialize");
        assert!(!snapshot.contains("resource_generation"));
        assert!(!detail.contains("resource_generation"));

        let revision = manager.registration_revision();
        manager
            .remove_entry(&entry_id, &revision)
            .expect("removal should persist");
        assert!(matches!(
            manager.read_resource_projection(&entry_id, None),
            Err(PluginManagerResourceProjectionError::NotFound)
        ));
        manager
            .register(manifest(plugin_id, "0.2.0"), facts(true))
            .expect("re-registration should succeed");
        let re_registered = manager
            .read_resource_projection(&entry_id, None)
            .expect("re-registration should project");
        assert_ne!(
            replaced.resource_generation,
            re_registered.resource_generation
        );
    }

    #[test]
    fn unreadable_store_enters_degraded_state_without_overwriting_data() {
        let directory = TestDirectory::new("degraded");
        let store_path = directory.path.join(PLUGIN_MANAGER_DIRECTORY);
        fs::write(&store_path, b"preserve me").expect("blocking file should be written");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert!(manager.recovery_report().degraded);
        assert_eq!(manager.recovery_report().healthy_records, 0);
        assert_eq!(
            fs::read(&store_path).expect("original data should remain"),
            b"preserve me"
        );
    }

    #[test]
    fn empty_healthy_and_degraded_initialization_can_all_be_managed() {
        let empty_directory = TestDirectory::new("managed-empty");
        let empty = initialize_plugin_manager(Ok(empty_directory.path.clone()), versions("0.1.0"));
        assert_managed(&mock_app(), empty);

        let healthy_directory = TestDirectory::new("managed-healthy");
        let seeded = PluginManager::recover(&healthy_directory.path, versions("0.1.0"));
        seeded
            .register(manifest("com.acme.managed", "0.2.0"), facts(true))
            .expect("seed should persist");
        let healthy =
            initialize_plugin_manager(Ok(healthy_directory.path.clone()), versions("0.1.0"));
        assert_eq!(healthy.recovery_report().healthy_records, 1);
        assert_managed(&mock_app(), healthy);

        let degraded = initialize_plugin_manager(Err(()), versions("0.1.0"));
        assert!(degraded.recovery_report().degraded);
        assert_managed(&mock_app(), degraded);
    }
}
