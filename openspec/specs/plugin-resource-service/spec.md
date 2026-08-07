# Plugin Resource Service Specification

## Purpose

Define the secure Host-private service that resolves scoped plugin entry URLs
and serves bounded resources from the currently eligible installer-owned
payload, including strict contract validation, unguessable process-local
authorization, path and MIME enforcement, lifecycle revocation, and
fail-closed responses without exposing Host filesystem or plugin-management
facts.

## Requirements

### Requirement: The Host MUST resolve the current plugin entry URL through an independent private contract

The system MUST provide an independently versioned Host-private Plugin Resource
Contract and allow only the trusted lensX root application to query a plugin
entry URL through `resolve_plugin_resource_entry`. A request MUST contain
exactly `contract_version`, `entry_id`, and `expected_revision`; the caller MUST
NOT submit or receive an installation path, package digest, record key, file
handle, package bytes, origin, scope, generation, or Manager object. A
successful result MUST contain exactly the contract version, entry ID, current
revision, Host-resolved plugin ID and version, and one opaque isolated-origin
`entry_url`. Rust and TypeScript MUST strictly validate requests, successful
results, and errors from untrusted boundary values and MUST reject a shared
host, unknown URL shape, or an origin and path scope mismatch. The contract
MUST NOT become a capability that the Manifest, public plugin packages, iframe
Runtime, or other plugins can import or invoke.

#### Scenario: The trusted application resolves the current entry

- **WHEN** the trusted root application queries an eligible plugin using a
  valid contract version, current entry ID, and current Registration revision
- **THEN** the Host returns a scope-bound isolated-origin entry URL derived from
  the current registration's normalized `runtime.entry`
- **THEN** the result contains no standalone origin, scope, or generation,
  installation path, digest, record key, file content, or mutable Host object

#### Scenario: A request attempts to submit Host-private facts

- **WHEN** a request contains a path, plugin ID, version, digest, origin, scope,
  generation, unknown field, or an incorrect contract version or type
- **THEN** the complete request fails with the stable `invalid_request` code
- **THEN** the system issues no scope, reads no file, and changes neither the
  Manager, Registry, nor revision

#### Scenario: Public plugin code attempts to use the resource query boundary

- **WHEN** the workspace boundary gate checks the Manifest, official or
  external plugins, or `@lensx/plugin-contract`, `@lensx/plugin-sdk`,
  `@lensx/plugin-ui`, or `@lensx/plugin-testkit`
- **THEN** those consumers cannot import the Resource Contract, desktop
  adapter, Tauri command wrapper, origin validator, or Host-private
  implementation
- **THEN** entry URL queries remain available only at the trusted lensX
  application boundary

### Requirement: Scope issuance MUST derive from a current and provably safe registration

The Host MUST validate the expected revision and resolve, in one atomic Plugin
Manager read projection, a healthy registration, process-local resource
generation, enabled intent, both compatibility dimensions, normalized Manifest,
and strict payload variant. For an installed payload, the Host MUST prove that
the installation path is the sole currently active installer-owned payload at
`packages/<plugin-key>/<package-sha256>` and that its package digest matches
exactly. For a development payload, the Host MUST prove that the snapshot root
is the sole current generation atomically published by the Development
coordinator under the current process cache and session, that its snapshot
identity matches exactly, and that the Resource service never falls back to
the author's source directory.

The Host MUST issue a URL only when the Manager is not degraded, the
registration is healthy, enabled, and compatible, and ownership of the
corresponding payload can be proven. Host source, Publisher text, requested
permissions, and Runtime `inactive` MUST NOT by themselves grant or deny
resource access; the Host MUST fail closed when managed payload ownership
cannot be proven.

#### Scenario: A current managed registration can receive a scope

- **WHEN** the record or entry identity, plugin identity, payload-variant
  identity, and canonical installer-owned package or current Host-owned
  development snapshot match exactly for a healthy, enabled, lensX-compatible,
  and Host API-compatible registration
- **THEN** the Host issues or reuses a scoped entry URL for its current resource
  generation
- **THEN** the URL's plugin key, version, and entry all derive from that atomic
  read projection

#### Scenario: The caller uses a stale revision

- **WHEN** the request's expected revision differs from the current Registration
  revision
- **THEN** the query fails with the stable `stale_revision` code and returns
  neither the old nor the new URL
- **THEN** the caller must restart from the complete current Registration
  snapshot

#### Scenario: The registration is not currently executable

- **WHEN** the entry is missing, quarantined, disabled, incompatible in either
  dimension, or Manager recovery is degraded
- **THEN** the query fails with a stable `not_found` or `unavailable` outcome
- **THEN** the system does not issue a resource capability merely because a
  package or snapshot directory still exists

#### Scenario: The registration points to a payload whose safety cannot be proven

- **WHEN** an installed path is outside the canonical installer packages root,
  its plugin key or digest does not match, a development snapshot does not
  belong to the current process, session, or generation, or any root or entry
  is missing, linked, or otherwise unsafe
- **THEN** the query fails with the stable `unsafe_state` code and returns no
  path evidence
- **THEN** a builtin, external, or development source designation or Publisher
  declaration cannot override the failure

#### Scenario: Development source directory changes after snapshot publication

- **WHEN** the author modifies, deletes, or replaces the original `dist/` after
  successful registration or reload
- **THEN** the current scope remains bound only to the validated immutable
  Host-owned snapshot and does not read the changed source bytes
- **THEN** only a later successful explicit reload can publish a new generation;
  a failed reload preserves the current scope

### Requirement: Development snapshot retirement MUST revoke resource authority before cleanup

A successful development reload, remove, disable, or Development Mode shutdown
MUST revoke the old scope through the Manager currentness, revision, and
resource-generation transition before it MAY clean up the old snapshot.
Successful, failed, or delayed cleanup MUST NOT make the old snapshot current
again. The Resource cache MUST distinguish installed and development bytes by
entry identity, payload variant, and generation, and MUST NOT reuse a revoked
scope because the plugin ID, version, or snapshot identity is unchanged.

#### Scenario: Successful manual reload retires the old snapshot

- **WHEN** development reload atomically commits a new generation
- **THEN** the old scope and origin immediately stop serving old or new bytes
  and the new generation receives a different scope and origin
- **THEN** delayed deletion of the old snapshot does not extend its browser or
  Runtime authority

#### Scenario: Identical bytes are manually reloaded

- **WHEN** development reload publishes bytes with the same snapshot identity
  while forcing the resource generation to advance
- **THEN** the old scope and origin remain permanently revoked and the new
  generation uses a new scope and origin
- **THEN** digest equality cannot bypass the explicit reload's terminal
  lifecycle

### Requirement: Resource scopes MUST be unguessable, process-local, and bound to exactly one payload generation

The system MUST use an operating-system CSPRNG to generate at least 128 bits of
entropy for each scope and MUST NOT use time, process ID, an incrementing
sequence, a path, or an unkeyed plain hash as a bearer token. Each current
`(entry_id, resource_generation)` MUST map to at most one scope, and repeated
queries MUST reuse it. The scope MUST serve as both the isolated browser-origin
key and the path-authorization key, and the authority scope and path scope MUST
match exactly. A scope MUST reside only in process memory and MUST NOT be
persisted, sent in a changed event, written to logs, or returned as a standalone
field. For every protocol request, the system MUST re-confirm the scope, entry,
generation, plugin identity, version, digest, and payload root against the
current Manager projection. Readable fields in the URL and a browser
same-origin result MUST NOT replace authorization by the opaque scope.

#### Scenario: The same generation is resolved repeatedly

- **WHEN** the caller repeats a valid query while the registration and resource
  generation remain unchanged
- **THEN** the Host returns the same entry URL and isolated browser origin and
  does not create scopes without bound
- **THEN** a revision change for an unrelated plugin does not invalidate this
  scope

#### Scenario: The same version is reinstalled with different content

- **WHEN** the same plugin ID and semantic version are successfully replaced by
  a package with a different digest
- **THEN** the old resource generation, scope, and origin are permanently
  invalidated, and the new registration receives a different scope and origin
- **THEN** the old URL cannot return the new payload, stale cached content, or
  authority from the new generation

#### Scenario: A plugin is disabled and then re-enabled

- **WHEN** the same payload is enabled again after a successful disable
- **THEN** the pre-disable scope and origin are not restored, and the next
  successful resolution creates a new scope and origin
- **THEN** matching plugin ID, version, and digest cannot make the old bearer URL
  valid again

#### Scenario: The application process restarts

- **WHEN** the Manager recovers the same registration from the existing Store
- **THEN** all scopes and origins from the prior process are unavailable, and
  the recovered registration uses a new process-local generation
- **THEN** the Store record, Registration Contract, and package layout gain no
  persisted scope, origin, or generation field

### Requirement: Protocol requests MUST be restricted to a package-relative regular file bound to the scope

The Resource handler MUST accept only a fixed-version `lensx-plugin` URL
envelope whose authority contains the canonical isolated-origin scope and whose
path repeats the same scope byte-for-byte. The old shared host and any
translated form that does not preserve the origin key MUST fail closed. In
Rust, the handler MUST apply strict lexical validation of the package-relative
path, reject symlinks or reparse points at every component, enforce canonical
root containment, require a regular file, revalidate identity after opening,
and perform a bounded read. Paths MUST follow the package protocol's portable
ASCII segment constraints. Absolute paths, empty segments, `.` and `..`, `%`,
backslashes, NUL, queries, fragments, userinfo, ports, non-UTF-8 input, paths
that are too long or deep, directories, metadata records, targets in another
payload, and origin and path scope mismatches MUST fail closed. Successful reads
MUST stay within the existing 64 MiB single-file limit, and the handler MUST NOT
enumerate directories, rewrite HTML, add wildcard or null CORS, or implicitly
map a root-relative URL back into the scope.

#### Scenario: Read a valid relative resource from the current plugin

- **WHEN** a valid isolated authority with a matching path scope requests a
  regular file within its canonical payload that satisfies the path, type,
  size, and MIME rules
- **THEN** the handler returns the file's complete, internally consistent bytes
- **THEN** the request cannot observe the canonical root, adjacent plugin
  directories, the Host filesystem structure, or another browser origin

#### Scenario: A request attempts path traversal or encoding confusion

- **WHEN** the path contains a Unix or Windows absolute form, `..`, a dot
  segment, a double slash, a backslash, percent or double encoding, NUL, a query,
  or a structure beyond the package path limits
- **THEN** the handler rejects the complete request before opening a file
- **THEN** single or repeated decoding, separator replacement, and normalization
  do not transform the request into a readable path

#### Scenario: A request traverses a symlink or reparse escape

- **WHEN** the target or any intermediate component is a symlink or reparse
  point, or the canonical target is no longer within the scope root
- **THEN** the handler does not follow the escape and returns no target bytes
- **THEN** files outside the payload and resources from other plugins remain
  unreadable

#### Scenario: The path changes between validation and reading

- **WHEN** the target or a component is replaced, grows, is truncated, or
  changes identity between lexical or canonical validation, open, metadata
  revalidation, or bounded reading
- **THEN** the handler discards the entire body and returns a safe failure, or
  returns one internally consistent version from the safely opened file
- **THEN** the response cannot combine two files or return bytes that did not
  pass final identity and size validation

#### Scenario: A request targets metadata or a directory

- **WHEN** a scope requests `manifest.json`, `checksums.json`, a payload
  directory, or a nonexistent resource
- **THEN** the handler returns the same failure presentation as for an ordinary
  unavailable resource
- **THEN** metadata, directory listings, and existence details are not exposed

#### Scenario: Origin authority and path scope do not match

- **WHEN** a request uses the current origin authority with another scope in
  the path, or uses an old or shared authority for the current path
- **THEN** the handler fails closed before consulting the scope map or reading
  the filesystem
- **THEN** the fixed external response does not reveal which scope, origin,
  plugin, or path exists

### Requirement: Methods, MIME types, and response headers MUST be fixed and content sniffing MUST be prohibited

Protocol v0 MUST support only `GET` and `HEAD`, and MUST NOT support Range,
conditional requests, content negotiation, directory indexes, or arbitrary
downloads. Based only on a fixed ASCII case-insensitive table keyed by the final
extension, the Host MUST return exact MIME types for HTML, JavaScript or ES
modules, CSS, JSON, Wasm, PNG, JPEG, GIF, WebP, AVIF, SVG, ICO, and WOFF2. An
unknown extension MUST NOT fall back to `application/octet-stream`. A successful
response MUST contain accurate `Content-Type` and `Content-Length`,
`X-Content-Type-Options: nosniff`, and `Cache-Control: no-store`, and MUST NOT
add wildcard CORS. Every successful current scoped HTML response MUST also
contain the exact Host-owned Plugin Runtime Content Security Policy; GET and
HEAD MUST return identical security headers. Non-HTML resources, failures,
stale scopes, author metadata, request headers, query input, source and
publisher facts MUST NOT select, omit or relax that policy. The handler MUST
serve the validated bytes unchanged and MUST NOT rewrite HTML to inject CSP.

#### Scenario: GET returns a known resource type

- **WHEN** a GET request targets a valid resource with an allowed extension
- **THEN** the response uses the fixed MIME type, accurate length, `nosniff`,
  `no-store`, and the complete body
- **THEN** the Host does not inspect the content to guess another MIME type

#### Scenario: GET returns a current scoped HTML document

- **WHEN** a GET request targets a valid HTML resource for the current scope
- **THEN** the response includes the exact Host-owned Plugin Runtime CSP in
  addition to the fixed MIME, length, `nosniff`, and `no-store` headers
- **THEN** the returned body remains the validated package bytes and no author
  meta policy, request input, source, publisher, or grant widens the Header

#### Scenario: HEAD requests a valid resource

- **WHEN** a HEAD request targets the same URL as a successful GET
- **THEN** the status, `Content-Type`, `Content-Length`, and security headers are
  identical, including the Plugin Runtime CSP for HTML, and the body is empty
- **THEN** the handler still performs the same scope, path, lifecycle, and MIME
  validation

#### Scenario: A request targets an unknown extension

- **WHEN** the final extension of a valid payload path is not in the fixed
  allowlist
- **THEN** the handler rejects it as an ordinary unavailable resource and
  returns no bytes
- **THEN** the response does not use `application/octet-stream` or browser MIME
  sniffing

#### Scenario: A request uses an unsupported method or Range

- **WHEN** a request uses POST, PUT, DELETE, Range, or a conditional header
- **THEN** methods other than GET and HEAD receive `405` with the fixed
  `Allow: GET, HEAD` header, and unsupported read variants fail safely
- **THEN** the handler writes no file, returns no partial content, and changes no
  Host state

#### Scenario: A stale or failed request attempts to obtain policy-dependent content

- **WHEN** an old generation, mismatched scope, unsafe path, unavailable entry,
  unsupported method, or other failed request targets HTML
- **THEN** the existing fixed failure response returns no plugin body and cannot
  be transformed into a usable relaxed Runtime document
- **THEN** response differences reveal no current scope, policy exception,
  plugin identity, path or existence detail

### Requirement: Lifecycle commits MUST invalidate old scopes precisely for the affected plugin

The resource generation MUST change on a successful state transition that
affects the target plugin's resource eligibility and MUST preserve scopes for
unrelated plugins. Disable, replacement, uninstall, quarantine or incompatible
recovery, and new requests after process termination MUST cause the old scope
to fail; re-enable and reinstall MUST use a new scope. A failed or cancelled
lifecycle or replacement transition MUST preserve the original registration,
generation, and scope. Once logical uninstall commits, whether physical payload
cleanup completes MUST NOT affect the revocation decision.

#### Scenario: Disable or uninstall succeeds

- **WHEN** disable or logical uninstall of the target plugin has successfully
  committed
- **THEN** every new request rejects the old scope even if the payload directory
  still exists or cleanup is pending
- **THEN** the Resource Service does not wait for a frontend cache, physical
  deletion, or application restart before revoking the capability

#### Scenario: Replacement succeeds

- **WHEN** the candidate payload and Manager record have durably committed
- **THEN** the old scope is invalid immediately, and the new scope points only
  to the candidate's canonical payload
- **THEN** pending cleanup of the sibling old payload cannot cause the old scope
  to return any bytes

#### Scenario: Lifecycle or replacement fails

- **WHEN** disable or uninstall persistence or the replacement commit fails and
  the original registration remains valid
- **THEN** the original resource generation and scope remain valid
- **THEN** the Resource Service neither incorrectly revokes the original scope
  nor issues a candidate scope based on uncommitted intent

#### Scenario: Another plugin changes

- **WHEN** the global Registration revision increases because a different
  plugin's installation, diagnostics, or lifecycle changes
- **THEN** the unchanged current plugin's resource generation and scope remain
  valid
- **THEN** the global revision is not the sole authorization condition for a
  protocol request

### Requirement: Caching and errors MUST fail closed and MUST NOT create a Host information oracle

All successful and error responses in v0 MUST use `Cache-Control: no-store`.
The protocol MUST present unknown or expired scopes, identity or generation
mismatches, out-of-bounds or nonexistent paths, metadata, unknown MIME types,
disabled, incompatible, quarantined, or uninstalled registrations, and unsafe
payloads as the same fixed external `404` response. Methods other than GET and
HEAD MUST use a fixed `405`; only the inability to obtain managed state or an
unclassifiable internal failure may use a fixed `500`. Responses and logs MUST
NOT contain a scope, entry or plugin identity, version, digest, record key,
absolute path, raw I/O error, stack, file content, or existence distinction. A
Host-private command MAY return a stable typed code, but its message MUST be
canonical safe text.

#### Scenario: Two different rejection reasons are probed

- **WHEN** a caller separately requests a nonexistent file, another plugin's
  path, an unknown MIME type, and an expired scope
- **THEN** the protocol returns the same fixed `404` class response and safe
  headers
- **THEN** the status, body, and headers do not reveal which scope, plugin, or
  disk file actually exists

#### Scenario: Reading a Rust file fails

- **WHEN** permission, metadata, open, read, size, or identity revalidation
  fails
- **THEN** the handler returns a fixed safe error and discards any partial body
- **THEN** the response, serialized command error, and logs contain no raw
  system error or Host path

#### Scenario: A WebView attempts to rely on cache for continued access

- **WHEN** an old URL is reused after its resource generation has been revoked
- **THEN** the prior response's `no-store` policy requires a new handler request,
  which fails
- **THEN** reinstalling the same version, disabling and re-enabling, or
  uninstalling cannot allow continued reads through an old cache

### Requirement: Task 4.1 MUST leave subsequent Runtime and UI capabilities unimplemented

This capability MUST deliver only the Host-private Resource Contract, desktop
adapter, Manager resource generation and projection, scoped protocol service,
path, MIME, and lifecycle enforcement, tests, and maintained documentation. It
MUST NOT create an iframe, execute plugin code, change the Plugin Page
placeholder, display a package-local icon, inline SVG, establish a Runtime
Session, transport, RPC, or Host API, grant permissions, or claim a complete
CSP. Because this change adds no UI, its completion MUST NOT alter the existing
English-default or Simplified Chinese locales, keyboard and accessibility
behavior, Semi Design theme, or light and dark presentation.

#### Scenario: Task 4.1 is completed independently

- **WHEN** the focused Resource Service gate and complete validation pass while
  Tasks 4.2 through 4.4 remain unimplemented
- **THEN** the Host can securely resolve and respond to scoped plugin resource
  URLs, while the current Plugin Page still displays only the localized
  Host-owned placeholder
- **THEN** the user interface, locale, theme, focus, and keyboard behavior remain
  unchanged, and plugin HTML and JavaScript do not execute

#### Scenario: A later iframe consumes the entry URL

- **WHEN** Task 4.2 uses the current scoped entry URL as iframe input
- **THEN** Task 4.1 guarantees only restricted reading from one current payload
  through the URL
- **THEN** iframe sandboxing, origin and navigation, Tauri bridge isolation,
  page error state, and session identity remain for a subsequent capability to
  define explicitly
