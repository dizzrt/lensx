use crate::plugin_development_directory::{
    inspect_development_directory, CapturedDevelopmentFile, DevelopmentDirectoryInspection,
    NativeDevelopmentFileSystem, ValidatedDevelopmentPayload,
};
use crate::plugin_manifest::{
    NormalizedPluginManifest, PluginHostVersions, PluginManifestCompatibility,
};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

const DEVELOPMENT_DIRECTORY: &str = "plugin-development";
const STAGING_DIRECTORY: &str = "staging";
const CURRENT_DIRECTORY: &str = "current";
const RETIRED_DIRECTORY: &str = "retired";
const IDENTITY_DOMAIN: &[u8] = b"sha256-development-tree-v1\0";

#[derive(Clone, Debug)]
pub struct PublishedDevelopmentSnapshot {
    pub root: PathBuf,
    pub identity: String,
    pub manifest: NormalizedPluginManifest,
    pub compatibility: PluginManifestCompatibility,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DevelopmentSnapshotFailure {
    Invalid,
    Incompatible,
    SourceChanged,
    Unsafe,
    Unavailable,
    Internal,
}

#[derive(Debug)]
pub struct DevelopmentSnapshotStore {
    root: PathBuf,
    session: String,
    operation: Mutex<()>,
    cleanup_diagnostics: Mutex<Vec<&'static str>>,
    #[cfg(test)]
    fail_cleanup: Mutex<bool>,
}

impl DevelopmentSnapshotStore {
    pub fn initialize(cache_dir: PathBuf) -> Result<Self, DevelopmentSnapshotFailure> {
        if !cache_dir.is_absolute() {
            return Err(DevelopmentSnapshotFailure::Unavailable);
        }
        let root = cache_dir.join(DEVELOPMENT_DIRECTORY);
        let session = random_identity()?;
        let store = Self {
            root,
            session,
            operation: Mutex::new(()),
            cleanup_diagnostics: Mutex::new(Vec::new()),
            #[cfg(test)]
            fail_cleanup: Mutex::new(false),
        };
        store.ensure_layout()?;
        store.recover_residue();
        Ok(store)
    }

    pub fn publish_from_source(
        &self,
        source: &Path,
        versions: &PluginHostVersions,
    ) -> Result<PublishedDevelopmentSnapshot, DevelopmentSnapshotFailure> {
        let _operation = self.lock_operation();
        // A prior request may have lost best-effort cleanup while this process
        // remained alive. Retry only the current session's staging/retired
        // namespaces before creating another generation.
        self.recover_residue();
        let source_payload =
            match inspect_development_directory(source, &NativeDevelopmentFileSystem, versions) {
                DevelopmentDirectoryInspection::Compatible(payload) => payload,
                DevelopmentDirectoryInspection::Incompatible(_) => {
                    return Err(DevelopmentSnapshotFailure::Incompatible)
                }
                DevelopmentDirectoryInspection::Invalid { diagnostics } => {
                    return Err(map_diagnostics(&diagnostics))
                }
            };
        self.publish_payload(source_payload, versions)
    }

    fn publish_payload(
        &self,
        payload: ValidatedDevelopmentPayload,
        versions: &PluginHostVersions,
    ) -> Result<PublishedDevelopmentSnapshot, DevelopmentSnapshotFailure> {
        let generation = random_identity()?;
        let staging = self
            .session_root()
            .join(STAGING_DIRECTORY)
            .join(&generation);
        let current = self
            .session_root()
            .join(CURRENT_DIRECTORY)
            .join(&generation);
        if staging.exists() || current.exists() {
            return Err(DevelopmentSnapshotFailure::Unsafe);
        }
        fs::create_dir(&staging).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
        let write_result = (|| {
            for file in &payload.files {
                write_snapshot_file(&staging, file)?;
            }
            sync_snapshot_directories(&staging)?;
            let staged = match inspect_development_directory(
                &staging,
                &NativeDevelopmentFileSystem,
                versions,
            ) {
                DevelopmentDirectoryInspection::Compatible(payload) => payload,
                DevelopmentDirectoryInspection::Incompatible(_) => {
                    return Err(DevelopmentSnapshotFailure::Incompatible)
                }
                DevelopmentDirectoryInspection::Invalid { diagnostics } => {
                    return Err(map_diagnostics(&diagnostics))
                }
            };
            let identity = development_tree_identity(&staged.files);
            fs::rename(&staging, &current).map_err(|_| DevelopmentSnapshotFailure::Internal)?;
            sync_directory(
                current
                    .parent()
                    .ok_or(DevelopmentSnapshotFailure::Internal)?,
            )?;
            Ok(PublishedDevelopmentSnapshot {
                root: current,
                identity,
                manifest: staged.manifest,
                compatibility: staged.compatibility,
            })
        })();
        if write_result.is_err() {
            let _ = remove_snapshot_tree(&staging);
        }
        write_result
    }

    pub fn retire(&self, snapshot: &Path) -> bool {
        let _operation = self.lock_operation();
        if !self.is_current_snapshot(snapshot) {
            self.record_cleanup_diagnostic("cleanup_unsafe");
            return false;
        }
        let Some(generation) = snapshot.file_name().and_then(|value| value.to_str()) else {
            self.record_cleanup_diagnostic("cleanup_unsafe");
            return false;
        };
        #[cfg(test)]
        if *self
            .fail_cleanup
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
        {
            self.record_cleanup_diagnostic("cleanup_pending");
            return false;
        }
        let retired = self.session_root().join(RETIRED_DIRECTORY).join(generation);
        if fs::rename(snapshot, &retired).is_err() || remove_snapshot_tree(&retired).is_err() {
            self.record_cleanup_diagnostic("cleanup_pending");
            return false;
        }
        true
    }

    pub fn discard_uncommitted(&self, snapshot: &Path) {
        let _ = self.retire(snapshot);
    }

    #[cfg(test)]
    pub fn cleanup_diagnostics(&self) -> Vec<&'static str> {
        self.cleanup_diagnostics
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn owns_current_snapshot(
        &self,
        snapshot: &Path,
        identity: &str,
        versions: &PluginHostVersions,
    ) -> bool {
        self.is_current_snapshot(snapshot)
            && identity.len() == 64
            && identity
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
            && inspect_development_directory(snapshot, &NativeDevelopmentFileSystem, versions)
                .is_compatible_with_identity(identity)
    }

    fn ensure_layout(&self) -> Result<(), DevelopmentSnapshotFailure> {
        let session = self.session_root();
        fs::create_dir_all(session.join(STAGING_DIRECTORY))
            .and_then(|_| fs::create_dir_all(session.join(CURRENT_DIRECTORY)))
            .and_then(|_| fs::create_dir_all(session.join(RETIRED_DIRECTORY)))
            .map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
        Ok(())
    }

    fn recover_residue(&self) {
        for directory in [STAGING_DIRECTORY, RETIRED_DIRECTORY] {
            let root = self.session_root().join(directory);
            let Ok(entries) = fs::read_dir(&root) else {
                continue;
            };
            for entry in entries.flatten() {
                let name = entry.file_name();
                let Some(name) = name.to_str() else {
                    self.record_cleanup_diagnostic("cleanup_unsafe");
                    continue;
                };
                if !is_random_identity(name) {
                    self.record_cleanup_diagnostic("cleanup_unsafe");
                    continue;
                }
                if remove_snapshot_tree(&entry.path()).is_err() {
                    self.record_cleanup_diagnostic("cleanup_pending");
                }
            }
        }
    }

    fn is_current_snapshot(&self, snapshot: &Path) -> bool {
        snapshot
            .parent()
            .is_some_and(|parent| parent == self.session_root().join(CURRENT_DIRECTORY))
            && snapshot
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(is_random_identity)
    }

    fn session_root(&self) -> PathBuf {
        self.root.join(&self.session)
    }

    fn record_cleanup_diagnostic(&self, diagnostic: &'static str) {
        let mut diagnostics = self
            .cleanup_diagnostics
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if diagnostics.len() == 32 {
            diagnostics.remove(0);
        }
        diagnostics.push(diagnostic);
    }

    fn lock_operation(&self) -> MutexGuard<'_, ()> {
        self.operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[cfg(test)]
    pub fn set_cleanup_fault(&self, enabled: bool) {
        *self
            .fail_cleanup
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = enabled;
    }

    #[cfg(test)]
    pub fn current_snapshot_count(&self) -> usize {
        fs::read_dir(self.session_root().join(CURRENT_DIRECTORY))
            .map(|entries| entries.flatten().count())
            .unwrap_or(0)
    }
}

impl Drop for DevelopmentSnapshotStore {
    fn drop(&mut self) {
        let _ = remove_snapshot_tree(&self.session_root());
    }
}

trait CompatibleIdentity {
    fn is_compatible_with_identity(&self, identity: &str) -> bool;
}

impl CompatibleIdentity for DevelopmentDirectoryInspection {
    fn is_compatible_with_identity(&self, identity: &str) -> bool {
        match self {
            Self::Compatible(payload) => development_tree_identity(&payload.files) == identity,
            Self::Invalid { .. } | Self::Incompatible(_) => false,
        }
    }
}

fn map_diagnostics(
    diagnostics: &[crate::plugin_development_directory::DevelopmentDirectoryDiagnostic],
) -> DevelopmentSnapshotFailure {
    use crate::plugin_development_directory::DevelopmentDirectoryDiagnosticCode as Code;
    if diagnostics
        .iter()
        .any(|item| item.code == Code::SourceChanged)
    {
        DevelopmentSnapshotFailure::SourceChanged
    } else if diagnostics.iter().any(|item| item.code == Code::Unsafe) {
        DevelopmentSnapshotFailure::Unsafe
    } else if diagnostics
        .iter()
        .any(|item| item.code == Code::Unavailable)
    {
        DevelopmentSnapshotFailure::Unavailable
    } else {
        DevelopmentSnapshotFailure::Invalid
    }
}

pub fn development_tree_identity(files: &[CapturedDevelopmentFile]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(IDENTITY_DOMAIN);
    let mut files = files.iter().collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    for file in files {
        hasher.update((file.path.len() as u64).to_be_bytes());
        hasher.update(file.path.as_bytes());
        hasher.update((file.bytes.len() as u64).to_be_bytes());
        hasher.update(&file.bytes);
    }
    format!("{:x}", hasher.finalize())
}

fn random_identity() -> Result<String, DevelopmentSnapshotFailure> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn is_random_identity(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn write_snapshot_file(
    root: &Path,
    file: &CapturedDevelopmentFile,
) -> Result<(), DevelopmentSnapshotFailure> {
    let target = root.join(&file.path);
    let parent = target.parent().ok_or(DevelopmentSnapshotFailure::Unsafe)?;
    fs::create_dir_all(parent).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
    let mut output = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&target)
        .map_err(|_| DevelopmentSnapshotFailure::Unsafe)?;
    output
        .write_all(&file.bytes)
        .and_then(|_| output.sync_all())
        .map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
    let mut permissions = output
        .metadata()
        .map_err(|_| DevelopmentSnapshotFailure::Unavailable)?
        .permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&target, permissions).map_err(|_| DevelopmentSnapshotFailure::Unavailable)
}

fn sync_snapshot_directories(root: &Path) -> Result<(), DevelopmentSnapshotFailure> {
    let mut directories = BTreeSet::new();
    directories.insert(root.to_path_buf());
    for entry in walk_snapshot(root)? {
        if entry.is_dir() {
            directories.insert(entry);
        }
    }
    for directory in directories.into_iter().rev() {
        sync_directory(&directory)?;
    }
    Ok(())
}

fn walk_snapshot(root: &Path) -> Result<Vec<PathBuf>, DevelopmentSnapshotFailure> {
    let metadata =
        fs::symlink_metadata(root).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(DevelopmentSnapshotFailure::Unsafe);
    }
    let mut output = Vec::new();
    for entry in fs::read_dir(root).map_err(|_| DevelopmentSnapshotFailure::Unavailable)? {
        let path = entry
            .map_err(|_| DevelopmentSnapshotFailure::Unavailable)?
            .path();
        let metadata =
            fs::symlink_metadata(&path).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
        if metadata.file_type().is_symlink() || (!metadata.is_dir() && !metadata.is_file()) {
            return Err(DevelopmentSnapshotFailure::Unsafe);
        }
        if metadata.is_dir() {
            output.extend(walk_snapshot(&path)?);
        }
        output.push(path);
    }
    Ok(output)
}

fn remove_snapshot_tree(root: &Path) -> Result<(), DevelopmentSnapshotFailure> {
    if !root.exists() {
        return Ok(());
    }
    for path in walk_snapshot(root)? {
        let metadata =
            fs::symlink_metadata(&path).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
        if metadata.is_dir() {
            fs::remove_dir(&path).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
        } else {
            let mut permissions = metadata.permissions();
            permissions.set_readonly(false);
            let _ = fs::set_permissions(&path, permissions);
            fs::remove_file(&path).map_err(|_| DevelopmentSnapshotFailure::Unavailable)?;
        }
    }
    fs::remove_dir(root).map_err(|_| DevelopmentSnapshotFailure::Unavailable)
}

fn sync_directory(path: &Path) -> Result<(), DevelopmentSnapshotFailure> {
    #[cfg(unix)]
    {
        fs::File::open(path)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| DevelopmentSnapshotFailure::Unavailable)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_manager::current_plugin_host_versions;

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "lensx-development-snapshot-{name}-{}-{}",
                std::process::id(),
                random_identity().unwrap()
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
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn publishes_unique_generations_with_domain_separated_tree_identity() {
        let directory = TestDirectory::new("publish");
        let source = directory.source();
        let store = DevelopmentSnapshotStore::initialize(directory.0.join("cache")).unwrap();
        let versions = current_plugin_host_versions("0.1.0");
        let first = store.publish_from_source(&source, &versions).unwrap();
        let second = store.publish_from_source(&source, &versions).unwrap();
        assert_ne!(first.root, second.root);
        assert_eq!(first.identity, second.identity);
        assert!(store.owns_current_snapshot(&first.root, &first.identity, &versions));
        assert!(!first.identity.starts_with("sha256:"));
        assert!(store.retire(&first.root));
        assert!(!first.root.exists());
    }

    #[test]
    fn cleanup_failure_never_republishes_authority_and_is_bounded() {
        let directory = TestDirectory::new("cleanup-fault");
        let source = directory.source();
        let store = DevelopmentSnapshotStore::initialize(directory.0.join("cache")).unwrap();
        let snapshot = store
            .publish_from_source(&source, &current_plugin_host_versions("0.1.0"))
            .unwrap();
        store.set_cleanup_fault(true);
        assert!(!store.retire(&snapshot.root));
        assert_eq!(store.cleanup_diagnostics(), vec!["cleanup_pending"]);
        assert!(snapshot.root.exists());
        store.set_cleanup_fault(false);
        assert!(store.retire(&snapshot.root));
    }

    #[test]
    fn refuses_to_guess_cleanup_for_paths_outside_the_current_session() {
        let directory = TestDirectory::new("unsafe-cleanup");
        let store = DevelopmentSnapshotStore::initialize(directory.0.join("cache")).unwrap();
        let outside = directory.0.join("outside");
        fs::create_dir_all(&outside).unwrap();
        assert!(!store.retire(&outside));
        assert!(outside.exists());
        assert_eq!(store.cleanup_diagnostics(), vec!["cleanup_unsafe"]);
    }

    #[test]
    fn recovers_only_well_formed_current_session_staging_and_retired_residue() {
        let directory = TestDirectory::new("residue-recovery");
        let store = DevelopmentSnapshotStore::initialize(directory.0.join("cache")).unwrap();
        let session = store.session_root();
        let staging_generation = random_identity().unwrap();
        let retired_generation = random_identity().unwrap();
        let current_generation = random_identity().unwrap();
        let unsafe_name = "not-a-generation";

        for path in [
            session.join(STAGING_DIRECTORY).join(&staging_generation),
            session.join(RETIRED_DIRECTORY).join(&retired_generation),
            session.join(CURRENT_DIRECTORY).join(&current_generation),
            session.join(STAGING_DIRECTORY).join(unsafe_name),
        ] {
            fs::create_dir_all(&path).unwrap();
            fs::write(path.join("residue.txt"), b"residue").unwrap();
        }

        store.recover_residue();

        assert!(!session
            .join(STAGING_DIRECTORY)
            .join(staging_generation)
            .exists());
        assert!(!session
            .join(RETIRED_DIRECTORY)
            .join(retired_generation)
            .exists());
        assert!(session
            .join(CURRENT_DIRECTORY)
            .join(current_generation)
            .exists());
        assert!(session.join(STAGING_DIRECTORY).join(unsafe_name).exists());
        assert_eq!(store.cleanup_diagnostics(), vec!["cleanup_unsafe"]);
    }
}
