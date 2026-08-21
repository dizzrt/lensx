//! Host-owned Content Security Policy profiles for the application document and
//! external plugin Runtime documents. These values are process-private policy;
//! they are never derived from a Manifest, request, registration, or plugin
//! message.

use crate::trusted_app_target::TrustedAppTarget;
use std::sync::Arc;

#[allow(dead_code)] // tauri.conf.json is the production consumer; the drift test keeps this profile identical.
pub(crate) const HOST_DOCUMENT_CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' ipc: http://ipc.localhost; frame-src lensx-plugin:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

pub(crate) const PLUGIN_RUNTIME_DOCUMENT_CSP: &str = "default-src 'self' https: data: blob:; script-src 'self' https: data: blob: 'wasm-unsafe-eval'; style-src 'self' https: data: blob: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https: wss:; media-src 'self' https: data: blob:; worker-src 'self' https: data: blob:; child-src 'self' https: data: blob:; frame-src 'self' https: data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors tauri://localhost";

const PRODUCTION_FRAME_ANCESTOR: &str = "frame-ancestors tauri://localhost";

pub(crate) fn current_plugin_runtime_document_csp(app_target: &TrustedAppTarget) -> Arc<str> {
    if !app_target.is_development() {
        return Arc::from(PLUGIN_RUNTIME_DOCUMENT_CSP);
    }
    debug_assert_eq!(
        PLUGIN_RUNTIME_DOCUMENT_CSP
            .matches(PRODUCTION_FRAME_ANCESTOR)
            .count(),
        1
    );
    Arc::from(PLUGIN_RUNTIME_DOCUMENT_CSP.replacen(
        PRODUCTION_FRAME_ANCESTOR,
        &format!("frame-ancestors {}", app_target.csp_ancestor()),
        1,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_bounded(policy: &str) {
        assert!(!policy.is_empty());
        assert!(!policy.contains('*'));
        assert!(!policy.contains("script-src 'unsafe-inline'"));
        assert!(!policy.contains("script-src 'unsafe-eval'"));
        assert!(!policy.contains("http://example"));
        assert!(!policy.contains("https://example"));
        for directive in ["object-src 'none'", "base-uri 'none'", "form-action 'none'"] {
            assert!(policy.contains(directive), "missing {directive}");
        }
    }

    #[test]
    fn host_and_plugin_profiles_are_distinct_and_bounded() {
        assert_bounded(HOST_DOCUMENT_CSP);
        assert_bounded(PLUGIN_RUNTIME_DOCUMENT_CSP);
        assert_ne!(HOST_DOCUMENT_CSP, PLUGIN_RUNTIME_DOCUMENT_CSP);
        assert!(HOST_DOCUMENT_CSP.starts_with("default-src 'self'"));
        assert!(HOST_DOCUMENT_CSP.contains("frame-src lensx-plugin:"));
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.starts_with("default-src 'self' https: data: blob:"));
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.contains("connect-src 'self' https: wss:"));
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.contains("worker-src 'self' https: data: blob:"));
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.contains("'wasm-unsafe-eval'"));
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.contains("frame-ancestors tauri://localhost"));
    }

    #[test]
    fn development_profile_changes_only_the_exact_trusted_host_ancestor() {
        for port in [40755, 40756, 43123] {
            let origin = format!("http://localhost:{port}/");
            let target = TrustedAppTarget::development(&origin).expect("target should be valid");
            let policy = current_plugin_runtime_document_csp(&target);
            assert_bounded(&policy);
            assert_eq!(
                PLUGIN_RUNTIME_DOCUMENT_CSP.replace(
                    PRODUCTION_FRAME_ANCESTOR,
                    &format!("frame-ancestors http://localhost:{port}")
                ),
                policy.as_ref()
            );
            assert_eq!(
                policy
                    .strip_suffix(&format!("frame-ancestors http://localhost:{port}"))
                    .expect("development ancestor should be the final directive"),
                PLUGIN_RUNTIME_DOCUMENT_CSP
                    .strip_suffix(PRODUCTION_FRAME_ANCESTOR)
                    .expect("production ancestor should be the final directive")
            );
        }
    }

    #[test]
    fn production_tauri_config_uses_the_exact_host_profile() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("Tauri config should be valid JSON");
        assert_eq!(config["app"]["security"]["csp"], HOST_DOCUMENT_CSP);
        assert_eq!(
            current_plugin_runtime_document_csp(&TrustedAppTarget::production()).as_ref(),
            PLUGIN_RUNTIME_DOCUMENT_CSP
        );
    }
}
