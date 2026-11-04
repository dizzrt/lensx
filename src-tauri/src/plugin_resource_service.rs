#[cfg(feature = "plugin-development-mode")]
use crate::plugin_development_snapshot::DevelopmentSnapshotStore;
#[cfg(test)]
use crate::plugin_resource_url::{translated_resource_url, MAX_PATH_BYTES, MAX_PATH_SEGMENTS};
use crate::{
    plugin_installer::{prove_managed_payload_root, PluginInstaller},
    plugin_manager::{
        PluginManager, PluginManagerResourceProjection, PluginManagerResourceProjectionError,
    },
    plugin_resource_contract::{
        deserialize_resolve_request, PluginResourceEntry, PluginResourceError,
        PluginResourceErrorCode, ResolvePluginResourceEntryRequest,
        PLUGIN_RESOURCE_CONTRACT_VERSION,
    },
    plugin_resource_url::{
        build_native_resource_url, is_portable_resource_path, parse_plugin_resource_url,
        PluginResourceUrl,
    },
    plugin_runtime_security_policy::current_plugin_runtime_document_csp,
    trusted_app_target::TrustedAppTarget,
};
#[cfg(feature = "plugin-development-mode")]
use std::time::{Duration, UNIX_EPOCH};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, OnceLock},
    time::Instant,
};
use tauri::{http, AppHandle, Manager, Runtime, State};

const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_VERIFIED_CACHE_BYTES: usize = 32 * 1024 * 1024;
const MAX_VERIFIED_CACHE_ENTRIES: usize = 256;
const MAX_SCOPE_ATTEMPTS: usize = 8;
const RESOURCE_CREATION_RESERVATION_MS: u64 = 10_000;
const MAX_RESOURCE_CREATION_RESERVATIONS: usize = 32;
const NOT_FOUND_BODY: &[u8] = b"Plugin resource unavailable.";
const METHOD_NOT_ALLOWED_BODY: &[u8] = b"Plugin resource method unavailable.";
const INTERNAL_BODY: &[u8] = b"Plugin resource request failed.";
#[cfg(test)]
const TEST_PLUGIN_DOCUMENT_CSP: &str = "default-src 'none'; frame-ancestors http://localhost:43123";

#[derive(Clone, Debug, Eq, PartialEq)]
struct ScopeBinding {
    scope: String,
    entry_id: String,
    resource_generation: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct RuntimeResourceAuthority {
    attempt_id: String,
    webview_label: String,
    binding: ScopeBinding,
}

#[cfg(feature = "plugin-development-mode")]
#[derive(Clone, Debug, Eq, PartialEq)]
struct DevelopmentPayloadSealEntry {
    path: String,
    kind: u8,
    length: u64,
    modified: Option<Duration>,
    readonly: bool,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
}

#[cfg(feature = "plugin-development-mode")]
#[derive(Clone, Debug, Eq, PartialEq)]
struct DevelopmentPayloadSeal(Vec<DevelopmentPayloadSealEntry>);

#[derive(Default)]
struct ScopeState {
    by_entry: HashMap<String, ScopeBinding>,
    by_scope: HashMap<String, ScopeBinding>,
    leases: HashMap<String, RuntimeResourceAuthority>,
    reservations: HashMap<String, ResourceCreationReservation>,
    provisional_until: HashMap<String, u64>,
    issued_scopes: HashSet<String>,
    used_attempts: HashSet<String>,
    used_sources: HashSet<String>,
}

#[derive(Clone)]
struct ResourceCreationReservation {
    binding: ScopeBinding,
    expires_at_ms: u64,
}

/// This reservation retains generation bytes, not WebView read authority.
/// Dropping an unconsumed native creation always releases its scope hold.
pub(crate) struct PluginResourceCreationReservation<'a> {
    service: &'a PluginResourceService,
    attempt_id: String,
    pub(crate) entry: PluginResourceEntry,
}

impl Drop for PluginResourceCreationReservation<'_> {
    fn drop(&mut self) {
        self.service.release_creation_reservation(&self.attempt_id);
    }
}

impl ScopeState {
    fn retire(&mut self, binding: &ScopeBinding) {
        self.leases.retain(|_, lease| lease.binding != *binding);
        self.reservations
            .retain(|_, reservation| reservation.binding != *binding);
        self.provisional_until.remove(&binding.scope);
        self.by_scope.remove(&binding.scope);
        if self.by_entry.get(&binding.entry_id) == Some(binding) {
            self.by_entry.remove(&binding.entry_id);
        }
    }

    fn retire_if_unheld(&mut self, binding: &ScopeBinding) {
        if !self.leases.values().any(|lease| lease.binding == *binding)
            && !self
                .reservations
                .values()
                .any(|reservation| reservation.binding == *binding)
        {
            self.retire(binding);
        }
    }

    fn expire(&mut self, now_ms: u64) -> usize {
        let expired = self
            .reservations
            .iter()
            .filter(|(_, reservation)| now_ms >= reservation.expires_at_ms)
            .map(|(attempt, reservation)| (attempt.clone(), reservation.binding.clone()))
            .collect::<Vec<_>>();
        for (attempt, _) in &expired {
            self.reservations.remove(attempt);
        }
        for (_, binding) in &expired {
            self.retire_if_unheld(binding);
        }
        let provisional = self
            .provisional_until
            .iter()
            .filter(|(_, deadline)| now_ms >= **deadline)
            .filter_map(|(scope, _)| self.by_scope.get(scope).cloned())
            .collect::<Vec<_>>();
        for binding in provisional {
            self.retire_if_unheld(&binding);
        }
        expired.len()
    }
}

fn resource_now_ms() -> u64 {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    u64::try_from(EPOCH.get_or_init(Instant::now).elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
enum VerifiedPluginResourcePayloadVariant {
    Installed(String),
    #[cfg(feature = "plugin-development-mode")]
    Development(String),
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct VerifiedPluginResourceCacheKey {
    entry_id: String,
    payload_variant: VerifiedPluginResourcePayloadVariant,
    resource_generation: u64,
    normalized_path: String,
}

#[derive(Clone)]
struct VerifiedPluginResourceCacheValue {
    bytes: Arc<[u8]>,
    mime: &'static str,
    bounded_length: usize,
}

struct VerifiedPluginResourceCacheEntry {
    value: VerifiedPluginResourceCacheValue,
    last_used: u64,
}

#[derive(Default)]
struct VerifiedPluginResourceByteCache {
    entries: HashMap<VerifiedPluginResourceCacheKey, VerifiedPluginResourceCacheEntry>,
    total_bytes: usize,
    clock: u64,
}

impl VerifiedPluginResourceByteCache {
    fn get(
        &mut self,
        key: &VerifiedPluginResourceCacheKey,
    ) -> Option<VerifiedPluginResourceCacheValue> {
        self.clock = self.clock.wrapping_add(1);
        let entry = self.entries.get_mut(key)?;
        entry.last_used = self.clock;
        Some(entry.value.clone())
    }

    fn insert(
        &mut self,
        key: VerifiedPluginResourceCacheKey,
        value: VerifiedPluginResourceCacheValue,
    ) {
        if value.bounded_length > MAX_VERIFIED_CACHE_BYTES {
            return;
        }
        if let Some(previous) = self.entries.remove(&key) {
            self.total_bytes = self
                .total_bytes
                .saturating_sub(previous.value.bounded_length);
        }
        while self.entries.len() >= MAX_VERIFIED_CACHE_ENTRIES
            || self.total_bytes.saturating_add(value.bounded_length) > MAX_VERIFIED_CACHE_BYTES
        {
            let Some(oldest) = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(key, _)| key.clone())
            else {
                return;
            };
            if let Some(evicted) = self.entries.remove(&oldest) {
                self.total_bytes = self
                    .total_bytes
                    .saturating_sub(evicted.value.bounded_length);
            }
        }
        self.clock = self.clock.wrapping_add(1);
        self.total_bytes = self.total_bytes.saturating_add(value.bounded_length);
        self.entries.insert(
            key,
            VerifiedPluginResourceCacheEntry {
                value,
                last_used: self.clock,
            },
        );
    }

    fn evict_entry_generation(&mut self, entry_id: &str, resource_generation: u64) {
        let keys = self
            .entries
            .keys()
            .filter(|key| {
                key.entry_id == entry_id && key.resource_generation == resource_generation
            })
            .cloned()
            .collect::<Vec<_>>();
        for key in keys {
            if let Some(evicted) = self.entries.remove(&key) {
                self.total_bytes = self
                    .total_bytes
                    .saturating_sub(evicted.value.bounded_length);
            }
        }
    }
}

pub struct PluginResourceService {
    manager: Arc<PluginManager>,
    packages_root: Option<PathBuf>,
    html_csp: Arc<str>,
    scopes: Mutex<ScopeState>,
    verified_byte_cache: Mutex<VerifiedPluginResourceByteCache>,
    #[cfg(feature = "plugin-development-mode")]
    development_snapshots: Mutex<Option<Arc<DevelopmentSnapshotStore>>>,
    #[cfg(feature = "plugin-development-mode")]
    development_payload_proofs: Mutex<HashMap<(PathBuf, String), DevelopmentPayloadSeal>>,
    #[cfg(test)]
    read_hook: Mutex<Option<Arc<dyn Fn(ResourceReadHookPoint, &Path) + Send + Sync>>>,
}

#[cfg(feature = "plugin-development-mode")]
fn development_payload_seal(root: &Path) -> Result<DevelopmentPayloadSeal, ()> {
    fn visit(
        root: &Path,
        directory: &Path,
        entries: &mut Vec<DevelopmentPayloadSealEntry>,
    ) -> Result<(), ()> {
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;

        let mut children = fs::read_dir(directory)
            .map_err(|_| ())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| ())?;
        children.sort_by_key(|entry| entry.file_name());
        for child in children {
            if entries.len() >= 4096 {
                return Err(());
            }
            let path = child.path();
            let metadata = fs::symlink_metadata(&path).map_err(|_| ())?;
            let file_type = metadata.file_type();
            let kind = if file_type.is_dir() {
                1
            } else if file_type.is_file() {
                2
            } else {
                return Err(());
            };
            let relative = path.strip_prefix(root).map_err(|_| ())?;
            let relative = relative.to_str().ok_or(())?.replace('\\', "/");
            entries.push(DevelopmentPayloadSealEntry {
                path: relative,
                kind,
                length: metadata.len(),
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|value| value.duration_since(UNIX_EPOCH).ok()),
                readonly: metadata.permissions().readonly(),
                #[cfg(unix)]
                device: metadata.dev(),
                #[cfg(unix)]
                inode: metadata.ino(),
            });
            if file_type.is_dir() {
                visit(root, &path, entries)?;
            }
        }
        Ok(())
    }

    let metadata = fs::symlink_metadata(root).map_err(|_| ())?;
    if !metadata.file_type().is_dir() {
        return Err(());
    }
    let mut entries = Vec::new();
    visit(root, root, &mut entries)?;
    Ok(DevelopmentPayloadSeal(entries))
}

impl PluginResourceService {
    #[cfg(test)]
    pub(crate) fn live_authority_counts(&self) -> (usize, usize, usize) {
        let scopes = self.lock_scopes();
        (
            scopes.by_scope.len(),
            scopes.leases.len(),
            scopes.reservations.len(),
        )
    }
    #[cfg(test)]
    pub fn initialize(manager: Arc<PluginManager>, packages_root: Option<PathBuf>) -> Arc<Self> {
        Self::initialize_with_html_csp(manager, packages_root, Arc::from(TEST_PLUGIN_DOCUMENT_CSP))
    }

    fn initialize_with_html_csp(
        manager: Arc<PluginManager>,
        packages_root: Option<PathBuf>,
        html_csp: Arc<str>,
    ) -> Arc<Self> {
        Arc::new(Self {
            manager,
            packages_root,
            html_csp,
            scopes: Mutex::new(ScopeState::default()),
            verified_byte_cache: Mutex::new(VerifiedPluginResourceByteCache::default()),
            #[cfg(feature = "plugin-development-mode")]
            development_snapshots: Mutex::new(None),
            #[cfg(feature = "plugin-development-mode")]
            development_payload_proofs: Mutex::new(HashMap::new()),
            #[cfg(test)]
            read_hook: Mutex::new(None),
        })
    }

    pub fn resolve_entry(
        &self,
        request: &ResolvePluginResourceEntryRequest,
    ) -> Result<PluginResourceEntry, PluginResourceError> {
        self.resolve_entry_inner(request, None, resource_now_ms())
    }

    pub(crate) fn reserve_entry_for_attempt(
        &self,
        request: &ResolvePluginResourceEntryRequest,
        attempt_id: &str,
    ) -> Result<PluginResourceCreationReservation<'_>, PluginResourceError> {
        let entry = self.resolve_entry_inner(request, Some(attempt_id), resource_now_ms())?;
        Ok(PluginResourceCreationReservation {
            service: self,
            attempt_id: attempt_id.into(),
            entry,
        })
    }

    fn resolve_entry_inner(
        &self,
        request: &ResolvePluginResourceEntryRequest,
        attempt_id: Option<&str>,
        now_ms: u64,
    ) -> Result<PluginResourceEntry, PluginResourceError> {
        if attempt_id.is_some_and(|id| !valid_resource_attempt(id)) {
            return Err(PluginResourceError::new(
                PluginResourceErrorCode::InvalidRequest,
            ));
        }
        let projection = self
            .manager
            .read_resource_projection(&request.entry_id, Some(&request.expected_revision))
            .map_err(map_projection_error)?;
        let payload_root = self.prove_eligible_payload(&projection)?;
        let entry_path = &projection.registration.manifest.runtime.entry;
        let mime = mime_for_path(entry_path)
            .ok_or_else(|| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?;
        let cache_key = verified_cache_key(&projection, entry_path)
            .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?;
        let cache_hit = self
            .verified_byte_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&cache_key)
            .is_some_and(|value| value.mime == mime && value.bounded_length == value.bytes.len());
        if !cache_hit {
            let bytes = read_resource_file(&payload_root, entry_path, self.test_hook())
                .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?;
            let current = self
                .manager
                .read_resource_projection(&projection.entry_id, None)
                .map_err(map_projection_error)?;
            if current.resource_generation != projection.resource_generation
                || current.record_key != projection.record_key
                || self.prove_eligible_payload(&current)? != payload_root
                || verified_cache_key(&current, entry_path)
                    .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?
                    != cache_key
            {
                return Err(PluginResourceError::new(
                    PluginResourceErrorCode::UnsafeState,
                ));
            }
            self.verified_byte_cache
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .insert(
                    cache_key,
                    VerifiedPluginResourceCacheValue {
                        bounded_length: bytes.len(),
                        bytes: Arc::from(bytes),
                        mime,
                    },
                );
        }

        #[cfg(test)]
        if let Some(hook) = self.test_hook() {
            hook(ResourceReadHookPoint::BeforeScopeCommit, &payload_root);
        }
        let mut scopes = self.lock_scopes();
        scopes.expire(now_ms);
        // Revalidate while scope replacement is excluded. A delayed old resolve
        // must never retire a newer generation already installed by a sibling.
        let current = self
            .manager
            .read_resource_projection(&projection.entry_id, None)
            .map_err(map_projection_error)?;
        if current.resource_generation != projection.resource_generation
            || current.record_key != projection.record_key
            || !current.registration.facts.enabled
            || !current.registration.compatibility.lensx
            || !current.registration.compatibility.host_api
        {
            return Err(PluginResourceError::new(
                PluginResourceErrorCode::Unavailable,
            ));
        }
        if attempt_id.is_some_and(|id| scopes.used_attempts.contains(id))
            || (attempt_id.is_some()
                && scopes.reservations.len() >= MAX_RESOURCE_CREATION_RESERVATIONS)
        {
            return Err(PluginResourceError::new(
                PluginResourceErrorCode::Unavailable,
            ));
        }
        // Allocation and its trusted-attempt reservation commit under one mutex.
        // A sibling close can retire either before this point or after it, never between.
        let binding = match scopes.by_entry.get(&projection.entry_id).cloned() {
            Some(existing) if existing.resource_generation == projection.resource_generation => {
                existing
            }
            previous => {
                if let Some(previous) = previous {
                    scopes.retire(&previous);
                    self.evict_verified_generation(
                        &previous.entry_id,
                        previous.resource_generation,
                    );
                }
                let scope = generate_scope(&scopes)?;
                let binding = ScopeBinding {
                    scope: scope.clone(),
                    entry_id: projection.entry_id.clone(),
                    resource_generation: projection.resource_generation,
                };
                scopes.issued_scopes.insert(scope.clone());
                scopes
                    .by_entry
                    .insert(projection.entry_id.clone(), binding.clone());
                scopes.by_scope.insert(scope.clone(), binding.clone());
                // Preflight descriptors cannot authorize reads. They are short-lived
                // candidates until native creation binds a trusted attempt.
                scopes.provisional_until.insert(
                    scope,
                    now_ms.saturating_add(RESOURCE_CREATION_RESERVATION_MS),
                );
                binding
            }
        };
        if let Some(attempt_id) = attempt_id {
            scopes.used_attempts.insert(attempt_id.into());
            scopes.provisional_until.remove(&binding.scope);
            scopes.reservations.insert(
                attempt_id.into(),
                ResourceCreationReservation {
                    binding: binding.clone(),
                    expires_at_ms: now_ms.saturating_add(RESOURCE_CREATION_RESERVATION_MS),
                },
            );
        }
        Ok(resource_entry(
            &projection,
            build_native_resource_url(
                &binding.scope,
                &projection.record_key,
                &projection.registration.manifest.version,
                entry_path,
            ),
        ))
    }

    pub fn handle_request(&self, request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
        self.handle_request_with_source(None, request)
    }

    pub(crate) fn handle_request_from_source(
        &self,
        webview_label: &str,
        request: http::Request<Vec<u8>>,
    ) -> http::Response<Vec<u8>> {
        self.handle_request_with_source(Some(webview_label), request)
    }

    fn handle_request_with_source(
        &self,
        webview_label: Option<&str>,
        request: http::Request<Vec<u8>>,
    ) -> http::Response<Vec<u8>> {
        if request.method() != http::Method::GET && request.method() != http::Method::HEAD {
            return fixed_error(
                http::StatusCode::METHOD_NOT_ALLOWED,
                METHOD_NOT_ALLOWED_BODY,
                true,
            );
        }
        if has_unsupported_read_headers(request.headers()) {
            return fixed_error(http::StatusCode::NOT_FOUND, NOT_FOUND_BODY, false);
        }
        match self.read_request(webview_label, &request) {
            Ok((mime, bytes)) => success_response(
                request.method() == http::Method::HEAD,
                mime,
                bytes,
                &self.html_csp,
            ),
            Err(ProtocolFailure::Unavailable) => {
                fixed_error(http::StatusCode::NOT_FOUND, NOT_FOUND_BODY, false)
            }
            Err(ProtocolFailure::Internal) => fixed_error(
                http::StatusCode::INTERNAL_SERVER_ERROR,
                INTERNAL_BODY,
                false,
            ),
        }
    }

    fn read_request(
        &self,
        webview_label: Option<&str>,
        request: &http::Request<Vec<u8>>,
    ) -> Result<(&'static str, Vec<u8>), ProtocolFailure> {
        let parsed = parse_resource_uri(request.uri()).ok_or(ProtocolFailure::Unavailable)?;
        let binding = {
            let mut scopes = self.lock_scopes();
            scopes.expire(resource_now_ms());
            scopes
                .by_scope
                .get(&parsed.origin_scope)
                .cloned()
                .ok_or(ProtocolFailure::Unavailable)?
        };
        if let Some(webview_label) = webview_label {
            if !self.source_is_current(webview_label, &binding) {
                return Err(ProtocolFailure::Unavailable);
            }
        }
        let projection = self
            .manager
            .read_resource_projection(&binding.entry_id, None)
            .map_err(|error| match error {
                PluginManagerResourceProjectionError::Degraded => ProtocolFailure::Internal,
                PluginManagerResourceProjectionError::StaleRevision
                | PluginManagerResourceProjectionError::NotFound => ProtocolFailure::Unavailable,
            })?;
        if projection.resource_generation != binding.resource_generation
            || projection.record_key != parsed.plugin_key
            || projection.registration.manifest.version != parsed.version
        {
            self.revoke_binding(&binding);
            return Err(ProtocolFailure::Unavailable);
        }
        let payload_root = self
            .prove_eligible_payload(&projection)
            .map_err(|_| ProtocolFailure::Unavailable)?;
        let mime = mime_for_path(&parsed.resource_path).ok_or(ProtocolFailure::Unavailable)?;
        let cache_key = verified_cache_key(&projection, &parsed.resource_path)?;
        let cached = self
            .verified_byte_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&cache_key)
            .filter(|value| value.mime == mime && value.bounded_length == value.bytes.len());
        let cache_hit = cached.is_some();
        let verified_bytes = match cached {
            Some(value) => value,
            None => {
                let bytes =
                    read_resource_file(&payload_root, &parsed.resource_path, self.test_hook())?;
                VerifiedPluginResourceCacheValue {
                    bounded_length: bytes.len(),
                    bytes: Arc::from(bytes),
                    mime,
                }
            }
        };
        #[cfg(test)]
        if let Some(hook) = self.test_hook() {
            hook(
                ResourceReadHookPoint::BeforeDelivery,
                &payload_root.join(&parsed.resource_path),
            );
        }
        let current = self
            .manager
            .read_resource_projection(&binding.entry_id, None)
            .map_err(|_| ProtocolFailure::Unavailable)?;
        let current_payload_root = self
            .prove_eligible_payload(&current)
            .map_err(|_| ProtocolFailure::Unavailable)?;
        if current.resource_generation != binding.resource_generation
            || current.record_key != projection.record_key
            || current.registration.manifest.version != projection.registration.manifest.version
            || current_payload_root != payload_root
            || verified_cache_key(&current, &parsed.resource_path)? != cache_key
        {
            self.evict_verified_generation(&binding.entry_id, binding.resource_generation);
            self.revoke_binding(&binding);
            return Err(ProtocolFailure::Unavailable);
        }
        if self.lock_scopes().by_scope.get(&binding.scope) != Some(&binding) {
            return Err(ProtocolFailure::Unavailable);
        }
        if let Some(webview_label) = webview_label {
            if !self.source_is_current(webview_label, &binding) {
                return Err(ProtocolFailure::Unavailable);
            }
        }
        if !cache_hit {
            self.verified_byte_cache
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .insert(cache_key, verified_bytes.clone());
        }
        let bytes = verified_bytes.bytes.as_ref().to_vec();
        Ok((mime, bytes))
    }

    pub(crate) fn activate_runtime_source(
        &self,
        attempt_id: &str,
        webview_label: &str,
        entry_id: &str,
        resource_generation: u64,
    ) -> bool {
        if !valid_resource_attempt(attempt_id)
            || !crate::plugin_child_webview_adapter::valid_source_label(webview_label)
            || entry_id.is_empty()
            || resource_generation == 0
        {
            return false;
        }
        if !self
            .manager
            .read_resource_projection(entry_id, None)
            .is_ok_and(|projection| {
                projection.resource_generation == resource_generation
                    && self.prove_eligible_payload(&projection).is_ok()
            })
        {
            return false;
        }
        let mut scopes = self.lock_scopes();
        scopes.expire(resource_now_ms());
        let Some(reservation) = scopes
            .reservations
            .get(attempt_id)
            .filter(|reservation| {
                reservation.binding.entry_id == entry_id
                    && reservation.binding.resource_generation == resource_generation
                    && scopes.by_scope.get(&reservation.binding.scope) == Some(&reservation.binding)
            })
            .cloned()
        else {
            return false;
        };
        if scopes.leases.contains_key(attempt_id) || scopes.used_sources.contains(webview_label) {
            return false;
        }
        scopes.reservations.remove(attempt_id);
        scopes.used_sources.insert(webview_label.into());
        scopes.leases.insert(
            attempt_id.into(),
            RuntimeResourceAuthority {
                attempt_id: attempt_id.into(),
                webview_label: webview_label.into(),
                binding: reservation.binding,
            },
        );
        true
    }

    fn release_creation_reservation(&self, attempt_id: &str) -> bool {
        let mut scopes = self.lock_scopes();
        let Some(reservation) = scopes.reservations.remove(attempt_id) else {
            return false;
        };
        scopes.retire_if_unheld(&reservation.binding);
        true
    }

    pub(crate) fn revoke_runtime_source(&self, attempt_id: &str) -> bool {
        let mut scopes = self.lock_scopes();
        scopes.expire(resource_now_ms());
        let authority = scopes.leases.remove(attempt_id);
        let reservation = scopes.reservations.remove(attempt_id);
        let binding = authority
            .map(|authority| authority.binding)
            .or_else(|| reservation.map(|reservation| reservation.binding));
        if let Some(binding) = binding {
            scopes.retire_if_unheld(&binding);
            true
        } else {
            false
        }
    }

    pub(crate) fn revoke_entry_eligibility(&self, entry_id: &str) {
        let retained_generation = {
            let mut scopes = self.lock_scopes();
            // The callback may arrive after a later successful re-enable/reload.
            // Read current Manager facts under the scope mutex so a new scope
            // cannot be installed between this decision and the retirement.
            let retained = self
                .manager
                .read_resource_projection(entry_id, None)
                .ok()
                .filter(|projection| {
                    projection.registration.facts.enabled
                        && projection.registration.compatibility.lensx
                        && projection.registration.compatibility.host_api
                })
                .map(|projection| projection.resource_generation);
            if let Some(binding) = scopes.by_entry.get(entry_id).cloned().filter(|binding| {
                retained.is_none_or(|generation| binding.resource_generation < generation)
            }) {
                scopes.retire(&binding);
            }
            retained
        };
        let mut cache = self
            .verified_byte_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let generations = cache
            .entries
            .keys()
            .filter(|key| {
                key.entry_id == entry_id
                    && retained_generation
                        .is_none_or(|generation| key.resource_generation < generation)
            })
            .map(|key| key.resource_generation)
            .collect::<HashSet<_>>();
        for generation in generations {
            cache.evict_entry_generation(entry_id, generation);
        }
        drop(cache);
        #[cfg(feature = "plugin-development-mode")]
        self.development_payload_proofs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
    }

    fn source_is_current(&self, webview_label: &str, binding: &ScopeBinding) -> bool {
        let mut scopes = self.lock_scopes();
        scopes.expire(resource_now_ms());
        scopes.by_scope.get(&binding.scope) == Some(binding)
            && scopes.leases.values().any(|authority| {
                authority.webview_label == webview_label && authority.binding == *binding
            })
    }

    fn prove_eligible_payload(
        &self,
        projection: &PluginManagerResourceProjection,
    ) -> Result<PathBuf, PluginResourceError> {
        if !projection.registration.facts.enabled
            || !projection.registration.compatibility.lensx
            || !projection.registration.compatibility.host_api
        {
            return Err(PluginResourceError::new(
                PluginResourceErrorCode::Unavailable,
            ));
        }
        #[cfg(feature = "plugin-development-mode")]
        if let Some((snapshot_root, snapshot_identity, _)) =
            projection.registration.facts.development_payload()
        {
            let snapshots = self
                .development_snapshots
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let store = snapshots
                .as_ref()
                .ok_or_else(|| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?;
            let key = (snapshot_root.to_path_buf(), snapshot_identity.to_owned());
            let current_seal = development_payload_seal(snapshot_root)
                .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?;
            let cached = self
                .development_payload_proofs
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .get(&key)
                .is_some_and(|seal| seal == &current_seal);
            if cached && store.owns_current_snapshot_location(snapshot_root, snapshot_identity) {
                return Ok(snapshot_root.to_path_buf());
            }
            if !store.owns_current_snapshot(
                snapshot_root,
                snapshot_identity,
                &self.manager.host_versions(),
            ) {
                self.development_payload_proofs
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .remove(&key);
                return Err(PluginResourceError::new(
                    PluginResourceErrorCode::UnsafeState,
                ));
            }
            let mut proofs = self
                .development_payload_proofs
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if proofs.len() >= 32 {
                proofs.clear();
            }
            proofs.insert(key, current_seal);
            return Ok(snapshot_root.to_path_buf());
        }
        let packages_root = self
            .packages_root
            .as_ref()
            .ok_or_else(|| PluginResourceError::new(PluginResourceErrorCode::Unavailable))?;
        prove_managed_payload_root(
            packages_root,
            &projection.record_key,
            &projection.plugin_id,
            &projection.registration.facts,
        )
        .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))
    }

    #[cfg(feature = "plugin-development-mode")]
    pub(crate) fn attach_development_snapshots(
        &self,
        snapshots: Option<Arc<DevelopmentSnapshotStore>>,
    ) {
        *self
            .development_snapshots
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = snapshots;
    }

    fn revoke_binding(&self, binding: &ScopeBinding) {
        self.lock_scopes().retire(binding);
    }

    fn evict_verified_generation(&self, entry_id: &str, resource_generation: u64) {
        self.verified_byte_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .evict_entry_generation(entry_id, resource_generation);
    }

    fn lock_scopes(&self) -> MutexGuard<'_, ScopeState> {
        self.scopes
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[cfg(test)]
    fn test_hook(&self) -> Option<Arc<dyn Fn(ResourceReadHookPoint, &Path) + Send + Sync>> {
        self.read_hook
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    #[cfg(not(test))]
    fn test_hook(&self) -> Option<()> {
        None
    }

    #[cfg(test)]
    fn set_read_hook(&self, hook: Option<Arc<dyn Fn(ResourceReadHookPoint, &Path) + Send + Sync>>) {
        *self
            .read_hook
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = hook;
    }
}

impl crate::plugin_child_webview_service::PluginChildWebviewResourceAuthority
    for PluginResourceService
{
    fn activate(
        &self,
        attempt_id: &str,
        webview_label: &str,
        entry_id: &str,
        resource_generation: u64,
    ) -> bool {
        self.activate_runtime_source(attempt_id, webview_label, entry_id, resource_generation)
    }

    fn revoke(&self, attempt_id: &str) -> bool {
        self.revoke_runtime_source(attempt_id)
    }
}

fn valid_resource_attempt(value: &str) -> bool {
    crate::plugin_child_webview_service::PluginChildWebviewAttempt::from_opaque_id(value)
        .is_some_and(|attempt| attempt.opaque_id() != "attempt_0000000000000000")
}

fn resource_entry(
    projection: &PluginManagerResourceProjection,
    entry_url: String,
) -> PluginResourceEntry {
    PluginResourceEntry {
        contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
        entry_id: projection.entry_id.clone(),
        revision: projection.revision.clone(),
        plugin_id: projection.plugin_id.clone(),
        version: projection.registration.manifest.version.clone(),
        entry_url,
    }
}

fn verified_cache_key(
    projection: &PluginManagerResourceProjection,
    normalized_path: &str,
) -> Result<VerifiedPluginResourceCacheKey, ProtocolFailure> {
    if !is_portable_resource_path(normalized_path) {
        return Err(ProtocolFailure::Unavailable);
    }
    #[cfg(feature = "plugin-development-mode")]
    let payload_variant = if let Some((_, snapshot_identity, _)) =
        projection.registration.facts.development_payload()
    {
        VerifiedPluginResourcePayloadVariant::Development(snapshot_identity.to_owned())
    } else {
        let (_, digest) = projection
            .registration
            .facts
            .installed_payload()
            .ok_or(ProtocolFailure::Unavailable)?;
        VerifiedPluginResourcePayloadVariant::Installed(format!(
            "{}:{}",
            digest.algorithm, digest.value
        ))
    };
    #[cfg(not(feature = "plugin-development-mode"))]
    let payload_variant = {
        let (_, digest) = projection
            .registration
            .facts
            .installed_payload()
            .ok_or(ProtocolFailure::Unavailable)?;
        VerifiedPluginResourcePayloadVariant::Installed(format!(
            "{}:{}",
            digest.algorithm, digest.value
        ))
    };
    Ok(VerifiedPluginResourceCacheKey {
        entry_id: projection.entry_id.clone(),
        payload_variant,
        resource_generation: projection.resource_generation,
        normalized_path: normalized_path.to_owned(),
    })
}

fn map_projection_error(error: PluginManagerResourceProjectionError) -> PluginResourceError {
    PluginResourceError::new(match error {
        PluginManagerResourceProjectionError::Degraded => PluginResourceErrorCode::Unavailable,
        PluginManagerResourceProjectionError::StaleRevision => {
            PluginResourceErrorCode::StaleRevision
        }
        PluginManagerResourceProjectionError::NotFound => PluginResourceErrorCode::NotFound,
    })
}

fn generate_scope(scopes: &ScopeState) -> Result<String, PluginResourceError> {
    for _ in 0..MAX_SCOPE_ATTEMPTS {
        let mut entropy = [0_u8; 16];
        getrandom::fill(&mut entropy)
            .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::Internal))?;
        let scope = entropy
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        if !scopes.issued_scopes.contains(&scope) {
            return Ok(scope);
        }
    }
    Err(PluginResourceError::new(PluginResourceErrorCode::Internal))
}

fn parse_resource_uri(uri: &http::Uri) -> Option<PluginResourceUrl> {
    parse_plugin_resource_url(&uri.to_string(), false)
}

fn mime_for_path(path: &str) -> Option<&'static str> {
    let extension = path.rsplit_once('.')?.1.to_ascii_lowercase();
    match extension.as_str() {
        "html" => Some("text/html; charset=utf-8"),
        "js" | "mjs" => Some("text/javascript; charset=utf-8"),
        "css" => Some("text/css; charset=utf-8"),
        "json" => Some("application/json; charset=utf-8"),
        "wasm" => Some("application/wasm"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "avif" => Some("image/avif"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/vnd.microsoft.icon"),
        "ttf" => Some("font/ttf"),
        "woff2" => Some("font/woff2"),
        _ => None,
    }
}

#[derive(Clone, Copy)]
enum ProtocolFailure {
    Unavailable,
    Internal,
}

impl From<std::io::Error> for ProtocolFailure {
    fn from(_: std::io::Error) -> Self {
        Self::Unavailable
    }
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ResourceReadHookPoint {
    BeforeScopeCommit,
    BeforeDelivery,
    BeforeOpen,
    AfterOpen,
    BeforeFinalValidation,
}

#[cfg(test)]
type BeforeOpenHook = Option<Arc<dyn Fn(ResourceReadHookPoint, &Path) + Send + Sync>>;
#[cfg(not(test))]
type BeforeOpenHook = Option<()>;

fn read_resource_file(
    root: &Path,
    resource_path: &str,
    hook: BeforeOpenHook,
) -> Result<Vec<u8>, ProtocolFailure> {
    if !is_portable_resource_path(resource_path) {
        return Err(ProtocolFailure::Unavailable);
    }
    let canonical_root = fs::canonicalize(root)?;
    let mut target = root.to_owned();
    let segments = resource_path.split('/').collect::<Vec<_>>();
    for (index, segment) in segments.iter().enumerate() {
        target.push(segment);
        let metadata = fs::symlink_metadata(&target)?;
        if is_reparse_or_symlink(&metadata)
            || (index + 1 == segments.len() && !metadata.is_file())
            || (index + 1 < segments.len() && !metadata.is_dir())
        {
            return Err(ProtocolFailure::Unavailable);
        }
    }
    let canonical_before = fs::canonicalize(&target)?;
    if !canonical_before.starts_with(&canonical_root) || canonical_before == canonical_root {
        return Err(ProtocolFailure::Unavailable);
    }

    #[cfg(test)]
    if let Some(hook) = &hook {
        hook(ResourceReadHookPoint::BeforeOpen, &target);
    }
    #[cfg(not(test))]
    let _ = hook;

    let mut file = File::open(&target)?;
    let opened_before = file.metadata()?;
    let path_before = fs::symlink_metadata(&target)?;
    #[cfg(test)]
    if let Some(hook) = &hook {
        hook(ResourceReadHookPoint::AfterOpen, &target);
    }
    let canonical_after_open = fs::canonicalize(&target)?;
    if is_reparse_or_symlink(&path_before)
        || !path_before.is_file()
        || opened_before.len() > MAX_FILE_BYTES
        || canonical_after_open != canonical_before
        || !same_file_identity(&opened_before, &path_before)
    {
        return Err(ProtocolFailure::Unavailable);
    }

    let expected_len = opened_before.len();
    let mut bytes = Vec::with_capacity(expected_len.min(1024 * 1024) as usize);
    file.by_ref()
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 != expected_len || bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(ProtocolFailure::Unavailable);
    }
    file.seek(SeekFrom::Start(0))?;
    #[cfg(test)]
    if let Some(hook) = &hook {
        hook(ResourceReadHookPoint::BeforeFinalValidation, &target);
    }
    let opened_after = file.metadata()?;
    let path_after = fs::symlink_metadata(&target)?;
    if is_reparse_or_symlink(&path_after)
        || !same_file_identity(&opened_before, &opened_after)
        || !same_file_identity(&opened_after, &path_after)
        || opened_after.len() != expected_len
        || fs::canonicalize(&target)? != canonical_before
    {
        return Err(ProtocolFailure::Unavailable);
    }
    Ok(bytes)
}

fn is_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(unix)]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    left.dev() == right.dev() && left.ino() == right.ino() && left.len() == right.len()
}

#[cfg(windows)]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    left.volume_serial_number() == right.volume_serial_number()
        && left.file_index() == right.file_index()
        && left.file_size() == right.file_size()
}

#[cfg(not(any(unix, windows)))]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    left.len() == right.len() && left.modified().ok() == right.modified().ok()
}

fn has_unsupported_read_headers(headers: &http::HeaderMap) -> bool {
    [
        http::header::RANGE,
        http::header::IF_MATCH,
        http::header::IF_NONE_MATCH,
        http::header::IF_MODIFIED_SINCE,
        http::header::IF_UNMODIFIED_SINCE,
        http::header::IF_RANGE,
    ]
    .iter()
    .any(|name| headers.contains_key(name))
}

fn success_response(
    head: bool,
    mime: &'static str,
    bytes: Vec<u8>,
    html_csp: &str,
) -> http::Response<Vec<u8>> {
    let length = bytes.len().to_string();
    let mut response = http::Response::builder()
        .status(http::StatusCode::OK)
        .header(http::header::CONTENT_TYPE, mime)
        .header(http::header::CONTENT_LENGTH, length)
        .header(http::header::CACHE_CONTROL, "no-store")
        .header("x-content-type-options", "nosniff");
    if mime == "text/html; charset=utf-8" {
        response = response.header(http::header::CONTENT_SECURITY_POLICY, html_csp);
    }
    response
        .body(if head { Vec::new() } else { bytes })
        .expect("fixed plugin resource success response should be valid")
}

fn fixed_error(status: http::StatusCode, body: &[u8], allow: bool) -> http::Response<Vec<u8>> {
    let mut response = http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(http::header::CONTENT_LENGTH, body.len().to_string())
        .header(http::header::CACHE_CONTROL, "no-store")
        .header("x-content-type-options", "nosniff");
    if allow {
        response = response.header(http::header::ALLOW, "GET, HEAD");
    }
    response
        .body(body.to_vec())
        .expect("fixed plugin resource error response should be valid")
}

#[tauri::command]
pub fn resolve_plugin_resource_entry(
    service: State<'_, Arc<PluginResourceService>>,
    request: serde_json::Value,
) -> Result<PluginResourceEntry, PluginResourceError> {
    let request = deserialize_resolve_request(request)
        .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::InvalidRequest))?;
    service.resolve_entry(&request)
}

pub(crate) fn setup_plugin_resource_service<R: Runtime>(
    app: &AppHandle<R>,
    manager: Arc<PluginManager>,
    installer: Arc<PluginInstaller>,
    app_target: &TrustedAppTarget,
) -> Arc<PluginResourceService> {
    let service = PluginResourceService::initialize_with_html_csp(
        Arc::clone(&manager),
        installer.managed_packages_root(),
        current_plugin_runtime_document_csp(app_target),
    );
    let weak_service = Arc::downgrade(&service);
    let weak_children = app
        .try_state::<Arc<crate::plugin_child_webview_service::PluginChildWebviewService<R>>>()
        .map(|children| Arc::downgrade(children.inner()));
    let installer_manager = Arc::clone(&manager);
    let installer_app = app.clone();
    installer.attach_resource_eligibility_revoker(Arc::new(move |entry_id| {
        if let Some(service) = weak_service.upgrade() {
            service.revoke_entry_eligibility(entry_id);
        }
        if let Some(children) = weak_children
            .as_ref()
            .and_then(|children| children.upgrade())
        {
            crate::plugin_child_webview_host_dispatcher::reconcile_entry_instances(
                &children,
                &installer_manager,
                entry_id,
            );
        }
        crate::plugin_detached_window_native::reconcile_plugin_detached_windows(&installer_app);
    }));
    #[cfg(feature = "plugin-development-mode")]
    if let Some(state) =
        app.try_state::<Arc<crate::plugin_development::PluginDevelopmentModeState>>()
    {
        service.attach_development_snapshots(state.snapshot_store());
        let weak_service = Arc::downgrade(&service);
        let weak_children = app
            .try_state::<Arc<crate::plugin_child_webview_service::PluginChildWebviewService<R>>>()
            .map(|children| Arc::downgrade(children.inner()));
        let development_manager = Arc::clone(&manager);
        let development_app = app.clone();
        state.attach_resource_eligibility_revoker(Arc::new(move |entry_id| {
            if let Some(service) = weak_service.upgrade() {
                service.revoke_entry_eligibility(entry_id);
            }
            if let Some(children) = weak_children
                .as_ref()
                .and_then(|children| children.upgrade())
            {
                crate::plugin_child_webview_host_dispatcher::reconcile_entry_instances(
                    &children,
                    &development_manager,
                    entry_id,
                );
            }
            crate::plugin_detached_window_native::reconcile_plugin_detached_windows(
                &development_app,
            );
        }));
    }
    let managed = app.manage(Arc::clone(&service));
    debug_assert!(
        managed,
        "Plugin Resource Service state should only be managed once"
    );
    service
}

pub fn handle_plugin_resource_protocol<R: Runtime>(
    context: tauri::UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let webview_label = context.webview_label().to_owned();
    let Some(service) = context
        .app_handle()
        .try_state::<Arc<PluginResourceService>>()
        .map(|state| Arc::clone(state.inner()))
    else {
        responder.respond(fixed_error(
            http::StatusCode::INTERNAL_SERVER_ERROR,
            INTERNAL_BODY,
            false,
        ));
        return;
    };
    std::thread::spawn(move || {
        responder.respond(service.handle_request_from_source(&webview_label, request))
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(feature = "plugin-development-mode")]
    use crate::plugin_development_snapshot::DevelopmentSnapshotStore;
    use crate::{
        plugin_identity::plugin_record_key,
        plugin_manager::{
            PackageDigest, PluginManagerDiagnostic, PluginManagerDiagnosticCode,
            PluginManagerDiagnosticPhase, PluginRegistrationFacts, PluginSource, WriteFault,
        },
        plugin_manifest::{validate_plugin_manifest, PluginHostVersions},
        plugin_registration::healthy_entry_id,
    };
    use serde_json::{json, Value};
    use std::{
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const DIGEST_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const DIGEST_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const DIGEST_C: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const DIGEST_D: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should follow epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "lensx-plugin-resource-{name}-{}-{nonce}-{}",
                std::process::id(),
                TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).expect("test directory should exist");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    struct Fixture {
        _directory: TestDirectory,
        packages_root: PathBuf,
        payload_root: PathBuf,
        manager: Arc<PluginManager>,
        service: Arc<PluginResourceService>,
        entry_id: String,
        plugin_id: String,
    }

    fn versions() -> PluginHostVersions {
        PluginHostVersions {
            lensx: "0.1.0".to_owned(),
            host_api: "0.2.0".to_owned(),
        }
    }

    fn manifest(
        plugin_id: &str,
        version: &str,
        compatible: bool,
    ) -> crate::plugin_manifest::NormalizedPluginManifest {
        let mut input: Value = serde_json::from_str(include_str!(
            "../../packages/plugin-contract/tests/fixtures/base.json"
        ))
        .expect("base fixture should parse");
        input["plugin_id"] = json!(plugin_id);
        input["version"] = json!(version);
        if !compatible {
            input["compatibility"]["lensx"]["min_version"] = json!("9.0.0");
            input["compatibility"]["lensx"]["max_version_exclusive"] = json!("10.0.0");
        }
        validate_plugin_manifest(&input, &versions())
            .manifest
            .expect("fixture should normalize")
    }

    fn write_file(root: &Path, relative: &str, bytes: &[u8]) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().expect("file should have a parent"))
            .expect("parent should be created");
        fs::write(path, bytes).expect("file should be written");
    }

    fn facts(payload_root: &Path, digest: &str, enabled: bool) -> PluginRegistrationFacts {
        PluginRegistrationFacts::new(
            payload_root.to_string_lossy(),
            PackageDigest {
                algorithm: "sha256".to_owned(),
                value: digest.to_owned(),
            },
            PluginSource::External,
            enabled,
        )
        .expect("facts should be valid")
    }

    fn fixture(name: &str) -> Fixture {
        let directory = TestDirectory::new(name);
        let plugin_id = "com.acme.workspace".to_owned();
        let packages_root = directory.0.join("plugins/packages");
        let payload_root = packages_root
            .join(plugin_record_key(&plugin_id))
            .join(DIGEST_A);
        write_file(
            &payload_root,
            "dist/plugin.html",
            b"<script src=\"plugin.js\"></script>",
        );
        write_file(&payload_root, "dist/plugin.js", b"export default 1;");
        let manager = PluginManager::recover(directory.0.join("config"), versions());
        manager
            .register(
                manifest(&plugin_id, "1.2.0", true),
                facts(&payload_root, DIGEST_A, true),
            )
            .expect("registration should succeed");
        let registration = manager
            .registration(&plugin_id)
            .expect("registration should exist");
        let entry_id = healthy_entry_id(&registration);
        let service =
            PluginResourceService::initialize(Arc::clone(&manager), Some(packages_root.clone()));
        Fixture {
            _directory: directory,
            packages_root,
            payload_root,
            manager,
            service,
            entry_id,
            plugin_id,
        }
    }

    fn resolve(fixture: &Fixture) -> PluginResourceEntry {
        fixture
            .service
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: fixture.entry_id.clone(),
                expected_revision: fixture.manager.registration_revision(),
            })
            .expect("entry should resolve")
    }

    fn activate_source(
        fixture: &Fixture,
        attempt_id: &str,
        webview_label: &str,
    ) -> PluginResourceEntry {
        let reservation = fixture
            .service
            .reserve_entry_for_attempt(
                &ResolvePluginResourceEntryRequest {
                    contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
                    entry_id: fixture.entry_id.clone(),
                    expected_revision: fixture.manager.registration_revision(),
                },
                attempt_id,
            )
            .expect("creation reservation");
        let entry = reservation.entry.clone();
        let projection = fixture
            .manager
            .read_resource_projection(&fixture.entry_id, None)
            .expect("resource projection should remain current");
        assert!(fixture.service.activate_runtime_source(
            attempt_id,
            webview_label,
            &fixture.entry_id,
            projection.resource_generation,
        ));
        entry
    }

    fn resource_url(entry_url: &str, path: &str) -> String {
        format!(
            "{}{}",
            entry_url
                .strip_suffix("dist/plugin.html")
                .expect("entry URL should end in runtime entry"),
            path
        )
    }

    fn request(method: http::Method, uri: &str) -> http::Request<Vec<u8>> {
        http::Request::builder()
            .method(method)
            .uri(uri)
            .body(Vec::new())
            .expect("request should be valid")
    }

    fn assert_security_headers(response: &http::Response<Vec<u8>>) {
        assert_eq!(response.headers()[http::header::CACHE_CONTROL], "no-store");
        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
        assert!(!response
            .headers()
            .contains_key(http::header::ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    fn assert_plugin_document_csp(response: &http::Response<Vec<u8>>) {
        assert_eq!(
            response.headers()[http::header::CONTENT_SECURITY_POLICY],
            TEST_PLUGIN_DOCUMENT_CSP
        );
    }

    #[test]
    fn resolves_idempotently_and_serves_get_head_and_static_mime_matrix() {
        let fixture = fixture("success-matrix");
        let entry = resolve(&fixture);
        assert_eq!(entry, resolve(&fixture));
        let scope = entry
            .entry_url
            .split('/')
            .nth(4)
            .expect("scope should exist");
        assert_eq!(scope.len(), 32);
        assert!(scope.bytes().all(|byte| byte.is_ascii_hexdigit()));

        let cases = [
            ("asset.HTML", "text/html; charset=utf-8"),
            ("asset.JS", "text/javascript; charset=utf-8"),
            ("asset.mjs", "text/javascript; charset=utf-8"),
            ("asset.css", "text/css; charset=utf-8"),
            ("asset.json", "application/json; charset=utf-8"),
            ("asset.wasm", "application/wasm"),
            ("asset.png", "image/png"),
            ("asset.jpg", "image/jpeg"),
            ("asset.jpeg", "image/jpeg"),
            ("asset.gif", "image/gif"),
            ("asset.webp", "image/webp"),
            ("asset.avif", "image/avif"),
            ("asset.svg", "image/svg+xml"),
            ("asset.ico", "image/vnd.microsoft.icon"),
            ("asset.ttf", "font/ttf"),
            ("asset.TTF", "font/ttf"),
            ("asset.woff2", "font/woff2"),
        ];
        for (path, mime) in cases {
            write_file(&fixture.payload_root, path, path.as_bytes());
            let url = resource_url(&entry.entry_url, path);
            let get = fixture
                .service
                .handle_request(request(http::Method::GET, &url));
            assert_eq!(get.status(), http::StatusCode::OK, "GET {path}");
            assert_eq!(get.headers()[http::header::CONTENT_TYPE], mime);
            assert_eq!(
                get.headers()[http::header::CONTENT_LENGTH],
                path.len().to_string()
            );
            assert_eq!(get.body(), path.as_bytes());
            assert_security_headers(&get);
            if mime == "text/html; charset=utf-8" {
                assert_plugin_document_csp(&get);
            } else {
                assert!(!get
                    .headers()
                    .contains_key(http::header::CONTENT_SECURITY_POLICY));
            }
            let head = fixture
                .service
                .handle_request(request(http::Method::HEAD, &url));
            assert_eq!(head.status(), http::StatusCode::OK, "HEAD {path}");
            assert_eq!(head.headers()[http::header::CONTENT_TYPE], mime);
            assert_eq!(
                head.headers()[http::header::CONTENT_LENGTH],
                path.len().to_string()
            );
            assert!(head.body().is_empty());
            assert_security_headers(&head);
            if mime == "text/html; charset=utf-8" {
                assert_plugin_document_csp(&head);
                assert_eq!(get.headers(), head.headers());
            } else {
                assert!(!head
                    .headers()
                    .contains_key(http::header::CONTENT_SECURITY_POLICY));
            }
        }
    }

    #[test]
    fn accepts_the_exact_64_mib_file_boundary_and_rejects_growth() {
        let fixture = fixture("size-boundary");
        let entry = resolve(&fixture);
        let path = fixture.payload_root.join("boundary.wasm");
        let file = File::create(&path).expect("boundary file should be created");
        file.set_len(MAX_FILE_BYTES)
            .expect("boundary file should be sized");
        let response = fixture.service.handle_request(request(
            http::Method::HEAD,
            &resource_url(&entry.entry_url, "boundary.wasm"),
        ));
        assert_eq!(response.status(), http::StatusCode::OK);
        assert_eq!(
            response.headers()[http::header::CONTENT_LENGTH],
            MAX_FILE_BYTES.to_string()
        );
        let file = File::create(fixture.payload_root.join("too-large.wasm"))
            .expect("large file should be created");
        file.set_len(MAX_FILE_BYTES + 1)
            .expect("large file should be sized");
        let rejected = fixture.service.handle_request(request(
            http::Method::GET,
            &resource_url(&entry.entry_url, "too-large.wasm"),
        ));
        assert_eq!(rejected.status(), http::StatusCode::NOT_FOUND);
    }

    #[test]
    fn rejects_path_attack_and_metadata_matrix_with_one_oracle() {
        let fixture = fixture("path-attacks");
        let entry = resolve(&fixture);
        let prefix = entry
            .entry_url
            .strip_suffix("dist/plugin.html")
            .expect("entry URL should have a resource suffix");
        let attacks = [
            "/absolute.js",
            "../outside.js",
            "./plugin.js",
            "dist//plugin.js",
            "dist\\plugin.js",
            "dist/%2e%2e/outside.js",
            "dist/%252e%252e/outside.js",
            "manifest.json",
            "checksums.json",
            "dist",
            "missing.js",
            "unknown.bin",
        ];
        let baseline = fixture
            .service
            .handle_request(request(http::Method::GET, &format!("{prefix}missing.js")));
        for attack in attacks {
            let uri = if attack.starts_with('/') {
                format!("{prefix}{attack}")
            } else {
                format!("{prefix}{attack}")
            };
            let response = fixture
                .service
                .handle_request(request(http::Method::GET, &uri));
            assert_eq!(response.status(), http::StatusCode::NOT_FOUND, "{attack}");
            assert_eq!(response.body(), baseline.body(), "{attack}");
            assert_eq!(response.headers(), baseline.headers(), "{attack}");
        }
        for attack in [
            "C:/windows/system32/file.js",
            "//server/share/file.js",
            "a/./b.js",
            "a/../b.js",
            "a//b.js",
            "a\\b.js",
            "a%2fb.js",
            "a\0b.js",
            &format!("{}.js", "a".repeat(MAX_PATH_BYTES)),
            &format!("{}/x.js", "a/".repeat(MAX_PATH_SEGMENTS)),
        ] {
            assert!(!is_portable_resource_path(attack), "{attack:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_file_and_directory_symlinks_and_validation_open_races() {
        use std::os::unix::fs::symlink;

        let fixture = fixture("symlink-race");
        let entry = resolve(&fixture);
        let outside = fixture._directory.0.join("outside.js");
        fs::write(&outside, b"outside-secret").expect("outside file should exist");
        symlink(&outside, fixture.payload_root.join("file-link.js"))
            .expect("file symlink should be created");
        let outside_dir = fixture._directory.0.join("outside-dir");
        fs::create_dir_all(&outside_dir).expect("outside directory should exist");
        fs::write(outside_dir.join("secret.js"), b"outside-secret")
            .expect("outside resource should exist");
        symlink(&outside_dir, fixture.payload_root.join("dir-link"))
            .expect("directory symlink should be created");
        for path in ["file-link.js", "dir-link/secret.js"] {
            let response = fixture.service.handle_request(request(
                http::Method::GET,
                &resource_url(&entry.entry_url, path),
            ));
            assert_eq!(response.status(), http::StatusCode::NOT_FOUND);
            assert!(!String::from_utf8_lossy(response.body()).contains("outside-secret"));
        }

        let raced = fixture.payload_root.join("race.js");
        fs::write(&raced, b"original").expect("race file should exist");
        let outside_for_hook = outside.clone();
        fixture
            .service
            .set_read_hook(Some(Arc::new(move |point, target| {
                if point == ResourceReadHookPoint::BeforeOpen && target.ends_with("race.js") {
                    fs::remove_file(target).expect("race target should be removed");
                    symlink(&outside_for_hook, target).expect("race symlink should be installed");
                }
            })));
        let response = fixture.service.handle_request(request(
            http::Method::GET,
            &resource_url(&entry.entry_url, "race.js"),
        ));
        assert_eq!(response.status(), http::StatusCode::NOT_FOUND);
        assert!(!String::from_utf8_lossy(response.body()).contains("outside-secret"));
        fixture.service.set_read_hook(None);
    }

    #[test]
    fn rejects_changes_between_open_read_and_final_identity_validation() {
        let fixture = fixture("open-read-race");
        let entry = resolve(&fixture);
        let raced = fixture.payload_root.join("open-read.js");
        fs::write(&raced, b"complete-bytes").expect("race file should exist");
        fixture
            .service
            .set_read_hook(Some(Arc::new(move |point, target| {
                if point == ResourceReadHookPoint::AfterOpen && target.ends_with("open-read.js") {
                    File::create(target)
                        .expect("race file should reopen")
                        .set_len(0)
                        .expect("race file should truncate");
                }
            })));
        let response = fixture.service.handle_request(request(
            http::Method::GET,
            &resource_url(&entry.entry_url, "open-read.js"),
        ));
        assert_eq!(response.status(), http::StatusCode::NOT_FOUND);
        assert!(!String::from_utf8_lossy(response.body()).contains("complete-bytes"));
        fixture.service.set_read_hook(None);
    }

    #[test]
    fn lifecycle_generation_revokes_only_committed_target_changes() {
        let fixture = fixture("lifecycle");
        let first = resolve(&fixture);
        let first_response = fixture
            .service
            .handle_request(request(http::Method::GET, &first.entry_url));
        assert_eq!(first_response.status(), http::StatusCode::OK);

        let other_id = "com.acme.other";
        let other_root = fixture
            .packages_root
            .join(plugin_record_key(other_id))
            .join(DIGEST_A);
        write_file(&other_root, "dist/plugin.html", b"other");
        fixture
            .manager
            .register(
                manifest(other_id, "1.0.0", true),
                facts(&other_root, DIGEST_A, true),
            )
            .expect("unrelated registration should succeed");
        fixture
            .manager
            .append_diagnostic(
                other_id,
                PluginManagerDiagnostic::new(
                    PluginManagerDiagnosticCode::PersistFailed,
                    PluginManagerDiagnosticPhase::Persist,
                ),
            )
            .expect("unrelated diagnostic should persist");
        let other_registration = fixture
            .manager
            .registration(other_id)
            .expect("other registration should exist");
        let other = fixture
            .service
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: healthy_entry_id(&other_registration),
                expected_revision: fixture.manager.registration_revision(),
            })
            .expect("other entry should resolve");
        let first_origin = parse_plugin_resource_url(&first.entry_url, false)
            .expect("first URL should parse")
            .origin_scope;
        let other_origin = parse_plugin_resource_url(&other.entry_url, false)
            .expect("other URL should parse")
            .origin_scope;
        assert_ne!(first_origin, other_origin);
        assert_eq!(
            fixture
                .service
                .handle_request(request(http::Method::GET, &first.entry_url))
                .status(),
            http::StatusCode::OK
        );

        fixture.manager.set_write_fault(Some(WriteFault::Write));
        assert!(fixture
            .manager
            .set_enabled(&fixture.plugin_id, false)
            .is_err());
        fixture.manager.set_write_fault(None);
        assert_eq!(
            fixture
                .service
                .handle_request(request(http::Method::GET, &first.entry_url))
                .status(),
            http::StatusCode::OK
        );

        fixture
            .manager
            .set_enabled(&fixture.plugin_id, false)
            .expect("disable should commit");
        assert_eq!(
            fixture
                .service
                .handle_request(request(http::Method::GET, &first.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
        fixture
            .manager
            .set_enabled(&fixture.plugin_id, true)
            .expect("enable should commit");
        let second = resolve(&fixture);
        assert_ne!(first.entry_url, second.entry_url);

        let replacement_root = fixture
            .packages_root
            .join(plugin_record_key(&fixture.plugin_id))
            .join(DIGEST_B);
        write_file(&replacement_root, "dist/plugin.html", b"replacement");
        fixture
            .manager
            .replace_entry(
                &fixture.entry_id,
                &fixture.manager.registration_revision(),
                manifest(&fixture.plugin_id, "1.2.0", true),
                facts(&replacement_root, DIGEST_B, true),
            )
            .expect("same-version replacement should commit");
        assert_eq!(
            fixture
                .service
                .handle_request(request(http::Method::GET, &second.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
        let third = resolve(&fixture);
        assert_ne!(second.entry_url, third.entry_url);

        let upgrade_root = fixture
            .packages_root
            .join(plugin_record_key(&fixture.plugin_id))
            .join(DIGEST_C);
        write_file(&upgrade_root, "dist/plugin.html", b"upgrade");
        fixture
            .manager
            .replace_entry(
                &fixture.entry_id,
                &fixture.manager.registration_revision(),
                manifest(&fixture.plugin_id, "2.0.0", true),
                facts(&upgrade_root, DIGEST_C, true),
            )
            .expect("upgrade should commit");
        assert_eq!(
            fixture
                .service
                .handle_request(request(http::Method::GET, &third.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
        let fourth = resolve(&fixture);
        assert_ne!(third.entry_url, fourth.entry_url);

        let downgrade_root = fixture
            .packages_root
            .join(plugin_record_key(&fixture.plugin_id))
            .join(DIGEST_D);
        write_file(&downgrade_root, "dist/plugin.html", b"downgrade");
        fixture
            .manager
            .replace_entry(
                &fixture.entry_id,
                &fixture.manager.registration_revision(),
                manifest(&fixture.plugin_id, "1.0.0", true),
                facts(&downgrade_root, DIGEST_D, true),
            )
            .expect("downgrade should commit");
        assert_eq!(
            fixture
                .service
                .handle_request(request(http::Method::GET, &fourth.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
        let fifth = resolve(&fixture);
        assert_ne!(fourth.entry_url, fifth.entry_url);

        let restarted = PluginResourceService::initialize(
            Arc::clone(&fixture.manager),
            Some(fixture.packages_root.clone()),
        );
        assert_eq!(
            restarted
                .handle_request(request(http::Method::GET, &fifth.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
        fixture
            .manager
            .remove_entry(&fixture.entry_id, &fixture.manager.registration_revision())
            .expect("logical uninstall should commit");
        assert_eq!(
            fixture
                .service
                .handle_request(request(http::Method::GET, &fifth.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn actual_child_webview_source_is_required_and_revoked_before_reuse() {
        let fixture = fixture("child-source-authority");
        let first = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
        assert_eq!(
            fixture
                .service
                .handle_request_from_source("main", request(http::Method::GET, &first.entry_url),)
                .status(),
            http::StatusCode::NOT_FOUND
        );
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-b",
                    request(http::Method::GET, &first.entry_url),
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-a",
                    request(http::Method::GET, &first.entry_url),
                )
                .status(),
            http::StatusCode::OK
        );
        assert!(fixture
            .service
            .revoke_runtime_source("attempt_0000000000000001"));
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-a",
                    request(http::Method::GET, &first.entry_url),
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );

        let second = activate_source(&fixture, "attempt_0000000000000002", "plugin-child-b");
        assert_ne!(first.entry_url, second.entry_url);
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-b",
                    request(http::Method::GET, &second.entry_url),
                )
                .status(),
            http::StatusCode::OK
        );
    }

    #[test]
    fn generation_change_during_read_discards_late_bytes_and_revokes_cache() {
        let fixture = fixture("child-generation-race");
        let entry = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
        let manager = Arc::clone(&fixture.manager);
        let plugin_id = fixture.plugin_id.clone();
        let changed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let changed_in_hook = Arc::clone(&changed);
        fixture
            .service
            .set_read_hook(Some(Arc::new(move |point, _target| {
                if point == ResourceReadHookPoint::BeforeFinalValidation
                    && !changed_in_hook.swap(true, std::sync::atomic::Ordering::SeqCst)
                {
                    manager
                        .set_enabled(&plugin_id, false)
                        .expect("generation change should commit");
                }
            })));
        let response = fixture.service.handle_request_from_source(
            "plugin-child-a",
            request(
                http::Method::GET,
                &resource_url(&entry.entry_url, "dist/plugin.js"),
            ),
        );
        fixture.service.set_read_hook(None);
        assert!(changed.load(std::sync::atomic::Ordering::SeqCst));
        assert_eq!(response.status(), http::StatusCode::NOT_FOUND);
        assert!(!String::from_utf8_lossy(response.body()).contains("plugin.js"));
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-a",
                    request(http::Method::GET, &entry.entry_url),
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn verified_bytes_hit_across_fresh_attempts_without_reusing_runtime_authority() {
        let fixture = fixture("verified-cache-hit");
        let reads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let reads_in_hook = Arc::clone(&reads);
        fixture
            .service
            .set_read_hook(Some(Arc::new(move |point, target| {
                if point == ResourceReadHookPoint::BeforeOpen && target.ends_with("plugin.js") {
                    reads_in_hook.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }
            })));
        let first = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
        let script = resource_url(&first.entry_url, "dist/plugin.js");
        assert_eq!(
            fixture
                .service
                .handle_request_from_source("plugin-child-a", request(http::Method::GET, &script))
                .status(),
            http::StatusCode::OK
        );
        assert_eq!(reads.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert!(fixture
            .service
            .revoke_runtime_source("attempt_0000000000000001"));
        assert_eq!(
            fixture
                .service
                .handle_request_from_source("plugin-child-a", request(http::Method::GET, &script))
                .status(),
            http::StatusCode::NOT_FOUND
        );

        let second = activate_source(&fixture, "attempt_0000000000000002", "plugin-child-b");
        assert_ne!(first.entry_url, second.entry_url);
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-b",
                    request(
                        http::Method::GET,
                        &resource_url(&second.entry_url, "dist/plugin.js"),
                    ),
                )
                .status(),
            http::StatusCode::OK
        );
        assert_eq!(reads.load(std::sync::atomic::Ordering::SeqCst), 1);
        fixture.service.set_read_hook(None);
    }

    #[test]
    fn active_entry_revocation_clears_scope_authority_and_all_cached_generations() {
        let fixture = fixture("active-entry-revocation");
        let entry = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-a",
                    request(http::Method::GET, &entry.entry_url),
                )
                .status(),
            http::StatusCode::OK
        );
        assert!(!fixture
            .service
            .verified_byte_cache
            .lock()
            .unwrap()
            .entries
            .is_empty());

        fixture
            .manager
            .set_enabled(&fixture.plugin_id, false)
            .unwrap();
        fixture.service.revoke_entry_eligibility(&fixture.entry_id);

        assert!(fixture.service.lock_scopes().leases.is_empty());
        assert!(fixture.service.lock_scopes().by_entry.is_empty());
        assert!(fixture.service.lock_scopes().by_scope.is_empty());
        assert!(fixture
            .service
            .verified_byte_cache
            .lock()
            .unwrap()
            .entries
            .is_empty());
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-a",
                    request(http::Method::GET, &entry.entry_url),
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn verified_byte_cache_enforces_variant_generation_entry_and_capacity_bounds() {
        let mut cache = VerifiedPluginResourceByteCache::default();
        let key = |index: usize, variant: &str, generation: u64| VerifiedPluginResourceCacheKey {
            entry_id: format!("entry-{index}"),
            payload_variant: VerifiedPluginResourcePayloadVariant::Installed(variant.to_owned()),
            resource_generation: generation,
            normalized_path: "dist/plugin.js".to_owned(),
        };
        let value = |length: usize| VerifiedPluginResourceCacheValue {
            bytes: Arc::from(vec![0_u8; length]),
            mime: "text/javascript; charset=utf-8",
            bounded_length: length,
        };
        cache.insert(key(0, "sha256:a", 1), value(1));
        assert!(cache.get(&key(0, "sha256:a", 1)).is_some());
        assert!(cache.get(&key(0, "sha256:b", 1)).is_none());
        assert!(cache.get(&key(0, "sha256:a", 2)).is_none());
        assert!(cache.get(&key(1, "sha256:a", 1)).is_none());

        for index in 1..=MAX_VERIFIED_CACHE_ENTRIES {
            cache.insert(key(index, "sha256:a", 1), value(1));
        }
        assert_eq!(cache.entries.len(), MAX_VERIFIED_CACHE_ENTRIES);
        assert!(cache.total_bytes <= MAX_VERIFIED_CACHE_BYTES);

        cache.insert(key(999, "sha256:a", 1), value(20 * 1024 * 1024));
        cache.insert(key(1000, "sha256:a", 1), value(20 * 1024 * 1024));
        assert!(cache.entries.len() <= MAX_VERIFIED_CACHE_ENTRIES);
        assert!(cache.total_bytes <= MAX_VERIFIED_CACHE_BYTES);
    }

    #[test]
    fn unavailable_incompatible_and_unsafe_registrations_never_receive_scope() {
        let fixture = fixture("eligibility");
        fixture
            .manager
            .set_enabled(&fixture.plugin_id, false)
            .expect("disable should commit");
        let error = fixture
            .service
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: fixture.entry_id.clone(),
                expected_revision: fixture.manager.registration_revision(),
            })
            .expect_err("disabled entry should fail");
        assert_eq!(error.code, PluginResourceErrorCode::Unavailable);

        let incompatible_id = "com.acme.incompatible";
        let incompatible_root = fixture
            .packages_root
            .join(plugin_record_key(incompatible_id))
            .join(DIGEST_A);
        write_file(&incompatible_root, "dist/plugin.html", b"incompatible");
        fixture
            .manager
            .register(
                manifest(incompatible_id, "1.0.0", false),
                facts(&incompatible_root, DIGEST_A, true),
            )
            .expect("incompatible registration is a valid stored fact");
        let registration = fixture
            .manager
            .registration(incompatible_id)
            .expect("registration should exist");
        let error = fixture
            .service
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: healthy_entry_id(&registration),
                expected_revision: fixture.manager.registration_revision(),
            })
            .expect_err("incompatible entry should fail");
        assert_eq!(error.code, PluginResourceErrorCode::Unavailable);

        let unsafe_id = "com.acme.unsafe";
        let unsafe_root = fixture._directory.0.join("outside-payload");
        write_file(&unsafe_root, "dist/plugin.html", b"unsafe");
        fixture
            .manager
            .register(
                manifest(unsafe_id, "1.0.0", true),
                facts(&unsafe_root, DIGEST_A, true),
            )
            .expect("manager accepts Host facts independently");
        let registration = fixture
            .manager
            .registration(unsafe_id)
            .expect("entry should exist");
        let error = fixture
            .service
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: healthy_entry_id(&registration),
                expected_revision: fixture.manager.registration_revision(),
            })
            .expect_err("unowned payload should fail");
        assert_eq!(error.code, PluginResourceErrorCode::UnsafeState);
    }

    #[test]
    fn method_headers_identity_and_io_failures_share_fixed_safe_responses() {
        let fixture = fixture("error-oracle");
        let entry = resolve(&fixture);
        for method in [http::Method::POST, http::Method::PUT, http::Method::DELETE] {
            let response = fixture
                .service
                .handle_request(request(method, &entry.entry_url));
            assert_eq!(response.status(), http::StatusCode::METHOD_NOT_ALLOWED);
            assert_eq!(response.headers()[http::header::ALLOW], "GET, HEAD");
            assert_security_headers(&response);
        }
        for header in [
            http::header::RANGE,
            http::header::IF_MATCH,
            http::header::IF_NONE_MATCH,
            http::header::IF_MODIFIED_SINCE,
            http::header::IF_UNMODIFIED_SINCE,
            http::header::IF_RANGE,
        ] {
            let mut read = request(http::Method::GET, &entry.entry_url);
            read.headers_mut()
                .insert(header, http::HeaderValue::from_static("bytes=0-1"));
            let response = fixture.service.handle_request(read);
            assert_eq!(response.status(), http::StatusCode::NOT_FOUND);
            assert_security_headers(&response);
        }
        for (header, value) in [
            (http::header::ORIGIN, "null"),
            (http::header::ACCEPT, "application/octet-stream"),
        ] {
            let mut read = request(http::Method::GET, &entry.entry_url);
            read.headers_mut()
                .insert(header, http::HeaderValue::from_static(value));
            let response = fixture.service.handle_request(read);
            assert_eq!(response.status(), http::StatusCode::OK);
            assert_security_headers(&response);
            assert!(!response.headers().contains_key(http::header::VARY));
        }
        let missing = fixture.service.handle_request(request(
            http::Method::GET,
            &resource_url(&entry.entry_url, "missing.js"),
        ));
        let scope = parse_plugin_resource_url(&entry.entry_url, false)
            .expect("entry URL should parse")
            .origin_scope;
        let expired_url = entry
            .entry_url
            .replace(&scope, "ffffffffffffffffffffffffffffffff");
        let expired = fixture
            .service
            .handle_request(request(http::Method::GET, &expired_url));
        let host_path_mismatch = fixture.service.handle_request(request(
            http::Method::GET,
            &entry.entry_url.replacen(
                &format!("{scope}.runtime.localhost"),
                "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.runtime.localhost",
                1,
            ),
        ));
        let shared_host = fixture.service.handle_request(request(
            http::Method::GET,
            &entry
                .entry_url
                .replacen(&format!("{scope}.runtime.localhost"), "localhost", 1),
        ));
        let wrong_plugin = fixture.service.handle_request(request(
            http::Method::GET,
            &entry.entry_url.replacen(
                &plugin_record_key(&fixture.plugin_id),
                &plugin_record_key("com.acme.other"),
                1,
            ),
        ));
        let wrong_version = fixture.service.handle_request(request(
            http::Method::GET,
            &entry.entry_url.replacen("/1.2.0/", "/9.9.9/", 1),
        ));
        assert_eq!(missing.status(), http::StatusCode::NOT_FOUND);
        for rejected in [
            &expired,
            &host_path_mismatch,
            &shared_host,
            &wrong_plugin,
            &wrong_version,
        ] {
            assert_eq!(rejected.status(), missing.status());
            assert_eq!(rejected.headers(), missing.headers());
            assert_eq!(rejected.body(), missing.body());
        }
        let serialized = format!("{:?}{:?}", missing.headers(), missing.body());
        for secret in [
            &entry.entry_url,
            &fixture.plugin_id,
            DIGEST_A,
            fixture.payload_root.to_string_lossy().as_ref(),
        ] {
            assert!(!serialized.contains(secret));
        }
    }

    #[test]
    fn platform_url_shapes_do_not_change_scope_or_path_authorization() {
        let fixture = fixture("platform-urls");
        let entry = resolve(&fixture);
        let native: http::Uri = entry.entry_url.parse().expect("native URL should parse");
        let translated = translated_resource_url(&entry.entry_url, "http")
            .expect("translated URL should preserve the origin key");
        let windows: http::Uri = translated.parse().expect("translated URL should parse");
        let native = parse_resource_uri(&native).expect("native fixture should parse");
        let windows = parse_resource_uri(&windows).expect("Windows fixture should parse");
        assert_eq!(native.origin_scope, windows.origin_scope);
        assert_eq!(native.path_scope, windows.path_scope);
        assert_eq!(native.plugin_key, windows.plugin_key);
        assert_eq!(native.version, windows.version);
        assert_eq!(native.resource_path, windows.resource_path);
        for invalid in [
            translated.replace("http://", "ftp://"),
            translated.replace("lensx-plugin.", "attacker."),
            format!("{translated}?path=dist/plugin.js"),
        ] {
            let uri: http::Uri = invalid.parse().expect("fixture URI should parse");
            assert!(parse_resource_uri(&uri).is_none());
        }
    }

    #[cfg(feature = "plugin-development-mode")]
    #[test]
    fn development_snapshots_require_current_store_ownership_and_fresh_scopes() {
        let directory = TestDirectory::new("development-scope");
        let source = directory.0.join("dist");
        write_file(
            &source,
            "manifest.json",
            include_bytes!("../../packages/plugin-contract/tests/fixtures/base.json"),
        );
        write_file(&source, "dist/plugin.html", b"development-one");
        write_file(&source, "assets/plugin-icon.svg", b"<svg/>");
        write_file(&source, "assets/home.svg", b"<svg/>");
        let manager = PluginManager::recover(directory.0.join("config"), versions());
        let snapshots =
            Arc::new(DevelopmentSnapshotStore::initialize(directory.0.join("cache")).unwrap());
        let first_snapshot = snapshots.publish_from_source(&source, &versions()).unwrap();
        let first_manifest = first_snapshot.manifest.clone();
        manager
            .register_development(
                first_manifest.clone(),
                PluginRegistrationFacts::development(
                    first_snapshot.root.clone(),
                    first_snapshot.identity.clone(),
                    source.clone(),
                    true,
                )
                .unwrap(),
            )
            .unwrap();
        let entry_id = healthy_entry_id(
            &manager
                .registration(&first_manifest.plugin_id)
                .expect("development entry should exist"),
        );
        let service = PluginResourceService::initialize(Arc::clone(&manager), None);
        service.attach_development_snapshots(Some(Arc::clone(&snapshots)));
        let first = service
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: entry_id.clone(),
                expected_revision: manager.registration_revision(),
            })
            .unwrap();
        assert_eq!(
            service
                .handle_request(request(http::Method::GET, &first.entry_url))
                .body(),
            b"development-one"
        );

        write_file(&source, "dist/plugin.html", b"development-two");
        let second_snapshot = snapshots.publish_from_source(&source, &versions()).unwrap();
        manager
            .reload_development_entry(
                &entry_id,
                &manager.registration_revision(),
                second_snapshot.manifest.clone(),
                PluginRegistrationFacts::development(
                    second_snapshot.root.clone(),
                    second_snapshot.identity.clone(),
                    source,
                    true,
                )
                .unwrap(),
            )
            .unwrap();
        assert_eq!(
            service
                .handle_request(request(http::Method::GET, &first.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
        assert!(snapshots.retire(&first_snapshot.root));
        let second = service
            .resolve_entry(&ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: entry_id.clone(),
                expected_revision: manager.registration_revision(),
            })
            .unwrap();
        assert_ne!(first.entry_url, second.entry_url);
        assert_eq!(
            service
                .handle_request(request(http::Method::GET, &second.entry_url))
                .body(),
            b"development-two"
        );

        manager
            .remove_development_entry(&entry_id, &manager.registration_revision())
            .unwrap();
        assert_eq!(
            service
                .handle_request(request(http::Method::GET, &second.entry_url))
                .status(),
            http::StatusCode::NOT_FOUND
        );
    }
    #[test]
    fn sibling_sources_share_scope_but_never_authority_or_final_retirement() {
        let fixture = fixture("sibling-leases");
        let a = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
        let b = activate_source(&fixture, "attempt_0000000000000002", "plugin-child-b");
        assert_eq!(a.entry_url, b.entry_url);
        assert_eq!(resolve(&fixture).entry_url, a.entry_url);
        for source in ["plugin-child-a", "plugin-child-b"] {
            assert_eq!(
                fixture
                    .service
                    .handle_request_from_source(source, request(http::Method::GET, &a.entry_url))
                    .status(),
                http::StatusCode::OK
            );
        }
        assert!(fixture
            .service
            .revoke_runtime_source("attempt_0000000000000001"));
        assert!(!fixture
            .service
            .revoke_runtime_source("attempt_0000000000000001"));
        assert_eq!(resolve(&fixture).entry_url, b.entry_url);
        assert_eq!(fixture.service.lock_scopes().leases.len(), 1);
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-a",
                    request(http::Method::GET, &b.entry_url)
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-b",
                    request(http::Method::GET, &b.entry_url)
                )
                .status(),
            http::StatusCode::OK
        );
        assert!(fixture
            .service
            .revoke_runtime_source("attempt_0000000000000002"));
        assert!(fixture.service.lock_scopes().by_scope.is_empty());
        let c = activate_source(&fixture, "attempt_0000000000000003", "plugin-child-c");
        assert_ne!(c.entry_url, a.entry_url);
        for source in ["plugin-child-a", "plugin-child-b", "main"] {
            assert_eq!(
                fixture
                    .service
                    .handle_request_from_source(source, request(http::Method::GET, &c.entry_url))
                    .status(),
                http::StatusCode::NOT_FOUND
            );
        }
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-c",
                    request(http::Method::GET, &a.entry_url)
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn bounded_creation_hold_survives_sibling_close_without_authorizing_a_source() {
        let fixture = fixture("creation-hold");
        let a = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
        let query = ResolvePluginResourceEntryRequest {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
            entry_id: fixture.entry_id.clone(),
            expected_revision: fixture.manager.registration_revision(),
        };
        let b = fixture
            .service
            .reserve_entry_for_attempt(&query, "attempt_0000000000000002")
            .unwrap();
        assert_eq!(b.entry.entry_url, a.entry_url);
        assert!(fixture
            .service
            .revoke_runtime_source("attempt_0000000000000001"));
        assert_eq!(fixture.service.lock_scopes().by_scope.len(), 1);
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-b",
                    request(http::Method::GET, &b.entry.entry_url)
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );
        let generation = fixture
            .manager
            .read_resource_projection(&fixture.entry_id, None)
            .unwrap()
            .resource_generation;
        assert!(fixture.service.activate_runtime_source(
            "attempt_0000000000000002",
            "plugin-child-b",
            &fixture.entry_id,
            generation
        ));
        drop(b);
        assert_eq!(fixture.service.lock_scopes().reservations.len(), 0);
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-b",
                    request(http::Method::GET, &a.entry_url)
                )
                .status(),
            http::StatusCode::OK
        );
        assert!(fixture
            .service
            .revoke_runtime_source("attempt_0000000000000002"));
        let failed = fixture
            .service
            .reserve_entry_for_attempt(&query, "attempt_0000000000000003")
            .unwrap();
        let failed_url = failed.entry.entry_url.clone();
        assert_ne!(failed_url, a.entry_url);
        drop(failed);
        assert!(fixture.service.lock_scopes().by_scope.is_empty());
        assert!(fixture
            .service
            .reserve_entry_for_attempt(&query, "attempt_0000000000000003")
            .is_err());
        let next = fixture
            .service
            .reserve_entry_for_attempt(&query, "attempt_0000000000000004")
            .unwrap();
        assert_ne!(next.entry.entry_url, failed_url);
        assert!(!fixture.service.activate_runtime_source(
            "attempt_0000000000000004",
            "plugin-child-b",
            &fixture.entry_id,
            generation
        ));
        drop(next);
        assert!(fixture.service.lock_scopes().by_scope.is_empty());
    }

    #[test]
    fn reservation_deadline_and_capacity_are_bounded_and_never_revive_retired_scopes() {
        let fixture = fixture("reservation-deadline");
        let query = ResolvePluginResourceEntryRequest {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
            entry_id: fixture.entry_id.clone(),
            expected_revision: fixture.manager.registration_revision(),
        };
        let first = fixture
            .service
            .resolve_entry_inner(&query, Some("attempt_0000000000000001"), 0)
            .unwrap();
        for sequence in 2..=32 {
            let next = fixture
                .service
                .resolve_entry_inner(&query, Some(&format!("attempt_{sequence:016x}")), 0)
                .unwrap();
            assert_eq!(first.entry_url, next.entry_url);
        }
        assert!(fixture
            .service
            .resolve_entry_inner(&query, Some("attempt_0000000000000021"), 0)
            .is_err());
        assert_eq!(fixture.service.lock_scopes().expire(9_999), 0);
        assert_eq!(fixture.service.lock_scopes().expire(10_000), 32);
        assert!(fixture.service.lock_scopes().reservations.is_empty());
        assert!(fixture.service.lock_scopes().by_scope.is_empty());
        let generation = fixture
            .manager
            .read_resource_projection(&fixture.entry_id, None)
            .unwrap()
            .resource_generation;
        assert!(!fixture.service.activate_runtime_source(
            "attempt_0000000000000001",
            "plugin-child-expired",
            &fixture.entry_id,
            generation
        ));
        let after = fixture
            .service
            .resolve_entry_inner(&query, Some("attempt_0000000000000021"), 10_001)
            .unwrap();
        assert_ne!(first.entry_url, after.entry_url);
        assert!(fixture
            .service
            .resolve_entry_inner(&query, Some("attempt_0000000000000001"), 10_001)
            .is_err());
    }

    #[test]
    fn source_close_before_cold_or_cached_delivery_drops_only_that_response() {
        for cached in [false, true] {
            let fixture = fixture(if cached {
                "cached-source-race"
            } else {
                "cold-source-race"
            });
            let a = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
            let b = activate_source(&fixture, "attempt_0000000000000002", "plugin-child-b");
            let script = resource_url(&a.entry_url, "dist/plugin.js");
            if cached {
                assert_eq!(
                    fixture
                        .service
                        .handle_request_from_source(
                            "plugin-child-a",
                            request(http::Method::GET, &script)
                        )
                        .status(),
                    http::StatusCode::OK
                );
            }
            let service = Arc::downgrade(&fixture.service);
            let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let observed = calls.clone();
            fixture
                .service
                .set_read_hook(Some(Arc::new(move |point, target| {
                    if point == ResourceReadHookPoint::BeforeDelivery
                        && target.ends_with("plugin.js")
                    {
                        observed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        assert!(service
                            .upgrade()
                            .unwrap()
                            .revoke_runtime_source("attempt_0000000000000001"));
                    }
                })));
            let response = fixture
                .service
                .handle_request_from_source("plugin-child-a", request(http::Method::GET, &script));
            fixture.service.set_read_hook(None);
            assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
            assert_eq!(response.status(), http::StatusCode::NOT_FOUND);
            assert_eq!(fixture.service.lock_scopes().leases.len(), 1);
            assert_eq!(resolve(&fixture).entry_url, b.entry_url);
            assert_eq!(
                fixture
                    .service
                    .handle_request_from_source(
                        "plugin-child-b",
                        request(http::Method::GET, &script)
                    )
                    .status(),
                http::StatusCode::OK
            );
        }
    }

    #[test]
    fn generation_retirement_revokes_all_sibling_leases_and_pending_creations_only() {
        let fixture = fixture("fanout-resource");
        let a = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-a");
        let b = activate_source(&fixture, "attempt_0000000000000002", "plugin-child-b");
        let query = ResolvePluginResourceEntryRequest {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
            entry_id: fixture.entry_id.clone(),
            expected_revision: fixture.manager.registration_revision(),
        };
        let pending = fixture
            .service
            .reserve_entry_for_attempt(&query, "attempt_0000000000000003")
            .unwrap();
        let other_id = "com.acme.sibling";
        let other_root = fixture
            .packages_root
            .join(plugin_record_key(other_id))
            .join(DIGEST_B);
        write_file(&other_root, "dist/plugin.html", b"other plugin");
        fixture
            .manager
            .register(
                manifest(other_id, "1.0.0", true),
                facts(&other_root, DIGEST_B, true),
            )
            .unwrap();
        let other_entry = healthy_entry_id(&fixture.manager.registration(other_id).unwrap());
        let other_query = ResolvePluginResourceEntryRequest {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
            entry_id: other_entry.clone(),
            expected_revision: fixture.manager.registration_revision(),
        };
        let other = fixture
            .service
            .reserve_entry_for_attempt(&other_query, "attempt_0000000000000004")
            .unwrap();
        let other_url = other.entry.entry_url.clone();
        let other_generation = fixture
            .manager
            .read_resource_projection(&other_entry, None)
            .unwrap()
            .resource_generation;
        assert!(fixture.service.activate_runtime_source(
            "attempt_0000000000000004",
            "plugin-child-other",
            &other_entry,
            other_generation
        ));
        drop(other);
        fixture
            .manager
            .set_enabled(&fixture.plugin_id, false)
            .unwrap();
        fixture.service.revoke_entry_eligibility(&fixture.entry_id);
        assert_eq!(fixture.service.lock_scopes().leases.len(), 1);
        assert!(fixture.service.lock_scopes().reservations.is_empty());
        for (source, url) in [
            ("plugin-child-a", a.entry_url),
            ("plugin-child-b", b.entry_url),
            ("plugin-child-c", pending.entry.entry_url.clone()),
        ] {
            assert_eq!(
                fixture
                    .service
                    .handle_request_from_source(source, request(http::Method::GET, &url))
                    .status(),
                http::StatusCode::NOT_FOUND
            );
        }
        drop(pending);
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-other",
                    request(http::Method::GET, &other_url)
                )
                .status(),
            http::StatusCode::OK
        );
    }
    #[test]
    fn late_old_resolve_and_lifecycle_callback_cannot_retire_new_generation() {
        let fixture = fixture("late-generation-allocation");
        let old = activate_source(&fixture, "attempt_0000000000000001", "plugin-child-old");
        let query = ResolvePluginResourceEntryRequest {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
            entry_id: fixture.entry_id.clone(),
            expected_revision: fixture.manager.registration_revision(),
        };
        let service = Arc::downgrade(&fixture.service);
        let manager = fixture.manager.clone();
        let plugin_id = fixture.plugin_id.clone();
        let entry_id = fixture.entry_id.clone();
        let changed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let changed_hook = changed.clone();
        let newest_url = Arc::new(Mutex::new(None));
        let published = newest_url.clone();
        fixture
            .service
            .set_read_hook(Some(Arc::new(move |point, _| {
                if point != ResourceReadHookPoint::BeforeScopeCommit
                    || changed_hook.swap(true, std::sync::atomic::Ordering::SeqCst)
                {
                    return;
                }
                manager.set_enabled(&plugin_id, false).unwrap();
                manager.set_enabled(&plugin_id, true).unwrap();
                let service = service.upgrade().unwrap();
                let reservation = service
                    .reserve_entry_for_attempt(
                        &ResolvePluginResourceEntryRequest {
                            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.into(),
                            entry_id: entry_id.clone(),
                            expected_revision: manager.registration_revision(),
                        },
                        "attempt_0000000000000002",
                    )
                    .unwrap();
                let generation = manager
                    .read_resource_projection(&entry_id, None)
                    .unwrap()
                    .resource_generation;
                assert!(service.activate_runtime_source(
                    "attempt_0000000000000002",
                    "plugin-child-new",
                    &entry_id,
                    generation
                ));
                *published.lock().unwrap() = Some(reservation.entry.entry_url.clone());
            })));
        assert!(fixture.service.resolve_entry(&query).is_err());
        fixture.service.set_read_hook(None);
        let current = newest_url.lock().unwrap().clone().unwrap();
        assert_ne!(old.entry_url, current);
        fixture.service.revoke_entry_eligibility(&fixture.entry_id);
        assert_eq!(fixture.service.lock_scopes().leases.len(), 1);
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-new",
                    request(http::Method::GET, &current)
                )
                .status(),
            http::StatusCode::OK
        );
        assert_eq!(
            fixture
                .service
                .handle_request_from_source(
                    "plugin-child-old",
                    request(http::Method::GET, &old.entry_url)
                )
                .status(),
            http::StatusCode::NOT_FOUND
        );
        assert_eq!(resolve(&fixture).entry_url, current);
    }
}
