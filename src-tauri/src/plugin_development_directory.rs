use crate::{
    plugin_manifest::{
        NormalizedPluginManifest, PluginHostVersions, PluginManifestCompatibility,
        PluginManifestValidationStatus,
    },
    plugin_package_format::{
        ascii_fold, sha256_hex, validate_portable_path, validate_unpacked_payload, PackageFileFact,
        UnpackedPayloadValidation, MAX_FILE_BYTES, MAX_FILE_COUNT, MAX_MANIFEST_BYTES,
        MAX_TAR_BYTES,
    },
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, Metadata},
    io::{self, Read},
    path::{Path, PathBuf},
    time::SystemTime,
};

const MANIFEST_PATH: &str = "manifest.json";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DevelopmentDirectoryDiagnosticCode {
    Incompatible,
    Invalid,
    SourceChanged,
    Unsafe,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DevelopmentDirectoryDiagnostic {
    pub code: DevelopmentDirectoryDiagnosticCode,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl DevelopmentDirectoryDiagnostic {
    fn new(
        code: DevelopmentDirectoryDiagnosticCode,
        reason: impl Into<String>,
        path: Option<String>,
    ) -> Self {
        Self {
            code,
            reason: reason.into(),
            path: path.filter(|value| value.len() <= 100 && value.is_ascii()),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapturedDevelopmentFile {
    pub path: String,
    pub bytes: Vec<u8>,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ValidatedDevelopmentPayload {
    pub manifest: NormalizedPluginManifest,
    pub compatibility: PluginManifestCompatibility,
    pub files: Vec<CapturedDevelopmentFile>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum DevelopmentDirectoryInspection {
    Invalid {
        diagnostics: Vec<DevelopmentDirectoryDiagnostic>,
    },
    IncompatibleProtocol {
        diagnostics: Vec<DevelopmentDirectoryDiagnostic>,
    },
    Compatible(ValidatedDevelopmentPayload),
    Incompatible(ValidatedDevelopmentPayload),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DevelopmentFileMetadata {
    kind: DevelopmentFileKind,
    len: u64,
    modified: Option<SystemTime>,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DevelopmentFileKind {
    Directory,
    File,
    Link,
    Special,
}

impl DevelopmentFileMetadata {
    fn from_std(metadata: Metadata) -> Self {
        let file_type = metadata.file_type();
        let kind = if file_type.is_symlink() {
            DevelopmentFileKind::Link
        } else if file_type.is_dir() {
            DevelopmentFileKind::Directory
        } else if file_type.is_file() {
            DevelopmentFileKind::File
        } else {
            DevelopmentFileKind::Special
        };
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        Self {
            kind,
            len: metadata.len(),
            modified: metadata.modified().ok(),
            #[cfg(unix)]
            device: metadata.dev(),
            #[cfg(unix)]
            inode: metadata.ino(),
        }
    }
}

pub trait DevelopmentFileSystem {
    fn metadata(&self, path: &Path) -> io::Result<DevelopmentFileMetadata>;
    fn read_directory(&self, path: &Path) -> io::Result<Vec<PathBuf>>;
    fn read_file(&self, path: &Path, limit: u64) -> io::Result<Vec<u8>>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NativeDevelopmentFileSystem;

impl DevelopmentFileSystem for NativeDevelopmentFileSystem {
    fn metadata(&self, path: &Path) -> io::Result<DevelopmentFileMetadata> {
        fs::symlink_metadata(path).map(DevelopmentFileMetadata::from_std)
    }

    fn read_directory(&self, path: &Path) -> io::Result<Vec<PathBuf>> {
        let mut paths = fs::read_dir(path)?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<io::Result<Vec<_>>>()?;
        paths.sort();
        Ok(paths)
    }

    fn read_file(&self, path: &Path, limit: u64) -> io::Result<Vec<u8>> {
        let mut bytes = Vec::new();
        fs::File::open(path)?
            .take(limit.saturating_add(1))
            .read_to_end(&mut bytes)?;
        Ok(bytes)
    }
}

fn safe_relative_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut segments = Vec::new();
    for component in relative.components() {
        let std::path::Component::Normal(segment) = component else {
            return None;
        };
        segments.push(segment.to_str()?.to_owned());
    }
    (!segments.is_empty()).then(|| segments.join("/"))
}

fn invalid(reason: impl Into<String>, path: Option<String>) -> DevelopmentDirectoryInspection {
    DevelopmentDirectoryInspection::Invalid {
        diagnostics: vec![DevelopmentDirectoryDiagnostic::new(
            DevelopmentDirectoryDiagnosticCode::Invalid,
            reason,
            path,
        )],
    }
}

fn unsafe_input(reason: impl Into<String>, path: Option<String>) -> DevelopmentDirectoryInspection {
    DevelopmentDirectoryInspection::Invalid {
        diagnostics: vec![DevelopmentDirectoryDiagnostic::new(
            DevelopmentDirectoryDiagnosticCode::Unsafe,
            reason,
            path,
        )],
    }
}

fn io_failure(error: &io::Error, path: Option<String>) -> DevelopmentDirectoryInspection {
    let code = if error.kind() == io::ErrorKind::NotFound {
        DevelopmentDirectoryDiagnosticCode::SourceChanged
    } else {
        DevelopmentDirectoryDiagnosticCode::Unavailable
    };
    DevelopmentDirectoryInspection::Invalid {
        diagnostics: vec![DevelopmentDirectoryDiagnostic::new(
            code,
            "io_failure",
            path,
        )],
    }
}

fn collect_paths(
    file_system: &impl DevelopmentFileSystem,
    root: &Path,
    directory: &Path,
    files: &mut Vec<(PathBuf, String, DevelopmentFileMetadata)>,
) -> Result<(), DevelopmentDirectoryInspection> {
    let entries = file_system
        .read_directory(directory)
        .map_err(|error| io_failure(&error, safe_relative_path(root, directory)))?;
    for entry in entries {
        let relative = safe_relative_path(root, &entry)
            .ok_or_else(|| unsafe_input("path_outside_root", None))?;
        let metadata = file_system
            .metadata(&entry)
            .map_err(|error| io_failure(&error, Some(relative.clone())))?;
        match metadata.kind {
            DevelopmentFileKind::Directory => {
                collect_paths(file_system, root, &entry, files)?;
            }
            DevelopmentFileKind::File => {
                files.push((entry, relative, metadata));
                if files.len() > MAX_FILE_COUNT {
                    return Err(invalid("file_count_exceeded", None));
                }
            }
            DevelopmentFileKind::Link | DevelopmentFileKind::Special => {
                return Err(unsafe_input("non_regular_entry", Some(relative)));
            }
        }
    }
    Ok(())
}

pub fn inspect_development_directory(
    root: &Path,
    file_system: &impl DevelopmentFileSystem,
    current_versions: &PluginHostVersions,
) -> DevelopmentDirectoryInspection {
    let root_before = match file_system.metadata(root) {
        Ok(metadata) => metadata,
        Err(error) => return io_failure(&error, None),
    };
    if root_before.kind != DevelopmentFileKind::Directory {
        return unsafe_input("root_not_directory", None);
    }
    let mut candidates = Vec::new();
    if let Err(failure) = collect_paths(file_system, root, root, &mut candidates) {
        return failure;
    }
    candidates.sort_by(|left, right| left.1.cmp(&right.1));

    let mut folded = BTreeSet::new();
    let mut captured = Vec::with_capacity(candidates.len());
    let mut total_size = 0_u64;
    for (path, relative, before) in candidates {
        if !validate_portable_path(&relative).is_empty() {
            return invalid("path_invalid", Some(relative));
        }
        if !folded.insert(ascii_fold(&relative)) {
            return invalid("path_case_collision", Some(relative));
        }
        let limit = if relative == MANIFEST_PATH {
            MAX_MANIFEST_BYTES
        } else {
            MAX_FILE_BYTES
        };
        if before.len > limit {
            return invalid("file_size_exceeded", Some(relative));
        }
        let bytes = match file_system.read_file(&path, limit) {
            Ok(bytes) => bytes,
            Err(error) => return io_failure(&error, Some(relative)),
        };
        let after = match file_system.metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => return io_failure(&error, Some(relative)),
        };
        if before != after
            || after.kind != DevelopmentFileKind::File
            || bytes.len() as u64 != after.len
        {
            return DevelopmentDirectoryInspection::Invalid {
                diagnostics: vec![DevelopmentDirectoryDiagnostic::new(
                    DevelopmentDirectoryDiagnosticCode::SourceChanged,
                    "source_changed",
                    Some(relative),
                )],
            };
        }
        if bytes.len() as u64 > limit {
            return invalid("file_size_exceeded", Some(relative));
        }
        total_size = total_size.saturating_add(bytes.len() as u64);
        if total_size > MAX_TAR_BYTES {
            return invalid("total_size_exceeded", None);
        }
        captured.push(CapturedDevelopmentFile {
            path: relative,
            sha256: sha256_hex(&bytes),
            bytes,
        });
    }
    let root_after = match file_system.metadata(root) {
        Ok(metadata) => metadata,
        Err(error) => return io_failure(&error, None),
    };
    if root_before != root_after {
        return DevelopmentDirectoryInspection::Invalid {
            diagnostics: vec![DevelopmentDirectoryDiagnostic::new(
                DevelopmentDirectoryDiagnosticCode::SourceChanged,
                "source_changed",
                None,
            )],
        };
    }

    let by_path = captured
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<BTreeMap<_, _>>();
    let Some(manifest_file) = by_path.get(MANIFEST_PATH) else {
        return invalid("manifest_missing", None);
    };
    let file_facts = captured
        .iter()
        .map(|file| PackageFileFact {
            path: file.path.clone(),
            size: file.bytes.len() as u64,
            sha256: file.sha256.clone(),
            checksum_covered: false,
        })
        .collect::<Vec<_>>();
    match validate_unpacked_payload(&manifest_file.bytes, &file_facts, current_versions) {
        UnpackedPayloadValidation::Invalid(diagnostics) => {
            DevelopmentDirectoryInspection::Invalid {
                diagnostics: diagnostics
                    .into_iter()
                    .take(32)
                    .map(|diagnostic| {
                        DevelopmentDirectoryDiagnostic::new(
                            DevelopmentDirectoryDiagnosticCode::Invalid,
                            diagnostic.code,
                            Some(diagnostic.path),
                        )
                    })
                    .collect(),
            }
        }
        UnpackedPayloadValidation::IncompatibleProtocol(diagnostics) => {
            DevelopmentDirectoryInspection::IncompatibleProtocol {
                diagnostics: diagnostics
                    .into_iter()
                    .take(32)
                    .map(|diagnostic| {
                        DevelopmentDirectoryDiagnostic::new(
                            DevelopmentDirectoryDiagnosticCode::Incompatible,
                            diagnostic.code,
                            Some(diagnostic.path),
                        )
                    })
                    .collect(),
            }
        }
        UnpackedPayloadValidation::Valid {
            status,
            manifest,
            compatibility,
        } => {
            let payload = ValidatedDevelopmentPayload {
                manifest,
                compatibility,
                files: captured,
            };
            if status == PluginManifestValidationStatus::Compatible {
                DevelopmentDirectoryInspection::Compatible(payload)
            } else {
                DevelopmentDirectoryInspection::Incompatible(payload)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_manager::current_plugin_host_versions;
    use serde::Deserialize;
    use serde_json::Value;
    use std::{fs, sync::Mutex};

    #[derive(Deserialize)]
    struct CorpusCase {
        name: String,
        manifest: String,
        paths: Vec<String>,
        virtual_file_count: Option<usize>,
        virtual_file_size: Option<u64>,
        virtual_total_size: Option<u64>,
        expected: String,
    }

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "lensx-development-directory-{name}-{}-{}",
                std::process::id(),
                crate::plugin_package_format::sha256_hex(name.as_bytes())
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn write_valid_payload(&self) {
            let manifest =
                fs::read("../packages/plugin-contract/tests/fixtures/base.json").unwrap();
            fs::write(self.0.join("manifest.json"), manifest).unwrap();
            fs::create_dir_all(self.0.join("dist")).unwrap();
            fs::create_dir_all(self.0.join("assets")).unwrap();
            fs::write(self.0.join("dist/plugin.html"), b"<!doctype html>").unwrap();
            fs::write(self.0.join("assets/plugin-icon.svg"), b"<svg/>").unwrap();
            fs::write(self.0.join("assets/home.svg"), b"<svg/>").unwrap();
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn accepts_self_contained_payload_without_project_metadata_or_checksums() {
        let directory = TestDirectory::new("valid");
        directory.write_valid_payload();
        assert!(matches!(
            inspect_development_directory(
                &directory.0,
                &NativeDevelopmentFileSystem,
                &current_plugin_host_versions("0.1.0"),
            ),
            DevelopmentDirectoryInspection::Compatible(_)
        ));
    }

    #[test]
    fn shared_cli_host_payload_corpus_agrees() {
        let corpus: Vec<CorpusCase> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-development-directory/cases.json"
        ))
        .unwrap();
        let base: Value = serde_json::from_str(include_str!(
            "../../packages/plugin-contract/tests/fixtures/base.json"
        ))
        .unwrap();
        for fixture in corpus {
            let limit_invalid = fixture.virtual_file_count.unwrap_or(fixture.paths.len())
                > MAX_FILE_COUNT
                || fixture.virtual_file_size.unwrap_or(1) > MAX_FILE_BYTES
                || fixture
                    .virtual_total_size
                    .unwrap_or(fixture.paths.len() as u64)
                    > MAX_TAR_BYTES;
            let mut folded = BTreeSet::new();
            let path_invalid = fixture.paths.iter().any(|path| {
                !validate_portable_path(path).is_empty() || !folded.insert(ascii_fold(path))
            });
            let actual = if limit_invalid || path_invalid {
                "invalid"
            } else {
                let mut manifest = base.clone();
                if fixture.manifest == "incompatible" {
                    manifest["compatibility"]["lensx"]["min_version"] =
                        Value::String("0.0.1".to_owned());
                    manifest["compatibility"]["lensx"]["max_version_exclusive"] =
                        Value::String("0.1.0".to_owned());
                    manifest["compatibility"]["host_api"]["min_version"] =
                        Value::String("0.0.1".to_owned());
                    manifest["compatibility"]["host_api"]["max_version_exclusive"] =
                        Value::String("0.1.0".to_owned());
                }
                if fixture.manifest == "legacy_manifest" {
                    manifest["manifest_version"] = Value::String("0.2.0".to_owned());
                }
                if fixture.manifest == "legacy_iframe" {
                    manifest["runtime"]["kind"] = Value::String("iframe".to_owned());
                }
                let manifest_bytes = if fixture.manifest == "invalid" {
                    b"{".to_vec()
                } else {
                    serde_json::to_vec(&manifest).unwrap()
                };
                let files = fixture
                    .paths
                    .iter()
                    .map(|path| PackageFileFact {
                        path: path.clone(),
                        size: 1,
                        sha256: "00".to_owned(),
                        checksum_covered: false,
                    })
                    .collect::<Vec<_>>();
                match validate_unpacked_payload(
                    &manifest_bytes,
                    &files,
                    &current_plugin_host_versions("0.1.0"),
                ) {
                    UnpackedPayloadValidation::Invalid(_) => "invalid",
                    UnpackedPayloadValidation::IncompatibleProtocol(_) => "incompatible",
                    UnpackedPayloadValidation::Valid { status, .. }
                        if status == PluginManifestValidationStatus::Compatible =>
                    {
                        "compatible"
                    }
                    UnpackedPayloadValidation::Valid { .. } => "incompatible",
                }
            };
            assert_eq!(actual, fixture.expected, "corpus case {}", fixture.name);
        }
    }

    #[test]
    fn classifies_legacy_manifest_and_iframe_runtime_as_bounded_incompatible_protocol() {
        for (name, pointer, mutate) in [
            (
                "legacy-manifest",
                "/manifest_version",
                (|manifest: &mut Value| {
                    manifest["manifest_version"] = Value::String("0.2.0".to_owned());
                }) as fn(&mut Value),
            ),
            (
                "legacy-iframe",
                "/runtime/kind",
                (|manifest: &mut Value| {
                    manifest["runtime"]["kind"] = Value::String("iframe".to_owned());
                }) as fn(&mut Value),
            ),
        ] {
            let directory = TestDirectory::new(name);
            directory.write_valid_payload();
            let mut manifest: Value =
                serde_json::from_slice(&fs::read(directory.0.join("manifest.json")).unwrap())
                    .unwrap();
            mutate(&mut manifest);
            fs::write(
                directory.0.join("manifest.json"),
                serde_json::to_vec(&manifest).unwrap(),
            )
            .unwrap();

            let DevelopmentDirectoryInspection::IncompatibleProtocol { diagnostics } =
                inspect_development_directory(
                    &directory.0,
                    &NativeDevelopmentFileSystem,
                    &current_plugin_host_versions("0.1.0"),
                )
            else {
                panic!("legacy development payload must be protocol-incompatible")
            };
            assert!(!diagnostics.is_empty() && diagnostics.len() <= 32);
            assert!(diagnostics.iter().all(|diagnostic| {
                diagnostic.code == DevelopmentDirectoryDiagnosticCode::Incompatible
                    && diagnostic.reason == "manifest_incompatible"
            }));
            assert!(diagnostics
                .iter()
                .any(|diagnostic| { diagnostic.path.as_deref() == Some(pointer) }));
            let encoded = serde_json::to_string(&diagnostics).unwrap();
            assert!(!encoded.contains(directory.0.to_string_lossy().as_ref()));
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_links_case_collisions_and_missing_resources_without_path_leaks() {
        use std::os::unix::fs::symlink;
        let link = TestDirectory::new("link");
        link.write_valid_payload();
        symlink(link.0.join("dist/plugin.html"), link.0.join("linked.html")).unwrap();
        let result = inspect_development_directory(
            &link.0,
            &NativeDevelopmentFileSystem,
            &current_plugin_host_versions("0.1.0"),
        );
        assert!(matches!(
            result,
            DevelopmentDirectoryInspection::Invalid { .. }
        ));
        let encoded = serde_json::to_string(&match result {
            DevelopmentDirectoryInspection::Invalid { diagnostics } => diagnostics,
            _ => unreachable!(),
        })
        .unwrap();
        assert!(!encoded.contains(link.0.to_string_lossy().as_ref()));

        struct DuplicateCaseFileSystem;
        impl DevelopmentFileSystem for DuplicateCaseFileSystem {
            fn metadata(&self, path: &Path) -> io::Result<DevelopmentFileMetadata> {
                NativeDevelopmentFileSystem.metadata(path)
            }
            fn read_directory(&self, path: &Path) -> io::Result<Vec<PathBuf>> {
                let mut paths = NativeDevelopmentFileSystem.read_directory(path)?;
                if path.join("README").is_file() {
                    paths.push(path.join("readme"));
                }
                Ok(paths)
            }
            fn read_file(&self, path: &Path, limit: u64) -> io::Result<Vec<u8>> {
                NativeDevelopmentFileSystem.read_file(path, limit)
            }
        }

        let collision = TestDirectory::new("collision");
        collision.write_valid_payload();
        fs::write(collision.0.join("README"), b"a").unwrap();
        assert!(matches!(
            inspect_development_directory(
                &collision.0,
                &DuplicateCaseFileSystem,
                &current_plugin_host_versions("0.1.0"),
            ),
            DevelopmentDirectoryInspection::Invalid { .. }
        ));

        let missing = TestDirectory::new("missing-resource");
        missing.write_valid_payload();
        fs::remove_file(missing.0.join("assets/home.svg")).unwrap();
        assert!(matches!(
            inspect_development_directory(
                &missing.0,
                &NativeDevelopmentFileSystem,
                &current_plugin_host_versions("0.1.0"),
            ),
            DevelopmentDirectoryInspection::Invalid { .. }
        ));
    }

    struct ChangingFileSystem {
        native: NativeDevelopmentFileSystem,
        reads: Mutex<usize>,
    }

    impl DevelopmentFileSystem for ChangingFileSystem {
        fn metadata(&self, path: &Path) -> io::Result<DevelopmentFileMetadata> {
            let mut reads = self.reads.lock().unwrap();
            *reads += 1;
            let mut metadata = self.native.metadata(path)?;
            if path.file_name().and_then(|name| name.to_str()) == Some("plugin.html") && *reads > 4
            {
                metadata.len = metadata.len.saturating_add(1);
            }
            Ok(metadata)
        }

        fn read_directory(&self, path: &Path) -> io::Result<Vec<PathBuf>> {
            self.native.read_directory(path)
        }

        fn read_file(&self, path: &Path, limit: u64) -> io::Result<Vec<u8>> {
            self.native.read_file(path, limit)
        }
    }

    #[test]
    fn injected_filesystem_detects_read_before_after_currentness_changes() {
        let directory = TestDirectory::new("source-changed");
        directory.write_valid_payload();
        let file_system = ChangingFileSystem {
            native: NativeDevelopmentFileSystem,
            reads: Mutex::new(0),
        };
        let result = inspect_development_directory(
            &directory.0,
            &file_system,
            &current_plugin_host_versions("0.1.0"),
        );
        assert!(matches!(
            result,
            DevelopmentDirectoryInspection::Invalid { ref diagnostics }
                if diagnostics.iter().any(|item| item.code == DevelopmentDirectoryDiagnosticCode::SourceChanged)
        ));
    }

    #[derive(Clone, Copy)]
    enum InjectedFault {
        DeleteAfterRead,
        LinkAfterRead,
        PermissionDenied,
        ReplaceAfterRead,
        RootChanged,
        TruncateAfterRead,
    }

    struct FaultingFileSystem {
        native: NativeDevelopmentFileSystem,
        fault: InjectedFault,
        target_metadata_reads: Mutex<usize>,
        root_metadata_reads: Mutex<usize>,
        root: PathBuf,
    }

    impl DevelopmentFileSystem for FaultingFileSystem {
        fn metadata(&self, path: &Path) -> io::Result<DevelopmentFileMetadata> {
            let mut metadata = self.native.metadata(path)?;
            if path == self.root {
                let mut reads = self.root_metadata_reads.lock().unwrap();
                *reads += 1;
                if matches!(self.fault, InjectedFault::RootChanged) && *reads > 1 {
                    metadata.len = metadata.len.saturating_add(1);
                }
                return Ok(metadata);
            }
            if path.file_name().and_then(|name| name.to_str()) == Some("plugin.html") {
                let mut reads = self.target_metadata_reads.lock().unwrap();
                *reads += 1;
                if *reads > 1 {
                    match self.fault {
                        InjectedFault::DeleteAfterRead => {
                            return Err(io::Error::new(io::ErrorKind::NotFound, "removed"));
                        }
                        InjectedFault::LinkAfterRead => metadata.kind = DevelopmentFileKind::Link,
                        InjectedFault::ReplaceAfterRead => {
                            #[cfg(unix)]
                            {
                                metadata.inode = metadata.inode.saturating_add(1);
                            }
                            #[cfg(not(unix))]
                            {
                                metadata.modified = None;
                            }
                        }
                        InjectedFault::TruncateAfterRead => {
                            metadata.len = metadata.len.saturating_sub(1)
                        }
                        InjectedFault::PermissionDenied | InjectedFault::RootChanged => {}
                    }
                }
            }
            Ok(metadata)
        }

        fn read_directory(&self, path: &Path) -> io::Result<Vec<PathBuf>> {
            self.native.read_directory(path)
        }

        fn read_file(&self, path: &Path, limit: u64) -> io::Result<Vec<u8>> {
            if matches!(self.fault, InjectedFault::PermissionDenied)
                && path.file_name().and_then(|name| name.to_str()) == Some("plugin.html")
            {
                return Err(io::Error::new(io::ErrorKind::PermissionDenied, "denied"));
            }
            self.native.read_file(path, limit)
        }
    }

    #[test]
    fn injected_races_and_io_failures_fail_closed_with_bounded_diagnostics() {
        for fault in [
            InjectedFault::DeleteAfterRead,
            InjectedFault::LinkAfterRead,
            InjectedFault::PermissionDenied,
            InjectedFault::ReplaceAfterRead,
            InjectedFault::RootChanged,
            InjectedFault::TruncateAfterRead,
        ] {
            let directory = TestDirectory::new(match fault {
                InjectedFault::DeleteAfterRead => "delete",
                InjectedFault::LinkAfterRead => "link-race",
                InjectedFault::PermissionDenied => "permission",
                InjectedFault::ReplaceAfterRead => "replace",
                InjectedFault::RootChanged => "root-change",
                InjectedFault::TruncateAfterRead => "truncate",
            });
            directory.write_valid_payload();
            let file_system = FaultingFileSystem {
                native: NativeDevelopmentFileSystem,
                fault,
                target_metadata_reads: Mutex::new(0),
                root_metadata_reads: Mutex::new(0),
                root: directory.0.clone(),
            };
            let result = inspect_development_directory(
                &directory.0,
                &file_system,
                &current_plugin_host_versions("0.1.0"),
            );
            let DevelopmentDirectoryInspection::Invalid { diagnostics } = result else {
                panic!("faulted inspection must fail");
            };
            assert!(diagnostics.iter().all(|diagnostic| matches!(
                diagnostic.code,
                DevelopmentDirectoryDiagnosticCode::SourceChanged
                    | DevelopmentDirectoryDiagnosticCode::Unavailable
            )));
            let encoded = serde_json::to_string(&diagnostics).unwrap();
            assert!(!encoded.contains(directory.0.to_string_lossy().as_ref()));
            assert!(!encoded.contains("denied"));
        }
    }
}
