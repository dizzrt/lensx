use std::{
  fs,
  path::{Path, PathBuf},
};

use super::manifest::{validate_manifest, PluginManifest};

pub fn read_external_manifest(install_dir: &Path) -> Result<PluginManifest, String> {
  let install_dir = canonical_existing_dir(install_dir)?;
  let manifest_path = resolve_inside_install_dir(&install_dir, Path::new("manifest.json"))?;
  let manifest_json = fs::read_to_string(&manifest_path)
    .map_err(|source| format!("failed to read {}: {source}", manifest_path.display()))?;
  let manifest: PluginManifest =
    serde_json::from_str(&manifest_json).map_err(|source| format!("invalid manifest JSON: {source}"))?;

  validate_manifest(&manifest).map_err(|errors| errors.join("\n"))?;
  Ok(manifest)
}

pub fn resolve_plugin_resource(install_dir: &Path, relative_path: &Path) -> Result<PathBuf, String> {
  let install_dir = canonical_existing_dir(install_dir)?;
  resolve_inside_install_dir(&install_dir, relative_path)
}

fn canonical_existing_dir(path: &Path) -> Result<PathBuf, String> {
  let canonical = path
    .canonicalize()
    .map_err(|source| format!("failed to canonicalize {}: {source}", path.display()))?;

  if !canonical.is_dir() {
    return Err(format!("plugin install path is not a directory: {}", canonical.display()));
  }

  Ok(canonical)
}

fn resolve_inside_install_dir(install_dir: &Path, relative_path: &Path) -> Result<PathBuf, String> {
  if relative_path.is_absolute() {
    return Err("plugin resource path must be relative".to_string());
  }

  let candidate = install_dir.join(relative_path);
  let canonical = if candidate.exists() {
    candidate
      .canonicalize()
      .map_err(|source| format!("failed to canonicalize {}: {source}", candidate.display()))?
  } else {
    normalize_virtual_path(&candidate)
  };

  if !canonical.starts_with(install_dir) {
    return Err(format!(
      "plugin resource escapes install directory: {}",
      relative_path.display()
    ));
  }

  Ok(canonical)
}

fn normalize_virtual_path(path: &Path) -> PathBuf {
  let mut normalized = PathBuf::new();

  for component in path.components() {
    match component {
      std::path::Component::CurDir => {}
      std::path::Component::ParentDir => {
        normalized.pop();
      }
      other => normalized.push(other.as_os_str()),
    }
  }

  normalized
}

#[cfg(test)]
mod tests {
  use super::resolve_plugin_resource;
  use std::path::Path;

  #[test]
  fn rejects_absolute_resource_paths() {
    assert!(resolve_plugin_resource(Path::new("."), Path::new("/tmp/file")).is_err());
  }
}
