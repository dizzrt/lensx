use crate::{
    plugin_identity::plugin_record_key,
    plugin_installation_contract::{
        LocalPluginInstallationError, LocalPluginInstallationErrorCode,
        LocalPluginInstallationOperation, LocalPluginInstallationResult,
    },
    plugin_manager::{
        PackageDigest, PluginManager, PluginManagerDiagnosticCode, PluginRegistrationFacts,
        PluginSource,
    },
    plugin_package_format::{
        inspect_plugin_package, traverse_plugin_package, PackageEntrySink, PackageInspectionResult,
        PackageTraversalFailure,
    },
    plugin_registration::{emit_plugin_registration_changed, PluginRegistrationEventEmitter},
};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeSet, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

const MAX_COMPRESSED_BYTES: u64 = 64 * 1024 * 1024;
const STAGING_DIRECTORY: &str = ".staging";
const PACKAGES_DIRECTORY: &str = "packages";
const DATA_DIRECTORY: &str = "data";
const CLEANUP_DIRECTORY: &str = ".cleanup";
const INSTALL_LOCK_FILE: &str = ".install.lock";
const CLEANUP_RECORD_VERSION: u32 = 1;
const MAX_INSTALLER_DIAGNOSTICS: usize = 32;
static STAGING_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum InstallerAvailability {
    Available,
    Degraded,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginInstallerDiagnostic {
    pub code: &'static str,
    pub operation: &'static str,
    pub message: &'static str,
}

#[derive(Debug)]
pub struct PluginInstaller {
    root: Option<PathBuf>,
    manager: Arc<PluginManager>,
    process_lock: Mutex<()>,
    availability: Mutex<InstallerAvailability>,
    recovered: Mutex<bool>,
    diagnostics: Mutex<Vec<PluginInstallerDiagnostic>>,
    blocked_plugin_keys: Mutex<HashSet<String>>,
    #[cfg(test)]
    cleanup_fault: Mutex<bool>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginCommitBoundaryError {
    Busy,
    Unavailable,
}

pub(crate) struct PluginCommitGuard<'a> {
    _process: MutexGuard<'a, ()>,
    _file: File,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CleanupDataPolicy {
    RetainData,
    DeleteData,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PluginCleanupRecord {
    version: u32,
    plugin_key: String,
    entry_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    plugin_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_digest: Option<String>,
    data_policy: CleanupDataPolicy,
    program_complete: bool,
    data_complete: bool,
    completed: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct PluginUninstallCommit {
    pub change: Option<crate::plugin_registration::PluginRegistrationChangedEvent>,
    pub cleanup_pending: bool,
    pub plugin_id: Option<String>,
    pub revision: String,
    pub changed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginLifecycleStorageError {
    Busy,
    Conflict,
    InvalidState,
    NotFound,
    OperationNotSupported,
    PersistFailed,
    Unavailable,
    UnsafeCleanup,
}

impl PluginInstaller {
    pub fn initialize(root: Result<PathBuf, ()>, manager: Arc<PluginManager>) -> Arc<Self> {
        let (root, availability) = match root {
            Ok(root) if root.is_absolute() => (Some(root), InstallerAvailability::Available),
            _ => (None, InstallerAvailability::Unavailable),
        };
        let installer = Arc::new(Self {
            root,
            manager,
            process_lock: Mutex::new(()),
            availability: Mutex::new(availability),
            recovered: Mutex::new(false),
            diagnostics: Mutex::new(Vec::new()),
            blocked_plugin_keys: Mutex::new(HashSet::new()),
            #[cfg(test)]
            cleanup_fault: Mutex::new(false),
        });
        if installer.root.is_none() {
            installer.record_diagnostic(PluginInstallerDiagnostic {
                code: "installer_unavailable",
                operation: "initialize",
                message: "Local plugin installation storage is unavailable.",
            });
            return installer;
        }
        match installer.acquire_commit_boundary() {
            Ok(_guard) => {
                if installer.recover_locked().is_err() {
                    installer.set_availability(InstallerAvailability::Degraded);
                }
            }
            Err(PluginCommitBoundaryError::Busy) => {}
            Err(_) => installer.set_availability(InstallerAvailability::Unavailable),
        }
        installer
    }

    pub fn diagnostics(&self) -> Vec<PluginInstallerDiagnostic> {
        self.diagnostics
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub(crate) fn set_enabled(
        &self,
        entry_id: &str,
        expected_revision: &str,
        enabled: bool,
    ) -> Result<
        (
            crate::plugin_manager::PluginRegistration,
            Option<crate::plugin_registration::PluginRegistrationChangedEvent>,
        ),
        PluginLifecycleStorageError,
    > {
        let _guard = self
            .acquire_commit_boundary()
            .map_err(map_commit_boundary_error)?;
        self.ensure_recovered_locked()
            .map_err(|_| PluginLifecycleStorageError::Unavailable)?;
        self.manager
            .set_enabled_entry(entry_id, expected_revision, enabled)
            .map_err(map_manager_lifecycle_error)
    }

    pub(crate) fn uninstall(
        &self,
        entry_id: &str,
        expected_revision: &str,
        data_policy: CleanupDataPolicy,
    ) -> Result<PluginUninstallCommit, PluginLifecycleStorageError> {
        let _guard = self
            .acquire_commit_boundary()
            .map_err(map_commit_boundary_error)?;
        self.ensure_recovered_locked()
            .map_err(|_| PluginLifecycleStorageError::Unavailable)?;
        if self.manager.registration_revision() != expected_revision {
            return Err(PluginLifecycleStorageError::Conflict);
        }

        let root = self
            .root
            .as_ref()
            .ok_or(PluginLifecycleStorageError::Unavailable)?;
        let packages_root = root.join(PACKAGES_DIRECTORY);
        let data_root = root.join(DATA_DIRECTORY);
        let resolved = match self
            .manager
            .resolve_lifecycle_entry(entry_id, expected_revision)
        {
            Ok(entry) => Some(entry),
            Err(error) if error.code() == PluginManagerDiagnosticCode::NotFound => None,
            Err(error) => return Err(map_manager_lifecycle_error(error)),
        };

        if resolved.is_none() {
            let mut record = self
                .find_cleanup_record_by_entry_id(entry_id)?
                .ok_or(PluginLifecycleStorageError::NotFound)?;
            if record.data_policy != data_policy {
                return Err(PluginLifecycleStorageError::Conflict);
            }
            self.complete_cleanup(&mut record, &packages_root, &data_root)?;
            self.unblock_plugin_key(&record.plugin_key);
            return Ok(PluginUninstallCommit {
                change: None,
                cleanup_pending: !record.completed,
                plugin_id: record.plugin_id,
                revision: self.manager.registration_revision(),
                changed: false,
            });
        }

        let entry = resolved.expect("resolved lifecycle entry should be present");
        let plugin_key = entry.record_key().to_owned();
        if self.is_plugin_key_blocked(&plugin_key) {
            return Err(PluginLifecycleStorageError::UnsafeCleanup);
        }
        let mut record = match self.read_cleanup_record(&plugin_key)? {
            Some(record) => {
                if record.entry_id != entry_id || record.data_policy != data_policy {
                    return Err(PluginLifecycleStorageError::Conflict);
                }
                record
            }
            None => {
                let package_digest = self.prove_managed_payload(&entry, &packages_root)?;
                self.prove_data_subtree(&plugin_key, &data_root)?;
                let record = PluginCleanupRecord {
                    version: CLEANUP_RECORD_VERSION,
                    plugin_key: plugin_key.clone(),
                    entry_id: entry_id.to_owned(),
                    plugin_id: entry.plugin_id().map(str::to_owned),
                    package_digest,
                    data_policy,
                    program_complete: false,
                    data_complete: data_policy == CleanupDataPolicy::RetainData,
                    completed: false,
                };
                self.write_cleanup_record(&record)?;
                record
            }
        };

        let removal = match self.manager.remove_entry(entry_id, expected_revision) {
            Ok(removal) => removal,
            Err(error) => {
                let _ = self.delete_cleanup_record(&plugin_key);
                return Err(map_manager_lifecycle_error(error));
            }
        };
        let revision = removal.change.revision.clone();
        let plugin_id = removal.entry.plugin_id().map(str::to_owned);
        let cleanup_result = self.complete_cleanup(&mut record, &packages_root, &data_root);
        let cleanup_pending = cleanup_result.is_err() || !record.completed;
        if cleanup_result.is_err() {
            self.block_plugin_key(&plugin_key, "cleanup_pending");
        }
        Ok(PluginUninstallCommit {
            change: Some(removal.change),
            cleanup_pending,
            plugin_id,
            revision,
            changed: true,
        })
    }

    #[cfg(test)]
    pub(crate) fn set_cleanup_fault(&self, enabled: bool) {
        *self
            .cleanup_fault
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = enabled;
    }

    pub fn install_source(
        &self,
        source: &Path,
        emitter: &impl PluginRegistrationEventEmitter,
    ) -> Result<LocalPluginInstallationResult, LocalPluginInstallationError> {
        let _guard = self
            .acquire_commit_boundary()
            .map_err(commit_boundary_installation_error)?;
        self.ensure_recovered_locked()?;
        let bytes = read_source_capped(source)?;
        self.install_bytes_locked(&bytes, emitter)
    }

    #[cfg(test)]
    fn install_bytes(
        &self,
        bytes: &[u8],
        emitter: &impl PluginRegistrationEventEmitter,
    ) -> Result<LocalPluginInstallationResult, LocalPluginInstallationError> {
        let _guard = self
            .acquire_commit_boundary()
            .map_err(commit_boundary_installation_error)?;
        self.ensure_recovered_locked()?;
        self.install_bytes_locked(bytes, emitter)
    }

    fn install_bytes_locked(
        &self,
        bytes: &[u8],
        emitter: &impl PluginRegistrationEventEmitter,
    ) -> Result<LocalPluginInstallationResult, LocalPluginInstallationError> {
        if self.current_availability() != InstallerAvailability::Available
            || self.manager.recovery_report().degraded
        {
            return Err(installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Recover,
            ));
        }
        let inspection = inspect_plugin_package(bytes, &self.manager.host_versions());
        let (manifest, facts) = match inspection {
            PackageInspectionResult::Invalid { diagnostics } => {
                return Err(installation_error(
                    LocalPluginInstallationErrorCode::InvalidPackage,
                    LocalPluginInstallationOperation::Inspect,
                )
                .with_package_diagnostics(&diagnostics));
            }
            PackageInspectionResult::Incompatible { .. } => {
                return Err(installation_error(
                    LocalPluginInstallationErrorCode::Incompatible,
                    LocalPluginInstallationOperation::Inspect,
                ));
            }
            PackageInspectionResult::Compatible {
                manifest, facts, ..
            } => (manifest, facts),
        };

        let plugin_key = plugin_record_key(&manifest.plugin_id);
        self.reject_cleanup_conflict(&plugin_key)?;
        self.reject_existing_identity(&manifest.plugin_id)?;
        let root = self.root.as_ref().ok_or_else(|| {
            installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Commit,
            )
        })?;
        let staging_path = root.join(STAGING_DIRECTORY).join(staging_identity());
        fs::create_dir(&staging_path).map_err(|_| {
            installation_error(
                LocalPluginInstallationErrorCode::ExtractionFailed,
                LocalPluginInstallationOperation::Extract,
            )
        })?;
        let extraction =
            extract_package(bytes, &facts.files, facts.decompressed_size, &staging_path);
        if extraction.is_err() {
            let _ = remove_tree_no_follow(&staging_path);
            return Err(installation_error(
                LocalPluginInstallationErrorCode::ExtractionFailed,
                LocalPluginInstallationOperation::Extract,
            ));
        }

        self.reject_existing_identity(&manifest.plugin_id)
            .map_err(|error| {
                let _ = remove_tree_no_follow(&staging_path);
                error
            })?;

        let plugin_directory = root.join(PACKAGES_DIRECTORY).join(&plugin_key);
        ensure_real_directory(&plugin_directory).map_err(|_| {
            let _ = remove_tree_no_follow(&staging_path);
            installation_error(
                LocalPluginInstallationErrorCode::CommitFailed,
                LocalPluginInstallationOperation::Commit,
            )
        })?;
        let final_path = plugin_directory.join(&facts.package_digest.value);
        if final_path.exists() || fs::rename(&staging_path, &final_path).is_err() {
            let _ = remove_tree_no_follow(&staging_path);
            return Err(installation_error(
                LocalPluginInstallationErrorCode::CommitFailed,
                LocalPluginInstallationOperation::Commit,
            ));
        }
        if sync_directory(&plugin_directory).is_err() {
            let _ = remove_tree_no_follow(&final_path);
            return Err(installation_error(
                LocalPluginInstallationErrorCode::CommitFailed,
                LocalPluginInstallationOperation::Commit,
            ));
        }

        let registration_facts = PluginRegistrationFacts::new(
            final_path.to_string_lossy().into_owned(),
            PackageDigest {
                algorithm: "sha256".to_owned(),
                value: facts.package_digest.value,
            },
            PluginSource::External,
            true,
        )
        .map_err(|_| {
            let _ = remove_tree_no_follow(&final_path);
            installation_error(
                LocalPluginInstallationErrorCode::RegistrationFailed,
                LocalPluginInstallationOperation::Register,
            )
        })?;
        let plugin_id = manifest.plugin_id.clone();
        let version = manifest.version.clone();
        let change = self
            .manager
            .register(manifest, registration_facts)
            .map_err(|error| {
                let _ = remove_tree_no_follow(&final_path);
                let code = if error.code() == PluginManagerDiagnosticCode::DuplicateIdentity {
                    LocalPluginInstallationErrorCode::AlreadyInstalled
                } else {
                    LocalPluginInstallationErrorCode::RegistrationFailed
                };
                installation_error(code, LocalPluginInstallationOperation::Register)
            })?;
        let change = change.ok_or_else(|| {
            let _ = remove_tree_no_follow(&final_path);
            installation_error(
                LocalPluginInstallationErrorCode::Internal,
                LocalPluginInstallationOperation::Register,
            )
        })?;
        let revision = change.revision.clone();
        if self.clear_completed_cleanup_record(&plugin_key).is_err() {
            self.block_plugin_key(&plugin_key, "cleanup_record_clear_failed");
        }
        let _ = emit_plugin_registration_changed(emitter, &change);
        Ok(LocalPluginInstallationResult::installed(
            plugin_id, version, revision,
        ))
    }

    fn reject_existing_identity(
        &self,
        plugin_id: &str,
    ) -> Result<(), LocalPluginInstallationError> {
        if self.manager.registration(plugin_id).is_some() {
            return Err(installation_error(
                LocalPluginInstallationErrorCode::AlreadyInstalled,
                LocalPluginInstallationOperation::Register,
            ));
        }
        if self
            .manager
            .quarantine(&plugin_record_key(plugin_id))
            .is_some()
        {
            return Err(installation_error(
                LocalPluginInstallationErrorCode::IdentityQuarantined,
                LocalPluginInstallationOperation::Register,
            ));
        }
        Ok(())
    }

    pub(crate) fn acquire_commit_boundary(
        &self,
    ) -> Result<PluginCommitGuard<'_>, PluginCommitBoundaryError> {
        if self.current_availability() == InstallerAvailability::Unavailable {
            return Err(PluginCommitBoundaryError::Unavailable);
        }
        let process = self
            .process_lock
            .try_lock()
            .map_err(|_| PluginCommitBoundaryError::Busy)?;
        let root = self
            .root
            .as_ref()
            .ok_or(PluginCommitBoundaryError::Unavailable)?;
        fs::create_dir_all(root).map_err(|_| PluginCommitBoundaryError::Unavailable)?;
        let lock_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(root.join(INSTALL_LOCK_FILE))
            .map_err(|_| PluginCommitBoundaryError::Unavailable)?;
        lock_file.try_lock_exclusive().map_err(|error| {
            if error.kind() == std::io::ErrorKind::WouldBlock {
                PluginCommitBoundaryError::Busy
            } else {
                PluginCommitBoundaryError::Unavailable
            }
        })?;
        Ok(PluginCommitGuard {
            _process: process,
            _file: lock_file,
        })
    }

    fn ensure_recovered_locked(&self) -> Result<(), LocalPluginInstallationError> {
        if *self
            .recovered
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
        {
            return Ok(());
        }
        self.recover_locked().map_err(|()| {
            installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Recover,
            )
        })
    }

    fn recover_locked(&self) -> Result<(), ()> {
        if self.manager.recovery_report().degraded {
            self.record_recovery_failure("manager_degraded");
            return Err(());
        }
        let root = self.root.as_ref().ok_or(())?;
        let staging_root = root.join(STAGING_DIRECTORY);
        let packages_root = root.join(PACKAGES_DIRECTORY);
        let data_root = root.join(DATA_DIRECTORY);
        let cleanup_root = root.join(CLEANUP_DIRECTORY);
        ensure_real_directory(&staging_root).map_err(|_| ())?;
        ensure_real_directory(&packages_root).map_err(|_| ())?;
        ensure_real_directory(&data_root).map_err(|_| ())?;
        ensure_real_directory(&cleanup_root).map_err(|_| ())?;

        for entry in fs::read_dir(&staging_root).map_err(|_| ())? {
            let entry = entry.map_err(|_| ())?;
            let name = entry.file_name();
            let name = name.to_str().ok_or(())?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| ())?;
            if is_staging_identity(name) && metadata.is_dir() && !metadata.file_type().is_symlink()
            {
                remove_tree_no_follow(&entry.path()).map_err(|_| ())?;
            } else {
                self.record_recovery_failure("unknown_staging_entry");
                return Err(());
            }
        }

        let recovery = self.manager.installer_recovery_facts();
        let active_paths: HashSet<_> = recovery
            .healthy_installation_paths
            .iter()
            .filter_map(|(key, path)| canonical_payload_path(&packages_root, key, path))
            .collect();
        if active_paths.len() != recovery.healthy_installation_paths.len() {
            self.record_recovery_failure("noncanonical_registration_path");
            return Err(());
        }
        let quarantine_keys: HashSet<_> = recovery.quarantined_record_keys.into_iter().collect();
        let active_keys: HashSet<_> = recovery
            .healthy_installation_paths
            .iter()
            .map(|(key, _)| key.clone())
            .chain(quarantine_keys.iter().cloned())
            .collect();

        self.recover_cleanup_records(&cleanup_root, &packages_root, &data_root, &active_keys)?;

        for key_entry in fs::read_dir(&packages_root).map_err(|_| ())? {
            let key_entry = key_entry.map_err(|_| ())?;
            let key = key_entry.file_name();
            let key = key.to_str().ok_or(())?;
            let metadata = fs::symlink_metadata(key_entry.path()).map_err(|_| ())?;
            if !is_plugin_key(key) || !metadata.is_dir() || metadata.file_type().is_symlink() {
                self.record_recovery_failure("unknown_package_entry");
                return Err(());
            }
            if quarantine_keys.contains(key) {
                continue;
            }
            for digest_entry in fs::read_dir(key_entry.path()).map_err(|_| ())? {
                let digest_entry = digest_entry.map_err(|_| ())?;
                let digest = digest_entry.file_name();
                let digest = digest.to_str().ok_or(())?;
                let metadata = fs::symlink_metadata(digest_entry.path()).map_err(|_| ())?;
                if !is_digest(digest) || !metadata.is_dir() || metadata.file_type().is_symlink() {
                    self.record_recovery_failure("unknown_payload_entry");
                    return Err(());
                }
                if !active_paths.contains(&digest_entry.path()) {
                    remove_tree_no_follow(&digest_entry.path()).map_err(|_| ())?;
                }
            }
        }
        *self
            .recovered
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = true;
        Ok(())
    }

    fn current_availability(&self) -> InstallerAvailability {
        *self
            .availability
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn set_availability(&self, availability: InstallerAvailability) {
        *self
            .availability
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = availability;
    }

    fn record_recovery_failure(&self, code: &'static str) {
        self.set_availability(InstallerAvailability::Degraded);
        self.record_diagnostic(PluginInstallerDiagnostic {
            code,
            operation: "recover",
            message: "Local plugin installation recovery could not complete safely.",
        });
    }

    fn record_diagnostic(&self, diagnostic: PluginInstallerDiagnostic) {
        let mut diagnostics = self
            .diagnostics
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if diagnostics.len() == MAX_INSTALLER_DIAGNOSTICS {
            diagnostics.remove(0);
        }
        diagnostics.push(diagnostic);
    }

    fn cleanup_root(&self) -> Result<PathBuf, PluginLifecycleStorageError> {
        self.root
            .as_ref()
            .map(|root| root.join(CLEANUP_DIRECTORY))
            .ok_or(PluginLifecycleStorageError::Unavailable)
    }

    fn cleanup_record_path(
        &self,
        plugin_key: &str,
    ) -> Result<PathBuf, PluginLifecycleStorageError> {
        if !is_plugin_key(plugin_key) {
            return Err(PluginLifecycleStorageError::UnsafeCleanup);
        }
        Ok(self.cleanup_root()?.join(format!("{plugin_key}.json")))
    }

    fn read_cleanup_record(
        &self,
        plugin_key: &str,
    ) -> Result<Option<PluginCleanupRecord>, PluginLifecycleStorageError> {
        let path = self.cleanup_record_path(plugin_key)?;
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(PluginLifecycleStorageError::UnsafeCleanup),
        };
        let record: PluginCleanupRecord = serde_json::from_slice(&bytes)
            .map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)?;
        validate_cleanup_record(&record, plugin_key)?;
        Ok(Some(record))
    }

    fn find_cleanup_record_by_entry_id(
        &self,
        entry_id: &str,
    ) -> Result<Option<PluginCleanupRecord>, PluginLifecycleStorageError> {
        let cleanup_root = self.cleanup_root()?;
        let mut match_record = None;
        for entry in
            fs::read_dir(&cleanup_root).map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)?
        {
            let entry = entry.map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)?;
            let name = entry
                .file_name()
                .to_str()
                .map(str::to_owned)
                .ok_or(PluginLifecycleStorageError::UnsafeCleanup)?;
            let Some(plugin_key) = name.strip_suffix(".json") else {
                continue;
            };
            let Some(record) = self.read_cleanup_record(plugin_key)? else {
                continue;
            };
            if record.entry_id == entry_id {
                if match_record.is_some() {
                    return Err(PluginLifecycleStorageError::UnsafeCleanup);
                }
                match_record = Some(record);
            }
        }
        Ok(match_record)
    }

    fn write_cleanup_record(
        &self,
        record: &PluginCleanupRecord,
    ) -> Result<(), PluginLifecycleStorageError> {
        validate_cleanup_record(record, &record.plugin_key)?;
        let cleanup_root = self.cleanup_root()?;
        ensure_real_directory(&cleanup_root)
            .map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)?;
        let target = self.cleanup_record_path(&record.plugin_key)?;
        let sequence = STAGING_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temporary = cleanup_root.join(format!(
            ".{}.{}.{}.tmp",
            record.plugin_key,
            std::process::id(),
            sequence
        ));
        let bytes = serde_json::to_vec_pretty(record)
            .map_err(|_| PluginLifecycleStorageError::PersistFailed)?;
        let result = (|| {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temporary)
                .map_err(|_| PluginLifecycleStorageError::PersistFailed)?;
            file.write_all(&bytes)
                .and_then(|_| file.write_all(b"\n"))
                .and_then(|_| file.sync_all())
                .map_err(|_| PluginLifecycleStorageError::PersistFailed)?;
            fs::rename(&temporary, &target)
                .map_err(|_| PluginLifecycleStorageError::PersistFailed)?;
            sync_directory(&cleanup_root).map_err(|_| PluginLifecycleStorageError::PersistFailed)
        })();
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }

    fn delete_cleanup_record(&self, plugin_key: &str) -> Result<(), PluginLifecycleStorageError> {
        let path = self.cleanup_record_path(plugin_key)?;
        match fs::remove_file(path) {
            Ok(()) => sync_directory(&self.cleanup_root()?)
                .map_err(|_| PluginLifecycleStorageError::PersistFailed),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(PluginLifecycleStorageError::PersistFailed),
        }
    }

    fn clear_completed_cleanup_record(
        &self,
        plugin_key: &str,
    ) -> Result<(), PluginLifecycleStorageError> {
        if self
            .read_cleanup_record(plugin_key)?
            .is_some_and(|record| record.completed)
        {
            self.delete_cleanup_record(plugin_key)?;
        }
        Ok(())
    }

    fn recover_cleanup_records(
        &self,
        cleanup_root: &Path,
        packages_root: &Path,
        data_root: &Path,
        active_keys: &HashSet<String>,
    ) -> Result<(), ()> {
        for entry in fs::read_dir(cleanup_root).map_err(|_| ())? {
            let entry = entry.map_err(|_| ())?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| ())?;
            let name = entry.file_name();
            let name = name.to_str().ok_or(())?;
            let Some(plugin_key) = name.strip_suffix(".json") else {
                if name.starts_with('.') && name.ends_with(".tmp") {
                    continue;
                }
                self.record_recovery_failure("unknown_cleanup_entry");
                return Err(());
            };
            if !is_plugin_key(plugin_key)
                || !metadata.is_file()
                || metadata.file_type().is_symlink()
            {
                self.record_recovery_failure("unsafe_cleanup_entry");
                return Err(());
            }
            let mut record = match self.read_cleanup_record(plugin_key) {
                Ok(Some(record)) => record,
                _ => {
                    self.block_plugin_key(plugin_key, "malformed_cleanup_record");
                    continue;
                }
            };
            if active_keys.contains(plugin_key) {
                self.block_plugin_key(plugin_key, "cleanup_record_conflict");
                continue;
            }
            if self
                .complete_cleanup(&mut record, packages_root, data_root)
                .is_err()
            {
                self.block_plugin_key(plugin_key, "cleanup_recovery_pending");
            } else {
                self.unblock_plugin_key(plugin_key);
            }
        }
        Ok(())
    }

    fn prove_managed_payload(
        &self,
        entry: &crate::plugin_manager::PluginManagerLifecycleEntry,
        packages_root: &Path,
    ) -> Result<Option<String>, PluginLifecycleStorageError> {
        let plugin_key = entry.record_key();
        match entry {
            crate::plugin_manager::PluginManagerLifecycleEntry::Healthy {
                registration, ..
            } => {
                let path = PathBuf::from(&registration.facts.installation_path);
                let canonical = canonical_payload_path(packages_root, plugin_key, &path)
                    .ok_or(PluginLifecycleStorageError::OperationNotSupported)?;
                let digest = canonical
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or(PluginLifecycleStorageError::OperationNotSupported)?;
                if registration.facts.package_digest.algorithm != "sha256"
                    || registration.facts.package_digest.value != digest
                {
                    return Err(PluginLifecycleStorageError::OperationNotSupported);
                }
                validate_real_tree(&canonical)?;
                Ok(Some(digest.to_owned()))
            }
            crate::plugin_manager::PluginManagerLifecycleEntry::Quarantined { .. } => {
                let subtree = packages_root.join(plugin_key);
                validate_package_key_tree(&subtree)?;
                Ok(None)
            }
        }
    }

    fn prove_data_subtree(
        &self,
        plugin_key: &str,
        data_root: &Path,
    ) -> Result<(), PluginLifecycleStorageError> {
        let path = data_root.join(plugin_key);
        if path.exists() {
            validate_real_tree(&path)?;
        }
        Ok(())
    }

    fn complete_cleanup(
        &self,
        record: &mut PluginCleanupRecord,
        packages_root: &Path,
        data_root: &Path,
    ) -> Result<(), PluginLifecycleStorageError> {
        #[cfg(test)]
        if *self
            .cleanup_fault
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
        {
            return Err(PluginLifecycleStorageError::PersistFailed);
        }
        if !record.program_complete {
            cleanup_program_subtree(record, packages_root)?;
            record.program_complete = true;
            self.write_cleanup_record(record)?;
        }
        if !record.data_complete {
            if record.data_policy == CleanupDataPolicy::DeleteData {
                remove_optional_real_tree(&data_root.join(&record.plugin_key), data_root)?;
            }
            record.data_complete = true;
            self.write_cleanup_record(record)?;
        }
        if !record.completed {
            record.completed = record.program_complete && record.data_complete;
            self.write_cleanup_record(record)?;
        }
        Ok(())
    }

    fn is_plugin_key_blocked(&self, plugin_key: &str) -> bool {
        self.blocked_plugin_keys
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .contains(plugin_key)
    }

    fn block_plugin_key(&self, plugin_key: &str, code: &'static str) {
        self.blocked_plugin_keys
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(plugin_key.to_owned());
        self.record_diagnostic(PluginInstallerDiagnostic {
            code,
            operation: "recover",
            message: "Plugin lifecycle cleanup could not complete safely.",
        });
    }

    fn unblock_plugin_key(&self, plugin_key: &str) {
        self.blocked_plugin_keys
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(plugin_key);
    }

    fn reject_cleanup_conflict(
        &self,
        plugin_key: &str,
    ) -> Result<(), LocalPluginInstallationError> {
        if self
            .blocked_plugin_keys
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .contains(plugin_key)
        {
            return Err(installation_error(
                LocalPluginInstallationErrorCode::Busy,
                LocalPluginInstallationOperation::Recover,
            ));
        }
        let Some(record) = self.read_cleanup_record(plugin_key).map_err(|_| {
            installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Recover,
            )
        })?
        else {
            return Ok(());
        };
        if record.completed {
            Ok(())
        } else {
            Err(installation_error(
                LocalPluginInstallationErrorCode::Busy,
                LocalPluginInstallationOperation::Recover,
            ))
        }
    }
}

fn commit_boundary_installation_error(
    error: PluginCommitBoundaryError,
) -> LocalPluginInstallationError {
    installation_error(
        match error {
            PluginCommitBoundaryError::Busy => LocalPluginInstallationErrorCode::Busy,
            PluginCommitBoundaryError::Unavailable => LocalPluginInstallationErrorCode::Unavailable,
        },
        LocalPluginInstallationOperation::Commit,
    )
}

fn map_commit_boundary_error(error: PluginCommitBoundaryError) -> PluginLifecycleStorageError {
    match error {
        PluginCommitBoundaryError::Busy => PluginLifecycleStorageError::Busy,
        PluginCommitBoundaryError::Unavailable => PluginLifecycleStorageError::Unavailable,
    }
}

fn map_manager_lifecycle_error(
    error: crate::plugin_manager::PluginManagerDiagnostic,
) -> PluginLifecycleStorageError {
    match error.code() {
        PluginManagerDiagnosticCode::StaleRevision => PluginLifecycleStorageError::Conflict,
        PluginManagerDiagnosticCode::InvalidState => PluginLifecycleStorageError::InvalidState,
        PluginManagerDiagnosticCode::NotFound => PluginLifecycleStorageError::NotFound,
        PluginManagerDiagnosticCode::StoreUnavailable => PluginLifecycleStorageError::Unavailable,
        PluginManagerDiagnosticCode::PersistFailed => PluginLifecycleStorageError::PersistFailed,
        _ => PluginLifecycleStorageError::InvalidState,
    }
}

fn validate_cleanup_record(
    record: &PluginCleanupRecord,
    expected_plugin_key: &str,
) -> Result<(), PluginLifecycleStorageError> {
    if record.version != CLEANUP_RECORD_VERSION
        || record.plugin_key != expected_plugin_key
        || !is_plugin_key(&record.plugin_key)
        || !crate::plugin_registration::is_valid_plugin_registration_entry_id(&record.entry_id)
        || record.plugin_id.as_ref().is_some_and(String::is_empty)
        || record
            .package_digest
            .as_ref()
            .is_some_and(|digest| !is_digest(digest))
        || (record.data_policy == CleanupDataPolicy::RetainData && !record.data_complete)
        || (record.completed && (!record.program_complete || !record.data_complete))
    {
        return Err(PluginLifecycleStorageError::UnsafeCleanup);
    }
    Ok(())
}

fn validate_real_tree(path: &Path) -> Result<(), PluginLifecycleStorageError> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)?;
    if metadata.file_type().is_symlink() {
        return Err(PluginLifecycleStorageError::UnsafeCleanup);
    }
    if metadata.is_file() {
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err(PluginLifecycleStorageError::UnsafeCleanup);
    }
    for entry in fs::read_dir(path).map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)? {
        let entry = entry.map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)?;
        validate_real_tree(&entry.path())?;
    }
    Ok(())
}

fn validate_package_key_tree(path: &Path) -> Result<(), PluginLifecycleStorageError> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| PluginLifecycleStorageError::OperationNotSupported)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(PluginLifecycleStorageError::UnsafeCleanup);
    }
    let mut saw_payload = false;
    for entry in fs::read_dir(path).map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)? {
        let entry = entry.map_err(|_| PluginLifecycleStorageError::UnsafeCleanup)?;
        let digest = entry
            .file_name()
            .to_str()
            .map(str::to_owned)
            .ok_or(PluginLifecycleStorageError::UnsafeCleanup)?;
        if !is_digest(&digest) {
            return Err(PluginLifecycleStorageError::UnsafeCleanup);
        }
        validate_real_tree(&entry.path())?;
        saw_payload = true;
    }
    if !saw_payload {
        return Err(PluginLifecycleStorageError::OperationNotSupported);
    }
    Ok(())
}

fn remove_optional_real_tree(
    path: &Path,
    expected_parent: &Path,
) -> Result<(), PluginLifecycleStorageError> {
    if path.parent() != Some(expected_parent) {
        return Err(PluginLifecycleStorageError::UnsafeCleanup);
    }
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(PluginLifecycleStorageError::UnsafeCleanup),
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(PluginLifecycleStorageError::UnsafeCleanup);
    }
    validate_real_tree(path)?;
    remove_tree_no_follow(path).map_err(|_| PluginLifecycleStorageError::PersistFailed)?;
    sync_directory(expected_parent).map_err(|_| PluginLifecycleStorageError::PersistFailed)
}

fn cleanup_program_subtree(
    record: &PluginCleanupRecord,
    packages_root: &Path,
) -> Result<(), PluginLifecycleStorageError> {
    let plugin_root = packages_root.join(&record.plugin_key);
    match &record.package_digest {
        Some(digest) => {
            let payload = plugin_root.join(digest);
            remove_optional_real_tree(&payload, &plugin_root)?;
            if fs::read_dir(&plugin_root)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false)
            {
                fs::remove_dir(&plugin_root)
                    .map_err(|_| PluginLifecycleStorageError::PersistFailed)?;
                sync_directory(packages_root)
                    .map_err(|_| PluginLifecycleStorageError::PersistFailed)?;
            }
            Ok(())
        }
        None => remove_optional_real_tree(&plugin_root, packages_root),
    }
}

fn installation_error(
    code: LocalPluginInstallationErrorCode,
    operation: LocalPluginInstallationOperation,
) -> LocalPluginInstallationError {
    LocalPluginInstallationError::new(code, operation)
}

fn read_source_capped(source: &Path) -> Result<Vec<u8>, LocalPluginInstallationError> {
    read_source_capped_with_hook(source, || {})
}

fn read_source_capped_with_hook(
    source: &Path,
    after_metadata: impl FnOnce(),
) -> Result<Vec<u8>, LocalPluginInstallationError> {
    let mut file = File::open(source).map_err(|_| {
        installation_error(
            LocalPluginInstallationErrorCode::SourceReadFailed,
            LocalPluginInstallationOperation::Read,
        )
    })?;
    let before = file.metadata().map_err(|_| {
        installation_error(
            LocalPluginInstallationErrorCode::SourceReadFailed,
            LocalPluginInstallationOperation::Read,
        )
    })?;
    if !before.is_file() || before.len() > MAX_COMPRESSED_BYTES {
        return Err(installation_error(
            if before.len() > MAX_COMPRESSED_BYTES {
                LocalPluginInstallationErrorCode::InvalidPackage
            } else {
                LocalPluginInstallationErrorCode::SourceReadFailed
            },
            LocalPluginInstallationOperation::Read,
        ));
    }
    after_metadata();
    let mut bytes = Vec::with_capacity(before.len() as usize);
    Read::by_ref(&mut file)
        .take(MAX_COMPRESSED_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            installation_error(
                LocalPluginInstallationErrorCode::SourceReadFailed,
                LocalPluginInstallationOperation::Read,
            )
        })?;
    let after = file.metadata().map_err(|_| {
        installation_error(
            LocalPluginInstallationErrorCode::SourceReadFailed,
            LocalPluginInstallationOperation::Read,
        )
    })?;
    if bytes.len() as u64 > MAX_COMPRESSED_BYTES {
        return Err(installation_error(
            LocalPluginInstallationErrorCode::InvalidPackage,
            LocalPluginInstallationOperation::Read,
        ));
    }
    if before.len() != after.len() || before.len() != bytes.len() as u64 {
        return Err(installation_error(
            LocalPluginInstallationErrorCode::SourceReadFailed,
            LocalPluginInstallationOperation::Read,
        ));
    }
    Ok(bytes)
}

struct FileExtractionSink {
    root: PathBuf,
    current: Option<(String, File)>,
    directories: BTreeSet<PathBuf>,
}

impl FileExtractionSink {
    fn new(root: &Path) -> Self {
        Self {
            root: root.to_owned(),
            current: None,
            directories: BTreeSet::from([root.to_owned()]),
        }
    }

    fn entry_path(&mut self, path: &str) -> Result<PathBuf, ()> {
        let mut current = self.root.clone();
        let mut segments = path.split('/').peekable();
        while let Some(segment) = segments.next() {
            if segments.peek().is_none() {
                return Ok(current.join(segment));
            }
            current.push(segment);
            ensure_real_directory(&current)?;
            self.directories.insert(current.clone());
        }
        Err(())
    }
}

impl PackageEntrySink for FileExtractionSink {
    fn start_entry(&mut self, path: &str, _size: u64) -> Result<(), ()> {
        if self.current.is_some() {
            return Err(());
        }
        let entry_path = self.entry_path(path)?;
        let file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(entry_path)
            .map_err(|_| ())?;
        self.current = Some((path.to_owned(), file));
        Ok(())
    }

    fn write_chunk(&mut self, path: &str, bytes: &[u8]) -> Result<(), ()> {
        let (current_path, file) = self.current.as_mut().ok_or(())?;
        if current_path != path {
            return Err(());
        }
        file.write_all(bytes).map_err(|_| ())
    }

    fn finish_entry(&mut self, path: &str) -> Result<(), ()> {
        let (current_path, file) = self.current.take().ok_or(())?;
        if current_path != path {
            return Err(());
        }
        file.sync_all().map_err(|_| ())
    }

    fn finish_archive(&mut self) -> Result<(), ()> {
        if self.current.is_some() {
            return Err(());
        }
        for directory in self.directories.iter().rev() {
            sync_directory(directory)?;
        }
        Ok(())
    }
}

fn extract_package(
    bytes: &[u8],
    expected_files: &[crate::plugin_package_format::PackageFileFact],
    expected_size: u64,
    staging_path: &Path,
) -> Result<(), ()> {
    let mut sink = FileExtractionSink::new(staging_path);
    let traversal = traverse_plugin_package(bytes, &mut sink).map_err(|failure| match failure {
        PackageTraversalFailure::Invalid(_) | PackageTraversalFailure::Sink => (),
    })?;
    if traversal.decompressed_size != expected_size || traversal.files != expected_files {
        return Err(());
    }
    Ok(())
}

fn ensure_real_directory(path: &Path) -> Result<(), ()> {
    match fs::create_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(path).map_err(|_| ())?;
            if metadata.is_dir() && !metadata.file_type().is_symlink() {
                Ok(())
            } else {
                Err(())
            }
        }
        Err(_) => Err(()),
    }
}

fn remove_tree_no_follow(path: &Path) -> Result<(), ()> {
    let metadata = fs::symlink_metadata(path).map_err(|_| ())?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        return fs::remove_file(path).map_err(|_| ());
    }
    if !metadata.is_dir() {
        return Err(());
    }
    for entry in fs::read_dir(path).map_err(|_| ())? {
        let entry = entry.map_err(|_| ())?;
        remove_tree_no_follow(&entry.path())?;
    }
    fs::remove_dir(path).map_err(|_| ())
}

fn sync_directory(path: &Path) -> Result<(), ()> {
    #[cfg(unix)]
    {
        File::open(path)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| ())
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(())
    }
}

fn staging_identity() -> String {
    let sequence = STAGING_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("staging-{}-{sequence}-{nanos}", std::process::id())
}

fn is_staging_identity(value: &str) -> bool {
    value.starts_with("staging-")
        && value.len() <= 96
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn is_plugin_key(value: &str) -> bool {
    value.strip_prefix("v1-").is_some_and(|hex| {
        !hex.is_empty()
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    })
}

fn is_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn canonical_payload_path(packages_root: &Path, key: &str, path: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    let digest = path.file_name()?.to_str()?;
    (is_plugin_key(key)
        && is_digest(digest)
        && parent == packages_root.join(key)
        && path == packages_root.join(key).join(digest))
    .then(|| path.to_owned())
}

#[tauri::command]
pub async fn install_local_plugin<R: Runtime>(
    app: AppHandle<R>,
    installer: State<'_, Arc<PluginInstaller>>,
) -> Result<LocalPluginInstallationResult, LocalPluginInstallationError> {
    let selected = app
        .dialog()
        .file()
        .add_filter("lensX plugin", &["lxp"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(LocalPluginInstallationResult::cancelled());
    };
    let source = selected.into_path().map_err(|_| {
        installation_error(
            LocalPluginInstallationErrorCode::SourceReadFailed,
            LocalPluginInstallationOperation::Select,
        )
    })?;
    installer.install_source(&source, &app)
}

pub fn setup_plugin_installer<R: Runtime>(
    app: &AppHandle<R>,
    manager: Arc<PluginManager>,
) -> Arc<PluginInstaller> {
    let root = app
        .path()
        .app_local_data_dir()
        .map(|path| path.join("plugins"))
        .map_err(|_| ());
    let installer = PluginInstaller::initialize(root, manager);
    let managed = app.manage(Arc::clone(&installer));
    debug_assert!(
        managed,
        "Plugin Installer state should only be managed once"
    );
    installer
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_manager::WriteFault,
        plugin_registration::{PluginRegistrationChangedEvent, PluginRegistrationEventEmitter},
    };
    use std::sync::Mutex as StdMutex;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            Self(std::env::temp_dir().join(format!(
                "lensx-plugin-installer-{name}-{}-{}",
                std::process::id(),
                STAGING_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            )))
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = remove_tree_no_follow(&self.0);
        }
    }

    #[derive(Default)]
    struct FakeEmitter {
        events: StdMutex<Vec<PluginRegistrationChangedEvent>>,
        fail: bool,
    }

    impl PluginRegistrationEventEmitter for FakeEmitter {
        fn emit_registration_changed(
            &self,
            payload: &PluginRegistrationChangedEvent,
        ) -> Result<(), ()> {
            if self.fail {
                return Err(());
            }
            self.events
                .lock()
                .expect("event storage should be available")
                .push(payload.clone());
            Ok(())
        }
    }

    fn versions() -> crate::plugin_manifest::PluginHostVersions {
        crate::plugin_manifest::PluginHostVersions {
            lensx: "0.1.0".to_owned(),
            host_api: "0.1.0".to_owned(),
        }
    }

    fn setup(name: &str) -> (TestDirectory, Arc<PluginManager>, Arc<PluginInstaller>) {
        let directory = TestDirectory::new(name);
        fs::create_dir_all(&directory.0).expect("test root should exist");
        let manager = PluginManager::recover(directory.0.join("config"), versions());
        let installer = PluginInstaller::initialize(
            Ok(directory.0.join("local-data").join("plugins")),
            Arc::clone(&manager),
        );
        (directory, manager, installer)
    }

    fn valid_package() -> Vec<u8> {
        fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../fixtures/plugin-package-format/valid/complete-compatible.lxp"),
        )
        .expect("valid package fixture should exist")
    }

    fn installed_entry_id(manager: &PluginManager, plugin_id: &str) -> String {
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
                _ => None,
            })
            .expect("installed entry should exist")
    }

    #[test]
    fn same_bytes_are_inspected_extracted_committed_and_registered_once() {
        let (_directory, manager, installer) = setup("success");
        let emitter = FakeEmitter::default();
        let result = installer
            .install_bytes(&valid_package(), &emitter)
            .expect("installation should succeed");
        let LocalPluginInstallationResult::Installed {
            plugin_id,
            version,
            revision,
            ..
        } = result
        else {
            panic!("expected installed result");
        };
        assert_eq!(revision, "1");
        let registration = manager
            .registration(&plugin_id)
            .expect("registration should be published");
        assert_eq!(registration.manifest.version, version);
        assert_eq!(registration.facts.source, PluginSource::External);
        assert!(registration.facts.enabled);
        assert!(registration.facts.granted_permission_ids.is_empty());
        assert!(Path::new(&registration.facts.installation_path).is_dir());
        assert_eq!(
            emitter
                .events
                .lock()
                .expect("events should be readable")
                .len(),
            1
        );
        let plugin_key = plugin_record_key(&plugin_id);
        assert!(!installer
            .root
            .as_ref()
            .expect("root should exist")
            .join(DATA_DIRECTORY)
            .join(plugin_key)
            .exists());
    }

    #[test]
    fn uninstall_retain_data_is_idempotent_and_reinstall_clears_completed_evidence() {
        let (_directory, manager, installer) = setup("uninstall-retain");
        installer
            .install_bytes(&valid_package(), &FakeEmitter::default())
            .expect("installation should succeed");
        let plugin_id = "com.acme.workspace";
        let plugin_key = plugin_record_key(plugin_id);
        let entry_id = installed_entry_id(&manager, plugin_id);
        let data = installer
            .root
            .as_ref()
            .expect("root should exist")
            .join(DATA_DIRECTORY)
            .join(&plugin_key);
        fs::create_dir_all(&data).expect("data subtree should be created on demand");
        fs::write(data.join("preserved.json"), b"preserve").expect("data should exist");

        let removed = installer
            .uninstall(&entry_id, "1", CleanupDataPolicy::RetainData)
            .expect("uninstall should succeed");
        assert!(removed.changed);
        assert!(!removed.cleanup_pending);
        assert_eq!(removed.revision, "2");
        assert_eq!(removed.plugin_id.as_deref(), Some(plugin_id));
        assert!(removed.change.is_some());
        assert!(manager.registration(plugin_id).is_none());
        assert_eq!(fs::read(data.join("preserved.json")).unwrap(), b"preserve");
        assert!(installer
            .read_cleanup_record(&plugin_key)
            .expect("cleanup record should parse")
            .is_some_and(|record| record.completed));

        let repeated = installer
            .uninstall(&entry_id, "2", CleanupDataPolicy::RetainData)
            .expect("completed uninstall should be idempotent");
        assert!(!repeated.changed);
        assert!(!repeated.cleanup_pending);
        assert_eq!(manager.registration_revision(), "2");

        installer
            .install_bytes(&valid_package(), &FakeEmitter::default())
            .expect("same identity should install after completed cleanup");
        let registration = manager
            .registration(plugin_id)
            .expect("new registration should exist");
        assert!(registration.facts.enabled);
        assert!(registration.facts.granted_permission_ids.is_empty());
        assert!(registration.facts.diagnostics.is_empty());
        assert_eq!(fs::read(data.join("preserved.json")).unwrap(), b"preserve");
        assert!(installer
            .read_cleanup_record(&plugin_key)
            .expect("cleanup lookup should succeed")
            .is_none());
    }

    #[test]
    fn successful_cleanup_retry_unblocks_same_process_reinstall() {
        let (_directory, manager, installer) = setup("cleanup-retry-unblocks");
        installer
            .install_bytes(&valid_package(), &FakeEmitter::default())
            .expect("installation should succeed");
        let plugin_id = "com.acme.workspace";
        let plugin_key = plugin_record_key(plugin_id);
        let entry_id = installed_entry_id(&manager, plugin_id);

        installer.set_cleanup_fault(true);
        let pending = installer
            .uninstall(&entry_id, "1", CleanupDataPolicy::RetainData)
            .expect("logical uninstall should succeed despite pending cleanup");
        assert!(pending.cleanup_pending);
        assert!(installer.is_plugin_key_blocked(&plugin_key));

        installer.set_cleanup_fault(false);
        let completed = installer
            .uninstall(&entry_id, "2", CleanupDataPolicy::RetainData)
            .expect("cleanup retry should succeed");
        assert!(!completed.cleanup_pending);
        assert!(!installer.is_plugin_key_blocked(&plugin_key));
        installer
            .install_bytes(&valid_package(), &FakeEmitter::default())
            .expect("same-process reinstall should proceed after cleanup completion");
    }

    #[test]
    fn uninstall_delete_data_and_restart_recovery_remove_only_owned_subtrees() {
        let (directory, manager, installer) = setup("uninstall-delete-recovery");
        installer
            .install_bytes(&valid_package(), &FakeEmitter::default())
            .expect("installation should succeed");
        let plugin_id = "com.acme.workspace";
        let plugin_key = plugin_record_key(plugin_id);
        let entry_id = installed_entry_id(&manager, plugin_id);
        let root = installer.root.as_ref().expect("root should exist");
        let data = root.join(DATA_DIRECTORY).join(&plugin_key);
        fs::create_dir_all(&data).expect("data subtree should exist");
        fs::write(data.join("delete.json"), b"delete").expect("data should exist");
        let unrelated = root.join(DATA_DIRECTORY).join("v1-6162");
        fs::create_dir_all(&unrelated).expect("unrelated data should exist");
        fs::write(unrelated.join("keep"), b"keep").expect("unrelated marker should exist");

        let entry = manager
            .resolve_lifecycle_entry(&entry_id, "1")
            .expect("entry should resolve");
        let package_digest = installer
            .prove_managed_payload(&entry, &root.join(PACKAGES_DIRECTORY))
            .expect("payload should be managed");
        let record = PluginCleanupRecord {
            version: CLEANUP_RECORD_VERSION,
            plugin_key: plugin_key.clone(),
            entry_id: entry_id.clone(),
            plugin_id: Some(plugin_id.to_owned()),
            package_digest,
            data_policy: CleanupDataPolicy::DeleteData,
            program_complete: false,
            data_complete: false,
            completed: false,
        };
        installer
            .write_cleanup_record(&record)
            .expect("cleanup intent should persist");
        manager
            .remove_entry(&entry_id, "1")
            .expect("logical removal should persist");
        drop(installer);

        let recovered = PluginInstaller::initialize(
            Ok(directory.0.join("local-data/plugins")),
            Arc::clone(&manager),
        );
        assert!(!data.exists());
        assert_eq!(fs::read(unrelated.join("keep")).unwrap(), b"keep");
        assert!(recovered
            .read_cleanup_record(&plugin_key)
            .expect("cleanup record should parse")
            .is_some_and(|record| record.completed));
        assert_eq!(manager.registration_revision(), "2");
    }

    #[test]
    fn quarantine_uninstall_is_managed_but_symlink_and_malformed_cleanup_are_preserved() {
        let quarantine_directory = TestDirectory::new("quarantine-uninstall");
        let plugin_id = "com.acme.workspace";
        let key = plugin_record_key(plugin_id);
        let store = quarantine_directory.0.join("config/plugin-manager");
        fs::create_dir_all(&store).expect("manager store should exist");
        fs::write(store.join(format!("{key}.json")), b"{").expect("damaged record should exist");
        let manager = PluginManager::recover(quarantine_directory.0.join("config"), versions());
        let payload = quarantine_directory
            .0
            .join("local-data/plugins/packages")
            .join(&key)
            .join("c".repeat(64));
        fs::create_dir_all(&payload).expect("quarantine payload should exist");
        fs::write(payload.join("evidence"), b"payload").expect("payload should exist");
        let installer = PluginInstaller::initialize(
            Ok(quarantine_directory.0.join("local-data/plugins")),
            Arc::clone(&manager),
        );
        let stub = manager.quarantine(&key).expect("quarantine should exist");
        let entry_id = crate::plugin_registration::quarantine_entry_id(&stub);
        let removed = installer
            .uninstall(&entry_id, "0", CleanupDataPolicy::RetainData)
            .expect("managed quarantine should uninstall");
        assert!(removed.changed);
        assert!(!payload.exists());
        assert!(manager.quarantine(&key).is_none());

        let malformed_directory = TestDirectory::new("malformed-cleanup");
        fs::create_dir_all(malformed_directory.0.join("local-data/plugins/.cleanup"))
            .expect("cleanup root should exist");
        fs::write(
            malformed_directory
                .0
                .join(format!("local-data/plugins/.cleanup/{key}.json")),
            b"{not-json",
        )
        .expect("malformed cleanup should exist");
        let malformed_manager =
            PluginManager::recover(malformed_directory.0.join("config"), versions());
        let malformed = PluginInstaller::initialize(
            Ok(malformed_directory.0.join("local-data/plugins")),
            malformed_manager,
        );
        assert!(malformed.is_plugin_key_blocked(&key));
        assert!(malformed_directory
            .0
            .join(format!("local-data/plugins/.cleanup/{key}.json"))
            .exists());
    }

    #[test]
    fn invalid_incompatible_and_duplicate_inputs_create_no_partial_state() {
        let (_directory, manager, installer) = setup("reject");
        let emitter = FakeEmitter::default();
        let invalid = installer
            .install_bytes(b"not a package", &emitter)
            .expect_err("invalid bytes should fail");
        assert_eq!(
            invalid.code,
            LocalPluginInstallationErrorCode::InvalidPackage
        );
        let incompatible = fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../fixtures/plugin-package-format/incompatible/manifest-incompatible.lxp"),
        )
        .expect("incompatible fixture should exist");
        assert_eq!(
            installer
                .install_bytes(&incompatible, &emitter)
                .expect_err("incompatible package should fail")
                .code,
            LocalPluginInstallationErrorCode::Incompatible
        );
        installer
            .install_bytes(&valid_package(), &emitter)
            .expect("first installation should succeed");
        assert_eq!(
            installer
                .install_bytes(&valid_package(), &emitter)
                .expect_err("duplicate should fail")
                .code,
            LocalPluginInstallationErrorCode::AlreadyInstalled
        );
        assert_eq!(manager.registration_revision(), "1");
    }

    #[test]
    fn manager_persist_failure_rolls_back_committed_payload_and_event() {
        let (_directory, manager, installer) = setup("persist-failure");
        manager.set_write_fault(Some(WriteFault::Create));
        let emitter = FakeEmitter::default();
        let error = installer
            .install_bytes(&valid_package(), &emitter)
            .expect_err("persistence failure should fail installation");
        assert_eq!(
            error.code,
            LocalPluginInstallationErrorCode::RegistrationFailed
        );
        assert_eq!(manager.registration_revision(), "0");
        assert!(emitter
            .events
            .lock()
            .expect("events should be readable")
            .is_empty());
        let packages = installer
            .root
            .as_ref()
            .expect("root should exist")
            .join(PACKAGES_DIRECTORY);
        let payload_count = fs::read_dir(packages)
            .expect("packages should be readable")
            .flat_map(|entry| {
                fs::read_dir(entry.expect("key should be readable").path())
                    .into_iter()
                    .flatten()
            })
            .count();
        assert_eq!(payload_count, 0);
    }

    #[test]
    fn event_failure_does_not_roll_back_committed_registration() {
        let (_directory, manager, installer) = setup("event-failure");
        let result = installer.install_bytes(
            &valid_package(),
            &FakeEmitter {
                fail: true,
                ..FakeEmitter::default()
            },
        );
        assert!(result.is_ok());
        assert_eq!(manager.registration_revision(), "1");
    }

    #[test]
    fn recovery_removes_staging_and_orphans_but_preserves_unknown_evidence() {
        let (directory, manager, installer) = setup("recovery");
        let root = installer.root.as_ref().expect("root should exist");
        let staging = root.join(STAGING_DIRECTORY).join("staging-1-2-3");
        fs::create_dir_all(&staging).expect("staging should exist");
        fs::write(staging.join("partial"), b"partial").expect("partial file should exist");
        let orphan = root
            .join(PACKAGES_DIRECTORY)
            .join("v1-6162")
            .join("a".repeat(64));
        fs::create_dir_all(&orphan).expect("orphan should exist");
        drop(installer);
        let recovered = PluginInstaller::initialize(
            Ok(directory.0.join("local-data").join("plugins")),
            manager,
        );
        assert!(!staging.exists());
        assert!(!orphan.exists());
        assert!(recovered.diagnostics().is_empty());
    }

    #[test]
    fn capped_source_read_rejects_growth_truncation_oversize_and_non_files() {
        let directory = TestDirectory::new("source-read");
        fs::create_dir_all(&directory.0).expect("test root should exist");
        let source = directory.0.join("plugin.lxp");
        fs::write(&source, b"immutable bytes").expect("source should exist");
        assert_eq!(
            read_source_capped(&source).expect("stable source should read"),
            b"immutable bytes"
        );

        fs::write(&source, b"before").expect("source should reset");
        let growing = read_source_capped_with_hook(&source, || {
            fs::write(&source, b"before-after").expect("source should grow")
        });
        assert_eq!(
            growing.expect_err("growth should fail").code,
            LocalPluginInstallationErrorCode::SourceReadFailed
        );

        fs::write(&source, b"before-after").expect("source should reset");
        let truncated = read_source_capped_with_hook(&source, || {
            fs::write(&source, b"short").expect("source should truncate")
        });
        assert_eq!(
            truncated.expect_err("truncation should fail").code,
            LocalPluginInstallationErrorCode::SourceReadFailed
        );

        let oversized = directory.0.join("oversized.lxp");
        File::create(&oversized)
            .and_then(|file| file.set_len(MAX_COMPRESSED_BYTES + 1))
            .expect("sparse oversize source should exist");
        assert_eq!(
            read_source_capped(&oversized)
                .expect_err("oversize source should fail")
                .code,
            LocalPluginInstallationErrorCode::InvalidPackage
        );
        assert_eq!(
            read_source_capped(&directory.0)
                .expect_err("directory source should fail")
                .code,
            LocalPluginInstallationErrorCode::SourceReadFailed
        );
    }

    #[test]
    fn complete_package_corpus_fails_closed_before_registration() {
        #[derive(serde::Deserialize)]
        struct Case {
            name: String,
            file: String,
            expected: serde_json::Value,
        }
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/plugin-package-format");
        let cases: Vec<Case> = serde_json::from_slice(
            &fs::read(root.join("expectations.json")).expect("expectations should exist"),
        )
        .expect("expectations should parse");
        for case in cases {
            if case.expected["status"] == "compatible" {
                continue;
            }
            let (_directory, manager, installer) = setup(&format!("corpus-{}", case.name));
            let error = installer
                .install_bytes(
                    &fs::read(root.join(case.file)).expect("fixture should exist"),
                    &FakeEmitter::default(),
                )
                .expect_err("non-compatible fixture should fail");
            assert!(matches!(
                error.code,
                LocalPluginInstallationErrorCode::InvalidPackage
                    | LocalPluginInstallationErrorCode::Incompatible
            ));
            assert_eq!(manager.registration_revision(), "0");
            assert!(manager.read_registration_snapshot().entries.is_empty());
        }
    }

    #[test]
    fn extraction_create_new_and_flush_failures_never_publish_formal_state() {
        struct FailingSink {
            fail_on_finish: bool,
        }

        impl PackageEntrySink for FailingSink {
            fn start_entry(&mut self, _path: &str, _size: u64) -> Result<(), ()> {
                Ok(())
            }
            fn write_chunk(&mut self, _path: &str, _bytes: &[u8]) -> Result<(), ()> {
                if self.fail_on_finish {
                    Ok(())
                } else {
                    Err(())
                }
            }
            fn finish_entry(&mut self, _path: &str) -> Result<(), ()> {
                if self.fail_on_finish {
                    Err(())
                } else {
                    Ok(())
                }
            }
            fn finish_archive(&mut self) -> Result<(), ()> {
                Ok(())
            }
        }

        for fail_on_finish in [false, true] {
            let result =
                traverse_plugin_package(&valid_package(), &mut FailingSink { fail_on_finish });
            assert!(matches!(result, Err(PackageTraversalFailure::Sink)));
        }

        let (directory, manager, _installer) = setup("create-new-failure");
        let staging = directory.0.join("manual-staging");
        fs::create_dir_all(&staging).expect("manual staging should exist");
        fs::write(staging.join("manifest.json"), b"collision").expect("collision should exist");
        let PackageInspectionResult::Compatible { facts, .. } =
            inspect_plugin_package(&valid_package(), &versions())
        else {
            panic!("valid fixture should inspect");
        };
        assert!(extract_package(
            &valid_package(),
            &facts.files,
            facts.decompressed_size,
            &staging
        )
        .is_err());
        assert_eq!(manager.registration_revision(), "0");
    }

    #[test]
    fn process_and_file_locks_return_busy_without_touching_active_state() {
        let (_directory, manager, installer) = setup("busy");
        let lock_path = installer
            .root
            .as_ref()
            .expect("root should exist")
            .join(INSTALL_LOCK_FILE);
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .open(lock_path)
            .expect("lock file should exist");
        lock.try_lock_exclusive()
            .expect("external lock should acquire");
        assert_eq!(
            installer
                .install_bytes(&valid_package(), &FakeEmitter::default())
                .expect_err("locked installer should be busy")
                .code,
            LocalPluginInstallationErrorCode::Busy
        );
        assert_eq!(manager.registration_revision(), "0");
    }

    #[test]
    fn installation_and_uninstall_share_the_same_process_commit_boundary() {
        let (_directory, manager, installer) = setup("shared-boundary");
        installer
            .install_bytes(&valid_package(), &FakeEmitter::default())
            .expect("installation should succeed");
        let entry_id = installed_entry_id(&manager, "com.acme.workspace");
        let _guard = installer
            .acquire_commit_boundary()
            .expect("test should hold the shared boundary");
        assert_eq!(
            installer
                .uninstall(&entry_id, "1", CleanupDataPolicy::RetainData)
                .expect_err("uninstall should see the held boundary"),
            PluginLifecycleStorageError::Busy
        );
        assert_eq!(
            installer
                .install_bytes(&valid_package(), &FakeEmitter::default())
                .expect_err("installation should see the held boundary")
                .code,
            LocalPluginInstallationErrorCode::Busy
        );
        assert!(manager.registration("com.acme.workspace").is_some());
        assert_eq!(manager.registration_revision(), "1");
    }

    #[test]
    fn recovery_preserves_healthy_and_quarantine_payload_ownership() {
        let (directory, manager, installer) = setup("healthy-recovery");
        installer
            .install_bytes(&valid_package(), &FakeEmitter::default())
            .expect("installation should succeed");
        let healthy_path = PathBuf::from(
            manager
                .registration("com.acme.workspace")
                .expect("registration should exist")
                .facts
                .installation_path,
        );
        drop(installer);
        let recovered = PluginInstaller::initialize(
            Ok(directory.0.join("local-data/plugins")),
            Arc::clone(&manager),
        );
        assert!(healthy_path.is_dir());
        assert!(recovered.diagnostics().is_empty());

        let quarantine_directory = TestDirectory::new("quarantine-recovery");
        fs::create_dir_all(quarantine_directory.0.join("config/plugin-manager"))
            .expect("manager store should exist");
        let key = plugin_record_key("com.acme.workspace");
        fs::write(
            quarantine_directory
                .0
                .join(format!("config/plugin-manager/{key}.json")),
            b"{",
        )
        .expect("damaged record should exist");
        let quarantined_manager =
            PluginManager::recover(quarantine_directory.0.join("config"), versions());
        let evidence = quarantine_directory
            .0
            .join("local-data/plugins/packages")
            .join(&key)
            .join("b".repeat(64));
        fs::create_dir_all(&evidence).expect("quarantine evidence should exist");
        let quarantined_installer = PluginInstaller::initialize(
            Ok(quarantine_directory.0.join("local-data/plugins")),
            quarantined_manager,
        );
        assert!(evidence.is_dir());
        assert!(quarantined_installer.diagnostics().is_empty());
    }

    #[test]
    fn anomalous_paths_and_links_are_preserved_and_fail_closed_without_panicking() {
        let outside_directory = TestDirectory::new("outside-path");
        fs::create_dir_all(&outside_directory.0).expect("test root should exist");
        let manager = PluginManager::recover(outside_directory.0.join("config"), versions());
        let PackageInspectionResult::Compatible {
            manifest, facts, ..
        } = inspect_plugin_package(&valid_package(), &versions())
        else {
            panic!("valid fixture should inspect");
        };
        let outside_payload = outside_directory.0.join("outside-payload");
        fs::create_dir_all(&outside_payload).expect("outside payload should exist");
        manager
            .register(
                manifest,
                PluginRegistrationFacts::new(
                    outside_payload.to_string_lossy(),
                    PackageDigest {
                        algorithm: "sha256".to_owned(),
                        value: facts.package_digest.value,
                    },
                    PluginSource::External,
                    true,
                )
                .expect("facts should be valid"),
            )
            .expect("record should persist");
        let installer = PluginInstaller::initialize(
            Ok(outside_directory.0.join("local-data/plugins")),
            manager,
        );
        assert!(outside_payload.is_dir());
        assert_eq!(
            installer.current_availability(),
            InstallerAvailability::Degraded
        );
        assert_eq!(
            installer
                .install_bytes(&valid_package(), &FakeEmitter::default())
                .expect_err("degraded installer should fail closed")
                .code,
            LocalPluginInstallationErrorCode::Unavailable
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link_directory = TestDirectory::new("linked-evidence");
            let external = link_directory.0.join("external");
            let packages = link_directory.0.join("local-data/plugins/packages");
            fs::create_dir_all(&external).expect("external should exist");
            fs::write(external.join("marker"), b"preserve").expect("marker should exist");
            fs::create_dir_all(&packages).expect("packages should exist");
            symlink(&external, packages.join("v1-dead")).expect("link should exist");
            let manager = PluginManager::recover(link_directory.0.join("config"), versions());
            let linked_installer = PluginInstaller::initialize(
                Ok(link_directory.0.join("local-data/plugins")),
                manager,
            );
            assert_eq!(
                fs::read(external.join("marker")).expect("marker should survive"),
                b"preserve"
            );
            assert_eq!(
                linked_installer.current_availability(),
                InstallerAvailability::Degraded
            );
        }
    }

    #[test]
    fn quarantine_and_degraded_manager_reject_installation_without_repair() {
        let quarantine_directory = TestDirectory::new("quarantine-install");
        let key = plugin_record_key("com.acme.workspace");
        let store = quarantine_directory.0.join("config/plugin-manager");
        fs::create_dir_all(&store).expect("manager store should exist");
        fs::write(store.join(format!("{key}.json")), b"{").expect("damaged record should exist");
        let manager = PluginManager::recover(quarantine_directory.0.join("config"), versions());
        let installer = PluginInstaller::initialize(
            Ok(quarantine_directory.0.join("local-data/plugins")),
            Arc::clone(&manager),
        );
        assert_eq!(
            installer
                .install_bytes(&valid_package(), &FakeEmitter::default())
                .expect_err("quarantine identity should reject replacement")
                .code,
            LocalPluginInstallationErrorCode::IdentityQuarantined
        );
        assert!(manager.quarantine(&key).is_some());
        assert_eq!(manager.registration_revision(), "0");

        let degraded_directory = TestDirectory::new("manager-degraded");
        fs::create_dir_all(&degraded_directory.0).expect("test root should exist");
        fs::write(degraded_directory.0.join("config"), b"preserve")
            .expect("blocking config file should exist");
        let degraded_manager =
            PluginManager::recover(degraded_directory.0.join("config"), versions());
        let degraded_installer = PluginInstaller::initialize(
            Ok(degraded_directory.0.join("local-data/plugins")),
            degraded_manager,
        );
        assert_eq!(
            degraded_installer
                .install_bytes(&valid_package(), &FakeEmitter::default())
                .expect_err("degraded Manager should fail closed")
                .code,
            LocalPluginInstallationErrorCode::Unavailable
        );
    }

    #[test]
    fn cancel_contract_is_side_effect_free_and_serialized_without_sensitive_fields() {
        let (_directory, manager, installer) = setup("cancel");
        let cancelled = LocalPluginInstallationResult::cancelled();
        assert_eq!(
            serde_json::to_value(&cancelled).expect("cancel should serialize"),
            serde_json::json!({
                "status": "cancelled",
                "contract_version": "0.1.0"
            })
        );
        assert_eq!(manager.registration_revision(), "0");
        let root = installer.root.as_ref().expect("root should exist");
        assert_eq!(
            fs::read_dir(root.join(STAGING_DIRECTORY))
                .expect("staging should exist")
                .count(),
            0
        );
        let serialized = serde_json::to_string(&installation_error(
            LocalPluginInstallationErrorCode::Internal,
            LocalPluginInstallationOperation::Register,
        ))
        .expect("error should serialize");
        for forbidden in ["/Users/", "package_digest", "installation_path", "stack"] {
            assert!(!serialized.contains(forbidden));
        }
    }
}
