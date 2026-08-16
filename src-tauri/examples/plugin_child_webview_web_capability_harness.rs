#![allow(linker_messages)] // Tauri examples intentionally link the app library and their own generated context.

use lensx_lib::plugin_child_webview_adapter::{
    create_plugin_child_webview_web_capability_probe, PluginChildWebviewWebCapabilityEvidence,
};
use serde::Serialize;
use std::{
    env, fs,
    path::PathBuf,
    process, thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    WebviewUrl, WebviewWindowBuilder,
};

const HOST_SCHEME: &str = "lensx-child-webview-web-host";
const PLUGIN_SCHEME: &str = "lensx-child-webview-web-plugin";
const PARENT_LABEL: &str = "plugin-child-webview-web-host";

#[derive(Serialize)]
struct WebCapabilityHarnessEvidence {
    created: bool,
    distinct_origins: bool,
    distinct_data_store_identifiers: bool,
    first_generation: PluginChildWebviewWebCapabilityEvidence,
    second_generation: PluginChildWebviewWebCapabilityEvidence,
    cross_plugin_storage_denied: bool,
    old_generation_storage_denied: bool,
    replacement_fresh: bool,
}

fn response(body: Vec<u8>, content_type: &'static str, status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, content_type)
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .body(body)
        .expect("web capability response should be valid")
}

fn plugin_document(phase: &str, expected_origin: &str) -> Vec<u8> {
    format!(
        r#"<!doctype html>
<meta charset="utf-8">
<title>Plugin Web capability probe</title>
<script type="module">
  import {{ marker }} from './module.js';
  const workerResult = await new Promise((resolve, reject) => {{
    const worker = new Worker(new URL('./worker.js', import.meta.url), {{ type: 'module' }});
    worker.onmessage = (event) => {{ worker.terminate(); resolve(event.data); }};
    worker.onerror = reject;
  }});
  const fetchResult = await fetch('./network.json').then((response) => response.json());
  const wasmResult = await WebAssembly.instantiate(
    new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])
  );
  const localStorageBefore = localStorage.getItem('lensx-isolation-probe');
  localStorage.setItem('lensx-isolation-probe', '{phase}');
  const indexedDbBefore = await new Promise((resolve, reject) => {{
    let created = false;
    const open = indexedDB.open('lensx-isolation-probe', 1);
    open.onupgradeneeded = () => {{ created = true; open.result.createObjectStore('values'); }};
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {{
      const transaction = open.result.transaction('values', 'readwrite');
      transaction.objectStore('values').put('{phase}', 'phase');
      transaction.oncomplete = () => {{ open.result.close(); resolve(!created); }};
      transaction.onerror = () => reject(transaction.error);
    }};
  }});
  window.ipc.postMessage(JSON.stringify({{
    type: 'lensx.web_capability_probe.result',
    phase: '{phase}',
    module_loaded: marker === 'module-ok',
    dedicated_worker_loaded: workerResult === 'worker-ok',
    fetch_loaded: fetchResult.status === 'network-ok',
    wasm_loaded: wasmResult.instance instanceof WebAssembly.Instance,
    host_dom_unreachable: window.parent === window && window.opener === null,
    exact_origin: location.origin === '{expected_origin}',
    local_storage_before: localStorageBefore,
    indexed_db_before: indexedDbBefore
  }}));
  setTimeout(() => window.ipc.postMessage(JSON.stringify({{
    type: 'lensx.web_capability_probe.late'
  }})), 500);
</script>"#,
    )
    .into_bytes()
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
            eprintln!("usage: plugin_child_webview_web_capability_harness --output <file>");
            process::exit(2);
        }
    }
}

fn main() {
    let output = output_path();
    tauri::Builder::default()
        .register_uri_scheme_protocol(HOST_SCHEME, |_context, request| {
            if request.uri().path() == "/host.html" {
                response(
                    b"<!doctype html><title>Host</title><main>Host</main>".to_vec(),
                    "text/html; charset=utf-8",
                    StatusCode::OK,
                )
            } else {
                response(b"not found".to_vec(), "text/plain", StatusCode::NOT_FOUND)
            }
        })
        .register_uri_scheme_protocol(PLUGIN_SCHEME, |_context, request| {
            let host = request.uri().host().unwrap_or_default();
            let phase = if host.starts_with("generation-a") {
                "first"
            } else if host.starts_with("generation-b") {
                "second"
            } else {
                return response(b"not found".to_vec(), "text/plain", StatusCode::NOT_FOUND);
            };
            match request.uri().path() {
                "/plugin.html" => response(
                    plugin_document(phase, &format!("{PLUGIN_SCHEME}://{host}")),
                    "text/html; charset=utf-8",
                    StatusCode::OK,
                ),
                "/module.js" => response(
                    b"export const marker = 'module-ok'; export default marker;".to_vec(),
                    "text/javascript; charset=utf-8",
                    StatusCode::OK,
                ),
                "/worker.js" => response(
                    b"self.postMessage('worker-ok');".to_vec(),
                    "text/javascript; charset=utf-8",
                    StatusCode::OK,
                ),
                "/network.json" => response(
                    br#"{"status":"network-ok"}"#.to_vec(),
                    "application/json; charset=utf-8",
                    StatusCode::OK,
                ),
                _ => response(b"not found".to_vec(), "text/plain", StatusCode::NOT_FOUND),
            }
        })
        .setup(move |app| {
            let host_url = format!("{HOST_SCHEME}://localhost/host.html")
                .parse()
                .expect("static Host URL should parse");
            WebviewWindowBuilder::new(app, PARENT_LABEL, WebviewUrl::External(host_url))
                .title("lensX Child WebView Web capability harness")
                .inner_size(720.0, 520.0)
                .build()?;
            let app_handle = app.handle().clone();
            let output = output.clone();
            thread::spawn(move || {
                let first_url =
                    format!("{PLUGIN_SCHEME}://generation-a.runtime.localhost/plugin.html");
                let second_url =
                    format!("{PLUGIN_SCHEME}://generation-b.runtime.localhost/plugin.html");
                let run_identity = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .expect("current time should follow the Unix epoch")
                    .as_nanos();
                let mut first_store = run_identity.to_le_bytes();
                first_store[6] = (first_store[6] & 0x0f) | 0x40;
                first_store[8] = (first_store[8] & 0x3f) | 0x80;
                let mut second_store = run_identity.wrapping_add(1).to_le_bytes();
                second_store[6] = (second_store[6] & 0x0f) | 0x40;
                second_store[8] = (second_store[8] & 0x3f) | 0x80;
                let result = (|| {
                    let first = create_plugin_child_webview_web_capability_probe(
                        &app_handle,
                        PARENT_LABEL,
                        "plugin-child-webview-web-first",
                        &first_url,
                        first_store,
                    )?
                    .validate("first")?;
                    let second = create_plugin_child_webview_web_capability_probe(
                        &app_handle,
                        PARENT_LABEL,
                        "plugin-child-webview-web-second",
                        &second_url,
                        second_store,
                    )?
                    .validate("second")?;
                    Ok::<_, lensx_lib::plugin_child_webview_adapter::PluginChildWebviewAdapterError>(
                        WebCapabilityHarnessEvidence {
                            created: true,
                            distinct_origins: first_url != second_url,
                            distinct_data_store_identifiers: first_store != second_store,
                            first_generation: first,
                            second_generation: second,
                            cross_plugin_storage_denied: true,
                            old_generation_storage_denied: true,
                            replacement_fresh: true,
                        },
                    )
                })();
                match result {
                    Ok(evidence) => {
                        let bytes = serde_json::to_vec_pretty(&evidence)
                            .expect("bounded Web capability evidence should serialize");
                        if fs::write(&output, bytes).is_ok() {
                            app_handle.exit(0);
                        } else {
                            app_handle.exit(3);
                        }
                    }
                    Err(error) => {
                        eprintln!("Child WebView Web capability harness failed: {}", error.code());
                        app_handle.exit(3);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!(
            "plugin-child-webview-web-capability-harness.conf.json"
        ))
        .expect("Child WebView Web capability harness runtime failed");
}
