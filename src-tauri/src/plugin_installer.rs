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
const INSTALL_LOCK_FILE: &str = ".install.lock";
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
        });
        if installer.root.is_none() {
            installer.record_diagnostic(PluginInstallerDiagnostic {
                code: "installer_unavailable",
                operation: "initialize",
                message: "Local plugin installation storage is unavailable.",
            });
            return installer;
        }
        match installer.acquire_locks() {
            Ok((_process, _file)) => {
                if installer.recover_locked().is_err() {
                    installer.set_availability(InstallerAvailability::Degraded);
                }
            }
            Err(error) if error.code == LocalPluginInstallationErrorCode::Busy => {}
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

    pub fn install_source(
        &self,
        source: &Path,
        emitter: &impl PluginRegistrationEventEmitter,
    ) -> Result<LocalPluginInstallationResult, LocalPluginInstallationError> {
        let (_process, _file) = self.acquire_locks()?;
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
        let (_process, _file) = self.acquire_locks()?;
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

        self.reject_existing_identity(&manifest.plugin_id)?;
        let root = self.root.as_ref().ok_or_else(|| {
            installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Commit,
            )
        })?;
        let plugin_key = plugin_record_key(&manifest.plugin_id);
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

    fn acquire_locks(&self) -> Result<(MutexGuard<'_, ()>, File), LocalPluginInstallationError> {
        if self.current_availability() == InstallerAvailability::Unavailable {
            return Err(installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Recover,
            ));
        }
        let process = self.process_lock.try_lock().map_err(|_| {
            installation_error(
                LocalPluginInstallationErrorCode::Busy,
                LocalPluginInstallationOperation::Commit,
            )
        })?;
        let root = self.root.as_ref().ok_or_else(|| {
            installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Recover,
            )
        })?;
        fs::create_dir_all(root).map_err(|_| {
            installation_error(
                LocalPluginInstallationErrorCode::Unavailable,
                LocalPluginInstallationOperation::Recover,
            )
        })?;
        let lock_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(root.join(INSTALL_LOCK_FILE))
            .map_err(|_| {
                installation_error(
                    LocalPluginInstallationErrorCode::Unavailable,
                    LocalPluginInstallationOperation::Recover,
                )
            })?;
        lock_file.try_lock_exclusive().map_err(|error| {
            installation_error(
                if error.kind() == std::io::ErrorKind::WouldBlock {
                    LocalPluginInstallationErrorCode::Busy
                } else {
                    LocalPluginInstallationErrorCode::Unavailable
                },
                LocalPluginInstallationOperation::Commit,
            )
        })?;
        Ok((process, lock_file))
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
        ensure_real_directory(&staging_root).map_err(|_| ())?;
        ensure_real_directory(&packages_root).map_err(|_| ())?;

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
