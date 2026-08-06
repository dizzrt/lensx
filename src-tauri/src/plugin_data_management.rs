use crate::plugin_scoped_storage::{PluginDataClearFailure, PluginScopedStorage};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

pub const PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION: &str = "0.1.0";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ClearPluginDataRequest {
    pub contract_version: String,
    pub entry_id: String,
    pub expected_revision: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ClearPluginDataResult {
    pub contract_version: String,
    pub current_revision: String,
    pub changed: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginDataManagementErrorCode {
    InvalidRequest,
    Conflict,
    NotFound,
    PluginEnabled,
    OperationNotSupported,
    UnsafeStorage,
    Unavailable,
    Internal,
}

impl PluginDataManagementErrorCode {
    fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "Plugin data management request is invalid.",
            Self::Conflict => "Plugin data management request conflicts with current state.",
            Self::NotFound => "Plugin data management entry was not found.",
            Self::PluginEnabled => "Plugin data can be cleared only while the plugin is disabled.",
            Self::OperationNotSupported => {
                "Plugin data management is not supported for this entry."
            }
            Self::UnsafeStorage => "Plugin data storage cannot be cleared safely.",
            Self::Unavailable => "Plugin data management is unavailable.",
            Self::Internal => "Plugin data management operation failed.",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginDataManagementOperation {
    ClearPluginData,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginDataManagementError {
    pub contract_version: String,
    pub code: PluginDataManagementErrorCode,
    pub operation: PluginDataManagementOperation,
    pub message: String,
}

impl PluginDataManagementError {
    fn new(code: PluginDataManagementErrorCode) -> Self {
        Self {
            contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION.to_owned(),
            code,
            operation: PluginDataManagementOperation::ClearPluginData,
            message: code.message().to_owned(),
        }
    }

    #[cfg(test)]
    fn is_canonical(&self) -> bool {
        self.contract_version == PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION
            && self.operation == PluginDataManagementOperation::ClearPluginData
            && self.message == self.code.message()
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

fn parse_request(value: Value) -> Result<ClearPluginDataRequest, PluginDataManagementError> {
    let request = serde_json::from_value::<ClearPluginDataRequest>(value).map_err(|_| {
        PluginDataManagementError::new(PluginDataManagementErrorCode::InvalidRequest)
    })?;
    if request.contract_version != PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION
        || !crate::plugin_registration::is_valid_plugin_registration_entry_id(&request.entry_id)
        || !is_revision(&request.expected_revision)
    {
        return Err(PluginDataManagementError::new(
            PluginDataManagementErrorCode::InvalidRequest,
        ));
    }
    Ok(request)
}

fn map_failure(failure: PluginDataClearFailure) -> PluginDataManagementError {
    let code = match failure {
        PluginDataClearFailure::Conflict => PluginDataManagementErrorCode::Conflict,
        PluginDataClearFailure::NotFound => PluginDataManagementErrorCode::NotFound,
        PluginDataClearFailure::PluginEnabled => PluginDataManagementErrorCode::PluginEnabled,
        PluginDataClearFailure::OperationNotSupported => {
            PluginDataManagementErrorCode::OperationNotSupported
        }
        PluginDataClearFailure::UnsafeStorage => PluginDataManagementErrorCode::UnsafeStorage,
        PluginDataClearFailure::Unavailable => PluginDataManagementErrorCode::Unavailable,
        PluginDataClearFailure::Internal => PluginDataManagementErrorCode::Internal,
    };
    PluginDataManagementError::new(code)
}

pub fn clear_plugin_data_inner(
    storage: &PluginScopedStorage,
    request: Value,
) -> Result<ClearPluginDataResult, PluginDataManagementError> {
    let request = parse_request(request)?;
    let changed = storage
        .clear_disabled_namespace(&request.entry_id, &request.expected_revision)
        .map_err(map_failure)?;
    Ok(ClearPluginDataResult {
        contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION.to_owned(),
        current_revision: request.expected_revision,
        changed,
    })
}

#[tauri::command]
pub fn clear_plugin_data(
    storage: State<'_, Arc<PluginScopedStorage>>,
    request: Value,
) -> Result<ClearPluginDataResult, PluginDataManagementError> {
    clear_plugin_data_inner(&storage, request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct FixtureFile {
        valid: Vec<Fixture>,
        invalid: Vec<Fixture>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        kind: String,
        value: Value,
    }

    #[test]
    fn shared_typescript_and_rust_contract_fixtures_agree() {
        let fixtures: FixtureFile = serde_json::from_str(include_str!(
            "../../tests/fixtures/plugin-data-management/cases.json"
        ))
        .expect("fixtures should parse");
        for fixture in fixtures.valid {
            let valid = match fixture.kind.as_str() {
                "request" => parse_request(fixture.value).is_ok(),
                "result" => serde_json::from_value::<ClearPluginDataResult>(fixture.value)
                    .is_ok_and(|result| {
                        result.contract_version == PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION
                            && is_revision(&result.current_revision)
                    }),
                "error" => serde_json::from_value::<PluginDataManagementError>(fixture.value)
                    .is_ok_and(|error| error.is_canonical()),
                _ => false,
            };
            assert!(valid, "valid fixture rejected: {}", fixture.name);
        }
        for fixture in fixtures.invalid {
            let invalid =
                match fixture.kind.as_str() {
                    "request" => parse_request(fixture.value).is_err(),
                    "result" => serde_json::from_value::<ClearPluginDataResult>(fixture.value)
                        .map_or(true, |result| {
                            result.contract_version != PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION
                                || !is_revision(&result.current_revision)
                        }),
                    "error" => serde_json::from_value::<PluginDataManagementError>(fixture.value)
                        .map_or(true, |error| !error.is_canonical()),
                    _ => true,
                };
            assert!(invalid, "invalid fixture accepted: {}", fixture.name);
        }
    }

    #[test]
    fn private_command_is_registered_without_public_contract_exports() {
        let lib = include_str!("lib.rs");
        assert!(lib.contains("plugin_data_management::clear_plugin_data"));
        for source in [
            include_str!("../../packages/plugin-contract/src/index.ts"),
            include_str!("../../packages/plugin-sdk/src/index.ts"),
            include_str!("../../packages/plugin-ui/src/index.ts"),
            include_str!("../../packages/plugin-testkit/src/index.ts"),
        ] {
            assert!(!source.contains("PluginDataManagement"));
            assert!(!source.contains("clear_plugin_data"));
        }
    }
}
