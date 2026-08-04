use std::sync::Mutex;
use url::Url;

use crate::plugin_resource_url::parse_plugin_resource_url;

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
    ActivePluginDocument,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NavigationDiagnosticCode {
    UnknownFrame,
    InvalidTarget,
    MissingActiveTarget,
    TargetMismatch,
    CallbackFailure,
    StateUnavailable,
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

#[derive(Clone, Debug, Eq, PartialEq)]
struct PluginDocumentTarget {
    origin_scope: String,
    path_scope: String,
    plugin_key: String,
    version: String,
    resource_path: String,
    fragment: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ActivePluginTargetLease {
    epoch: u64,
}

impl ActivePluginTargetLease {
    #[allow(dead_code)] // Standalone WebView examples compile this policy without the production Runtime adapter.
    pub(crate) fn opaque_id(self) -> String {
        format!("{:016x}", self.epoch)
    }

    #[allow(dead_code)] // Standalone WebView examples compile this policy without the production Runtime adapter.
    pub(crate) fn from_opaque_id(value: &str) -> Option<Self> {
        (value.len() == 16)
            .then(|| u64::from_str_radix(value, 16).ok())
            .flatten()
            .map(|epoch| Self { epoch })
    }
}

#[derive(Default)]
struct ActiveTargetState {
    epoch: u64,
    target: Option<PluginDocumentTarget>,
}

pub(crate) struct FrameAwareNavigationPolicy {
    app_target: AppDocumentTarget,
    active: Mutex<ActiveTargetState>,
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
        Ok(Self {
            app_target,
            active: Mutex::new(ActiveTargetState::default()),
        })
    }

    pub(crate) fn decide(&self, frame: NavigationFrame, target: &str) -> NavigationDecision {
        if frame == NavigationFrame::Unknown {
            return deny(
                NavigationDiagnosticCode::UnknownFrame,
                frame,
                NavigationOperation::Navigate,
            );
        }
        match frame {
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
            NavigationFrame::Descendant => {
                let Some(target) = normalize_plugin_document(target) else {
                    return deny(
                        NavigationDiagnosticCode::InvalidTarget,
                        frame,
                        NavigationOperation::Navigate,
                    );
                };
                let active = self
                    .active
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                match &active.target {
                    Some(current) if current == &target => {
                        NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
                    }
                    Some(_) => deny(
                        NavigationDiagnosticCode::TargetMismatch,
                        frame,
                        NavigationOperation::Navigate,
                    ),
                    None => deny(
                        NavigationDiagnosticCode::MissingActiveTarget,
                        frame,
                        NavigationOperation::Navigate,
                    ),
                }
            }
            NavigationFrame::Unknown => unreachable!("unknown frames are rejected above"),
        }
    }

    #[allow(dead_code)] // Exercised by the native-failure contract before a Runtime consumer exists.
    pub(crate) fn callback_failure(&self, frame: NavigationFrame) -> NavigationDecision {
        deny(
            NavigationDiagnosticCode::CallbackFailure,
            frame,
            NavigationOperation::Navigate,
        )
    }

    pub(crate) fn activate_plugin_target(
        &self,
        entry_url: &str,
        host_fragment: Option<&str>,
    ) -> Result<ActivePluginTargetLease, NavigationDiagnostic> {
        let target = normalize_active_plugin_target(entry_url, host_fragment).ok_or_else(|| {
            diagnostic(
                NavigationDiagnosticCode::InvalidTarget,
                NavigationFrame::Descendant,
                NavigationOperation::Activate,
            )
        })?;
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let next_epoch = active.epoch.checked_add(1).ok_or_else(|| {
            diagnostic(
                NavigationDiagnosticCode::StateUnavailable,
                NavigationFrame::Descendant,
                NavigationOperation::Activate,
            )
        })?;
        active.epoch = next_epoch;
        active.target = Some(target);
        Ok(ActivePluginTargetLease { epoch: next_epoch })
    }

    #[allow(dead_code)] // Some standalone harnesses validate navigation without disposal wiring.
    pub(crate) fn dispose_plugin_target(&self, lease: ActivePluginTargetLease) -> bool {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if active.target.is_some() && active.epoch == lease.epoch {
            active.target = None;
            true
        } else {
            false
        }
    }

    #[cfg(test)]
    fn is_idle(&self) -> bool {
        self.active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .target
            .is_none()
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
        path: url.path().to_owned(),
    })
}

fn normalize_plugin_document(raw: &str) -> Option<PluginDocumentTarget> {
    let parsed = parse_plugin_resource_url(raw, true)?;
    let fragment = parsed.fragment;
    if fragment.as_deref().is_some_and(invalid_fragment) {
        return None;
    }
    Some(PluginDocumentTarget {
        origin_scope: parsed.origin_scope,
        path_scope: parsed.path_scope,
        plugin_key: parsed.plugin_key,
        version: parsed.version,
        resource_path: parsed.resource_path,
        fragment,
    })
}

fn normalize_active_plugin_target(
    entry_url: &str,
    host_fragment: Option<&str>,
) -> Option<PluginDocumentTarget> {
    let mut target = normalize_plugin_document(entry_url)?;
    if target.fragment.is_some() || host_fragment.is_some_and(invalid_fragment) {
        return None;
    }
    target.fragment = host_fragment.map(str::to_owned);
    Some(target)
}

fn invalid_fragment(fragment: &str) -> bool {
    fragment.is_empty()
        || fragment.len() > 512
        || !fragment.is_ascii()
        || fragment.contains(['#', '\\', '%', '\0'])
        || fragment.bytes().any(|byte| byte.is_ascii_control())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    const APP_PROD: &str = "tauri://localhost/";
    const APP_DEV: &str = "http://localhost:40755/";
    const ENTRY_A: &str =
        "lensx-plugin://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/v1-a1/1.0.0/index.html";
    const ENTRY_A_TRANSLATED: &str =
        "https://lensx-plugin.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/v1-a1/1.0.0/index.html";
    const ENTRY_B: &str =
        "lensx-plugin://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.runtime.localhost/v1/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/v1-b2/2.0.0/index.html";

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
    fn main_and_descendant_allowlists_are_disjoint() {
        let policy = policy();
        assert_eq!(
            policy.decide(NavigationFrame::Main, APP_PROD),
            NavigationDecision::Allow(NavigationAllow::MainApp)
        );
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Descendant, APP_PROD)),
            NavigationDiagnosticCode::InvalidTarget
        );
        let lease = policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("trusted target should activate");
        assert_eq!(
            policy.decide(NavigationFrame::Descendant, ENTRY_A),
            NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
        );
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Main, ENTRY_A)),
            NavigationDiagnosticCode::InvalidTarget
        );
        assert!(policy.dispose_plugin_target(lease));
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
    fn descendant_is_idle_by_default_and_after_current_disposal() {
        let policy = policy();
        assert!(policy.is_idle());
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Descendant, ENTRY_A)),
            NavigationDiagnosticCode::MissingActiveTarget
        );
        let lease = policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("target should activate");
        assert!(!policy.is_idle());
        assert!(policy.dispose_plugin_target(lease));
        assert!(policy.is_idle());
    }

    #[test]
    fn native_and_translated_plugin_urls_normalize_to_one_document() {
        let policy = policy();
        policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("target should activate");
        assert_eq!(
            policy.decide(NavigationFrame::Descendant, ENTRY_A_TRANSLATED),
            NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
        );
    }

    #[test]
    fn redirect_attempt_is_re_evaluated_against_the_exact_active_target() {
        let policy = policy();
        policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("initial target should activate");
        assert_eq!(
            policy.decide(NavigationFrame::Descendant, ENTRY_A),
            NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
        );
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Descendant, ENTRY_B)),
            NavigationDiagnosticCode::TargetMismatch
        );
    }

    #[test]
    fn host_fragment_is_exact_and_cannot_come_from_the_entry_url() {
        let policy = policy();
        policy
            .activate_plugin_target(ENTRY_A, Some("page=settings"))
            .expect("Host fragment should activate");
        assert_eq!(
            policy.decide(
                NavigationFrame::Descendant,
                &format!("{ENTRY_A}#page=settings")
            ),
            NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
        );
        for target in [
            ENTRY_A.to_owned(),
            format!("{ENTRY_A}#page=other"),
            format!("{ENTRY_A}#page=settings&extra=true"),
        ] {
            assert_eq!(
                denied_code(policy.decide(NavigationFrame::Descendant, &target)),
                NavigationDiagnosticCode::TargetMismatch
            );
        }
        assert!(policy
            .activate_plugin_target(&format!("{ENTRY_A}#author"), None)
            .is_err());
    }

    #[test]
    fn replacement_invalidates_old_target_and_late_disposal() {
        let policy = Arc::new(policy());
        let old = policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("old target should activate");
        let current = policy
            .activate_plugin_target(ENTRY_B, None)
            .expect("replacement should activate");
        let late_policy = Arc::clone(&policy);
        assert!(
            !std::thread::spawn(move || late_policy.dispose_plugin_target(old))
                .join()
                .expect("late disposal thread should finish")
        );
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Descendant, ENTRY_A)),
            NavigationDiagnosticCode::TargetMismatch
        );
        assert_eq!(
            policy.decide(NavigationFrame::Descendant, ENTRY_B),
            NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
        );
        assert!(policy.dispose_plugin_target(current));
    }

    #[test]
    fn ambiguous_plugin_targets_fail_closed() {
        let policy = policy();
        policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("target should activate");
        let invalid = [
            format!("{ENTRY_A}?query=1"),
            ENTRY_A.replacen(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "user@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                1,
            ),
            ENTRY_A.replacen(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost:443",
                1,
            ),
            ENTRY_A.replace("index.html", "index%2ehtml"),
            ENTRY_A.replace("/index.html", "/nested\\index.html"),
            ENTRY_A.replace("lensx-plugin:", "LENSX-PLUGIN:"),
            ENTRY_A.replacen(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "localhost",
                1,
            ),
            ENTRY_A.replacen(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.extra.runtime.localhost",
                1,
            ),
            ENTRY_A.replacen(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.runtime.localhost",
                1,
            ),
            ENTRY_A.replacen(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "xn--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                1,
            ),
            ENTRY_A.replacen(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.runtime.localhost",
                1,
            ),
            ENTRY_A_TRANSLATED.replacen(
                "lensx-plugin.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost",
                "lensx-plugin.localhost",
                1,
            ),
            "file:///tmp/index.html".to_owned(),
            "javascript:void(0)".to_owned(),
            "data:text/html,denied".to_owned(),
            "blob:https://lensx-plugin.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost/id"
                .to_owned(),
            "https://example.invalid/".to_owned(),
        ];
        for target in invalid {
            assert_eq!(
                denied_code(policy.decide(NavigationFrame::Descendant, &target)),
                NavigationDiagnosticCode::InvalidTarget,
                "target should be invalid: {target}"
            );
        }
    }

    #[test]
    fn cross_plugin_scope_version_path_and_stale_targets_do_not_match() {
        let policy = policy();
        policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("target should activate");
        for target in [
            ENTRY_B.to_owned(),
            ENTRY_A.replace("1.0.0", "1.0.1"),
            ENTRY_A.replace("index.html", "other.html"),
            ENTRY_A.replace("aaaaaaaa", "cccccccc"),
        ] {
            assert_eq!(
                denied_code(policy.decide(NavigationFrame::Descendant, &target)),
                NavigationDiagnosticCode::TargetMismatch
            );
        }
    }

    #[test]
    fn package_subresources_never_inherit_document_authorization() {
        let policy = policy();
        policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("entry document should activate");
        for subresource in [
            "styles.css",
            "module.js",
            "image.svg",
            "font.woff2",
            "data.json",
            "module.wasm",
        ] {
            let target = ENTRY_A.replace("index.html", subresource);
            assert_eq!(
                denied_code(policy.decide(NavigationFrame::Descendant, &target)),
                NavigationDiagnosticCode::TargetMismatch
            );
        }
    }

    #[test]
    fn unknown_frames_and_callback_failures_are_bounded_denials() {
        let policy = policy();
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Unknown, ENTRY_A)),
            NavigationDiagnosticCode::UnknownFrame
        );
        let decision = policy.callback_failure(NavigationFrame::Descendant);
        assert_eq!(
            decision,
            NavigationDecision::Deny(NavigationDiagnostic {
                code: NavigationDiagnosticCode::CallbackFailure,
                frame: NavigationFrame::Descendant,
                operation: NavigationOperation::Navigate,
            })
        );
        let debug = format!("{decision:?}");
        for forbidden in ["lensx-plugin", "localhost", "/v1/", "scope", "entry_id"] {
            assert!(!debug.contains(forbidden));
        }
    }

    #[test]
    fn invalid_activation_never_replaces_the_current_target() {
        let policy = policy();
        let current = policy
            .activate_plugin_target(ENTRY_A, None)
            .expect("target should activate");
        assert!(policy
            .activate_plugin_target("https://example.invalid/plugin.html", None)
            .is_err());
        assert_eq!(
            policy.decide(NavigationFrame::Descendant, ENTRY_A),
            NavigationDecision::Allow(NavigationAllow::ActivePluginDocument)
        );
        assert!(policy.dispose_plugin_target(current));
    }
}
