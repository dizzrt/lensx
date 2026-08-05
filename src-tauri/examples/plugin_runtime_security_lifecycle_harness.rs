#![allow(linker_messages)] // The standalone harness intentionally links its own generated Tauri context.

#[path = "../src/plugin_runtime_security_policy.rs"]
#[allow(dead_code)]
mod plugin_runtime_security_policy;

use plugin_runtime_security_policy::HOST_DOCUMENT_CSP;
use serde::{Deserialize, Serialize};
use std::{env, fs, path::PathBuf};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    AppHandle, WebviewUrl, WebviewWindowBuilder,
};

const HARNESS_EVIDENCE_VERSION: &str = "0.1.0";
const HOST_SCHEME: &str = "lensx-runtime-harness";

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct HarnessChecks {
    exact_load_deadline_observed: bool,
    exact_handshake_deadline_observed: bool,
    third_failure_opened_breaker: bool,
    cooldown_blocked_hidden_construction: bool,
    no_automatic_retry: bool,
    exact_single_iframe: bool,
    terminal_cleanup_removed_iframe: bool,
    terminal_cleanup_released_lease: bool,
    session_ports_disposed: bool,
    fixed_policy_constants_observed: bool,
    host_csp_header_verified: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct HarnessEvidence {
    evidence_version: String,
    platform: String,
    checks: HarnessChecks,
}

struct HarnessState {
    output: PathBuf,
}

#[tauri::command]
fn plugin_runtime_security_lifecycle_harness_record(
    evidence: HarnessEvidence,
    app: AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<(), &'static str> {
    if evidence.evidence_version != HARNESS_EVIDENCE_VERSION
        || evidence.platform != "macos-wkwebview"
        || [
            evidence.checks.exact_load_deadline_observed,
            evidence.checks.exact_handshake_deadline_observed,
            evidence.checks.third_failure_opened_breaker,
            evidence.checks.cooldown_blocked_hidden_construction,
            evidence.checks.no_automatic_retry,
            evidence.checks.exact_single_iframe,
            evidence.checks.terminal_cleanup_removed_iframe,
            evidence.checks.terminal_cleanup_released_lease,
            evidence.checks.session_ports_disposed,
            evidence.checks.fixed_policy_constants_observed,
            evidence.checks.host_csp_header_verified,
        ]
        .into_iter()
        .any(|passed| !passed)
    {
        return Err("runtime_security_lifecycle_evidence_rejected");
    }
    let mut bytes = serde_json::to_vec_pretty(&evidence).map_err(|_| "evidence_encode_failed")?;
    bytes.push(b'\n');
    fs::write(&state.output, bytes).map_err(|_| "evidence_write_failed")?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn plugin_runtime_security_lifecycle_harness_fail(phase: String, app: AppHandle) {
    let phase = match phase.as_str() {
        "initializing" | "load_attempt" | "session_start" | "deadline_wait" | "breaker"
        | "evidence_record" => phase,
        _ => "unknown".into(),
    };
    eprintln!("Runtime security lifecycle harness reported a bounded failure in {phase}");
    app.exit(1);
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("png") => "image/png",
        _ => "text/plain; charset=utf-8",
    }
}

fn main() {
    #[cfg(not(target_os = "macos"))]
    compile_error!("the Runtime security lifecycle harness is intentionally macOS-only");

    let output = env::args()
        .find_map(|argument| argument.strip_prefix("--output=").map(PathBuf::from))
        .expect("Runtime security lifecycle harness requires --output=<path>");
    let dist = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    let app_target = format!("{HOST_SCHEME}://localhost/index.html")
        .parse()
        .expect("static lifecycle harness target should parse");
    tauri::Builder::default()
        .register_uri_scheme_protocol(HOST_SCHEME, move |_context, request| {
            let relative = request.uri().path().trim_start_matches('/');
            if relative.is_empty()
                || relative.contains("..")
                || relative.contains('\\')
                || !relative
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"/-_.".contains(&byte))
            {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .expect("bounded failure response should build");
            }
            let body = match fs::read(dist.join(relative)) {
                Ok(body) => body,
                Err(_) => {
                    return Response::builder()
                        .status(StatusCode::NOT_FOUND)
                        .body(Vec::new())
                        .expect("bounded missing response should build");
                }
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, content_type(relative))
                .header("content-security-policy", HOST_DOCUMENT_CSP)
                .header("cache-control", "no-store")
                .header("x-content-type-options", "nosniff")
                .body(body)
                .expect("lifecycle harness response should build")
        })
        .manage(HarnessState { output })
        .invoke_handler(tauri::generate_handler![
            plugin_runtime_security_lifecycle_harness_record,
            plugin_runtime_security_lifecycle_harness_fail
        ])
        .setup(move |app| {
            WebviewWindowBuilder::new(
                app,
                "runtime-security-lifecycle-harness",
                WebviewUrl::External(app_target),
            )
            .title("lensX Plugin Runtime Security Lifecycle Harness")
            .inner_size(650.0, 600.0)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!(
            "plugin-runtime-security-lifecycle-harness.conf.json"
        ))
        .expect("Runtime security lifecycle harness failed");
}
