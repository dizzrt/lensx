# Isolated Plugin Runtime Origin Specification

## Purpose

Define the Host-private browser-origin boundary that gives every current plugin
resource generation a distinct process-local origin, preserves module loading
without relaxed CORS, partitions browser state from the Host and other
generations, and proves those guarantees on the supported macOS WKWebView.
## Requirements
### Requirement: Every current resource generation MUST receive a distinct browser origin

The system MUST use an operating-system CSPRNG to generate at least 128 bits of
process-local, unguessable scope for every current `(entry_id,
resource_generation)` and MUST give its Runtime document a browser origin that
differs from the Host, every other plugin scope, and every old generation.
Repeated resolution of the same generation MUST reuse the same scope and
origin. The scope MUST NOT be persisted, returned separately, written to an
event or log, or added to a public contract. The origin authority and URL path
MUST contain the same scope and MUST be cross-validated exactly.

#### Scenario: Resolve the same current generation twice

- **WHEN** the trusted Host resolves the same entry twice while its registration
  and resource generation are unchanged
- **THEN** both results use the same opaque `entry_url`, scope, and browser
  origin
- **THEN** an unrelated plugin revision change does not revoke that current
  origin

#### Scenario: Resolve two different plugin identities

- **WHEN** two eligible plugins each resolve their current entry
- **THEN** they receive different browser origins even if their version, entry
  filename, or author content is identical
- **THEN** neither plugin can obtain the other's origin authority by guessing a
  plugin ID or path

#### Scenario: Replace the current resource generation

- **WHEN** disable and re-enable, replacement, reinstall, uninstall recovery, or
  process restart creates a new resource generation
- **THEN** the old scope, origin, and URL become invalid and the new generation
  receives a different origin
- **THEN** the old URL cannot return the new payload or become the current
  authority for the new Runtime

### Requirement: Isolated origin URLs MUST use one strict Host-owned grammar

A Runtime resource URL MUST use a fixed-version Host-owned envelope. The native
custom-protocol form MUST place an exact 32-character lowercase hexadecimal
scope in its own authority and repeat the same scope in the path. A supported
translated form MUST preserve that origin key as a distinct authority and MUST
NOT collapse it to the shared `lensx-plugin.localhost` host. The parser MUST
reject a shared host, an origin and path scope mismatch, unknown or extra
labels, Unicode or punycode, uppercase scope characters, userinfo, a port,
query, fragment, backslash, percent- or double-encoding ambiguity, and an
unknown scheme. The Manifest, plugin code, and frontend caller MUST NOT select
or construct the origin.

#### Scenario: Parse a canonical isolated URL

- **WHEN** a URL uses an approved native or translated scheme class, canonical
  isolated authority, matching path scope, Host-derived plugin key and version,
  and a valid package path
- **THEN** the Host parses one canonical resource tuple and continues current
  authorization
- **THEN** native and translated equivalents normalize to the same identity
  without losing the origin scope

#### Scenario: Reject a shared or mismatched authority

- **WHEN** a URL uses the old shared host, differs between authority scope and
  path scope, uses another generation's authority, or has an ambiguous encoded
  form
- **THEN** the Resource Contract, handler, and navigation normalizer all fail
  closed
- **THEN** the system does not repair, decode, rewrite, or fall back from the
  input to an allowed target

### Requirement: Isolated origin MUST enable the representative module graph without CORS relaxation

On the target macOS WKWebView, the isolated origin MUST load canonical package
HTML, CSS, images, classic scripts, the ES Module entry, and its module
dependencies under the downstream iframe's fixed
`sandbox="allow-scripts allow-same-origin"`. Resource responses MUST retain
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff` and MUST NOT add
wildcard `Access-Control-Allow-Origin`, authorize `Origin: null`, or treat the
request Origin as authorization. A classic-only or inline-only bundle, or a
test that removes the module case, MUST NOT satisfy completion.

#### Scenario: Load a same-origin module dependency graph

- **WHEN** a normal canonical `.lxp` document imports its entry module and at
  least one package-relative dependency from the current isolated origin
- **THEN** WKWebView executes the complete module graph and all resource
  requests remain bound to the same current origin, scope, and generation
- **THEN** validation does not depend on wildcard or null CORS, network
  fallback, or an inlined dependency

#### Scenario: Module graph fails on the target WebView

- **WHEN** the document remains opaque-origin or shared-origin, a module
  dependency is not requested or cannot execute, or success requires relaxed
  CORS
- **THEN** the capability cannot be declared complete and the production iframe
  remains blocked
- **THEN** the team must update the OpenSpec origin mechanism rather than
  weakening the public bundle contract

### Requirement: Same-origin browser state MUST remain partitioned from Host and other generations

The current plugin document MAY use ordinary browser storage for its own
isolated origin, but MUST NOT read or modify the DOM or storage of the Host,
another plugin, another scope, or an old generation. Even when the downstream
iframe uses `allow-same-origin`, the plugin MUST NOT access the `window.parent`
DOM, `frameElement`, or Host React state. Browser origin and the Host bootstrap
boundary MUST enforce isolation; it MUST NOT depend on an author adding a key
prefix, avoiding an API, or asserting an identity.

#### Scenario: Two plugins write the same storage key

- **WHEN** plugin A and plugin B write the same local- or session-storage key in
  their respective current origins
- **THEN** each plugin can read only its own value and cannot observe the Host
  value
- **THEN** storage isolation does not depend on an author namespace convention

#### Scenario: A replacement attempts to inherit old state

- **WHEN** a new resource generation starts with a new origin and queries state
  written by the old generation
- **THEN** the new generation cannot read or overwrite the old partition as its
  current authority
- **THEN** the old document and URL also cannot access resources from the new
  generation

#### Scenario: Plugin attempts parent access

- **WHEN** a plugin reads or modifies the `window.parent` document,
  `frameElement`, Host storage, or React-owned DOM
- **THEN** the browser same-origin boundary rejects the attempt before Host
  state changes
- **THEN** origin isolation does not rely on DOM cleanup or author cooperation

### Requirement: Trusted Tauri and Host-private boundaries MUST remain absent from the plugin origin

An isolated origin MUST NOT change the main-frame-only Tauri initialization
guarantee. The Host main frame MUST retain its existing Tauri bootstrap and
trusted invoke path. Every plugin descendant MUST lack `isTauri`,
`__TAURI_INTERNALS__`, metadata, the invoke key, and IPC bootstrap before the
earliest author script, and a representative invoke MUST NOT reach the Rust
handler. Origin and scope data, the URL parser, Resource adapter, navigation
lease, and harness internals MUST remain Host-private and MUST NOT enter the
Manifest, public packages, plugin messages, or bounded diagnostics.

#### Scenario: Normal and malicious descendants inspect Tauri

- **WHEN** a normal or malicious plugin document inspects Tauri surfaces and
  attempts a representative invoke at the earliest script stage in its
  isolated origin
- **THEN** every surface is absent or unavailable and the privileged
  handler-hit count remains zero
- **THEN** trusted invoke from the Host main frame continues to work

#### Scenario: Public boundary is inspected

- **WHEN** the workspace gate checks Contract, SDK, UI, Testkit, official
  plugins, examples, and external plugins
- **THEN** those consumers cannot import the origin issuer or parser, scope map,
  Resource adapter, navigation target, or WebView harness internals
- **THEN** this capability adds no public Runtime, Session, or Host API export

### Requirement: Every isolated origin MUST be bound to one actual current Child WebView
The Host MUST derive a distinct origin and data-store identity for every current resource generation before Child WebView creation. Resource and navigation access MUST additionally match the actual current WebView label/handle and Runtime attempt; the origin alone MUST NOT authorize a Host WebView, remote document, old WebView or another plugin. The public plugin surface MUST NOT reveal origin tokens or data-store identifiers.

#### Scenario: Current Child WebView loads its module graph
- **WHEN** the actual current Child WebView requests the exact entry and same-generation package resources
- **THEN** the isolated origin supports the representative module and Worker graph without CORS relaxation
- **THEN** Host DOM, Tauri authority and another generation remain unreachable

#### Scenario: An old WebView reuses a current origin URL
- **WHEN** a destroyed or replaced WebView requests a syntactically current resource URL
- **THEN** source binding rejects the request without revealing whether the scope exists

