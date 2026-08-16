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

When first registering a compatible package, the Host MUST use the normalized Manifest and package digest returned by the inspector, inject the committed installation path, `source=external`, and `enabled=true`, and keep the Runtime `inactive`. The current registration MUST NOT create a grant snapshot, permission state, signature, or trust. Manifest Publisher data, remote behavior, and installation confirmation MUST NOT change source, enabled state, provenance, or Host authority.

#### Scenario: Install an open Web plugin
- **WHEN** a compatible Manifest `0.2.0` plugin declares ordinary Pages and Actions and completes first installation
- **THEN** the Manager record stores explicit installation facts and the Runtime remains `inactive`
- **THEN** installation does not execute plugin code, create a grant, or review future Worker or network behavior

#### Scenario: Publisher claims an official identity
- **WHEN** a local package's Publisher text claims an official lensX identity
- **THEN** the Host still records `source=external`
- **THEN** installation creates no verified, signed, official, or additional Host authority

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

The system MUST treat a healthy registration with the same `plugin_id`, or the corresponding quarantined or incompatible record key, as an existing identity and return stable `already_installed` or `identity_quarantined` results. First installation MUST NOT infer an upgrade, downgrade, reinstallation, or repair, and MUST NOT overwrite the current record, payload, data, or diagnostic evidence.

#### Scenario: The same package is selected again
- **WHEN** the user selects the same `.lxp` as the currently installed plugin
- **THEN** installation deterministically rejects the duplicate identity
- **THEN** the current payload, record, revision, data, and event remain unchanged

#### Scenario: The same ID has a different version
- **WHEN** the candidate has the same plugin ID but a different version or digest
- **THEN** first installation rejects it and directs the user to the replacement flow
- **THEN** no permission or grant migration or implicit trust change occurs

#### Scenario: Same identity is quarantined

- **WHEN** the package Manifest's `plugin_id` corresponds to an existing quarantined record key
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

The local installation boundary MUST use an independent, Host-private, strict contract `0.3.0` with separate `prepare`, `commit`, and `cancel` operations. A `prepared` result MUST contain only an opaque token and the bounded candidate identity, Manifest version, localized display name, and Publisher display facts required by trusted confirmation UI. It MUST NOT contain permission candidates or reasons, grants, paths, digests, package bytes, staging facts, the complete Manifest, source authority, raw errors, or Host objects. `commit` MUST accept only the current token and return the installed identity, version, and revision.

Every result, cancellation, and error payload MUST carry the exact contract version and operation. The version MUST evolve independently from the Manifest, package protocol, Registration Contract, Plugin Manager Store, and application version. Rust and TypeScript MUST reject an unknown contract version, unknown field, unknown variant, invalid value, or cross-operation payload. `prepare` MUST distinguish `cancelled | prepared`; `cancel` MUST invalidate the current token without creating Registration facts; and failures MUST use finite codes, operations, and stable safe messages.

The former select-and-immediately-install production operation MUST NOT remain as a trusted UI bypass. Each process MUST hold at most one preparation. A new prepare, explicit cancel, failed commit, service destruction, or process restart MUST invalidate the old token and make a best effort to clean its owned staging. Commit MUST reuse the exact inspected candidate without reopening the user-selected source path and MUST revalidate the token, staging, package facts, compatibility, and identity absence before durable commit.

#### Scenario: Frontend receives a prepared candidate
- **WHEN** Rust completes inspection and staging of a valid compatible candidate
- **THEN** the adapter strictly validates the `0.3.0` prepared payload and bounded display facts
- **THEN** the payload contains no permission selection, grant, path, digest, bytes, or private object

#### Scenario: Commit succeeds
- **WHEN** the trusted management service commits the current token and durable installation succeeds
- **THEN** the Host creates a current Registration with no grant fields and makes the token single-use
- **THEN** subsequent plugin selection converges only through the complete Registration

#### Scenario: Legacy permission candidate appears
- **WHEN** a boundary payload contains a requested permission, reason, selection, or post-commit grant intent
- **THEN** the strict Rust or TypeScript parser rejects the entire payload
- **THEN** no Registration, revision, or permission authority is created

#### Scenario: Frontend cancels a preparation

- **WHEN** the user cancels after `prepared` or the trusted service is destroyed before commit
- **THEN** the Host invalidates the token, makes a best effort to clean only its owned staging, and returns a strict cancellation conclusion
- **THEN** no payload, Manager record, revision, or event is committed

#### Scenario: Preparation becomes invalid before commit

- **WHEN** the same plugin identity is installed or quarantined, the token is stale, staging changes, or package or compatibility revalidation fails before commit
- **THEN** commit fails closed with a stable safe error and invalidates the preparation
- **THEN** the competing or current Registration, filesystem evidence, revision, and event remain unchanged

#### Scenario: Frontend receives a malformed payload

- **WHEN** Tauri returns an unknown status, operation mismatch, unknown field, invalid token or candidate value, invalid error type, or malformed error
- **THEN** the adapter rejects the entire value and produces a stable boundary error
- **THEN** the UI publishes no partial preparation or success and displays no raw untrusted text

#### Scenario: Low-level error contains sensitive information

- **WHEN** a dialog, read, codec, filesystem, staging, cleanup, or persistence error contains an absolute path, environment text, package content, or raw exception
- **THEN** the Rust boundary maps it to a stable safe code, operation, and message
- **THEN** sensitive content does not enter the Tauri payload, log assertions, UI, or shared fixtures

### Requirement: The settings installation entry point must be accessible, localized, and theme-compatible

Plugins Settings MUST use the existing internationalization and Semi Design theme systems to provide installation guidance, an accessible entry point, prepared-candidate confirmation, and asynchronous feedback. Confirmation MUST explain that installation trusts the plugin to process data the user gives it inside an isolated Web Runtime, while lensX does not individually authorize or endorse its Worker, network, or remote-resource behavior. The UI MUST NOT display a permission checklist, grant state, partial-grant feedback, or post-commit permission work.

The interface MUST prevent incompatible reentry while prepare, confirm, commit, cancel, or Registration-convergence work is pending. All copy MUST have canonical English and semantically aligned Chinese versions and remain usable in light and dark themes, the fixed viewport, keyboard operation, and focus recovery.

Native picker cancellation MUST restore idle state without an error. Success and failure MUST use live-status or alert semantics that do not rely only on color, and the prepared confirmation MUST remain readable, scrollable, and focusable at the fixed viewport.

#### Scenario: Keyboard user confirms installation
- **WHEN** a keyboard user selects a valid package and opens confirmation
- **THEN** the dialog shows bounded identity, version, Publisher, and installation-trust guidance and is fully keyboard operable
- **THEN** no durable Registration is created before explicit installation confirmation

#### Scenario: User cancels preparation
- **WHEN** the user cancels or closes confirmation before commit
- **THEN** the Host cancels the opaque preparation, cleans owned staging, and restores focus deterministically
- **THEN** no Registration, grant, permission decision, or error notice remains

#### Scenario: Locale and theme change
- **WHEN** the installation entry renders in `en-US` or `zh-CN` and in light or dark theme
- **THEN** trust guidance and pending, cancel, success, and failure copy follow the locale and theme
- **THEN** no legacy permission guidance, selection, or partial-grant copy appears

#### Scenario: Installation succeeds in plugin management settings

- **WHEN** the adapter returns a valid `installed` result after explicit candidate confirmation
- **THEN** settings announces durable installation success with the plugin ID and version in the current locale
- **THEN** the management service refreshes through the shared Registration adapter and selects the matching current plugin only after snapshot and detail convergence
- **THEN** the installation capability does not fabricate details or perform enable, disable, replacement, uninstall, permission, or data operations

#### Scenario: Installation or preparation fails

- **WHEN** the adapter returns a valid safe prepare, commit, or cancel error or boundary validation fails
- **THEN** settings closes or preserves the interaction only as allowed by the typed result, displays localized actionable feedback, and allows a safe retry from a new preparation
- **THEN** the UI displays no source path, Host installation path, digest, staging fact, stack, package payload, or raw error text

### Requirement: Local installation must not deliver later plugin capabilities early

This capability MUST deliver only preparation and first installation of a local compatible `.lxp`, its entry point, Registration notification, and recovery cleanup. It MUST NOT download a remote package, execute a plugin, create a Runtime, expose a Tauri or native capability, replace or uninstall a plugin, or implement a Marketplace. A trusted management page MAY compose independent lifecycle, replacement, and data services, but MUST NOT compose a permission service, pass grants into commit, or interpret successful installation as native Host authority.

It also MUST NOT accept a development directory, upgrade or downgrade, enable or disable a plugin, delete or clear plugin data, verify signatures or official provenance, serve plugin resources, create an iframe or Runtime Session, or invoke the Host API.

#### Scenario: Plugin finishes installation
- **WHEN** a local `.lxp` is written and registered successfully
- **THEN** the management service converges from the current Registration and the user can explicitly open the plugin
- **THEN** the installer does not read the Runtime entry, execute code, or create a permission, grant, or native provider

#### Scenario: User wants another management operation
- **WHEN** the user chooses replacement, lifecycle, or data control
- **THEN** the corresponding independent typed service owns that operation
- **THEN** the local installation command gains no update, uninstall, permission, or data authority

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

### Requirement: Reinstallation after lifecycle removal must preserve data policy without restoring removed authority

A later successful installation of the same identity MUST clear an old completed-cleanup record only after there is no pending cleanup conflict and both package commit and Manager registration succeed. Data left by `retain_data` MUST remain. Grants, diagnostics, enabled intent, or permission facts in old records, cleanup state, or retained data MUST NOT be restored. The new installation MUST use the current Manifest `0.2.0`, `enabled=true`, and an `inactive` Runtime.

#### Scenario: Retained-data identity is reinstalled
- **WHEN** a previous uninstall completed while retaining data and a new compatible `0.2.0` package installs successfully
- **THEN** the new record points to the new canonical payload and retained data remains
- **THEN** old permission or grant facts do not enter the new record or Runtime

### Requirement: Installation MUST commit only Child-WebView-compatible registrations
Preparation MUST classify the immutable package with the current Contract and MUST reject Manifest `0.2.x`, `runtime.kind: "iframe"` and other unsupported Runtime protocols before staging or registration publication. A committed registration MUST contain only normalized public WebView Runtime facts; native labels, bridge configuration, origin tokens, WebView handles and Tauri permissions MUST remain absent.

#### Scenario: User selects a current package
- **WHEN** a valid `0.3.0` WebView `.lxp` passes all existing package and first-install checks
- **THEN** installation may atomically commit a registration consumable by the Child WebView Runtime

#### Scenario: User selects a legacy iframe package
- **WHEN** the archive is safe but its Manifest protocol is obsolete
- **THEN** installation reports incompatible plugin without committing payload or registration authority

