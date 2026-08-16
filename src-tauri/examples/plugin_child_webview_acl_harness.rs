#![allow(linker_messages)] // Tauri examples intentionally link the app library and their own generated context.

use lensx_lib::plugin_child_webview_adapter::create_plugin_child_webview_acl_probe;
use serde::Serialize;
use std::{
    env, fs,
    path::PathBuf,
    process,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    Listener, WebviewUrl, WebviewWindowBuilder,
};

const HOST_SCHEME: &str = "lensx-child-webview-acl-host";
const CHILD_SCHEME: &str = "lensx-child-webview-acl-plugin";
const PARENT_LABEL: &str = "plugin-child-webview-acl-host";
const ACL_EVENT: &str = "lensx-acl-probe";

#[derive(Clone, Copy)]
struct SourceProfile {
    source: &'static str,
    publisher: &'static str,
    repository: &'static str,
    provenance: &'static str,
    release_metadata: &'static str,
}

const SOURCE_PROFILES: [SourceProfile; 3] = [
    SourceProfile {
        source: "official",
        publisher: "lensX Official",
        repository: "https://github.com/lensx-dev/lensx",
        provenance: "trusted-publisher-attestation",
        release_metadata: "verified-release-sidecar",
    },
    SourceProfile {
        source: "external",
        publisher: "Community Publisher",
        repository: "https://example.com/community/plugin",
        provenance: "community-package",
        release_metadata: "none",
    },
    SourceProfile {
        source: "development",
        publisher: "Local Developer",
        repository: "https://example.com/local/plugin",
        provenance: "local-development-directory",
        release_metadata: "unreleased",
    },
];

#[derive(Serialize)]
struct SourceAclEvidence {
    source: &'static str,
    publisher: &'static str,
    repository: &'static str,
    provenance: &'static str,
    release_metadata: &'static str,
    authority: lensx_lib::plugin_child_webview_adapter::PluginChildWebviewAclEvidence,
}

#[derive(Serialize)]
struct SourceParityEvidence {
    corpus_version: &'static str,
    profiles: Vec<SourceAclEvidence>,
}

static APP_COMMAND_HANDLER_HITS: AtomicUsize = AtomicUsize::new(0);
static TAURI_PLUGIN_HANDLER_HITS: AtomicUsize = AtomicUsize::new(0);
static GLOBAL_EVENT_HANDLER_HITS: AtomicUsize = AtomicUsize::new(0);

const CHILD_DOCUMENT: &[u8] = br#"<!doctype html>
<meta charset="utf-8">
<title>Plugin Child WebView ACL Harness</title>
<main>Plugin Child WebView ACL Harness</main>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    const commands = [
      ['plugin:app|version', {}],
      ['plugin:lensx-acl-probe|probe', {}],
      ['lensx_acl_probe', {}],
      ['plugin:event|emit', { event: 'lensx-acl-probe', payload: {} }],
      ['plugin:window|hide', { label: 'plugin-child-webview-acl-host' }],
      ['plugin:webview|set_webview_position', {
        label: 'plugin-child-webview-acl-plugin',
        value: { type: 'Physical', x: 999, y: 999 }
      }]
    ];
    for (const [cmd, payload] of commands) {
      window.ipc.postMessage(JSON.stringify({
        cmd,
        callback: 1,
        error: 2,
        payload,
        options: {},
        __TAURI_INVOKE_KEY__: 'forged'
      }));
    }
    window.ipc.postMessage('{');
    window.ipc.postMessage(JSON.stringify({
      contract_version: '0.2.0',
      type: 'lensx.plugin_bridge.ready',
      freshness: 'bad'
    }));
    window.ipc.postMessage(JSON.stringify({
      contract_version: '0.2.0',
      type: 'lensx.plugin_bridge.ready',
      freshness: '0123456789abcdef0123456789abcdef',
      webview_label: 'forged'
    }));
    const tauriGlobalsPresent = window.isTauri === true || typeof window.__TAURI_INTERNALS__ !== 'undefined';
    if (!tauriGlobalsPresent) {
      const bridge = window.__LENSX_PLUGIN_WEBVIEW_BRIDGE__;
      bridge?.send(bridge.bootstrap);
    }
  }, { once: true });
</script>"#;

#[tauri::command]
fn lensx_acl_probe() {
    APP_COMMAND_HANDLER_HITS.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
fn probe() {
    TAURI_PLUGIN_HANDLER_HITS.fetch_add(1, Ordering::SeqCst);
}

fn response(body: &'static [u8], status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .body(body.to_vec())
        .expect("static ACL harness response should be valid")
}

fn output_path() -> PathBuf {
    let mut arguments = env::args().skip(1);
    match (
        arguments.next().as_deref(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some("--output"), Some(path), None) => PathBuf::from(path),
        _ => {
            eprintln!("usage: plugin_child_webview_acl_harness --output <file>");
            process::exit(2);
        }
    }
}

fn main() {
    let output = output_path();
    let child_url = format!("{CHILD_SCHEME}://localhost/plugin.html");
    let validation_url = child_url.clone();
    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("lensx-acl-probe")
                .invoke_handler(tauri::generate_handler![probe])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![lensx_acl_probe])
        .register_uri_scheme_protocol(HOST_SCHEME, |_context, request| {
            if request.uri().path() == "/host.html" {
                response(
                    b"<!doctype html><title>Host</title><main>Host</main>",
                    StatusCode::OK,
                )
            } else {
                response(b"not found", StatusCode::NOT_FOUND)
            }
        })
        .register_uri_scheme_protocol(CHILD_SCHEME, |_context, request| {
            if request.uri().path() == "/plugin.html" {
                response(CHILD_DOCUMENT, StatusCode::OK)
            } else {
                response(b"not found", StatusCode::NOT_FOUND)
            }
        })
        .setup(move |app| {
            app.listen(ACL_EVENT, |_event| {
                GLOBAL_EVENT_HANDLER_HITS.fetch_add(1, Ordering::SeqCst);
            });
            let host_url = format!("{HOST_SCHEME}://localhost/host.html")
                .parse()
                .expect("static Host URL should parse");
            WebviewWindowBuilder::new(app, PARENT_LABEL, WebviewUrl::External(host_url))
                .title("lensX Child WebView ACL harness")
                .inner_size(720.0, 520.0)
                .build()?;
            let app_handle = app.handle().clone();
            let output = output.clone();
            thread::spawn(move || {
                let result = SOURCE_PROFILES
                    .into_iter()
                    .enumerate()
                    .map(|(index, profile)| {
                        let child_label =
                            format!("plugin-child-webview-acl-{}-{index}", profile.source);
                        create_plugin_child_webview_acl_probe(
                            &app_handle,
                            PARENT_LABEL,
                            &child_label,
                            &validation_url,
                        )?
                        .validate(
                            &APP_COMMAND_HANDLER_HITS,
                            &TAURI_PLUGIN_HANDLER_HITS,
                            &GLOBAL_EVENT_HANDLER_HITS,
                        )
                        .map(|authority| SourceAclEvidence {
                            source: profile.source,
                            publisher: profile.publisher,
                            repository: profile.repository,
                            provenance: profile.provenance,
                            release_metadata: profile.release_metadata,
                            authority,
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()
                    .map(|profiles| SourceParityEvidence {
                        corpus_version: "native-host-escape-v1",
                        profiles,
                    });
                match result {
                    Ok(evidence) => {
                        let bytes = serde_json::to_vec_pretty(&evidence)
                            .expect("bounded ACL evidence should serialize");
                        if fs::write(&output, bytes).is_ok() {
                            app_handle.exit(0);
                        } else {
                            app_handle.exit(3);
                        }
                    }
                    Err(error) => {
                        eprintln!("Child WebView ACL harness failed: {}", error.code());
                        app_handle.exit(3);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!(
            "plugin-child-webview-acl-harness.conf.json"
        ))
        .expect("Child WebView ACL harness runtime failed");
}
