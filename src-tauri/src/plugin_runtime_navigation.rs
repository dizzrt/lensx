use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use crate::frame_aware_navigation_policy::{ActivePluginTargetLease, FrameAwareNavigationPolicy};
#[cfg(target_os = "macos")]
use std::sync::Arc;
#[cfg(target_os = "macos")]
use tauri::State;

const CONTRACT_VERSION: &str = "0.1.0";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivatePluginRuntimeNavigationRequest {
    contract_version: String,
    entry_url: String,
    host_fragment: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DisposePluginRuntimeNavigationRequest {
    contract_version: String,
    lease_id: String,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ActivatePluginRuntimeNavigationResponse {
    contract_version: &'static str,
    lease_id: String,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DisposePluginRuntimeNavigationResponse {
    contract_version: &'static str,
    disposed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginRuntimeNavigationErrorCode {
    InvalidRequest,
    #[cfg(not(target_os = "macos"))]
    Unavailable,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRuntimeNavigationError {
    contract_version: &'static str,
    code: PluginRuntimeNavigationErrorCode,
    message: &'static str,
}

impl PluginRuntimeNavigationError {
    fn new(code: PluginRuntimeNavigationErrorCode) -> Self {
        Self {
            contract_version: CONTRACT_VERSION,
            code,
            message: match code {
                PluginRuntimeNavigationErrorCode::InvalidRequest => {
                    "Plugin Runtime navigation request is invalid."
                }
                #[cfg(not(target_os = "macos"))]
                PluginRuntimeNavigationErrorCode::Unavailable => {
                    "Plugin Runtime navigation is unavailable."
                }
            },
        }
    }
}

fn valid_activate_request(request: &ActivatePluginRuntimeNavigationRequest) -> bool {
    request.contract_version == CONTRACT_VERSION
        && !request.entry_url.is_empty()
        && request.entry_url.len() <= 2048
        && !request.host_fragment.is_empty()
        && request.host_fragment.len() <= 512
}

fn valid_dispose_request(request: &DisposePluginRuntimeNavigationRequest) -> bool {
    request.contract_version == CONTRACT_VERSION
        && request.lease_id.len() == 16
        && request
            .lease_id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

#[cfg(target_os = "macos")]
fn activate_with_policy(
    policy: &FrameAwareNavigationPolicy,
    request: ActivatePluginRuntimeNavigationRequest,
) -> Result<ActivatePluginRuntimeNavigationResponse, PluginRuntimeNavigationError> {
    if !valid_activate_request(&request) {
        return Err(PluginRuntimeNavigationError::new(
            PluginRuntimeNavigationErrorCode::InvalidRequest,
        ));
    }
    let lease = policy
        .activate_plugin_target(&request.entry_url, Some(&request.host_fragment))
        .map_err(|_| {
            PluginRuntimeNavigationError::new(PluginRuntimeNavigationErrorCode::InvalidRequest)
        })?;
    Ok(ActivatePluginRuntimeNavigationResponse {
        contract_version: CONTRACT_VERSION,
        lease_id: lease.opaque_id(),
    })
}

#[cfg(target_os = "macos")]
fn dispose_with_policy(
    policy: &FrameAwareNavigationPolicy,
    request: DisposePluginRuntimeNavigationRequest,
) -> Result<DisposePluginRuntimeNavigationResponse, PluginRuntimeNavigationError> {
    if !valid_dispose_request(&request) {
        return Err(PluginRuntimeNavigationError::new(
            PluginRuntimeNavigationErrorCode::InvalidRequest,
        ));
    }
    let lease = ActivePluginTargetLease::from_opaque_id(&request.lease_id).ok_or_else(|| {
        PluginRuntimeNavigationError::new(PluginRuntimeNavigationErrorCode::InvalidRequest)
    })?;
    Ok(DisposePluginRuntimeNavigationResponse {
        contract_version: CONTRACT_VERSION,
        disposed: policy.dispose_plugin_target(lease),
    })
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn activate_plugin_runtime_navigation(
    policy: State<'_, Arc<FrameAwareNavigationPolicy>>,
    request: ActivatePluginRuntimeNavigationRequest,
) -> Result<ActivatePluginRuntimeNavigationResponse, PluginRuntimeNavigationError> {
    activate_with_policy(&policy, request)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn activate_plugin_runtime_navigation(
    request: ActivatePluginRuntimeNavigationRequest,
) -> Result<ActivatePluginRuntimeNavigationResponse, PluginRuntimeNavigationError> {
    if !valid_activate_request(&request) {
        return Err(PluginRuntimeNavigationError::new(
            PluginRuntimeNavigationErrorCode::InvalidRequest,
        ));
    }
    Err(PluginRuntimeNavigationError::new(
        PluginRuntimeNavigationErrorCode::Unavailable,
    ))
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn dispose_plugin_runtime_navigation(
    policy: State<'_, Arc<FrameAwareNavigationPolicy>>,
    request: DisposePluginRuntimeNavigationRequest,
) -> Result<DisposePluginRuntimeNavigationResponse, PluginRuntimeNavigationError> {
    dispose_with_policy(&policy, request)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn dispose_plugin_runtime_navigation(
    request: DisposePluginRuntimeNavigationRequest,
) -> Result<DisposePluginRuntimeNavigationResponse, PluginRuntimeNavigationError> {
    if !valid_dispose_request(&request) {
        return Err(PluginRuntimeNavigationError::new(
            PluginRuntimeNavigationErrorCode::InvalidRequest,
        ));
    }
    Err(PluginRuntimeNavigationError::new(
        PluginRuntimeNavigationErrorCode::Unavailable,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    const ENTRY_A: &str = "lensx-plugin://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/v1-a1/1.0.0/index.html";
    #[cfg(target_os = "macos")]
    const ENTRY_B: &str = "lensx-plugin://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.runtime.localhost/v1/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/v1-b2/2.0.0/index.html";

    #[cfg(target_os = "macos")]
    fn activate(entry_url: &str, fragment: &str) -> ActivatePluginRuntimeNavigationRequest {
        ActivatePluginRuntimeNavigationRequest {
            contract_version: CONTRACT_VERSION.to_owned(),
            entry_url: entry_url.to_owned(),
            host_fragment: fragment.to_owned(),
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn activation_precedes_navigation_and_current_disposal_is_compare_current() {
        use crate::frame_aware_navigation_policy::{
            NavigationAllow, NavigationDecision, NavigationFrame,
        };
        let policy =
            FrameAwareNavigationPolicy::new("tauri://localhost/").expect("valid App target");
        let first = activate_with_policy(&policy, activate(ENTRY_A, "/home")).expect("activate A");
        assert_eq!(
            policy.decide(NavigationFrame::Descendant, &format!("{ENTRY_A}#/home")),
            NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
        );
        let second =
            activate_with_policy(&policy, activate(ENTRY_B, "/settings")).expect("activate B");
        let late = dispose_with_policy(
            &policy,
            DisposePluginRuntimeNavigationRequest {
                contract_version: CONTRACT_VERSION.to_owned(),
                lease_id: first.lease_id,
            },
        )
        .expect("late dispose is bounded");
        assert!(!late.disposed);
        let current = dispose_with_policy(
            &policy,
            DisposePluginRuntimeNavigationRequest {
                contract_version: CONTRACT_VERSION.to_owned(),
                lease_id: second.lease_id,
            },
        )
        .expect("current dispose succeeds");
        assert!(current.disposed);
    }

    #[test]
    fn request_validation_and_errors_are_exact_and_bounded() {
        let invalid = ActivatePluginRuntimeNavigationRequest {
            contract_version: "1.0.0".to_owned(),
            entry_url: "file:///private/plugin.html".to_owned(),
            host_fragment: "/home".to_owned(),
        };
        assert!(!valid_activate_request(&invalid));
        let wire = serde_json::to_string(&PluginRuntimeNavigationError::new(
            PluginRuntimeNavigationErrorCode::InvalidRequest,
        ))
        .expect("error serializes");
        for forbidden in ["entry_url", "lease_id", "scope", "/private/"] {
            assert!(!wire.contains(forbidden));
        }
    }
}
