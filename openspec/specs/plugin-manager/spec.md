# Plugin Manager Specification

## Purpose

Define the accepted Host-private Plugin Manager state, persistence, recovery,
compatibility, quarantine, diagnostics, and Tauri managed-state boundaries.
This capability establishes an internal installed-registration fact source and
revision-bound lifecycle mutation, but does not claim delivery of a public
registration contract, package installer, plugin Runtime, user-facing
native-authority workflow, Action or Page projection, or frontend management surface.

## Requirements

### Requirement: The Host MUST own one layered Plugin Manager state

The Rust Host MUST maintain one Plugin Manager and MUST expose the same
instance to internal Host consumers through Tauri managed state. Each healthy
plugin entry MUST store its validated normalized Manifest separately from its
Host-owned registration facts. Manifest authors MUST NOT set the installation
location, package digest, source, enabled intent, compatibility result,
quarantine state, Runtime state, or Host authority through author input.

#### Scenario: The Host accepts a validated registration record

- **WHEN** a trusted internal Host caller submits a normalized Manifest and
  Host registration facts
- **THEN** the Plugin Manager creates a unique entry keyed by the Manifest's
  `plugin_id`
- **THEN** the normalized Manifest contains only author-controlled data while
  Host facts remain in a separate layer

#### Scenario: The application starts with an empty Store

- **WHEN** the application starts for the first time and the Plugin Manager
  Store does not exist
- **THEN** the Host creates and manages an empty Plugin Manager
- **THEN** startup does not invent plugins, permission grants, or Runtime state

#### Scenario: A plugin identity is duplicated

- **WHEN** the Host attempts to create a second conflicting healthy record for
  the same `plugin_id`
- **THEN** the Plugin Manager rejects the transition with a stable error
- **THEN** the existing in-memory and persisted records remain unchanged

### Requirement: Registration facts MUST have explicit persistence lifetimes

The Plugin Manager MUST continue to distinguish durable installed records, process-local development entries, derived Runtime state, diagnostics, and resource generations. The current record format MUST NOT store `granted_permission_ids`, permission decisions, permission reasons, or permission history. Manifest `0.1.0` and grant data in an old record format MUST NOT produce new Host authority. Recovery MUST place such records into a stable incompatible or quarantined state, preserve program and data for explicit management, and MUST NOT fabricate Manifest `0.4.0`.

An installed record MUST persist the normalized Manifest, installation location, algorithm-tagged package digest, Host-controlled source, enabled intent, and recent bounded diagnostics. A development entry MUST use a distinct development-snapshot payload variant with `source=development`, remain process-local, and MUST NOT write, delete, or masquerade as a Plugin Manager Store record.

Compatibility for both durable and process-local lifetimes MUST derive from the respective current Manifest ranges and current lensX and Host API versions. Runtime state MUST remain process-local. A development entry, source-directory capability, immutable snapshot, diagnostics, and Runtime state MUST NOT recover in a new process.

#### Scenario: Current-format record recovers
- **WHEN** the Host starts and reads a valid current record
- **THEN** the Manager restores installation, source, enabled state, diagnostics, and the current Manifest without a grant field
- **THEN** the Runtime still starts from `inactive` with a new process-local generation

#### Scenario: Legacy permission record recovers
- **WHEN** the Host reads a legacy Manifest `0.1.0` record or one containing `granted_permission_ids`
- **THEN** the Manager fails closed into a stable incompatible or quarantined state without publishing clipboard or permission authority
- **THEN** repeated startup is idempotent, program and data are not deleted automatically, and logs disclose no grants or paths

#### Scenario: Old Host reads a current record
- **WHEN** a rolled-back old Host encounters the current record format
- **THEN** the old Host fails closed because the format is unknown
- **THEN** it does not guess fields, restore old grants, or overwrite the current record

#### Scenario: Host version changes

- **WHEN** a record was compatible with an earlier Host but the current lensX or Host API version no longer falls within its Manifest range during recovery
- **THEN** the Plugin Manager derives current compatibility as incompatible
- **THEN** a compatibility conclusion held by the earlier process does not override the new result

#### Scenario: Previous process had Runtime activity

- **WHEN** an installed plugin had process-local Runtime activity before the application exited or crashed
- **THEN** the next recovery does not deserialize that activity as a live Session
- **THEN** the plugin starts as `inactive`

#### Scenario: Development registration existed in previous process

- **WHEN** the previous process contained a development registration, source-directory capability, or immutable snapshot and then exited or crashed
- **THEN** the new Plugin Manager process recovers none of those development facts
- **THEN** installed records, quarantine evidence, and Store revision preserve their existing recovery semantics

### Requirement: Development entries MUST share Manager identity and revision authority without becoming Store records

The Plugin Manager MUST combine installed and process-local development entries
in one atomic read projection and MUST enforce the same plugin ID uniqueness
across builtin, external, development, and quarantine identities. Successful
development register, reload, enabled, and remove operations
MUST use the same compare-current revision, affected-plugin resource generation,
and changed-event semantics, but MUST NOT call Store write or delete. Development
payload facts MUST be a strict Host-owned variant and MUST NOT allow a Manifest
author to submit source, snapshot path or identity, enabled intent, or
Runtime state.

#### Scenario: Development entry joins the current snapshot

- **WHEN** the trusted Development coordinator submits a complete valid
  development Manifest, snapshot payload facts, and enabled intent
- **THEN** the Manager publishes a process-local healthy entry under the unique
  `plugin_id`, advances the revision and resource generation, and emits the
  ordinary changed event
- **THEN** the same transition creates no Plugin Store file or installed package
  record

#### Scenario: Development mutation loses a race

- **WHEN** a development reload, enabled, or remove mutation uses a stale
  expected revision or entry identity
- **THEN** the Manager returns a stable conflict without changing installed or
  development entries, the Store, revision, or resource generation
- **THEN** the stale mutation cannot restore an old snapshot or Runtime
  authority

#### Scenario: Development entry is removed

- **WHEN** the trusted coordinator successfully removes the current development
  entry
- **THEN** the Manager deletes it from the process-local healthy set and
  advances the affected plugin's revision and resource generation
- **THEN** the Manager deletes no plugin data, installed payload, Launcher
  collection, or Store record

### Requirement: Plugin records MUST persist independently and atomically

The Plugin Manager MUST use separate plugin records with an explicit format
version so that each record can be read, validated, and replaced independently.
Every transition MUST validate the next record and persist it atomically before
publishing the new in-memory state. A persistence failure MUST preserve the
last successful in-memory and on-disk state.

#### Scenario: A state transition persists successfully

- **WHEN** the Host changes a healthy record's enabled intent and the next
  record is valid
- **THEN** the Store atomically replaces that plugin's record
- **THEN** the Plugin Manager publishes the new state to internal Host readers
  only after the write succeeds

#### Scenario: A write fails

- **WHEN** temporary-file creation, writing, flushing, or atomic replacement
  fails
- **THEN** the Plugin Manager returns a stable persistence diagnostic
- **THEN** the original in-memory record and last successful on-disk record
  remain unchanged
- **THEN** a residual temporary file is not recovered as a healthy plugin
  record

#### Scenario: One plugin is updated while another remains registered

- **WHEN** the Plugin Manager holds two healthy plugins and a transition for
  one of them succeeds
- **THEN** the other plugin's record content and state remain unchanged

### Requirement: Startup recovery MUST isolate damaged plugin records

The Plugin Manager MUST inspect each candidate record independently during
startup. A record that cannot be parsed, uses an unsupported format version,
has an identity mismatch between its record key and normalized Manifest, or
violates registration invariants MUST become a quarantine stub with a stable
diagnostic. That record MUST NOT prevent other healthy records or the
application from recovering. Recovery MUST NOT silently delete or overwrite a
damaged source record.

#### Scenario: One record is damaged and another is healthy

- **WHEN** the Store contains both a valid record and a plugin record that
  cannot be parsed
- **THEN** the Plugin Manager recovers the valid record
- **THEN** the damaged record is represented by a quarantine stub with a
  recovery diagnostic
- **THEN** the application continues to start

#### Scenario: A record declares an unknown format version

- **WHEN** a syntactically valid record declares an unsupported format version
- **THEN** the Plugin Manager does not guess, downgrade, or silently migrate
  the record
- **THEN** the record enters quarantine while records using supported versions
  continue to recover

#### Scenario: A record identity is inconsistent

- **WHEN** the persisted record key does not match the normalized Manifest's
  `plugin_id`
- **THEN** the Plugin Manager isolates the record and reports a stable identity
  mismatch diagnostic
- **THEN** the record cannot overwrite another plugin's healthy state

#### Scenario: The Store directory is unreadable

- **WHEN** the Host cannot list or read the Plugin Manager Store directory
- **THEN** the Plugin Manager enters a degraded state with an empty healthy set
  and a manager-level recovery diagnostic
- **THEN** application startup does not panic and the Host does not overwrite
  the unreadable source data

### Requirement: Quarantine and enabled state MUST remain distinct Host facts

The Plugin Manager MUST represent enabled intent, current compatibility, and
quarantine independently. Entering quarantine MUST make an entry unavailable
as a healthy registration, but MUST NOT be interpreted automatically as a user
disable, uninstall, or deletion. Clearing quarantine MUST require a trusted
Host caller to atomically replace the damaged record with a complete valid
record.

#### Scenario: An enabled record is damaged during recovery

- **WHEN** a previously enabled record fails validation during startup recovery
- **THEN** the entry enters quarantine and cannot be consumed as a healthy
  enabled registration
- **THEN** the Host does not record the event as a user-initiated disable or
  uninstall

#### Scenario: A healthy record replaces a quarantine stub

- **WHEN** a trusted Host caller provides a complete valid replacement for the
  same record identity
- **THEN** the Plugin Manager clears the quarantine stub only after persisting
  the replacement atomically
- **THEN** the trusted Host supplies the replacement's enabled intent explicitly
  instead of deriving it from damaged content

### Requirement: Plugin Manager diagnostics MUST be stable, safe, and bounded

Plugin Manager diagnostics MUST contain at least a stable machine-readable
code, an operation phase, and a safe message. They MUST NOT retain raw error
objects, stacks, plugin content, or unnecessary sensitive paths. Each healthy
record MUST retain at most its 32 most recent diagnostics and MUST evict the
oldest diagnostic first when the limit is exceeded. A quarantine stub MUST
retain its current isolation reason.

#### Scenario: Diagnostics exceed the retention limit

- **WHEN** a healthy record receives its 33rd retainable diagnostic
- **THEN** the Plugin Manager evicts the oldest diagnostic and retains the 32
  most recent diagnostics
- **THEN** the retained ordering continues to express creation order

#### Scenario: A low-level I/O error contains sensitive details

- **WHEN** a Store operation receives a low-level error containing a raw path,
  error object, or stack
- **THEN** the Plugin Manager maps it to a stable code, phase, and safe message
- **THEN** persisted diagnostics omit the raw error object, stack, and
  unnecessary sensitive paths

### Requirement: Plugin Manager authority MUST remain Host-private

The Plugin Manager MUST expose its Manager, Store, recovery report, lifecycle
transitions and revision-bound lifecycle mutation only to trusted Host services.
It MUST NOT expose raw Manager state or a general mutation boundary to plugins,
the public Registration Contract, or frontend product code. This capability
MUST NOT by itself claim delivery of a frontend query or management UI, Action
or Page projection, package installation, iframe Runtime, public Host API, or
user-facing native-authority workflow.

#### Scenario: A consumer inspects the public application boundary

- **WHEN** the Host-private Plugin Manager capability is present
- **THEN** the frontend has no raw Plugin Manager Tauri command, shared Manager
  payload, or management interface from this capability
- **THEN** existing Launcher behavior remains unchanged

#### Scenario: The Host recovers a registration record

- **WHEN** the Plugin Manager recovers a healthy registration record during
  startup
- **THEN** recovery does not read plugin UI, create an iframe, project an
  Action or Page, or execute plugin code

### Requirement: Plugin Manager must remove healthy and quarantine records atomically

The Plugin Manager MUST provide trusted Host callers with an internal
transition that removes a healthy record or quarantine Store record by its
current entry identity. Before removal, the Manager MUST validate the target,
the complete Store state, and the caller's revision. It MUST persist and flush
the record's absence before removing the entry from the in-memory snapshot and
committing a new revision. Failure during record deletion or directory syncing
MUST preserve the original on-disk record, the original in-memory healthy or
quarantine entry, and the original revision. Manager removal MUST NOT delete
the installation payload, plugin data, Launcher collections, or any other
provider record.

#### Scenario: A healthy record is removed successfully

- **WHEN** a trusted lifecycle coordinator removes a healthy entry matching
  the current revision and Store deletion and directory syncing succeed
- **THEN** subsequent snapshots and details no longer contain that entry and
  the Manager commits exactly one new revision
- **THEN** the record's enabled intent and diagnostics no longer exist
  as a healthy registration

#### Scenario: A quarantine Store record is removed successfully

- **WHEN** a trusted lifecycle coordinator selects the current quarantine
  record by opaque entry identity
- **THEN** the Manager removes the corresponding Store record and quarantine
  stub without parsing or repairing the damaged content
- **THEN** every other healthy and quarantine entry remains unchanged

#### Scenario: Record removal persistence fails

- **WHEN** Store record deletion, parent-directory flushing, or an injected
  failure stage fails
- **THEN** the Manager returns a stable persistence diagnostic and the original
  entry remains recoverable in memory and on disk
- **THEN** the revision does not increment and the Host does not publish a
  Registration changed event

### Requirement: Plugin Manager enabled and removal transitions must preserve no-op and revision semantics

`set_enabled` MUST return a no-op when the target healthy record already has
the requested intent and MUST NOT write the record, commit a revision, or
produce a changed event. A real enabled transition and a real removal
transition MUST each commit exactly one revision, and only after persistence
and in-memory snapshot publication have both completed. A missing healthy
identity, an enabled transition targeting quarantine, a stale revision, or a
degraded Store MUST produce a stable rejection without modifying state.

#### Scenario: Enabled intent already matches the requested value

- **WHEN** a trusted caller sets the same boolean intent again
- **THEN** the Manager returns a no-op and the record bytes, in-memory snapshot,
  and revision remain unchanged

#### Scenario: Enabled intent changes

- **WHEN** a healthy record's requested enabled intent differs from its current
  value and atomic persistence succeeds
- **THEN** the Manager publishes the updated record and commits exactly one new
  revision
- **THEN** compatibility, quarantine, Runtime, and other plugin records
  do not change automatically because of that boolean transition

#### Scenario: The whole Store is degraded

- **WHEN** Manager recovery cannot establish a trusted Store read-write
  boundary
- **THEN** enabled and removal transitions are both rejected without
  overwriting unreadable evidence
- **THEN** the application can still read the degraded Registration conclusion
  and continue Host functions that do not depend on plugins
