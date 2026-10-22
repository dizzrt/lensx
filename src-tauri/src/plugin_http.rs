//! Host-owned bounded HTTPS transport. Business interpretation and signing belong to plugins.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    future::Future,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs},
    pin::Pin,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};
use tokio::sync::{watch, Semaphore};
use url::{Host, Url};

const MAX_URL_BYTES: usize = 4096;
const MAX_HEADERS: usize = 32;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_BODY_BYTES: usize = 1024 * 1024;
const MAX_RESULT_BYTES: usize = 4 * 1024 * 1024;
const MAX_DNS_ANSWERS: usize = 16;
const MAX_ATTEMPT_REQUESTS: usize = 4;
const MAX_GLOBAL_REQUESTS: usize = 16;
pub(crate) const DEFAULT_HTTP_TIMEOUT_MS: u64 = 15_000;

type HttpFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, HttpFailure>> + Send + 'a>>;
pub(crate) type HttpExecutionFuture = Pin<Box<dyn Future<Output = Value> + Send>>;

pub(crate) trait HostHttpExecutor: Send + Sync {
    fn execute(
        self: Arc<Self>,
        attempt: String,
        params: Value,
        cancelled: watch::Receiver<bool>,
    ) -> HttpExecutionFuture;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum HttpFailure {
    InvalidParams,
    LimitExceeded,
    Timeout,
    Cancelled,
    Unavailable,
    InternalError,
}

impl HttpFailure {
    pub(crate) fn output(self) -> Value {
        let (code, message) = match self {
            Self::InvalidParams => (
                "invalid_params",
                "HTTP request parameters or destination are not allowed.",
            ),
            Self::LimitExceeded => (
                "limit_exceeded",
                "The HTTP request exceeded a resource limit.",
            ),
            Self::Timeout => ("timeout", "The HTTP request timed out."),
            Self::Cancelled => ("cancelled", "The HTTP request was cancelled."),
            Self::Unavailable => ("unavailable", "The HTTP transport is unavailable."),
            Self::InternalError => ("internal_error", "The HTTP request failed."),
        };
        json!({ "code": code, "message": message })
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct HttpHeader {
    name: String,
    value: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct HttpParams {
    url: String,
    method: String,
    #[serde(default)]
    headers: Vec<HttpHeader>,
    body: Option<String>,
    timeout_ms: Option<u64>,
}

struct PreparedRequest {
    url: Url,
    host: String,
    literal: Option<IpAddr>,
    method: reqwest::Method,
    headers: Vec<HttpHeader>,
    body: Option<String>,
    timeout_ms: u64,
}

trait HttpResolver: Send + Sync {
    fn resolve(&self, host: String) -> HttpFuture<'static, Vec<IpAddr>>;
}

trait HttpBody: Send {
    fn chunk(&mut self) -> HttpFuture<'_, Option<Vec<u8>>>;
}

struct HttpResponse {
    status: u16,
    headers: Vec<HttpHeader>,
    body: Box<dyn HttpBody>,
}

trait HttpTransport: Send + Sync {
    fn send(
        &self,
        request: PreparedRequest,
        addresses: Vec<SocketAddr>,
    ) -> HttpFuture<'static, HttpResponse>;
}

struct NativeResolver;
type BlockingLookup = dyn Fn(String) -> Result<Vec<IpAddr>, HttpFailure> + Send + Sync;

fn resolve_on_worker(
    host: String,
    workers: Arc<Semaphore>,
    lookup: Arc<BlockingLookup>,
) -> HttpFuture<'static, Vec<IpAddr>> {
    Box::pin(async move {
        // getaddrinfo itself is not cancellable. Its permit belongs to the OS lookup,
        // not the awaiting request, bounding workers even after local cancellation.
        let permit = workers
            .try_acquire_owned()
            .map_err(|_| HttpFailure::LimitExceeded)?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            lookup(host)
        })
        .await
        .map_err(|_| HttpFailure::Unavailable)?
    })
}

impl HttpResolver for NativeResolver {
    fn resolve(&self, host: String) -> HttpFuture<'static, Vec<IpAddr>> {
        static WORKERS: OnceLock<Arc<Semaphore>> = OnceLock::new();
        resolve_on_worker(
            host,
            Arc::clone(WORKERS.get_or_init(|| Arc::new(Semaphore::new(MAX_GLOBAL_REQUESTS)))),
            Arc::new(|host| {
                let answers = (host.as_str(), 443)
                    .to_socket_addrs()
                    .map_err(|_| HttpFailure::Unavailable)?;
                Ok(answers
                    .take(MAX_DNS_ANSWERS + 1)
                    .map(|address| address.ip())
                    .collect())
            }),
        )
    }
}

struct NativeTransport;
struct NativeBody(reqwest::Response);
impl HttpBody for NativeBody {
    fn chunk(&mut self) -> HttpFuture<'_, Option<Vec<u8>>> {
        Box::pin(async move {
            self.0
                .chunk()
                .await
                .map(|chunk| chunk.map(|bytes| bytes.to_vec()))
                .map_err(|error| {
                    if error.is_timeout() {
                        HttpFailure::Timeout
                    } else {
                        HttpFailure::Unavailable
                    }
                })
        })
    }
}

impl HttpTransport for NativeTransport {
    fn send(
        &self,
        request: PreparedRequest,
        addresses: Vec<SocketAddr>,
    ) -> HttpFuture<'static, HttpResponse> {
        Box::pin(async move {
            // A fresh client prevents connection pools, cookies or credentials crossing requests.
            // DNS is already validated; only these exact addresses may be dialed. TLS retains the URL hostname.
            let client = reqwest::Client::builder()
                .https_only(true)
                // Hyper's HTTP/1 parser is bounded to 100 fields and 417792 bytes;
                // the stricter semantic header limits apply before body reading.
                .http1_only()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .retry(reqwest::retry::never())
                .no_gzip()
                .no_brotli()
                .no_deflate()
                .no_zstd()
                .tls_sslkeylogfile(false)
                .pool_max_idle_per_host(0)
                .resolve_to_addrs(&request.host, &addresses)
                .timeout(Duration::from_millis(request.timeout_ms))
                .build()
                .map_err(|_| HttpFailure::Unavailable)?;
            let mut builder = client.request(request.method, request.url);
            for header in request.headers {
                builder = builder.header(header.name, header.value);
            }
            if let Some(body) = request.body {
                builder = builder.body(body.into_bytes());
            }
            let response = builder.send().await.map_err(|error| {
                if error.is_timeout() {
                    HttpFailure::Timeout
                } else {
                    HttpFailure::Unavailable
                }
            })?;
            let mut headers = Vec::new();
            for (name, value) in response.headers() {
                if headers.len() >= MAX_HEADERS {
                    return Err(HttpFailure::LimitExceeded);
                }
                headers.push(HttpHeader {
                    name: name.as_str().to_owned(),
                    value: value
                        .to_str()
                        .map_err(|_| HttpFailure::Unavailable)?
                        .to_owned(),
                });
            }
            Ok(HttpResponse {
                status: response.status().as_u16(),
                headers,
                body: Box::new(NativeBody(response)),
            })
        })
    }
}

#[derive(Default)]
struct Concurrency {
    per_attempt: HashMap<String, usize>,
    total: usize,
}

struct Permit {
    counts: Arc<Mutex<Concurrency>>,
    attempt: String,
}
impl Drop for Permit {
    fn drop(&mut self) {
        let mut counts = self
            .counts
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        counts.total -= 1;
        if let Some(count) = counts.per_attempt.get_mut(&self.attempt) {
            *count -= 1;
            if *count == 0 {
                counts.per_attempt.remove(&self.attempt);
            }
        }
    }
}

pub(crate) struct PluginHttpProvider {
    resolver: Arc<dyn HttpResolver>,
    transport: Arc<dyn HttpTransport>,
    counts: Arc<Mutex<Concurrency>>,
}

impl PluginHttpProvider {
    pub(crate) fn new() -> Self {
        Self {
            resolver: Arc::new(NativeResolver),
            transport: Arc::new(NativeTransport),
            counts: Arc::default(),
        }
    }

    fn acquire(&self, attempt: &str) -> Result<Permit, HttpFailure> {
        let mut counts = self
            .counts
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if counts.total >= MAX_GLOBAL_REQUESTS
            || counts.per_attempt.get(attempt).copied().unwrap_or(0) >= MAX_ATTEMPT_REQUESTS
        {
            return Err(HttpFailure::LimitExceeded);
        }
        counts.total += 1;
        *counts.per_attempt.entry(attempt.to_owned()).or_default() += 1;
        Ok(Permit {
            counts: Arc::clone(&self.counts),
            attempt: attempt.to_owned(),
        })
    }

    async fn execute_request(
        &self,
        attempt: &str,
        params: Value,
        mut cancelled: watch::Receiver<bool>,
    ) -> Value {
        let request = match prepare(params) {
            Ok(value) => value,
            Err(error) => return error.output(),
        };
        if *cancelled.borrow() {
            return HttpFailure::Cancelled.output();
        }
        let _permit = match self.acquire(attempt) {
            Ok(permit) => permit,
            Err(error) => return error.output(),
        };
        let timeout = Duration::from_millis(request.timeout_ms);
        let result = tokio::select! {
            biased;
            _ = cancelled.changed() => Err(HttpFailure::Cancelled),
            result = tokio::time::timeout(timeout, self.perform(request)) => result.unwrap_or(Err(HttpFailure::Timeout)),
        };
        match result {
            Ok(value) => value,
            Err(error) => error.output(),
        }
    }

    async fn perform(&self, request: PreparedRequest) -> Result<Value, HttpFailure> {
        let answers = match request.literal {
            Some(address) => vec![address],
            None => self.resolver.resolve(request.host.clone()).await?,
        };
        let addresses = approved_addresses(answers)?;
        let mut response = self.transport.send(request, addresses).await?;
        if !(100..=599).contains(&response.status) {
            return Err(HttpFailure::Unavailable);
        }
        validate_headers(&response.headers, false)?;
        for header in &response.headers {
            if header.name.eq_ignore_ascii_case("content-encoding")
                && !header.value.eq_ignore_ascii_case("identity")
            {
                return Err(HttpFailure::Unavailable);
            }
        }
        let nominated: HashSet<String> = response
            .headers
            .iter()
            .filter(|header| header.name.eq_ignore_ascii_case("connection"))
            .flat_map(|header| {
                header
                    .value
                    .split(',')
                    .map(|value| value.trim().to_ascii_lowercase())
            })
            .collect();
        let headers: Vec<_> = response
            .headers
            .into_iter()
            .filter(|header| {
                let name = header.name.to_ascii_lowercase();
                !response_header_blocked(&name) && !nominated.contains(&name)
            })
            .collect();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.body.chunk().await? {
            if bytes.len().saturating_add(chunk.len()) > MAX_BODY_BYTES {
                return Err(HttpFailure::LimitExceeded);
            }
            bytes.extend_from_slice(&chunk);
        }
        let body = String::from_utf8(bytes).map_err(|_| HttpFailure::Unavailable)?;
        let output = json!({ "method": "http.request", "result": { "status": response.status, "headers": headers, "body": body } });
        if serde_json::to_vec(&output)
            .map_err(|_| HttpFailure::InternalError)?
            .len()
            > MAX_RESULT_BYTES
        {
            return Err(HttpFailure::LimitExceeded);
        }
        Ok(output)
    }
}

impl HostHttpExecutor for PluginHttpProvider {
    fn execute(
        self: Arc<Self>,
        attempt: String,
        params: Value,
        cancelled: watch::Receiver<bool>,
    ) -> HttpExecutionFuture {
        Box::pin(async move { self.execute_request(&attempt, params, cancelled).await })
    }
}

fn prepare(value: Value) -> Result<PreparedRequest, HttpFailure> {
    if ["body", "timeoutMs"]
        .iter()
        .any(|field| value.get(field).is_some_and(Value::is_null))
    {
        return Err(HttpFailure::InvalidParams);
    }
    let params: HttpParams =
        serde_json::from_value(value).map_err(|_| HttpFailure::InvalidParams)?;
    if params.url.len() > MAX_URL_BYTES
        || params
            .url
            .bytes()
            .any(|byte| byte <= 0x20 || byte == 0x7f || byte == b'\\')
    {
        return Err(HttpFailure::InvalidParams);
    }
    let url = Url::parse(&params.url).map_err(|_| HttpFailure::InvalidParams)?;
    let authority = params
        .url
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or_default())
        .unwrap_or_default();
    if url.scheme() != "https"
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || authority.contains('@')
        || url.fragment().is_some()
    {
        return Err(HttpFailure::InvalidParams);
    }
    let (host, literal) = match url.host().ok_or(HttpFailure::InvalidParams)? {
        Host::Domain(name) if valid_domain(name) => (name.to_owned(), None),
        Host::Ipv4(ip) if public_address(IpAddr::V4(ip)) => (ip.to_string(), Some(IpAddr::V4(ip))),
        Host::Ipv6(ip) if public_address(IpAddr::V6(ip)) => (ip.to_string(), Some(IpAddr::V6(ip))),
        _ => return Err(HttpFailure::InvalidParams),
    };
    if !matches!(
        params.method.as_str(),
        "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS"
    ) || (matches!(params.method.as_str(), "GET" | "HEAD") && params.body.is_some())
    {
        return Err(HttpFailure::InvalidParams);
    }
    if params
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_BODY_BYTES)
    {
        return Err(HttpFailure::LimitExceeded);
    }
    validate_headers(&params.headers, true)?;
    let timeout_ms = params.timeout_ms.unwrap_or(DEFAULT_HTTP_TIMEOUT_MS);
    if !(1..=DEFAULT_HTTP_TIMEOUT_MS).contains(&timeout_ms) {
        return Err(HttpFailure::InvalidParams);
    }
    let method = reqwest::Method::from_bytes(params.method.as_bytes())
        .map_err(|_| HttpFailure::InvalidParams)?;
    Ok(PreparedRequest {
        url,
        host,
        literal,
        method,
        headers: params.headers,
        body: params.body,
        timeout_ms,
    })
}

fn valid_domain(name: &str) -> bool {
    if !name.contains('.') || name.ends_with('.') || name.len() > 253 {
        return false;
    }
    if [
        "localhost",
        "local",
        "localdomain",
        "internal",
        "home",
        "lan",
        "test",
        "invalid",
        "example",
        "example.com",
        "example.net",
        "example.org",
        "onion",
        "arpa",
        "alt",
    ]
    .iter()
    .any(|suffix| name == *suffix || name.ends_with(&format!(".{suffix}")))
    {
        return false;
    }
    name.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    })
}

fn header_token(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte))
}

fn request_header_blocked(name: &str) -> bool {
    matches!(
        name,
        "host"
            | "content-length"
            | "connection"
            | "transfer-encoding"
            | "cookie"
            | "cookie2"
            | "origin"
            | "referer"
            | "accept-encoding"
            | "upgrade"
            | "te"
            | "trailer"
    ) || name.starts_with("proxy-")
        || name.starts_with("sec-")
}

fn response_header_blocked(name: &str) -> bool {
    matches!(
        name,
        "set-cookie"
            | "set-cookie2"
            | "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn validate_headers(headers: &[HttpHeader], request: bool) -> Result<(), HttpFailure> {
    if headers.len() > MAX_HEADERS {
        return Err(HttpFailure::LimitExceeded);
    }
    let mut total = 0usize;
    let mut names = HashSet::new();
    for header in headers {
        if header.name.len() > 128 {
            return Err(HttpFailure::LimitExceeded);
        }
        if !header_token(&header.name)
            || !header
                .value
                .bytes()
                .all(|byte| (0x20..=0x7e).contains(&byte))
        {
            return Err(if request {
                HttpFailure::InvalidParams
            } else {
                HttpFailure::Unavailable
            });
        }
        total = total
            .saturating_add(header.name.len())
            .saturating_add(header.value.len());
        if header.value.len() > 8192 || total > MAX_HEADER_BYTES {
            return Err(HttpFailure::LimitExceeded);
        }
        let name = header.name.to_ascii_lowercase();
        if request && (request_header_blocked(&name) || !names.insert(name)) {
            return Err(HttpFailure::InvalidParams);
        }
    }
    Ok(())
}

fn approved_addresses(answers: Vec<IpAddr>) -> Result<Vec<SocketAddr>, HttpFailure> {
    if answers.is_empty() {
        return Err(HttpFailure::Unavailable);
    }
    if answers.len() > MAX_DNS_ANSWERS {
        return Err(HttpFailure::LimitExceeded);
    }
    if answers.iter().any(|address| !public_address(*address)) {
        return Err(HttpFailure::InvalidParams);
    }
    let mut addresses = Vec::new();
    for address in answers {
        let normalized = match address {
            IpAddr::V6(ip) => ip.to_ipv4_mapped().map(IpAddr::V4).unwrap_or(address),
            _ => address,
        };
        let socket = SocketAddr::new(normalized, 443);
        if !addresses.contains(&socket) {
            addresses.push(socket);
        }
    }
    Ok(addresses)
}

fn v4_prefix(ip: Ipv4Addr, base: [u8; 4], bits: u32) -> bool {
    u32::from(ip) >> (32 - bits) == u32::from(Ipv4Addr::from(base)) >> (32 - bits)
}
fn v6_prefix(ip: Ipv6Addr, base: u128, bits: u32) -> bool {
    u128::from(ip) >> (128 - bits) == base >> (128 - bits)
}

/// Conservative public-unicast policy; IANA special-purpose registries reviewed 2026-10-22.
fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            ip != Ipv4Addr::new(168, 63, 129, 16)
                && ![
                    ([0, 0, 0, 0], 8),
                    ([10, 0, 0, 0], 8),
                    ([100, 64, 0, 0], 10),
                    ([127, 0, 0, 0], 8),
                    ([169, 254, 0, 0], 16),
                    ([172, 16, 0, 0], 12),
                    ([192, 0, 0, 0], 24),
                    ([192, 0, 2, 0], 24),
                    ([192, 31, 196, 0], 24),
                    ([192, 52, 193, 0], 24),
                    ([192, 88, 99, 0], 24),
                    ([192, 168, 0, 0], 16),
                    ([192, 175, 48, 0], 24),
                    ([198, 18, 0, 0], 15),
                    ([198, 51, 100, 0], 24),
                    ([203, 0, 113, 0], 24),
                    ([224, 0, 0, 0], 4),
                    ([240, 0, 0, 0], 4),
                ]
                .iter()
                .any(|(base, bits)| v4_prefix(ip, *base, *bits))
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return public_address(IpAddr::V4(mapped));
            }
            v6_prefix(ip, 0x2000_u128 << 112, 3)
                && ![
                    (0x2001_u128 << 112, 23),
                    (0x20010db8_u128 << 96, 32),
                    (0x2002_u128 << 112, 16),
                    (0x2620004f8000_u128 << 80, 48),
                    (0x3fff_u128 << 112, 20),
                ]
                .iter()
                .any(|(base, bits)| v6_prefix(ip, *base, *bits))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct DropProbe(Arc<AtomicUsize>);
    impl Drop for DropProbe {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    struct FakeResolver {
        answers: Vec<IpAddr>,
        calls: AtomicUsize,
        pending: bool,
        failed: bool,
        dropped: Arc<AtomicUsize>,
    }
    impl HttpResolver for FakeResolver {
        fn resolve(&self, _host: String) -> HttpFuture<'static, Vec<IpAddr>> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let answers = self.answers.clone();
            let pending = self.pending;
            let failed = self.failed;
            let dropped = Arc::clone(&self.dropped);
            Box::pin(async move {
                let _probe = DropProbe(dropped);
                if pending {
                    std::future::pending::<()>().await;
                }
                if failed {
                    Err(HttpFailure::Unavailable)
                } else {
                    Ok(answers)
                }
            })
        }
    }

    struct FakeBody {
        chunks: VecDeque<Vec<u8>>,
        pending: bool,
        dropped: Arc<AtomicUsize>,
    }
    impl HttpBody for FakeBody {
        fn chunk(&mut self) -> HttpFuture<'_, Option<Vec<u8>>> {
            Box::pin(async move {
                if self.pending {
                    std::future::pending::<()>().await;
                }
                Ok(self.chunks.pop_front())
            })
        }
    }
    impl Drop for FakeBody {
        fn drop(&mut self) {
            self.dropped.fetch_add(1, Ordering::SeqCst);
        }
    }

    struct Observation {
        host: String,
        url: String,
        method: reqwest::Method,
        headers: Vec<HttpHeader>,
        body: Option<String>,
        addresses: Vec<SocketAddr>,
    }
    struct FakeTransport {
        status: u16,
        headers: Vec<HttpHeader>,
        chunks: Vec<Vec<u8>>,
        pending: bool,
        body_pending: bool,
        seen: Mutex<Vec<Observation>>,
        dropped: Arc<AtomicUsize>,
        body_dropped: Arc<AtomicUsize>,
    }
    impl HttpTransport for FakeTransport {
        fn send(
            &self,
            request: PreparedRequest,
            addresses: Vec<SocketAddr>,
        ) -> HttpFuture<'static, HttpResponse> {
            self.seen.lock().unwrap().push(Observation {
                host: request.host,
                url: request.url.to_string(),
                method: request.method,
                headers: request.headers,
                body: request.body,
                addresses,
            });
            let status = self.status;
            let headers = self.headers.clone();
            let chunks = self.chunks.clone();
            let pending = self.pending;
            let body_pending = self.body_pending;
            let dropped = Arc::clone(&self.dropped);
            let body_dropped = Arc::clone(&self.body_dropped);
            Box::pin(async move {
                let _probe = DropProbe(dropped);
                if pending {
                    std::future::pending::<()>().await;
                }
                Ok(HttpResponse {
                    status,
                    headers,
                    body: Box::new(FakeBody {
                        chunks: chunks.into(),
                        pending: body_pending,
                        dropped: body_dropped,
                    }),
                })
            })
        }
    }

    fn resolver() -> FakeResolver {
        FakeResolver {
            answers: vec!["8.8.8.8".parse().unwrap()],
            calls: AtomicUsize::new(0),
            pending: false,
            failed: false,
            dropped: Arc::default(),
        }
    }
    fn transport() -> FakeTransport {
        FakeTransport {
            status: 200,
            headers: vec![],
            chunks: vec![b"result".to_vec()],
            pending: false,
            body_pending: false,
            seen: Mutex::default(),
            dropped: Arc::default(),
            body_dropped: Arc::default(),
        }
    }
    fn make_provider(
        resolver: Arc<FakeResolver>,
        transport: Arc<FakeTransport>,
    ) -> Arc<PluginHttpProvider> {
        Arc::new(PluginHttpProvider {
            resolver,
            transport,
            counts: Arc::default(),
        })
    }
    fn request() -> Value {
        json!({"url":"https://api.vendor.com/v1?q=synthetic", "method":"POST", "body":"  原文\n"})
    }
    fn header(name: &str, value: &str) -> HttpHeader {
        HttpHeader {
            name: name.to_owned(),
            value: value.to_owned(),
        }
    }
    async fn run(provider: &PluginHttpProvider, params: Value) -> Value {
        let (_sender, receiver) = watch::channel(false);
        provider
            .execute_request("attempt-test", params, receiver)
            .await
    }

    #[test]
    fn rejects_nonpublic_ipv4_ipv6_and_mapped_destinations() {
        for address in [
            "0.0.0.0",
            "0.2.3.4",
            "10.1.2.3",
            "100.64.0.1",
            "100.127.255.255",
            "127.1.2.3",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.9",
            "192.0.2.1",
            "192.31.196.1",
            "192.52.193.1",
            "192.175.48.1",
            "::ffff:192.31.196.1",
            "::ffff:192.52.193.1",
            "::ffff:192.175.48.1",
            "192.88.99.1",
            "192.168.0.1",
            "198.18.0.1",
            "198.19.255.255",
            "198.51.100.1",
            "203.0.113.1",
            "224.0.0.1",
            "255.255.255.255",
            "168.63.129.16",
            "::",
            "::1",
            "fc00::1",
            "fe80::1",
            "ff02::1",
            "64:ff9b::808:808",
            "2001::1",
            "2001:db8::1",
            "2002:808:808::1",
            "2620:4f:8000::1",
            "3fff::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
        ] {
            assert!(
                !public_address(address.parse().unwrap()),
                "must reject {address}"
            );
        }
        for address in [
            "8.8.8.8",
            "1.1.1.1",
            "100.128.0.1",
            "172.32.0.1",
            "2001:4860:4860::8888",
            "2606:4700:4700::1111",
            "::ffff:8.8.8.8",
        ] {
            assert!(
                public_address(address.parse().unwrap()),
                "must allow {address}"
            );
        }
    }

    #[test]
    fn rejects_unsafe_urls_before_dns() {
        for url in [
            "http://api.vendor.com",
            "https://api.vendor.com:444",
            "https://user:pass@api.vendor.com",
            "https://@api.vendor.com",
            "https://api.vendor.com/#fragment",
            "https://localhost",
            "https://machine",
            "https://a.local",
            "https://a.internal",
            "https://a.localhost",
            "https://a.test",
            "https://a.invalid",
            "https://a.example",
            "https://api.vendor.com.",
            "https://127.1",
            "https://2130706433",
            "https://0x7f000001",
            "https://[::1]",
            "https://api.vendor.com\\private",
            "https://api.vendor.com/\nunsafe",
            "file:///etc/hosts",
            "https://a..com",
        ] {
            let mut params = request();
            params["url"] = json!(url);
            assert!(
                matches!(prepare(params), Err(HttpFailure::InvalidParams)),
                "must reject {url}"
            );
        }
        let mut params = request();
        params["url"] = json!(format!("https://api.vendor.com/{}", "é".repeat(2048)));
        assert!(matches!(prepare(params), Err(HttpFailure::InvalidParams)));
        for url in [
            "https://api.vendor.com:443/path",
            "https://8.8.8.8/path",
            "https://[::ffff:8.8.8.8]/path",
        ] {
            let mut params = request();
            params["url"] = json!(url);
            assert!(prepare(params).is_ok());
        }
    }

    #[tokio::test]
    async fn validates_all_dns_answers_then_pins_exact_addresses_and_preserves_signed_bytes() {
        let dns = Arc::new(FakeResolver {
            answers: vec![
                "8.8.8.8".parse().unwrap(),
                "::ffff:1.1.1.1".parse().unwrap(),
                "8.8.8.8".parse().unwrap(),
            ],
            ..resolver()
        });
        let http = Arc::new(transport());
        let provider = make_provider(dns.clone(), http.clone());
        let mut params = request();
        params["headers"] = json!([{"name":"Authorization","value":"synthetic signature"},{"name":"X-Date","value":"20261022T000000Z"}]);
        let result = run(&provider, params).await;
        assert_eq!(result["result"]["body"], "result");
        assert_eq!(dns.calls.load(Ordering::SeqCst), 1);
        let seen = http.seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(
            seen[0].addresses,
            vec![
                "8.8.8.8:443".parse::<SocketAddr>().unwrap(),
                "1.1.1.1:443".parse().unwrap()
            ]
        );
        assert_eq!(seen[0].host, "api.vendor.com");
        assert_eq!(seen[0].url, "https://api.vendor.com/v1?q=synthetic");
        assert_eq!(seen[0].method, reqwest::Method::POST);
        assert_eq!(seen[0].body.as_deref(), Some("  原文\n"));
        assert_eq!(seen[0].headers[0].value, "synthetic signature");
    }

    #[tokio::test]
    async fn rejects_mixed_private_dns_empty_answers_and_excess_answers_without_transport() {
        for (answers, code) in [
            (vec!["8.8.8.8", "127.0.0.1"], "invalid_params"),
            (vec![], "unavailable"),
            (vec!["8.8.8.8"; 17], "limit_exceeded"),
        ] {
            let dns = Arc::new(FakeResolver {
                answers: answers.iter().map(|value| value.parse().unwrap()).collect(),
                ..resolver()
            });
            let http = Arc::new(transport());
            let provider = make_provider(dns.clone(), http.clone());
            assert_eq!(run(&provider, request()).await["code"], code);
            assert!(http.seen.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn literal_public_ip_never_uses_dns() {
        let dns = Arc::new(FakeResolver {
            pending: true,
            ..resolver()
        });
        let http = Arc::new(transport());
        let provider = make_provider(dns.clone(), http.clone());
        let mut params = request();
        params["url"] = json!("https://8.8.8.8/");
        assert_eq!(run(&provider, params).await["result"]["status"], 200);
        assert_eq!(dns.calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn rejects_framing_environment_duplicate_and_non_ascii_request_headers() {
        for name in [
            "Host",
            "Content-Length",
            "Connection",
            "Transfer-Encoding",
            "Cookie",
            "Cookie2",
            "Origin",
            "Referer",
            "Accept-Encoding",
            "Upgrade",
            "TE",
            "Trailer",
            "Proxy-Authorization",
            "SEC-FETCH-SITE",
            "X Bad",
            "X:Bad",
            "X-中文",
        ] {
            assert!(
                matches!(
                    validate_headers(&[header(name, "fixture")], true),
                    Err(HttpFailure::InvalidParams)
                ),
                "{name}"
            );
        }
        for value in ["a\rb", "a\nb", "a\tb", "秘密", "\u{7f}"] {
            assert!(matches!(
                validate_headers(&[header("X-Data", value)], true),
                Err(HttpFailure::InvalidParams)
            ));
        }
        assert!(matches!(
            validate_headers(&[header("X-Data", "a"), header("x-data", "b")], true),
            Err(HttpFailure::InvalidParams)
        ));
        assert!(validate_headers(
            &[
                header("Authorization", "signature"),
                header("X-Content-Sha256", "hash")
            ],
            true
        )
        .is_ok());
    }

    #[test]
    fn validates_method_optional_field_and_header_budgets() {
        for method in ["GET", "HEAD"] {
            let mut params = request();
            params["method"] = json!(method);
            assert!(matches!(prepare(params), Err(HttpFailure::InvalidParams)));
        }
        for method in ["CONNECT", "TRACE", "post"] {
            let mut params = request();
            params["method"] = json!(method);
            assert!(matches!(prepare(params), Err(HttpFailure::InvalidParams)));
        }
        for method in ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] {
            assert!(prepare(json!({"url":"https://api.vendor.com/","method":method})).is_ok());
        }
        for value in [0, 15001] {
            let mut params = request();
            params["timeoutMs"] = json!(value);
            assert!(matches!(prepare(params), Err(HttpFailure::InvalidParams)));
        }
        for key in ["timeoutMs", "body", "headers"] {
            let mut params = request();
            params[key] = Value::Null;
            assert!(matches!(prepare(params), Err(HttpFailure::InvalidParams)));
        }
        let mut params = request();
        params["identity"] = json!("forged");
        assert!(matches!(prepare(params), Err(HttpFailure::InvalidParams)));
        assert!(matches!(
            validate_headers(
                &(0..33)
                    .map(|i| header(&format!("X-{i}"), "a"))
                    .collect::<Vec<_>>(),
                true
            ),
            Err(HttpFailure::LimitExceeded)
        ));
        assert!(matches!(
            validate_headers(&[header("X-A", &"a".repeat(8193))], true),
            Err(HttpFailure::LimitExceeded)
        ));
        assert!(matches!(
            validate_headers(
                &[
                    header("X-A", &"a".repeat(8192)),
                    header("X-B", &"b".repeat(8192))
                ],
                true
            ),
            Err(HttpFailure::LimitExceeded)
        ));
        assert!(matches!(
            validate_headers(&[header(&"X".repeat(129), "a")], true),
            Err(HttpFailure::LimitExceeded)
        ));
    }

    #[tokio::test]
    async fn preserves_every_http_status_and_never_follows_redirects_or_requires_cors() {
        for status in [200, 301, 400, 401, 403, 429, 500, 599] {
            let http = Arc::new(FakeTransport {
                status,
                headers: vec![
                    header("Location", "http://127.0.0.1/"),
                    header("Retry-After", "0"),
                ],
                ..transport()
            });
            let provider = make_provider(Arc::new(resolver()), http.clone());
            let result = run(&provider, request()).await;
            assert_eq!(result["result"]["status"], status);
            assert_eq!(result["result"]["body"], "result");
            assert_eq!(http.seen.lock().unwrap().len(), 1);
        }
    }

    #[tokio::test]
    async fn strips_cookies_hop_headers_and_connection_nominated_fields_without_merging_duplicates()
    {
        let http = Arc::new(FakeTransport {
            headers: vec![
                header("Set-Cookie", "secret-cookie"),
                header("Set-Cookie2", "other-cookie"),
                header("Connection", "X-Hop, keep-alive"),
                header("X-Hop", "private"),
                header("Keep-Alive", "timeout=4"),
                header("Transfer-Encoding", "chunked"),
                header("X-Result", "one"),
                header("X-Result", "two"),
            ],
            ..transport()
        });
        let provider = make_provider(Arc::new(resolver()), http);
        let result = run(&provider, request()).await;
        assert_eq!(
            result["result"]["headers"],
            json!([{"name":"X-Result","value":"one"},{"name":"X-Result","value":"two"}])
        );
    }

    #[tokio::test]
    async fn enforces_raw_response_header_limits_even_for_stripped_fields() {
        for headers in [
            vec![header("Set-Cookie", &"s".repeat(8193))],
            vec![header("Set-Cookie", "s"); 33],
            vec![header("Set-Cookie", &"s".repeat(8192)); 2],
        ] {
            let http = Arc::new(FakeTransport {
                headers,
                ..transport()
            });
            let provider = make_provider(Arc::new(resolver()), http.clone());
            assert_eq!(run(&provider, request()).await["code"], "limit_exceeded");
            assert_eq!(http.body_dropped.load(Ordering::SeqCst), 1);
        }
    }

    #[tokio::test]
    async fn rejects_compression_invalid_response_headers_and_invalid_utf8() {
        for headers in [
            vec![header("Content-Encoding", "gzip")],
            vec![header("Content-Encoding", "br")],
            vec![header("X-Result", "a\nb")],
        ] {
            let provider = make_provider(
                Arc::new(resolver()),
                Arc::new(FakeTransport {
                    headers,
                    ..transport()
                }),
            );
            assert_eq!(run(&provider, request()).await["code"], "unavailable");
        }
        let provider = make_provider(
            Arc::new(resolver()),
            Arc::new(FakeTransport {
                chunks: vec![vec![0xff]],
                ..transport()
            }),
        );
        assert_eq!(run(&provider, request()).await["code"], "unavailable");
    }

    #[tokio::test]
    async fn request_and_response_limits_count_utf8_bytes_and_do_not_truncate() {
        let http = Arc::new(transport());
        let provider = make_provider(Arc::new(resolver()), http.clone());
        let mut params = request();
        params["body"] = json!("é".repeat(MAX_BODY_BYTES / 2));
        assert_eq!(run(&provider, params).await["result"]["status"], 200);
        assert_eq!(
            http.seen.lock().unwrap()[0].body.as_ref().unwrap().len(),
            MAX_BODY_BYTES
        );
        let mut params = request();
        params["body"] = json!("é".repeat(MAX_BODY_BYTES / 2 + 1));
        assert_eq!(run(&provider, params).await["code"], "limit_exceeded");
        assert_eq!(http.seen.lock().unwrap().len(), 1);
        for (chunks, oversized) in [
            (vec![vec![b'a'; MAX_BODY_BYTES]], false),
            (vec![vec![b'a'; MAX_BODY_BYTES], vec![b'b']], true),
        ] {
            let http = Arc::new(FakeTransport {
                chunks,
                ..transport()
            });
            let provider = make_provider(Arc::new(resolver()), http.clone());
            let result = run(&provider, request()).await;
            if oversized {
                assert_eq!(result["code"], "limit_exceeded");
                assert!(result.get("result").is_none());
            } else {
                assert_eq!(
                    result["result"]["body"].as_str().unwrap().len(),
                    MAX_BODY_BYTES
                );
            }
            assert_eq!(http.body_dropped.load(Ordering::SeqCst), 1);
        }
    }

    #[tokio::test]
    async fn rejects_json_escape_expansion_instead_of_expanding_wire_budget() {
        let provider = make_provider(
            Arc::new(resolver()),
            Arc::new(FakeTransport {
                chunks: vec![vec![0; MAX_BODY_BYTES]],
                ..transport()
            }),
        );
        let result = run(&provider, request()).await;
        assert_eq!(result["code"], "limit_exceeded");
        assert!(result.get("result").is_none());
    }

    #[tokio::test(start_paused = true)]
    async fn deadline_covers_dns_connection_and_body_and_releases_capacity() {
        for phase in 0..3 {
            let dns = Arc::new(FakeResolver {
                pending: phase == 0,
                ..resolver()
            });
            let http = Arc::new(FakeTransport {
                pending: phase == 1,
                body_pending: phase == 2,
                ..transport()
            });
            let provider = make_provider(dns.clone(), http.clone());
            let start = tokio::time::Instant::now();
            assert_eq!(run(&provider, request()).await["code"], "timeout");
            assert_eq!(
                start.elapsed(),
                Duration::from_millis(DEFAULT_HTTP_TIMEOUT_MS)
            );
            assert_eq!(provider.counts.lock().unwrap().total, 0);
            if phase == 0 {
                assert_eq!(dns.dropped.load(Ordering::SeqCst), 1);
            }
            if phase == 1 {
                assert_eq!(http.dropped.load(Ordering::SeqCst), 1);
            }
            if phase == 2 {
                assert_eq!(http.body_dropped.load(Ordering::SeqCst), 1);
            }
        }
    }

    #[tokio::test]
    async fn cancellation_at_every_stage_drops_work_and_releases_capacity() {
        for phase in 0..3 {
            let dns = Arc::new(FakeResolver {
                pending: phase == 0,
                ..resolver()
            });
            let http = Arc::new(FakeTransport {
                pending: phase == 1,
                body_pending: phase == 2,
                ..transport()
            });
            let provider = make_provider(dns.clone(), http.clone());
            let (cancel, cancelled) = watch::channel(false);
            let task = tokio::spawn(provider.clone().execute(
                "scope".to_owned(),
                request(),
                cancelled,
            ));
            tokio::task::yield_now().await;
            assert_eq!(provider.counts.lock().unwrap().total, 1);
            cancel.send(true).unwrap();
            assert_eq!(task.await.unwrap()["code"], "cancelled");
            assert_eq!(provider.counts.lock().unwrap().total, 0);
            if phase == 0 {
                assert_eq!(dns.dropped.load(Ordering::SeqCst), 1);
            }
            if phase == 1 {
                assert_eq!(http.dropped.load(Ordering::SeqCst), 1);
            }
            if phase == 2 {
                assert_eq!(http.body_dropped.load(Ordering::SeqCst), 1);
            }
        }
    }

    #[tokio::test]
    async fn pre_cancelled_request_performs_no_dns_or_transport() {
        let dns = Arc::new(resolver());
        let http = Arc::new(transport());
        let provider = make_provider(dns.clone(), http.clone());
        let (_cancel, cancelled) = watch::channel(true);
        assert_eq!(
            provider
                .execute_request("scope", request(), cancelled)
                .await["code"],
            "cancelled"
        );
        assert_eq!(dns.calls.load(Ordering::SeqCst), 0);
        assert!(http.seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn concurrency_is_bounded_per_attempt_and_globally_without_waiting_queue() {
        let http = Arc::new(FakeTransport {
            body_pending: true,
            ..transport()
        });
        let provider = make_provider(Arc::new(resolver()), http.clone());
        let mut running = Vec::new();
        for attempt in 0..4 {
            for _ in 0..4 {
                let (cancel, cancelled) = watch::channel(false);
                running.push((
                    cancel,
                    tokio::spawn(provider.clone().execute(
                        format!("scope-{attempt}"),
                        request(),
                        cancelled,
                    )),
                ));
            }
        }
        tokio::task::yield_now().await;
        let (_cancel, cancelled) = watch::channel(false);
        assert_eq!(
            provider
                .execute_request("scope-0", request(), cancelled)
                .await["code"],
            "limit_exceeded"
        );
        let (_cancel, cancelled) = watch::channel(false);
        assert_eq!(
            provider
                .execute_request("new-scope", request(), cancelled)
                .await["code"],
            "limit_exceeded"
        );
        assert_eq!(provider.counts.lock().unwrap().total, 16);
        assert_eq!(http.seen.lock().unwrap().len(), 16);
        for (cancel, task) in running {
            cancel.send(true).unwrap();
            assert_eq!(task.await.unwrap()["code"], "cancelled");
        }
        assert_eq!(provider.counts.lock().unwrap().total, 0);
        assert!(provider.counts.lock().unwrap().per_attempt.is_empty());
    }

    #[tokio::test]
    async fn resolver_failure_is_bounded_and_never_retains_sensitive_request_data() {
        let provider = make_provider(
            Arc::new(FakeResolver {
                failed: true,
                ..resolver()
            }),
            Arc::new(transport()),
        );
        let result = run(&provider, request()).await;
        assert_eq!(result, HttpFailure::Unavailable.output());
        assert!(!result.to_string().contains("synthetic"));
        assert!(!result.to_string().contains("api.vendor.com"));
    }

    #[tokio::test]
    async fn cancelled_os_lookup_keeps_its_worker_slot_until_completion_and_never_sends() {
        struct WorkerResolver {
            workers: Arc<Semaphore>,
            lookup: Arc<BlockingLookup>,
        }
        impl HttpResolver for WorkerResolver {
            fn resolve(&self, host: String) -> HttpFuture<'static, Vec<IpAddr>> {
                resolve_on_worker(host, self.workers.clone(), self.lookup.clone())
            }
        }
        let workers = Arc::new(Semaphore::new(1));
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let started = Arc::new(Mutex::new(Some(started_tx)));
        let (release, released) = std::sync::mpsc::channel();
        let released = Arc::new(Mutex::new(released));
        let lookup: Arc<BlockingLookup> = Arc::new(move |_host| {
            if let Some(started) = started.lock().unwrap().take() {
                let _ = started.send(());
            }
            released.lock().unwrap().recv().unwrap();
            Ok(vec!["8.8.8.8".parse().unwrap()])
        });
        let resolver = Arc::new(WorkerResolver {
            workers: workers.clone(),
            lookup: lookup.clone(),
        });
        let http = Arc::new(transport());
        let provider = Arc::new(PluginHttpProvider {
            resolver: resolver.clone(),
            transport: http.clone(),
            counts: Arc::default(),
        });
        let (cancel, cancelled) = watch::channel(false);
        let task = tokio::spawn(
            provider
                .clone()
                .execute("scope".to_owned(), request(), cancelled),
        );
        started_rx.await.unwrap();
        cancel.send(true).unwrap();
        assert_eq!(task.await.unwrap()["code"], "cancelled");
        assert_eq!(provider.counts.lock().unwrap().total, 0);
        assert_eq!(workers.available_permits(), 0);
        assert!(matches!(
            resolver.resolve("api.vendor.com".to_owned()).await,
            Err(HttpFailure::LimitExceeded)
        ));
        release.send(()).unwrap();
        let permit = tokio::time::timeout(Duration::from_secs(1), workers.acquire())
            .await
            .unwrap()
            .unwrap();
        drop(permit);
        assert_eq!(workers.available_permits(), 1);
        assert!(http.seen.lock().unwrap().is_empty());
    }
}
