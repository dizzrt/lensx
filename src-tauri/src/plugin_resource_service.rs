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
    plugin_runtime_security_policy::PLUGIN_RUNTIME_DOCUMENT_CSP,
};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};
use tauri::{http, AppHandle, Manager, Runtime, State};

const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SCOPE_ATTEMPTS: usize = 8;
const NOT_FOUND_BODY: &[u8] = b"Plugin resource unavailable.";
const METHOD_NOT_ALLOWED_BODY: &[u8] = b"Plugin resource method unavailable.";
const INTERNAL_BODY: &[u8] = b"Plugin resource request failed.";

#[derive(Clone, Debug)]
struct ScopeBinding {
    scope: String,
    entry_id: String,
    resource_generation: u64,
}

#[derive(Default)]
struct ScopeState {
    by_entry: HashMap<String, ScopeBinding>,
    by_scope: HashMap<String, ScopeBinding>,
}

pub struct PluginResourceService {
    manager: Arc<PluginManager>,
    packages_root: Option<PathBuf>,
    html_csp: &'static str,
    scopes: Mutex<ScopeState>,
    #[cfg(test)]
    read_hook: Mutex<Option<Arc<dyn Fn(ResourceReadHookPoint, &Path) + Send + Sync>>>,
}

impl PluginResourceService {
    pub fn initialize(manager: Arc<PluginManager>, packages_root: Option<PathBuf>) -> Arc<Self> {
        Self::initialize_with_html_csp(manager, packages_root, PLUGIN_RUNTIME_DOCUMENT_CSP)
    }

    #[doc(hidden)]
    pub fn initialize_for_macos_harness(
        manager: Arc<PluginManager>,
        packages_root: Option<PathBuf>,
    ) -> Arc<Self> {
        Self::initialize_with_html_csp(
            manager,
            packages_root,
            crate::plugin_runtime_security_policy::PLUGIN_RUNTIME_HARNESS_DOCUMENT_CSP,
        )
    }

    fn initialize_with_html_csp(
        manager: Arc<PluginManager>,
        packages_root: Option<PathBuf>,
        html_csp: &'static str,
    ) -> Arc<Self> {
        Arc::new(Self {
            manager,
            packages_root,
            html_csp,
            scopes: Mutex::new(ScopeState::default()),
            #[cfg(test)]
            read_hook: Mutex::new(None),
        })
    }

    pub fn resolve_entry(
        &self,
        request: &ResolvePluginResourceEntryRequest,
    ) -> Result<PluginResourceEntry, PluginResourceError> {
        let projection = self
            .manager
            .read_resource_projection(&request.entry_id, Some(&request.expected_revision))
            .map_err(map_projection_error)?;
        let payload_root = self.prove_eligible_payload(&projection)?;
        let entry_path = &projection.registration.manifest.runtime.entry;
        mime_for_path(entry_path)
            .ok_or_else(|| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?;
        read_resource_file(&payload_root, entry_path, self.test_hook())
            .map_err(|_| PluginResourceError::new(PluginResourceErrorCode::UnsafeState))?;

        let mut scopes = self.lock_scopes();
        if let Some(existing) = scopes.by_entry.get(&projection.entry_id).cloned() {
            if existing.resource_generation == projection.resource_generation {
                return Ok(resource_entry(
                    &projection,
                    build_native_resource_url(
                        &existing.scope,
                        &projection.record_key,
                        &projection.registration.manifest.version,
                        entry_path,
                    ),
                ));
            }
            scopes.by_entry.remove(&projection.entry_id);
            scopes.by_scope.remove(&existing.scope);
        }

        let scope = generate_scope(&scopes)?;
        let binding = ScopeBinding {
            scope: scope.clone(),
            entry_id: projection.entry_id.clone(),
            resource_generation: projection.resource_generation,
        };
        scopes
            .by_entry
            .insert(projection.entry_id.clone(), binding.clone());
        scopes.by_scope.insert(scope.clone(), binding);
        Ok(resource_entry(
            &projection,
            build_native_resource_url(
                &scope,
                &projection.record_key,
                &projection.registration.manifest.version,
                entry_path,
            ),
        ))
    }

    pub fn handle_request(&self, request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
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
        match self.read_request(&request) {
            Ok((mime, bytes)) => success_response(
                request.method() == http::Method::HEAD,
                mime,
                bytes,
                self.html_csp,
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
        request: &http::Request<Vec<u8>>,
    ) -> Result<(&'static str, Vec<u8>), ProtocolFailure> {
        let parsed = parse_resource_uri(request.uri()).ok_or(ProtocolFailure::Unavailable)?;
        let binding = self
            .lock_scopes()
            .by_scope
            .get(&parsed.origin_scope)
            .cloned()
            .ok_or(ProtocolFailure::Unavailable)?;
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
        let bytes = read_resource_file(&payload_root, &parsed.resource_path, self.test_hook())?;
        Ok((mime, bytes))
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

    fn revoke_binding(&self, binding: &ScopeBinding) {
        let mut scopes = self.lock_scopes();
        scopes.by_scope.remove(&binding.scope);
        if scopes
            .by_entry
            .get(&binding.entry_id)
            .is_some_and(|current| current.scope == binding.scope)
        {
            scopes.by_entry.remove(&binding.entry_id);
        }
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
        if !scopes.by_scope.contains_key(&scope) {
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
    html_csp: &'static str,
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

pub fn setup_plugin_resource_service<R: Runtime>(
    app: &AppHandle<R>,
    manager: Arc<PluginManager>,
    installer: Arc<PluginInstaller>,
) -> Arc<PluginResourceService> {
    let service = PluginResourceService::initialize(manager, installer.managed_packages_root());
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
    std::thread::spawn(move || responder.respond(service.handle_request(request)));
}

#[cfg(test)]
mod tests {
    use super::*;
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
            host_api: "0.1.0".to_owned(),
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
            PLUGIN_RUNTIME_DOCUMENT_CSP
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
}
