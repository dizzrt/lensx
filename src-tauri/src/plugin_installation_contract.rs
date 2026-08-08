use crate::{
    plugin_manifest::{NormalizedLocalizedText, NormalizedPluginManifest},
    plugin_package_format::{package_diagnostic_message, PackageDiagnostic},
};
use serde::{Deserialize, Serialize};

pub const LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION: &str = "0.3.0";
pub const MAX_CANDIDATE_TEXT_BYTES: usize = 4_096;
pub const MAX_CANDIDATE_URL_BYTES: usize = 2_048;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalPluginInstallationOperation {
    Prepare,
    Commit,
    Cancel,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LocalPluginInstallationRequest {
    pub contract_version: String,
    pub preparation_token: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LocalPluginInstallationLocalizedText {
    #[serde(rename = "en-US")]
    pub en_us: String,
    #[serde(rename = "zh-CN", skip_serializing_if = "Option::is_none")]
    pub zh_cn: Option<String>,
}

impl From<&NormalizedLocalizedText> for LocalPluginInstallationLocalizedText {
    fn from(value: &NormalizedLocalizedText) -> Self {
        Self {
            en_us: value.en_us.clone(),
            zh_cn: value.zh_cn.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LocalPluginInstallationPublisher {
    pub author: String,
    pub homepage: String,
    pub repository: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LocalPluginInstallationCandidate {
    pub plugin_id: String,
    pub version: String,
    pub display_name: LocalPluginInstallationLocalizedText,
    pub publisher: LocalPluginInstallationPublisher,
}

impl LocalPluginInstallationCandidate {
    pub fn from_manifest(manifest: &NormalizedPluginManifest) -> Result<Self, ()> {
        let candidate = Self {
            plugin_id: manifest.plugin_id.clone(),
            version: manifest.version.clone(),
            display_name: (&manifest.display.name).into(),
            publisher: LocalPluginInstallationPublisher {
                author: manifest.publisher.author.clone(),
                homepage: manifest.publisher.homepage.clone(),
                repository: manifest.publisher.repository.clone(),
            },
        };
        candidate.is_valid().then_some(candidate).ok_or(())
    }

    fn is_valid(&self) -> bool {
        is_plugin_id(&self.plugin_id)
            && semver::Version::parse(&self.version).is_ok()
            && is_localized_text(&self.display_name)
            && is_bounded_text(&self.publisher.author, MAX_CANDIDATE_TEXT_BYTES)
            && is_https_url(&self.publisher.homepage)
            && is_https_url(&self.publisher.repository)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum LocalPluginInstallationResult {
    Cancelled {
        contract_version: &'static str,
        operation: LocalPluginInstallationOperation,
    },
    Prepared {
        contract_version: &'static str,
        operation: LocalPluginInstallationOperation,
        preparation_token: String,
        candidate: LocalPluginInstallationCandidate,
    },
    Installed {
        contract_version: &'static str,
        operation: LocalPluginInstallationOperation,
        plugin_id: String,
        version: String,
        revision: String,
    },
}

impl LocalPluginInstallationResult {
    pub fn cancelled(operation: LocalPluginInstallationOperation) -> Self {
        Self::Cancelled {
            contract_version: LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION,
            operation,
        }
    }

    pub fn prepared(
        preparation_token: String,
        candidate: LocalPluginInstallationCandidate,
    ) -> Self {
        Self::Prepared {
            contract_version: LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION,
            operation: LocalPluginInstallationOperation::Prepare,
            preparation_token,
            candidate,
        }
    }

    pub fn installed(plugin_id: String, version: String, revision: String) -> Self {
        Self::Installed {
            contract_version: LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION,
            operation: LocalPluginInstallationOperation::Commit,
            plugin_id,
            version,
            revision,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalPluginInstallationErrorCode {
    InvalidRequest,
    InvalidPreparation,
    InvalidPackage,
    Incompatible,
    AlreadyInstalled,
    IdentityQuarantined,
    Busy,
    Unavailable,
    SourceReadFailed,
    ExtractionFailed,
    UnsafeState,
    CommitFailed,
    RegistrationFailed,
    CleanupFailed,
    Internal,
}

impl LocalPluginInstallationErrorCode {
    pub fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "The local plugin installation request is invalid.",
            Self::InvalidPreparation => {
                "The local plugin installation preparation is no longer valid."
            }
            Self::InvalidPackage => "The selected file is not a valid lensX plugin package.",
            Self::Incompatible => {
                "The selected plugin is not compatible with this version of lensX."
            }
            Self::AlreadyInstalled => "A plugin with this identity is already installed.",
            Self::IdentityQuarantined => {
                "This plugin identity is quarantined and cannot be replaced by installation."
            }
            Self::Busy => "Another plugin installation is in progress.",
            Self::Unavailable => "Local plugin installation is unavailable.",
            Self::SourceReadFailed => "The selected plugin package could not be read.",
            Self::ExtractionFailed => "The plugin package could not be extracted safely.",
            Self::UnsafeState => "The prepared plugin package is no longer safe to install.",
            Self::CommitFailed => "The plugin package could not be committed.",
            Self::RegistrationFailed => "The plugin registration could not be saved.",
            Self::CleanupFailed => {
                "The plugin installation preparation could not be cleaned safely."
            }
            Self::Internal => "Local plugin installation failed.",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LocalPluginInstallationDiagnostic {
    pub code: String,
    pub path: String,
    pub message: String,
}

impl From<&PackageDiagnostic> for LocalPluginInstallationDiagnostic {
    fn from(value: &PackageDiagnostic) -> Self {
        Self {
            code: value.code.to_owned(),
            path: value.path.clone(),
            message: value.message.to_owned(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LocalPluginInstallationError {
    pub contract_version: String,
    pub code: LocalPluginInstallationErrorCode,
    pub operation: LocalPluginInstallationOperation,
    pub message: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<LocalPluginInstallationDiagnostic>,
}

impl LocalPluginInstallationError {
    pub fn new(
        code: LocalPluginInstallationErrorCode,
        operation: LocalPluginInstallationOperation,
    ) -> Self {
        Self {
            contract_version: LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION.to_owned(),
            code,
            operation,
            message: code.message().to_owned(),
            diagnostics: Vec::new(),
        }
    }

    pub fn with_package_diagnostics(mut self, diagnostics: &[PackageDiagnostic]) -> Self {
        self.diagnostics = diagnostics.iter().map(Into::into).collect();
        self
    }

    fn is_canonical(&self) -> bool {
        self.contract_version == LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION
            && self.message == self.code.message()
            && (self.code == LocalPluginInstallationErrorCode::InvalidPackage
                || self.diagnostics.is_empty())
            && self.diagnostics.iter().all(|diagnostic| {
                !diagnostic.code.is_empty()
                    && !diagnostic.path.is_empty()
                    && package_diagnostic_message(&diagnostic.code)
                        == Some(diagnostic.message.as_str())
                    && !diagnostic.path.contains(['\\', ':', '\0'])
                    && !diagnostic.path.contains("..")
                    && !diagnostic.path.starts_with("/Users/")
                    && !diagnostic.path.starts_with("/home/")
            })
    }
}

pub fn deserialize_local_plugin_installation_request(
    value: serde_json::Value,
) -> Result<LocalPluginInstallationRequest, ()> {
    let request: LocalPluginInstallationRequest = serde_json::from_value(value).map_err(|_| ())?;
    (request.contract_version == LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION
        && is_preparation_token(&request.preparation_token))
    .then_some(request)
    .ok_or(())
}

pub fn deserialize_local_plugin_installation_result(
    value: serde_json::Value,
) -> Result<LocalPluginInstallationResult, ()> {
    #[derive(Deserialize)]
    #[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
    enum WireResult {
        Cancelled {
            contract_version: String,
            operation: LocalPluginInstallationOperation,
        },
        Prepared {
            contract_version: String,
            operation: LocalPluginInstallationOperation,
            preparation_token: String,
            candidate: LocalPluginInstallationCandidate,
        },
        Installed {
            contract_version: String,
            operation: LocalPluginInstallationOperation,
            plugin_id: String,
            version: String,
            revision: String,
        },
    }
    match serde_json::from_value(value).map_err(|_| ())? {
        WireResult::Cancelled {
            contract_version,
            operation,
        } if contract_version == LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION
            && matches!(
                operation,
                LocalPluginInstallationOperation::Prepare
                    | LocalPluginInstallationOperation::Cancel
            ) =>
        {
            Ok(LocalPluginInstallationResult::cancelled(operation))
        }
        WireResult::Prepared {
            contract_version,
            operation: LocalPluginInstallationOperation::Prepare,
            preparation_token,
            candidate,
        } if contract_version == LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION
            && is_preparation_token(&preparation_token)
            && candidate.is_valid() =>
        {
            Ok(LocalPluginInstallationResult::prepared(
                preparation_token,
                candidate,
            ))
        }
        WireResult::Installed {
            contract_version,
            operation: LocalPluginInstallationOperation::Commit,
            plugin_id,
            version,
            revision,
        } if contract_version == LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION
            && is_plugin_id(&plugin_id)
            && semver::Version::parse(&version).is_ok()
            && is_revision(&revision) =>
        {
            Ok(LocalPluginInstallationResult::installed(
                plugin_id, version, revision,
            ))
        }
        _ => Err(()),
    }
}

pub fn deserialize_local_plugin_installation_error(
    value: serde_json::Value,
) -> Result<LocalPluginInstallationError, ()> {
    let error: LocalPluginInstallationError = serde_json::from_value(value).map_err(|_| ())?;
    error.is_canonical().then_some(error).ok_or(())
}

pub fn is_preparation_token(value: &str) -> bool {
    (32..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn is_localized_text(value: &LocalPluginInstallationLocalizedText) -> bool {
    is_bounded_text(&value.en_us, MAX_CANDIDATE_TEXT_BYTES)
        && value
            .zh_cn
            .as_ref()
            .is_none_or(|text| is_bounded_text(text, MAX_CANDIDATE_TEXT_BYTES))
}

fn is_bounded_text(value: &str, max_bytes: usize) -> bool {
    !value.is_empty() && value.len() <= max_bytes && !value.chars().any(char::is_control)
}

fn is_https_url(value: &str) -> bool {
    value.len() <= MAX_CANDIDATE_URL_BYTES
        && url::Url::parse(value).is_ok_and(|url| url.scheme() == "https")
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

fn is_revision(value: &str) -> bool {
    value == "0"
        || (value
            .bytes()
            .next()
            .is_some_and(|byte| matches!(byte, b'1'..=b'9'))
            && value.bytes().all(|byte| byte.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::Value;

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        #[serde(rename = "type")]
        payload_type: String,
        value: Value,
    }

    fn parse(payload_type: &str, value: Value) -> Result<(), ()> {
        match payload_type {
            "request" => deserialize_local_plugin_installation_request(value).map(|_| ()),
            "result" => deserialize_local_plugin_installation_result(value).map(|_| ()),
            "error" => deserialize_local_plugin_installation_error(value).map(|_| ()),
            _ => Err(()),
        }
    }

    #[test]
    fn shared_contract_fixtures_are_strict_and_safe() {
        let valid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-local-installation/valid/cases.json"
        ))
        .expect("valid fixtures should parse");
        for fixture in valid {
            assert!(
                parse(&fixture.payload_type, fixture.value).is_ok(),
                "valid fixture should parse: {}",
                fixture.name
            );
        }
        let invalid: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../fixtures/plugin-local-installation/invalid/cases.json"
        ))
        .expect("invalid fixtures should parse");
        for fixture in invalid {
            assert!(
                parse(&fixture.payload_type, fixture.value).is_err(),
                "invalid fixture should be rejected: {}",
                fixture.name
            );
        }
    }

    #[test]
    fn serialized_contract_never_contains_private_installation_facts() {
        let candidate = LocalPluginInstallationCandidate {
            plugin_id: "com.acme.plugin".to_owned(),
            version: "1.2.3".to_owned(),
            display_name: LocalPluginInstallationLocalizedText {
                en_us: "Plugin".to_owned(),
                zh_cn: None,
            },
            publisher: LocalPluginInstallationPublisher {
                author: "Acme".to_owned(),
                homepage: "https://example.com".to_owned(),
                repository: "https://example.com/repo".to_owned(),
            },
        };
        let serialized = serde_json::to_string(&LocalPluginInstallationResult::prepared(
            "a".repeat(32),
            candidate,
        ))
        .expect("result should serialize");
        for forbidden in [
            "path",
            "digest",
            "package_bytes",
            "staging",
            "manifest",
            "grant",
            "raw_error",
            "stack",
            "host_object",
        ] {
            assert!(
                !serialized.contains(forbidden),
                "forbidden field leaked: {forbidden}"
            );
        }
    }
}
