use crate::{
    plugin_installer::{PluginCommitBoundaryError, PluginInstaller},
    plugin_manager::PluginManager,
    plugin_registration::is_valid_plugin_registration_entry_id,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Manager, Runtime, State};

pub const PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION: &str = "0.1.0";
const STORE_FILE: &str = "storage-v1.json";
const STORE_VERSION: u32 = 1;
const MAX_VALUE_BYTES: usize = 256 * 1024;
const MAX_ENTRIES: usize = 1024;
const MAX_USAGE_BYTES: u64 = 1024 * 1024;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const DEFAULT_LIST_LIMIT: usize = 100;
const MAX_LIST_LIMIT: usize = 1000;
const MAX_JSON_DEPTH: usize = 32;
const MAX_DIAGNOSTICS: usize = 32;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginStorageIdentity {
    pub entry_id: String,
    pub plugin_id: String,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum PluginStorageOperation {
    Get {
        key: String,
    },
    Set {
        key: String,
        value: Value,
    },
    Delete {
        key: String,
    },
    List {
        #[serde(skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        limit: Option<u16>,
    },
    GetQuota,
}

impl PluginStorageOperation {
    fn name(&self) -> PluginStorageOperationName {
        match self {
            Self::Get { .. } => PluginStorageOperationName::Get,
            Self::Set { .. } => PluginStorageOperationName::Set,
            Self::Delete { .. } => PluginStorageOperationName::Delete,
            Self::List { .. } => PluginStorageOperationName::List,
            Self::GetQuota => PluginStorageOperationName::GetQuota,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginStorageRequest {
    pub contract_version: String,
    pub identity: PluginStorageIdentity,
    pub operation: PluginStorageOperation,
}

impl PluginStorageRequest {
    fn is_canonical(&self) -> bool {
        self.contract_version == PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION
            && is_valid_plugin_registration_entry_id(&self.identity.entry_id)
            && is_valid_plugin_id(&self.identity.plugin_id)
            && semver::Version::parse(&self.identity.version).is_ok()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginStorageOperationName {
    Get,
    Set,
    Delete,
    List,
    GetQuota,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct StorageGetResult {
    found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct StorageSetResult {
    stored: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct StorageDeleteResult {
    deleted: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StorageListResult {
    keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_cursor: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StorageQuotaResult {
    used_bytes: u64,
    limit_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "operation", content = "result", rename_all = "snake_case")]
enum PluginStorageResultPayload {
    Get(StorageGetResult),
    Set(StorageSetResult),
    Delete(StorageDeleteResult),
    List(StorageListResult),
    GetQuota(StorageQuotaResult),
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginStorageResponse {
    contract_version: String,
    #[serde(flatten)]
    payload: PluginStorageResultPayload,
}

impl PluginStorageResponse {
    fn new(payload: PluginStorageResultPayload) -> Self {
        Self {
            contract_version: PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION.to_owned(),
            payload,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginStorageErrorCode {
    Cancelled,
    Conflict,
    InternalError,
    InvalidParams,
    LimitExceeded,
    Unavailable,
}

impl PluginStorageErrorCode {
    fn message(self) -> &'static str {
        match self {
            Self::Cancelled => "Plugin storage request was cancelled.",
            Self::Conflict => "Plugin storage state changed.",
            Self::InternalError => "Plugin storage request failed.",
            Self::InvalidParams => "Plugin storage parameters are invalid.",
            Self::LimitExceeded => "Plugin storage limit was exceeded.",
            Self::Unavailable => "Plugin storage is unavailable.",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginStorageError {
    contract_version: String,
    code: PluginStorageErrorCode,
    operation: PluginStorageOperationName,
    message: String,
}

impl PluginStorageError {
    fn new(code: PluginStorageErrorCode, operation: PluginStorageOperationName) -> Self {
        Self {
            contract_version: PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION.to_owned(),
            code,
            operation,
            message: code.message().to_owned(),
        }
    }

    #[cfg(test)]
    fn is_canonical(&self) -> bool {
        self.contract_version == PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION
            && self.message == self.code.message()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginStorageDiagnostic {
    pub code: &'static str,
    pub operation: &'static str,
    pub message: &'static str,
}

#[derive(Debug)]
pub struct PluginScopedStorage {
    installer: Arc<PluginInstaller>,
    manager: Arc<PluginManager>,
    cursor_secret: Option<[u8; 32]>,
    degraded: Mutex<HashSet<String>>,
    diagnostics: Mutex<Vec<PluginStorageDiagnostic>>,
    #[cfg(test)]
    write_fault: Mutex<Option<StorageWriteFault>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum StorageFailure {
    Conflict,
    Corrupt,
    Internal,
    InvalidParams,
    LimitExceeded,
    Unavailable,
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum StorageWriteFault {
    BeforeRename,
    AfterRename,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct StorageEntry {
    key: String,
    value: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct StorageEnvelope {
    version: u32,
    revision: u64,
    usage_bytes: u64,
    entries: Vec<StorageEntry>,
}

impl StorageEnvelope {
    fn empty() -> Self {
        Self {
            version: STORE_VERSION,
            revision: 0,
            usage_bytes: 0,
            entries: Vec::new(),
        }
    }
}

impl PluginScopedStorage {
    pub fn initialize(installer: Arc<PluginInstaller>, manager: Arc<PluginManager>) -> Arc<Self> {
        let mut cursor_secret = [0_u8; 32];
        let cursor_secret = getrandom::fill(&mut cursor_secret)
            .ok()
            .map(|()| cursor_secret);
        Arc::new(Self {
            installer,
            manager,
            cursor_secret,
            degraded: Mutex::new(HashSet::new()),
            diagnostics: Mutex::new(Vec::new()),
            #[cfg(test)]
            write_fault: Mutex::new(None),
        })
    }

    pub fn diagnostics(&self) -> Vec<PluginStorageDiagnostic> {
        self.diagnostics
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn execute(
        &self,
        request: PluginStorageRequest,
    ) -> Result<PluginStorageResponse, PluginStorageError> {
        let operation = request.operation.name();
        if !request.is_canonical() {
            return Err(PluginStorageError::new(
                PluginStorageErrorCode::InvalidParams,
                operation,
            ));
        }
        let provisional_key =
            crate::plugin_identity::plugin_record_key(&request.identity.plugin_id);
        let (_guard, data_root) = self
            .installer
            .acquire_data_boundary(&provisional_key)
            .map_err(|failure| map_boundary_failure(failure, operation))?;
        let plugin_key = self
            .manager
            .read_storage_plugin_key(
                &request.identity.entry_id,
                &request.identity.plugin_id,
                &request.identity.version,
            )
            .map_err(|()| {
                PluginStorageError::new(PluginStorageErrorCode::Unavailable, operation)
            })?;
        if plugin_key != provisional_key
            || self.is_degraded(&plugin_key)
            || self.cursor_secret.is_none()
        {
            return Err(PluginStorageError::new(
                PluginStorageErrorCode::Unavailable,
                operation,
            ));
        }
        match self.execute_locked(&data_root, &plugin_key, request.operation) {
            Ok(response) => Ok(response),
            Err(StorageFailure::Corrupt) => {
                self.degrade(&plugin_key);
                Err(PluginStorageError::new(
                    PluginStorageErrorCode::Unavailable,
                    operation,
                ))
            }
            Err(failure) => Err(PluginStorageError::new(map_failure(failure), operation)),
        }
    }

    fn execute_locked(
        &self,
        data_root: &Path,
        plugin_key: &str,
        operation: PluginStorageOperation,
    ) -> Result<PluginStorageResponse, StorageFailure> {
        let namespace = data_root.join(plugin_key);
        match operation {
            PluginStorageOperation::Get { key } => {
                validate_key(&key)?;
                let store = read_store(data_root, &namespace)?;
                let value = store
                    .entries
                    .binary_search_by(|entry| entry.key.as_str().cmp(&key))
                    .ok()
                    .map(|index| store.entries[index].value.clone());
                Ok(PluginStorageResponse::new(PluginStorageResultPayload::Get(
                    StorageGetResult {
                        found: value.is_some(),
                        value,
                    },
                )))
            }
            PluginStorageOperation::Set { key, value } => {
                validate_key(&key)?;
                let value_bytes = validate_value(&value)?;
                let mut store = read_store(data_root, &namespace)?;
                match store
                    .entries
                    .binary_search_by(|entry| entry.key.as_str().cmp(&key))
                {
                    Ok(index) => store.entries[index].value = value,
                    Err(index) => store.entries.insert(index, StorageEntry { key, value }),
                }
                if store.entries.len() > MAX_ENTRIES {
                    return Err(StorageFailure::LimitExceeded);
                }
                let usage = calculate_usage(&store.entries)?;
                if usage > MAX_USAGE_BYTES || value_bytes > MAX_VALUE_BYTES {
                    return Err(StorageFailure::LimitExceeded);
                }
                store.usage_bytes = usage;
                store.revision = store
                    .revision
                    .checked_add(1)
                    .ok_or(StorageFailure::Internal)?;
                self.write_store(data_root, &namespace, &store)?;
                Ok(PluginStorageResponse::new(PluginStorageResultPayload::Set(
                    StorageSetResult { stored: true },
                )))
            }
            PluginStorageOperation::Delete { key } => {
                validate_key(&key)?;
                let mut store = read_store(data_root, &namespace)?;
                let Ok(index) = store
                    .entries
                    .binary_search_by(|entry| entry.key.as_str().cmp(&key))
                else {
                    return Ok(PluginStorageResponse::new(
                        PluginStorageResultPayload::Delete(StorageDeleteResult { deleted: false }),
                    ));
                };
                store.entries.remove(index);
                store.usage_bytes = calculate_usage(&store.entries)?;
                store.revision = store
                    .revision
                    .checked_add(1)
                    .ok_or(StorageFailure::Internal)?;
                self.write_store(data_root, &namespace, &store)?;
                Ok(PluginStorageResponse::new(
                    PluginStorageResultPayload::Delete(StorageDeleteResult { deleted: true }),
                ))
            }
            PluginStorageOperation::List { cursor, limit } => {
                let limit = limit.map(usize::from).unwrap_or(DEFAULT_LIST_LIMIT);
                if !(1..=MAX_LIST_LIMIT).contains(&limit) {
                    return Err(StorageFailure::InvalidParams);
                }
                let store = read_store(data_root, &namespace)?;
                let position = match cursor {
                    Some(cursor) => self.decode_cursor(
                        plugin_key,
                        &cursor,
                        store.revision,
                        store.entries.len(),
                    )?,
                    None => 0,
                };
                let end = position.saturating_add(limit).min(store.entries.len());
                let keys = store.entries[position..end]
                    .iter()
                    .map(|entry| entry.key.clone())
                    .collect();
                let next_cursor = (end < store.entries.len())
                    .then(|| self.encode_cursor(plugin_key, store.revision, end))
                    .transpose()?;
                Ok(PluginStorageResponse::new(
                    PluginStorageResultPayload::List(StorageListResult { keys, next_cursor }),
                ))
            }
            PluginStorageOperation::GetQuota => {
                let store = read_store(data_root, &namespace)?;
                Ok(PluginStorageResponse::new(
                    PluginStorageResultPayload::GetQuota(StorageQuotaResult {
                        used_bytes: store.usage_bytes,
                        limit_bytes: MAX_USAGE_BYTES,
                    }),
                ))
            }
        }
    }

    fn encode_cursor(
        &self,
        plugin_key: &str,
        revision: u64,
        position: usize,
    ) -> Result<String, StorageFailure> {
        let secret = self.cursor_secret.ok_or(StorageFailure::Unavailable)?;
        let payload = format!("v1.{revision}.{position}");
        let mac = cursor_mac(&secret, plugin_key, &payload);
        Ok(format!("{payload}.{mac}"))
    }

    fn decode_cursor(
        &self,
        plugin_key: &str,
        cursor: &str,
        current_revision: u64,
        entry_count: usize,
    ) -> Result<usize, StorageFailure> {
        if cursor.is_empty() || cursor.len() > 1024 || !cursor.is_ascii() {
            return Err(StorageFailure::InvalidParams);
        }
        let parts: Vec<&str> = cursor.split('.').collect();
        if parts.len() != 4 || parts[0] != "v1" || parts[3].len() != 32 {
            return Err(StorageFailure::InvalidParams);
        }
        let revision = parts[1]
            .parse::<u64>()
            .map_err(|_| StorageFailure::InvalidParams)?;
        let position = parts[2]
            .parse::<usize>()
            .map_err(|_| StorageFailure::InvalidParams)?;
        let payload = format!("v1.{revision}.{position}");
        let expected = cursor_mac(
            &self.cursor_secret.ok_or(StorageFailure::Unavailable)?,
            plugin_key,
            &payload,
        );
        if !constant_time_equal(parts[3].as_bytes(), expected.as_bytes()) || position > entry_count
        {
            return Err(StorageFailure::InvalidParams);
        }
        if revision != current_revision {
            return Err(StorageFailure::Conflict);
        }
        Ok(position)
    }

    fn write_store(
        &self,
        data_root: &Path,
        namespace: &Path,
        store: &StorageEnvelope,
    ) -> Result<(), StorageFailure> {
        let bytes = canonical_store_bytes(store)?;
        if bytes.len() as u64 > MAX_FILE_BYTES {
            return Err(StorageFailure::LimitExceeded);
        }
        ensure_real_directory(data_root)?;
        ensure_real_directory(namespace)?;
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temp = namespace.join(format!(
            ".storage-v1.{}.{}.tmp",
            std::process::id(),
            sequence
        ));
        let mut committed = false;
        let result = (|| {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temp)
                .map_err(|_| StorageFailure::Unavailable)?;
            file.write_all(&bytes)
                .and_then(|()| file.flush())
                .and_then(|()| file.sync_all())
                .map_err(|_| StorageFailure::Unavailable)?;
            #[cfg(test)]
            if self.current_write_fault() == Some(StorageWriteFault::BeforeRename) {
                return Err(StorageFailure::Internal);
            }
            fs::rename(&temp, namespace.join(STORE_FILE))
                .map_err(|_| StorageFailure::Unavailable)?;
            committed = true;
            #[cfg(test)]
            if self.current_write_fault() == Some(StorageWriteFault::AfterRename) {
                return Err(StorageFailure::Internal);
            }
            File::open(namespace)
                .and_then(|directory| directory.sync_all())
                .map_err(|_| StorageFailure::Unavailable)
        })();
        if !committed {
            let _ = fs::remove_file(&temp);
        }
        result
    }

    fn is_degraded(&self, plugin_key: &str) -> bool {
        self.degraded
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .contains(plugin_key)
    }

    fn degrade(&self, plugin_key: &str) {
        self.degraded
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(plugin_key.to_owned());
        let mut diagnostics = self
            .diagnostics
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if diagnostics.len() == MAX_DIAGNOSTICS {
            diagnostics.remove(0);
        }
        diagnostics.push(PluginStorageDiagnostic {
            code: "namespace_unavailable",
            operation: "validate",
            message: "A plugin storage namespace is unavailable.",
        });
    }

    #[cfg(test)]
    fn set_write_fault(&self, fault: Option<StorageWriteFault>) {
        *self
            .write_fault
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = fault;
    }

    #[cfg(test)]
    fn current_write_fault(&self) -> Option<StorageWriteFault> {
        *self
            .write_fault
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn map_boundary_failure(
    failure: PluginCommitBoundaryError,
    operation: PluginStorageOperationName,
) -> PluginStorageError {
    let _ = failure;
    PluginStorageError::new(PluginStorageErrorCode::Unavailable, operation)
}

fn map_failure(failure: StorageFailure) -> PluginStorageErrorCode {
    match failure {
        StorageFailure::Conflict => PluginStorageErrorCode::Conflict,
        StorageFailure::InvalidParams => PluginStorageErrorCode::InvalidParams,
        StorageFailure::LimitExceeded => PluginStorageErrorCode::LimitExceeded,
        StorageFailure::Unavailable => PluginStorageErrorCode::Unavailable,
        StorageFailure::Corrupt | StorageFailure::Internal => PluginStorageErrorCode::InternalError,
    }
}

fn validate_key(key: &str) -> Result<(), StorageFailure> {
    let count = key.chars().count();
    if !(1..=256).contains(&count)
        || key
            .chars()
            .any(|character| (character as u32) <= 0x1f || character == '\u{7f}')
    {
        return Err(StorageFailure::InvalidParams);
    }
    Ok(())
}

fn is_valid_plugin_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value.split('.').count() >= 2
        && value.split('.').all(|segment| {
            !segment.is_empty()
                && segment.len() <= 64
                && segment
                    .bytes()
                    .next()
                    .is_some_and(|byte| byte.is_ascii_lowercase())
                && segment.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || byte == b'_'
                        || byte == b'-'
                })
        })
}

fn validate_value(value: &Value) -> Result<usize, StorageFailure> {
    validate_depth(value, 0)?;
    let bytes = serde_json::to_vec(value).map_err(|_| StorageFailure::InvalidParams)?;
    if bytes.len() > MAX_VALUE_BYTES {
        return Err(StorageFailure::LimitExceeded);
    }
    Ok(bytes.len())
}

fn validate_depth(value: &Value, depth: usize) -> Result<(), StorageFailure> {
    if depth > MAX_JSON_DEPTH {
        return Err(StorageFailure::LimitExceeded);
    }
    match value {
        Value::Array(values) => {
            for value in values {
                validate_depth(value, depth + 1)?;
            }
        }
        Value::Object(values) => {
            for value in values.values() {
                validate_depth(value, depth + 1)?;
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
    Ok(())
}

fn calculate_usage(entries: &[StorageEntry]) -> Result<u64, StorageFailure> {
    let mut usage = 0_u64;
    for entry in entries {
        validate_key(&entry.key).map_err(|_| StorageFailure::Corrupt)?;
        let value_bytes = validate_value(&entry.value).map_err(|failure| match failure {
            StorageFailure::LimitExceeded | StorageFailure::InvalidParams => {
                StorageFailure::Corrupt
            }
            other => other,
        })?;
        usage = usage
            .checked_add(entry.key.len() as u64)
            .and_then(|current| current.checked_add(value_bytes as u64))
            .ok_or(StorageFailure::Corrupt)?;
    }
    Ok(usage)
}

fn read_store(data_root: &Path, namespace: &Path) -> Result<StorageEnvelope, StorageFailure> {
    match safe_metadata(data_root)? {
        None => return Ok(StorageEnvelope::empty()),
        Some(metadata) if metadata.is_dir() => {}
        Some(_) => return Err(StorageFailure::Corrupt),
    }
    match safe_metadata(namespace)? {
        None => return Ok(StorageEnvelope::empty()),
        Some(metadata) if metadata.is_dir() => {}
        Some(_) => return Err(StorageFailure::Corrupt),
    }
    for entry in fs::read_dir(namespace).map_err(|_| StorageFailure::Corrupt)? {
        let entry = entry.map_err(|_| StorageFailure::Corrupt)?;
        let name = entry.file_name();
        let name = name.to_str().ok_or(StorageFailure::Corrupt)?;
        if name.starts_with(".storage-v1.") && name.ends_with(".tmp") {
            return Err(StorageFailure::Corrupt);
        }
    }
    let path = namespace.join(STORE_FILE);
    let Some(metadata) = safe_metadata(&path)? else {
        return Ok(StorageEnvelope::empty());
    };
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES {
        return Err(StorageFailure::Corrupt);
    }
    let file = File::open(&path).map_err(|_| StorageFailure::Corrupt)?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| StorageFailure::Corrupt)?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(StorageFailure::Corrupt);
    }
    let store: StorageEnvelope =
        serde_json::from_slice(&bytes).map_err(|_| StorageFailure::Corrupt)?;
    validate_store(&store)?;
    if canonical_store_bytes(&store).map_err(|_| StorageFailure::Corrupt)? != bytes {
        return Err(StorageFailure::Corrupt);
    }
    Ok(store)
}

fn validate_store(store: &StorageEnvelope) -> Result<(), StorageFailure> {
    if store.version != STORE_VERSION || store.entries.len() > MAX_ENTRIES {
        return Err(StorageFailure::Corrupt);
    }
    if store
        .entries
        .windows(2)
        .any(|pair| pair[0].key >= pair[1].key)
    {
        return Err(StorageFailure::Corrupt);
    }
    let usage = calculate_usage(&store.entries)?;
    if usage != store.usage_bytes || usage > MAX_USAGE_BYTES {
        return Err(StorageFailure::Corrupt);
    }
    Ok(())
}

fn canonical_store_bytes(store: &StorageEnvelope) -> Result<Vec<u8>, StorageFailure> {
    let mut bytes = serde_json::to_vec(store).map_err(|_| StorageFailure::Internal)?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn safe_metadata(path: &Path) -> Result<Option<fs::Metadata>, StorageFailure> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(StorageFailure::Corrupt),
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(StorageFailure::Corrupt),
    }
}

fn ensure_real_directory(path: &Path) -> Result<(), StorageFailure> {
    match safe_metadata(path)? {
        Some(metadata) if metadata.is_dir() => Ok(()),
        Some(_) => Err(StorageFailure::Corrupt),
        None => fs::create_dir(path).map_err(|_| StorageFailure::Unavailable),
    }
}

fn cursor_mac(secret: &[u8; 32], plugin_key: &str, payload: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret);
    hasher.update(plugin_key.as_bytes());
    hasher.update([0]);
    hasher.update(payload.as_bytes());
    hasher
        .finalize()
        .iter()
        .take(16)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

#[tauri::command]
pub fn plugin_scoped_storage(
    storage: State<'_, Arc<PluginScopedStorage>>,
    request: PluginStorageRequest,
) -> Result<PluginStorageResponse, PluginStorageError> {
    storage.execute(request)
}

pub fn setup_plugin_scoped_storage<R: Runtime>(
    app: &AppHandle<R>,
    installer: Arc<PluginInstaller>,
    manager: Arc<PluginManager>,
) -> Arc<PluginScopedStorage> {
    let storage = PluginScopedStorage::initialize(installer, manager);
    let managed = app.manage(Arc::clone(&storage));
    debug_assert!(
        managed,
        "Plugin Scoped Storage state should only be managed once"
    );
    storage
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_installation_contract::LocalPluginInstallationResult,
        plugin_installer::CleanupDataPolicy,
        plugin_manager::current_plugin_host_versions,
        plugin_registration::{PluginRegistrationChangedEvent, PluginRegistrationEventEmitter},
    };
    use serde::Deserialize;
    use serde_json::json;
    use std::{
        path::PathBuf,
        sync::Barrier,
        thread,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time should follow the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "lensx-plugin-storage-{name}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test root should exist");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[derive(Default)]
    struct FakeEmitter;

    impl PluginRegistrationEventEmitter for FakeEmitter {
        fn emit_registration_changed(
            &self,
            _payload: &PluginRegistrationChangedEvent,
        ) -> Result<(), ()> {
            Ok(())
        }
    }

    fn valid_package() -> Vec<u8> {
        fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../fixtures/plugin-package-format/valid/complete-compatible.lxp"),
        )
        .expect("valid package should exist")
    }

    fn setup(
        name: &str,
    ) -> (
        TestDirectory,
        Arc<PluginManager>,
        Arc<PluginInstaller>,
        Arc<PluginScopedStorage>,
        PluginStorageIdentity,
    ) {
        let directory = TestDirectory::new(name);
        let manager = PluginManager::recover(
            directory.0.join("config"),
            current_plugin_host_versions("0.1.0"),
        );
        let installer = PluginInstaller::initialize(
            Ok(directory.0.join("local-data").join("plugins")),
            Arc::clone(&manager),
        );
        let installed = installer
            .install_bytes(&valid_package(), &FakeEmitter)
            .expect("plugin should install");
        let LocalPluginInstallationResult::Installed {
            plugin_id, version, ..
        } = installed
        else {
            panic!("fixture installation should complete");
        };
        let entry_id = manager
            .read_registration_snapshot()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                crate::plugin_registration::PluginRegistrationSummary::Registered {
                    entry_id,
                    plugin_id: current,
                    ..
                } if current == plugin_id => Some(entry_id),
                _ => None,
            })
            .expect("installed entry should exist");
        let identity = PluginStorageIdentity {
            entry_id,
            plugin_id,
            version,
        };
        let storage = PluginScopedStorage::initialize(Arc::clone(&installer), Arc::clone(&manager));
        (directory, manager, installer, storage, identity)
    }

    fn request(
        identity: &PluginStorageIdentity,
        operation: PluginStorageOperation,
    ) -> PluginStorageRequest {
        PluginStorageRequest {
            contract_version: PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION.to_owned(),
            identity: identity.clone(),
            operation,
        }
    }

    fn execute_value(
        storage: &PluginScopedStorage,
        identity: &PluginStorageIdentity,
        operation: PluginStorageOperation,
    ) -> Value {
        serde_json::to_value(
            storage
                .execute(request(identity, operation))
                .expect("operation should succeed"),
        )
        .expect("response should serialize")
    }

    #[test]
    fn shared_typescript_and_rust_contract_fixtures_agree() {
        #[derive(Deserialize)]
        struct FixtureFile {
            valid: Vec<Fixture>,
            invalid: Vec<Fixture>,
        }
        #[derive(Deserialize)]
        struct Fixture {
            name: String,
            kind: String,
            value: Value,
        }
        let fixtures: FixtureFile = serde_json::from_str(include_str!(
            "../../tests/fixtures/plugin-scoped-storage/cases.json"
        ))
        .expect("fixtures should parse");
        for fixture in fixtures.valid {
            let valid = match fixture.kind.as_str() {
                "request" => serde_json::from_value::<PluginStorageRequest>(fixture.value)
                    .is_ok_and(|request| request.is_canonical()),
                "result" => serde_json::from_value::<PluginStorageResponse>(fixture.value).is_ok(),
                "error" => serde_json::from_value::<PluginStorageError>(fixture.value)
                    .is_ok_and(|error| error.is_canonical()),
                _ => false,
            };
            assert!(valid, "valid fixture rejected: {}", fixture.name);
        }
        for fixture in fixtures.invalid {
            let invalid = match fixture.kind.as_str() {
                "request" => serde_json::from_value::<PluginStorageRequest>(fixture.value)
                    .map_or(true, |request| !request.is_canonical()),
                "result" => serde_json::from_value::<PluginStorageResponse>(fixture.value).is_err(),
                "error" => serde_json::from_value::<PluginStorageError>(fixture.value)
                    .map_or(true, |error| !error.is_canonical()),
                _ => true,
            };
            assert!(invalid, "invalid fixture accepted: {}", fixture.name);
        }
    }

    #[test]
    fn persists_json_enforces_quota_and_pages_with_revision_bound_cursor() {
        let (directory, manager, installer, storage, identity) = setup("roundtrip");
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get {
                    key: "missing".into()
                }
            ),
            json!({"contract_version":"0.1.0","operation":"get","result":{"found":false}})
        );
        assert!(!directory
            .0
            .join("local-data/plugins/data")
            .join(crate::plugin_identity::plugin_record_key(
                &identity.plugin_id
            ))
            .exists());
        execute_value(
            &storage,
            &identity,
            PluginStorageOperation::Set {
                key: "alpha".into(),
                value: json!({"mode":"dark"}),
            },
        );
        execute_value(
            &storage,
            &identity,
            PluginStorageOperation::Set {
                key: "😀".into(),
                value: json!(true),
            },
        );
        let first = execute_value(
            &storage,
            &identity,
            PluginStorageOperation::List {
                cursor: None,
                limit: Some(1),
            },
        );
        assert_eq!(first["result"]["keys"], json!(["alpha"]));
        let cursor = first["result"]["nextCursor"]
            .as_str()
            .expect("cursor should exist");
        let restarted = PluginScopedStorage::initialize(installer, manager);
        assert_eq!(
            execute_value(
                &restarted,
                &identity,
                PluginStorageOperation::Get {
                    key: "alpha".into()
                }
            )["result"],
            json!({"found":true,"value":{"mode":"dark"}})
        );
        let malformed = storage
            .execute(request(
                &identity,
                PluginStorageOperation::List {
                    cursor: Some("forged".into()),
                    limit: None,
                },
            ))
            .expect_err("forged cursor should fail");
        assert_eq!(malformed.code, PluginStorageErrorCode::InvalidParams);
        execute_value(
            &storage,
            &identity,
            PluginStorageOperation::Set {
                key: "beta".into(),
                value: json!(1),
            },
        );
        let stale = storage
            .execute(request(
                &identity,
                PluginStorageOperation::List {
                    cursor: Some(cursor.to_owned()),
                    limit: None,
                },
            ))
            .expect_err("stale cursor should conflict");
        assert_eq!(stale.code, PluginStorageErrorCode::Conflict);
        let quota = execute_value(&storage, &identity, PluginStorageOperation::GetQuota);
        assert_eq!(quota["result"]["limitBytes"], MAX_USAGE_BYTES);
        assert!(quota["result"]["usedBytes"].as_u64().unwrap_or_default() > 0);
    }

    #[test]
    fn invalid_and_limit_failures_preserve_the_previous_value() {
        let (_directory, _manager, _installer, storage, identity) = setup("limits");
        execute_value(
            &storage,
            &identity,
            PluginStorageOperation::Set {
                key: "stable".into(),
                value: json!("old"),
            },
        );
        let oversized = "x".repeat(MAX_VALUE_BYTES + 1);
        let error = storage
            .execute(request(
                &identity,
                PluginStorageOperation::Set {
                    key: "stable".into(),
                    value: json!(oversized),
                },
            ))
            .expect_err("oversized value should fail");
        assert_eq!(error.code, PluginStorageErrorCode::LimitExceeded);
        let mut deep = json!(null);
        for _ in 0..=MAX_JSON_DEPTH {
            deep = json!([deep]);
        }
        let error = storage
            .execute(request(
                &identity,
                PluginStorageOperation::Set {
                    key: "deep".into(),
                    value: deep,
                },
            ))
            .expect_err("deep value should fail");
        assert_eq!(error.code, PluginStorageErrorCode::LimitExceeded);
        let invalid = storage
            .execute(request(
                &identity,
                PluginStorageOperation::Get {
                    key: "bad\nkey".into(),
                },
            ))
            .expect_err("control character should fail");
        assert_eq!(invalid.code, PluginStorageErrorCode::InvalidParams);
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get {
                    key: "stable".into()
                }
            )["result"],
            json!({"found":true,"value":"old"})
        );
    }

    #[test]
    fn atomic_faults_preserve_old_or_committed_new_state() {
        let (directory, _manager, _installer, storage, identity) = setup("atomic");
        execute_value(
            &storage,
            &identity,
            PluginStorageOperation::Set {
                key: "key".into(),
                value: json!("old"),
            },
        );
        storage.set_write_fault(Some(StorageWriteFault::BeforeRename));
        assert!(storage
            .execute(request(
                &identity,
                PluginStorageOperation::Set {
                    key: "key".into(),
                    value: json!("candidate")
                },
            ))
            .is_err());
        storage.set_write_fault(None);
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get { key: "key".into() }
            )["result"]["value"],
            "old"
        );
        let namespace = directory.0.join("local-data/plugins/data").join(
            crate::plugin_identity::plugin_record_key(&identity.plugin_id),
        );
        assert!(fs::read_dir(&namespace)
            .expect("namespace should be readable")
            .all(|entry| !entry
                .expect("entry should be readable")
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")));
        storage.set_write_fault(Some(StorageWriteFault::AfterRename));
        assert!(storage
            .execute(request(
                &identity,
                PluginStorageOperation::Set {
                    key: "key".into(),
                    value: json!("new")
                },
            ))
            .is_err());
        storage.set_write_fault(None);
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get { key: "key".into() }
            )["result"]["value"],
            "new"
        );
    }

    #[test]
    fn corruption_and_disabled_identity_are_isolated_and_diagnostics_are_bounded() {
        let (directory, manager, _installer, storage, identity) = setup("isolation");
        execute_value(
            &storage,
            &identity,
            PluginStorageOperation::Set {
                key: "key".into(),
                value: json!(true),
            },
        );
        let store = directory
            .0
            .join("local-data/plugins/data")
            .join(crate::plugin_identity::plugin_record_key(
                &identity.plugin_id,
            ))
            .join(STORE_FILE);
        fs::write(&store, b"{\"version\":99}\n").expect("corrupt store should be written");
        let error = storage
            .execute(request(&identity, PluginStorageOperation::GetQuota))
            .expect_err("corrupt namespace should degrade");
        assert_eq!(error.code, PluginStorageErrorCode::Unavailable);
        let diagnostic = storage
            .diagnostics()
            .pop()
            .expect("diagnostic should exist");
        assert_eq!(diagnostic.code, "namespace_unavailable");
        assert!(!diagnostic.message.contains(&identity.plugin_id));
        manager
            .set_enabled(&identity.plugin_id, false)
            .expect("plugin should disable");
        let error = storage
            .execute(request(&identity, PluginStorageOperation::GetQuota))
            .expect_err("disabled identity should fail");
        assert_eq!(error.code, PluginStorageErrorCode::Unavailable);
    }

    #[test]
    fn replacement_disable_retain_reinstall_and_delete_data_share_lifecycle_boundary() {
        let (directory, manager, installer, storage, mut identity) = setup("lifecycle");
        execute_value(
            &storage,
            &identity,
            PluginStorageOperation::Set {
                key: "state".into(),
                value: json!({"step":1}),
            },
        );
        manager
            .set_enabled(&identity.plugin_id, false)
            .expect("plugin should disable");
        assert_eq!(
            storage
                .execute(request(&identity, PluginStorageOperation::GetQuota))
                .expect_err("disabled plugin should lose access")
                .code,
            PluginStorageErrorCode::Unavailable
        );
        manager
            .set_enabled(&identity.plugin_id, true)
            .expect("plugin should enable");
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get {
                    key: "state".into()
                }
            )["result"]["value"],
            json!({"step":1})
        );

        let current = manager
            .registration(&identity.plugin_id)
            .expect("registration should exist");
        let mut replacement = current.manifest.clone();
        replacement.version = "1.2.4".to_owned();
        manager
            .replace_entry(
                &identity.entry_id,
                &manager.registration_revision(),
                replacement,
                current.facts.clone(),
            )
            .expect("same identity replacement should commit");
        assert_eq!(
            storage
                .execute(request(&identity, PluginStorageOperation::GetQuota))
                .expect_err("old version should lose access")
                .code,
            PluginStorageErrorCode::Unavailable
        );
        identity.version = "1.2.4".to_owned();
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get {
                    key: "state".into()
                }
            )["result"]["value"],
            json!({"step":1})
        );

        installer
            .uninstall(
                &identity.entry_id,
                &manager.registration_revision(),
                CleanupDataPolicy::RetainData,
            )
            .expect("retain-data uninstall should complete");
        assert!(storage
            .execute(request(&identity, PluginStorageOperation::GetQuota))
            .is_err());
        let reinstalled = installer
            .install_bytes(&valid_package(), &FakeEmitter)
            .expect("same identity should reinstall");
        let LocalPluginInstallationResult::Installed { version, .. } = reinstalled else {
            panic!("reinstall should complete");
        };
        identity.version = version;
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get {
                    key: "state".into()
                }
            )["result"]["value"],
            json!({"step":1})
        );

        installer
            .uninstall(
                &identity.entry_id,
                &manager.registration_revision(),
                CleanupDataPolicy::DeleteData,
            )
            .expect("delete-data uninstall should complete");
        let namespace = directory.0.join("local-data/plugins/data").join(
            crate::plugin_identity::plugin_record_key(&identity.plugin_id),
        );
        assert!(!namespace.exists());
        assert!(storage
            .execute(request(
                &identity,
                PluginStorageOperation::Set {
                    key: "late".into(),
                    value: json!(true)
                },
            ))
            .is_err());
        assert!(!namespace.exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_namespace_degrades_without_following_external_target() {
        use std::os::unix::fs::symlink;

        let (directory, _manager, _installer, storage, identity) = setup("symlink");
        let data_root = directory.0.join("local-data/plugins/data");
        fs::create_dir_all(&data_root).expect("data root should exist");
        let external = directory.0.join("external");
        fs::create_dir(&external).expect("external target should exist");
        let namespace = data_root.join(crate::plugin_identity::plugin_record_key(
            &identity.plugin_id,
        ));
        symlink(&external, &namespace).expect("namespace symlink should exist");
        let error = storage
            .execute(request(&identity, PluginStorageOperation::GetQuota))
            .expect_err("symlinked namespace should fail");
        assert_eq!(error.code, PluginStorageErrorCode::Unavailable);
        assert!(fs::read_dir(&external)
            .expect("external target should remain readable")
            .next()
            .is_none());
    }

    #[test]
    fn concurrent_writes_serialize_and_unrelated_plugin_namespaces_are_isolated() {
        let (_directory, manager, _installer, storage, identity) = setup("concurrent");
        let barrier = Arc::new(Barrier::new(8));
        let mut threads = Vec::new();
        for index in 0..8 {
            let barrier = Arc::clone(&barrier);
            let storage = Arc::clone(&storage);
            let identity = identity.clone();
            threads.push(thread::spawn(move || {
                barrier.wait();
                storage.execute(request(
                    &identity,
                    PluginStorageOperation::Set {
                        key: format!("key-{index}"),
                        value: json!(index),
                    },
                ))
            }));
        }
        for thread in threads {
            thread
                .join()
                .expect("storage thread should not panic")
                .expect("concurrent write should serialize");
        }
        let keys = execute_value(
            &storage,
            &identity,
            PluginStorageOperation::List {
                cursor: None,
                limit: Some(100),
            },
        );
        assert_eq!(keys["result"]["keys"].as_array().map(Vec::len), Some(8));

        let current = manager
            .registration(&identity.plugin_id)
            .expect("first registration should exist");
        let mut second_manifest = current.manifest.clone();
        second_manifest.plugin_id = "com.acme.second".to_owned();
        manager
            .register(second_manifest, current.facts.clone())
            .expect("second registration should succeed");
        let second_entry_id = manager
            .read_registration_snapshot()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                crate::plugin_registration::PluginRegistrationSummary::Registered {
                    entry_id,
                    plugin_id,
                    ..
                } if plugin_id == "com.acme.second" => Some(entry_id),
                _ => None,
            })
            .expect("second entry should exist");
        let second = PluginStorageIdentity {
            entry_id: second_entry_id,
            plugin_id: "com.acme.second".to_owned(),
            version: current.manifest.version,
        };
        execute_value(
            &storage,
            &second,
            PluginStorageOperation::Set {
                key: "key-0".into(),
                value: json!("second"),
            },
        );
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get {
                    key: "key-0".into()
                },
            )["result"]["value"],
            json!(0)
        );
        assert_eq!(
            execute_value(
                &storage,
                &second,
                PluginStorageOperation::Get {
                    key: "key-0".into()
                },
            )["result"]["value"],
            "second"
        );
    }

    #[test]
    fn tauri_command_accepts_only_local_host_invocation_and_returns_strict_storage_result() {
        use tauri::{
            ipc::{CallbackFn, InvokeBody},
            test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY},
            webview::InvokeRequest,
            WebviewWindowBuilder,
        };

        let (_directory, _manager, _installer, storage, identity) = setup("tauri-command");
        let app = mock_builder()
            .manage(Arc::clone(&storage))
            .invoke_handler(tauri::generate_handler![plugin_scoped_storage])
            .build(mock_context(noop_assets()))
            .expect("mock Tauri app should build");
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("mock Webview should build");
        let body = InvokeBody::Json(json!({
            "request": request(
                &identity,
                PluginStorageOperation::Set {
                    key: "through-tauri".into(),
                    value: json!({"real":true}),
                },
            ),
        }));
        let response = get_ipc_response(
            &webview,
            InvokeRequest {
                cmd: "plugin_scoped_storage".into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().expect("local URL should parse"),
                body: body.clone(),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_owned(),
            },
        )
        .expect("local Host invocation should succeed")
        .deserialize::<Value>()
        .expect("Tauri response should deserialize");
        assert_eq!(
            response,
            json!({"contract_version":"0.1.0","operation":"set","result":{"stored":true}})
        );

        let remote = get_ipc_response(
            &webview,
            InvokeRequest {
                cmd: "plugin_scoped_storage".into(),
                callback: CallbackFn(2),
                error: CallbackFn(3),
                url: identity_url(),
                body,
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_owned(),
            },
        );
        assert!(
            remote.is_err(),
            "plugin Runtime origin must not invoke Tauri directly"
        );
        assert_eq!(
            execute_value(
                &storage,
                &identity,
                PluginStorageOperation::Get {
                    key: "through-tauri".into(),
                },
            )["result"]["value"],
            json!({"real":true})
        );
    }

    fn identity_url() -> url::Url {
        "https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost"
            .parse()
            .expect("plugin Runtime URL should parse")
    }
}
