# Plugin Lifecycle Controls Specification

## Purpose

Define the Host-private contract and trusted application coordination for
enabling, disabling, and uninstalling plugins, including revision safety,
surface convergence, recoverable cleanup, explicit data policy, and Launcher
effects. This capability does not provide a complete management UI, plugin
Runtime, permission decisions, upgrades, or a public plugin lifecycle API.

## Requirements

### Requirement: Lifecycle writes must use a private versioned Host contract

The system MUST provide a separately versioned Host-private Plugin Lifecycle
Contract and expose `set_plugin_enabled` and `uninstall_plugin` through strict
Tauri commands only to the trusted lensX root application. Requests, successful
results, and errors MUST be validated from `unknown` on both the Rust and
TypeScript sides. The contract MUST NOT become a public entry point importable
by an author Manifest, `@lensx/plugin-contract`, `@lensx/plugin-sdk`, the iframe
Runtime, or another plugin. The Registration Contract MUST remain separate and
read-only and MUST remain the sole fact boundary for state reads and revision
invalidation.

#### Scenario: The trusted application changes enabled intent

- **WHEN** the root application submits a valid `entry_id`,
  `expected_revision`, and enabled target through the lifecycle adapter
- **THEN** the Host validates and performs the operation through the separate
  lifecycle contract
- **THEN** plugin code, Manifests, and public packages cannot import or invoke
  the write boundary directly

#### Scenario: A lifecycle payload contains unknown or private fields

- **WHEN** a request or response omits the contract version, has an invalid
  field type or unknown field, or tries to carry a path, digest, Store key,
  function, or Host object
- **THEN** the corresponding boundary rejects the whole value with a stable,
  safe contract error
- **THEN** the Manager, Registry, filesystem, revision, and changed event remain
  unchanged

### Requirement: Lifecycle operations must enforce revision preconditions and idempotent outcomes

Every lifecycle request MUST bind an opaque `entry_id` to the current process's
`expected_revision`. Before any persistence or deletion, the Host MUST validate
both the revision and target identity. A stale request MUST return a conflict
and require a complete refresh. An operation whose enabled target is already
met MUST return `unchanged` and MUST NOT write to disk, increment the
Registration revision, or publish a changed event. Uninstall MUST use a
persistent cleanup identity to recognize retries. A request for an identity
that has already been logically uninstalled MUST return `unchanged` or continue
its pending cleanup and MUST NOT affect a later reinstallation. Concurrent
lifecycle and installation requests for the same plugin MUST be serialized.

#### Scenario: A disabled plugin is disabled again

- **WHEN** a current healthy record already has `enabled=false` and the request
  revision still matches
- **THEN** `set_plugin_enabled(false)` returns `unchanged`
- **THEN** the Manager record, revision, event, Action and Page surfaces, and
  filesystem receive no additional change

#### Scenario: The caller uses an old revision

- **WHEN** a lifecycle request's `expected_revision` differs from the current
  Registration revision
- **THEN** the Host returns a stable conflict without performing a durable state
  change or cleanup after quiescence
- **THEN** the trusted application fully refreshes and decides whether to retry
  only from the latest snapshot and detail

#### Scenario: An uninstall request is submitted repeatedly

- **WHEN** the same entry is already logically uninstalled or still has a
  matching pending cleanup record
- **THEN** the Host returns `unchanged` or resumes the same cleanup intent
  instead of creating a second uninstall transaction
- **THEN** if a new installation has cleared the old completed record and
  established a different revision, the old request cannot delete the new
  record or payload

### Requirement: Enabled intent, effective availability, compatibility, and quarantine must remain distinct

Lifecycle operations MUST persist only the enabled intent of a healthy record.
Effective availability MUST be derived from registered, enabled,
two-dimensional compatibility, and non-quarantine facts and MUST NOT become a
second persisted state. An incompatible healthy record MAY retain
`enabled=true` intent but MUST NOT project executable Actions or Pages. Enable
and disable operations MUST reject quarantine entries and MUST NOT interpret
quarantine as disabled, uninstalled, or repaired. Host source, Publisher text,
and official claims MUST NOT automatically alter enable or disable rules.

#### Scenario: The user enables a currently incompatible healthy plugin

- **WHEN** a healthy entry's enabled intent changes from false to true while
  its lensX or Host API compatibility is false
- **THEN** the Host persists enabled intent and publishes a real revision
- **THEN** effective availability remains false and the plugin's Actions and
  Pages do not enter the Registry

#### Scenario: The user tries to enable a quarantine entry

- **WHEN** the target entry is quarantine rather than a complete healthy record
- **THEN** the Host returns a stable invalid-state error without guessing its
  enabled intent or Manifest
- **THEN** quarantine evidence, payload, revision, and Registry remain
  unchanged

#### Scenario: A Publisher claims that a plugin is official

- **WHEN** Manifest Publisher text or display information claims official lensX
  identity
- **THEN** setting enabled follows the same Host-owned rules as for any other
  healthy record
- **THEN** the claim creates no lifecycle exemption, permission grant,
  signature, or trusted provenance

### Requirement: Disable and uninstall must quiesce current plugin surfaces before durable transition

Before a disable or uninstall command, the trusted `PluginLifecycleService`
MUST revoke the target provider from the same current snapshot and revision,
first as a complete Action batch and then as a complete Page batch. Page
revocation MUST use the existing Host navigation invalidation to close an
active plugin page, return Home, and restore a safe Launcher state. If either
Registry revocation fails, the service MUST NOT invoke the Rust lifecycle
command. If Rust persistence, the revision precondition, or Manager removal
fails, the service MUST completely refresh current Registration facts and
reproject from the last confirmed facts. It MUST NOT leave an enabled plugin
permanently missing its surfaces.

#### Scenario: A plugin with an open page is disabled

- **WHEN** the user disables a healthy plugin that owns the active Plugin Page
- **THEN** the trusted service first unregisters the provider's complete Action
  batch and then its complete Page batch
- **THEN** the navigation boundary closes the page and returns Home before the
  Host commits `enabled=false`

#### Scenario: Registry quiescence fails

- **WHEN** an Action or Page provider batch cannot be revoked completely
- **THEN** the service returns a bounded surface failure and does not invoke a
  lifecycle command
- **THEN** other providers remain unaffected and the target Manager record and
  revision remain unchanged

#### Scenario: Manager persistence fails after quiescence

- **WHEN** surfaces have been revoked safely but Rust cannot persist the
  disable or removal transition
- **THEN** the original Manager record, enabled intent, and revision remain
  unchanged and no event is sent
- **THEN** the service fully refreshes and restores Page projection followed by
  Action projection from the original current facts

### Requirement: Enable must commit intent before converging Page and Action projection

Enable MUST first persist `enabled=true` atomically and publish a readable
target Registration revision. The trusted service MUST then refresh actively
and wait for the existing Surface Projection to converge on that revision.
Eligible providers MUST be published as a Page batch followed by an Action
batch. A user-visible enable operation MUST wait until the current application
session has observed the target revision and projection is idle. Projection
failure MUST preserve enabled intent, keep surfaces failed closed, and report a
bounded diagnostic. It MUST NOT roll back the durable user choice because of a
temporary frontend failure.

#### Scenario: A compatible plugin is enabled successfully

- **WHEN** a disabled healthy plugin is compatible, its detail matches the
  target revision, and Registry replacement succeeds
- **THEN** the Manager publishes the `enabled=true` revision first and then
  registers the Page batch before the Action batch
- **THEN** the lifecycle service reports user-visible success only after the
  target revision has converged

#### Scenario: Enabled intent succeeds but projection fails

- **WHEN** the Manager has committed enabled intent but detail reading, mapping,
  or Registry replacement fails
- **THEN** Registration continues to show `enabled=true`, while effective
  availability and executable surfaces fail closed
- **THEN** the service returns a safe convergence diagnostic and permits
  recovery through a full refresh or Launcher activation

### Requirement: Uninstall must separate logical removal, program cleanup, and data policy

`uninstall_plugin` MUST require an explicit `retain_data` or `delete_data`
policy, and the product default MUST be `retain_data`. Uninstall MUST always
remove the target healthy or quarantine Registration and Manager diagnostics
in a healthy record. It MUST always eventually delete a managed
program payload whose ownership is provable. `retain_data` MUST preserve the
separate data subtree, while `delete_data` MUST persist that intent and
eventually delete the subtree. Manager record removal MUST occur before any
destructive program cleanup that could leave a healthy record pointing to a
missing payload. A Host registration whose managed payload ownership cannot be
proved MUST return `operation_not_supported`; that conclusion MUST NOT rely
solely on builtin or external source or on Publisher text. Uninstall MUST NOT
read, delete, or restore current permission or grant authority; a legacy grant
field MUST fail closed only as incompatible data.

#### Scenario: A plugin is uninstalled while its data is retained

- **WHEN** the caller selects `retain_data` for a managed healthy plugin
- **THEN** the Host removes the Registration, diagnostics, and program
  payload without creating, modifying, or deleting `data/<plugin-key>`
- **THEN** the result reports logical uninstall explicitly; a later
  reinstallation starts from current permissionless Registration facts but can
  observe the original retained data boundary

#### Scenario: A plugin is uninstalled with its data deleted

- **WHEN** the caller selects `delete_data`
- **THEN** the Host persists the data-cleanup intent before removing the Manager
  record
- **THEN** the program and canonical data subtree are eventually deleted, and
  restart or retry cannot silently change the policy to retain data

#### Scenario: A quarantine entry is uninstalled

- **WHEN** the target is a quarantine entry and the Host can prove its package
  and data subtree from the safe record key and installer root
- **THEN** the Host may remove the quarantine Store record and clean only that
  safe subtree according to the requested policy
- **THEN** the Host neither parses the damaged Manifest nor guesses missing
  paths nor deletes content whose ownership is unproven

#### Scenario: A Host module has no managed payload

- **WHEN** a healthy registration does not point to an installer-owned
  canonical package payload
- **THEN** enable and disable continue to follow ordinary healthy-record rules,
  while uninstall returns `operation_not_supported`
- **THEN** the reason is the Host's inability to own a safe physical uninstall
  target, not the registration's source, Publisher, or official identity

### Requirement: Pending cleanup must recover conservatively across failures and restarts

Lifecycle handling MUST use a restricted, versioned, Host-private cleanup
record per plugin identity within the installer-owned root. The record MUST
capture recoverable conclusions for program cleanup, data policy, and data
cleanup. Installation and lifecycle operations MUST share the in-process mutex
and cross-process lock. If file cleanup fails after logical Manager removal,
the operation MUST return a successful cleanup-pending conclusion; startup
recovery and retries for the same target MUST continue under the lock. An
abnormal cleanup record, symbolic link, path outside the root, unknown entry,
or uncertain ownership MUST preserve the original evidence and degrade related
writes. Recovery MUST NOT guess in order to finish deletion.

#### Scenario: Program deletion fails after Manager removal

- **WHEN** record absence has been persisted and published but the canonical
  payload cannot be deleted immediately
- **THEN** the plugin remains logically uninstalled and the result reports
  cleanup pending instead of restoring a healthy registration
- **THEN** a later startup or operation for the same target continues deleting
  the orphan while holding the shared lock

#### Scenario: Changed-event delivery fails

- **WHEN** the Manager transition and revision are committed but the
  Registration changed event cannot be sent
- **THEN** the committed lifecycle operation is not rolled back
- **THEN** the current service uses the response revision to perform a complete
  refresh, while other consumers converge through listener recovery or
  Launcher activation

#### Scenario: Cleanup evidence is abnormal

- **WHEN** a cleanup record is damaged, a target contains a symbolic link or
  escapes the Host root, or ownership cannot be proved
- **THEN** recovery neither deletes the target nor overwrites the evidence and
  publishes a bounded safe diagnostic
- **THEN** unaffected plugins remain readable while installation and lifecycle
  writes that could contaminate the evidence are rejected

### Requirement: Disabled or uninstalled Actions must disappear without erasing Launcher preferences

After disable or uninstall converges, the target plugin's Actions MUST be
absent from the unified Launcher Registry and therefore MUST NOT appear in
Action Search, Recent, or Pinned. The system MUST NOT create a plugin-specific
search branch or a disabled placeholder. Recent and Pinned persistence MUST
continue to store only stable Action IDs and MUST NOT delete target IDs
automatically because of disable or uninstall. After re-enable or reinstallation
of the same global Action ID, existing unified resolution MAY display the real
Action again.

#### Scenario: Search targets an Action from a disabled plugin

- **WHEN** disable convergence has completed and a query matches metadata from
  one of the plugin's former Actions
- **THEN** unified search does not return that Action
- **THEN** Registration management reads can still observe the plugin with
  `enabled=false`

#### Scenario: A disabled plugin owns a Recent or Pinned Action

- **WHEN** the plugin's Action batch is revoked from the Registry
- **THEN** Home does not display its tile or replace it with another Action
- **THEN** the persisted Action ID remains and can resolve again after the same
  ID is restored by re-enable

#### Scenario: A displayed result races with disable before dispatch

- **WHEN** an old search result remains visible but its Action is revoked
  before dispatch
- **THEN** the unified Dispatcher returns the existing typed unavailable or
  not-found failure without invoking the executor
- **THEN** the application preserves the recoverable query and displays safe,
  localized feedback

### Requirement: Task 3.3 must not claim later runtime, permission, upgrade, or management UI capabilities

This capability MUST deliver only the Host-private lifecycle persistence and
cleanup contract, trusted application coordination, recovery, tests, and
maintained documentation. It MUST NOT create a complete plugin management list
or detail UI, iframe Runtime or session, resource service, Host API, native
authority, signature or Publisher trust, upgrade, rollback or
reinstall behavior, public plugin lifecycle API, Recent or Pinned cleanup, or a
general-purpose transaction platform.

#### Scenario: Task 3.3 is complete by itself

- **WHEN** this change passes all validation while later tasks remain
  unimplemented
- **THEN** trusted application infrastructure can safely enable, disable, and
  uninstall managed plugins and recover from failures
- **THEN** plugin code still does not execute, and the complete end-user
  management UI, Runtime, native Host APIs, and upgrade capabilities remain
  explicitly undelivered
- **THEN** lifecycle convergence creates no permission or grant flow
