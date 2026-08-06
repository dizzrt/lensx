# Local Plugin Installation Specification

## Purpose

Define the trusted first-install lifecycle for a local compatible `.lxp`,
including native selection, bounded inspection and extraction, Host-owned
storage, atomic registration, conservative recovery, a private command
contract, and the minimal settings entry point.

## Requirements

### Requirement: Users must select `.lxp` packages through a trusted local installation entry point

The system MUST provide a Host-owned entry point for installing a plugin from a
local file in lensX settings and MUST receive `.lxp` packages through a native
single-file selection flow. The UI MUST present "local" as the installation
source rather than a plugin category. Selection and file reading MUST be owned
by the trusted Rust Host; requests and responses MUST NOT expose the source
absolute path, file handle, or package bytes to React, public plugin packages,
or the plugin Runtime. The filename extension MUST be only a selection filter,
and final acceptance MUST depend on the package content protocol.

#### Scenario: User selects a local package

- **WHEN** the user starts local installation from settings and selects an
  `.lxp` in the native dialog
- **THEN** the Rust Host reads and inspects the selected package
- **THEN** the frontend does not receive the selected file's absolute path,
  handle, or contents

#### Scenario: User cancels selection

- **WHEN** the user closes the native file dialog without selecting a file
- **THEN** the installation request returns a strict `cancelled` result instead
  of an error
- **THEN** the system creates no staging directory, committed payload, Plugin
  Manager record, revision, or changed event

#### Scenario: Filename is correct but content is invalid

- **WHEN** the user selects a file whose extension is `.lxp` but whose content
  does not conform to the current package protocol
- **THEN** the system rejects it by content as an invalid package
- **THEN** the `.lxp` suffix does not trigger format guessing, fallback, or
  installation

### Requirement: Installation must consume the same bounded and fully validated package bytes

The Rust Host MUST enforce the compressed-package size limit before and during
the read and MUST make package inspection and controlled extraction consume the
same immutable bytes. The system MUST reuse the current Zstandard/TAR,
checksum, Manifest, asset, path, and hard-limit rules; it MUST NOT reopen the
source path after inspection and MUST NOT use permissive unpacking behavior
that allows links, extended entries, path traversal, or implicit path
normalization. Only a `compatible` result may enter staging extraction.

#### Scenario: Valid compatible package passes installation inspection

- **WHEN** the same package bytes satisfy every package protocol, Manifest,
  asset, checksum, size, and current Host compatibility requirement
- **THEN** the system obtains the normalized Manifest, per-file facts, and full
  package SHA-256 and permits controlled staging extraction
- **THEN** extraction rechecks canonical entries, paths, sizes, and file
  SHA-256 values

#### Scenario: Package grows beyond the limit after selection

- **WHEN** the selected file's metadata is within the limit but its bounded
  read exceeds the current 64 MiB compressed-package limit
- **THEN** the Host stops reading and returns a safe size-limit error
- **THEN** the system does not inspect or commit a truncated prefix and creates
  no installation facts

#### Scenario: Package contains dangerous or non-canonical entries

- **WHEN** a package contains path traversal, an absolute path, a link, a
  special entry, a duplicate path, a case collision, an extended header, a
  compression bomb, or content beyond a hard limit
- **THEN** the existing package rules fail the entire installation closed
- **THEN** no entry can be written outside the installer-owned staging root or
  become a committed payload

#### Scenario: Package is valid but incompatible with the current Host

- **WHEN** package structure, checksums, Manifest, and assets are valid but the
  lensX or Host API range excludes the current version
- **THEN** installation returns a distinct incompatible error and a safe
  compatibility conclusion
- **THEN** the system creates no staging directory, committed payload, or
  Plugin Manager record

### Requirement: The Host must own a single-registration digest installation layout

The system MUST derive a Host-owned `plugins` root from Tauri
`app_local_data_dir` and MUST store committed payloads at
`packages/<plugin-key>/<package-sha256>`. The `plugin-key` MUST encode the
normalized `plugin_id` deterministically as a platform-safe identity, and
`package-sha256` MUST be the 64-character lowercase hexadecimal SHA-256 of the
complete `.lxp` bytes. The installation layout MUST NOT create `versions` or
persistent `transactions` directories. Each `plugin_id` MUST have at most one
current healthy registration, and the Plugin Manager record's installation
path MUST be the sole active payload pointer.

#### Scenario: First installation creates a committed payload

- **WHEN** a previously absent compatible plugin commits successfully
- **THEN** its regular files reside in the committed directory uniquely
  determined by its plugin key and complete package digest
- **THEN** the Plugin Manager record's absolute installation path points to
  that directory and stores the same algorithm-labelled digest

#### Scenario: Same semantic version has different package content

- **WHEN** two `.lxp` packages declare the same `plugin_id` and Manifest version
  but contain different complete package bytes
- **THEN** they have distinct digest path identities
- **THEN** first installation does not overwrite the current payload merely
  because the version strings match

#### Scenario: Installation-root capability boundaries are inspected

- **WHEN** a caller inspects the application bundle, installation root, and
  future plugin-data boundary
- **THEN** mutable payloads reside in app-local data rather than the signed
  application bundle
- **THEN** this capability creates no private plugin-data directory and does not
  claim that deleting the application bundle cleans Application Support data

### Requirement: First installation must use explicit Host registration facts

When first registering a compatible package, the Host MUST use the normalized
Manifest and package digest returned by the inspector, MUST inject the absolute
committed installation path, `source=external`, `enabled=true`, and an empty
granted-permission snapshot, and MUST leave the Runtime `inactive`. Manifest
publisher text or requested permissions MUST NOT change source, enabled, grant,
signature, provenance, or trust conclusions.

#### Scenario: Compatible plugin requests permissions

- **WHEN** a compatible package Manifest declares one or more requested
  permissions and completes first installation
- **THEN** the Plugin Manager record stores an empty grant snapshot, the plugin
  has enabled intent, and its Runtime is `inactive`
- **THEN** installation does not convert requested permissions into grants or
  execute plugin code

#### Scenario: Publisher claims an official identity

- **WHEN** a local package's publisher text claims official lensX authorship
- **THEN** the Host still records the first local installation as `external`
- **THEN** installation creates no verified, signed, official, or additional
  permission facts

### Requirement: Payload commit and registration publication must remain recoverably consistent

The system MUST serialize installation commits across threads and processes. It
MUST completely write, verify, and flush the payload in a unique
`.staging/<random-id>`, then MUST atomically move it to the committed digest
directory on the same Host-owned filesystem. The system may persist and publish
the Plugin Manager record only after the committed payload exists, and may
return `installed` only after record persistence and in-memory publication
succeed. The system MUST NOT publish a registration that points to staging or a
missing path.

#### Scenario: Installation succeeds completely

- **WHEN** staging write, verification, flush, committed rename, and Plugin
  Manager registration all succeed
- **THEN** the Host publishes a new registration revision and sends the existing
  registration changed invalidation event
- **THEN** existing registration consumers can observe the plugin after a full
  refresh without restarting

#### Scenario: Staging fails

- **WHEN** staging creation, file writing, checksum verification, or flushing
  fails
- **THEN** installation returns a stable safe error and attempts to delete that
  request's staging directory
- **THEN** the committed payload, Plugin Manager state, revision, and event
  remain unchanged

#### Scenario: Plugin Manager persistence fails

- **WHEN** the payload has been atomically moved to its committed digest
  directory but the Plugin Manager record cannot be persisted
- **THEN** installation publishes neither an in-memory registration nor a
  success result and immediately attempts to delete that payload
- **THEN** a directory that cannot be deleted immediately is not considered an
  installed plugin and becomes an orphan candidate in later safe recovery

#### Scenario: Changed event delivery fails

- **WHEN** the Plugin Manager record, in-memory registration, and revision have
  been published successfully but the changed event cannot be sent
- **THEN** the committed installation remains successful and is not rolled back
- **THEN** Registration Contract listener recovery or a Launcher activation
  full refresh can converge on the current record

#### Scenario: Another installation commit is in progress

- **WHEN** the current process or another lensX process holds the exclusive
  installation lock
- **THEN** a concurrent installation returns a stable busy result or waits in
  the defined bounded serial order
- **THEN** it does not clean, overwrite, or register another request's
  staging or payload

### Requirement: First installation must reject an existing healthy or quarantined identity

The system MUST treat any healthy registration with the same `plugin_id`, or
the corresponding quarantined record key, as an existing identity and MUST
return a stable `already_installed` or `identity_quarantined` error. First
installation MUST NOT infer upgrade, downgrade, reinstall, or quarantine repair
from the Manifest version and MUST NOT overwrite the current record, payload,
grants, or diagnostic evidence.

#### Scenario: Exact same package is selected again

- **WHEN** the user selects the same `.lxp` for the currently installed plugin
  again
- **THEN** installation deterministically rejects the duplicate identity
- **THEN** the current payload, record, revision, grants, and event remain
  unchanged

#### Scenario: Same plugin ID has a different version or digest

- **WHEN** the user selects a package with the same `plugin_id` as a current
  healthy registration but a different version or digest
- **THEN** first installation deterministically rejects the request without
  classifying it as an upgrade, downgrade, or reinstall
- **THEN** the current installation remains intact and no sibling payload is
  created

#### Scenario: Same identity is quarantined

- **WHEN** the package Manifest's `plugin_id` corresponds to an existing
  quarantined record key
- **THEN** first installation refuses to replace or clear quarantine silently
- **THEN** the damaged record and any associated payload evidence are preserved

### Requirement: Startup recovery must clean deterministic residue and handle ambiguous ownership conservatively

After Plugin Manager record recovery completes, the installer MUST inspect its
root while holding the exclusive installation lock. It MUST remove incomplete
staging entries that satisfy installer naming constraints and MUST delete as an
orphan only a structurally valid digest directory inside the packages root that
is neither referenced by any healthy installation path nor owned by a
quarantined plugin key. Recovery MUST NOT follow links, delete a path outside
the root, delete a healthy payload, delete a quarantined subtree, or guess
ownership of an abnormal entry. Cleanup failure MUST NOT panic application
startup, but MUST stop the installer from accepting a new installation that it
cannot commit safely and expose a bounded safe diagnostic.

#### Scenario: Previous process crashed in staging

- **WHEN** startup finds a residual `.staging/<random-id>` that meets installer
  constraints and no other process holds the installation lock
- **THEN** recovery removes the uncommitted staging directory
- **THEN** it creates no Plugin Manager record, revision, or event

#### Scenario: Committed payload became an orphan before record commit

- **WHEN** the packages tree contains a canonical plugin-key/digest directory
  that no healthy record references and no corresponding quarantine key owns
- **THEN** recovery removes it as a deterministic orphan
- **THEN** other healthy and quarantined plugin subtrees remain unchanged

#### Scenario: Quarantined identity may own a payload

- **WHEN** Plugin Manager recovery creates a quarantine stub for a record key
  and the packages tree contains the same plugin-key subtree
- **THEN** the installer preserves the whole subtree instead of deleting it
  because no healthy installation path is available
- **THEN** recovery reporting and a future explicit repair capability can still
  use that evidence

#### Scenario: Record or directory points outside the installation root

- **WHEN** a historical, test, or damaged record contains an installation path
  outside the root, or the packages tree contains a link or abnormal entry
- **THEN** the installer does not follow, migrate, or delete the external or
  ambiguously owned content
- **THEN** the application continues starting and reports installer degraded
  state through a safe diagnostic without an absolute path or raw error

### Requirement: The installation command contract must be strict, private, and minimally disclosing

The local installation boundary MUST use an independently versioned Host-private
strict contract `0.2.0` with separate `prepare`, `commit`, and `cancel`
operations, and every result, cancellation, and error payload MUST carry that
version and exact operation. This version MUST evolve independently from the
Manifest, package protocol, Registration Contract, Plugin Manager Store,
permission contract, and application version. Rust and TypeScript MUST reject
an unknown contract version, unknown field, unknown variant, invalid value, or
cross-operation payload.

`prepare` success MUST distinguish `cancelled | prepared`. `prepared` MUST
contain one process-local opaque token and only a bounded safe candidate
projection needed by the trusted Host UI: plugin ID, Manifest version,
normalized localized display name, Publisher display facts, and requested
permission IDs with bounded localized reasons. It MUST NOT contain a path,
digest, package bytes, staging fact, complete Manifest, grant, source authority,
raw exception, stack, environment text, file content, Rust/Tauri object, or
public plugin type. `commit` MUST accept only the current opaque token and
return `installed` with plugin ID, Manifest version, and Registration revision.
`cancel` MUST invalidate the current token and report a strict
cancelled/unchanged conclusion without creating Registration facts. Failure
MUST use a finite code, operation, and stable safe message and MAY reuse logical
package diagnostics.

The old select-and-immediately-install production operation MUST NOT remain as
a trusted UI bypass. Each process MUST hold at most one preparation; a new
prepare, explicit cancel, failed commit, service destruction, or process restart
MUST invalidate the old token and make a best effort to clean its staging.
Commit MUST reuse the exact inspected/staged candidate and MUST NOT reopen the
user-selected source path. Before durable commit it MUST revalidate the token,
staging, package facts, current Host compatibility, and that the candidate
identity is still absent and not quarantined.

#### Scenario: Frontend receives a prepared candidate

- **WHEN** Rust completes inspection and staging for a valid compatible
  first-install candidate
- **THEN** the TypeScript adapter validates and freezes the `prepared` contract
  version, operation, opaque token, and bounded display projection from
  `unknown`
- **THEN** the result contains no path, digest, package bytes, staging fact,
  complete Manifest, grant, raw error, or private Host object, and no
  Registration has been created

#### Scenario: Frontend commits the current preparation

- **WHEN** the trusted management service submits the one current token and
  Rust revalidation plus durable installation succeeds
- **THEN** the adapter returns a strict `installed` result with plugin ID,
  version, and Registration revision
- **THEN** the Registration is created with the existing explicit Host facts
  and empty grant snapshot, and the token can never be committed again

#### Scenario: Frontend cancels a preparation

- **WHEN** the user cancels after `prepared` or the trusted service is destroyed
  before commit
- **THEN** the Host invalidates the token, makes a best effort to clean only its
  owned staging, and returns a strict cancellation conclusion
- **THEN** no payload, Manager record, revision, event, or grant is committed

#### Scenario: Preparation becomes invalid before commit

- **WHEN** the same plugin identity is installed or quarantined, the token is
  stale, staging changes, or package/compatibility revalidation fails before
  commit
- **THEN** commit fails closed with a stable safe error and invalidates the
  preparation
- **THEN** the competing/current Registration, filesystem evidence, grants,
  revision, and event remain unchanged

#### Scenario: Frontend receives a malformed payload

- **WHEN** Tauri returns an unknown status, operation mismatch, unknown field,
  invalid token/candidate value, invalid error type, or malformed error
- **THEN** the adapter rejects the entire value and produces a stable boundary
  error
- **THEN** the UI does not publish partial preparation/success or display raw
  untrusted text

#### Scenario: Low-level error contains sensitive information

- **WHEN** a dialog, read, codec, filesystem, staging, cleanup, or persistence
  error contains an absolute path, environment text, package content, or raw
  exception
- **THEN** the Rust boundary maps it to a stable safe code, operation, and
  message
- **THEN** sensitive content does not enter the Tauri payload, log assertions,
  UI, or shared fixtures

### Requirement: The settings installation entry point must be accessible, localized, and theme-compatible

The Plugins settings section MUST use the existing application i18n and Semi
Design theme to provide installation guidance, a clearly named accessible
installation button, an explicit prepared-candidate confirmation, and
asynchronous feedback. While prepare, confirm, commit, cancellation,
Registration convergence, or composed post-commit permission work is pending,
the UI MUST prevent incompatible reentry. Native picker cancellation MUST
restore idle state without an error; cancelling a prepared candidate MUST invoke
the typed cancel boundary and return focus to the installation entry point;
success and failure MUST use live-status or alert semantics that do not rely
only on color.

The confirmation MUST display bounded candidate name/version and compose the
independently specified permission-prompt presentation before durable commit.
It MUST allow installation with zero grants and MUST NOT treat the installation
confirmation itself as permission authorization. All product text MUST have
canonical English and a semantically aligned Simplified Chinese translation
and MUST remain readable, scrollable, and focusable in light and dark themes.
When composed into `plugin-management-settings`, successful installation MUST
converge through a current Registration snapshot, perform any separately
confirmed grants only through the permission service, and select the newly
installed plugin using current detail.

#### Scenario: User prepares installation with a keyboard

- **WHEN** a keyboard user focuses and activates the local installation button
  and selects a compatible package
- **THEN** the native file picker opens once, the button cannot be activated
  again while prepare is pending, and an accessible confirmation opens only
  after a strict `prepared` result
- **THEN** confirmation, cancellation, and focus remain operable without a
  pointer and no durable Registration exists before explicit install
  confirmation

#### Scenario: User cancels prepared installation

- **WHEN** the user cancels or dismisses a prepared candidate before commit
- **THEN** the management service cancels the opaque preparation, clears
  transient permission choices, and announces cancellation without an error
- **THEN** focus returns to the installation entry point and no plugin or grant
  appears in current Registration state

#### Scenario: Installation succeeds in plugin management settings

- **WHEN** the adapter returns a valid `installed` result after explicit
  candidate confirmation
- **THEN** settings announces durable installation success with the plugin ID
  and version in the current locale
- **THEN** the management service refreshes through the shared Registration
  adapter, applies only separately confirmed grants through the independent
  permission service, and selects the matching current plugin only after
  snapshot/detail convergence
- **THEN** the installation capability itself does not fabricate details or
  perform enable, disable, replacement, uninstall, permission or data operations

#### Scenario: Installation or preparation fails

- **WHEN** the adapter returns a valid safe prepare/commit/cancel error or
  boundary validation fails
- **THEN** settings closes or preserves the interaction only as allowed by the
  typed result, displays localized actionable feedback, and allows a safe retry
  from a new preparation
- **THEN** the UI displays no source path, Host installation path, digest,
  staging fact, stack, package payload, or raw error text

#### Scenario: Locale and theme change

- **WHEN** the installation entry point and prepared confirmation render in
  `en-US` or `zh-CN` with a light or dark theme
- **THEN** button, candidate facts, permission guidance, pending, cancellation,
  success, partial-permission, and failure copy follows the application locale
- **THEN** controls use supported Semi theme and focus behavior and do not use
  hard-coded color as the only status signal

### Requirement: Local installation must not deliver later plugin capabilities early

This capability MUST deliver only preparation and first installation of a local
compatible `.lxp`, its installation entry point, Registration notification,
and recovery cleanup. It MUST NOT itself download a remote package, accept a
development directory, upgrade, downgrade, reinstall, enable, disable,
uninstall, delete or clear plugin data, grant permissions, verify signatures or
official provenance, serve plugin resources, create an iframe or Runtime
session, invoke the Host API, or execute plugin code. A trusted Host management
page MAY compose this prepared installation entry point with independently
specified lifecycle, replacement, permission-prompt, permission-mutation, and
data-management services, but MUST NOT broaden the installation command, pass
a grant set into commit, or infer those authorities from preparation or
installation success.

#### Scenario: A plugin finishes installation

- **WHEN** a local `.lxp` has been written and registered successfully
- **THEN** the existing Host metadata projection and management service can
  refresh from the current Registration and separately apply user-confirmed
  grants through the permission authority
- **THEN** this capability does not read the Runtime entry, load resources,
  create an iframe, execute code, grant requested permissions, or perform a
  later lifecycle operation

#### Scenario: User wants to replace, remove, or change permissions for an installed plugin

- **WHEN** the user selects replacement, lifecycle, or permission controls from
  the composed plugin management page
- **THEN** the replacement service, lifecycle service, or permission service
  owns the operation through its independent typed and revision-bound contract
- **THEN** the local installation command neither accepts the request nor gains
  update, uninstall, permission or data-management authority

### Requirement: Installer-owned program, data, and cleanup roots must remain separated

The Host-owned `app_local_data_dir()/plugins` root MUST keep program payloads,
plugin-private data, and lifecycle cleanup evidence separate. Program payloads
MUST continue to use `packages/<plugin-key>/<package-sha256>`, the data boundary
MUST use `data/<plugin-key>`, and each cleanup record MUST reside in a separate
restricted root and be unique to a safe plugin identity. First installation
MUST NOT create an empty data directory merely to establish that boundary. An
author Manifest, React caller, public plugin package, or Runtime MUST NOT
provide or receive a real root, plugin key, digest path, or cleanup path.

#### Scenario: First installation has no existing plugin data

- **WHEN** a compatible `.lxp` completes an ordinary first installation
- **THEN** its payload is committed to the existing digest path and the Manager
  installation path remains the only active payload pointer
- **THEN** the installer does not create an empty `data/<plugin-key>` directory
  or expose any real path to the frontend

#### Scenario: Data is retained after a lifecycle operation

- **WHEN** the same plugin identity has been logically uninstalled while
  `retain_data` preserves its canonical data subtree
- **THEN** the program payload, data subtree, and cleanup evidence retain
  separate ownership
- **THEN** orphan-package recovery does not treat retained data as a package
  orphan and delete it

### Requirement: Installation and lifecycle commits must share one serialization boundary

Plugin installation, enabled and uninstall commits, cleanup recovery, and
reinstallation of the same identity MUST share the existing in-process mutex
and cross-process installer lock, or an equivalent single serialization
boundary. Code holding the lock MUST reread Manager, cleanup, and canonical
filesystem facts before mutation and MUST NOT rely on stale preflight results
obtained outside the lock. Concurrent requests MUST wait in a defined bounded
order or return a stable busy or conflict result, and MUST NOT clean or
overwrite another request's staging area, payload, data, or cleanup record.

#### Scenario: Installation races with uninstall

- **WHEN** one process is committing an uninstall for a plugin identity while
  another process requests installation
- **THEN** the operations cannot modify the Manager, package subtree, or
  cleanup record concurrently
- **THEN** the request that acquires the lock later revalidates against the
  earlier committed result instead of continuing from an outside-lock
  conclusion

#### Scenario: Concurrent requests target different plugins

- **WHEN** lifecycle or installation requests for multiple plugins contend for
  the shared commit boundary
- **THEN** the requests complete in a safe serial order or receive a stable
  busy result
- **THEN** cleanup for one plugin neither reads, deletes, nor blocks content
  outside the canonical subtree owned by that plugin

### Requirement: Startup recovery must reconcile lifecycle cleanup before accepting new writes

After Plugin Manager recovery and before accepting new installation or
lifecycle writes, the Host MUST read and strictly validate versioned cleanup
records while holding the shared lock. When the Manager no longer contains the
target entry, recovery MAY delete only the canonical package subtree whose
ownership the cleanup record proves and MAY delete the canonical data subtree
only for `delete_data`. When the Manager still contains the target healthy or
quarantine entry, recovery MUST preserve its active evidence and MUST NOT let
cleanup leave a missing payload. A damaged record, symbolic link, abnormal
name, root escape, or ambiguous ownership MUST be preserved and produce a
bounded degraded diagnostic.

#### Scenario: Restart recovers pending program cleanup

- **WHEN** the previous uninstall removed the Manager entry but the process
  exited before deleting the canonical package subtree
- **THEN** startup recovery completes package cleanup while holding the lock
  and updates the cleanup conclusion
- **THEN** recovery does not recreate a registration, increment a fabricated
  revision, or touch retained data

#### Scenario: Restart recovers delete-data intent

- **WHEN** a cleanup record explicitly stores `delete_data` and the Manager no
  longer contains the target entry
- **THEN** recovery deletes only that canonical data subtree until the cleanup
  conclusion is complete
- **THEN** recovery cannot downgrade the policy to retain data or delete data
  owned by another plugin key

#### Scenario: Pending cleanup conflicts with a healthy record

- **WHEN** the identity referenced by a cleanup record currently has a healthy
  or quarantine Manager entry
- **THEN** recovery preserves the active or quarantine package and data
  evidence and records a safe conflict
- **THEN** the Host rejects writes that could overwrite the evidence until
  trusted recovery resolves the conflict

### Requirement: Reinstallation after lifecycle removal must preserve data policy and reset Host grants

A later successful installation of the same identity MUST clear an old
completed cleanup record only after there is no pending cleanup conflict and
both package commit and Manager registration have succeeded. A data subtree
left by `retain_data` MUST remain unchanged. Grants, diagnostics, and enabled
intent from the previous Manager record MUST NOT be restored from a cleanup
record or retained data. The new installation MUST continue to follow the
current first-install rules: `enabled=true`, empty grants, and an `inactive`
Runtime. The revision or operation identity of an old uninstall request MUST
NOT delete the new payload.

#### Scenario: Reinstallation follows retained-data uninstall

- **WHEN** an old uninstall of the same plugin identity has completed, its data
  was retained, and a new compatible package installs successfully
- **THEN** the new Manager record points to the new canonical payload with an
  empty grant snapshot and enabled intent set to true
- **THEN** the retained data remains in place and the completed cleanup record
  is cleared only after the new registration succeeds

#### Scenario: Reinstallation is attempted while cleanup is pending

- **WHEN** the old identity still has incomplete or conflicting cleanup
  evidence
- **THEN** the installer returns a stable cleanup-pending or busy result and
  creates neither staging nor a new Manager record
- **THEN** the old intent is completed or resolved by trusted recovery before
  any new installation can prevent an old retry from deleting a new payload
