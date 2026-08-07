#![allow(linker_messages)]
#![allow(unused_attributes)]

#[path = "plugin_iframe_runtime_harness.rs"]
mod harness;
#[path = "../src/plugin_manifest.rs"]
#[allow(dead_code)]
mod plugin_manifest;
#[path = "../src/plugin_resource_url.rs"]
mod plugin_resource_url;

fn main() {
    harness::main();
}
