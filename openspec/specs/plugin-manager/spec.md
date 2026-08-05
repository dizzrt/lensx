# Plugin Manager Specification

## Purpose

Define the accepted Host-private Plugin Manager state, persistence, recovery,
compatibility, quarantine, diagnostics, and Tauri managed-state boundaries.
This capability establishes an internal installed-registration fact source and
revision-bound grant mutation, but does not claim delivery of a public
registration contract, package installer, plugin Runtime, user-facing
permission workflow, Action or Page projection, or frontend management surface.

## Requirements

### Requirement: The Host MUST own one layered Plugin Manager state

The Rust Host MUST maintain one Plugin Manager and MUST expose the same
instance to internal Host consumers through Tauri managed state. Each healthy
plugin entry MUST store its validated normalized Manifest separately from its
Host-owned registration facts. Manifest authors MUST NOT set the installation
location, package digest, source, enabled intent, compatibility result,
quarantine state, Runtime state, or granted permissions through author input.

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

The Plugin Manager MUST persist the normalized Manifest, installation location,
algorithm-tagged package digest, Host-controlled source, enabled intent,
granted-permission ID snapshot, and recent diagnostics. The existence of a
record MUST represent an installed registration; it MUST NOT prove that a real
package installation workflow has been delivered. Compatibility MUST be
derived from the recorded Manifest ranges and the current lensX and Host API
versions. Runtime state MUST remain process-local and MUST start as `inactive`
after recovery.

#### Scenario: A healthy record is recovered after restart

- **WHEN** a healthy record was persisted successfully and the application
  restarts with the same Host versions
- **THEN** the Plugin Manager recovers the same normalized Manifest,
  installation facts, enabled intent, grant snapshot, and bounded diagnostics
- **THEN** the Runtime state is `inactive`

#### Scenario: The Host version changes

- **WHEN** a record was compatible with an earlier Host but the current lensX
  or Host API version no longer falls within its Manifest range during recovery
- **THEN** the Plugin Manager derives the current compatibility as incompatible
- **THEN** a compatibility conclusion held by the earlier process does not
  override the new result

#### Scenario: A Manifest requests permissions without a Host grant

- **WHEN** the normalized Manifest declares one or more requested permissions
  and the Host provides no grant snapshot
- **THEN** the Plugin Manager persists an empty granted-permission ID snapshot
- **THEN** requested permissions do not become grants automatically

#### Scenario: The previous process had Runtime activity

- **WHEN** a plugin had process-local Runtime activity before the application
  exited or crashed
- **THEN** the next recovery does not deserialize that activity as a live
  session
- **THEN** the plugin starts as `inactive`

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
transitions, and revision-bound grant mutation only to trusted Host services.
It MUST NOT expose raw Manager state or a general mutation boundary to plugins,
the public Registration Contract, or frontend product code. This capability
MUST NOT by itself claim delivery of a frontend query or management UI, Action
or Page projection, package installation, iframe Runtime, public Host API, or
user-facing permission workflow.

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
- **THEN** the record's enabled intent, grants, and diagnostics no longer exist
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
- **THEN** compatibility, quarantine, grants, Runtime, and other plugin records
  do not change automatically because of that boolean transition

#### Scenario: The whole Store is degraded

- **WHEN** Manager recovery cannot establish a trusted Store read-write
  boundary
- **THEN** enabled and removal transitions are both rejected without
  overwriting unreadable evidence
- **THEN** the application can still read the degraded Registration conclusion
  and continue Host functions that do not depend on plugins

### Requirement: Grant snapshot mutations MUST be revision-bound, declaration-limited, and atomic

The Plugin Manager MUST provide a Host-private mutation that changes one
permission grant on a healthy Registration while preserving the normalized
Manifest and every unrelated Host fact. Every mutation MUST require the current
opaque entry identity and exact Registration revision. Granting MUST require the
current normalized Manifest to request the permission and the current Host
permission catalog to support it. Revocation MUST be able to remove an existing
grant even if the permission is no longer requested or supported.

The candidate grant snapshot MUST remain sorted, deduplicated, bounded, and
Host-owned. A changed snapshot MUST be persisted through the existing atomic
record replacement before the in-memory state is published, after which the
Registration revision MUST advance exactly once. An idempotent target state
MUST return unchanged without writing or advancing the revision. Source,
Publisher text, version direction, enabled intent, and author-controlled fields
MUST NOT affect this transition.

#### Scenario: A currently requested permission is granted

- **WHEN** a trusted Host caller grants a current Manifest request using the
  current entry identity and revision
- **THEN** the Manager atomically persists the normalized next grant snapshot
  and publishes one new revision
- **THEN** the normalized Manifest and unrelated Host facts remain unchanged

#### Scenario: An existing permission is revoked

- **WHEN** a trusted Host caller revokes an existing grant using the current
  entry identity and revision
- **THEN** the Manager atomically removes only that grant and publishes one new
  revision
- **THEN** other grants and unrelated plugin records remain unchanged

#### Scenario: A grant is undeclared or unsupported

- **WHEN** a caller attempts to add a permission that the current Manifest did
  not request or the Host catalog does not support
- **THEN** the Manager rejects the transition with a stable diagnostic
- **THEN** memory, disk, revision, and the previous grant snapshot remain
  unchanged

#### Scenario: A grant mutation is idempotent

- **WHEN** a caller grants an already granted permission or revokes a permission
  absent from the current grant snapshot
- **THEN** the Manager returns the current Registration without writing a record
- **THEN** the revision and resource generation remain unchanged

#### Scenario: A grant mutation loses a revision race

- **WHEN** another lifecycle, replacement, installation, or permission mutation
  advances the Registration revision before the current mutation commits
- **THEN** the stale mutation fails with a stable conflict diagnostic
- **THEN** it cannot overwrite the newly committed Manifest, grants, enabled
  intent, diagnostics, or payload facts

#### Scenario: Grant persistence fails

- **WHEN** creation, writing, flushing, or atomic replacement of the changed
  grant snapshot fails
- **THEN** the Manager returns a stable persistence diagnostic and does not
  publish a new revision
- **THEN** the last successful in-memory and on-disk record remains
  authoritative after restart
