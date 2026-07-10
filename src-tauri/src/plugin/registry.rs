use serde::Serialize;
use std::collections::{HashMap, HashSet};

use super::manifest::{validate_manifest, PluginAction, PluginManifest, PluginPage, PluginPermission};

#[derive(Clone, Debug, Default, Serialize)]
pub struct PluginRegistrySnapshot {
  pub plugins: Vec<PluginManifest>,
  pub pages: Vec<PluginPage>,
  pub actions: Vec<PluginAction>,
  pub permissions: Vec<PluginPermission>,
}

#[derive(Clone, Debug, Default)]
pub struct PluginRegistry {
  plugins: HashMap<String, PluginManifest>,
  pages: HashMap<String, PluginPage>,
  actions: HashMap<String, PluginAction>,
  permissions: HashMap<String, PluginPermission>,
}

impl PluginRegistry {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn register(&mut self, manifest: PluginManifest) -> Result<(), Vec<String>> {
    validate_manifest(&manifest)?;
    self.validate_global_ids(&manifest)?;

    for page in &manifest.pages {
      self.pages.insert(page.id.clone(), page.clone());
    }
    for action in &manifest.actions {
      self.actions.insert(action.id.clone(), action.clone());
    }
    for permission in &manifest.permissions {
      self.permissions.insert(permission.id.clone(), permission.clone());
    }

    self.plugins.insert(manifest.id.clone(), manifest);
    Ok(())
  }

  pub fn plugin(&self, id: &str) -> Option<&PluginManifest> {
    self.plugins.get(id)
  }

  pub fn page(&self, id: &str) -> Option<&PluginPage> {
    self.pages.get(id)
  }

  pub fn action(&self, id: &str) -> Option<&PluginAction> {
    self.actions.get(id)
  }

  pub fn permission(&self, id: &str) -> Option<&PluginPermission> {
    self.permissions.get(id)
  }

  pub fn snapshot(&self) -> PluginRegistrySnapshot {
    PluginRegistrySnapshot {
      plugins: self.plugins.values().cloned().collect(),
      pages: self.pages.values().cloned().collect(),
      actions: self.actions.values().cloned().collect(),
      permissions: self.permissions.values().cloned().collect(),
    }
  }

  fn validate_global_ids(&self, manifest: &PluginManifest) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    let existing_ids = self.global_ids();
    let candidate_ids = std::iter::once(manifest.id.as_str())
      .chain(manifest.pages.iter().map(|page| page.id.as_str()))
      .chain(manifest.actions.iter().map(|action| action.id.as_str()))
      .chain(manifest.permissions.iter().map(|permission| permission.id.as_str()));

    for id in candidate_ids {
      if existing_ids.contains(id) {
        errors.push(format!("global duplicate ID {id}"));
      }
    }

    if errors.is_empty() {
      Ok(())
    } else {
      Err(errors)
    }
  }

  fn global_ids(&self) -> HashSet<&str> {
    self
      .plugins
      .keys()
      .chain(self.pages.keys())
      .chain(self.actions.keys())
      .chain(self.permissions.keys())
      .map(String::as_str)
      .collect()
  }
}

pub fn builtin_plugin_manifests() -> Vec<PluginManifest> {
  Vec::new()
}

pub fn load_default_registry() -> Result<PluginRegistry, Vec<String>> {
  let mut registry = PluginRegistry::new();

  for manifest in builtin_plugin_manifests() {
    registry.register(manifest)?;
  }

  Ok(registry)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::plugin::manifest::{PluginLifecycle, PluginRuntime, PluginSource};

  fn manifest(id: &str) -> PluginManifest {
    PluginManifest {
      id: id.to_string(),
      name: "Test".to_string(),
      version: "0.1.0".to_string(),
      source: PluginSource::Builtin,
      lifecycle: PluginLifecycle {
        uninstallable: false,
        disableable: true,
      },
      runtime: PluginRuntime::VueModule {
        module: "empty".to_string(),
      },
      pages: Vec::new(),
      actions: Vec::new(),
      permissions: Vec::new(),
      sdk: None,
      host_api: None,
      sidecar: None,
    }
  }

  #[test]
  fn rejects_global_duplicate_plugin_ids() {
    let mut registry = PluginRegistry::new();
    registry.register(manifest("lensx.test.one")).unwrap();

    assert!(registry.register(manifest("lensx.test.one")).is_err());
  }
}
