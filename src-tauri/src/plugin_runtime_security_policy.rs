//! Host-owned Content Security Policy profiles for the application document and
//! external plugin Runtime documents. These values are process-private policy;
//! they are never derived from a Manifest, request, registration, or plugin
//! message.

#[allow(dead_code)] // tauri.conf.json is the production consumer; the drift test keeps this profile identical.
pub(crate) const HOST_DOCUMENT_CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' ipc: http://ipc.localhost; frame-src lensx-plugin:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

pub(crate) const PLUGIN_RUNTIME_DOCUMENT_CSP: &str = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; media-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors tauri://localhost";

// The real macOS harness uses a dedicated Host scheme so it cannot accidentally
// inherit production Tauri privileges. It receives an otherwise identical
// profile with only the exact ancestor substituted.
pub(crate) const PLUGIN_RUNTIME_HARNESS_DOCUMENT_CSP: &str = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; media-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors lensx-runtime-harness://localhost";

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
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.starts_with("default-src 'none'"));
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.contains("connect-src 'none'"));
        assert!(PLUGIN_RUNTIME_DOCUMENT_CSP.contains("frame-ancestors tauri://localhost"));
    }

    #[test]
    fn harness_profile_changes_only_the_exact_host_ancestor() {
        assert_bounded(PLUGIN_RUNTIME_HARNESS_DOCUMENT_CSP);
        assert_eq!(
            PLUGIN_RUNTIME_DOCUMENT_CSP.replace(
                "frame-ancestors tauri://localhost",
                "frame-ancestors lensx-runtime-harness://localhost"
            ),
            PLUGIN_RUNTIME_HARNESS_DOCUMENT_CSP
        );
    }

    #[test]
    fn production_tauri_config_uses_the_exact_host_profile() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("Tauri config should be valid JSON");
        assert_eq!(config["app"]["security"]["csp"], HOST_DOCUMENT_CSP);
        let harness: serde_json::Value =
            serde_json::from_str(include_str!("../plugin-runtime-host-csp-harness.conf.json"))
                .expect("Host CSP harness config should be valid JSON");
        assert_eq!(harness["app"]["security"]["csp"], HOST_DOCUMENT_CSP);
    }
}
