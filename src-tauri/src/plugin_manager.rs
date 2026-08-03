use crate::plugin_manifest::{
    validate_plugin_manifest, NormalizedPluginManifest, PluginHostVersions,
    PluginManifestCompatibility, PluginManifestValidationStatus, PLUGIN_HOST_API_VERSION,
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
pub struct PluginRegistrationFacts {
    pub installation_path: String,
    pub package_digest: PackageDigest,
    pub source: PluginSource,
    pub enabled: bool,
    #[serde(default)]
    pub granted_permission_ids: Vec<String>,
    #[serde(default)]
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
            installation_path: installation_path.into(),
            package_digest,
            source,
            enabled,
            granted_permission_ids,
            diagnostics: Vec::new(),
        };
        facts.validate()?;
        Ok(facts)
    }

    fn validate(&self) -> Result<(), PluginManagerDiagnostic> {
        if !Path::new(&self.installation_path).is_absolute()
            || !is_safe_token(&self.package_digest.algorithm)
            || self.package_digest.value.is_empty()
            || !self
                .package_digest
                .value
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
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

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PluginManagerRecoveryReport {
    pub degraded: bool,
    pub healthy_records: usize,
    pub quarantined_records: usize,
    pub diagnostics: Vec<PluginManagerDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PluginRecordV1 {
    format_version: u32,
    record_key: String,
    manifest: NormalizedPluginManifest,
    registration: PluginRegistrationFacts,
}

impl PluginRecordV1 {
    fn from_registration(registration: &PluginRegistration) -> Self {
        Self {
            format_version: RECORD_FORMAT_VERSION,
            record_key: record_key(&registration.manifest.plugin_id),
            manifest: registration.manifest.clone(),
            registration: registration.facts.clone(),
        }
    }
}

#[derive(Clone, Debug, Default)]
struct PluginManagerSnapshot {
    healthy: BTreeMap<String, PluginRegistration>,
    quarantined: BTreeMap<String, QuarantineStub>,
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
                                let key = record_key(&plugin_id);
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

    pub fn register(
        &self,
        manifest: NormalizedPluginManifest,
        facts: PluginRegistrationFacts,
    ) -> Result<(), PluginManagerDiagnostic> {
        facts.validate()?;
        let compatibility = validate_normalized_manifest(&manifest, &self.versions)?;
        let plugin_id = manifest.plugin_id.clone();
        let key = record_key(&plugin_id);
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
        self.store
            .write_record(&PluginRecordV1::from_registration(&registration))?;
        snapshot.quarantined.remove(&key);
        snapshot.healthy.insert(plugin_id, registration);
        Ok(())
    }

    pub fn set_enabled(
        &self,
        plugin_id: &str,
        enabled: bool,
    ) -> Result<(), PluginManagerDiagnostic> {
        let mut snapshot = self.lock_snapshot();
        let mut next = snapshot
            .healthy
            .get(plugin_id)
            .cloned()
            .ok_or_else(PluginManagerDiagnostic::invalid_registration)?;
        next.facts.enabled = enabled;
        next.facts.validate()?;
        self.store
            .write_record(&PluginRecordV1::from_registration(&next))?;
        snapshot.healthy.insert(plugin_id.to_owned(), next);
        Ok(())
    }

    pub fn append_diagnostic(
        &self,
        plugin_id: &str,
        diagnostic: PluginManagerDiagnostic,
    ) -> Result<(), PluginManagerDiagnostic> {
        let mut snapshot = self.lock_snapshot();
        let mut next = snapshot
            .healthy
            .get(plugin_id)
            .cloned()
            .ok_or_else(PluginManagerDiagnostic::invalid_registration)?;
        next.facts.push_diagnostic(diagnostic);
        self.store
            .write_record(&PluginRecordV1::from_registration(&next))?;
        snapshot.healthy.insert(plugin_id.to_owned(), next);
        Ok(())
    }

    fn lock_snapshot(&self) -> MutexGuard<'_, PluginManagerSnapshot> {
        self.snapshot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[cfg(test)]
    fn set_write_fault(&self, fault: Option<WriteFault>) {
        *self
            .store
            .write_fault
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = fault;
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

fn record_key(plugin_id: &str) -> String {
    let encoded = plugin_id
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("v1-{encoded}")
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
    if record.record_key != candidate_key || record_key(&plugin_id) != candidate_key {
        return Err(QuarantineStub {
            record_key: candidate_key,
            plugin_id: Some(plugin_id),
            diagnostic: PluginManagerDiagnostic::new(
                PluginManagerDiagnosticCode::IdentityMismatch,
                PluginManagerDiagnosticPhase::Recover,
            ),
        });
    }
    record.registration.validate().map_err(|_| QuarantineStub {
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
        facts: record.registration,
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
        record.registration.validate()?;
        if record.format_version != RECORD_FORMAT_VERSION
            || record.record_key != record_key(&record.manifest.plugin_id)
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
            fs::rename(&temp_path, target_path)
                .map_err(|_| PluginManagerDiagnostic::persist_failed())
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        write_result
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
enum WriteFault {
    Create,
    Write,
    Sync,
    Replace,
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

pub fn setup_plugin_manager<R: Runtime>(app: &AppHandle<R>) {
    let versions = current_plugin_host_versions(app.package_info().version.to_string());
    let config_dir = app.path().app_config_dir().map_err(|_| ());
    let manager = initialize_plugin_manager(config_dir, versions);
    let managed = manage_plugin_manager(app, manager);
    debug_assert!(managed, "Plugin Manager state should only be managed once");
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
        assert!(
            manager
                .registration("com.acme.duplicate")
                .expect("original should remain")
                .facts
                .enabled
        );
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
            manager.set_write_fault(Some(fault));
            let error = manager
                .set_enabled("com.acme.atomic", true)
                .expect_err("fault should reject transition");
            assert_eq!(error.code, PluginManagerDiagnosticCode::PersistFailed);
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
            registration: facts(false),
        };
        fs::write(
            store_dir.join("v1-cafe.json"),
            serde_json::to_vec(&wrong_record).expect("record should serialize"),
        )
        .expect("mismatch record should be written");
        let inconsistent_manifest = manifest("com.acme.inconsistent", "0.2.0");
        let inconsistent_key = record_key(&inconsistent_manifest.plugin_id);
        let mut inconsistent_facts = facts(false);
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
        let key = record_key(plugin_id);
        let store_dir = directory.path.join(PLUGIN_MANAGER_DIRECTORY);
        fs::create_dir_all(&store_dir).expect("store should exist");
        fs::write(store_dir.join(format!("{key}.json")), b"{")
            .expect("damaged record should be written");
        let manager = PluginManager::recover(&directory.path, versions("0.1.0"));
        assert!(manager.quarantine(&key).is_some());
        let mut invalid = manifest(plugin_id, "0.2.0");
        invalid.publisher.homepage = "not-https".to_owned();
        assert!(manager.register(invalid, facts(false)).is_err());
        assert!(manager.quarantine(&key).is_some());
        assert_eq!(
            fs::read(store_dir.join(format!("{key}.json"))).expect("damaged record should remain"),
            b"{"
        );
        assert!(manager
            .register(manifest(plugin_id, "0.2.0"), facts(true))
            .is_ok());
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
