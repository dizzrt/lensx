use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, Manager};

const PREFERENCES_FILE_NAME: &str = "preferences.json";
const PREFERENCES_READ_FAILED: &str = "preferences_read_failed";
const PREFERENCES_INVALID: &str = "preferences_invalid";
const PREFERENCES_WRITE_FAILED: &str = "preferences_write_failed";
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    #[default]
    Light,
    Dark,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub enum AppLocale {
    #[default]
    #[serde(rename = "en-US")]
    EnUs,
    #[serde(rename = "zh-CN")]
    ZhCn,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct AppPreferences {
    pub theme_mode: ThemeMode,
    pub locale: AppLocale,
}

impl AppPreferences {
    fn validate(&self) -> Result<(), AppPreferencesError> {
        // Exhaustive enums make invalid values unrepresentable after deserialization.
        // Keep this validation boundary explicit so future fields must opt in here.
        match (self.theme_mode, self.locale) {
            (ThemeMode::Light | ThemeMode::Dark, AppLocale::EnUs | AppLocale::ZhCn) => Ok(()),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AppPreferencesError {
    pub code: &'static str,
    pub operation: &'static str,
    pub message: &'static str,
}

impl AppPreferencesError {
    fn read() -> Self {
        Self {
            code: PREFERENCES_READ_FAILED,
            operation: "read",
            message: "Application preferences could not be read.",
        }
    }

    fn invalid(operation: &'static str) -> Self {
        Self {
            code: PREFERENCES_INVALID,
            operation,
            message: "Application preferences are invalid.",
        }
    }

    fn write() -> Self {
        Self {
            code: PREFERENCES_WRITE_FAILED,
            operation: "write",
            message: "Application preferences could not be saved.",
        }
    }
}

#[derive(Clone, Debug)]
struct AppPreferencesStore {
    file_path: PathBuf,
}

impl AppPreferencesStore {
    fn new(config_dir: impl AsRef<Path>) -> Self {
        Self {
            file_path: config_dir.as_ref().join(PREFERENCES_FILE_NAME),
        }
    }

    fn read(&self) -> Result<AppPreferences, AppPreferencesError> {
        let contents = match fs::read(&self.file_path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(AppPreferences::default());
            }
            Err(_) => return Err(AppPreferencesError::read()),
        };

        let preferences = serde_json::from_slice::<AppPreferences>(&contents)
            .map_err(|_| AppPreferencesError::invalid("read"))?;
        preferences.validate()?;
        Ok(preferences)
    }

    fn write(&self, preferences: AppPreferences) -> Result<AppPreferences, AppPreferencesError> {
        preferences.validate()?;
        let parent = self
            .file_path
            .parent()
            .ok_or_else(AppPreferencesError::write)?;
        fs::create_dir_all(parent).map_err(|_| AppPreferencesError::write())?;

        let contents =
            serde_json::to_vec_pretty(&preferences).map_err(|_| AppPreferencesError::write())?;
        let temp_path = self.temp_file_path();
        let write_result = (|| {
            let mut temp_file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temp_path)
                .map_err(|_| AppPreferencesError::write())?;
            temp_file
                .write_all(&contents)
                .map_err(|_| AppPreferencesError::write())?;
            temp_file
                .write_all(b"\n")
                .map_err(|_| AppPreferencesError::write())?;
            temp_file
                .sync_all()
                .map_err(|_| AppPreferencesError::write())?;
            fs::rename(&temp_path, &self.file_path).map_err(|_| AppPreferencesError::write())
        })();

        if write_result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        write_result?;
        Ok(preferences)
    }

    fn temp_file_path(&self) -> PathBuf {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temp_name = format!(
            ".{PREFERENCES_FILE_NAME}.{}.{}.tmp",
            std::process::id(),
            sequence
        );
        self.file_path.with_file_name(temp_name)
    }
}

fn app_preferences_store(app: &AppHandle) -> Result<AppPreferencesStore, AppPreferencesError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|_| AppPreferencesError::read())?;
    Ok(AppPreferencesStore::new(config_dir))
}

#[tauri::command]
pub fn read_app_preferences(app: AppHandle) -> Result<AppPreferences, AppPreferencesError> {
    app_preferences_store(&app)?.read()
}

#[tauri::command]
pub fn write_app_preferences(
    app: AppHandle,
    preferences: AppPreferences,
) -> Result<AppPreferences, AppPreferencesError> {
    preferences.validate()?;
    app_preferences_store(&app)
        .map_err(|_| AppPreferencesError::write())?
        .write(preferences)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new(test_name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should follow the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "lensx-app-preferences-{test_name}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self { path }
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn missing_file_returns_safe_defaults() {
        let directory = TestDirectory::new("defaults");
        let store = AppPreferencesStore::new(&directory.path);

        assert_eq!(
            store.read().expect("defaults should load"),
            AppPreferences::default()
        );
    }

    #[test]
    fn valid_preferences_round_trip_and_replace_atomically() {
        let directory = TestDirectory::new("round-trip");
        let store = AppPreferencesStore::new(&directory.path);
        let first = AppPreferences {
            theme_mode: ThemeMode::Dark,
            locale: AppLocale::ZhCn,
        };
        let second = AppPreferences {
            theme_mode: ThemeMode::Light,
            locale: AppLocale::ZhCn,
        };

        assert_eq!(
            store.write(first).expect("first write should succeed"),
            first
        );
        assert_eq!(
            store.write(second).expect("replacement should succeed"),
            second
        );
        assert_eq!(store.read().expect("saved preferences should load"), second);

        let names = fs::read_dir(&directory.path)
            .expect("directory should remain readable")
            .map(|entry| {
                entry
                    .expect("entry should be readable")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        assert_eq!(names, vec![PREFERENCES_FILE_NAME]);
    }

    #[test]
    fn invalid_enum_and_corrupt_json_return_safe_invalid_errors() {
        let directory = TestDirectory::new("invalid");
        let store = AppPreferencesStore::new(&directory.path);

        fs::write(
            &store.file_path,
            br#"{"theme_mode":"system","locale":"en-US"}"#,
        )
        .expect("invalid enum fixture should be written");
        assert_eq!(
            store.read().expect_err("invalid enum should fail"),
            AppPreferencesError::invalid("read")
        );

        fs::write(&store.file_path, b"{not-json").expect("corrupt fixture should be written");
        assert_eq!(
            store.read().expect_err("corrupt JSON should fail"),
            AppPreferencesError::invalid("read")
        );
    }

    #[test]
    fn read_and_write_io_failures_are_stable_and_safe() {
        let directory = TestDirectory::new("io-errors");
        let blocked_file = directory.path.join("blocked");
        fs::write(&blocked_file, b"not a directory").expect("blocking file should be written");
        let store = AppPreferencesStore::new(&blocked_file);

        assert_eq!(
            store.read().expect_err("read should fail"),
            AppPreferencesError::read()
        );
        assert_eq!(
            store
                .write(AppPreferences::default())
                .expect_err("write should fail"),
            AppPreferencesError::write()
        );
    }

    #[test]
    fn errors_serialize_without_internal_paths_or_details() {
        let error = AppPreferencesError::write();
        let serialized = serde_json::to_value(&error).expect("error should serialize");

        assert_eq!(
            serialized,
            serde_json::json!({
                "code": "preferences_write_failed",
                "operation": "write",
                "message": "Application preferences could not be saved."
            })
        );
        assert!(!serialized
            .to_string()
            .contains(std::env::temp_dir().to_string_lossy().as_ref()));
    }
}
