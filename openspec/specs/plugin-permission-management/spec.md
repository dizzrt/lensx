# Plugin Permission Management Specification

## Purpose

Define the Host-private permission catalog, persistent grant authority,
per-call authorization, Runtime invalidation, and narrow native clipboard
boundary for permission-backed plugin Host API calls.

## Requirements

### Requirement: Host permission catalog MUST be closed, risk-classified, and Contract-aligned

The system MUST provide a Host-private, copied, and frozen permission catalog.
The first catalog MUST contain only `clipboard.read` and `clipboard.write` as
declared by the public Host API `0.1.0`. Every item MUST contain a stable
permission ID, a `standard | sensitive` risk class, an exact method set, and
current-platform support state. Both first permissions MUST be classified as
`sensitive`, but the risk class MUST serve only as display and policy metadata
for a future trusted Host interaction and MUST NOT create a grant by itself.

The method-to-permission mapping MUST be derived from the public
`@lensx/plugin-contract` Host API catalog and checked by a drift gate. Official
provenance, Publisher text, a Manifest reason, builtin status, naming
conventions, or unknown strings MUST NOT add catalog entries, change risk
classes, or gain hidden methods.

#### Scenario: Host enumerates the first permission catalog

- **WHEN** a trusted Host consumer reads the current permission catalog
- **THEN** it receives only `clipboard.read` and `clipboard.write`, sorted
  stably by permission ID
- **THEN** both items are `sensitive`, and each maps only to the Host API method
  with the same ID

#### Scenario: Contract and Host catalog drift

- **WHEN** a public Host API catalog permission requirement no longer matches
  the Host-private catalog exactly
- **THEN** the permission drift gate fails
- **THEN** no method or permission enters the production authorization path
  without an independent OpenSpec change

#### Scenario: Official plugin requests an unknown permission

- **WHEN** an official or external plugin Manifest requests `files.read`,
  `network.request`, or another permission outside the current catalog
- **THEN** the Host classifies that request as unsupported
- **THEN** provenance, Publisher identity, or naming similarity does not create
  a grant or capability

### Requirement: Effective permission state MUST keep requests, support, grants, and Sessions separate

The system MUST derive permission conclusions in layers from the current
normalized Manifest request, Host catalog and support state, persisted grant
snapshot, and current Session identity. The Host-private permission view MUST
distinguish `not_requested`, `unsupported`, `not_granted`, and `granted`. Only
`granted` means that the permission was requested, is currently supported, and
has a persisted grant. An absent grant, a denial, or a future UI decision to
defer MUST all be `not_granted` in this capability and MUST NOT invent
additional authorization history.

A Manifest's localized reason MUST remain an author-controlled display fact.
`en-US`, `zh-CN`, provenance, version, and reason content MUST NOT affect the
effective state. A Session capability snapshot MUST only discover currently
callable methods and MUST NOT replace a persisted grant or per-call
authorization.

#### Scenario: Manifest requests a supported permission without a grant

- **WHEN** a Manifest requests `clipboard.read`, the current Host supports the
  permission, and the grant snapshot is empty
- **THEN** the permission view returns `not_granted`
- **THEN** the Manifest request and localized reason do not enter Session
  capabilities automatically

#### Scenario: Persisted grant is no longer declared or supported

- **WHEN** a record retains a grant ID that the current Manifest does not
  request or the current Host does not support
- **THEN** the effective permission is not `granted`
- **THEN** the stale fact cannot authorize a method, native effect, or new
  Session

#### Scenario: Current supported grant becomes a Session capability

- **WHEN** the Manifest requests the permission, the Host and native provider
  currently support it, a persisted grant exists, and a new Session identity is
  bound to the same current Registration revision
- **THEN** the corresponding clipboard method may enter that Session's
  capability snapshot
- **THEN** Context does not expose raw grants, Manifest reasons, provenance, or
  Registration identity

### Requirement: Grant mutations MUST be trusted, revision-bound, and fail closed

The system MUST provide a versioned, strictly parsed, Host-private boundary for
granting or revoking one permission. Every mutation MUST bind to an exact
`entry_id` and `expected_revision`. Granting MUST accept only a permission that
the healthy Registration's current Manifest requests and the current Host
supports. Revocation MUST be able to remove a current grant even if that
permission later becomes undeclared or unsupported. A plugin iframe, Manifest,
SDK request, or provenance MUST NOT invoke or influence this authority boundary
directly.

A successful change MUST atomically persist the complete normalized grant
snapshot, advance the Registration revision, and publish the existing
invalidation event. An identical target state MUST return `unchanged` without
advancing the revision. Errors MUST use stable safe codes and messages and MUST
NOT expose the grant set, Manifest reason, path, payload, original exception, or
Host or Rust object.

#### Scenario: Trusted Host grants a requested permission

- **WHEN** a trusted Host caller uses the current entry and revision to grant
  `clipboard.read`, which the Manifest requests and the Host supports
- **THEN** the Manager atomically persists a sorted and deduplicated grant
  snapshot containing that ID and returns a new revision
- **THEN** the mutation publishes Registration invalidation but does not hot
  authorize the old Session directly

#### Scenario: Trusted Host revokes a permission

- **WHEN** a trusted Host caller uses the current entry and revision to revoke a
  persisted permission
- **THEN** the Manager atomically removes that grant, advances the revision, and
  publishes invalidation
- **THEN** no call made after revocation returns can continue to rely on the old
  grant

#### Scenario: Caller grants an undeclared or unsupported permission

- **WHEN** a caller attempts to grant a permission that the Manifest did not
  request, the Host does not support, or the catalog does not declare
- **THEN** the mutation fails with a stable error
- **THEN** memory, disk, revision, events, and every other grant remain
  unchanged

#### Scenario: Mutation is stale or persistence fails

- **WHEN** `expected_revision` is stale, or temporary-file creation, writing,
  flushing, or atomic replacement fails
- **THEN** the mutation fails with a stable conflict or persistence error
- **THEN** the last successful in-memory and on-disk grant snapshot remains
  consistent, and no new revision is published

#### Scenario: Mutation repeats the current state

- **WHEN** a caller grants an already granted permission or revokes a permission
  that is currently absent
- **THEN** the boundary returns `unchanged`
- **THEN** it does not rewrite the record, advance the revision, or restart the
  Session

### Requirement: Every permission-backed call MUST reauthorize against current Host facts

Every `clipboard.read` or `clipboard.write` call MUST revalidate the Contract
method requirement, current Registration revision and identity, Manifest
request, Host support, actual persisted grant, provider availability, and
Session currentness before its native effect. A plugin-provided identity, grant,
provenance, capability, or permission field MUST be rejected or ignored. A
frozen Session grant snapshot and previous Context MUST NOT become a persistent
credential.

A grant mutation and clipboard native effect MUST share one Host-owned
linearization boundary. If an effect acquires that boundary first, a later
revocation occurs after the effect in the linearized order. Once revocation
returns, later effects MUST observe the new state. The Dispatcher MUST continue
to check cancellation and currentness before and after asynchronous boundaries,
and MUST discard a late result from an old Port.

#### Scenario: Authorized current Session calls clipboard

- **WHEN** a current Session invokes a clipboard method consistent with its
  Manifest request, Host support, and persisted grant
- **THEN** Rust reconfirms the current Registration and grant before the native
  effect
- **THEN** exactly one corresponding plain-text operation executes

#### Scenario: Context is stale after revoke

- **WHEN** a plugin discovers a clipboard capability, the grant is then revoked,
  and the plugin invokes the method using old Context or an old Session
- **THEN** the call fails before a native effect with `permission_denied`,
  `unavailable`, or terminal disconnection
- **THEN** the Host does not read, write, or return clipboard text

#### Scenario: Official source attempts to bypass authorization

- **WHEN** an official, builtin, or Publisher-claimed plugin lacks a Manifest
  request or actual grant
- **THEN** it receives the same `permission_denied` conclusion as an external
  plugin
- **THEN** provenance does not bypass catalog, Registration, grant, or Session
  checks

#### Scenario: Revoke races with a clipboard effect

- **WHEN** a clipboard effect and revocation reach the Host coordinator
  concurrently
- **THEN** they form one observable linear order
- **THEN** after revocation returns, no newly started native effect uses the old
  grant

### Requirement: Clipboard provider MUST expose only bounded plain text through a narrow native boundary

The production macOS Host MUST implement plain-text read and write for the
system general pasteboard through a narrow Rust and AppKit provider. It MUST NOT
register a general-purpose clipboard plugin, enable the iframe browser Clipboard
API, or expose a native object. Reads MUST return only a Contract-valid bounded
string; an empty or non-text clipboard MUST return an empty string. Writes MUST
accept a Contract-valid bounded string, and an empty string MUST be able to
replace or clear the plain text. `clipboard.read` and `clipboard.write` MUST use
independent permissions, and either grant MUST NOT imply the other.

A native failure, oversized content, or unsupported platform MUST fail closed
and map respectively to stable `internal_error`, `limit_exceeded`, or
`unavailable`. Clipboard text, format lists, files, images, paths, raw native
errors, and stacks MUST NOT enter diagnostics or logs. A non-macOS Host MUST NOT
publish a clipboard capability and MUST return stable `unavailable`.

#### Scenario: Authorized plugin reads empty or text clipboard

- **WHEN** an authorized current Session invokes `clipboard.read` on macOS and
  the system clipboard is empty, non-text, or contains bounded plain text
- **THEN** the Host returns an empty string or the complete Contract-valid text,
  respectively
- **THEN** the result contains no native type, format list, file, or image

#### Scenario: Write grant does not authorize read

- **WHEN** a Session with only a valid `clipboard.write` grant invokes
  `clipboard.read`
- **THEN** the Host returns `permission_denied`
- **THEN** the native provider does not read the clipboard

#### Scenario: Native clipboard text exceeds the public bound

- **WHEN** the system clipboard's plain text exceeds the Host API Contract's
  `BoundedText` limit
- **THEN** the read returns stable `limit_exceeded`
- **THEN** the Host does not truncate, return partial text, or log the original
  content

#### Scenario: Clipboard is unavailable on the platform

- **WHEN** the Host runs on a platform without the delivered native provider
- **THEN** Context contains neither clipboard capability
- **THEN** a defensive call returns stable `unavailable`, with no browser or
  native fallback

### Requirement: Grant changes MUST invalidate only affected Runtime authority

A successful grant or revocation MUST use the existing Registration revision
and invalidation flow to invalidate the affected plugin's old Runtime
descriptor, Session, Port, Dispatcher binding, and pending calls. A grant MUST
NOT be hot-injected into an old identity through `runtime.context_changed`.
Only a new Session created from new Registration detail may receive the new
capability. Even if a revocation event is delayed or cannot be sent, the Rust
current-revision check on every call MUST still block old authority.

A Registration change unrelated to the target plugin MUST NOT cause the
permission coordinator to revoke another plugin's current Session, grant, or
clipboard operation.

#### Scenario: Grant changes while plugin Page is active

- **WHEN** a grant or revocation commits successfully while the current plugin
  Page is active
- **THEN** the old Session does not receive hot-updated authority and converges
  to termination through the existing lifecycle
- **THEN** a new Session computes capabilities only from the new revision and
  actual grant snapshot

#### Scenario: Registration event delivery fails

- **WHEN** a grant mutation is persisted and advances the revision, but the
  invalidation event cannot be sent or listener recovery is incomplete
- **THEN** the mutation still reports the actual committed revision
- **THEN** the old Session's next permission-backed call fails closed through
  the Rust currentness check, and a later complete refresh may converge the
  lifecycle

#### Scenario: Another plugin changes

- **WHEN** another plugin is installed, disabled, replaced, or has its grants
  changed while the current plugin's identity, revision, and grant snapshot stay
  unchanged
- **THEN** the permission service does not incorrectly authorize or revoke the
  current plugin or execute a native effect for it
- **THEN** compare-current logic leaves its Session lifecycle unchanged

### Requirement: Task 5.5 MUST not deliver permission UI or broader privileged APIs

This capability MUST deliver only the Host-private catalog, grant and revoke
authority, per-call authorization, Session invalidation integration, narrow
plain-text clipboard provider, tests, and bilingual maintained documentation.
It MUST NOT deliver installation or upgrade prompts, a settings page, user
decision history, management UI, file, network, Shell, process, or external-link
permissions, a general Tauri executor, Task 5.6 RPC resource limits, templates,
CLI, signing, or Marketplace functionality.

This change adds no product UI, so it MUST NOT add untranslated user-visible
copy and introduces no new keyboard, focus, theme, or accessibility surface.
Future Task 6.2 MUST control grants through this capability's trusted Host
boundary and MUST NOT duplicate Manager logic or make UI state into Runtime
authority.

#### Scenario: Permission core is complete before permission prompts

- **WHEN** Task 5.5 focused and complete validation passes while Task 6.2 is not
  yet delivered
- **THEN** the Host can safely persist and enforce grants, and tests or a
  trusted Host can drive the state transition
- **THEN** ordinary users still have no new permission prompt or settings UI,
  and a plugin cannot grant itself permission

#### Scenario: Caller requests a broader native capability

- **WHEN** a plugin or Host caller attempts to access files, the network, Shell,
  processes, external links, image clipboard data, or an arbitrary Tauri command
  through the permission service
- **THEN** the current catalog and Contract reject the request
- **THEN** no fallback, naming convention, or official-provenance bypass is
  invoked
