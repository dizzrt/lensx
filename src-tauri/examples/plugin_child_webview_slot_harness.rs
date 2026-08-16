#![allow(linker_messages)] // Tauri examples intentionally link the app library and their own generated context.

use lensx_lib::plugin_child_webview_adapter::create_plugin_child_webview_slot_probe;
use std::{
    env, fs,
    path::PathBuf,
    process,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    WebviewUrl, WebviewWindowBuilder,
};

const HOST_SCHEME: &str = "lensx-child-webview-slot-host";
const CHILD_SCHEME: &str = "lensx-child-webview-slot-plugin";
const PARENT_LABEL: &str = "plugin-child-webview-slot-host";
const CHILD_LABEL: &str = "plugin-child-webview-slot-plugin";
static HOST_OVERLAY_HANDLER_HITS: AtomicUsize = AtomicUsize::new(0);

const HOST_DOCUMENT: &[u8] = br#"<!doctype html>
<meta charset="utf-8">
<title>Host slot surface</title>
<style>html,body{width:100%;height:100%;margin:0}main{padding:16px}</style>
<main>Trusted Host chrome</main>"#;

const CHILD_DOCUMENT: &[u8] = br#"<!doctype html>
<meta charset="utf-8">
<title>Plugin native slot input</title>
<label for="editor">Plugin editor</label>
<input id="editor" autocomplete="off">
<script>
  const editor = document.getElementById('editor');
  let keyboardEvents = 0;
  let compositionEvents = 0;
  editor.addEventListener('input', (event) => {
    if (!event.isComposing && event.inputType === 'insertText') keyboardEvents += 1;
  });
  for (const name of ['compositionstart', 'compositionupdate', 'compositionend']) {
    editor.addEventListener(name, () => { compositionEvents += 1; });
  }
  window.prepareSlotInputProbe = () => {
    editor.focus();
  };
  window.reportSlotInputProbe = () => {
    window.ipc.postMessage(JSON.stringify({
      type: 'lensx.slot_probe.input',
      active_input: document.activeElement === editor,
      keyboard_events: keyboardEvents,
      keyboard_value: editor.value.slice(0, 1),
      composition_events: compositionEvents,
      ime_value: editor.value
    }));
  };
</script>"#;

#[tauri::command]
fn plugin_child_webview_slot_overlay_probe() {
    HOST_OVERLAY_HANDLER_HITS.fetch_add(1, Ordering::SeqCst);
}

fn response(body: &'static [u8], status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .body(body.to_vec())
        .expect("static slot harness response should be valid")
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
            eprintln!("usage: plugin_child_webview_slot_harness --output <file>");
            process::exit(2);
        }
    }
}

fn main() {
    let output = output_path();
    let child_url = format!("{CHILD_SCHEME}://localhost/plugin.html");
    let validation_url = child_url.clone();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            plugin_child_webview_slot_overlay_probe
        ])
        .register_uri_scheme_protocol(HOST_SCHEME, |_context, request| {
            if request.uri().path() == "/host.html" {
                response(HOST_DOCUMENT, StatusCode::OK)
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
            let host_url = format!("{HOST_SCHEME}://localhost/host.html")
                .parse()
                .expect("static Host URL should parse");
            WebviewWindowBuilder::new(app, PARENT_LABEL, WebviewUrl::External(host_url))
                .title("lensX Child WebView native slot harness")
                .inner_size(720.0, 520.0)
                .build()?;
            let probe = create_plugin_child_webview_slot_probe(
                app.handle(),
                PARENT_LABEL,
                CHILD_LABEL,
                &validation_url,
            )
            .map_err(|error| tauri::Error::AssetNotFound(error.code().to_owned()))?;
            let app_handle = app.handle().clone();
            let output = output.clone();
            thread::spawn(move || match probe.validate(&HOST_OVERLAY_HANDLER_HITS) {
                Ok(evidence) => {
                    let bytes = serde_json::to_vec_pretty(&evidence)
                        .expect("bounded slot evidence should serialize");
                    if fs::write(&output, bytes).is_ok() {
                        app_handle.exit(0);
                    } else {
                        app_handle.exit(3);
                    }
                }
                Err(error) => {
                    eprintln!("Child WebView slot harness failed: {}", error.code());
                    app_handle.exit(3);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!(
            "plugin-child-webview-slot-harness.conf.json"
        ))
        .expect("Child WebView slot harness runtime failed");
}
