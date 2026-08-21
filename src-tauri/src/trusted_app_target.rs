use std::io;
use url::Url;

const PRODUCTION_DOCUMENT_URL: &str = "tauri://localhost/";
const PRODUCTION_CSP_ANCESTOR: &str = "tauri://localhost";
const MAX_TARGET_BYTES: usize = 128;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct TrustedAppTarget {
    document_url: String,
    csp_ancestor: String,
    development: bool,
}

impl TrustedAppTarget {
    pub(crate) fn from_runtime_config(dev_url: Option<&str>) -> Result<Self, io::Error> {
        if cfg!(dev) {
            Self::development(
                dev_url.ok_or_else(|| io::Error::other("development App target is unavailable"))?,
            )
        } else {
            Ok(Self::production())
        }
    }

    pub(crate) fn development(raw: &str) -> Result<Self, io::Error> {
        if raw.is_empty()
            || raw.len() > MAX_TARGET_BYTES
            || !raw.is_ascii()
            || raw.contains(['\\', '%', '\0'])
            || raw.bytes().any(|byte| byte.is_ascii_control())
        {
            return Err(io::Error::other("development App target is invalid"));
        }
        let parsed =
            Url::parse(raw).map_err(|_| io::Error::other("development App target is invalid"))?;
        let port = parsed
            .port()
            .filter(|port| *port > 0)
            .ok_or_else(|| io::Error::other("development App target is invalid"))?;
        let canonical = format!("http://localhost:{port}/");
        if parsed.scheme() != "http"
            || parsed.host_str() != Some("localhost")
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.path() != "/"
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || raw != canonical
            || parsed.as_str() != canonical
        {
            return Err(io::Error::other("development App target is invalid"));
        }
        Ok(Self {
            document_url: canonical.clone(),
            csp_ancestor: canonical.trim_end_matches('/').to_owned(),
            development: true,
        })
    }

    pub(crate) fn production() -> Self {
        Self {
            document_url: PRODUCTION_DOCUMENT_URL.to_owned(),
            csp_ancestor: PRODUCTION_CSP_ANCESTOR.to_owned(),
            development: false,
        }
    }

    pub(crate) fn document_url(&self) -> &str {
        &self.document_url
    }

    pub(crate) fn csp_ancestor(&self) -> &str {
        &self.csp_ancestor
    }

    pub(crate) fn is_development(&self) -> bool {
        self.development
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        frame_aware_navigation_policy::{
            FrameAwareNavigationPolicy, NavigationAllow, NavigationDecision, NavigationFrame,
        },
        plugin_runtime_security_policy::current_plugin_runtime_document_csp,
    };

    #[test]
    fn accepts_multiple_exact_dynamic_loopback_targets() {
        for port in [40755, 40756, 43123, 65535] {
            let raw = format!("http://localhost:{port}/");
            let target = TrustedAppTarget::development(&raw).expect("target should be valid");
            assert_eq!(target.document_url(), raw);
            assert_eq!(target.csp_ancestor(), raw.trim_end_matches('/'));
            assert!(target.is_development());
        }
    }

    #[test]
    fn rejects_missing_or_noncanonical_development_targets() {
        for raw in [
            "",
            "http://localhost/",
            "http://localhost:0/",
            "http://localhost:65536/",
            "http://localhost:40755",
            "HTTP://localhost:40755/",
            "http://LOCALHOST:40755/",
            "http://127.0.0.1:40755/",
            "https://localhost:40755/",
            "http://user@localhost:40755/",
            "http://localhost:40755/path",
            "http://localhost:40755/?query=1",
            "http://localhost:40755/#fragment",
            "http://localhost:080/",
            "http://localhost:40755/%2e",
        ] {
            assert!(
                TrustedAppTarget::development(raw).is_err(),
                "target must fail closed: {raw}"
            );
        }
    }

    #[test]
    fn production_target_is_static_and_not_development_authority() {
        let target = TrustedAppTarget::production();
        assert_eq!(target.document_url(), PRODUCTION_DOCUMENT_URL);
        assert_eq!(target.csp_ancestor(), PRODUCTION_CSP_ANCESTOR);
        assert!(!target.is_development());
        assert!(!include_str!("lib.rs").contains("TcpListener"));
        assert!(!include_str!("lib.rs").contains("startDevServer"));
    }

    #[test]
    fn navigation_and_plugin_csp_consume_the_same_trusted_target() {
        for port in [40755, 40756, 43123] {
            let raw = format!("http://localhost:{port}/");
            let target = TrustedAppTarget::development(&raw).expect("target should be valid");
            let policy = FrameAwareNavigationPolicy::new(target.document_url())
                .expect("navigation target should be valid");
            assert_eq!(
                policy.decide(NavigationFrame::Main, target.document_url()),
                NavigationDecision::Allow(NavigationAllow::MainApp)
            );
            let csp = current_plugin_runtime_document_csp(&target);
            assert!(csp.ends_with(&format!("frame-ancestors {}", target.csp_ancestor())));
        }
    }
}
