use url::Url;

const MAX_TARGET_BYTES: usize = 2048;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NavigationFrame {
    Main,
    Descendant,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NavigationAllow {
    MainApp,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NavigationDiagnosticCode {
    UnknownFrame,
    InvalidTarget,
    TargetMismatch,
    CallbackFailure,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NavigationOperation {
    Navigate,
    Activate,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct NavigationDiagnostic {
    pub(crate) code: NavigationDiagnosticCode,
    pub(crate) frame: NavigationFrame,
    pub(crate) operation: NavigationOperation,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NavigationDecision {
    Allow(NavigationAllow),
    Deny(NavigationDiagnostic),
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AppDocumentTarget {
    scheme: String,
    host: String,
    port: Option<u16>,
    path: String,
}

pub(crate) struct FrameAwareNavigationPolicy {
    app_target: AppDocumentTarget,
}

impl FrameAwareNavigationPolicy {
    pub(crate) fn new(app_target: &str) -> Result<Self, NavigationDiagnostic> {
        let app_target = normalize_app_document(app_target).ok_or_else(|| {
            diagnostic(
                NavigationDiagnosticCode::InvalidTarget,
                NavigationFrame::Main,
                NavigationOperation::Activate,
            )
        })?;
        Ok(Self { app_target })
    }

    pub(crate) fn decide(&self, frame: NavigationFrame, target: &str) -> NavigationDecision {
        match frame {
            NavigationFrame::Unknown => deny(
                NavigationDiagnosticCode::UnknownFrame,
                frame,
                NavigationOperation::Navigate,
            ),
            NavigationFrame::Descendant => deny(
                NavigationDiagnosticCode::InvalidTarget,
                frame,
                NavigationOperation::Navigate,
            ),
            NavigationFrame::Main => match normalize_app_document(target) {
                Some(target) if target == self.app_target => {
                    NavigationDecision::Allow(NavigationAllow::MainApp)
                }
                Some(_) => deny(
                    NavigationDiagnosticCode::TargetMismatch,
                    frame,
                    NavigationOperation::Navigate,
                ),
                None => deny(
                    NavigationDiagnosticCode::InvalidTarget,
                    frame,
                    NavigationOperation::Navigate,
                ),
            },
        }
    }

    #[allow(dead_code)]
    pub(crate) fn callback_failure(&self, frame: NavigationFrame) -> NavigationDecision {
        deny(
            NavigationDiagnosticCode::CallbackFailure,
            frame,
            NavigationOperation::Navigate,
        )
    }
}

fn diagnostic(
    code: NavigationDiagnosticCode,
    frame: NavigationFrame,
    operation: NavigationOperation,
) -> NavigationDiagnostic {
    NavigationDiagnostic {
        code,
        frame,
        operation,
    }
}

fn deny(
    code: NavigationDiagnosticCode,
    frame: NavigationFrame,
    operation: NavigationOperation,
) -> NavigationDecision {
    NavigationDecision::Deny(diagnostic(code, frame, operation))
}

fn parse_unambiguous_url(raw: &str) -> Option<Url> {
    if raw.is_empty()
        || raw.len() > MAX_TARGET_BYTES
        || !raw.is_ascii()
        || raw.contains(['\\', '%', '\0'])
        || raw.bytes().any(|byte| byte.is_ascii_control())
    {
        return None;
    }
    let url = Url::parse(raw).ok()?;
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() {
        return None;
    }
    let scheme = raw.split_once(':')?.0;
    if scheme.is_empty()
        || !scheme.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'+' | b'-' | b'.')
        })
    {
        return None;
    }
    Some(url)
}

fn normalize_app_document(raw: &str) -> Option<AppDocumentTarget> {
    let url = parse_unambiguous_url(raw)?;
    if url.fragment().is_some()
        || matches!(
            url.scheme(),
            "lensx-plugin" | "file" | "javascript" | "data" | "blob"
        )
    {
        return None;
    }
    let host = url.host_str()?.to_owned();
    if host.is_empty() || host.bytes().any(|byte| byte.is_ascii_uppercase()) {
        return None;
    }
    if url.scheme() == "tauri" && (host != "localhost" || url.port().is_some()) {
        return None;
    }
    if !matches!(url.scheme(), "http" | "https") && url.port().is_some() {
        return None;
    }
    Some(AppDocumentTarget {
        scheme: url.scheme().to_owned(),
        host,
        port: url.port(),
        path: if url.path().is_empty() {
            "/".to_owned()
        } else {
            url.path().to_owned()
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const APP_PROD: &str = "tauri://localhost/";
    const APP_DEV: &str = "http://localhost:40755/";
    const PLUGIN: &str = "lensx-plugin://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/v1-a1/1.0.0/index.html";

    fn policy() -> FrameAwareNavigationPolicy {
        FrameAwareNavigationPolicy::new(APP_PROD).expect("app target should be valid")
    }

    fn denied_code(decision: NavigationDecision) -> NavigationDiagnosticCode {
        match decision {
            NavigationDecision::Deny(diagnostic) => diagnostic.code,
            NavigationDecision::Allow(allow) => panic!("expected deny, got {allow:?}"),
        }
    }

    #[test]
    fn production_tauri_root_with_or_without_serialized_slash_is_the_same_main_target() {
        let policy = policy();
        for target in ["tauri://localhost", "tauri://localhost/"] {
            assert_eq!(
                policy.decide(NavigationFrame::Main, target),
                NavigationDecision::Allow(NavigationAllow::MainApp)
            );
        }
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Main, "tauri://localhost/index.html")),
            NavigationDiagnosticCode::TargetMismatch
        );
    }

    #[test]
    fn exact_dev_app_target_includes_its_trusted_port_and_path() {
        let policy = FrameAwareNavigationPolicy::new(APP_DEV).expect("dev target should be valid");
        assert_eq!(
            policy.decide(NavigationFrame::Main, APP_DEV),
            NavigationDecision::Allow(NavigationAllow::MainApp)
        );
        for invalid in [
            "http://localhost/",
            "http://localhost:40756/",
            "http://localhost:40755/settings",
            "http://localhost:40755/?route=settings",
        ] {
            assert!(matches!(
                policy.decide(NavigationFrame::Main, invalid),
                NavigationDecision::Deny(_)
            ));
        }
    }

    #[test]
    fn every_descendant_document_is_rejected_without_an_exception() {
        let policy = policy();
        for target in [
            APP_PROD,
            PLUGIN,
            "https://example.invalid/",
            "file:///tmp/index.html",
            "data:text/html,denied",
        ] {
            assert_eq!(
                denied_code(policy.decide(NavigationFrame::Descendant, target)),
                NavigationDiagnosticCode::InvalidTarget,
                "descendant target should be rejected: {target}"
            );
        }
    }

    #[test]
    fn plugin_document_is_never_a_host_main_document() {
        assert_eq!(
            denied_code(policy().decide(NavigationFrame::Main, PLUGIN)),
            NavigationDiagnosticCode::InvalidTarget
        );
    }

    #[test]
    fn unknown_frame_fails_closed() {
        assert_eq!(
            denied_code(policy().decide(NavigationFrame::Unknown, APP_PROD)),
            NavigationDiagnosticCode::UnknownFrame
        );
    }

    #[test]
    fn ambiguous_app_targets_fail_closed() {
        let policy = policy();
        for target in [
            "tauri://localhost/?query=1",
            "tauri://user@localhost/",
            "tauri://localhost/%2e",
            "TAURI://localhost/",
            "tauri://LOCALHOST/",
            "file:///tmp/index.html",
            "javascript:void(0)",
            "data:text/html,denied",
            "blob:https://localhost/id",
        ] {
            assert_eq!(
                denied_code(policy.decide(NavigationFrame::Main, target)),
                NavigationDiagnosticCode::InvalidTarget,
                "target should be invalid: {target}"
            );
        }
    }

    #[test]
    fn callback_failure_is_explicit_and_closed() {
        assert_eq!(
            denied_code(policy().callback_failure(NavigationFrame::Main)),
            NavigationDiagnosticCode::CallbackFailure
        );
    }
}
