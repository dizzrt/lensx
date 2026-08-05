use crate::{
    launcher_window::MAIN_WINDOW_LABEL,
    plugin_manager::{
        PluginManager, PluginManagerDiagnosticCode, PluginManagerGrantMutation,
        PluginManagerPermissionCheckError,
    },
    plugin_registration::emit_plugin_registration_changed,
    plugin_text_clipboard::{
        bounded_text, PluginTextClipboard, PluginTextClipboardError, SystemPluginTextClipboard,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime, State, WebviewWindow};

#[cfg(test)]
use crate::plugin_text_clipboard::MAX_CLIPBOARD_TEXT_CHARS;

pub const PLUGIN_PERMISSION_CONTRACT_VERSION: &str = "0.1.0";
pub const SET_PLUGIN_PERMISSION_GRANT_COMMAND: &str = "set_plugin_permission_grant";
pub const PLUGIN_CLIPBOARD_COMMAND: &str = "plugin_clipboard";
const CLIPBOARD_READ_PERMISSION: &str = "clipboard.read";
const CLIPBOARD_WRITE_PERMISSION: &str = "clipboard.write";

fn supported_permission(permission_id: &str) -> bool {
    matches!(
        permission_id,
        CLIPBOARD_READ_PERMISSION | CLIPBOARD_WRITE_PERMISSION
    )
}

fn valid_entry_id(value: &str) -> bool {
    value.len() == 22
        && value.starts_with("entry_")
        && value[6..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_identity_text(value: &str, maximum: usize) -> bool {
    !value.is_empty()
        && value.len() <= maximum
        && !value.chars().any(|character| character.is_control())
}

fn valid_revision(value: &str) -> bool {
    value == "0"
        || (value
            .bytes()
            .next()
            .is_some_and(|first| first.is_ascii_digit() && first != b'0')
            && value.bytes().all(|byte| byte.is_ascii_digit()))
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginPermissionGrantStatus {
    Changed,
    Unchanged,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct SetPluginPermissionGrantRequest {
    contract_version: String,
    entry_id: String,
    expected_revision: String,
    permission_id: String,
    granted: bool,
}

impl SetPluginPermissionGrantRequest {
    fn validate(&self) -> bool {
        self.contract_version == PLUGIN_PERMISSION_CONTRACT_VERSION
            && valid_entry_id(&self.entry_id)
            && valid_revision(&self.expected_revision)
            && supported_permission(&self.permission_id)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SetPluginPermissionGrantResult {
    pub contract_version: String,
    pub status: PluginPermissionGrantStatus,
    pub revision: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginPermissionGrantErrorCode {
    InvalidRequest,
    Conflict,
    NotFound,
    Unsupported,
    PersistFailed,
    Unavailable,
    Internal,
}

impl PluginPermissionGrantErrorCode {
    fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "Plugin permission request is invalid.",
            Self::Conflict => "Plugin permission state changed.",
            Self::NotFound => "Plugin permission target was not found.",
            Self::Unsupported => "Plugin permission is unsupported.",
            Self::PersistFailed => "Plugin permission could not be saved.",
            Self::Unavailable => "Plugin permission service is unavailable.",
            Self::Internal => "Plugin permission request failed.",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginPermissionGrantError {
    pub contract_version: String,
    pub code: PluginPermissionGrantErrorCode,
    pub operation: String,
    pub message: String,
}

impl PluginPermissionGrantError {
    fn new(code: PluginPermissionGrantErrorCode) -> Self {
        Self {
            contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
            code,
            operation: "set_grant".to_owned(),
            message: code.message().to_owned(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PluginClipboardIdentity {
    entry_id: String,
    plugin_id: String,
    version: String,
    registration_revision: String,
}

impl PluginClipboardIdentity {
    fn validate(&self) -> bool {
        valid_entry_id(&self.entry_id)
            && valid_identity_text(&self.plugin_id, 255)
            && valid_identity_text(&self.version, 128)
            && valid_revision(&self.registration_revision)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum PluginClipboardOperation {
    Read,
    Write { text: String },
}

impl PluginClipboardOperation {
    fn name(&self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write { .. } => "write",
        }
    }

    fn permission(&self) -> &'static str {
        match self {
            Self::Read => CLIPBOARD_READ_PERMISSION,
            Self::Write { .. } => CLIPBOARD_WRITE_PERMISSION,
        }
    }

    fn validate(&self) -> bool {
        match self {
            Self::Read => true,
            Self::Write { text } => bounded_text(text),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PluginClipboardRequest {
    contract_version: String,
    identity: PluginClipboardIdentity,
    operation: PluginClipboardOperation,
}

fn parse_plugin_clipboard_request(value: Value) -> Result<PluginClipboardRequest, ()> {
    let record = value.as_object().ok_or(())?;
    if record.len() != 3
        || !record.contains_key("contract_version")
        || !record.contains_key("identity")
        || !record.contains_key("operation")
    {
        return Err(());
    }
    let identity = record
        .get("identity")
        .and_then(Value::as_object)
        .ok_or(())?;
    if identity.len() != 4
        || !["entry_id", "plugin_id", "version", "registration_revision"]
            .iter()
            .all(|key| identity.contains_key(*key))
    {
        return Err(());
    }
    let operation = record
        .get("operation")
        .and_then(Value::as_object)
        .ok_or(())?;
    match operation.get("kind").and_then(Value::as_str) {
        Some("read") if operation.len() == 1 => {}
        Some("write") if operation.len() == 2 && operation.contains_key("text") => {}
        _ => return Err(()),
    }
    serde_json::from_value::<PluginClipboardRequest>(value).map_err(|_| ())
}

impl PluginClipboardRequest {
    fn validate(&self) -> bool {
        self.contract_version == PLUGIN_PERMISSION_CONTRACT_VERSION
            && self.identity.validate()
            && self.operation.validate()
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginClipboardResult {
    Read {
        contract_version: String,
        text: String,
    },
    Write {
        contract_version: String,
        written: bool,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginClipboardErrorCode {
    InvalidRequest,
    PermissionDenied,
    Unavailable,
    LimitExceeded,
    Cancelled,
    InternalError,
}

impl PluginClipboardErrorCode {
    fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "Plugin clipboard request is invalid.",
            Self::PermissionDenied => "Plugin clipboard permission was denied.",
            Self::Unavailable => "Plugin clipboard is unavailable.",
            Self::LimitExceeded => "Plugin clipboard text limit was exceeded.",
            Self::Cancelled => "Plugin clipboard request was cancelled.",
            Self::InternalError => "Plugin clipboard request failed.",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginClipboardError {
    pub contract_version: String,
    pub code: PluginClipboardErrorCode,
    pub operation: String,
    pub message: String,
}

impl PluginClipboardError {
    fn new(code: PluginClipboardErrorCode, operation: &str) -> Self {
        Self {
            contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
            code,
            operation: operation.to_owned(),
            message: code.message().to_owned(),
        }
    }
}

pub struct PluginPermissionState {
    manager: Arc<PluginManager>,
    clipboard: Arc<dyn PluginTextClipboard>,
    coordinator: Mutex<()>,
}

impl PluginPermissionState {
    fn new(manager: Arc<PluginManager>, clipboard: Arc<dyn PluginTextClipboard>) -> Arc<Self> {
        Arc::new(Self {
            manager,
            clipboard,
            coordinator: Mutex::new(()),
        })
    }

    fn set_grant(
        &self,
        request: SetPluginPermissionGrantRequest,
    ) -> Result<PluginManagerGrantMutation, PluginPermissionGrantError> {
        let _linearization = self
            .coordinator
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.manager
            .set_permission_grant(
                &request.entry_id,
                &request.expected_revision,
                &request.permission_id,
                request.granted,
                supported_permission(&request.permission_id),
            )
            .map_err(|diagnostic| {
                PluginPermissionGrantError::new(match diagnostic.code() {
                    PluginManagerDiagnosticCode::StaleRevision => {
                        PluginPermissionGrantErrorCode::Conflict
                    }
                    PluginManagerDiagnosticCode::NotFound => {
                        PluginPermissionGrantErrorCode::NotFound
                    }
                    PluginManagerDiagnosticCode::PersistFailed => {
                        PluginPermissionGrantErrorCode::PersistFailed
                    }
                    PluginManagerDiagnosticCode::StoreUnavailable => {
                        PluginPermissionGrantErrorCode::Unavailable
                    }
                    PluginManagerDiagnosticCode::InvalidState => {
                        PluginPermissionGrantErrorCode::Unsupported
                    }
                    _ => PluginPermissionGrantErrorCode::Internal,
                })
            })
    }

    fn execute_clipboard(
        &self,
        request: &PluginClipboardRequest,
    ) -> Result<PluginClipboardResult, PluginClipboardError> {
        let operation = request.operation.name();
        let _linearization = self
            .coordinator
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !self.clipboard.available() {
            return Err(PluginClipboardError::new(
                PluginClipboardErrorCode::Unavailable,
                operation,
            ));
        }
        self.manager
            .authorize_permission_call(
                &request.identity.entry_id,
                &request.identity.plugin_id,
                &request.identity.version,
                &request.identity.registration_revision,
                request.operation.permission(),
            )
            .map_err(|error| {
                PluginClipboardError::new(
                    match error {
                        PluginManagerPermissionCheckError::PermissionDenied => {
                            PluginClipboardErrorCode::PermissionDenied
                        }
                        PluginManagerPermissionCheckError::InvalidIdentity
                        | PluginManagerPermissionCheckError::StaleSession
                        | PluginManagerPermissionCheckError::Unavailable => {
                            PluginClipboardErrorCode::Unavailable
                        }
                    },
                    operation,
                )
            })?;
        match &request.operation {
            PluginClipboardOperation::Read => {
                let text = self.clipboard.read_text().map_err(|error| {
                    PluginClipboardError::new(map_clipboard_error(error), operation)
                })?;
                if !bounded_text(&text) {
                    return Err(PluginClipboardError::new(
                        PluginClipboardErrorCode::LimitExceeded,
                        operation,
                    ));
                }
                Ok(PluginClipboardResult::Read {
                    contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
                    text,
                })
            }
            PluginClipboardOperation::Write { text } => {
                self.clipboard.write_text(text).map_err(|error| {
                    PluginClipboardError::new(map_clipboard_error(error), operation)
                })?;
                Ok(PluginClipboardResult::Write {
                    contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
                    written: true,
                })
            }
        }
    }
}

fn map_clipboard_error(error: PluginTextClipboardError) -> PluginClipboardErrorCode {
    match error {
        PluginTextClipboardError::Unavailable => PluginClipboardErrorCode::Unavailable,
        PluginTextClipboardError::LimitExceeded => PluginClipboardErrorCode::LimitExceeded,
        PluginTextClipboardError::Internal => PluginClipboardErrorCode::InternalError,
    }
}

#[tauri::command]
pub fn set_plugin_permission_grant<R: Runtime>(
    app: AppHandle<R>,
    webview: WebviewWindow<R>,
    state: State<'_, Arc<PluginPermissionState>>,
    request: Value,
) -> Result<SetPluginPermissionGrantResult, PluginPermissionGrantError> {
    if webview.label() != MAIN_WINDOW_LABEL {
        return Err(PluginPermissionGrantError::new(
            PluginPermissionGrantErrorCode::Unavailable,
        ));
    }
    let request =
        serde_json::from_value::<SetPluginPermissionGrantRequest>(request).map_err(|_| {
            PluginPermissionGrantError::new(PluginPermissionGrantErrorCode::InvalidRequest)
        })?;
    if !request.validate() {
        return Err(PluginPermissionGrantError::new(
            PluginPermissionGrantErrorCode::InvalidRequest,
        ));
    }
    let mutation = state.set_grant(request)?;
    if let Some(change) = mutation.change.as_ref() {
        let _ = emit_plugin_registration_changed(&app, change);
    }
    Ok(SetPluginPermissionGrantResult {
        contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
        status: if mutation.change.is_some() {
            PluginPermissionGrantStatus::Changed
        } else {
            PluginPermissionGrantStatus::Unchanged
        },
        revision: state.manager.registration_revision(),
    })
}

#[tauri::command]
pub fn plugin_clipboard<R: Runtime>(
    webview: WebviewWindow<R>,
    state: State<'_, Arc<PluginPermissionState>>,
    request: Value,
) -> Result<PluginClipboardResult, PluginClipboardError> {
    if webview.label() != MAIN_WINDOW_LABEL {
        return Err(PluginClipboardError::new(
            PluginClipboardErrorCode::Unavailable,
            "read",
        ));
    }
    let request = parse_plugin_clipboard_request(request)
        .map_err(|_| PluginClipboardError::new(PluginClipboardErrorCode::InvalidRequest, "read"))?;
    if !request.validate() {
        return Err(PluginClipboardError::new(
            PluginClipboardErrorCode::InvalidRequest,
            request.operation.name(),
        ));
    }
    state.execute_clipboard(&request)
}

pub fn setup_plugin_permission<R: Runtime>(
    app: &AppHandle<R>,
    manager: Arc<PluginManager>,
) -> Arc<PluginPermissionState> {
    let state = PluginPermissionState::new(manager, Arc::new(SystemPluginTextClipboard));
    let managed = app.manage(Arc::clone(&state));
    debug_assert!(
        managed,
        "Plugin Permission state should only be managed once"
    );
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_manager::{
            current_plugin_host_versions, PackageDigest, PluginRegistrationFacts, PluginSource,
            WriteFault,
        },
        plugin_manifest::validate_plugin_manifest,
        plugin_registration::{PluginRegistrationChangedEvent, PluginRegistrationEventEmitter},
    };
    use serde_json::json;
    use std::{
        fs,
        path::PathBuf,
        sync::{
            atomic::{AtomicU64, Ordering},
            mpsc, Condvar,
        },
        time::Duration,
    };

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const CONTRACT_FIXTURES: &str =
        include_str!("../../tests/fixtures/plugin-permission-management/cases.json");

    #[derive(Deserialize)]
    #[serde(rename_all = "snake_case")]
    enum ContractFixtureKind {
        GrantRequest,
        GrantResult,
        GrantError,
        ClipboardRequest,
        ClipboardResult,
        ClipboardError,
    }

    #[derive(Deserialize)]
    struct ContractFixture {
        name: String,
        kind: ContractFixtureKind,
        valid: bool,
        value: Value,
    }

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            Self(std::env::temp_dir().join(format!(
                "lensx-plugin-permission-{name}-{}-{}",
                std::process::id(),
                TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            )))
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[derive(Default)]
    struct FakeClipboard {
        text: Mutex<String>,
        available: bool,
    }

    impl PluginTextClipboard for FakeClipboard {
        fn available(&self) -> bool {
            self.available
        }

        fn read_text(&self) -> Result<String, PluginTextClipboardError> {
            Ok(self.text.lock().unwrap().clone())
        }

        fn write_text(&self, text: &str) -> Result<(), PluginTextClipboardError> {
            *self.text.lock().unwrap() = text.to_owned();
            Ok(())
        }
    }

    fn setup(
        name: &str,
    ) -> (
        TestDirectory,
        Arc<PluginManager>,
        Arc<PluginPermissionState>,
        String,
    ) {
        let directory = TestDirectory::new(name);
        let manager = PluginManager::recover(&directory.0, current_plugin_host_versions("0.1.0"));
        let mut value: Value = serde_json::from_str(include_str!(
            "../../packages/plugin-contract/tests/fixtures/base.json"
        ))
        .unwrap();
        value["requested_permissions"] = json!([
            {"permission_id":"clipboard.read","reason":{"en-US":"Read text"}},
            {"permission_id":"clipboard.write","reason":{"en-US":"Write text"}}
        ]);
        value["contributes"]["pages"][1]["required_permissions"] = json!([]);
        let manifest = validate_plugin_manifest(&value, &current_plugin_host_versions("0.1.0"))
            .manifest
            .unwrap();
        manager
            .register(
                manifest,
                PluginRegistrationFacts::new(
                    directory.0.join("payload").to_string_lossy(),
                    PackageDigest {
                        algorithm: "sha256".to_owned(),
                        value: "aa".to_owned(),
                    },
                    PluginSource::External,
                    true,
                )
                .unwrap(),
            )
            .unwrap();
        let entry_id = manager
            .read_registration_snapshot()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                crate::plugin_registration::PluginRegistrationSummary::Registered {
                    entry_id,
                    ..
                } => Some(entry_id),
                _ => None,
            })
            .unwrap();
        let state = PluginPermissionState::new(
            Arc::clone(&manager),
            Arc::new(FakeClipboard {
                text: Mutex::new(String::new()),
                available: true,
            }),
        );
        (directory, manager, state, entry_id)
    }

    fn register_requested_plugin(
        manager: &PluginManager,
        directory: &TestDirectory,
        plugin_id: &str,
        source: PluginSource,
    ) -> String {
        let mut value: Value = serde_json::from_str(include_str!(
            "../../packages/plugin-contract/tests/fixtures/base.json"
        ))
        .unwrap();
        value["plugin_id"] = json!(plugin_id);
        value["requested_permissions"] = json!([
            {"permission_id":"clipboard.read","reason":{"en-US":"Read text"}},
            {"permission_id":"clipboard.write","reason":{"en-US":"Write text"}}
        ]);
        value["contributes"]["pages"][1]["required_permissions"] = json!([]);
        let manifest = validate_plugin_manifest(&value, &current_plugin_host_versions("0.1.0"))
            .manifest
            .unwrap();
        manager
            .register(
                manifest,
                PluginRegistrationFacts::new(
                    directory.0.join(plugin_id).to_string_lossy(),
                    PackageDigest {
                        algorithm: "sha256".to_owned(),
                        value: "bb".to_owned(),
                    },
                    source,
                    true,
                )
                .unwrap(),
            )
            .unwrap();
        manager
            .read_registration_snapshot()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                crate::plugin_registration::PluginRegistrationSummary::Registered {
                    entry_id,
                    plugin_id: candidate,
                    ..
                } if candidate == plugin_id => Some(entry_id),
                _ => None,
            })
            .unwrap()
    }

    fn grant_request(
        entry_id: &str,
        revision: &str,
        permission_id: &str,
        granted: bool,
    ) -> SetPluginPermissionGrantRequest {
        SetPluginPermissionGrantRequest {
            contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
            entry_id: entry_id.to_owned(),
            expected_revision: revision.to_owned(),
            permission_id: permission_id.to_owned(),
            granted,
        }
    }

    #[test]
    fn grant_and_revoke_are_revision_bound_and_reauthorize_every_effect() {
        let (_directory, manager, state, entry_id) = setup("grant-revoke");
        let revision = manager.registration_revision();
        let grant = state
            .set_grant(grant_request(
                &entry_id,
                &revision,
                CLIPBOARD_WRITE_PERMISSION,
                true,
            ))
            .unwrap();
        assert!(grant.change.is_some());
        let granted_revision = manager.registration_revision();
        let request = PluginClipboardRequest {
            contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
            identity: PluginClipboardIdentity {
                entry_id: entry_id.clone(),
                plugin_id: "com.acme.workspace".to_owned(),
                version: "1.2.0".to_owned(),
                registration_revision: granted_revision.clone(),
            },
            operation: PluginClipboardOperation::Write {
                text: "controlled".to_owned(),
            },
        };
        assert!(matches!(
            state.execute_clipboard(&request),
            Ok(PluginClipboardResult::Write { .. })
        ));
        let revoke = state
            .set_grant(grant_request(
                &entry_id,
                &granted_revision,
                CLIPBOARD_WRITE_PERMISSION,
                false,
            ))
            .unwrap();
        assert!(revoke.change.is_some());
        assert_eq!(
            state.execute_clipboard(&request).unwrap_err().code,
            PluginClipboardErrorCode::Unavailable
        );
    }

    #[test]
    fn grant_mutation_rejects_stale_undeclared_and_unknown_values_without_writes() {
        let (_directory, manager, state, entry_id) = setup("mutation-errors");
        let revision = manager.registration_revision();
        let stale = state
            .set_grant(grant_request(
                &entry_id,
                "0",
                CLIPBOARD_READ_PERMISSION,
                true,
            ))
            .unwrap_err();
        assert_eq!(stale.code, PluginPermissionGrantErrorCode::Conflict);
        let unknown = serde_json::from_value::<SetPluginPermissionGrantRequest>(json!({
            "contract_version":"0.1.0", "entry_id":entry_id, "expected_revision":revision,
            "permission_id":"files.read", "granted":true, "grant":true
        }));
        assert!(unknown.is_err());
    }

    #[test]
    fn manager_grants_are_idempotent_persistent_source_independent_and_fault_atomic() {
        let (directory, manager, state, entry_id) = setup("manager-semantics");
        let revision = manager.registration_revision();
        state
            .set_grant(grant_request(
                &entry_id,
                &revision,
                CLIPBOARD_READ_PERMISSION,
                true,
            ))
            .unwrap();
        let granted_revision = manager.registration_revision();
        let unchanged = state
            .set_grant(grant_request(
                &entry_id,
                &granted_revision,
                CLIPBOARD_READ_PERMISSION,
                true,
            ))
            .unwrap();
        assert!(unchanged.change.is_none());
        assert_eq!(manager.registration_revision(), granted_revision);
        let recovered = PluginManager::recover(&directory.0, current_plugin_host_versions("0.1.0"));
        assert_eq!(
            recovered
                .registration("com.acme.workspace")
                .unwrap()
                .facts
                .granted_permission_ids,
            vec![CLIPBOARD_READ_PERMISSION]
        );

        manager.set_write_fault(Some(WriteFault::Write));
        let failed = state
            .set_grant(grant_request(
                &entry_id,
                &granted_revision,
                CLIPBOARD_WRITE_PERMISSION,
                true,
            ))
            .unwrap_err();
        assert_eq!(failed.code, PluginPermissionGrantErrorCode::PersistFailed);
        assert_eq!(manager.registration_revision(), granted_revision);
        assert_eq!(
            manager
                .registration("com.acme.workspace")
                .unwrap()
                .facts
                .granted_permission_ids,
            vec![CLIPBOARD_READ_PERMISSION]
        );
        manager.set_write_fault(None);

        let builtin_entry = register_requested_plugin(
            &manager,
            &directory,
            "com.acme.builtin",
            PluginSource::Builtin,
        );
        let builtin_revision = manager.registration_revision();
        let builtin = manager
            .set_permission_grant(
                &builtin_entry,
                &builtin_revision,
                CLIPBOARD_READ_PERMISSION,
                true,
                true,
            )
            .unwrap();
        assert!(builtin.change.is_some());
        assert_eq!(
            manager
                .registration("com.acme.builtin")
                .unwrap()
                .facts
                .granted_permission_ids,
            vec![CLIPBOARD_READ_PERMISSION]
        );
    }

    #[test]
    fn degraded_and_quarantined_manager_states_fail_closed() {
        let degraded_directory = TestDirectory::new("degraded");
        fs::create_dir_all(&degraded_directory.0).unwrap();
        fs::write(
            degraded_directory.0.join("plugin-manager"),
            b"not a directory",
        )
        .unwrap();
        let degraded =
            PluginManager::recover(&degraded_directory.0, current_plugin_host_versions("0.1.0"));
        assert!(degraded.recovery_report().degraded);
        let degraded_state = PluginPermissionState::new(
            degraded,
            Arc::new(FakeClipboard {
                text: Mutex::new(String::new()),
                available: true,
            }),
        );
        assert_eq!(
            degraded_state
                .set_grant(grant_request(
                    "entry_0123456789abcdef",
                    "0",
                    CLIPBOARD_READ_PERMISSION,
                    true,
                ))
                .unwrap_err()
                .code,
            PluginPermissionGrantErrorCode::Unavailable
        );

        let quarantine_directory = TestDirectory::new("quarantine");
        let store = quarantine_directory.0.join("plugin-manager");
        fs::create_dir_all(&store).unwrap();
        fs::write(store.join("bad.json"), b"{invalid").unwrap();
        let quarantined = PluginManager::recover(
            &quarantine_directory.0,
            current_plugin_host_versions("0.1.0"),
        );
        let snapshot = quarantined.read_registration_snapshot();
        let quarantine_entry = snapshot
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                crate::plugin_registration::PluginRegistrationSummary::Quarantined {
                    entry_id,
                    ..
                } => Some(entry_id),
                _ => None,
            })
            .unwrap();
        let state = PluginPermissionState::new(
            quarantined,
            Arc::new(FakeClipboard {
                text: Mutex::new(String::new()),
                available: true,
            }),
        );
        assert_eq!(
            state
                .set_grant(grant_request(
                    &quarantine_entry,
                    &snapshot.revision,
                    CLIPBOARD_READ_PERMISSION,
                    true,
                ))
                .unwrap_err()
                .code,
            PluginPermissionGrantErrorCode::Unsupported
        );
    }

    #[test]
    fn revoke_clears_undeclared_or_unsupported_residual_grants() {
        let (_directory, manager, state, entry_id) = setup("residual-revoke");
        let revision = manager.registration_revision();
        state
            .set_grant(grant_request(
                &entry_id,
                &revision,
                CLIPBOARD_READ_PERMISSION,
                true,
            ))
            .unwrap();
        let mut registration = manager.registration("com.acme.workspace").unwrap();
        registration
            .manifest
            .requested_permissions
            .retain(|request| request.permission_id != CLIPBOARD_READ_PERMISSION);
        let replacement_revision = manager.registration_revision();
        manager
            .replace_entry(
                &entry_id,
                &replacement_revision,
                registration.manifest,
                registration.facts,
            )
            .unwrap();
        let residual_revision = manager.registration_revision();
        let revoked = manager
            .set_permission_grant(
                &entry_id,
                &residual_revision,
                CLIPBOARD_READ_PERMISSION,
                false,
                false,
            )
            .unwrap();
        assert!(revoked.change.is_some());
        assert!(manager
            .registration("com.acme.workspace")
            .unwrap()
            .facts
            .granted_permission_ids
            .is_empty());
    }

    #[test]
    fn unrelated_registration_changes_do_not_revoke_current_permission_authority() {
        let (directory, manager, state, entry_id) = setup("unrelated-change");
        let revision = manager.registration_revision();
        state
            .set_grant(grant_request(
                &entry_id,
                &revision,
                CLIPBOARD_READ_PERMISSION,
                true,
            ))
            .unwrap();
        let session_revision = manager.registration_revision();
        register_requested_plugin(
            &manager,
            &directory,
            "com.acme.other",
            PluginSource::External,
        );
        assert_ne!(manager.registration_revision(), session_revision);
        let request = PluginClipboardRequest {
            contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
            identity: PluginClipboardIdentity {
                entry_id,
                plugin_id: "com.acme.workspace".to_owned(),
                version: "1.2.0".to_owned(),
                registration_revision: session_revision,
            },
            operation: PluginClipboardOperation::Read,
        };
        assert!(matches!(
            state.execute_clipboard(&request),
            Ok(PluginClipboardResult::Read { .. })
        ));
    }

    #[derive(Default)]
    struct FailingEmitter;

    impl PluginRegistrationEventEmitter for FailingEmitter {
        fn emit_registration_changed(
            &self,
            _payload: &PluginRegistrationChangedEvent,
        ) -> Result<(), ()> {
            Err(())
        }
    }

    #[test]
    fn event_delivery_failure_does_not_roll_back_committed_grant() {
        let (_directory, manager, state, entry_id) = setup("event-failure");
        let revision = manager.registration_revision();
        let mutation = state
            .set_grant(grant_request(
                &entry_id,
                &revision,
                CLIPBOARD_READ_PERMISSION,
                true,
            ))
            .unwrap();
        assert!(emit_plugin_registration_changed(
            &FailingEmitter,
            mutation.change.as_ref().unwrap()
        )
        .is_err());
        assert_eq!(
            manager
                .registration("com.acme.workspace")
                .unwrap()
                .facts
                .granted_permission_ids,
            vec![CLIPBOARD_READ_PERMISSION]
        );
    }

    struct BlockingClipboard {
        entered: Mutex<Option<mpsc::Sender<()>>>,
        release: (Mutex<bool>, Condvar),
    }

    impl PluginTextClipboard for BlockingClipboard {
        fn available(&self) -> bool {
            true
        }

        fn read_text(&self) -> Result<String, PluginTextClipboardError> {
            Ok(String::new())
        }

        fn write_text(&self, _text: &str) -> Result<(), PluginTextClipboardError> {
            if let Some(sender) = self.entered.lock().unwrap().take() {
                let _ = sender.send(());
            }
            let (lock, condition) = &self.release;
            let mut released = lock.lock().unwrap();
            while !*released {
                released = condition.wait(released).unwrap();
            }
            Ok(())
        }
    }

    #[test]
    fn clipboard_effect_and_revoke_share_one_linearization_order() {
        let (_directory, manager, _state, entry_id) = setup("linearization");
        let revision = manager.registration_revision();
        manager
            .set_permission_grant(&entry_id, &revision, CLIPBOARD_WRITE_PERMISSION, true, true)
            .unwrap();
        let session_revision = manager.registration_revision();
        let (entered_sender, entered_receiver) = mpsc::channel();
        let clipboard = Arc::new(BlockingClipboard {
            entered: Mutex::new(Some(entered_sender)),
            release: (Mutex::new(false), Condvar::new()),
        });
        let state = PluginPermissionState::new(Arc::clone(&manager), clipboard.clone());
        let effect_state = Arc::clone(&state);
        let effect_entry = entry_id.clone();
        let effect_revision = session_revision.clone();
        let effect = std::thread::spawn(move || {
            effect_state.execute_clipboard(&PluginClipboardRequest {
                contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION.to_owned(),
                identity: PluginClipboardIdentity {
                    entry_id: effect_entry,
                    plugin_id: "com.acme.workspace".to_owned(),
                    version: "1.2.0".to_owned(),
                    registration_revision: effect_revision,
                },
                operation: PluginClipboardOperation::Write {
                    text: "controlled".to_owned(),
                },
            })
        });
        entered_receiver
            .recv_timeout(Duration::from_secs(1))
            .unwrap();
        let revoke_state = Arc::clone(&state);
        let revoke_entry = entry_id.clone();
        let (revoked_sender, revoked_receiver) = mpsc::channel();
        let revoke = std::thread::spawn(move || {
            let result = revoke_state.set_grant(grant_request(
                &revoke_entry,
                &session_revision,
                CLIPBOARD_WRITE_PERMISSION,
                false,
            ));
            let _ = revoked_sender.send(());
            result
        });
        assert!(revoked_receiver
            .recv_timeout(Duration::from_millis(50))
            .is_err());
        *clipboard.release.0.lock().unwrap() = true;
        clipboard.release.1.notify_all();
        assert!(effect.join().unwrap().is_ok());
        assert!(revoke.join().unwrap().is_ok());
        revoked_receiver
            .recv_timeout(Duration::from_secs(1))
            .unwrap();
        assert!(manager
            .registration("com.acme.workspace")
            .unwrap()
            .facts
            .granted_permission_ids
            .is_empty());
    }

    #[test]
    fn contract_values_are_strict_versioned_and_safe() {
        let error = PluginClipboardError::new(PluginClipboardErrorCode::PermissionDenied, "read");
        let serialized = serde_json::to_value(error).unwrap();
        assert_eq!(
            serialized["message"],
            "Plugin clipboard permission was denied."
        );
        for forbidden in [
            "text",
            "path",
            "grant",
            "source",
            "plugin_id",
            "native",
            "stack",
        ] {
            assert!(!serialized.as_object().unwrap().contains_key(forbidden));
        }
        assert!(!bounded_text(&"x".repeat(MAX_CLIPBOARD_TEXT_CHARS + 1)));
    }

    #[test]
    fn rust_matches_shared_permission_contract_fixtures() {
        let fixtures: Vec<ContractFixture> = serde_json::from_str(CONTRACT_FIXTURES).unwrap();
        for fixture in fixtures {
            let accepted = match fixture.kind {
                ContractFixtureKind::GrantRequest => {
                    serde_json::from_value::<SetPluginPermissionGrantRequest>(fixture.value)
                        .is_ok_and(|value| value.validate())
                }
                ContractFixtureKind::GrantResult => {
                    serde_json::from_value::<SetPluginPermissionGrantResult>(fixture.value)
                        .is_ok_and(|value| {
                            value.contract_version == PLUGIN_PERMISSION_CONTRACT_VERSION
                                && valid_revision(&value.revision)
                        })
                }
                ContractFixtureKind::GrantError => serde_json::from_value::<
                    PluginPermissionGrantError,
                >(fixture.value)
                .is_ok_and(|value| {
                    value.contract_version == PLUGIN_PERMISSION_CONTRACT_VERSION
                        && value.operation == "set_grant"
                        && value.message == value.code.message()
                }),
                ContractFixtureKind::ClipboardRequest => {
                    parse_plugin_clipboard_request(fixture.value)
                        .is_ok_and(|value| value.validate())
                }
                ContractFixtureKind::ClipboardResult => serde_json::from_value::<
                    PluginClipboardResult,
                >(fixture.value)
                .is_ok_and(|value| match value {
                    PluginClipboardResult::Read {
                        contract_version,
                        text,
                    } => {
                        contract_version == PLUGIN_PERMISSION_CONTRACT_VERSION
                            && bounded_text(&text)
                    }
                    PluginClipboardResult::Write {
                        contract_version,
                        written,
                    } => contract_version == PLUGIN_PERMISSION_CONTRACT_VERSION && written,
                }),
                ContractFixtureKind::ClipboardError => {
                    serde_json::from_value::<PluginClipboardError>(fixture.value).is_ok_and(
                        |value| {
                            value.contract_version == PLUGIN_PERMISSION_CONTRACT_VERSION
                                && matches!(value.operation.as_str(), "read" | "write")
                                && value.message == value.code.message()
                        },
                    )
                }
            };
            assert_eq!(accepted, fixture.valid, "fixture: {}", fixture.name);
        }
    }

    #[test]
    fn production_boundary_is_main_host_only_and_has_no_clipboard_bypass_plugin() {
        let lib = include_str!("lib.rs");
        let permission = include_str!("plugin_permission.rs");
        let cargo = include_str!("../Cargo.toml");
        let iframe_policy = include_str!("../../src/app/plugins/runtime/policy.ts");
        assert!(lib.contains("plugin_permission::set_plugin_permission_grant"));
        assert!(lib.contains("plugin_permission::plugin_clipboard"));
        assert!(lib.contains("plugin_permission::setup_plugin_permission"));
        assert!(permission.contains("webview.label() != MAIN_WINDOW_LABEL"));
        assert!(permission.contains("State<'_, Arc<PluginPermissionState>>"));
        assert!(cargo.contains("objc2-app-kit"));
        assert!(cargo.contains("objc2-foundation"));
        assert!(!cargo.contains("tauri-plugin-clipboard"));
        assert!(iframe_policy.contains("clipboard-read 'none'"));
        assert!(iframe_policy.contains("clipboard-write 'none'"));
        assert!(!iframe_policy.contains("allow-clipboard"));
    }
}
