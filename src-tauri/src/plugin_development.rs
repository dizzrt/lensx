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
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

pub const PLUGIN_DEVELOPMENT_CONTRACT_VERSION: &str = "0.1.0";

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
    coordinator: Option<PluginDevelopmentCoordinator>,
}

impl Default for PluginDevelopmentModeState {
    fn default() -> Self {
        Self {
            enabled: Mutex::new(false),
            operation: Mutex::new(()),
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

impl PluginDevelopmentCoordinator {
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
) -> Arc<PluginDevelopmentModeState> {
    let coordinator = app
        .path()
        .app_cache_dir()
        .ok()
        .and_then(|cache_dir| DevelopmentSnapshotStore::initialize(cache_dir).ok())
        .map(|snapshots| PluginDevelopmentCoordinator {
            manager,
            snapshots: Arc::new(snapshots),
        });
    let state = Arc::new(PluginDevelopmentModeState {
        enabled: Mutex::new(false),
        operation: Mutex::new(()),
        coordinator,
    });
    let managed = app.manage(Arc::clone(&state));
    debug_assert!(
        managed,
        "Plugin Development Mode state should only be managed once"
    );
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_manager::current_plugin_host_versions,
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
