use crate::{
    plugin_manager::{
        PluginManager, PluginManagerDiagnostic, PluginManagerRecoveryReport, PluginRegistration,
        PluginRuntimeState, PluginSource, QuarantineStub,
    },
    plugin_manifest::{NormalizedPluginDisplay, NormalizedPluginManifest},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime, State};

pub const PLUGIN_REGISTRATION_CONTRACT_VERSION: &str = "0.2.0";
pub const PLUGIN_REGISTRATION_CHANGED_EVENT: &str = "plugin-registration://snapshot-changed";
const ENTRY_ID_PREFIX: &str = "entry_";
const ENTRY_ID_HEX_LENGTH: usize = 16;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRegistrationDiagnostic {
    pub code: String,
    pub phase: String,
    pub message: String,
}

impl From<&PluginManagerDiagnostic> for PluginRegistrationDiagnostic {
    fn from(value: &PluginManagerDiagnostic) -> Self {
        Self {
            code: serde_json::to_value(value.code())
                .ok()
                .and_then(|value| value.as_str().map(str::to_owned))
                .unwrap_or_else(|| "internal".to_owned()),
            phase: serde_json::to_value(value.phase())
                .ok()
                .and_then(|value| value.as_str().map(str::to_owned))
                .unwrap_or_else(|| "initialize".to_owned()),
            message: value.message().to_owned(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginRegistrationSource {
    Builtin,
    External,
    Development,
}

impl From<PluginSource> for PluginRegistrationSource {
    fn from(value: PluginSource) -> Self {
        match value {
            PluginSource::Builtin => Self::Builtin,
            PluginSource::External => Self::External,
            PluginSource::Development => Self::Development,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PluginRegistrationRuntimeStatus {
    Inactive,
}

impl From<PluginRuntimeState> for PluginRegistrationRuntimeStatus {
    fn from(value: PluginRuntimeState) -> Self {
        match value {
            PluginRuntimeState::Inactive => Self::Inactive,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRegistrationCompatibility {
    pub lensx: bool,
    pub host_api: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginManagerAvailability {
    Available,
    Degraded {
        diagnostic: PluginRegistrationDiagnostic,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginRegistrationSummary {
    Registered {
        entry_id: String,
        plugin_id: String,
        version: String,
        display: NormalizedPluginDisplay,
        source: PluginRegistrationSource,
        enabled: bool,
        compatibility: PluginRegistrationCompatibility,
        runtime: PluginRegistrationRuntimeStatus,
    },
    Quarantined {
        entry_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        plugin_id: Option<String>,
        diagnostic: PluginRegistrationDiagnostic,
    },
}

impl PluginRegistrationSummary {
    fn entry_id(&self) -> &str {
        match self {
            Self::Registered { entry_id, .. } | Self::Quarantined { entry_id, .. } => entry_id,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRegistrationSnapshot {
    pub contract_version: String,
    pub revision: String,
    pub availability: PluginManagerAvailability,
    pub entries: Vec<PluginRegistrationSummary>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginRegistrationDetail {
    Registered {
        entry_id: String,
        manifest: NormalizedPluginManifest,
        source: PluginRegistrationSource,
        enabled: bool,
        compatibility: PluginRegistrationCompatibility,
        granted_permission_ids: Vec<String>,
        runtime: PluginRegistrationRuntimeStatus,
        diagnostics: Vec<PluginRegistrationDiagnostic>,
    },
    Quarantined {
        entry_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        plugin_id: Option<String>,
        diagnostic: PluginRegistrationDiagnostic,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRegistrationDetailResponse {
    pub contract_version: String,
    pub revision: String,
    pub detail: PluginRegistrationDetail,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRegistrationChangedEvent {
    pub contract_version: String,
    pub revision: String,
}

fn is_valid_revision(value: &str) -> bool {
    value == "0"
        || (value
            .bytes()
            .next()
            .is_some_and(|byte| matches!(byte, b'1'..=b'9'))
            && value.bytes().all(|byte| byte.is_ascii_digit()))
}

fn diagnostic_is_valid(value: &PluginRegistrationDiagnostic) -> bool {
    let expected_message = match value.code.as_str() {
        "duplicate_identity" => "Plugin identity is already registered.",
        "identity_mismatch" => "Plugin record identity does not match its record key.",
        "invalid_registration" => "Plugin registration is invalid.",
        "persist_failed" => "Plugin registration could not be saved.",
        "record_invalid" => "Plugin record is invalid.",
        "record_unreadable" => "Plugin record could not be read.",
        "store_unavailable" => "Plugin Manager storage is unavailable.",
        "unsupported_format_version" => "Plugin record format version is unsupported.",
        _ => return false,
    };
    matches!(
        value.phase.as_str(),
        "validate" | "persist" | "recover" | "initialize"
    ) && value.message == expected_message
}

fn summary_entry_id(value: &PluginRegistrationSummary) -> &str {
    match value {
        PluginRegistrationSummary::Registered { entry_id, .. }
        | PluginRegistrationSummary::Quarantined { entry_id, .. } => entry_id,
    }
}

pub fn deserialize_plugin_registration_snapshot(
    value: &Value,
) -> Result<PluginRegistrationSnapshot, ()> {
    let snapshot =
        serde_json::from_value::<PluginRegistrationSnapshot>(value.clone()).map_err(|_| ())?;
    if snapshot.contract_version != PLUGIN_REGISTRATION_CONTRACT_VERSION
        || !is_valid_revision(&snapshot.revision)
        || snapshot
            .entries
            .iter()
            .any(|entry| !is_valid_plugin_registration_entry_id(summary_entry_id(entry)))
        || snapshot
            .entries
            .windows(2)
            .any(|pair| summary_entry_id(&pair[0]) >= summary_entry_id(&pair[1]))
    {
        return Err(());
    }
    for entry in &snapshot.entries {
        match entry {
            PluginRegistrationSummary::Registered {
                plugin_id, version, ..
            } if plugin_id.is_empty() || version.is_empty() => return Err(()),
            PluginRegistrationSummary::Quarantined {
                plugin_id,
                diagnostic,
                ..
            } if plugin_id.as_ref().is_some_and(String::is_empty)
                || !diagnostic_is_valid(diagnostic) =>
            {
                return Err(())
            }
            _ => {}
        }
    }
    if matches!(
        &snapshot.availability,
        PluginManagerAvailability::Degraded { diagnostic } if !diagnostic_is_valid(diagnostic)
    ) {
        return Err(());
    }
    Ok(snapshot)
}

pub fn deserialize_plugin_registration_detail(
    value: &Value,
) -> Result<PluginRegistrationDetailResponse, ()> {
    let response = serde_json::from_value::<PluginRegistrationDetailResponse>(value.clone())
        .map_err(|_| ())?;
    if response.contract_version != PLUGIN_REGISTRATION_CONTRACT_VERSION
        || !is_valid_revision(&response.revision)
    {
        return Err(());
    }
    match &response.detail {
        PluginRegistrationDetail::Registered {
            entry_id,
            granted_permission_ids,
            diagnostics,
            ..
        } => {
            if !is_valid_plugin_registration_entry_id(entry_id)
                || !is_sorted_unique(granted_permission_ids)
                || granted_permission_ids
                    .iter()
                    .any(|permission| !is_registration_permission_id(permission))
                || diagnostics.len() > 32
                || diagnostics
                    .iter()
                    .any(|diagnostic| !diagnostic_is_valid(diagnostic))
            {
                return Err(());
            }
        }
        PluginRegistrationDetail::Quarantined {
            entry_id,
            plugin_id,
            diagnostic,
        } => {
            if !is_valid_plugin_registration_entry_id(entry_id)
                || plugin_id.as_ref().is_some_and(String::is_empty)
                || !diagnostic_is_valid(diagnostic)
            {
                return Err(());
            }
        }
    }
    Ok(response)
}

pub fn deserialize_plugin_registration_event(
    value: &Value,
) -> Result<PluginRegistrationChangedEvent, ()> {
    let event =
        serde_json::from_value::<PluginRegistrationChangedEvent>(value.clone()).map_err(|_| ())?;
    if event.contract_version != PLUGIN_REGISTRATION_CONTRACT_VERSION
        || !is_valid_revision(&event.revision)
    {
        return Err(());
    }
    Ok(event)
}

pub fn deserialize_plugin_registration_query_error(
    value: &Value,
) -> Result<PluginRegistrationQueryError, ()> {
    let error =
        serde_json::from_value::<PluginRegistrationQueryError>(value.clone()).map_err(|_| ())?;
    let expected_message = match error.code {
        PluginRegistrationQueryErrorCode::InvalidRequest => {
            "Plugin registration request is invalid."
        }
        PluginRegistrationQueryErrorCode::NotFound => "Plugin registration entry was not found.",
        PluginRegistrationQueryErrorCode::Unavailable => "Plugin registration data is unavailable.",
        PluginRegistrationQueryErrorCode::Internal => "Plugin registration query failed.",
    };
    if error.message != expected_message
        || matches!(
            error.code,
            PluginRegistrationQueryErrorCode::InvalidRequest
                | PluginRegistrationQueryErrorCode::NotFound
        ) && error.operation != PluginRegistrationQueryOperation::ReadDetail
    {
        return Err(());
    }
    Ok(error)
}

impl PluginRegistrationChangedEvent {
    pub(crate) fn new(revision: u64) -> Self {
        Self {
            contract_version: PLUGIN_REGISTRATION_CONTRACT_VERSION.to_owned(),
            revision: revision.to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginRegistrationQueryErrorCode {
    InvalidRequest,
    NotFound,
    Unavailable,
    Internal,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginRegistrationQueryOperation {
    ReadSnapshot,
    ReadDetail,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRegistrationQueryError {
    pub code: PluginRegistrationQueryErrorCode,
    pub operation: PluginRegistrationQueryOperation,
    pub message: String,
}

impl PluginRegistrationQueryError {
    fn new(
        code: PluginRegistrationQueryErrorCode,
        operation: PluginRegistrationQueryOperation,
    ) -> Self {
        let message = match code {
            PluginRegistrationQueryErrorCode::InvalidRequest => {
                "Plugin registration request is invalid."
            }
            PluginRegistrationQueryErrorCode::NotFound => {
                "Plugin registration entry was not found."
            }
            PluginRegistrationQueryErrorCode::Unavailable => {
                "Plugin registration data is unavailable."
            }
            PluginRegistrationQueryErrorCode::Internal => "Plugin registration query failed.",
        };
        Self {
            code,
            operation,
            message: message.to_owned(),
        }
    }

    pub fn invalid_request() -> Self {
        Self::new(
            PluginRegistrationQueryErrorCode::InvalidRequest,
            PluginRegistrationQueryOperation::ReadDetail,
        )
    }

    pub fn not_found() -> Self {
        Self::new(
            PluginRegistrationQueryErrorCode::NotFound,
            PluginRegistrationQueryOperation::ReadDetail,
        )
    }
}

fn entry_identity(namespace: &str, value: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in namespace.bytes().chain([0]).chain(value.bytes()) {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{ENTRY_ID_PREFIX}{hash:016x}")
}

pub fn is_valid_plugin_registration_entry_id(value: &str) -> bool {
    value.len() == ENTRY_ID_PREFIX.len() + ENTRY_ID_HEX_LENGTH
        && value.starts_with(ENTRY_ID_PREFIX)
        && value[ENTRY_ID_PREFIX.len()..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn is_registration_permission_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'-' | b'_')
        })
}

fn is_sorted_unique(values: &[String]) -> bool {
    values.windows(2).all(|pair| pair[0] < pair[1])
}

pub(crate) fn healthy_entry_id(registration: &PluginRegistration) -> String {
    entry_identity("registered", &registration.manifest.plugin_id)
}

pub(crate) fn quarantine_entry_id(stub: &QuarantineStub) -> String {
    entry_identity("quarantined", &stub.record_key)
}

fn registered_summary(registration: &PluginRegistration) -> PluginRegistrationSummary {
    PluginRegistrationSummary::Registered {
        entry_id: healthy_entry_id(registration),
        plugin_id: registration.manifest.plugin_id.clone(),
        version: registration.manifest.version.clone(),
        display: registration.manifest.display.clone(),
        source: registration.facts.source.into(),
        enabled: registration.facts.enabled,
        compatibility: PluginRegistrationCompatibility {
            lensx: registration.compatibility.lensx,
            host_api: registration.compatibility.host_api,
        },
        runtime: registration.runtime.into(),
    }
}

fn quarantine_summary(stub: &QuarantineStub) -> PluginRegistrationSummary {
    PluginRegistrationSummary::Quarantined {
        entry_id: quarantine_entry_id(stub),
        plugin_id: stub.plugin_id.clone(),
        diagnostic: (&stub.diagnostic).into(),
    }
}

pub(crate) fn project_plugin_registration_snapshot<'a>(
    revision: u64,
    recovery_report: &PluginManagerRecoveryReport,
    healthy: impl Iterator<Item = &'a PluginRegistration>,
    quarantined: impl Iterator<Item = &'a QuarantineStub>,
) -> PluginRegistrationSnapshot {
    let mut entries = healthy
        .map(registered_summary)
        .chain(quarantined.map(quarantine_summary))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.entry_id().cmp(right.entry_id()));
    let availability = if recovery_report.degraded {
        PluginManagerAvailability::Degraded {
            diagnostic: recovery_report
                .diagnostics
                .first()
                .map(PluginRegistrationDiagnostic::from)
                .unwrap_or(PluginRegistrationDiagnostic {
                    code: "store_unavailable".to_owned(),
                    phase: "initialize".to_owned(),
                    message: "Plugin Manager storage is unavailable.".to_owned(),
                }),
        }
    } else {
        PluginManagerAvailability::Available
    };
    PluginRegistrationSnapshot {
        contract_version: PLUGIN_REGISTRATION_CONTRACT_VERSION.to_owned(),
        revision: revision.to_string(),
        availability,
        entries,
    }
}

pub(crate) fn project_plugin_registration_detail<'a>(
    revision: u64,
    entry_id: &str,
    healthy: impl Iterator<Item = &'a PluginRegistration>,
    quarantined: impl Iterator<Item = &'a QuarantineStub>,
) -> Result<PluginRegistrationDetailResponse, PluginRegistrationQueryError> {
    if !is_valid_plugin_registration_entry_id(entry_id) {
        return Err(PluginRegistrationQueryError::invalid_request());
    }
    let detail = healthy
        .filter(|registration| healthy_entry_id(registration) == entry_id)
        .map(|registration| PluginRegistrationDetail::Registered {
            entry_id: entry_id.to_owned(),
            manifest: registration.manifest.clone(),
            source: registration.facts.source.into(),
            enabled: registration.facts.enabled,
            compatibility: PluginRegistrationCompatibility {
                lensx: registration.compatibility.lensx,
                host_api: registration.compatibility.host_api,
            },
            granted_permission_ids: registration.facts.granted_permission_ids.clone(),
            runtime: registration.runtime.into(),
            diagnostics: registration
                .facts
                .diagnostics
                .iter()
                .map(PluginRegistrationDiagnostic::from)
                .collect(),
        })
        .next()
        .or_else(|| {
            quarantined
                .filter(|stub| quarantine_entry_id(stub) == entry_id)
                .map(|stub| PluginRegistrationDetail::Quarantined {
                    entry_id: entry_id.to_owned(),
                    plugin_id: stub.plugin_id.clone(),
                    diagnostic: (&stub.diagnostic).into(),
                })
                .next()
        })
        .ok_or_else(PluginRegistrationQueryError::not_found)?;
    Ok(PluginRegistrationDetailResponse {
        contract_version: PLUGIN_REGISTRATION_CONTRACT_VERSION.to_owned(),
        revision: revision.to_string(),
        detail,
    })
}

#[tauri::command]
pub fn read_plugin_registration_snapshot(
    manager: State<'_, std::sync::Arc<PluginManager>>,
) -> Result<PluginRegistrationSnapshot, PluginRegistrationQueryError> {
    query_plugin_registration_snapshot(&manager)
}

pub fn query_plugin_registration_snapshot(
    manager: &PluginManager,
) -> Result<PluginRegistrationSnapshot, PluginRegistrationQueryError> {
    Ok(manager.read_registration_snapshot())
}

#[tauri::command]
pub fn read_plugin_registration_detail(
    manager: State<'_, std::sync::Arc<PluginManager>>,
    request: Value,
) -> Result<PluginRegistrationDetailResponse, PluginRegistrationQueryError> {
    query_plugin_registration_detail(&manager, request)
}

pub fn query_plugin_registration_detail(
    manager: &PluginManager,
    request: Value,
) -> Result<PluginRegistrationDetailResponse, PluginRegistrationQueryError> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Request {
        entry_id: String,
    }
    let request = serde_json::from_value::<Request>(request)
        .map_err(|_| PluginRegistrationQueryError::invalid_request())?;
    manager.read_registration_detail(&request.entry_id)
}

pub trait PluginRegistrationEventEmitter {
    fn emit_registration_changed(&self, payload: &PluginRegistrationChangedEvent)
        -> Result<(), ()>;
}

impl<R: Runtime> PluginRegistrationEventEmitter for AppHandle<R> {
    fn emit_registration_changed(
        &self,
        payload: &PluginRegistrationChangedEvent,
    ) -> Result<(), ()> {
        self.emit(PLUGIN_REGISTRATION_CHANGED_EVENT, payload)
            .map_err(|_| ())
    }
}

pub fn emit_plugin_registration_changed(
    emitter: &impl PluginRegistrationEventEmitter,
    change: &PluginRegistrationChangedEvent,
) -> Result<(), ()> {
    emitter.emit_registration_changed(change)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_manager::{
            PackageDigest, PluginManagerDiagnosticCode, PluginManagerDiagnosticPhase,
            PluginRegistrationFacts,
        },
        plugin_manifest::{validate_plugin_manifest, PluginHostVersions},
    };
    use serde_json::{json, Value};
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
                .expect("system clock should be valid")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "lensx-plugin-registration-{name}-{}-{nonce}",
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
        .expect("base fixture should parse");
        input["plugin_id"] = json!(plugin_id);
        input["publisher"]["author"] = json!("lensX Official");
        if maximum == "0.1.0" {
            input["compatibility"]["lensx"]["min_version"] = json!("0.0.1");
            input["compatibility"]["host_api"]["min_version"] = json!("0.0.1");
        }
        input["compatibility"]["lensx"]["max_version_exclusive"] = json!(maximum);
        input["compatibility"]["host_api"]["max_version_exclusive"] = json!(maximum);
        validate_plugin_manifest(&input, &versions("0.1.0"))
            .manifest
            .expect("fixture should normalize")
    }

    fn facts(enabled: bool) -> PluginRegistrationFacts {
        PluginRegistrationFacts::with_grants(
            "/private/secret/plugins/example",
            PackageDigest {
                algorithm: "sha256".to_owned(),
                value: "aabbccdd".to_owned(),
            },
            PluginSource::External,
            enabled,
            vec![
                "files.read".to_owned(),
                "clipboard.read".to_owned(),
                "files.read".to_owned(),
            ],
        )
        .expect("facts should normalize")
    }

    #[test]
    fn empty_and_degraded_snapshots_are_distinct() {
        let empty_directory = TestDirectory::new("empty");
        let empty = PluginManager::recover(&empty_directory.0, versions("0.1.0"))
            .read_registration_snapshot();
        assert_eq!(empty.revision, "0");
        assert_eq!(empty.availability, PluginManagerAvailability::Available);
        assert!(empty.entries.is_empty());

        let degraded_directory = TestDirectory::new("degraded");
        fs::write(degraded_directory.0.join("plugin-manager"), b"preserve")
            .expect("blocking file should exist");
        let degraded = PluginManager::recover(&degraded_directory.0, versions("0.1.0"))
            .read_registration_snapshot();
        assert!(matches!(
            degraded.availability,
            PluginManagerAvailability::Degraded { .. }
        ));
        assert!(degraded.entries.is_empty());
        assert!(!serde_json::to_string(&degraded)
            .expect("snapshot should serialize")
            .contains(degraded_directory.0.to_string_lossy().as_ref()));
    }

    #[test]
    fn healthy_projection_is_layered_deterministic_and_sensitive_field_free() {
        let directory = TestDirectory::new("healthy");
        let manager = PluginManager::recover(&directory.0, versions("0.1.0"));
        manager
            .register(manifest("com.acme.zed", "0.1.0"), facts(false))
            .expect("incompatible registration should persist");
        manager
            .register(manifest("com.acme.alpha", "0.2.0"), facts(true))
            .expect("compatible registration should persist");
        manager
            .append_diagnostic(
                "com.acme.alpha",
                PluginManagerDiagnostic::new(
                    PluginManagerDiagnosticCode::PersistFailed,
                    PluginManagerDiagnosticPhase::Persist,
                ),
            )
            .expect("diagnostic should persist");

        let snapshot = manager.read_registration_snapshot();
        assert_eq!(snapshot.revision, "3");
        assert_eq!(snapshot.entries.len(), 2);
        let ids = snapshot
            .entries
            .iter()
            .map(PluginRegistrationSummary::entry_id)
            .collect::<Vec<_>>();
        assert!(ids.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(ids
            .iter()
            .all(|id| is_valid_plugin_registration_entry_id(id)));

        let alpha_id = snapshot
            .entries
            .iter()
            .find_map(|entry| match entry {
                PluginRegistrationSummary::Registered {
                    entry_id,
                    plugin_id,
                    source,
                    enabled,
                    compatibility,
                    ..
                } if plugin_id == "com.acme.alpha" => {
                    assert_eq!(*source, PluginRegistrationSource::External);
                    assert!(*enabled);
                    assert_eq!(
                        *compatibility,
                        PluginRegistrationCompatibility {
                            lensx: true,
                            host_api: true,
                        }
                    );
                    Some(entry_id.clone())
                }
                _ => None,
            })
            .expect("alpha summary should exist");
        let detail = manager
            .read_registration_detail(&alpha_id)
            .expect("detail should exist");
        let serialized = serde_json::to_value(&detail).expect("detail should serialize");
        let serialized_text = serialized.to_string();
        for sensitive in [
            "installation_path",
            "package_digest",
            "record_key",
            "/private/secret",
            "aabbccdd",
        ] {
            assert!(!serialized_text.contains(sensitive));
        }
        match detail.detail {
            PluginRegistrationDetail::Registered {
                manifest,
                granted_permission_ids,
                runtime,
                diagnostics,
                ..
            } => {
                assert_eq!(manifest.publisher.author, "lensX Official");
                assert_eq!(
                    granted_permission_ids,
                    vec!["clipboard.read".to_owned(), "files.read".to_owned()]
                );
                assert_eq!(runtime, PluginRegistrationRuntimeStatus::Inactive);
                assert_eq!(diagnostics.len(), 1);
                assert_eq!(manifest.requested_permissions.len(), 1);
            }
            PluginRegistrationDetail::Quarantined { .. } => {
                panic!("expected registered detail")
            }
        }
    }

    #[test]
    fn quarantine_projection_exposes_only_opaque_identity_and_safe_diagnostic() {
        let directory = TestDirectory::new("quarantine");
        let store = directory.0.join("plugin-manager");
        fs::create_dir_all(&store).expect("store should exist");
        fs::write(
            store.join("v1-secret-store-file.json"),
            b"{private plugin bytes",
        )
        .expect("damaged record should exist");
        let manager = PluginManager::recover(&directory.0, versions("0.1.0"));
        let snapshot = manager.read_registration_snapshot();
        let entry_id = match snapshot.entries.as_slice() {
            [PluginRegistrationSummary::Quarantined {
                entry_id,
                plugin_id,
                ..
            }] => {
                assert!(plugin_id.is_none());
                entry_id.clone()
            }
            _ => panic!("expected one quarantine summary"),
        };
        let detail = manager
            .read_registration_detail(&entry_id)
            .expect("quarantine detail should exist");
        let serialized = serde_json::to_string(&detail).expect("detail should serialize");
        assert!(!serialized.contains("secret-store-file"));
        assert!(!serialized.contains("private plugin bytes"));
        assert!(matches!(
            detail.detail,
            PluginRegistrationDetail::Quarantined {
                plugin_id: None,
                ..
            }
        ));
    }

    #[test]
    fn detail_errors_are_strict_stable_and_safe() {
        let directory = TestDirectory::new("errors");
        let manager = PluginManager::recover(&directory.0, versions("0.1.0"));
        assert_eq!(
            manager
                .read_registration_detail("")
                .expect_err("empty identity should fail"),
            PluginRegistrationQueryError::invalid_request()
        );
        assert_eq!(
            manager
                .read_registration_detail("entry_0000000000000000")
                .expect_err("missing entry should fail"),
            PluginRegistrationQueryError::not_found()
        );
        assert!(
            serde_json::from_value::<PluginRegistrationDetailResponse>(json!({
                "contract_version": "0.1.0",
                "revision": "0",
                "detail": {
                    "kind": "quarantined",
                    "entry_id": "entry_0000000000000000",
                    "diagnostic": {"code": "record_invalid", "phase": "recover", "message": "safe"},
                    "installation_path": "/secret"
                }
            }))
            .is_err()
        );
        for invalid_request in [
            json!(null),
            json!({}),
            json!({"entry_id": 1}),
            json!({"entry_id": "entry_0000000000000000", "extra": true}),
        ] {
            assert_eq!(
                query_plugin_registration_detail(&manager, invalid_request)
                    .expect_err("invalid request should be mapped"),
                PluginRegistrationQueryError::invalid_request()
            );
        }
        assert_eq!(
            serde_json::to_value(PluginRegistrationQueryError::not_found())
                .expect("query error should serialize"),
            json!({
                "code": "not_found",
                "operation": "read_detail",
                "message": "Plugin registration entry was not found."
            })
        );
    }

    #[derive(Deserialize)]
    struct ValidFixture {
        name: String,
        #[serde(rename = "type")]
        payload_type: String,
        value: Value,
    }

    #[derive(Deserialize)]
    struct InvalidFixture {
        name: String,
        #[serde(rename = "type")]
        payload_type: String,
        base: String,
        set: std::collections::BTreeMap<String, Value>,
    }

    fn set_pointer(value: &mut Value, pointer: &str, replacement: Value) {
        if let Some(target) = value.pointer_mut(pointer) {
            *target = replacement;
            return;
        }
        let (parent_pointer, key) = pointer.rsplit_once('/').expect("pointer should have a key");
        let parent = value
            .pointer_mut(parent_pointer)
            .and_then(Value::as_object_mut)
            .expect("new fixture fields should have an object parent");
        parent.insert(key.to_owned(), replacement);
    }

    fn parse_fixture(payload_type: &str, value: &Value) -> Result<Value, ()> {
        match payload_type {
            "snapshot" => deserialize_plugin_registration_snapshot(value)
                .and_then(|payload| serde_json::to_value(payload).map_err(|_| ())),
            "detail" => deserialize_plugin_registration_detail(value)
                .and_then(|payload| serde_json::to_value(payload).map_err(|_| ())),
            "event" => deserialize_plugin_registration_event(value)
                .and_then(|payload| serde_json::to_value(payload).map_err(|_| ())),
            "error" => deserialize_plugin_registration_query_error(value)
                .and_then(|payload| serde_json::to_value(payload).map_err(|_| ())),
            _ => Err(()),
        }
    }

    #[test]
    fn shared_fixtures_keep_rust_and_typescript_wire_validation_aligned() {
        let valid = serde_json::from_str::<Vec<ValidFixture>>(include_str!(
            "../../fixtures/plugin-registration-contract/valid/cases.json"
        ))
        .expect("valid fixtures should parse");
        let by_name = valid
            .iter()
            .map(|fixture| (fixture.name.as_str(), &fixture.value))
            .collect::<std::collections::BTreeMap<_, _>>();
        for fixture in &valid {
            assert_eq!(
                parse_fixture(&fixture.payload_type, &fixture.value),
                Ok(fixture.value.clone()),
                "valid fixture should round trip: {}",
                fixture.name
            );
        }

        let invalid = serde_json::from_str::<Vec<InvalidFixture>>(include_str!(
            "../../fixtures/plugin-registration-contract/invalid/cases.json"
        ))
        .expect("invalid fixtures should parse");
        for fixture in invalid {
            let mut value = by_name
                .get(fixture.base.as_str())
                .expect("invalid fixture base should exist")
                .to_owned()
                .clone();
            for (pointer, replacement) in fixture.set {
                set_pointer(&mut value, &pointer, replacement);
            }
            assert!(
                parse_fixture(&fixture.payload_type, &value).is_err(),
                "invalid fixture should be rejected: {}",
                fixture.name
            );
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
            self.events
                .lock()
                .expect("events should not be poisoned")
                .push(payload.clone());
            Ok(())
        }
    }

    #[test]
    fn emitter_accepts_only_typed_post_commit_changes() {
        let directory = TestDirectory::new("events");
        let manager = PluginManager::recover(&directory.0, versions("0.1.0"));
        let emitter = FakeEmitter::default();
        let change = manager
            .register(manifest("com.acme.event", "0.2.0"), facts(true))
            .expect("registration should persist")
            .expect("registration should return a change");
        emit_plugin_registration_changed(&emitter, &change).expect("event should emit");
        assert_eq!(
            emitter
                .events
                .lock()
                .expect("events should be readable")
                .as_slice(),
            &[PluginRegistrationChangedEvent {
                contract_version: "0.2.0".to_owned(),
                revision: "1".to_owned(),
            }]
        );

        assert!(manager
            .set_enabled("com.acme.event", true)
            .expect("no-op should succeed")
            .is_none());
        assert_eq!(
            emitter
                .events
                .lock()
                .expect("events should be readable")
                .len(),
            1
        );
    }
}
