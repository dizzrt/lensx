#![allow(dead_code)]

#[path = "../src/plugin_text_clipboard.rs"]
mod plugin_text_clipboard;

fn main() {
    #[cfg(target_os = "macos")]
    plugin_text_clipboard::run_native_smoke().expect("plugin permission native smoke failed");

    #[cfg(not(target_os = "macos"))]
    panic!("plugin permission native smoke requires macOS");
}
