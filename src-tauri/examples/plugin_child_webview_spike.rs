#![allow(linker_messages)] // Tauri examples intentionally link the app library and their own generated context.

use lensx_lib::plugin_child_webview_adapter::{
    create_plugin_child_webview_spike, PluginChildWebviewBounds, PluginChildWebviewSpikeEvidence,
};
use serde::Serialize;
use std::{env, fs, path::PathBuf, process, thread};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    WebviewUrl, WebviewWindowBuilder,
};

const HOST_SCHEME: &str = "lensx-child-webview-spike-host";
const CHILD_SCHEME: &str = "lensx-child-webview-spike";
const PARENT_LABEL: &str = "plugin-child-webview-spike-host";
const CHILD_LABEL: &str = "plugin-child-webview-spike-child";

#[derive(Serialize)]
struct PluginChildWebviewLifecycleEvidence {
    first_open: PluginChildWebviewSpikeEvidence,
    reopened: PluginChildWebviewSpikeEvidence,
    close_reopen_fresh: bool,
}

fn response(body: &'static [u8], status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .body(body.to_vec())
        .expect("static spike response should be valid")
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
            eprintln!("usage: plugin_child_webview_spike --output <file>");
            process::exit(2);
        }
    }
}

fn main() {
    let output = output_path();
    let child_url = format!("{CHILD_SCHEME}://localhost/child.html");
    let validation_url = child_url.clone();
    tauri::Builder::default()
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
            if request.uri().path() == "/child.html" {
                response(
                    b"<!doctype html><title>Child</title><main>Child WebView</main>",
                    StatusCode::OK,
                )
            } else {
                response(b"not found", StatusCode::NOT_FOUND)
            }
        })
        .setup(move |app| {
            let host_url = format!("{HOST_SCHEME}://localhost/host.html")
                .parse()
                .expect("static Host URL should parse");
            WebviewWindowBuilder::new(app, PARENT_LABEL, WebviewUrl::External(host_url))
                .title("lensX Child WebView spike")
                .inner_size(720.0, 520.0)
                .build()?;
            let spike = create_plugin_child_webview_spike(
                app.handle(),
                PARENT_LABEL,
                CHILD_LABEL,
                &validation_url,
            )
            .map_err(|error| tauri::Error::AssetNotFound(error.code().to_owned()))?;
            let app_handle = app.handle().clone();
            let output = output.clone();
            thread::spawn(move || {
                let bounds = PluginChildWebviewBounds {
                    x: 48,
                    y: 64,
                    width: 360,
                    height: 240,
                };
                let result = (|| {
                    let first_open = spike.validate(bounds)?;
                    let reopened = create_plugin_child_webview_spike(
                        &app_handle,
                        PARENT_LABEL,
                        CHILD_LABEL,
                        &validation_url,
                    )?
                    .validate(bounds)?;
                    Ok::<_, lensx_lib::plugin_child_webview_adapter::PluginChildWebviewAdapterError>(
                        PluginChildWebviewLifecycleEvidence {
                            first_open,
                            reopened,
                            close_reopen_fresh: true,
                        },
                    )
                })();
                match result {
                    Ok(evidence) => {
                        let bytes = serde_json::to_vec_pretty(&evidence)
                            .expect("bounded spike evidence should serialize");
                        if fs::write(&output, bytes).is_ok() {
                            app_handle.exit(0);
                        } else {
                            app_handle.exit(3);
                        }
                    }
                    Err(error) => {
                        eprintln!("Child WebView spike failed: {}", error.code());
                        app_handle.exit(3);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!(
            "plugin-child-webview-spike.conf.json"
        ))
        .expect("Child WebView spike runtime failed");
}
