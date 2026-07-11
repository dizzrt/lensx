use serde::{Deserialize, Serialize};
use std::{error::Error, fmt, fs, io, path::PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const PREFERENCES_FILE_NAME: &str = "preferences.json";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
  Light,
  Dark,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct AppPreferences {
  pub theme_mode: ThemeMode,
}

impl Default for AppPreferences {
  fn default() -> Self {
    Self {
      theme_mode: ThemeMode::Light,
    }
  }
}

#[derive(Clone, Debug, Deserialize, Default, Eq, PartialEq)]
pub struct UpdateAppPreferencesRequest {
  pub theme_mode: Option<ThemeMode>,
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
    }
  }
}

impl Error for PreferencesError {
  fn source(&self) -> Option<&(dyn Error + 'static)> {
    match self {
      Self::ConfigDir(source) => Some(source),
      Self::Io { source, .. } => Some(source),
      Self::Serialize(source) => Some(source),
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
      })
      .unwrap();
    let read_back = store.read();

    assert_eq!(updated.preferences.theme_mode, ThemeMode::Dark);
    assert_eq!(read_back.preferences.theme_mode, ThemeMode::Dark);
    assert_eq!(read_back.file_status, PreferenceFileStatus::Ok);

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
