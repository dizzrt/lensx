use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, Manager};

const COLLECTIONS_FILE_NAME: &str = "launcher-action-collections.json";
const COLLECTIONS_VERSION: u32 = 1;
pub const COLLECTION_LIMIT: usize = 8;
const COLLECTIONS_READ_FAILED: &str = "launcher_action_collections_read_failed";
const COLLECTIONS_INVALID: &str = "launcher_action_collections_invalid";
const COLLECTIONS_WRITE_FAILED: &str = "launcher_action_collections_write_failed";
const COLLECTIONS_CAPACITY_REACHED: &str = "launcher_action_collections_capacity_reached";
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LauncherActionCollections {
    pub version: u32,
    pub recent_action_ids: Vec<String>,
    pub pinned_action_ids: Vec<String>,
}

impl Default for LauncherActionCollections {
    fn default() -> Self {
        Self {
            version: COLLECTIONS_VERSION,
            recent_action_ids: Vec::new(),
            pinned_action_ids: Vec::new(),
        }
    }
}

impl LauncherActionCollections {
    fn validate(&self, operation: &'static str) -> Result<(), LauncherActionCollectionsError> {
        if self.version != COLLECTIONS_VERSION
            || !is_valid_collection(&self.recent_action_ids)
            || !is_valid_collection(&self.pinned_action_ids)
        {
            return Err(LauncherActionCollectionsError::invalid(operation));
        }
        Ok(())
    }

    fn record_use(&self, action_id: &str) -> Result<Self, LauncherActionCollectionsError> {
        validate_action_id(action_id, "record_use")?;
        let mut recent_action_ids = Vec::with_capacity(COLLECTION_LIMIT);
        recent_action_ids.push(action_id.to_owned());
        recent_action_ids.extend(
            self.recent_action_ids
                .iter()
                .filter(|existing| existing.as_str() != action_id)
                .take(COLLECTION_LIMIT - 1)
                .cloned(),
        );
        let next = Self {
            version: COLLECTIONS_VERSION,
            recent_action_ids,
            pinned_action_ids: self.pinned_action_ids.clone(),
        };
        next.validate("record_use")?;
        Ok(next)
    }

    fn set_pinned(
        &self,
        action_id: &str,
        pinned: bool,
    ) -> Result<Self, LauncherActionCollectionsError> {
        validate_action_id(action_id, "set_pinned")?;
        let mut pinned_action_ids = self.pinned_action_ids.clone();
        if pinned {
            if !pinned_action_ids
                .iter()
                .any(|existing| existing == action_id)
            {
                if pinned_action_ids.len() >= COLLECTION_LIMIT {
                    return Err(LauncherActionCollectionsError::capacity());
                }
                pinned_action_ids.push(action_id.to_owned());
            }
        } else {
            pinned_action_ids.retain(|existing| existing != action_id);
        }

        let next = Self {
            version: COLLECTIONS_VERSION,
            recent_action_ids: self.recent_action_ids.clone(),
            pinned_action_ids,
        };
        next.validate("set_pinned")?;
        Ok(next)
    }
}

fn validate_action_id(
    action_id: &str,
    operation: &'static str,
) -> Result<(), LauncherActionCollectionsError> {
    if is_valid_action_id(action_id) {
        Ok(())
    } else {
        Err(LauncherActionCollectionsError::invalid(operation))
    }
}

fn is_valid_action_id(action_id: &str) -> bool {
    if action_id.is_empty() || action_id.len() > 255 {
        return false;
    }
    let segments = action_id.split('.').collect::<Vec<_>>();
    segments.len() >= 3
        && segments.iter().all(|segment| {
            segment.len() <= 64
                && segment
                    .as_bytes()
                    .first()
                    .is_some_and(|first| first.is_ascii_lowercase())
                && segment.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || byte == b'_'
                        || byte == b'-'
                })
        })
}

fn is_valid_collection(action_ids: &[String]) -> bool {
    if action_ids.len() > COLLECTION_LIMIT {
        return false;
    }
    let mut seen = HashSet::with_capacity(action_ids.len());
    action_ids
        .iter()
        .all(|action_id| is_valid_action_id(action_id) && seen.insert(action_id.as_str()))
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct LauncherActionCollectionsError {
    pub code: &'static str,
    pub operation: &'static str,
    pub message: &'static str,
}

impl LauncherActionCollectionsError {
    fn read() -> Self {
        Self {
            code: COLLECTIONS_READ_FAILED,
            operation: "read",
            message: "Launcher action collections could not be read.",
        }
    }

    fn invalid(operation: &'static str) -> Self {
        Self {
            code: COLLECTIONS_INVALID,
            operation,
            message: "Launcher action collections are invalid.",
        }
    }

    fn write(operation: &'static str) -> Self {
        Self {
            code: COLLECTIONS_WRITE_FAILED,
            operation,
            message: "Launcher action collections could not be saved.",
        }
    }

    fn capacity() -> Self {
        Self {
            code: COLLECTIONS_CAPACITY_REACHED,
            operation: "set_pinned",
            message: "The pinned action collection is full.",
        }
    }
}

#[derive(Clone, Debug)]
struct LauncherActionCollectionsStore {
    file_path: PathBuf,
}

impl LauncherActionCollectionsStore {
    fn new(config_dir: impl AsRef<Path>) -> Self {
        Self {
            file_path: config_dir.as_ref().join(COLLECTIONS_FILE_NAME),
        }
    }

    fn read(&self) -> Result<LauncherActionCollections, LauncherActionCollectionsError> {
        let contents = match fs::read(&self.file_path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(LauncherActionCollections::default());
            }
            Err(_) => return Err(LauncherActionCollectionsError::read()),
        };
        let collections = serde_json::from_slice::<LauncherActionCollections>(&contents)
            .map_err(|_| LauncherActionCollectionsError::invalid("read"))?;
        collections.validate("read")?;
        Ok(collections)
    }

    fn write(
        &self,
        collections: LauncherActionCollections,
        operation: &'static str,
    ) -> Result<LauncherActionCollections, LauncherActionCollectionsError> {
        collections.validate(operation)?;
        let parent = self
            .file_path
            .parent()
            .ok_or_else(|| LauncherActionCollectionsError::write(operation))?;
        fs::create_dir_all(parent).map_err(|_| LauncherActionCollectionsError::write(operation))?;
        let contents = serde_json::to_vec_pretty(&collections)
            .map_err(|_| LauncherActionCollectionsError::write(operation))?;
        let temp_path = self.temp_file_path();
        let write_result = (|| {
            let mut temp_file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temp_path)
                .map_err(|_| LauncherActionCollectionsError::write(operation))?;
            temp_file
                .write_all(&contents)
                .and_then(|_| temp_file.write_all(b"\n"))
                .and_then(|_| temp_file.sync_all())
                .map_err(|_| LauncherActionCollectionsError::write(operation))?;
            fs::rename(&temp_path, &self.file_path)
                .map_err(|_| LauncherActionCollectionsError::write(operation))
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        write_result?;
        Ok(collections)
    }

    fn temp_file_path(&self) -> PathBuf {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        self.file_path.with_file_name(format!(
            ".{COLLECTIONS_FILE_NAME}.{}.{}.tmp",
            std::process::id(),
            sequence
        ))
    }
}

fn collections_store(
    app: &AppHandle,
    operation: &'static str,
) -> Result<LauncherActionCollectionsStore, LauncherActionCollectionsError> {
    let config_dir = app.path().app_config_dir().map_err(|_| match operation {
        "read" => LauncherActionCollectionsError::read(),
        _ => LauncherActionCollectionsError::write(operation),
    })?;
    Ok(LauncherActionCollectionsStore::new(config_dir))
}

#[tauri::command]
pub fn read_launcher_action_collections(
    app: AppHandle,
) -> Result<LauncherActionCollections, LauncherActionCollectionsError> {
    collections_store(&app, "read")?.read()
}

#[tauri::command]
pub fn record_launcher_action_use(
    app: AppHandle,
    action_id: String,
) -> Result<LauncherActionCollections, LauncherActionCollectionsError> {
    let store = collections_store(&app, "record_use")?;
    let next = store.read()?.record_use(&action_id)?;
    store.write(next, "record_use")
}

#[tauri::command]
pub fn set_launcher_action_pinned(
    app: AppHandle,
    action_id: String,
    pinned: bool,
) -> Result<LauncherActionCollections, LauncherActionCollectionsError> {
    let store = collections_store(&app, "set_pinned")?;
    let next = store.read()?.set_pinned(&action_id, pinned)?;
    store.write(next, "set_pinned")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

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
                "lensx-launcher-collections-{test_name}-{}-{nonce}",
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

    fn action_id(index: usize) -> String {
        format!("lensx.core.action_{index}")
    }

    #[test]
    fn missing_file_returns_versioned_empty_collections() {
        let directory = TestDirectory::new("defaults");
        let store = LauncherActionCollectionsStore::new(&directory.path);
        assert_eq!(
            store.read().expect("defaults should load"),
            LauncherActionCollections::default()
        );
    }

    #[test]
    fn valid_collections_round_trip_and_replace_atomically() {
        let directory = TestDirectory::new("round-trip");
        let store = LauncherActionCollectionsStore::new(&directory.path);
        let saved = LauncherActionCollections::default()
            .record_use(&action_id(1))
            .expect("use should record")
            .set_pinned(&action_id(2), true)
            .expect("pin should record");
        assert_eq!(
            store
                .write(saved.clone(), "set_pinned")
                .expect("write should succeed"),
            saved
        );
        assert_eq!(store.read().expect("saved data should load"), saved);
        let names = fs::read_dir(&directory.path)
            .expect("directory should remain readable")
            .map(|entry| entry.expect("entry should be readable").file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![COLLECTIONS_FILE_NAME]);
    }

    #[test]
    fn strict_read_rejects_duplicate_invalid_over_limit_unknown_fields_and_versions() {
        let directory = TestDirectory::new("invalid");
        let store = LauncherActionCollectionsStore::new(&directory.path);
        let invalid_documents = [
            serde_json::json!({"version": 2, "recent_action_ids": [], "pinned_action_ids": []}),
            serde_json::json!({"version": 1, "recent_action_ids": [action_id(1), action_id(1)], "pinned_action_ids": []}),
            serde_json::json!({"version": 1, "recent_action_ids": ["Invalid.Action"], "pinned_action_ids": []}),
            serde_json::json!({"version": 1, "recent_action_ids": [], "pinned_action_ids": (0..9).map(action_id).collect::<Vec<_>>()}),
            serde_json::json!({"version": 1, "recent_action_ids": [], "pinned_action_ids": [], "extra": true}),
        ];
        for document in invalid_documents {
            fs::write(
                &store.file_path,
                serde_json::to_vec(&document).expect("fixture should serialize"),
            )
            .expect("fixture should write");
            assert_eq!(
                store.read().expect_err("invalid data should fail"),
                LauncherActionCollectionsError::invalid("read")
            );
        }
    }

    #[test]
    fn record_use_deduplicates_moves_to_front_and_truncates_mru() {
        let mut collections = LauncherActionCollections::default();
        for index in 0..9 {
            collections = collections
                .record_use(&action_id(index))
                .expect("use should record");
        }
        assert_eq!(collections.recent_action_ids.len(), COLLECTION_LIMIT);
        assert_eq!(collections.recent_action_ids[0], action_id(8));
        assert_eq!(collections.recent_action_ids[7], action_id(1));
        collections = collections
            .record_use(&action_id(4))
            .expect("existing use should move");
        assert_eq!(collections.recent_action_ids[0], action_id(4));
        assert_eq!(
            collections
                .recent_action_ids
                .iter()
                .filter(|id| **id == action_id(4))
                .count(),
            1
        );
    }

    #[test]
    fn pinning_preserves_order_is_idempotent_and_rejects_full_collection() {
        let mut collections = LauncherActionCollections::default();
        for index in 0..COLLECTION_LIMIT {
            collections = collections
                .set_pinned(&action_id(index), true)
                .expect("pin should succeed");
        }
        assert_eq!(
            collections
                .set_pinned(&action_id(8), true)
                .expect_err("full collection should reject"),
            LauncherActionCollectionsError::capacity()
        );
        let unchanged = collections
            .set_pinned(&action_id(2), true)
            .expect("duplicate pin should be idempotent");
        assert_eq!(unchanged, collections);
        let unpinned = collections
            .set_pinned(&action_id(2), false)
            .expect("unpin should succeed");
        assert_eq!(
            unpinned.pinned_action_ids,
            [
                action_id(0),
                action_id(1),
                action_id(3),
                action_id(4),
                action_id(5),
                action_id(6),
                action_id(7)
            ]
        );
    }

    #[test]
    fn atomic_write_failure_leaves_confirmed_file_unchanged_and_cleans_temp_file() {
        let directory = TestDirectory::new("write-failure");
        let store = LauncherActionCollectionsStore::new(&directory.path);
        let confirmed = LauncherActionCollections::default();
        store
            .write(confirmed.clone(), "set_pinned")
            .expect("initial write should succeed");

        let blocking_directory = directory.path.join("blocked-target");
        fs::create_dir(&blocking_directory).expect("blocking directory should exist");
        let blocked_store = LauncherActionCollectionsStore {
            file_path: blocking_directory,
        };
        assert_eq!(
            blocked_store
                .write(confirmed.clone(), "set_pinned")
                .expect_err("rename over directory should fail"),
            LauncherActionCollectionsError::write("set_pinned")
        );
        assert_eq!(
            store.read().expect("confirmed file should remain"),
            confirmed
        );
        let leftovers = fs::read_dir(&directory.path)
            .expect("directory should remain readable")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn errors_serialize_with_stable_safe_fields_only() {
        let serialized = serde_json::to_value(LauncherActionCollectionsError::write("record_use"))
            .expect("error should serialize");
        assert_eq!(
            serialized,
            serde_json::json!({
                "code": "launcher_action_collections_write_failed",
                "operation": "record_use",
                "message": "Launcher action collections could not be saved."
            })
        );
        assert!(!serialized
            .to_string()
            .contains(std::env::temp_dir().to_string_lossy().as_ref()));
    }
}
