mod id;
mod manifest;
mod registry;
mod sources;

pub use manifest::{sidecar_status, PluginManifest, SidecarStatus};
pub use registry::{load_default_registry, PluginRegistrySnapshot};

use std::path::{Path, PathBuf};

use crate::host_api::{HostApiDispatcher, HostApiMethod, HostApiRequest, HostApiResult};

#[tauri::command]
pub fn get_plugin_registry() -> Result<PluginRegistrySnapshot, String> {
  load_default_registry()
    .map(|registry| {
      let _ = registry.plugin("");
      let _ = registry.page("");
      let _ = registry.action("");
      let _ = registry.permission("");
      registry.snapshot()
    })
    .map_err(|errors| errors.join("\n"))
}

#[tauri::command]
pub fn read_external_plugin_manifest(install_dir: String) -> Result<PluginManifest, String> {
  sources::read_external_manifest(Path::new(&install_dir))
}

#[tauri::command]
pub fn resolve_external_plugin_entry(install_dir: String, entry: String) -> Result<String, String> {
  let path: PathBuf = sources::resolve_plugin_resource(Path::new(&install_dir), Path::new(&entry))?;
  Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_plugin_sidecar_status(manifest: PluginManifest) -> SidecarStatus {
  sidecar_status(&manifest)
}

#[tauri::command]
pub fn call_host_api(request: HostApiRequest) -> HostApiResult {
  HostApiDispatcher::with_default_methods().call(request)
}

#[tauri::command]
pub fn get_host_api_methods() -> Vec<HostApiMethod> {
  HostApiDispatcher::with_default_methods().methods()
}
