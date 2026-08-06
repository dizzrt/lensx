## ADDED Requirements

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
