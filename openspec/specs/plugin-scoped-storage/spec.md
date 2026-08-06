# Plugin Scoped Storage Specification

## Purpose

Define Host-owned persistent key-value storage for each plugin identity, with
trusted namespace derivation, deterministic limits, durable writes, lifecycle
coordination, corruption isolation, and unchanged public Host API `0.1.0`
semantics.

## Requirements

### Requirement: Plugin storage MUST derive one private namespace from trusted current identity

The system MUST derive a plugin storage namespace only from the Host-owned
identity of an authenticated Runtime Session and MUST revalidate the current
Plugin Manager record for every Host-private storage operation. A public
request, plugin code, Manifest, SDK, or wire payload MUST NOT select or override
a plugin ID, plugin key, namespace, real path, Registration, provider, or Tauri
command.

Rust MUST use the Installer's canonical v1 plugin-key derivation and constrain
the namespace to a real, non-symlink subtree under
`app_local_data_dir()/plugins/data/<plugin-key>`. Host application preferences,
program payloads, cleanup evidence, other plugin namespaces, and browser-origin
storage MUST remain inaccessible.

#### Scenario: Two plugins write the same key

- **WHEN** current plugins A and B each call `storage.set` with the same key and
  different values
- **THEN** each call modifies only the namespace derived from its own trusted
  Session identity
- **THEN** a later `storage.get` returns only the calling plugin's value and
  does not reveal whether another namespace contains the same key

#### Scenario: Plugin attempts to select another namespace

- **WHEN** a request, private frame, or call parameter includes a plugin ID,
  namespace, path, entry ID, Registration revision, provider, or Host object
- **THEN** the exact Contract or Host-private boundary rejects the value with
  stable `invalid_params` or a controlled boundary error
- **THEN** Rust does not resolve, create, read, modify, or delete the selected
  target

#### Scenario: Session identity is no longer available

- **WHEN** an operation reaches the Rust serialization boundary after its live
  Manager record was removed, disabled, mismatched, or blocked by lifecycle
  cleanup
- **THEN** the operation returns stable `unavailable` without creating or
  modifying the data subtree
- **THEN** an old Session cannot regain write authority after disable,
  uninstall, or identity replacement

### Requirement: Storage methods MUST implement the existing Host API 0.1.0 semantics

The system MUST implement `storage.get`, `storage.set`, `storage.delete`,
`storage.list`, and `storage.get_quota` without changing the public Host API
`0.1.0` payloads. Inputs and values MUST pass existing Contract validation, and
Rust MUST again reject unknown fields, invalid keys, non-JSON values, and
payloads that do not match the Host-private contract version.

`storage.get` MUST distinguish `{ found: false }` from
`{ found: true, value }`; a successful `storage.set` MUST return
`{ stored: true }`; and `storage.delete` MUST accurately report whether an
existing key was deleted. A returned JSON value MUST be an independent,
Contract-valid copy of the current persisted value and MUST NOT contain a Rust,
Tauri, DOM, or Host object.

#### Scenario: JSON value survives a restart

- **WHEN** a current plugin successfully stores a Contract-valid JSON value,
  the Host exits cleanly and restarts from the same application data root, and
  a plugin with the same identity calls `storage.get`
- **THEN** `set` returns `{ stored: true }` and the post-restart `get` returns
  `{ found: true, value }`
- **THEN** the returned value is semantically equal to the committed JSON and
  contains no namespace, path, internal revision, or envelope metadata

#### Scenario: Read and delete a missing key

- **WHEN** the current namespace or target key is absent and the caller invokes
  `storage.get` and then `storage.delete`
- **THEN** the Host returns `{ found: false }` and `{ deleted: false }`
  respectively
- **THEN** neither operation creates an empty data subtree or queries or reveals
  another namespace

#### Scenario: Delete an existing key

- **WHEN** the current namespace contains a committed target key and the
  current Session calls `storage.delete`
- **THEN** the Host atomically commits a new store without that key and returns
  `{ deleted: true }`
- **THEN** a later `storage.get` returns `{ found: false }` while other keys
  remain unchanged

### Requirement: Storage limits MUST be concrete, deterministic and enforced in Rust

Version 1 storage MUST enforce these fixed limits: a Contract-valid key has
1–256 Unicode code points and no C0 or DEL control character; a JSON root has
depth 0 and maximum nesting depth 32; one value's deterministic compact JSON
UTF-8 representation is at most 262144 bytes; one namespace contains at most
1024 entries and at most 1048576 logical bytes.

Logical usage MUST equal the sum of every key's UTF-8 bytes and its compact JSON
value bytes. Rust MUST compute depth and bytes from validated candidate state
and MUST NOT trust a size reported by a plugin, SDK, or TypeScript. Replacing an
existing key MUST subtract the old entry usage before checking candidate total
usage, and failure MUST preserve the old value.

Shape, key, or cursor-format failures MUST map to `invalid_params`; depth,
single-value, entry-count, or namespace-usage violations MUST map to
`limit_exceeded`. Errors MUST NOT echo a key, value, usage breakdown, path, or
raw payload.

#### Scenario: Write remains within every limit

- **WHEN** the candidate value, depth, entry count, and replacement-adjusted
  namespace logical usage are within the v1 limits
- **THEN** `storage.set` atomically commits the candidate and returns
  `{ stored: true }`
- **THEN** `storage.get_quota.usedBytes` changes according to the same logical
  usage definition

#### Scenario: Value size or depth exceeds a limit

- **WHEN** a Contract-valid JSON value exceeds 262144 compact UTF-8 bytes or
  nesting depth 32
- **THEN** the Host returns stable `limit_exceeded` without committing a
  temporary or canonical file
- **THEN** the original key, namespace usage, and other plugin data remain
  unchanged

#### Scenario: Replacement exceeds namespace capacity

- **WHEN** replacing an existing key would make candidate namespace logical
  usage exceed 1048576 bytes
- **THEN** the Host returns stable `limit_exceeded`
- **THEN** the old value remains readable and the failed write consumes no
  quota

### Requirement: Quota and listing MUST expose only bounded logical namespace facts

`storage.get_quota` MUST return `{ usedBytes, limitBytes }` for the current
trusted namespace, where an empty namespace has `usedBytes: 0` and `limitBytes`
is always `1048576`. The result MUST NOT include physical file size, filesystem
capacity, another plugin's usage, or application-preference usage.

`storage.list` MUST return only unique keys in stable Unicode code-point order.
An omitted limit MUST default to 100, and an explicit limit MUST be within
1–1000. When another page exists, the Host MUST return an opaque continuation
cursor of at most 1024 characters. The cursor MUST be bound to the current
namespace revision and next position and MUST pass a Host-private integrity
check.

#### Scenario: List an empty namespace

- **WHEN** the current namespace is absent or empty and the caller invokes
  `storage.list` and `storage.get_quota`
- **THEN** list returns `{ keys: [] }` without `nextCursor`, and quota returns
  `{ usedBytes: 0, limitBytes: 1048576 }`
- **THEN** neither read operation creates a data subtree

#### Scenario: List keys with stable pagination

- **WHEN** the ordered keys exceed the requested or default page limit
- **THEN** each page returns only stable, ordered, non-duplicate keys and
  includes an opaque `nextCursor` while more data exists
- **THEN** the cursor can continue only the same namespace revision, and the
  result does not batch-return values or internal metadata

#### Scenario: Namespace changes during pagination

- **WHEN** a successful set or delete occurs after the caller receives a cursor
  and before it submits that cursor
- **THEN** the Host returns stable `conflict` instead of a mixed snapshot that
  may contain duplicates or omissions
- **THEN** the caller can restart at the first page without modifying the
  namespace

#### Scenario: Cursor is forged or out of bounds

- **WHEN** the cursor version, integrity, namespace binding, position, or length
  is invalid
- **THEN** the Host returns stable `invalid_params`
- **THEN** the Host does not interpret cursor content as a path, key, plugin
  identity, or another namespace

### Requirement: Durable mutations MUST use bounded canonical data and atomic replacement

Each namespace MUST use one strict version-1 canonical store containing a
monotonic namespace revision and entries in canonical order. Reads MUST reject
unknown fields, duplicate keys, non-canonical order, invalid values, incorrect
usage, unsupported versions, and content above the physical read limit.

A successful mutation MUST use a create-new temporary file, bounded write,
file flush, `sync_all`, atomic rename, and parent-directory sync within the same
canonical data subtree. The Rust atomic rename MUST be the sole durable commit
point. Validation, quota, write, or sync failure before commit MUST preserve the
old canonical store; after commit the Host MUST NOT fake rollback by deleting
the new store.

#### Scenario: Write fails before commit

- **WHEN** temporary-file creation, bounded serialization, write, flush, or
  pre-rename sync fails
- **THEN** the Host returns controlled `unavailable` or `internal_error` and the
  old canonical store remains byte-for-byte usable
- **THEN** the operation removes only its provably owned temporary file and
  does not delete an unknown file or another namespace

#### Scenario: Commit succeeds but the response becomes late

- **WHEN** atomic rename completes and the Session is then cancelled,
  disconnected, or replaced before response delivery
- **THEN** the Host preserves the durable commit and drops the late response
  without deleting the new store
- **THEN** a later current Session with the same identity can reconcile through
  `storage.get`

#### Scenario: Host exits during a mutation

- **WHEN** the process exits before or after canonical rename and restarts from
  the same root
- **THEN** recovery accepts only a complete canonical version-1 store and does
  not treat a partially written temporary file as committed data
- **THEN** the namespace presents either the old state or the complete new
  state, never a partial candidate

### Requirement: Storage and plugin lifecycle MUST share one data ownership boundary

Storage reads and writes, installation, replacement, uninstall, cleanup
recovery, and same-identity reinstall MUST share the Host-private data
coordinator and existing cross-process install serialization boundary, or a
proven equivalent single-serialization model. A storage operation MUST validate
live Manager identity inside that boundary, and lifecycle cleanup MUST continue
to delete only a canonical data subtree proven to belong to the target plugin
key.

An upgrade or compatible same-identity replacement MUST preserve the store.
Disable MUST terminate current Runtime access but retain data. An uninstall
with `retain_data` MUST retain the store and make it inaccessible without a
Registration; after a successful same-identity reinstall with no cleanup
conflict it MUST become visible again. An uninstall with `delete_data` MUST
persist the existing cleanup intent and eventually delete the entire canonical
data subtree; a call after logical uninstall MUST NOT recreate it.

#### Scenario: Read retained data after plugin upgrade

- **WHEN** a compatible replacement commits a new package generation for the
  same plugin identity and establishes a new current Session
- **THEN** replacement does not modify the independent storage store, and the
  new Session can read a value committed before upgrade
- **THEN** the old Session cannot use storage to operate on another identity or
  regain old Runtime authority

#### Scenario: Disable and re-enable a plugin

- **WHEN** a plugin is disabled, its Session terminates, and it is later enabled
  without clearing data
- **THEN** no storage call runs while disabled and the data subtree remains
  unchanged
- **THEN** the new current Session can read the value committed before disable

#### Scenario: Retain-data uninstall and reinstall

- **WHEN** uninstall completes with `retain_data` and the same identity is later
  reinstalled successfully
- **THEN** the storage provider returns `unavailable` without changing the
  retained store while no Registration exists
- **THEN** reinstall does not restore old grants or Manager facts, but a new
  current Session can read retained plugin data

#### Scenario: Delete-data uninstall races a write

- **WHEN** `storage.set` and a `delete_data` uninstall race for the same plugin
  identity
- **THEN** the shared coordinator orders them safely: the write commits before
  cleanup deletes it, or logical uninstall completes first and rejects the write
- **THEN** a late storage call cannot recreate the canonical data subtree after
  cleanup completes

### Requirement: Corruption MUST degrade only the affected namespace

The Host MUST NOT fail startup because one plugin store is absent, oversized,
malformed, non-canonical, unsupported, symlinked, or unreadable. The storage
service MUST defer bounded metadata, reads, and strict validation until the
namespace is accessed and MUST mark a proven corrupt or abnormal namespace as
degraded. It MUST NOT scan values into logs or guess, overwrite, or clear
canonical evidence.

Storage methods for a degraded namespace MUST return stable `unavailable`, and
their capabilities MUST be removed from later Context snapshots for that
identity after the Host confirms the state. The Host, application preferences,
Registration, other plugin namespaces, and non-storage Host APIs MUST continue
working. Only existing `delete_data` lifecycle cleanup may delete corrupt
evidence after proving subtree ownership.

#### Scenario: One plugin store is corrupt

- **WHEN** plugin A's canonical store fails version, shape, order, size, or
  value validation while plugin B's store is valid
- **THEN** plugin A's storage call returns stable `unavailable` and produces a
  bounded Host diagnostic without payload or path
- **THEN** the Host and plugin B continue normal startup and storage access, and
  plugin A's non-storage capabilities remain unchanged

#### Scenario: Data subtree contains a symlink or abnormal type

- **WHEN** a namespace path, canonical file, or parent evidence is a symlink,
  non-regular file, or escapes the canonical root
- **THEN** the Host preserves evidence, rejects storage access, and does not
  follow the link
- **THEN** the diagnostic omits the resolved external path and other namespaces
  remain unaffected

#### Scenario: Safely owned stale temporary file

- **WHEN** the Host finds an uncommitted temporary file matching the current
  process-owned profile in the correct real parent while the canonical store
  remains valid
- **THEN** recovery may remove that temporary file but MUST NOT promote it to a
  committed store
- **THEN** an unknown, conflicting, or unowned file is retained and causes the
  namespace to fail closed

### Requirement: Storage delivery MUST preserve public package and documentation boundaries

The public Contract, SDK, and Testkit MUST continue to expose only the existing
Host API `0.1.0` semantic methods and types. They MUST NOT export a Host-private
storage request, cursor codec, data model, path, Tauri command, provider, or
Rust error. Official and third-party plugins MUST use the same public
SDK/Contract storage boundary; official provenance MUST NOT bypass namespace or
limits.

Delivery MUST include evidence for the Rust store and command, TypeScript
adapter and provider, Dispatcher, Runtime, MessageChannel, cross-plugin
isolation, restart, fault injection, lifecycle races, and an isolated public
tarball consumer. English architecture and validation documentation and their
same-path Simplified Chinese mirrors MUST be updated. The Roadmap MUST mark only
Task 5.4 complete and MUST NOT claim Task 5.5, Task 5.6, or Milestone 5 is
complete.

This capability adds no product UI, visible copy, theme-aware component, or
interaction surface, so it MUST NOT create a placeholder settings page.
Existing accessibility, locale, and theme behavior MUST remain regression-free.

#### Scenario: External plugin uses storage through the public SDK

- **WHEN** an isolated consumer installs only the packed public Contract, SDK,
  and Testkit and calls all five storage methods through a real authenticated
  Runtime Port
- **THEN** storage produces real Host-owned effects and Contract-valid results
  or errors
- **THEN** the consumer imports no lensX application source, Tauri adapter,
  private wire, cursor codec, path, or executor

#### Scenario: Delivery claims after Task 5.4 completion

- **WHEN** focused and complete validation pass and documentation and the
  Roadmap are updated
- **THEN** the storage provider is described as delivered while clipboard,
  permission management, and general RPC limits remain undelivered
- **THEN** the Task 5.5, Task 5.6, and Milestone 5 checkboxes remain incomplete

### Requirement: Trusted Host management MUST clear a disabled plugin namespace through a private contract

The system MUST provide a versioned Host-private data-management contract that
allows only the trusted root application to clear the complete logical scoped
storage namespace of one current healthy disabled Registration. The request
MUST contain only the contract version, opaque Registration entry identity and
exact expected Registration revision. The result MUST report whether data
changed and the still-current Registration revision, and MUST NOT expose a
path, plugin key, namespace revision, entry count, quota usage, storage key,
value, payload, raw error, exception or stack.

The operation MUST reject an enabled, quarantined, missing, stale, degraded or
unprovable target with a stable bounded error. It MUST remain private to Rust,
Tauri and the lensX root application and MUST NOT become a public Host API,
Manifest permission, SDK method, Testkit behavior or iframe capability.

#### Scenario: Clear a current disabled namespace

- **WHEN** the trusted application submits a valid clear request for a current
  healthy disabled Registration whose namespace ownership is provable
- **THEN** the Host commits a canonical empty store and returns a strict result
  with `changed=true`, or returns idempotent `changed=false` when no logical
  values existed
- **THEN** the Registration, enabled intent, grants, Manifest, program payload
  and Registration revision remain unchanged

#### Scenario: Reject clearing an enabled namespace

- **WHEN** the target Registration has enabled intent or becomes enabled before
  the clear commit boundary
- **THEN** the Host returns the stable enabled-target error and preserves the
  namespace byte-for-byte
- **THEN** an active or newly current Runtime cannot race the Host into
  recreating values during the clear operation

#### Scenario: Plugin code attempts to clear a namespace

- **WHEN** a plugin, iframe, public package or Manifest attempts to invoke or
  import the data-management contract
- **THEN** the private and workspace boundaries reject access
- **THEN** no plugin can clear its own or another plugin's complete namespace
  outside the existing per-method storage authorization path

### Requirement: Namespace clear MUST share ownership, serialization and atomic durability rules

The clear operation MUST execute inside the existing Host-private data
coordinator and cross-process installation serialization boundary. Inside that
boundary it MUST revalidate the current Manager identity, expected Registration
revision, disabled intent, canonical real data root, canonical plugin namespace
and fixed store entry. It MUST use a bounded canonical empty version-1 store,
create-new temporary file, file flush, `sync_all`, atomic same-directory rename
and parent-directory sync; the rename MUST be the sole durable commit point.

A missing namespace or canonical empty store MUST be an idempotent no-op. A
corrupt fixed store MAY be replaced only when its directory, regular-file type
and ownership are still provable. Unknown entries, symlinks, root escapes or
ambiguous ownership MUST be preserved as evidence and rejected. Failure before
rename MUST preserve the previous store; failure or response loss after rename
MUST preserve the committed empty store and MUST NOT fabricate rollback.

#### Scenario: Clear fails before durable commit

- **WHEN** validation, temporary creation, serialization, write, flush or
  pre-rename sync fails
- **THEN** the Host returns a bounded safe error and the previous namespace
  remains usable byte-for-byte
- **THEN** cleanup removes only a provably owned temporary file and never an
  unknown entry or another namespace

#### Scenario: Clear commits but response delivery fails

- **WHEN** atomic rename commits the empty store and response delivery, event
  handling or frontend convergence subsequently fails
- **THEN** the Host preserves the cleared store and a later read observes the
  empty namespace
- **THEN** the UI may refresh and reconcile but cannot claim the old data was
  restored

#### Scenario: Namespace contains unsafe evidence

- **WHEN** the target namespace is symlinked, escapes the data root, contains
  an unknown entry, or cannot be associated unambiguously with the current
  plugin key
- **THEN** the Host refuses clear, retains all evidence, and returns a stable
  minimally disclosing unsafe-storage error
- **THEN** no returned or logged diagnostic reveals the path, unknown filename,
  key, value or damaged content
