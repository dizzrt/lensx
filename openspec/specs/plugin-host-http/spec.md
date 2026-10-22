# plugin-host-http Specification

## Purpose

Define controlled Host HTTPS text transport shared by all plugins, returning actual status and body even when a server omits browser cross-origin response headers, while preserving platform boundaries through trusted Runtime identity, public-address policy, resource limits, and native cancellation. Business logic and signing remain the plugin's responsibility.

## Requirements

### Requirement: Host HTTP MUST expose one public generic text request contract

Host API `0.3.0` MUST add `http.request`. Parameters MUST be `{ url, method, headers?, body?, timeoutMs? }`, with headers as an array of `{ name, value }`. Allowed methods are `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`; GET/HEAD MUST omit body. Results MUST be `{ status, headers, body }`, with status 100–599 and UTF-8 text body. The Host MUST return bounded HTTP 3xx/4xx/5xx status and body for plugin interpretation, without refusing to read non-2xx responses or depending on CORS headers. Plugins MUST invoke the public typed SDK with current capability discovery and MUST NOT obtain native clients, raw bridges, or Tauri commands. Every plugin MUST follow the same rules; the Host MUST NOT contain translation services, credential signing, or provider-specific exceptions.

#### Scenario: Plugin performs a signed text request
- **WHEN** a plugin submits a policy-compliant HTTPS URL, explicit Authorization/headers, and a complete text body
- **THEN** the Rust Host sends the same validated UTF-8 body bytes and returns status/headers/body
- **THEN** signing and business-response parsing remain in the plugin; the Host does not modify body content or add business fields

#### Scenario: Remote response has no CORS header
- **WHEN** the remote endpoint returns a valid bounded HTTP response without Access-Control-Allow-Origin
- **THEN** Host HTTP returns actual status and text while preserving the browser's own security settings

#### Scenario: Plugin targets an unsupported Host
- **WHEN** current Context does not declare http.request
- **THEN** the SDK does not treat it as available, and the plugin cannot bypass the public boundary to make requests

### Requirement: Host HTTP MUST restrict destinations to validated public HTTPS

URLs MUST be at most 4096 UTF-8 bytes and allow only HTTPS/443; userinfo, fragments, single-label hostnames, and local/reserved hostnames MUST be rejected. DNS MUST resolve once within the total deadline, returning 1–16 addresses; any non-public address MUST reject the entire request. Cloud-platform service address `168.63.129.16` MUST be explicitly rejected. Unspecified, loopback, private, link-local, shared, documentation, multicast, reserved, and protocol-special IPv4 addresses MUST be rejected. IPv6 MUST allow only public 2000::/3, excluding special/documentation/transition ranges including 2001::/23, 2001:db8::/32, 2002::/16, and 3fff::/20; IPv4-mapped IPv6 MUST follow IPv4 policy. Actual connections MUST be pinned to validated addresses, retain TLS verification of the original hostname, and MUST NOT resolve again to unvalidated addresses. The Host MUST NOT use system/environment proxies or expose a TLS-verification bypass.

#### Scenario: A public hostname resolves to a private address
- **WHEN** any DNS answer is private, loopback, link-local, or otherwise rejected, even alongside public answers
- **THEN** the Host returns a safe rejection before sending a request and connects to none of the addresses

#### Scenario: DNS answers change after validation
- **WHEN** the initial DNS answer passes and later resolution could change
- **THEN** the request uses only the initially validated pinned addresses while TLS still verifies the original URL hostname

#### Scenario: Plugin supplies credentials in a URL or an unsupported destination
- **WHEN** the URL includes userinfo, a fragment, non-HTTPS, a non-443 port, a local name, or a non-public IP
- **THEN** the request fails before network operations without exposing resolution details or internal addresses

### Requirement: Host HTTP MUST bound headers payloads and serialized responses

Request headers MUST be limited to 32 entries, with ASCII HTTP-token names of at most 128 bytes, ASCII U+0020–U+007E values of at most 8192 bytes, and at most 16 KiB of total name/value bytes; case-insensitive duplicate names MUST be rejected. Plugins MUST NOT submit Host, Content-Length, Connection, Transfer-Encoding, Cookie, Cookie2, Origin, Referer, Accept-Encoding, Upgrade, TE, Trailer, Proxy-*, or Sec-* headers. Response headers MUST satisfy the same individual, count, and total-byte limits before body reading; these are accepted semantic-value limits, and the underlying HTTP parser MUST also use bounded parsing buffers. Response headers MAY retain duplicate ordinary fields and MUST filter Set-Cookie/Set-Cookie2 and hop-by-hop fields.

Request bodies MUST be at most 1 MiB of UTF-8 bytes. Responses MUST be limited to 1 MiB of raw bytes while reading and validated as UTF-8; the complete serialized semantic result MUST be at most 4 MiB, preserving the existing 5 MiB wire-frame limit. Oversized or invalid results MUST fail entirely without truncation, partial success, or guessed binary representations.

#### Scenario: Plugin forges transport identity or framing
- **WHEN** request headers include protected fields, control characters, Unicode, or case-insensitive duplicate names
- **THEN** the Host rejects the request without merging differently signed bytes or injecting browser/system ambient identity

#### Scenario: Response stream exceeds a limit
- **WHEN** a response read in chunks exceeds body, header, or serialized-result limits
- **THEN** the Host stops local reading and returns limit_exceeded without passing through partial content

#### Scenario: Text expands when encoded into the bridge frame
- **WHEN** JSON escaping expands a UTF-8 body beyond the 4 MiB semantic-result limit
- **THEN** the Host returns bounded limit_exceeded and MUST NOT enlarge existing wire limits

### Requirement: Host HTTP MUST preserve bounded foreground execution and cancellation

Each request's timeoutMs MUST be 1–15000ms, defaulting to 15000ms, covering DNS, connection, TLS, sending, and response reading. HTTP RPC deadlines MUST equal the request timeout plus 1000ms and be at most 16000ms; other methods retain 10000ms. Each Runtime attempt MUST have at most 4 in-flight HTTP requests and the global maximum MUST be 16; excess requests MUST fail immediately without queuing.

The native provider MUST obtain attempt/source/request_id from current source-bound RPC, not plugin-supplied identity. The system DNS resolver MUST separately limit global in-flight workers to 16 without queuing, with capacity held by an OS resolution call until it actually finishes. Cancellation MUST immediately end the current HTTP future/wait and discard late DNS results, and MUST NOT establish a connection after cancellation; it does not promise to retract sent DNS packets or interrupt existing resolution calls that the OS cannot cancel.

Cancellation handles MUST be registered before asynchronous execution starts. SDK cancellation, RPC deadlines, actual close, disable, replacement, reload, or disconnection MUST cancel native work and release resources idempotently. Late results MUST NOT revive terminated requests or modify new attempts. Temporarily hiding and restoring the same attempt MUST NOT add requests or lose its valid state.

#### Scenario: Cancellation races DNS or response reading
- **WHEN** plugin cancellation, timeout, or Runtime termination occurs during DNS, connection, or reading
- **THEN** HTTP work and waits stop, request concurrency capacity is released, and obsolete results cannot reach a new Runtime; non-interruptible OS DNS workers independently retain their bounded capacity until completion

#### Scenario: Concurrency is exhausted
- **WHEN** an attempt already has 4 or the system already has 16 HTTP requests
- **THEN** new requests return limit_exceeded without replacing existing requests or creating a waiting queue

#### Scenario: HTTP duration exceeds the old generic RPC deadline
- **WHEN** HTTP requests 15000ms and is still validly running at 10000ms
- **THEN** generic RPC does not terminate it at the old 10-second boundary, while the HTTP total deadline and bounded RPC margin still apply

### Requirement: Host HTTP MUST avoid ambient credentials retries and sensitive diagnostics

The Host MUST NOT share cookies, system credentials, or HTTP cache, or automatically redirect, retry, or decompress. The first version MUST use HTTP/1 and a bounded HTTP parser, without promising HTTP/2-only endpoints. Non-identity Content-Encoding MUST cause safe failure. Only explicitly submitted plugin business headers/body may be sent; the Host MUST NOT log URL queries, request/response bodies, Authorization, credentials, signatures, or raw network exceptions.

Failures MUST use existing stable Host API errors invalid_params, limit_exceeded, timeout, cancelled, unavailable, and internal_error with only bounded product-owned messages. Destination-policy rejection MUST be invalid_params; network/TLS/DNS/unsupported responses MUST be unavailable; size or concurrency limits MUST be limit_exceeded. HTTP error statuses MUST still be results for plugin interpretation.

#### Scenario: Remote server redirects to a local destination
- **WHEN** a server returns a redirect
- **THEN** the Host returns the original 3xx response without following Location or forwarding authorization to a new destination

#### Scenario: Service sets a cookie or asks for a retry
- **WHEN** a response carries Set-Cookie, Retry-After, or a non-success status
- **THEN** the Host does not store cookies or retry automatically; the plugin presents its defined business status

#### Scenario: Native transport fails with private diagnostics
- **WHEN** the resolver, TLS, or transport produces a raw error
- **THEN** plugins and logs receive only safe categories without Host-internal paths, addresses, credentials, or response fragments

### Requirement: Host HTTP MUST ship with deterministic cross-layer evidence

Maintained validation MUST cover public Schema, generated types, catalog, shared TS/Rust fixtures, typed SDK, capability discovery, native-dispatcher source binding, addresses and DNS pinning, size/headers/UTF-8/serialization budgets, deadlines, concurrency, cancellation, and lifecycle. Tests MUST use controlled resolver/transport implementations without relying on external networks, real credentials, paid requests, browser/WebView, GUI, or native interactive harnesses. The capability MUST enter the stable plugin-host-http Gate and reuse existing root lifecycles, package consumers, and generators; it MUST NOT add Change-specific scripts.

#### Scenario: Deterministic provider and bridge tests run
- **WHEN** fake DNS/transport controls normal responses, malicious destinations, limits, failures, and cancellation races
- **THEN** public-address policies, native cancellation, and isolation can be verified without accessing real services or claiming real-account translation verification
