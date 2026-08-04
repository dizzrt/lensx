use crate::plugin_identity::plugin_record_key;
use crate::plugin_registration::is_valid_plugin_registration_entry_id;
use crate::plugin_resource_url::parse_plugin_resource_url;
use semver::Version;
use serde::{Deserialize, Serialize};

pub const PLUGIN_RESOURCE_CONTRACT_VERSION: &str = "0.1.0";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ResolvePluginResourceEntryRequest {
    pub contract_version: String,
    pub entry_id: String,
    pub expected_revision: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginResourceEntry {
    pub contract_version: String,
    pub entry_id: String,
    pub revision: String,
    pub plugin_id: String,
    pub version: String,
    pub entry_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginResourceErrorCode {
    InvalidRequest,
    StaleRevision,
    NotFound,
    Unavailable,
    UnsafeState,
    Internal,
}

impl PluginResourceErrorCode {
    pub fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "Plugin resource request is invalid.",
            Self::StaleRevision => "Plugin registration revision is stale.",
            Self::NotFound => "Plugin resource entry was not found.",
            Self::Unavailable => "Plugin resource entry is unavailable.",
            Self::UnsafeState => "Plugin resource storage state is unsafe.",
            Self::Internal => "Plugin resource resolution failed.",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginResourceOperation {
    ResolveEntry,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginResourceError {
    pub contract_version: String,
    pub code: PluginResourceErrorCode,
    pub operation: PluginResourceOperation,
    pub message: String,
}

impl PluginResourceError {
    pub fn new(code: PluginResourceErrorCode) -> Self {
        Self {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
            code,
            operation: PluginResourceOperation::ResolveEntry,
            message: code.message().to_owned(),
        }
    }

    fn is_canonical(&self) -> bool {
        self.contract_version == PLUGIN_RESOURCE_CONTRACT_VERSION
            && self.operation == PluginResourceOperation::ResolveEntry
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

fn is_plugin_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value.split('.').count() >= 2
        && value.split('.').all(|segment| {
            !segment.is_empty()
                && segment.len() <= 64
                && segment
                    .bytes()
                    .next()
                    .is_some_and(|byte| byte.is_ascii_lowercase())
                && segment.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || matches!(byte, b'-' | b'_')
                })
        })
}

fn is_entry_url(value: &str, plugin_id: &str, version: &str) -> bool {
    parse_plugin_resource_url(value, false).is_some_and(|parsed| {
        parsed.plugin_key == plugin_record_key(plugin_id) && parsed.version == version
    })
}

pub fn validate_resolve_request(request: &ResolvePluginResourceEntryRequest) -> bool {
    request.contract_version == PLUGIN_RESOURCE_CONTRACT_VERSION
        && is_valid_plugin_registration_entry_id(&request.entry_id)
        && is_revision(&request.expected_revision)
}

pub fn deserialize_resolve_request(
    value: serde_json::Value,
) -> Result<ResolvePluginResourceEntryRequest, ()> {
    let request: ResolvePluginResourceEntryRequest =
        serde_json::from_value(value).map_err(|_| ())?;
    validate_resolve_request(&request)
        .then_some(request)
        .ok_or(())
}

pub fn deserialize_resource_entry(value: serde_json::Value) -> Result<PluginResourceEntry, ()> {
    let entry: PluginResourceEntry = serde_json::from_value(value).map_err(|_| ())?;
    (entry.contract_version == PLUGIN_RESOURCE_CONTRACT_VERSION
        && is_valid_plugin_registration_entry_id(&entry.entry_id)
        && is_revision(&entry.revision)
        && is_plugin_id(&entry.plugin_id)
        && Version::parse(&entry.version).is_ok()
        && is_entry_url(&entry.entry_url, &entry.plugin_id, &entry.version))
    .then_some(entry)
    .ok_or(())
}

pub fn deserialize_resource_error(value: serde_json::Value) -> Result<PluginResourceError, ()> {
    let error: PluginResourceError = serde_json::from_value(value).map_err(|_| ())?;
    error.is_canonical().then_some(error).ok_or(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        #[serde(rename = "type")]
        payload_type: String,
        value: serde_json::Value,
    }

    fn parse(fixture: &Fixture) -> Result<(), ()> {
        match fixture.payload_type.as_str() {
            "request" => deserialize_resolve_request(fixture.value.clone()).map(|_| ()),
            "result" => deserialize_resource_entry(fixture.value.clone()).map(|_| ()),
            "error" => deserialize_resource_error(fixture.value.clone()).map(|_| ()),
            _ => Err(()),
        }
    }

    #[test]
    fn shared_resource_contract_fixtures_are_exact_and_safe() {
        let valid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-resource-service/valid/cases.json"
        ))
        .expect("valid fixtures should parse");
        for fixture in valid {
            assert!(parse(&fixture).is_ok(), "valid fixture: {}", fixture.name);
        }
        let invalid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-resource-service/invalid/cases.json"
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
    fn every_error_code_has_one_canonical_safe_message() {
        for code in [
            PluginResourceErrorCode::InvalidRequest,
            PluginResourceErrorCode::StaleRevision,
            PluginResourceErrorCode::NotFound,
            PluginResourceErrorCode::Unavailable,
            PluginResourceErrorCode::UnsafeState,
            PluginResourceErrorCode::Internal,
        ] {
            let error = PluginResourceError::new(code);
            assert!(error.is_canonical());
            let wire = serde_json::to_string(&error).expect("error should serialize");
            for secret in ["path", "digest", "record_key", "scope", "/Users/", "stack"] {
                assert!(!wire.contains(secret));
            }
        }
    }
}
