use crate::frame_aware_navigation_policy::{
    FrameAwareNavigationPolicy, NavigationDecision, NavigationFrame,
};
use crate::trusted_app_target::TrustedAppTarget;
use std::{error::Error, io, sync::Arc};
use tauri::{
    webview::{DownloadEvent, NavigationFrame as TauriNavigationFrame, NewWindowResponse},
    AppHandle, Manager, WebviewWindowBuilder,
};
use url::Url;

pub(crate) fn setup_frame_aware_navigation_policy(
    app: &AppHandle,
    app_target: &TrustedAppTarget,
) -> Result<Arc<FrameAwareNavigationPolicy>, Box<dyn Error>> {
    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
        .ok_or_else(|| io::Error::other("main WebView configuration is unavailable"))?;
    let policy = Arc::new(
        FrameAwareNavigationPolicy::new(app_target.document_url())
            .map_err(|_| io::Error::other("configured App target is invalid"))?,
    );
    if !app.manage(Arc::clone(&policy)) {
        return Err(io::Error::other("navigation policy was already installed").into());
    }
    let callback_policy = Arc::clone(&policy);
    WebviewWindowBuilder::from_config(app, &window_config)?
        .on_navigation_with_frame(move |url, frame| {
            match decide_tauri_navigation(&callback_policy, url, frame) {
                NavigationDecision::Allow(_) => true,
                NavigationDecision::Deny(diagnostic) => {
                    eprintln!(
                        "frame-aware navigation denied: code={:?} frame={:?} operation={:?}",
                        diagnostic.code, diagnostic.frame, diagnostic.operation
                    );
                    false
                }
            }
        })
        .on_new_window(|_url, _features| {
            eprintln!("frame-aware navigation denied: code=new_window operation=navigate");
            NewWindowResponse::Deny
        })
        .on_download(|_webview, event| {
            let operation = match event {
                DownloadEvent::Requested { .. } => "download_requested",
                DownloadEvent::Finished { .. } => "download_finished",
                _ => "download_unknown",
            };
            eprintln!("frame-aware navigation denied: code=download operation={operation}");
            false
        })
        .build()?;
    Ok(policy)
}

fn decide_tauri_navigation(
    policy: &FrameAwareNavigationPolicy,
    url: &Url,
    frame: TauriNavigationFrame,
) -> NavigationDecision {
    let frame = match frame {
        TauriNavigationFrame::Main => NavigationFrame::Main,
        TauriNavigationFrame::Descendant => NavigationFrame::Descendant,
        TauriNavigationFrame::Unknown => NavigationFrame::Unknown,
    };
    policy.decide(frame, url.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame_aware_navigation_policy::{NavigationAllow, NavigationDiagnosticCode};

    fn denied_code(decision: NavigationDecision) -> NavigationDiagnosticCode {
        match decision {
            NavigationDecision::Deny(diagnostic) => diagnostic.code,
            NavigationDecision::Allow(allow) => panic!("expected deny, got {allow:?}"),
        }
    }

    #[test]
    fn maps_all_macos_frame_facts_and_fails_unknown_closed() {
        let policy = FrameAwareNavigationPolicy::new("tauri://localhost/")
            .expect("App target should be valid");
        let app = Url::parse("tauri://localhost/").expect("App URL should parse");
        assert_eq!(
            decide_tauri_navigation(&policy, &app, TauriNavigationFrame::Main),
            NavigationDecision::Allow(NavigationAllow::MainApp)
        );
        assert_eq!(
            denied_code(decide_tauri_navigation(
                &policy,
                &app,
                TauriNavigationFrame::Descendant,
            )),
            NavigationDiagnosticCode::InvalidTarget
        );
        assert_eq!(
            denied_code(decide_tauri_navigation(
                &policy,
                &app,
                TauriNavigationFrame::Unknown,
            )),
            NavigationDiagnosticCode::UnknownFrame
        );
    }

    #[test]
    fn dependency_adapter_keeps_deny_priority_and_main_only_bootstrap() {
        let delegate = include_str!(
            "../../vendor/frame-aware-navigation/wry/src/wkwebview/class/wry_navigation_delegate.rs"
        );
        let tauri_manager =
            include_str!("../../vendor/frame-aware-navigation/tauri/src/manager/webview.rs");
        let wkwebview =
            include_str!("../../vendor/frame-aware-navigation/wry/src/wkwebview/mod.rs");
        assert!(delegate.contains("legacy_allowed && frame_allowed"));
        assert!(tauri_manager.contains("fn main_frame_script"));
        assert!(tauri_manager.contains("for_main_frame_only: true"));
        assert!(wkwebview.contains("WKUserScript::initWithSource_injectionTime_forMainFrameOnly"));
        assert!(wkwebview.contains("WKUserScriptInjectionTime::AtDocumentStart"));
    }

    #[test]
    fn production_installs_one_private_policy_with_host_only_runtime_activation() {
        let lib = include_str!("lib.rs");
        let config = include_str!("../tauri.conf.json");
        assert_eq!(
            lib.matches("setup_frame_aware_navigation_policy(").count(),
            1
        );
        assert!(lib.contains("&trusted_app_target"));
        assert!(config.contains(r#""create": false"#));
        assert!(lib.contains("pub(crate) mod frame_aware_navigation_policy"));
        assert!(!lib.contains("plugin_runtime_navigation"));
        assert!(!lib.contains("activate_plugin_runtime_navigation"));
        assert!(!lib.contains("dispose_plugin_runtime_navigation"));
        let policy = FrameAwareNavigationPolicy::new("tauri://localhost/")
            .expect("App target should be valid");
        let plugin = "lensx-plugin://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.runtime.localhost/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/v1-a1/1.0.0/index.html";
        assert_eq!(
            denied_code(policy.decide(NavigationFrame::Descendant, plugin)),
            NavigationDiagnosticCode::InvalidTarget
        );
    }
}
