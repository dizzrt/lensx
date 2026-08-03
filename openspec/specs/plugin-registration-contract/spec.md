## Purpose

Define the Host-owned Plugin Registration Contract shared by the Rust Host,
Tauri query and event boundaries, and the trusted lensX application frontend.
The contract exposes recoverable, minimally disclosed registration snapshots
and details without turning Host facts into plugin-author input or claiming
downstream installation, execution, lifecycle, permission, or UI capabilities.

## Requirements

### Requirement: Registration Contract MUST remain a Host-owned application boundary

The system MUST keep the Plugin Registration Contract as a private boundary
between the Rust Host, Tauri commands and events, and the lensX root application
TypeScript. It MUST NOT become author Manifest input, a plugin iframe API,
`@lensx/plugin-contract`, `@lensx/plugin-sdk`, or any other public entry that a
plugin can import. Every registered plugin payload MUST be composed by the Host
from a validated normalized Manifest and Host-owned facts. The payload MUST NOT
accept author-supplied source, enabled, compatibility, quarantine, Runtime,
granted permission, lifecycle, signature, or provenance facts.

#### Scenario: Host composes a healthy registration detail

- **WHEN** the Plugin Manager contains a normalized Manifest and corresponding Host registration facts
- **THEN** the Registration Contract returns a registered plugin read model composed by the Host
- **THEN** the normalized Manifest remains separate nested author data and Host facts are not written back into or presented as Manifest fields

#### Scenario: Publisher claims to represent an official organization

- **WHEN** normalized Manifest publisher text claims that the plugin was published by lensX or another trusted organization
- **THEN** the read model continues to treat that text as an unverified author claim
- **THEN** publisher does not change Host source, enabled intent, permission grants, compatibility, or any trust conclusion

#### Scenario: Workspace plugin attempts to import the Registration Contract

- **WHEN** official or example plugin source attempts to import Host-private registration types, the Tauri adapter, or the event entry point
- **THEN** the workspace boundary gate rejects the dependency
- **THEN** public plugin package exports and real tarballs do not contain the Registration Contract

### Requirement: Registration wire payloads MUST use an independent explicit version

Every registration snapshot, detail response, and changed-event payload MUST
carry Registration Contract version `0.1.0`. This version MUST be independent
of the Manifest protocol, Host API, lensX application version, and Plugin
Manager Store format. Rust and TypeScript boundaries MUST reject a missing or
unsupported Registration Contract version and MUST NOT silently interpret the
payload as another version.

#### Scenario: Both boundaries read a current-version payload

- **WHEN** the Rust serializer and TypeScript parser read a valid shared fixture with Registration Contract version `0.1.0`
- **THEN** both boundaries accept the payload and produce the same observable fields and values

#### Scenario: Frontend receives an unknown version

- **WHEN** a Tauri command or event returns an unknown, missing, or incorrectly typed Registration Contract version
- **THEN** the TypeScript adapter rejects the payload and maps it to a stable boundary error
- **THEN** the adapter does not publish a partially parsed snapshot, detail, or revision

### Requirement: Host MUST expose deterministic complete registration snapshots

The Host MUST provide a read-only `read_plugin_registration_snapshot` Tauri
command. A successful response MUST include the Registration Contract version,
the current process-local revision, a Manager availability and recovery
summary, and summaries of every current healthy registration and quarantine
stub. Entries MUST be sorted deterministically by a Host-generated opaque entry
identity. Healthy and quarantine summaries MUST be strict discriminated
variants. An empty Manager MUST return a valid empty snapshot rather than an
error or placeholder plugin.

A healthy summary MUST include at least the opaque entry identity, plugin ID,
plugin version, normalized localized display data, Host-controlled
`builtin | external` source, enabled intent, per-dimension compatibility, and
the current `inactive` Runtime status. A quarantine summary MUST include at
least the opaque entry identity, an optional plugin ID, and a safe quarantine
diagnostic, and MUST NOT guess missing Manifest display data.

#### Scenario: Read an empty Plugin Manager

- **WHEN** the Plugin Manager has no healthy records or quarantine stubs
- **THEN** the snapshot returns empty entries, the current contract version, a valid revision, and truthful Manager availability
- **THEN** the Host does not create an example, placeholder, or default plugin

#### Scenario: Healthy and quarantine records coexist

- **WHEN** the Manager snapshot contains one healthy registration and one quarantine stub for a damaged record
- **THEN** the command returns two distinct variants in the same snapshot
- **THEN** entries are sorted deterministically by opaque entry identity and healthy and quarantine fields are not mixed

#### Scenario: Store recovery is degraded

- **WHEN** the Plugin Manager starts with a degraded recovery report because the Store directory is unreadable as a whole
- **THEN** the snapshot explicitly returns degraded availability and a safe Manager recovery diagnostic
- **THEN** the degraded empty collection is not reported as an ordinary healthy empty collection and does not expose an underlying path or error object

### Requirement: Host MUST expose safe revision-bound registration details

The Host MUST provide a read-only `read_plugin_registration_detail` Tauri
command whose input accepts only a valid opaque entry identity. A successful
response MUST carry the current revision used to produce the detail and return
either a healthy registered detail or a quarantine detail as a strict variant.

A healthy detail MUST include the complete normalized Manifest and safe Host
facts: source, enabled intent, per-dimension compatibility, sorted and unique
granted permission IDs, current `inactive` Runtime status, and bounded safe
diagnostics. A quarantine detail MUST contain only the opaque entry identity,
an optional plugin ID, and the current safe quarantine diagnostic. No detail
MUST contain an absolute installation path, package digest, Store filename,
raw damaged record, plugin file content, raw error, stack, function,
React or Tauri object, or Host executor.

#### Scenario: Read a healthy registration detail

- **WHEN** the caller queries with the opaque entry identity of a healthy snapshot entry
- **THEN** the Host returns that registration's normalized Manifest, separate Host facts, and the current revision
- **THEN** requested permissions remain part of the Manifest and granted permission IDs remain Host facts, without automatic conversion between them

#### Scenario: Read a quarantine detail

- **WHEN** the caller queries with the opaque entry identity of a quarantine summary
- **THEN** the Host returns the quarantine variant and a safe quarantine diagnostic
- **THEN** the Host does not parse, return, or guess Manifest, enabled, permission, or Runtime data from the damaged record

#### Scenario: Entry disappears after the snapshot

- **WHEN** the queried opaque entry identity is no longer present in the current Manager snapshot
- **THEN** the command returns a stable `not_found` error
- **THEN** the command does not return stale cache data or another plugin's detail

#### Scenario: Enforce the sensitive-field boundary

- **WHEN** Rust and TypeScript apply shared fixtures and unknown-field checks to a detail payload
- **THEN** a payload containing an installation path, package digest, Store key, raw exception, or private object field is rejected
- **THEN** safe normalized Manifest content is not mistaken for a Host trust fact

### Requirement: Query errors MUST be stable, safe, and operation-specific

A failed registration query command MUST map to a serializable
`{ code, operation, message }` payload. `code` MUST be limited to the stable set
`invalid_request`, `not_found`, `unavailable`, and `internal`. `operation` MUST
distinguish `read_snapshot` from `read_detail`. `message` MUST be a safe, stable
English message that does not depend on underlying error text. Errors MUST NOT
contain paths, raw exceptions, stacks, plugin content, or unpredictable system
text.

#### Scenario: Detail request contains an invalid identity

- **WHEN** `read_plugin_registration_detail` receives an empty value, unknown field, incorrectly typed value, or an argument that violates identity constraints
- **THEN** the command returns `invalid_request` and `read_detail`
- **THEN** Plugin Manager state and revision remain unchanged

#### Scenario: Underlying query produces a private error

- **WHEN** the Host query boundary encounters an internal failure containing a raw path, exception, or stack
- **THEN** the caller receives only a stable `internal` or `unavailable` error payload
- **THEN** private error content does not enter a serialized result, event, log fixture, or frontend state

### Requirement: Runtime, lifecycle, signature, and permission decision facts MUST remain narrowly scoped

Registration Contract v0 MUST express only the currently available transient
Runtime status `inactive`, and MUST start from `inactive` after application
recovery. It MUST NOT claim that an active session, session identity, iframe,
RPC, or Runtime transition is implemented. It MUST NOT add a lifecycle enum,
disableable or uninstallable policy, user enable, disable, or uninstall
operation, signature status, trusted provenance, or permission decision. Host
source, enabled intent, compatibility, quarantine, requested permissions, and
the granted permission ID snapshot MUST remain independent facts.

#### Scenario: Recover a record that was active in an earlier process

- **WHEN** the application starts and recovers a persisted registration record
- **THEN** the registration summary and detail both report Runtime status `inactive`
- **THEN** the payload does not recover or guess the earlier process's session identity, pages, or call state

#### Scenario: External plugin is marked enabled

- **WHEN** an external registration has enabled intent and its Manifest requests permissions
- **THEN** the payload separately represents external source, enabled intent, requested permissions, and the actual grant snapshot
- **THEN** no external, enabled, or requested fact produces a signature, trusted, authorized, disableable, or uninstallable conclusion

### Requirement: Successful Manager transitions MUST publish revisions and invalidation events after commit

The Plugin Manager MUST maintain a monotonically increasing revision for the
current process and MUST serialize it as an opaque decimal string. Only after a
state transition is successfully persisted and the new in-memory snapshot is
published MUST the Host update the revision and emit
`plugin-registration://snapshot-changed`. The event payload MUST contain only
the current Registration Contract version and new revision, and MUST NOT
contain an entry patch, Manifest, detail, or sensitive field. A failed,
rejected, or no-op transition MUST NOT update the revision or emit an event.

#### Scenario: Registration state transition succeeds

- **WHEN** an internal Host call successfully persists and publishes new Plugin Manager state
- **THEN** a subsequent snapshot and detail read return the new revision
- **THEN** after the new state becomes queryable, the Host emits one changed event containing only contract version and revision

#### Scenario: Persistence fails

- **WHEN** a Plugin Manager state transition fails during write, flush, or atomic replacement
- **THEN** the previous in-memory snapshot and revision remain unchanged
- **THEN** the Host emits no snapshot-changed event and the frontend cannot observe unpersisted next state

#### Scenario: Application restarts

- **WHEN** a new application process recovers the Plugin Manager and re-establishes the Registration Contract
- **THEN** revision may restart from that process's initial value
- **THEN** every consumer reads a new snapshot instead of comparing an old-process revision as a persistent sequence number

### Requirement: Frontend adapter MUST recover from event races and loss through snapshots

The TypeScript desktop adapter MUST validate every `invoke` response and Tauri
event payload from `unknown` and MUST construct readonly Registration Contract
values before publishing them to trusted application consumers. Initialization
MUST establish the changed-event listener before reading the snapshot. If an
event with a different revision is observed while the first read is in flight,
the adapter MUST continue serial refreshes until the published snapshot matches
the most recently observed revision. Concurrent events MUST be coalesced. The
adapter MUST read a complete snapshot when rebuilt, after listener recovery,
or when the Launcher is activated. Every valid changed event MUST invalidate
both the cached snapshot and cached details.

#### Scenario: State changes during the first read

- **WHEN** the adapter has subscribed to changed events, the first snapshot query is still in flight, and the Host publishes a new revision
- **THEN** the adapter does not publish the old snapshot as the final current state
- **THEN** the adapter reads again until the snapshot revision matches the latest event revision

#### Scenario: Multiple notifications arrive quickly

- **WHEN** the adapter receives multiple changed events during one snapshot query
- **THEN** it coalesces notifications and performs the required refreshes serially without publishing overlapping snapshots
- **THEN** the final published value corresponds to the latest observable revision

#### Scenario: Reactivation recovers after event loss

- **WHEN** the frontend misses a changed event and the adapter is later rebuilt, its listener recovers, or the Launcher activates
- **THEN** the adapter reads a complete snapshot and replaces the old snapshot and detail cache
- **THEN** recovery does not depend on event replay, incremental patches, a history log, or cross-process revision

#### Scenario: Event payload is invalid

- **WHEN** the adapter receives an event payload with an unknown field, invalid variant, unsupported version, or invalid revision
- **THEN** it reports a stable boundary error and does not publish a partial value
- **THEN** it recovers through a complete snapshot query instead of applying invalid event content

### Requirement: Rust and TypeScript MUST share a complete Registration Contract drift gate

The project MUST maintain one set of positive and negative Registration Contract
fixtures consumed by both Rust serializer and deserializer tests and TypeScript
Runtime parser tests. Fixtures MUST cover at least an empty snapshot, healthy,
disabled, incompatible, quarantine, degraded, detail, stable error, changed
event, unknown field, unsupported version, invalid variant, unsorted or
duplicate grant, and sensitive-field disclosure. A dedicated root check MUST
combine both boundaries and MUST fail when wire shape, enum, version, sorting,
error, or security boundaries drift.

#### Scenario: Both boundaries read valid fixtures

- **WHEN** Rust and TypeScript read every valid shared fixture
- **THEN** both accept the same cases and agree on contract version, variant, revision, identity, ordering, and field values

#### Scenario: Either boundary drifts

- **WHEN** a Rust wire struct, TypeScript parser, fixture, or contract version becomes inconsistent
- **THEN** the dedicated Registration Contract gate fails and identifies the specific case and boundary
- **THEN** standard frontend, workspace, and Rust validation execute or compose the gate

### Requirement: Registration Contract delivery MUST NOT claim downstream plugin capabilities

This capability MUST deliver only the Host-owned read model, read-only Tauri
queries, changed-event recovery semantics, TypeScript adapter, shared fixtures,
tests, and maintained documentation. It MUST NOT install, update, uninstall, or
execute plugins. It MUST NOT provide user lifecycle writes, Action or Page
projection, plugin management UI, an iframe Runtime, Host API, permission
grants, or signature verification. It MUST NOT change existing Launcher search,
Dispatcher, navigation, or window presentation behavior.

#### Scenario: Only Task 2.2 is complete

- **WHEN** the Registration Contract passes all validation while later tasks remain unimplemented
- **THEN** the root application can query Host registration snapshots and details and receive change notifications, but has no new plugin management page
- **THEN** plugin Actions do not automatically enter the Launcher, Pages do not open, plugin code does not execute, and permissions are not granted

#### Scenario: Verify existing Launcher behavior

- **WHEN** the application starts and uses the Launcher without later Action or Page projection
- **THEN** existing Host Actions, search, Dispatcher, collections, page navigation, and window behavior remain unchanged
- **THEN** the Registration Contract creates no plugin-specific search or execution branch
