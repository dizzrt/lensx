use serde::{Deserialize, Serialize};
use std::{collections::HashMap, error::Error, fmt, fs, io, path::PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const PREFERENCES_FILE_NAME: &str = "preferences.json";
const MAX_RECENT_ACTIONS: usize = 10;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
  Light,
  Dark,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct PluginAliasOverride {
  pub added_aliases: Vec<String>,
  pub disabled_default_aliases: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct AppPreferences {
  pub theme_mode: ThemeMode,
  #[serde(default)]
  pub plugin_alias_overrides: HashMap<String, PluginAliasOverride>,
  #[serde(default)]
  pub recent_action_ids: Vec<String>,
  #[serde(default)]
  pub pinned_action_ids: Vec<String>,
}

impl Default for AppPreferences {
  fn default() -> Self {
    Self {
      theme_mode: ThemeMode::Light,
      plugin_alias_overrides: HashMap::new(),
      recent_action_ids: Vec::new(),
      pinned_action_ids: Vec::new(),
    }
  }
}

#[derive(Clone, Debug, Deserialize, Default, Eq, PartialEq)]
pub struct UpdateAppPreferencesRequest {
  pub theme_mode: Option<ThemeMode>,
  pub plugin_alias_overrides: Option<HashMap<String, PluginAliasOverride>>,
  pub recent_action_ids: Option<Vec<String>>,
  pub pinned_action_ids: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct RecordLauncherActionRequest {
  pub action_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct SetLauncherActionPinnedRequest {
  pub action_id: String,
  pub pinned: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PreferenceFileStatus {
  Ok,
  Missing,
  Corrupted,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AppPreferencesState {
  pub preferences: AppPreferences,
  pub file_status: PreferenceFileStatus,
  pub diagnostic: Option<String>,
}

#[derive(Debug)]
pub enum PreferencesError {
  ConfigDir(tauri::Error),
  Io { path: PathBuf, source: io::Error },
  Serialize(serde_json::Error),
  InvalidActionId,
}

impl fmt::Display for PreferencesError {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::ConfigDir(source) => write!(formatter, "failed to resolve app config directory: {source}"),
      Self::Io { path, source } => write!(
        formatter,
        "failed to access preferences file {}: {source}",
        path.display()
      ),
      Self::Serialize(source) => write!(formatter, "failed to serialize preferences: {source}"),
      Self::InvalidActionId => write!(formatter, "action_id must not be empty"),
    }
  }
}

impl Error for PreferencesError {
  fn source(&self) -> Option<&(dyn Error + 'static)> {
    match self {
      Self::ConfigDir(source) => Some(source),
      Self::Io { source, .. } => Some(source),
      Self::Serialize(source) => Some(source),
      Self::InvalidActionId => None,
    }
  }
}

pub struct PreferencesStore {
  path: PathBuf,
}

impl PreferencesStore {
  pub fn new(path: PathBuf) -> Self {
    Self { path }
  }

  pub fn read(&self) -> AppPreferencesState {
    match fs::read_to_string(&self.path) {
      Ok(content) => match serde_json::from_str::<AppPreferences>(&content) {
        Ok(preferences) => AppPreferencesState {
          preferences,
          file_status: PreferenceFileStatus::Ok,
          diagnostic: None,
        },
        Err(error) => AppPreferencesState {
          preferences: AppPreferences::default(),
          file_status: PreferenceFileStatus::Corrupted,
          diagnostic: Some(error.to_string()),
        },
      },
      Err(error) if error.kind() == io::ErrorKind::NotFound => AppPreferencesState {
        preferences: AppPreferences::default(),
        file_status: PreferenceFileStatus::Missing,
        diagnostic: None,
      },
      Err(error) => AppPreferencesState {
        preferences: AppPreferences::default(),
        file_status: PreferenceFileStatus::Corrupted,
        diagnostic: Some(error.to_string()),
      },
    }
  }

  pub fn update(&self, request: UpdateAppPreferencesRequest) -> Result<AppPreferencesState, PreferencesError> {
    let mut preferences = self.read().preferences;

    if let Some(theme_mode) = request.theme_mode {
      preferences.theme_mode = theme_mode;
    }
    if let Some(plugin_alias_overrides) = request.plugin_alias_overrides {
      preferences.plugin_alias_overrides = plugin_alias_overrides;
    }
    if let Some(recent_action_ids) = request.recent_action_ids {
      preferences.recent_action_ids = recent_action_ids;
    }
    if let Some(pinned_action_ids) = request.pinned_action_ids {
      preferences.pinned_action_ids = pinned_action_ids;
    }

    self.persist(preferences)
  }

  pub fn record_launcher_action(&self, action_id: String) -> Result<AppPreferencesState, PreferencesError> {
    let action_id = normalize_action_id(action_id)?;
    let mut preferences = self.read().preferences;

    move_action_to_front(&mut preferences.recent_action_ids, action_id);
    preferences.recent_action_ids.truncate(MAX_RECENT_ACTIONS);

    self.persist(preferences)
  }

  pub fn set_launcher_action_pinned(
    &self,
    action_id: String,
    pinned: bool,
  ) -> Result<AppPreferencesState, PreferencesError> {
    let action_id = normalize_action_id(action_id)?;
    let mut preferences = self.read().preferences;

    if pinned {
      move_action_to_front(&mut preferences.pinned_action_ids, action_id);
    } else {
      preferences.pinned_action_ids.retain(|id| id != &action_id);
    }

    self.persist(preferences)
  }

  fn persist(&self, preferences: AppPreferences) -> Result<AppPreferencesState, PreferencesError> {
    self.write(&preferences)?;

    Ok(AppPreferencesState {
      preferences,
      file_status: PreferenceFileStatus::Ok,
      diagnostic: None,
    })
  }

  fn write(&self, preferences: &AppPreferences) -> Result<(), PreferencesError> {
    if let Some(parent) = self.path.parent() {
      fs::create_dir_all(parent).map_err(|source| PreferencesError::Io {
        path: parent.to_path_buf(),
        source,
      })?;
    }

    let content = serde_json::to_string_pretty(preferences).map_err(PreferencesError::Serialize)?;
    fs::write(&self.path, content).map_err(|source| PreferencesError::Io {
      path: self.path.clone(),
      source,
    })
  }
}

fn normalize_action_id(action_id: String) -> Result<String, PreferencesError> {
  let action_id = action_id.trim();
  if action_id.is_empty() {
    return Err(PreferencesError::InvalidActionId);
  }

  Ok(action_id.to_string())
}

fn move_action_to_front(action_ids: &mut Vec<String>, action_id: String) {
  action_ids.retain(|id| id != &action_id);
  action_ids.insert(0, action_id);
}

fn preferences_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, PreferencesError> {
  app
    .path()
    .app_config_dir()
    .map(|config_dir| config_dir.join(PREFERENCES_FILE_NAME))
    .map_err(PreferencesError::ConfigDir)
}

fn preferences_store<R: Runtime>(app: &AppHandle<R>) -> Result<PreferencesStore, PreferencesError> {
  preferences_path(app).map(PreferencesStore::new)
}

#[tauri::command]
pub fn get_app_preferences<R: Runtime>(app: AppHandle<R>) -> Result<AppPreferencesState, String> {
  preferences_store(&app)
    .map(|store| store.read())
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_app_preferences<R: Runtime>(
  app: AppHandle<R>,
  request: UpdateAppPreferencesRequest,
) -> Result<AppPreferencesState, String> {
  preferences_store(&app)
    .and_then(|store| store.update(request))
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn record_launcher_action<R: Runtime>(
  app: AppHandle<R>,
  request: RecordLauncherActionRequest,
) -> Result<AppPreferencesState, String> {
  preferences_store(&app)
    .and_then(|store| store.record_launcher_action(request.action_id))
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_launcher_action_pinned<R: Runtime>(
  app: AppHandle<R>,
  request: SetLauncherActionPinnedRequest,
) -> Result<AppPreferencesState, String> {
  preferences_store(&app)
    .and_then(|store| store.set_launcher_action_pinned(request.action_id, request.pinned))
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn unique_preferences_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir()
      .join(format!("lensx-{name}-{nonce}"))
      .join(PREFERENCES_FILE_NAME)
  }

  #[test]
  fn default_preferences_use_light_theme() {
    assert_eq!(AppPreferences::default().theme_mode, ThemeMode::Light);
    assert!(AppPreferences::default().plugin_alias_overrides.is_empty());
    assert!(AppPreferences::default().recent_action_ids.is_empty());
    assert!(AppPreferences::default().pinned_action_ids.is_empty());
  }

  #[test]
  fn missing_file_returns_default_preferences() {
    let store = PreferencesStore::new(unique_preferences_path("missing"));

    let state = store.read();

    assert_eq!(state.preferences, AppPreferences::default());
    assert_eq!(state.file_status, PreferenceFileStatus::Missing);
    assert!(state.diagnostic.is_none());
  }

  #[test]
  fn update_writes_and_reads_preferences() {
    let path = unique_preferences_path("write");
    let store = PreferencesStore::new(path.clone());

    let updated = store
      .update(UpdateAppPreferencesRequest {
        theme_mode: Some(ThemeMode::Dark),
        ..Default::default()
      })
      .unwrap();
    let read_back = store.read();

    assert_eq!(updated.preferences.theme_mode, ThemeMode::Dark);
    assert_eq!(read_back.preferences.theme_mode, ThemeMode::Dark);
    assert_eq!(read_back.file_status, PreferenceFileStatus::Ok);

    let _ = fs::remove_file(path);
  }

  #[test]
  fn reads_legacy_preferences_without_alias_overrides_or_launcher_history() {
    let path = unique_preferences_path("legacy");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, r#"{"theme_mode":"dark"}"#).unwrap();
    let store = PreferencesStore::new(path.clone());

    let state = store.read();

    assert_eq!(state.preferences.theme_mode, ThemeMode::Dark);
    assert!(state.preferences.plugin_alias_overrides.is_empty());
    assert!(state.preferences.recent_action_ids.is_empty());
    assert!(state.preferences.pinned_action_ids.is_empty());
    assert_eq!(state.file_status, PreferenceFileStatus::Ok);

    let _ = fs::remove_file(path);
  }

  #[test]
  fn update_writes_plugin_alias_overrides() {
    let path = unique_preferences_path("aliases");
    let store = PreferencesStore::new(path.clone());
    let overrides = HashMap::from([(
      "lensx.core.settings".to_string(),
      PluginAliasOverride {
        added_aliases: vec!["prefs".to_string()],
        disabled_default_aliases: vec!["settings".to_string()],
      },
    )]);

    let updated = store
      .update(UpdateAppPreferencesRequest {
        plugin_alias_overrides: Some(overrides.clone()),
        ..Default::default()
      })
      .unwrap();
    let read_back = store.read();

    assert_eq!(updated.preferences.plugin_alias_overrides, overrides);
    assert_eq!(read_back.preferences.plugin_alias_overrides, overrides);
    assert_eq!(read_back.file_status, PreferenceFileStatus::Ok);

    let _ = fs::remove_file(path);
  }

  #[test]
  fn record_launcher_action_deduplicates_truncates_and_persists() {
    let path = unique_preferences_path("recent-actions");
    let store = PreferencesStore::new(path.clone());

    for index in 0..=10 {
      store
        .record_launcher_action(format!("lensx.test.action_{index}"))
        .unwrap();
    }
    let updated = store.record_launcher_action("lensx.test.action_5".to_string()).unwrap();
    let read_back = store.read();

    assert_eq!(updated.preferences.recent_action_ids.len(), MAX_RECENT_ACTIONS);
    assert_eq!(updated.preferences.recent_action_ids[0], "lensx.test.action_5");
    assert!(!updated
      .preferences
      .recent_action_ids
      .contains(&"lensx.test.action_0".to_string()));
    assert_eq!(
      read_back.preferences.recent_action_ids,
      updated.preferences.recent_action_ids
    );

    let _ = fs::remove_file(path);
  }

  #[test]
  fn set_launcher_action_pinned_reorders_and_removes_actions() {
    let path = unique_preferences_path("pinned-actions");
    let store = PreferencesStore::new(path.clone());

    store
      .record_launcher_action("lensx.test.action_recent".to_string())
      .unwrap();
    store
      .set_launcher_action_pinned("lensx.test.action_one".to_string(), true)
      .unwrap();
    store
      .set_launcher_action_pinned("lensx.test.action_two".to_string(), true)
      .unwrap();
    let reordered = store
      .set_launcher_action_pinned("lensx.test.action_one".to_string(), true)
      .unwrap();
    let removed = store
      .set_launcher_action_pinned("lensx.test.action_one".to_string(), false)
      .unwrap();
    let read_back = store.read();

    assert_eq!(
      reordered.preferences.pinned_action_ids,
      vec!["lensx.test.action_one".to_string(), "lensx.test.action_two".to_string()]
    );
    assert_eq!(
      removed.preferences.pinned_action_ids,
      vec!["lensx.test.action_two".to_string()]
    );
    assert_eq!(
      removed.preferences.recent_action_ids,
      vec!["lensx.test.action_recent".to_string()]
    );
    assert_eq!(read_back.preferences, removed.preferences);

    let _ = fs::remove_file(path);
  }

  #[test]
  fn corrupted_file_returns_default_preferences_with_diagnostic() {
    let path = unique_preferences_path("corrupted");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, "{not-json").unwrap();
    let store = PreferencesStore::new(path.clone());

    let state = store.read();

    assert_eq!(state.preferences, AppPreferences::default());
    assert_eq!(state.file_status, PreferenceFileStatus::Corrupted);
    assert!(state.diagnostic.is_some());

    let _ = fs::remove_file(path);
  }

  #[test]
  fn invalid_theme_value_is_rejected_by_deserializer() {
    let result = serde_json::from_str::<AppPreferences>(r#"{"theme_mode":"system"}"#);

    assert!(result.is_err());
  }
}
