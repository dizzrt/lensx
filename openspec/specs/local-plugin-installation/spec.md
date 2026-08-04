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

The local installation command MUST use an independently versioned Host-private
strict contract `0.1.0`, and success, cancellation, and error payloads MUST
carry that version. This version MUST evolve independently from the Manifest,
package protocol, Registration Contract, Plugin Manager Store, and application
version. Success MUST distinguish only `cancelled | installed`, with
`installed` containing at least plugin ID, Manifest version, and registration
revision. Failure MUST use a finite code, operation, and stable safe message and
may reuse logical package diagnostics. Every Rust and TypeScript boundary MUST
reject an unknown contract version, unknown field, unknown variant, or invalid
value. The contract MUST NOT expose a source, staging, or committed absolute
path, package digest, raw exception, stack, environment text, or file content,
and MUST NOT enter any public plugin package.

#### Scenario: Frontend receives a success result

- **WHEN** Rust completes installation and returns `installed`
- **THEN** the TypeScript adapter validates and freezes the contract version,
  plugin ID, version, and revision from `unknown`
- **THEN** the result contains no path, digest, Manifest payload, grant, or
  private Rust or Tauri object

#### Scenario: Frontend receives a malformed payload

- **WHEN** Tauri returns an unknown status, unknown field, invalid error type,
  or malformed error
- **THEN** the adapter rejects the entire value and produces a stable boundary
  error
- **THEN** the UI does not publish partial success or display raw untrusted text

#### Scenario: Low-level error contains sensitive information

- **WHEN** a dialog, read, codec, filesystem, or persistence error contains an
  absolute path, environment text, or raw exception
- **THEN** the Rust boundary maps it to a stable safe code, operation, and
  message
- **THEN** sensitive content does not enter the Tauri payload, log assertions,
  UI, or shared fixtures

### Requirement: The settings installation entry point must be accessible, localized, and theme-compatible

The Plugins settings section MUST use the existing application i18n and Semi
Design theme to provide installation guidance, a clearly named accessible
installation button, and asynchronous feedback. While installation is pending,
the UI MUST prevent reentry; cancellation MUST restore idle state without
showing an error; and success and failure MUST use live-status or alert
semantics that do not rely only on color. All product text MUST have canonical
English and a semantically aligned Simplified Chinese translation and MUST
remain readable and focusable in light and dark themes.

#### Scenario: User installs with a keyboard

- **WHEN** a keyboard user focuses and activates the local installation button
- **THEN** the native file picker opens and the button cannot be activated again
  while the request is pending
- **THEN** focus and status feedback remain operable and perceivable after the
  dialog returns

#### Scenario: Installation succeeds

- **WHEN** the adapter returns a valid `installed` result
- **THEN** settings announces success with the plugin ID and version in the
  current locale
- **THEN** the page does not consequently display a plugin list, details, or
  enable, disable, or uninstall controls outside this change's scope

#### Scenario: Installation fails

- **WHEN** the adapter returns a valid safe error or boundary validation fails
- **THEN** settings displays the corresponding localized failure feedback and
  allows another selection
- **THEN** the UI displays no source path, Host installation path, digest,
  stack, or raw error text

#### Scenario: Locale and theme change

- **WHEN** the installation entry point renders in `en-US` or `zh-CN` with a
  light or dark theme
- **THEN** button, guidance, pending, success, and failure copy follows the
  application locale
- **THEN** controls use supported Semi theme and focus behavior and do not use
  hard-coded color as the only status signal

### Requirement: Local installation must not deliver later plugin capabilities early

This capability MUST deliver only first installation of a local compatible
`.lxp`, its minimal entry point, registration notification, and recovery
cleanup. It MUST NOT download a remote package, accept a development directory,
upgrade, downgrade, reinstall, enable, disable, uninstall, delete plugin data,
grant permissions, verify signatures or official provenance, serve plugin
resources, create an iframe or Runtime session, invoke the Host API, or execute
plugin code.

#### Scenario: A plugin finishes installation

- **WHEN** a local `.lxp` has been written and registered successfully
- **THEN** the existing Host metadata projection can refresh Action and Page
  descriptors from the current registration
- **THEN** this change does not read the Runtime entry, load resources, create
  an iframe, execute code, or grant requested permissions

#### Scenario: User wants to replace or remove an installed plugin

- **WHEN** the user attempts to install another version through this capability
  or looks for disable or uninstall actions
- **THEN** installation of another version is rejected deterministically and
  settings provides no later lifecycle controls
- **THEN** Task 3.4 owns upgrade and rollback, Task 3.3 owns enable, disable, and
  uninstall, and Task 6.1 owns the complete management UI
