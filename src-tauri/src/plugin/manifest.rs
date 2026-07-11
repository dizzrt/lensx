use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::id::validate_lensx_id;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginDisplayNames {
  pub en: String,
  #[serde(default)]
  pub locales: HashMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginLifecycle {
  pub uninstallable: bool,
  pub disableable: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "ui", rename_all = "snake_case")]
pub enum PluginRuntime {
  VueModule {
    module: String,
  },
  Iframe {
    entry: String,
    sandbox: Option<Vec<String>>,
  },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginSidecar {
  pub enabled: bool,
  pub command: Option<String>,
  pub args: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginCompatibility {
  pub min_version: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginPermission {
  pub id: String,
  pub plugin_id: String,
  pub title: String,
  pub description: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginPage {
  pub id: String,
  pub plugin_id: String,
  pub title: String,
  pub entry: String,
  pub parent_page_id: Option<String>,
  pub required_permissions: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginAction {
  pub id: String,
  pub plugin_id: String,
  pub title: String,
  pub target_page_id: String,
  pub required_permissions: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginSource {
  Builtin,
  External,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginManifest {
  pub id: String,
  pub display_names: PluginDisplayNames,
  #[serde(default)]
  pub default_aliases: Vec<String>,
  pub version: String,
  pub source: PluginSource,
  pub lifecycle: PluginLifecycle,
  pub runtime: PluginRuntime,
  pub pages: Vec<PluginPage>,
  pub actions: Vec<PluginAction>,
  pub permissions: Vec<PluginPermission>,
  pub sdk: Option<PluginCompatibility>,
  pub host_api: Option<PluginCompatibility>,
  pub sidecar: Option<PluginSidecar>,
}

#[derive(Clone, Debug, Serialize)]
pub struct SidecarStatus {
  pub supported: bool,
  pub enabled: bool,
  pub message: String,
}

pub fn sidecar_status(manifest: &PluginManifest) -> SidecarStatus {
  SidecarStatus {
    supported: false,
    enabled: manifest
      .sidecar
      .as_ref()
      .map(|sidecar| sidecar.enabled)
      .unwrap_or(false),
    message: "sidecar execution is reserved and disabled in this phase".to_string(),
  }
}

pub fn validate_manifest(manifest: &PluginManifest) -> Result<(), Vec<String>> {
  let mut errors = Vec::new();
  let mut local_ids = HashSet::new();
  let mut page_ids = HashSet::new();
  let mut permission_ids = HashSet::new();

  validate_required_string(&manifest.display_names.en, "display_names.en", &mut errors);
  for (locale, name) in &manifest.display_names.locales {
    validate_required_string(locale, "display_names.locales locale", &mut errors);
    validate_required_string(name, &format!("display_names.locales.{locale}"), &mut errors);
  }
  validate_default_aliases(&manifest.default_aliases, &mut errors);
  validate_required_string(&manifest.version, "version", &mut errors);
  collect_id(&manifest.id, "plugin.id", &mut local_ids, &mut errors);

  match &manifest.runtime {
    PluginRuntime::VueModule { module } => validate_required_string(module, "runtime.module", &mut errors),
    PluginRuntime::Iframe { entry, .. } => validate_required_string(entry, "runtime.entry", &mut errors),
  }

  for permission in &manifest.permissions {
    collect_id(
      &permission.id,
      &format!("permission {}", permission.id),
      &mut local_ids,
      &mut errors,
    );
    validate_plugin_id_reference(
      &permission.plugin_id,
      &manifest.id,
      &format!("permission {} plugin_id", permission.id),
      &mut errors,
    );
    validate_required_string(
      &permission.title,
      &format!("permission {} title", permission.id),
      &mut errors,
    );
    permission_ids.insert(permission.id.clone());
  }

  for page in &manifest.pages {
    collect_id(&page.id, &format!("page {}", page.id), &mut local_ids, &mut errors);
    validate_plugin_id_reference(
      &page.plugin_id,
      &manifest.id,
      &format!("page {} plugin_id", page.id),
      &mut errors,
    );
    validate_required_string(&page.title, &format!("page {} title", page.id), &mut errors);
    validate_required_string(&page.entry, &format!("page {} entry", page.id), &mut errors);
    validate_permission_refs(
      &page.id,
      page.required_permissions.as_deref(),
      &permission_ids,
      &mut errors,
    );
    page_ids.insert(page.id.clone());
  }

  for action in &manifest.actions {
    collect_id(
      &action.id,
      &format!("action {}", action.id),
      &mut local_ids,
      &mut errors,
    );
    validate_plugin_id_reference(
      &action.plugin_id,
      &manifest.id,
      &format!("action {} plugin_id", action.id),
      &mut errors,
    );
    validate_required_string(&action.title, &format!("action {} title", action.id), &mut errors);
    if !page_ids.contains(&action.target_page_id) {
      errors.push(format!(
        "action {} references missing target_page_id {}",
        action.id, action.target_page_id
      ));
    }
    validate_permission_refs(
      &action.id,
      action.required_permissions.as_deref(),
      &permission_ids,
      &mut errors,
    );
  }

  if manifest
    .sidecar
    .as_ref()
    .map(|sidecar| sidecar.enabled)
    .unwrap_or(false)
  {
    errors.push("sidecar is reserved and cannot be enabled in this phase".to_string());
  }

  errors.extend(validate_page_cycles(&manifest.pages));

  if errors.is_empty() {
    Ok(())
  } else {
    Err(errors)
  }
}

fn collect_id(id: &str, label: &str, ids: &mut HashSet<String>, errors: &mut Vec<String>) {
  if let Err(error) = validate_lensx_id(id, label) {
    errors.push(error);
  }

  if !ids.insert(id.to_string()) {
    errors.push(format!("duplicate ID {id}"));
  }
}

fn validate_required_string(value: &str, label: &str, errors: &mut Vec<String>) {
  if value.trim().is_empty() {
    errors.push(format!("{label} is required"));
  }
}

fn normalize_alias(value: &str) -> String {
  value.trim().to_lowercase()
}

fn validate_default_aliases(default_aliases: &[String], errors: &mut Vec<String>) {
  let mut aliases = HashSet::new();

  for alias in default_aliases {
    let normalized = normalize_alias(alias);
    if normalized.is_empty() {
      errors.push("default_aliases must not contain empty aliases".to_string());
      continue;
    }

    if !aliases.insert(normalized) {
      errors.push(format!("duplicate default_aliases entry {alias}"));
    }
  }
}

fn validate_plugin_id_reference(value: &str, expected: &str, label: &str, errors: &mut Vec<String>) {
  if value != expected {
    errors.push(format!("{label} must reference plugin_id {expected}, got {value}"));
  }
}

fn validate_permission_refs(
  owner_id: &str,
  permission_refs: Option<&[String]>,
  permission_ids: &HashSet<String>,
  errors: &mut Vec<String>,
) {
  for permission_id in permission_refs.unwrap_or_default() {
    if let Err(error) = validate_lensx_id(permission_id, &format!("{owner_id} required_permission")) {
      errors.push(error);
    }

    if !permission_ids.contains(permission_id) {
      errors.push(format!("{owner_id} references undeclared permission {permission_id}"));
    }
  }
}

fn validate_page_cycles(pages: &[PluginPage]) -> Vec<String> {
  let mut errors = Vec::new();
  let page_ids: HashSet<&str> = pages.iter().map(|page| page.id.as_str()).collect();
  let parent_by_page: HashMap<&str, &str> = pages
    .iter()
    .filter_map(|page| page.parent_page_id.as_deref().map(|parent| (page.id.as_str(), parent)))
    .collect();

  for page in pages {
    if let Some(parent_page_id) = page.parent_page_id.as_deref() {
      if !page_ids.contains(parent_page_id) {
        errors.push(format!(
          "page {} references missing parent_page_id {}",
          page.id, parent_page_id
        ));
      }
    }

    let mut seen = HashSet::new();
    let mut cursor = Some(page.id.as_str());

    while let Some(page_id) = cursor {
      if !seen.insert(page_id) {
        errors.push(format!("page {} forms a parent_page_id cycle at {}", page.id, page_id));
        break;
      }

      cursor = parent_by_page.get(page_id).copied();
    }
  }

  errors
}

#[cfg(test)]
mod tests {
  use super::*;

  fn valid_manifest() -> PluginManifest {
    PluginManifest {
      id: "lensx.test.plugin".to_string(),
      display_names: PluginDisplayNames {
        en: "Test".to_string(),
        locales: HashMap::from([("zh-CN".to_string(), "测试".to_string())]),
      },
      default_aliases: vec!["test".to_string(), "测试".to_string()],
      version: "0.1.0".to_string(),
      source: PluginSource::External,
      lifecycle: PluginLifecycle {
        uninstallable: true,
        disableable: true,
      },
      runtime: PluginRuntime::Iframe {
        entry: "dist/index.html".to_string(),
        sandbox: None,
      },
      pages: vec![PluginPage {
        id: "lensx.test.plugin_page_main".to_string(),
        plugin_id: "lensx.test.plugin".to_string(),
        title: "Main".to_string(),
        entry: "index.html".to_string(),
        parent_page_id: None,
        required_permissions: None,
      }],
      actions: vec![PluginAction {
        id: "lensx.test.plugin_action_open".to_string(),
        plugin_id: "lensx.test.plugin".to_string(),
        title: "Open".to_string(),
        target_page_id: "lensx.test.plugin_page_main".to_string(),
        required_permissions: None,
      }],
      permissions: vec![],
      sdk: None,
      host_api: None,
      sidecar: Some(PluginSidecar {
        enabled: false,
        command: None,
        args: None,
      }),
    }
  }

  #[test]
  fn validates_manifest_references() {
    assert!(validate_manifest(&valid_manifest()).is_ok());
  }

  #[test]
  fn rejects_missing_english_display_name() {
    let mut manifest = valid_manifest();
    manifest.display_names.en = " ".to_string();

    assert!(validate_manifest(&manifest)
      .unwrap_err()
      .iter()
      .any(|error| error.contains("display_names.en")));
  }

  #[test]
  fn rejects_duplicate_default_aliases_case_insensitively() {
    let mut manifest = valid_manifest();
    manifest.default_aliases = vec!["Settings".to_string(), " settings ".to_string()];

    assert!(validate_manifest(&manifest)
      .unwrap_err()
      .iter()
      .any(|error| error.contains("duplicate default_aliases")));
  }

  #[test]
  fn rejects_empty_default_aliases() {
    let mut manifest = valid_manifest();
    manifest.default_aliases = vec![" ".to_string()];

    assert!(validate_manifest(&manifest)
      .unwrap_err()
      .iter()
      .any(|error| error.contains("default_aliases")));
  }

  #[test]
  fn rejects_missing_action_target() {
    let mut manifest = valid_manifest();
    manifest.actions[0].target_page_id = "lensx.test.missing".to_string();

    assert!(validate_manifest(&manifest)
      .unwrap_err()
      .iter()
      .any(|error| error.contains("target_page_id")));
  }

  #[test]
  fn rejects_page_parent_cycle() {
    let mut manifest = valid_manifest();
    manifest.pages[0].parent_page_id = Some(manifest.pages[0].id.clone());

    assert!(validate_manifest(&manifest)
      .unwrap_err()
      .iter()
      .any(|error| error.contains("cycle")));
  }
}
