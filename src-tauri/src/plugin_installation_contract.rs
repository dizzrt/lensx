use crate::plugin_package_format::{package_diagnostic_message, PackageDiagnostic};
use serde::{Deserialize, Serialize};

pub const LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION: &str = "0.1.0";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum LocalPluginInstallationResult {
    Cancelled {
        contract_version: &'static str,
    },
    Installed {
        contract_version: &'static str,
        plugin_id: String,
        version: String,
        revision: String,
    },
}

impl LocalPluginInstallationResult {
    pub fn cancelled() -> Self {
        Self::Cancelled {
            contract_version: LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION,
        }
    }

    pub fn installed(plugin_id: String, version: String, revision: String) -> Self {
        Self::Installed {
            contract_version: LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION,
            plugin_id,
            version,
            revision,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalPluginInstallationErrorCode {
    InvalidPackage,
    Incompatible,
    AlreadyInstalled,
    IdentityQuarantined,
    Busy,
    Unavailable,
    SourceReadFailed,
    ExtractionFailed,
    CommitFailed,
    RegistrationFailed,
    Internal,
}

impl LocalPluginInstallationErrorCode {
    pub fn message(self) -> &'static str {
        match self {
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
            Self::CommitFailed => "The plugin package could not be committed.",
            Self::RegistrationFailed => "The plugin registration could not be saved.",
            Self::Internal => "Local plugin installation failed.",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalPluginInstallationOperation {
    Select,
    Read,
    Inspect,
    Extract,
    Commit,
    Register,
    Recover,
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

pub fn deserialize_local_plugin_installation_result(
    value: serde_json::Value,
) -> Result<LocalPluginInstallationResult, ()> {
    #[derive(Deserialize)]
    #[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
    enum WireResult {
        Cancelled {
            contract_version: String,
        },
        Installed {
            contract_version: String,
            plugin_id: String,
            version: String,
            revision: String,
        },
    }

    let wire: WireResult = serde_json::from_value(value).map_err(|_| ())?;
    match wire {
        WireResult::Cancelled { contract_version }
            if contract_version == LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION =>
        {
            Ok(LocalPluginInstallationResult::cancelled())
        }
        WireResult::Installed {
            contract_version,
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
        let serialized = serde_json::to_string(&LocalPluginInstallationResult::installed(
            "com.acme.plugin".to_owned(),
            "1.2.3".to_owned(),
            "7".to_owned(),
        ))
        .expect("result should serialize");
        for forbidden in ["path", "digest", "manifest", "grant", "stack"] {
            assert!(!serialized.contains(forbidden));
        }
    }
}
