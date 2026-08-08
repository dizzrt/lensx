use crate::{
    plugin_installer::{
        CleanupDataPolicy, PluginInstaller, PluginLifecycleStorageError, PluginUninstallCommit,
    },
    plugin_registration::{
        emit_plugin_registration_changed, is_valid_plugin_registration_entry_id,
        PluginRegistrationEventEmitter,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime, State};

pub const PLUGIN_LIFECYCLE_CONTRACT_VERSION: &str = "0.1.0";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginLifecycleOutcome {
    Changed,
    Unchanged,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginLifecycleCleanupConclusion {
    NotApplicable,
    Complete,
    Pending,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginLifecycleDataPolicy {
    RetainData,
    DeleteData,
}

impl From<PluginLifecycleDataPolicy> for CleanupDataPolicy {
    fn from(value: PluginLifecycleDataPolicy) -> Self {
        match value {
            PluginLifecycleDataPolicy::RetainData => Self::RetainData,
            PluginLifecycleDataPolicy::DeleteData => Self::DeleteData,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SetPluginEnabledRequest {
    pub contract_version: String,
    pub entry_id: String,
    pub expected_revision: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct UninstallPluginRequest {
    pub contract_version: String,
    pub entry_id: String,
    pub expected_revision: String,
    pub data_policy: PluginLifecycleDataPolicy,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginLifecycleResult {
    SetEnabled {
        contract_version: String,
        outcome: PluginLifecycleOutcome,
        entry_id: String,
        plugin_id: String,
        revision: String,
        enabled: bool,
        effective_available: bool,
        cleanup: PluginLifecycleCleanupConclusion,
    },
    Uninstall {
        contract_version: String,
        outcome: PluginLifecycleOutcome,
        entry_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        plugin_id: Option<String>,
        revision: String,
        effective_available: bool,
        cleanup: PluginLifecycleCleanupConclusion,
        data_policy: PluginLifecycleDataPolicy,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginLifecycleErrorCode {
    InvalidRequest,
    Conflict,
    InvalidState,
    NotFound,
    Busy,
    Unavailable,
    PersistFailed,
    OperationNotSupported,
    UnsafeCleanup,
    Internal,
}

impl PluginLifecycleErrorCode {
    fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "Plugin lifecycle request is invalid.",
            Self::Conflict => "Plugin lifecycle request conflicts with current state.",
            Self::InvalidState => "Plugin lifecycle operation is not valid for this entry.",
            Self::NotFound => "Plugin lifecycle entry was not found.",
            Self::Busy => "Another plugin lifecycle operation is in progress.",
            Self::Unavailable => "Plugin lifecycle storage is unavailable.",
            Self::PersistFailed => "Plugin lifecycle state could not be saved.",
            Self::OperationNotSupported => {
                "Plugin lifecycle operation is not supported for this entry."
            }
            Self::UnsafeCleanup => "Plugin lifecycle cleanup evidence is unsafe.",
            Self::Internal => "Plugin lifecycle operation failed.",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginLifecycleOperation {
    SetEnabled,
    Uninstall,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginLifecycleError {
    pub contract_version: String,
    pub code: PluginLifecycleErrorCode,
    pub operation: PluginLifecycleOperation,
    pub message: String,
}

impl PluginLifecycleError {
    fn new(code: PluginLifecycleErrorCode, operation: PluginLifecycleOperation) -> Self {
        Self {
            contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION.to_owned(),
            code,
            operation,
            message: code.message().to_owned(),
        }
    }

    fn invalid(operation: PluginLifecycleOperation) -> Self {
        Self::new(PluginLifecycleErrorCode::InvalidRequest, operation)
    }

    fn is_canonical(&self) -> bool {
        self.contract_version == PLUGIN_LIFECYCLE_CONTRACT_VERSION
            && self.message == self.code.message()
    }
}

#[derive(Debug)]
pub struct PluginLifecycleState {
    installer: Arc<PluginInstaller>,
}

impl PluginLifecycleState {
    fn new(installer: Arc<PluginInstaller>) -> Arc<Self> {
        Arc::new(Self { installer })
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

fn parse_set_enabled_request(
    value: Value,
) -> Result<SetPluginEnabledRequest, PluginLifecycleError> {
    let request = serde_json::from_value::<SetPluginEnabledRequest>(value)
        .map_err(|_| PluginLifecycleError::invalid(PluginLifecycleOperation::SetEnabled))?;
    if request.contract_version != PLUGIN_LIFECYCLE_CONTRACT_VERSION
        || !is_valid_plugin_registration_entry_id(&request.entry_id)
        || !is_revision(&request.expected_revision)
    {
        return Err(PluginLifecycleError::invalid(
            PluginLifecycleOperation::SetEnabled,
        ));
    }
    Ok(request)
}

fn parse_uninstall_request(value: Value) -> Result<UninstallPluginRequest, PluginLifecycleError> {
    let request = serde_json::from_value::<UninstallPluginRequest>(value)
        .map_err(|_| PluginLifecycleError::invalid(PluginLifecycleOperation::Uninstall))?;
    if request.contract_version != PLUGIN_LIFECYCLE_CONTRACT_VERSION
        || !is_valid_plugin_registration_entry_id(&request.entry_id)
        || !is_revision(&request.expected_revision)
    {
        return Err(PluginLifecycleError::invalid(
            PluginLifecycleOperation::Uninstall,
        ));
    }
    Ok(request)
}

fn map_storage_error(
    error: PluginLifecycleStorageError,
    operation: PluginLifecycleOperation,
) -> PluginLifecycleError {
    let code = match error {
        PluginLifecycleStorageError::Busy => PluginLifecycleErrorCode::Busy,
        PluginLifecycleStorageError::Conflict => PluginLifecycleErrorCode::Conflict,
        PluginLifecycleStorageError::InvalidState => PluginLifecycleErrorCode::InvalidState,
        PluginLifecycleStorageError::NotFound => PluginLifecycleErrorCode::NotFound,
        PluginLifecycleStorageError::OperationNotSupported => {
            PluginLifecycleErrorCode::OperationNotSupported
        }
        PluginLifecycleStorageError::PersistFailed => PluginLifecycleErrorCode::PersistFailed,
        PluginLifecycleStorageError::Unavailable => PluginLifecycleErrorCode::Unavailable,
        PluginLifecycleStorageError::UnsafeCleanup => PluginLifecycleErrorCode::UnsafeCleanup,
    };
    PluginLifecycleError::new(code, operation)
}

pub fn set_plugin_enabled_with_emitter(
    state: &PluginLifecycleState,
    request: Value,
    emitter: &impl PluginRegistrationEventEmitter,
) -> Result<PluginLifecycleResult, PluginLifecycleError> {
    let request = parse_set_enabled_request(request)?;
    let (registration, change) = state
        .installer
        .set_enabled(
            &request.entry_id,
            &request.expected_revision,
            request.enabled,
        )
        .map_err(|error| map_storage_error(error, PluginLifecycleOperation::SetEnabled))?;
    let outcome = if change.is_some() {
        PluginLifecycleOutcome::Changed
    } else {
        PluginLifecycleOutcome::Unchanged
    };
    let revision = change
        .as_ref()
        .map(|event| event.revision.clone())
        .unwrap_or(request.expected_revision);
    if let Some(change) = &change {
        let _ = emit_plugin_registration_changed(emitter, change);
    }
    Ok(PluginLifecycleResult::SetEnabled {
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION.to_owned(),
        outcome,
        entry_id: request.entry_id,
        plugin_id: registration.manifest.plugin_id,
        revision,
        enabled: registration.facts.enabled,
        effective_available: registration.facts.enabled
            && registration.compatibility.lensx
            && registration.compatibility.host_api,
        cleanup: PluginLifecycleCleanupConclusion::NotApplicable,
    })
}

fn uninstall_result(
    request: UninstallPluginRequest,
    commit: PluginUninstallCommit,
) -> PluginLifecycleResult {
    PluginLifecycleResult::Uninstall {
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION.to_owned(),
        outcome: if commit.changed {
            PluginLifecycleOutcome::Changed
        } else {
            PluginLifecycleOutcome::Unchanged
        },
        entry_id: request.entry_id,
        plugin_id: commit.plugin_id,
        revision: commit.revision,
        effective_available: false,
        cleanup: if commit.cleanup_pending {
            PluginLifecycleCleanupConclusion::Pending
        } else {
            PluginLifecycleCleanupConclusion::Complete
        },
        data_policy: request.data_policy,
    }
}

pub fn uninstall_plugin_with_emitter(
    state: &PluginLifecycleState,
    request: Value,
    emitter: &impl PluginRegistrationEventEmitter,
) -> Result<PluginLifecycleResult, PluginLifecycleError> {
    let request = parse_uninstall_request(request)?;
    let commit = state
        .installer
        .uninstall(
            &request.entry_id,
            &request.expected_revision,
            request.data_policy.into(),
        )
        .map_err(|error| map_storage_error(error, PluginLifecycleOperation::Uninstall))?;
    if let Some(change) = &commit.change {
        let _ = emit_plugin_registration_changed(emitter, change);
    }
    Ok(uninstall_result(request, commit))
}

#[tauri::command]
pub fn set_plugin_enabled<R: Runtime>(
    app: AppHandle<R>,
    lifecycle: State<'_, Arc<PluginLifecycleState>>,
    request: Value,
) -> Result<PluginLifecycleResult, PluginLifecycleError> {
    set_plugin_enabled_with_emitter(&lifecycle, request, &app)
}

#[tauri::command]
pub fn uninstall_plugin<R: Runtime>(
    app: AppHandle<R>,
    lifecycle: State<'_, Arc<PluginLifecycleState>>,
    request: Value,
) -> Result<PluginLifecycleResult, PluginLifecycleError> {
    uninstall_plugin_with_emitter(&lifecycle, request, &app)
}

pub fn deserialize_plugin_lifecycle_result(value: Value) -> Result<PluginLifecycleResult, ()> {
    let result = serde_json::from_value::<PluginLifecycleResult>(value).map_err(|_| ())?;
    let valid = match &result {
        PluginLifecycleResult::SetEnabled {
            contract_version,
            entry_id,
            plugin_id,
            revision,
            cleanup,
            ..
        } => {
            contract_version == PLUGIN_LIFECYCLE_CONTRACT_VERSION
                && is_valid_plugin_registration_entry_id(entry_id)
                && !plugin_id.is_empty()
                && is_revision(revision)
                && *cleanup == PluginLifecycleCleanupConclusion::NotApplicable
        }
        PluginLifecycleResult::Uninstall {
            contract_version,
            entry_id,
            plugin_id,
            revision,
            effective_available,
            cleanup,
            ..
        } => {
            contract_version == PLUGIN_LIFECYCLE_CONTRACT_VERSION
                && is_valid_plugin_registration_entry_id(entry_id)
                && plugin_id
                    .as_ref()
                    .is_none_or(|plugin_id| !plugin_id.is_empty())
                && is_revision(revision)
                && !effective_available
                && *cleanup != PluginLifecycleCleanupConclusion::NotApplicable
        }
    };
    valid.then_some(result).ok_or(())
}

pub fn deserialize_plugin_lifecycle_error(value: Value) -> Result<PluginLifecycleError, ()> {
    let error = serde_json::from_value::<PluginLifecycleError>(value).map_err(|_| ())?;
    error.is_canonical().then_some(error).ok_or(())
}

pub fn setup_plugin_lifecycle<R: Runtime>(
    app: &AppHandle<R>,
    installer: Arc<PluginInstaller>,
) -> Arc<PluginLifecycleState> {
    let lifecycle = PluginLifecycleState::new(installer);
    let managed = app.manage(Arc::clone(&lifecycle));
    debug_assert!(
        managed,
        "Plugin Lifecycle state should only be managed once"
    );
    lifecycle
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_identity::plugin_record_key,
        plugin_manager::{PackageDigest, PluginManager, PluginRegistrationFacts, PluginSource},
        plugin_manifest::{validate_plugin_manifest, PluginHostVersions},
        plugin_registration::{PluginRegistrationChangedEvent, PluginRegistrationSummary},
    };
    use serde_json::json;
    use std::{
        fs,
        path::PathBuf,
        sync::Mutex,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be valid")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "lensx-plugin-lifecycle-{name}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test directory should exist");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[derive(Default)]
    struct FakeEmitter {
        events: Mutex<Vec<PluginRegistrationChangedEvent>>,
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
            self.events.lock().unwrap().push(payload.clone());
            Ok(())
        }
    }

    fn versions() -> PluginHostVersions {
        PluginHostVersions {
            lensx: "0.1.0".to_owned(),
            host_api: "0.2.0".to_owned(),
        }
    }

    fn manifest(
        plugin_id: &str,
        compatible: bool,
    ) -> crate::plugin_manifest::NormalizedPluginManifest {
        let mut value: Value = serde_json::from_str(include_str!(
            "../../packages/plugin-contract/tests/fixtures/base.json"
        ))
        .expect("base Manifest should parse");
        value["plugin_id"] = json!(plugin_id);
        if !compatible {
            value["compatibility"]["lensx"]["min_version"] = json!("0.0.0");
            value["compatibility"]["lensx"]["max_version_exclusive"] = json!("0.1.0");
            value["compatibility"]["host_api"]["min_version"] = json!("0.0.0");
            value["compatibility"]["host_api"]["max_version_exclusive"] = json!("0.1.0");
        }
        validate_plugin_manifest(&value, &versions())
            .manifest
            .expect("Manifest should normalize")
    }

    fn setup(
        name: &str,
        enabled: bool,
        source: PluginSource,
        compatible: bool,
    ) -> (
        TestDirectory,
        Arc<PluginManager>,
        Arc<PluginLifecycleState>,
        String,
    ) {
        let directory = TestDirectory::new(name);
        let plugin_id = "com.acme.lifecycle";
        let key = plugin_record_key(plugin_id);
        let digest = "a".repeat(64);
        let payload = directory
            .0
            .join("local-data/plugins/packages")
            .join(&key)
            .join(&digest);
        fs::create_dir_all(&payload).expect("payload should exist");
        fs::write(payload.join("manifest.json"), b"managed").expect("payload marker should exist");
        let manager = PluginManager::recover(directory.0.join("config"), versions());
        manager
            .register(
                manifest(plugin_id, compatible),
                PluginRegistrationFacts::new(
                    payload.to_string_lossy(),
                    PackageDigest {
                        algorithm: "sha256".to_owned(),
                        value: digest,
                    },
                    source,
                    enabled,
                )
                .expect("facts should be valid"),
            )
            .expect("registration should persist");
        let entry_id = manager
            .read_registration_snapshot()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                PluginRegistrationSummary::Registered { entry_id, .. } => Some(entry_id),
                _ => None,
            })
            .expect("entry should exist");
        let installer = PluginInstaller::initialize(
            Ok(directory.0.join("local-data/plugins")),
            Arc::clone(&manager),
        );
        (
            directory,
            manager,
            PluginLifecycleState::new(installer),
            entry_id,
        )
    }

    fn set_request(entry_id: &str, revision: &str, enabled: bool) -> Value {
        json!({
            "contract_version": PLUGIN_LIFECYCLE_CONTRACT_VERSION,
            "entry_id": entry_id,
            "expected_revision": revision,
            "enabled": enabled
        })
    }

    fn uninstall_request(entry_id: &str, revision: &str, policy: &str) -> Value {
        json!({
            "contract_version": PLUGIN_LIFECYCLE_CONTRACT_VERSION,
            "entry_id": entry_id,
            "expected_revision": revision,
            "data_policy": policy
        })
    }

    #[test]
    fn set_enabled_is_revision_bound_source_independent_and_event_tolerant() {
        for source in [PluginSource::Builtin, PluginSource::External] {
            let (_directory, manager, state, entry_id) = setup("set-enabled", false, source, true);
            let emitter = FakeEmitter::default();
            let unchanged = set_plugin_enabled_with_emitter(
                &state,
                set_request(&entry_id, "1", false),
                &emitter,
            )
            .expect("no-op should succeed");
            assert!(matches!(
                unchanged,
                PluginLifecycleResult::SetEnabled {
                    outcome: PluginLifecycleOutcome::Unchanged,
                    revision,
                    effective_available: false,
                    ..
                } if revision == "1"
            ));
            let changed = set_plugin_enabled_with_emitter(
                &state,
                set_request(&entry_id, "1", true),
                &FakeEmitter {
                    fail: true,
                    ..FakeEmitter::default()
                },
            )
            .expect("event failure must not roll back");
            assert!(matches!(
                changed,
                PluginLifecycleResult::SetEnabled {
                    outcome: PluginLifecycleOutcome::Changed,
                    revision,
                    effective_available: true,
                    ..
                } if revision == "2"
            ));
            assert!(
                manager
                    .registration("com.acme.lifecycle")
                    .expect("registration should remain")
                    .facts
                    .enabled
            );
        }
    }

    #[test]
    fn incompatible_enabled_intent_stays_unavailable_and_stale_requests_conflict() {
        let (_directory, manager, state, entry_id) =
            setup("incompatible", false, PluginSource::External, false);
        let result = set_plugin_enabled_with_emitter(
            &state,
            set_request(&entry_id, "1", true),
            &FakeEmitter::default(),
        )
        .expect("incompatible intent should still persist");
        assert!(matches!(
            result,
            PluginLifecycleResult::SetEnabled {
                enabled: true,
                effective_available: false,
                revision,
                ..
            } if revision == "2"
        ));
        let error = set_plugin_enabled_with_emitter(
            &state,
            set_request(&entry_id, "1", false),
            &FakeEmitter::default(),
        )
        .expect_err("stale request should conflict");
        assert_eq!(error.code, PluginLifecycleErrorCode::Conflict);
        assert!(
            manager
                .registration("com.acme.lifecycle")
                .expect("registration should remain")
                .facts
                .enabled
        );
    }

    #[test]
    fn uninstall_returns_logical_success_with_pending_cleanup_and_can_resume() {
        let (_directory, manager, state, entry_id) =
            setup("cleanup-pending", true, PluginSource::External, true);
        state.installer.set_cleanup_fault(true);
        let result = uninstall_plugin_with_emitter(
            &state,
            uninstall_request(&entry_id, "1", "retain_data"),
            &FakeEmitter::default(),
        )
        .expect("logical uninstall should succeed despite cleanup failure");
        assert!(matches!(
            result,
            PluginLifecycleResult::Uninstall {
                outcome: PluginLifecycleOutcome::Changed,
                revision,
                cleanup: PluginLifecycleCleanupConclusion::Pending,
                ..
            } if revision == "2"
        ));
        assert!(manager.registration("com.acme.lifecycle").is_none());
        state.installer.set_cleanup_fault(false);
        let resumed = uninstall_plugin_with_emitter(
            &state,
            uninstall_request(&entry_id, "2", "retain_data"),
            &FakeEmitter::default(),
        )
        .expect("matching retry should resume cleanup");
        assert!(matches!(
            resumed,
            PluginLifecycleResult::Uninstall {
                outcome: PluginLifecycleOutcome::Unchanged,
                cleanup: PluginLifecycleCleanupConclusion::Complete,
                ..
            }
        ));
        assert_eq!(manager.registration_revision(), "2");
    }

    #[test]
    fn unmanaged_payload_uninstall_is_not_supported_and_requests_are_strict() {
        let directory = TestDirectory::new("unmanaged");
        let manager = PluginManager::recover(directory.0.join("config"), versions());
        let installer = PluginInstaller::initialize(
            Ok(directory.0.join("local-data/plugins")),
            Arc::clone(&manager),
        );
        let outside = directory.0.join("outside");
        fs::create_dir_all(&outside).expect("outside payload should exist");
        manager
            .register(
                manifest("com.acme.unmanaged", true),
                PluginRegistrationFacts::new(
                    outside.to_string_lossy(),
                    PackageDigest {
                        algorithm: "sha256".to_owned(),
                        value: "b".repeat(64),
                    },
                    PluginSource::Builtin,
                    true,
                )
                .expect("facts should be valid"),
            )
            .expect("registration should persist");
        let entry_id = manager
            .read_registration_snapshot()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                PluginRegistrationSummary::Registered { entry_id, .. } => Some(entry_id),
                _ => None,
            })
            .unwrap();
        let state = PluginLifecycleState::new(installer);
        let error = uninstall_plugin_with_emitter(
            &state,
            uninstall_request(&entry_id, "1", "retain_data"),
            &FakeEmitter::default(),
        )
        .expect_err("unmanaged payload should not be removed");
        assert_eq!(error.code, PluginLifecycleErrorCode::OperationNotSupported);
        assert!(outside.exists());
        assert!(manager.registration("com.acme.unmanaged").is_some());

        let invalid = set_plugin_enabled_with_emitter(
            &state,
            json!({
                "contract_version": PLUGIN_LIFECYCLE_CONTRACT_VERSION,
                "entry_id": entry_id,
                "expected_revision": "1",
                "enabled": false,
                "path": "/private/secret"
            }),
            &FakeEmitter::default(),
        )
        .expect_err("unknown private field should be rejected");
        assert_eq!(invalid.code, PluginLifecycleErrorCode::InvalidRequest);
    }

    #[test]
    fn quarantine_enable_is_rejected_and_lifecycle_state_is_managed_once() {
        let directory = TestDirectory::new("quarantine-enable");
        let plugin_id = "com.acme.quarantine";
        let key = plugin_record_key(plugin_id);
        let store = directory.0.join("config/plugin-manager");
        fs::create_dir_all(&store).expect("manager store should exist");
        fs::write(store.join(format!("{key}.json")), b"{").expect("damaged record should exist");
        let manager = PluginManager::recover(directory.0.join("config"), versions());
        let stub = manager.quarantine(&key).expect("quarantine should exist");
        let entry_id = crate::plugin_registration::quarantine_entry_id(&stub);
        let installer = PluginInstaller::initialize(
            Ok(directory.0.join("local-data/plugins")),
            Arc::clone(&manager),
        );
        let state = PluginLifecycleState::new(Arc::clone(&installer));
        let error = set_plugin_enabled_with_emitter(
            &state,
            set_request(&entry_id, "0", true),
            &FakeEmitter::default(),
        )
        .expect_err("quarantine cannot be enabled");
        assert_eq!(error.code, PluginLifecycleErrorCode::InvalidState);
        assert!(manager.quarantine(&key).is_some());

        let app = tauri::test::mock_app();
        let managed = setup_plugin_lifecycle(app.handle(), installer);
        let app_state = app.state::<Arc<PluginLifecycleState>>();
        assert!(Arc::ptr_eq(&managed, &app_state));
    }

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        #[serde(rename = "type")]
        payload_type: String,
        value: Value,
    }

    #[test]
    fn shared_contract_fixtures_are_strict_and_private() {
        let valid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-lifecycle-controls/valid/cases.json"
        ))
        .expect("valid fixtures should parse");
        for fixture in valid {
            let accepted = match fixture.payload_type.as_str() {
                "result" => deserialize_plugin_lifecycle_result(fixture.value).is_ok(),
                "error" => deserialize_plugin_lifecycle_error(fixture.value).is_ok(),
                _ => false,
            };
            assert!(accepted, "valid fixture should parse: {}", fixture.name);
        }
        let invalid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-lifecycle-controls/invalid/cases.json"
        ))
        .expect("invalid fixtures should parse");
        for fixture in invalid {
            let rejected = match fixture.payload_type.as_str() {
                "result" => deserialize_plugin_lifecycle_result(fixture.value).is_err(),
                "error" => deserialize_plugin_lifecycle_error(fixture.value).is_err(),
                _ => true,
            };
            assert!(rejected, "invalid fixture should fail: {}", fixture.name);
        }

        let serialized = serde_json::to_string(&PluginLifecycleResult::Uninstall {
            contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION.to_owned(),
            outcome: PluginLifecycleOutcome::Changed,
            entry_id: "entry_0123456789abcdef".to_owned(),
            plugin_id: Some("com.acme.plugin".to_owned()),
            revision: "7".to_owned(),
            effective_available: false,
            cleanup: PluginLifecycleCleanupConclusion::Complete,
            data_policy: PluginLifecycleDataPolicy::RetainData,
        })
        .unwrap();
        for forbidden in ["path", "digest", "store", "stack", "manifest", "grant"] {
            assert!(!serialized.to_ascii_lowercase().contains(forbidden));
        }
    }
}
