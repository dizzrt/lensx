#![allow(linker_messages)] // The standalone harness intentionally links its own generated Tauri context.

use serde::{Deserialize, Serialize};
use std::{env, fs, path::PathBuf};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    AppHandle, WebviewUrl, WebviewWindowBuilder,
};

const HARNESS_EVIDENCE_VERSION: &str = "0.1.0";
const HARNESS_SCHEME: &str = "lensx-config-lens-harness";
const CSP: &str = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct HarnessChecks {
    exact_limits_observed: bool,
    diagnostic_limit_observed: bool,
    five_second_deadline_observed: bool,
    worker_timeout_terminated: bool,
    worker_recreated_after_failure: bool,
    editor_and_package_worker_loaded: bool,
    single_editor_direct_replace_and_undo: bool,
    four_language_minimum_operations: bool,
    malicious_inputs_fail_closed: bool,
    launcher_responsive_during_worker_work: bool,
    teardown_completed: bool,
    bounded_content_free_record: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct HarnessEvidence {
    evidence_version: String,
    platform: String,
    valid_language_count: u8,
    malicious_fail_closed_count: u8,
    checks: HarnessChecks,
}

struct HarnessState {
    output: PathBuf,
}

#[tauri::command]
fn config_lens_wkwebview_harness_record(
    evidence: HarnessEvidence,
    app: AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<(), &'static str> {
    let checks = &evidence.checks;
    if evidence.evidence_version != HARNESS_EVIDENCE_VERSION
        || evidence.platform != "macos-wkwebview"
        || evidence.valid_language_count != 4
        || evidence.malicious_fail_closed_count != 4
        || [
            checks.exact_limits_observed,
            checks.diagnostic_limit_observed,
            checks.five_second_deadline_observed,
            checks.worker_timeout_terminated,
            checks.worker_recreated_after_failure,
            checks.editor_and_package_worker_loaded,
            checks.single_editor_direct_replace_and_undo,
            checks.four_language_minimum_operations,
            checks.malicious_inputs_fail_closed,
            checks.launcher_responsive_during_worker_work,
            checks.teardown_completed,
            checks.bounded_content_free_record,
        ]
        .into_iter()
        .any(|passed| !passed)
    {
        eprintln!("ConfigLens WKWebView bounded checks rejected: {checks:?}");
        return Err("config_lens_wkwebview_evidence_rejected");
    }
    let mut bytes = serde_json::to_vec_pretty(&evidence).map_err(|_| "evidence_encode_failed")?;
    bytes.push(b'\n');
    fs::write(&state.output, bytes).map_err(|_| "evidence_write_failed")?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn config_lens_wkwebview_harness_fail(phase: String, app: AppHandle) {
    let phase = if phase == "evidence_record" {
        phase
    } else {
        "unknown".into()
    };
    eprintln!("ConfigLens WKWebView harness reported a bounded failure in {phase}");
    app.exit(1);
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        _ => "application/octet-stream",
    }
}

fn main() {
    #[cfg(not(target_os = "macos"))]
    compile_error!("the ConfigLens WKWebView harness is intentionally macOS-only");

    let output = env::args()
        .find_map(|argument| argument.strip_prefix("--output=").map(PathBuf::from))
        .expect("ConfigLens WKWebView harness requires --output=<path>");
    let dist = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../plugins/official/config-lens/wkwebview/dist");
    let target = format!("{HARNESS_SCHEME}://localhost/index.html")
        .parse()
        .expect("static ConfigLens harness target should parse");
    tauri::Builder::default()
        .register_uri_scheme_protocol(HARNESS_SCHEME, move |_context, request| {
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
                .header("content-security-policy", CSP)
                .header("cache-control", "no-store")
                .header("x-content-type-options", "nosniff")
                .body(body)
                .expect("ConfigLens harness response should build")
        })
        .manage(HarnessState { output })
        .invoke_handler(tauri::generate_handler![
            config_lens_wkwebview_harness_record,
            config_lens_wkwebview_harness_fail
        ])
        .setup(move |app| {
            WebviewWindowBuilder::new(
                app,
                "config-lens-wkwebview-harness",
                WebviewUrl::External(target),
            )
            .title("lensX ConfigLens WKWebView Harness")
            .inner_size(650.0, 600.0)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!(
            "config-lens-wkwebview-harness.conf.json"
        ))
        .expect("ConfigLens WKWebView harness failed");
}
