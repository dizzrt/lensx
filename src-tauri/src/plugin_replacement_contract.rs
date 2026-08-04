use crate::plugin_registration::is_valid_plugin_registration_entry_id;
use serde::{Deserialize, Serialize};

pub const PLUGIN_REPLACEMENT_CONTRACT_VERSION: &str = "0.1.0";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PreparePluginReplacementRequest {
    pub contract_version: String,
    pub entry_id: String,
    pub expected_revision: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CommitPluginReplacementRequest {
    pub contract_version: String,
    pub preparation_token: String,
    pub entry_id: String,
    pub expected_revision: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CancelPluginReplacementRequest {
    pub contract_version: String,
    pub preparation_token: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginReplacementClassification {
    Upgrade,
    Downgrade,
    Reinstall,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginReplacementCleanupConclusion {
    Complete,
    Pending,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginReplacementResult {
    Cancelled {
        contract_version: String,
    },
    Duplicate {
        contract_version: String,
        entry_id: String,
        current_version: String,
        candidate_version: String,
    },
    Prepared {
        contract_version: String,
        preparation_token: String,
        entry_id: String,
        current_version: String,
        candidate_version: String,
        classification: PluginReplacementClassification,
        added_permission_ids: Vec<String>,
        removed_permission_ids: Vec<String>,
    },
    Committed {
        contract_version: String,
        entry_id: String,
        plugin_id: String,
        version: String,
        classification: PluginReplacementClassification,
        revision: String,
        cleanup: PluginReplacementCleanupConclusion,
    },
}

impl PluginReplacementResult {
    pub fn cancelled() -> Self {
        Self::Cancelled {
            contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION.to_owned(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginReplacementErrorCode {
    InvalidRequest,
    InvalidPackage,
    Incompatible,
    IdentityMismatch,
    IdentityQuarantined,
    UnsafeState,
    StaleRevision,
    InvalidPreparation,
    Busy,
    Unavailable,
    SourceReadFailed,
    ExtractionFailed,
    CommitFailed,
    RegistrationFailed,
    Internal,
}

impl PluginReplacementErrorCode {
    pub fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "The plugin replacement request is invalid.",
            Self::InvalidPackage => "The selected file is not a valid lensX plugin package.",
            Self::Incompatible => {
                "The selected plugin is not compatible with this version of lensX."
            }
            Self::IdentityMismatch => {
                "The selected package does not match the target plugin identity."
            }
            Self::IdentityQuarantined => "A quarantined plugin identity cannot be replaced.",
            Self::UnsafeState => {
                "Plugin replacement cannot continue from the current storage state."
            }
            Self::StaleRevision => "The plugin registration revision is stale.",
            Self::InvalidPreparation => "The plugin replacement preparation is invalid or expired.",
            Self::Busy => "Another plugin operation is in progress.",
            Self::Unavailable => "Plugin replacement is unavailable.",
            Self::SourceReadFailed => "The selected plugin package could not be read.",
            Self::ExtractionFailed => "The plugin package could not be extracted safely.",
            Self::CommitFailed => "The plugin replacement could not be committed.",
            Self::RegistrationFailed => "The plugin registration could not be replaced.",
            Self::Internal => "Plugin replacement failed.",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginReplacementOperation {
    Prepare,
    Select,
    Read,
    Inspect,
    Extract,
    Commit,
    Register,
    Cleanup,
    Cancel,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginReplacementError {
    pub contract_version: String,
    pub code: PluginReplacementErrorCode,
    pub operation: PluginReplacementOperation,
    pub message: String,
}

impl PluginReplacementError {
    pub fn new(code: PluginReplacementErrorCode, operation: PluginReplacementOperation) -> Self {
        Self {
            contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION.to_owned(),
            code,
            operation,
            message: code.message().to_owned(),
        }
    }
}

pub fn validate_prepare_request(request: &PreparePluginReplacementRequest) -> bool {
    request.contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
        && is_valid_plugin_registration_entry_id(&request.entry_id)
        && is_revision(&request.expected_revision)
}

pub fn validate_commit_request(request: &CommitPluginReplacementRequest) -> bool {
    request.contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
        && is_preparation_token(&request.preparation_token)
        && is_valid_plugin_registration_entry_id(&request.entry_id)
        && is_revision(&request.expected_revision)
}

pub fn validate_cancel_request(request: &CancelPluginReplacementRequest) -> bool {
    request.contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
        && is_preparation_token(&request.preparation_token)
}

pub fn deserialize_prepare_request(
    value: serde_json::Value,
) -> Result<PreparePluginReplacementRequest, ()> {
    let request: PreparePluginReplacementRequest = serde_json::from_value(value).map_err(|_| ())?;
    validate_prepare_request(&request)
        .then_some(request)
        .ok_or(())
}

pub fn deserialize_commit_request(
    value: serde_json::Value,
) -> Result<CommitPluginReplacementRequest, ()> {
    let request: CommitPluginReplacementRequest = serde_json::from_value(value).map_err(|_| ())?;
    validate_commit_request(&request)
        .then_some(request)
        .ok_or(())
}

pub fn deserialize_cancel_request(
    value: serde_json::Value,
) -> Result<CancelPluginReplacementRequest, ()> {
    let request: CancelPluginReplacementRequest = serde_json::from_value(value).map_err(|_| ())?;
    validate_cancel_request(&request)
        .then_some(request)
        .ok_or(())
}

pub fn deserialize_replacement_result(
    value: serde_json::Value,
) -> Result<PluginReplacementResult, ()> {
    let result: PluginReplacementResult = serde_json::from_value(value).map_err(|_| ())?;
    let valid = match &result {
        PluginReplacementResult::Cancelled { contract_version } => {
            contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
        }
        PluginReplacementResult::Duplicate {
            contract_version,
            entry_id,
            current_version,
            candidate_version,
        } => {
            contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
                && is_valid_plugin_registration_entry_id(entry_id)
                && semver::Version::parse(current_version).is_ok()
                && semver::Version::parse(candidate_version).is_ok()
        }
        PluginReplacementResult::Prepared {
            contract_version,
            preparation_token,
            entry_id,
            current_version,
            candidate_version,
            added_permission_ids,
            removed_permission_ids,
            ..
        } => {
            contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
                && is_preparation_token(preparation_token)
                && is_valid_plugin_registration_entry_id(entry_id)
                && semver::Version::parse(current_version).is_ok()
                && semver::Version::parse(candidate_version).is_ok()
                && is_sorted_unique_permissions(added_permission_ids)
                && is_sorted_unique_permissions(removed_permission_ids)
        }
        PluginReplacementResult::Committed {
            contract_version,
            entry_id,
            plugin_id,
            version,
            revision,
            ..
        } => {
            contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
                && is_valid_plugin_registration_entry_id(entry_id)
                && is_plugin_id(plugin_id)
                && semver::Version::parse(version).is_ok()
                && is_revision(revision)
        }
    };
    valid.then_some(result).ok_or(())
}

pub fn deserialize_replacement_error(
    value: serde_json::Value,
) -> Result<PluginReplacementError, ()> {
    let error: PluginReplacementError = serde_json::from_value(value).map_err(|_| ())?;
    (error.contract_version == PLUGIN_REPLACEMENT_CONTRACT_VERSION
        && error.message == error.code.message())
    .then_some(error)
    .ok_or(())
}

pub fn is_preparation_token(value: &str) -> bool {
    (32..=128).contains(&value.len())
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_uppercase()
                || byte.is_ascii_digit()
                || matches!(byte, b'-' | b'_')
        })
}

fn is_revision(value: &str) -> bool {
    value == "0"
        || (value
            .bytes()
            .next()
            .is_some_and(|byte| matches!(byte, b'1'..=b'9'))
            && value.bytes().all(|byte| byte.is_ascii_digit()))
}

fn is_plugin_id(value: &str) -> bool {
    value.len() <= 255
        && value.split('.').count() >= 2
        && value.split('.').all(|segment| {
            segment.len() <= 64
                && segment
                    .bytes()
                    .next()
                    .is_some_and(|byte| byte.is_ascii_lowercase())
                && segment.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || matches!(byte, b'_' | b'-')
                })
        })
}

fn is_sorted_unique_permissions(values: &[String]) -> bool {
    values.windows(2).all(|pair| pair[0] < pair[1])
        && values.iter().all(|value| {
            !value.is_empty()
                && value.len() <= 255
                && value.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || matches!(byte, b'.' | b'-' | b'_')
                })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        #[serde(rename = "type")]
        payload_type: String,
        value: serde_json::Value,
    }

    fn parse(fixture: &Fixture) -> Result<(), ()> {
        match fixture.payload_type.as_str() {
            "prepare_request" => deserialize_prepare_request(fixture.value.clone()).map(|_| ()),
            "commit_request" => deserialize_commit_request(fixture.value.clone()).map(|_| ()),
            "cancel_request" => deserialize_cancel_request(fixture.value.clone()).map(|_| ()),
            "result" => deserialize_replacement_result(fixture.value.clone()).map(|_| ()),
            "error" => deserialize_replacement_error(fixture.value.clone()).map(|_| ()),
            _ => Err(()),
        }
    }

    #[test]
    fn shared_replacement_contract_fixtures_are_strict_and_safe() {
        let valid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-replacement/valid/cases.json"
        ))
        .expect("valid fixtures should parse");
        for fixture in valid {
            assert!(parse(&fixture).is_ok(), "valid fixture: {}", fixture.name);
        }
        let invalid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-replacement/invalid/cases.json"
        ))
        .expect("invalid fixtures should parse");
        for fixture in invalid {
            assert!(
                parse(&fixture).is_err(),
                "invalid fixture: {}",
                fixture.name
            );
        }
    }

    #[test]
    fn serialized_results_and_errors_disclose_no_private_storage_facts() {
        let value = serde_json::to_string(&PluginReplacementResult::Committed {
            contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION.to_owned(),
            entry_id: "entry_0123456789abcdef".to_owned(),
            plugin_id: "com.acme.workspace".to_owned(),
            version: "2.0.0".to_owned(),
            classification: PluginReplacementClassification::Upgrade,
            revision: "8".to_owned(),
            cleanup: PluginReplacementCleanupConclusion::Pending,
        })
        .expect("result should serialize");
        for secret in ["path", "digest", "record_key", "package_bytes", "/Users/"] {
            assert!(!value.contains(secret));
        }
    }
}
