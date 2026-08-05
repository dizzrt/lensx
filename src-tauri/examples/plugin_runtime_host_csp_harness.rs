#![allow(linker_messages)] // The standalone harness intentionally links its own generated Tauri context.

fn main() {
    #[cfg(not(target_os = "macos"))]
    compile_error!("the production Host CSP harness is intentionally macOS-only");

    tauri::Builder::default()
        .run(tauri::generate_context!(
            "plugin-runtime-host-csp-harness.conf.json"
        ))
        .expect("production Host CSP harness failed");
}
