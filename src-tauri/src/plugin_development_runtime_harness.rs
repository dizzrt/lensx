use crate::{
    plugin_development_snapshot::{DevelopmentSnapshotStore, PublishedDevelopmentSnapshot},
    plugin_manager::{
        PluginManager, PluginRegistrationFacts, PluginRegistrationPayload, PluginSource,
    },
    plugin_manifest::{PluginHostVersions, PLUGIN_HOST_API_VERSION},
    plugin_package_format::{traverse_plugin_package, PackageEntrySink},
    plugin_registration::healthy_entry_id,
    plugin_resource_contract::{
        ResolvePluginResourceEntryRequest, PLUGIN_RESOURCE_CONTRACT_VERSION,
    },
    plugin_resource_service::PluginResourceService,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};
use tauri::http::{Method, Request, StatusCode};

#[derive(Default)]
struct MemoryPackageSink {
    entries: HashMap<String, Vec<u8>>,
}

impl PackageEntrySink for MemoryPackageSink {
    fn start_entry(&mut self, path: &str, size: u64) -> Result<(), ()> {
        let capacity = usize::try_from(size).map_err(|_| ())?;
        if self
            .entries
            .insert(path.to_owned(), Vec::with_capacity(capacity))
            .is_some()
        {
            return Err(());
        }
        Ok(())
    }

    fn write_chunk(&mut self, path: &str, bytes: &[u8]) -> Result<(), ()> {
        self.entries
            .get_mut(path)
            .ok_or(())?
            .extend_from_slice(bytes);
        Ok(())
    }

    fn finish_entry(&mut self, path: &str) -> Result<(), ()> {
        self.entries.contains_key(path).then_some(()).ok_or(())
    }

    fn finish_archive(&mut self) -> Result<(), ()> {
        Ok(())
    }
}

struct CurrentDevelopmentGeneration {
    entry_id: String,
    entry_url: String,
    snapshot: PublishedDevelopmentSnapshot,
}

#[derive(Clone, Debug, Serialize)]
pub struct DevelopmentHarnessRegistration {
    pub entry_url: String,
    pub source_development: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct DevelopmentHarnessReload {
    pub entry_url: String,
    pub old_scope_revoked: bool,
    pub manifest_version_advanced: bool,
    pub revision_advanced: bool,
    pub scope_changed: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct DevelopmentHarnessRemoval {
    pub current_scope_revoked: bool,
    pub registration_removed: bool,
}

#[doc(hidden)]
pub struct PluginDevelopmentRuntimeHarness {
    root: PathBuf,
    source: PathBuf,
    manager: Arc<PluginManager>,
    snapshots: Arc<DevelopmentSnapshotStore>,
    resources: Arc<PluginResourceService>,
    current: Mutex<Option<CurrentDevelopmentGeneration>>,
}

impl PluginDevelopmentRuntimeHarness {
    pub fn register(
        root: PathBuf,
        package: &[u8],
    ) -> Result<(Arc<Self>, DevelopmentHarnessRegistration), ()> {
        if !root.is_absolute() || root.exists() {
            return Err(());
        }
        let source = root.join("source");
        fs::create_dir_all(&source).map_err(|_| ())?;
        extract_package_payload(package, &source)?;
        let manager = PluginManager::recover(root.join("config"), versions());
        let snapshots =
            Arc::new(DevelopmentSnapshotStore::initialize(root.join("cache")).map_err(|_| ())?);
        let snapshot = snapshots
            .publish_from_source(&source, &manager.host_versions())
            .map_err(|_| ())?;
        let facts = PluginRegistrationFacts::development(
            snapshot.root.clone(),
            snapshot.identity.clone(),
            source.clone(),
            true,
        )
        .map_err(|_| ())?;
        manager
            .register_development(snapshot.manifest.clone(), facts)
            .map_err(|_| ())?;
        let registration = manager
            .registration(&snapshot.manifest.plugin_id)
            .ok_or(())?;
        let entry_id = healthy_entry_id(&registration);
        let resources =
            PluginResourceService::initialize_for_macos_harness(Arc::clone(&manager), None);
        resources.attach_development_snapshots(Some(Arc::clone(&snapshots)));
        let entry_url = resources
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: entry_id.clone(),
                expected_revision: manager.registration_revision(),
            })
            .map_err(|_| ())?
            .entry_url;
        let source_development = registration.facts.source == PluginSource::Development
            && matches!(
                registration.facts.payload,
                PluginRegistrationPayload::DevelopmentSnapshot { .. }
            );
        let harness = Arc::new(Self {
            root,
            source,
            manager,
            snapshots,
            resources,
            current: Mutex::new(Some(CurrentDevelopmentGeneration {
                entry_id,
                entry_url: entry_url.clone(),
                snapshot,
            })),
        });
        Ok((
            harness,
            DevelopmentHarnessRegistration {
                entry_url,
                source_development,
            },
        ))
    }

    pub fn resource_service(&self) -> Arc<PluginResourceService> {
        Arc::clone(&self.resources)
    }

    pub fn reload(&self) -> Result<DevelopmentHarnessReload, ()> {
        let mut current = self.lock_current();
        let previous = current.take().ok_or(())?;
        let previous_revision = self.manager.registration_revision();
        advance_manifest_version(&self.source)?;
        let snapshot = self
            .snapshots
            .publish_from_source(&self.source, &self.manager.host_versions())
            .map_err(|_| ())?;
        let existing = self
            .manager
            .registration(&snapshot.manifest.plugin_id)
            .ok_or(())?;
        let facts = PluginRegistrationFacts::development(
            snapshot.root.clone(),
            snapshot.identity.clone(),
            self.source.clone(),
            existing.facts.enabled,
        )
        .map_err(|_| ())?;
        if self
            .manager
            .reload_development_entry(
                &previous.entry_id,
                &previous_revision,
                snapshot.manifest.clone(),
                facts,
            )
            .is_err()
        {
            self.snapshots.discard_uncommitted(&snapshot.root);
            *current = Some(previous);
            return Err(());
        }
        let next_revision = self.manager.registration_revision();
        let old_scope_revoked =
            response_status(&self.resources, &previous.entry_url) == StatusCode::NOT_FOUND;
        let _ = self.snapshots.retire(&previous.snapshot.root);
        let entry_url = self
            .resources
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: previous.entry_id.clone(),
                expected_revision: next_revision.clone(),
            })
            .map_err(|_| ())?
            .entry_url;
        let manifest_version_advanced = snapshot.manifest.version == "1.1.0";
        let scope_changed = previous.entry_url != entry_url;
        *current = Some(CurrentDevelopmentGeneration {
            entry_id: previous.entry_id,
            entry_url: entry_url.clone(),
            snapshot,
        });
        Ok(DevelopmentHarnessReload {
            entry_url,
            old_scope_revoked,
            manifest_version_advanced,
            revision_advanced: previous_revision != next_revision,
            scope_changed,
        })
    }

    pub fn remove(&self) -> Result<DevelopmentHarnessRemoval, ()> {
        let mut current = self.lock_current();
        let generation = current.take().ok_or(())?;
        let plugin_id = generation.snapshot.manifest.plugin_id.clone();
        self.manager
            .remove_development_entry(&generation.entry_id, &self.manager.registration_revision())
            .map_err(|_| ())?;
        let current_scope_revoked =
            response_status(&self.resources, &generation.entry_url) == StatusCode::NOT_FOUND;
        let _ = self.snapshots.retire(&generation.snapshot.root);
        Ok(DevelopmentHarnessRemoval {
            current_scope_revoked,
            registration_removed: self.manager.registration(&plugin_id).is_none(),
        })
    }

    fn lock_current(&self) -> MutexGuard<'_, Option<CurrentDevelopmentGeneration>> {
        self.current
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Drop for PluginDevelopmentRuntimeHarness {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn versions() -> PluginHostVersions {
    PluginHostVersions {
        lensx: "0.1.0".to_owned(),
        host_api: PLUGIN_HOST_API_VERSION.to_owned(),
    }
}

fn extract_package_payload(package: &[u8], source: &Path) -> Result<(), ()> {
    let mut sink = MemoryPackageSink::default();
    traverse_plugin_package(package, &mut sink).map_err(|_| ())?;
    for (relative, bytes) in sink.entries {
        if relative == "checksums.json" {
            continue;
        }
        let target = source.join(relative);
        fs::create_dir_all(target.parent().ok_or(())?).map_err(|_| ())?;
        fs::write(target, bytes).map_err(|_| ())?;
    }
    Ok(())
}

fn advance_manifest_version(source: &Path) -> Result<(), ()> {
    let path = source.join("manifest.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).map_err(|_| ())?).map_err(|_| ())?;
    let object = manifest.as_object_mut().ok_or(())?;
    object.insert(
        "version".to_owned(),
        serde_json::Value::String("1.1.0".to_owned()),
    );
    let mut bytes = serde_json::to_vec(&manifest).map_err(|_| ())?;
    bytes.push(b'\n');
    fs::write(path, bytes).map_err(|_| ())
}

fn response_status(resources: &PluginResourceService, url: &str) -> StatusCode {
    resources
        .handle_request(
            Request::builder()
                .method(Method::GET)
                .uri(url)
                .body(Vec::new())
                .expect("development harness request should build"),
        )
        .status()
}
