# Plugin Development Mode Specification

## Purpose

Define the Host-private, explicitly enabled workflow for registering and
manually reloading an unpacked plugin development directory without weakening
the production Registration, Resource, Runtime, Session, or Host-authority
boundaries.
## Requirements
### Requirement: Development Mode MUST require build capability and explicit per-process opt-in

The system MUST expose development controls only when both the native and
frontend builds explicitly include the Plugin Development Mode capability. An
explicit per-process opt-in MUST come from a user action in trusted Host
settings or from the dedicated `pnpm run dev:plugin-development-mode` startup
command. The dedicated command MUST enable the native state before the frontend
reads the capability. Native commands MUST independently check the build
capability and the current process-local switch; frontend visibility MUST NOT
establish authority. Production builds MUST NOT register development Tauri
commands, managed state, or frontend operation entry points.

#### Scenario: User enables Development Mode in a capable build

- **WHEN** the current build includes both native and frontend development
  capabilities and the user explicitly enables Development Mode in Host
  settings
- **THEN** the current process can display and invoke development-directory
  registration
- **THEN** enabling the mode does not register a plugin, read a directory,
  create Host authority, or create a Runtime

#### Scenario: Dedicated development command starts

- **WHEN** a developer runs the dedicated `pnpm run dev:plugin-development-mode`
  command
- **THEN** the new process treats the command as an explicit opt-in and reports
  Development Mode enabled in its first capability snapshot and Settings render
- **THEN** that opt-in alone does not execute a Launcher Action, open a plugin
  Page, create a Runtime, or create a Child WebView

#### Scenario: User disables an auto-enabled process

- **WHEN** the user disables Development Mode in a process started by the
  dedicated command
- **THEN** the Host completes the existing quiesce flow, sets the process-local
  switch to disabled, and does not re-enable it because startup configuration
  remains present
- **THEN** a later dedicated startup creates a new opt-in without recovering the
  prior process's registration, snapshot, scope, or Runtime

#### Scenario: Production artifacts are checked

- **WHEN** the release artifact gate inspects a production build that excludes
  Plugin Development Mode
- **THEN** the frontend bundle contains no development UI or development-command
  call and the native binary registers no development command or managed state
- **THEN** a manually constructed frontend request still cannot enable the
  mode, select a directory, register, reload, or remove a development plugin

### Requirement: Development registration MUST accept only one explicitly selected self-contained dist directory

The interactive registration operation MUST obtain one user-authorized
directory through a Host-owned native folder picker and MUST treat its root as a
self-contained `dist/`. The interactive operation and the dedicated startup's
Host-owned bootstrap discovery MUST remain independent. For picker and
bootstrap input alike, the Host MUST read only regular files without following
symlinks and MUST check portable paths, case collisions, file-count, per-file
and total-size limits, `manifest.json`, Manifest semantics, current
compatibility, and the completeness of every referenced resource. The Host MUST
NOT search a candidate `dist/` parent, read project metadata, execute a build
script, accept a remote URL, or treat a frontend-supplied path as authority.

#### Scenario: Register a valid compatible dist interactively

- **WHEN** the explicitly selected directory contains a valid compatible
  Manifest, self-contained Runtime and resources, and only bounded regular
  portable files
- **THEN** the Host can proceed to snapshot preparation and return only safe
  candidate facts
- **THEN** the frontend, events, logs, and Registration Contract receive no
  absolute source-directory path or file content

#### Scenario: User cancels directory selection

- **WHEN** the native folder picker closes without a selected directory
- **THEN** the operation returns an ordinary cancelled result
- **THEN** the system creates no staging directory, snapshot, registration,
  revision, scope, or Runtime

#### Scenario: Directory contains unsafe or incomplete content

- **WHEN** a picker or bootstrap candidate lacks `manifest.json` or a referenced resource,
  contains a link, special file, absolute or colliding path, exceeds a limit,
  contains an invalid Manifest, or is incompatible with the current Host
- **THEN** the Host rejects that candidate with a stable bounded invalid or
  incompatible diagnostic
- **THEN** untrusted paths, raw I/O errors, file bytes, and partial Manifest
  facts do not leave the native boundary

#### Scenario: Directory changes while being read

- **WHEN** the root or any file is replaced, changes type, grows, is truncated,
  or becomes a link during authorization, metadata checks, reading, or snapshot
  copying
- **THEN** the Host returns a retryable bounded `source_changed` or unsafe
  result and publishes no mixed generation
- **THEN** any existing development registration and Runtime remain current

### Requirement: Dedicated development startup MUST discover and register repository plugin builds without opening them

The dedicated `pnpm run dev:plugin-development-mode` command MUST use the
repository `plugins/` directory as its default startup root and MUST support one
optional `--plugins-root <path>` override. The Host MUST inspect only non-hidden
direct child directories of that root in deterministic order and MUST treat
only an existing `<member>/dist` as a candidate. A member without `dist/` MUST
be treated as not yet built and ignored. Each successful candidate MUST be
published as a process-local, enabled, `source=development`, Runtime-inactive
immutable snapshot registration. Bootstrap MUST NOT execute a Launcher Action,
open a Page, create a Runtime, build, install, watch, or reload a plugin.

#### Scenario: Default repository plugins are ready

- **WHEN** `plugins/*/dist` contains one or more valid compatible self-contained
  candidates whose plugin IDs are globally unique across current Registration
- **THEN** dedicated startup registers all valid candidates before the initial
  frontend projection and reports the Settings switch enabled
- **THEN** the Launcher may project their Actions, but no plugin Page or Child
  WebView opens before a user explicitly executes an Action

#### Scenario: Custom plugin root is supplied

- **WHEN** a developer supplies `--plugins-root <path>` to the dedicated command
- **THEN** the Host uses only direct-member `dist/` directories beneath the
  normalized custom root for this process and does not also scan the default root
- **THEN** the root, source directories, and snapshots do not enter the frontend,
  events, Registration Contract, or plugin Runtime

#### Scenario: Root or member has no built dist

- **WHEN** the startup root is missing, empty, unreadable, or a direct member has
  no `dist/`
- **THEN** the application still starts with Development Mode enabled and emits
  a stable bounded summary for an undiscoverable root or ignores the unbuilt member
- **THEN** the Host does not guess another directory or run a build, and the user
  may still use the interactive native picker

#### Scenario: A candidate is invalid but IDs do not conflict

- **WHEN** one candidate produces an invalid, incompatible, source-changed,
  unsafe, or candidate-level read diagnostic while another candidate validates
- **THEN** the Host cleans and skips the failed candidate, reports its stable
  member label and code plus loaded/skipped counts, and registers the other valid
  candidates
- **THEN** the diagnostic discloses no absolute path, file content, raw native
  error, or partial authority fact

#### Scenario: Candidate IDs conflict

- **WHEN** two validated bootstrap candidates use the same plugin ID or a
  candidate ID belongs to a current builtin, external, quarantine, or
  development identity
- **THEN** the Host cleans all uncommitted candidates and blocks the dedicated
  startup with a stable conflict before exposing a bootstrap registration
- **THEN** the Host does not shadow, replace, upgrade, disable, or remove an
  existing identity

#### Scenario: Bootstrap infrastructure cannot initialize or commit safely

- **WHEN** the development cache, snapshot coordinator, or Plugin Manager cannot
  initialize, or a system-level commit failure cannot converge safely after ID
  preflight
- **THEN** the Host rolls back authority committed by this batch, cleans
  snapshots provably owned by the batch, and fails application startup
- **THEN** the UI does not present an enabled mode whose authority cannot be
  registered or revoked safely

### Requirement: Host MUST publish only an immutable validated development snapshot

The Host MUST copy the authorized directory into a unique Host-owned staging
generation, complete all content validation against the staging bytes, and
publish an immutable snapshot by an atomic same-filesystem rename only after
success. The snapshot identity MUST be a domain-separated SHA-256 over sorted
portable paths and bytes and MUST remain distinct from an `.lxp` package digest.
The Plugin Resource service and Runtime MUST read only the current published
snapshot and MUST NOT read the author's changing directory directly.

#### Scenario: Initial snapshot commits successfully

- **WHEN** staging copy, complete validation, flush, atomic publication, and
  Manager compare-and-commit all succeed
- **THEN** the Host publishes a process-local registration with
  `source=development`, `enabled=true`, and Runtime `inactive`
- **THEN** the current snapshot identity and resource generation are uniquely
  bound, and the staging path never becomes an executable payload

#### Scenario: Snapshot fails before commit

- **WHEN** copy, validation, flush, rename, or Manager compare-and-commit fails
  before publication
- **THEN** the Host attempts to remove that request's staging or snapshot and
  publishes no registration, revision, generation, or changed event
- **THEN** any existing registration with the same ID, its snapshot, and
  Runtime authority remain unchanged

#### Scenario: Revoked snapshot cleanup fails

- **WHEN** a new generation has committed or a development registration has
  been removed but the old snapshot cannot be deleted immediately
- **THEN** old scope currentness remains revoked and the old snapshot bytes
  cannot regain Resource or Runtime authority
- **THEN** the Host records a bounded cleanup diagnostic and retries only in
  bounded recovery for the current process's development cache

### Requirement: Development identity and source MUST remain Host-owned, process-local, and non-authoritative

A development registration MUST use its Manifest plugin ID in the same global
uniqueness check as builtin, external, quarantine, and other development
entries. The Host MUST generate the `development` source; Manifest publisher or
other author-controlled fields MUST NOT set source or establish official,
verified, signed, installed, trusted, or additional Host-authority conclusions.
Development registrations, source-directory capabilities, and snapshots MUST
exist only in the current process and MUST NOT be written to the
Plugin Manager Store.

#### Scenario: The same plugin ID already exists

- **WHEN** the selected Manifest plugin ID already belongs to a builtin,
  external, quarantine, or development identity
- **THEN** registration returns a stable conflict instead of shadowing,
  upgrading, repairing, or replacing the existing entry
- **THEN** the existing record, payload, snapshot, revision, and Runtime
  remain unchanged

#### Scenario: Development Manifest claims an official publisher

- **WHEN** publisher text in a development Manifest claims lensX or another
  trusted organization
- **THEN** Registration and settings still label the entry Development,
  Unpacked, and Unsigned
- **THEN** the text changes no source, Host API capability, CSP, or
  Session validation result

#### Scenario: Process exits unexpectedly

- **WHEN** a process containing a development registration crashes and a
  production or development build later starts
- **THEN** the Plugin Manager Store does not recover that entry and production
  registration records remain unaffected
- **THEN** bounded cache cleanup may remove residue proven to belong to an old
  development session but MUST NOT guess or delete another path

### Requirement: Manual reload MUST be atomic, revision-bound, and force a fresh Runtime generation

Reload MUST accept only the current development entry's opaque identity and
expected Registration revision and MUST create a complete new snapshot through
the Host-held source-directory capability. A successful reload MUST preserve
the plugin ID, atomically replace the complete Manifest and payload facts,
force the affected plugin's Registration revision and resource generation to
advance, terminate the old Runtime attempt, and create a fresh attempt when the
page remains the current navigation target. An explicit reload MUST NOT be
treated as a no-op even when the snapshot bytes are unchanged. The system MUST
NOT automatically watch, reload, or retry indefinitely.

#### Scenario: Modified development plugin reloads successfully

- **WHEN** the new `dist/` for the current development entry validates and the
  expected identity and revision still match
- **THEN** the Host atomically publishes the new snapshot, Manifest, revision,
  and resource generation and revokes the old scope
- **THEN** the old iframe, Session, nonce, Port, listener, timer, pending work,
  and handler authority are cleaned up and the new Runtime attempt completes a
  fresh load and handshake

#### Scenario: User explicitly reloads unchanged content

- **WHEN** the new snapshot identity matches the current snapshot and the user
  explicitly requests reload
- **THEN** the affected plugin still receives a new resource generation and
  Runtime attempt
- **THEN** the action starts no persistent background retry and does not affect
  another plugin's revision-bound authority

#### Scenario: New content is invalid or incompatible

- **WHEN** the new directory content becomes invalid, incompatible, unsafe, or
  unreadable before snapshot commit
- **THEN** the Host returns a bounded failure while keeping the old Manifest,
  snapshot, generation, and Runtime usable
- **THEN** the failed staging generation enters neither the Resource service
  nor Registration projection

#### Scenario: Reload loses a revision race

- **WHEN** the entry is disabled, removed, replaced, or reloaded again
  while reload preparation is in progress
- **THEN** compare-and-commit returns a stable conflict and removes the
  uncommitted snapshot
- **THEN** the stale operation cannot overwrite the current Manifest, payload,
  enabled intent, revision, or Runtime

#### Scenario: Reload changes plugin ID

- **WHEN** the new Manifest plugin ID differs from the current development
  entry identity
- **THEN** reload is rejected and is not interpreted as remove followed by
  register
- **THEN** the current entry, snapshot, scope, and Runtime remain unchanged

### Requirement: Disable and remove MUST quiesce development authority without deleting plugin data

Disabling Development Mode MUST remove every current-process development
registration and revoke its Runtime and Resource authority through the existing
terminal lifecycle operation before reporting success. Removing one entry MUST
use its revision-bound identity to delete the development registration and
snapshot. Neither operation MUST delete plugin-scoped data, Launcher recent or
pinned collections, production packages, or another plugin's content.

#### Scenario: User removes a development plugin

- **WHEN** removal of the current development entry passes identity and
  revision checks and commits successfully
- **THEN** Registration, Page and Action projection, Resource scope, and Runtime
  attempt are revoked and the snapshot enters safe cleanup
- **THEN** plugin data and Launcher collections remain, and the operation is
  not presented as a production-package uninstall

#### Scenario: User disables Development Mode

- **WHEN** one or more development entries exist and the user disables the
  process-local switch
- **THEN** the Host quiesces and removes all development entries in a
  deterministic order before reporting Development Mode disabled
- **THEN** any failure is shown as a bounded partial or convergence diagnostic,
  and the frontend does not prematurely claim all authority was revoked

### Requirement: Delivery MUST prove safe directory handling, atomic reload, production exclusion, and real Runtime teardown

Delivery MUST combine Rust directory, snapshot, Manager, and Resource tests;
TypeScript contract and service tests; React accessibility, localization, and
theme tests; the shared directory corpus; workspace and release boundary gates;
and target macOS WebView evidence. Validation MUST cover valid, invalid,
incompatible, cancelled, source-race, link, limit, collision, reload success,
failure and conflict, unchanged reload, legacy-contract rejection, disable and remove,
cleanup failure, process restart, production build exclusion, and zero residual
authority from the old generation.

#### Scenario: Focused Development Mode gate passes completely

- **WHEN** `check:plugin-development-mode` runs every focused, boundary, release
  artifact, and real WebView matrix check in a supported environment
- **THEN** CLI and Host conclusions agree for their shared payload semantics and
  every development transaction and UI requirement passes
- **THEN** the old scope, iframe, Session, Port, listener, timer, pending RPC,
  and privileged handler authority are unavailable after reload, while the new
  generation handshakes under the unrelaxed production policy

#### Scenario: A security or production-build invariant cannot be proven

- **WHEN** required evidence cannot prove directory currentness, snapshot
  atomicity, source distinction, Host-authority non-escalation, terminal cleanup,
  production exclusion, or cross-layer contract consistency
- **THEN** Task 6.5 remains incomplete while the specification, design, or
  implementation is corrected
- **THEN** validation MUST NOT replace missing evidence by directly reading the
  author directory, relaxing Runtime policy, hiding failures, removing negative
  cases, or checking source text alone

### Requirement: Development execution MUST use the production Child WebView path
Development registration and manual reload MUST use the same Manifest `0.3.0`, Child WebView registry, origin/resource binding, navigation, bridge, Session, RPC, Host API and teardown boundaries as installed plugins. Development source MUST grant no alternate Tauri command, bridge, bounds, CSP or Host authority.

#### Scenario: Development Page opens
- **WHEN** an opted-in validated development snapshot becomes current
- **THEN** it runs through the production Child WebView service without a dev-only Runtime

#### Scenario: Manual reload commits
- **WHEN** a new immutable snapshot and generation commit atomically
- **THEN** old Child WebView teardown completes and a fresh attempt/WebView loads the new generation
- **THEN** uncommitted reload failure leaves the current WebView unchanged
