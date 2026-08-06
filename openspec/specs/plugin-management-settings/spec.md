# Plugin Management Settings Specification

## Purpose

Define the trusted Host settings surface for inspecting and managing installed
local plugins while preserving current Registration facts, narrow private
service boundaries, safe diagnostics, accessibility, localization, and theme
behavior.

## Requirements

### Requirement: Host settings MUST display the current plugin list and details

The system MUST display the real list produced by the current Registration
snapshot in the `Plugins` section of `lensx.core/settings` and MUST allow a user
to select an entry and read its detail at the same revision. A healthy entry
MUST display its name, version, Host source, enabled intent, lensX and Host API
compatibility, and Runtime summary. Healthy detail MUST present Manifest
requested permissions, Host grant and effective permission state, and bounded
safe diagnostics separately. A quarantined entry MUST display only identity
and safe diagnostic facts the Host can prove and MUST NOT infer Manifest,
source, permission, or compatibility facts.

#### Scenario: View a healthy plugin

- **WHEN** the current snapshot contains a healthy Registration and its detail
  is read successfully at the same revision
- **THEN** the Plugins section displays its real summary and detail while
  keeping requested, supported, granted, and effective permission facts separate
- **THEN** the page does not present Publisher text, Host source, or enabled
  intent as a signature, trust decision, or authorization

#### Scenario: View a quarantined entry

- **WHEN** the current snapshot contains a quarantined entry
- **THEN** the list and detail display only provable identity and bounded safe
  diagnostic facts
- **THEN** the page does not fabricate a name, version, permission,
  compatibility, or Runtime state

### Requirement: The management page MUST fail closed for empty, loading, degraded, and stale states

The management page MUST initialize from a complete snapshot and MUST perform
a complete reread after a Registration invalidation. An empty available Manager
MUST produce a real empty state and local installation entry point. Manager
degradation, snapshot or detail read failure, and detail revision mismatch MUST
produce a retryable state without mixing an old list with new detail or hiding
degradation as an empty list. Selection MUST bind to the current snapshot by
opaque `entry_id` and recover deterministically when an entry disappears.

#### Scenario: No plugins are installed

- **WHEN** the current available snapshot has no entries
- **THEN** the page displays a localized empty state and an accessible local
  file installation action
- **THEN** the page displays no fabricated plugin, error, or marketplace content

#### Scenario: The Manager is degraded

- **WHEN** the Registration snapshot reports degraded availability
- **THEN** the page displays safe actionable degradation feedback and a retry
  action
- **THEN** every mutation remains unavailable and degradation is not rendered
  as an ordinary empty list

#### Scenario: Detail and list revisions differ

- **WHEN** a detail response revision differs from the current snapshot
  revision used to select its entry
- **THEN** the page discards the detail and rereads complete state through the
  shared adapter
- **THEN** the page neither displays cross-revision detail nor permits a write
  from stale confirmation state

### Requirement: Lifecycle and local replacement MUST execute only through typed Host services

The management page MUST execute prepared local installation, enable, disable,
replacement, uninstall, data-clear, and permission operations through
root-private typed services. Every installed-entry mutation MUST bind the
current opaque entry ID and expected Registration revision. At most one
mutation or durable-operation confirmation MAY be active on a management page
at a time, and pending state MUST prevent duplicate or conflicting submission.
After success, the service MUST wait for every returned revision to converge
with the shared snapshot/detail. A conflict MUST cancel or close stale
preparation/confirmation, refresh state, and require a new user decision; the
service MUST NOT replay a destructive or authority-expanding action
automatically.

Prepared installation and replacement MAY collect transient permission
selections, but durable install MUST create an empty grant snapshot and
replacement MUST first commit only its existing grant intersection. The
management service MAY apply each separately confirmed permission after durable
commit only through the independent revision-bound permission service. A
post-commit grant failure MUST preserve the durable operation and actual
narrower grant state, stop remaining grants, refresh, and distinguish partial
permission application from install/replacement failure.

#### Scenario: Disable a current plugin

- **WHEN** the user confirms disabling a current manageable healthy plugin
- **THEN** the page uses the lifecycle service to quiesce surfaces, submit the
  revision-bound disable operation, and await snapshot convergence
- **THEN** React neither calls the Plugin Manager directly nor simulates a
  disabled state

#### Scenario: Local replacement requires confirmation

- **WHEN** replacement preparation returns `upgrade`, `downgrade`, or
  `reinstall` with a permission difference
- **THEN** the page displays source/target versions, classification, retained
  grants, added and removed permission IDs, risk, and Publisher-unverified
  facts before requiring explicit confirmation
- **THEN** added permissions remain ungranted and default off before durable
  replacement; only individually confirmed supported additions may be granted
  afterward through the permission service

#### Scenario: First installation requires confirmation

- **WHEN** local installation preparation returns a compatible candidate with
  or without requested permissions
- **THEN** the page displays bounded candidate and permission facts and allows
  explicit cancel or installation with zero grants
- **THEN** durable commit uses only the opaque preparation token, while any
  individually confirmed grants run afterward through the independent
  permission service

#### Scenario: A post-commit permission write fails

- **WHEN** installation/replacement commits successfully but a selected grant
  later fails or cannot converge
- **THEN** the page reports the durable operation as successful and the
  permission application as partial/failed, then reloads actual current detail
- **THEN** it does not roll back the package/version, mark uncommitted grants as
  granted, or automatically retry remaining permission choices

#### Scenario: A write encounters a revision conflict

- **WHEN** the target Registration revision changes after user confirmation
- **THEN** the service rejects the stale request, closes or cancels the stale
  confirmation or preparation, refreshes complete state, and displays localized
  conflict feedback
- **THEN** the page does not apply the old action to the refreshed plugin state

### Requirement: Uninstall MUST make data policy explicit and distinguish logical success from cleanup

Uninstall confirmation MUST explicitly offer `retain_data` and `delete_data`
and MUST default to `retain_data`. Both choices MUST explain their different
effects on Registration, program payload, grants, diagnostics, and private
data. The management page MUST use the lifecycle service's real result. When
`cleanup_pending=true`, it MUST explain that the plugin is logically uninstalled
and controlled Host recovery will continue cleanup; it MUST NOT present pending
cleanup as either an uninstall failure or complete cleanup success.

#### Scenario: Uninstall retains data by default

- **WHEN** the user opens uninstall confirmation without explicitly selecting
  data deletion
- **THEN** confirmation uses `retain_data` and explains that a later
  installation of the same identity may observe the data again
- **THEN** submission still requires explicit confirmation and does not silently
  change to `delete_data`

#### Scenario: Data-deleting uninstall has pending cleanup

- **WHEN** the user confirms `delete_data` and the Host returns logical
  uninstall success with `cleanup_pending=true`
- **THEN** the current snapshot removes the entry and the page explains that
  uninstall is effective while controlled recovery continues cleanup
- **THEN** the page neither claims all data is deleted nor displays an internal
  path or cleanup evidence

### Requirement: Clearing data MUST preserve installation and require a disabled current identity

The management page MUST provide a distinct clear-data operation for a
healthy, disabled, current plugin the Host can safely manage. The operation
MUST reset only its current scoped storage to the canonical empty store and
MUST preserve Registration, Manifest, program payload, source, enabled intent,
grants, and diagnostics. An enabled, quarantined, stale, Manager- or
Installer-degraded, or ownership-unsafe target MUST fail closed.

#### Scenario: Clear data for a disabled plugin

- **WHEN** the user confirms through a destructive dialog that the scoped
  storage of a current healthy disabled plugin should be cleared
- **THEN** the Host atomically resets the namespace through the private typed
  data-management service and returns `changed=true` or idempotent `changed=false`
- **THEN** the plugin remains installed and disabled, and its Registration
  revision and other Host facts do not change because storage content changed

#### Scenario: Attempt to clear data for an enabled plugin

- **WHEN** the user or stale UI requests data clear for an enabled Registration
- **THEN** the Host rejects the operation with a stable safe error and the page
  explains that the plugin must first be disabled
- **THEN** the Runtime cannot continue writing or recreate data during clear

### Requirement: Permission controls and diagnostic presentation MUST remain trusted and minimally disclosing

The management page MUST display current requested, supported, persisted-grant,
and effective permission states separately. For a healthy, current, requested,
and supported permission, it MUST expose only the grant/revoke operation
allowed by current Host facts through the root-private typed permission service.
Every permission mutation MUST bind the current opaque `entry_id`, exact
Registration revision, one closed permission ID, and target boolean; React MUST
NOT invoke Tauri directly, submit a complete grant array, persist authority,
optimistically render grant success, or copy Plugin Manager rules.

Sensitive grant and revoke MUST require an accessible single-permission
confirmation. The page MUST serialize permission writes with installation,
replacement, lifecycle, and data mutations, wait for returned-revision
snapshot/detail convergence, and clear stale confirmation on conflict. A
successful revoke MUST present actionable feedback that affected Runtime
authority and an active plugin Page may terminate immediately. Quarantined,
degraded, stale, unrequested, and unsupported states MUST NOT expose a grant
action.

Diagnostics and all mutation failures MUST continue to map only closed safe
codes to localized actionable feedback and MUST NOT display a raw error, stack,
absolute path, digest, Store key, damaged record, storage key/value, Tauri/Rust
object, complete grant set, or plugin payload. Publisher text, Host source,
enabled intent, and official naming MUST NOT be shown as signature, trust, or
permission authority.

#### Scenario: A requested permission is not granted

- **WHEN** a healthy current Manifest requests a supported permission absent
  from the grant snapshot
- **THEN** detail displays requested, supported, not-granted, and risk facts and
  offers one Host-owned grant action
- **THEN** grant remains unchanged until the user completes the exact permission
  confirmation and current service mutation

#### Scenario: User revokes a current grant

- **WHEN** the user confirms revoke for one persisted grant and the typed
  service returns a new revision
- **THEN** the page waits for current detail to prove the grant absent and
  announces successful immediate authority reduction
- **THEN** the page does not simulate Runtime state, automatically reopen a
  closed Page, or modify any other permission or plugin

#### Scenario: Permission write conflicts

- **WHEN** Registration revision changes after a grant/revoke confirmation opens
  or before the write commits
- **THEN** the page closes the stale confirmation, clears transient selection,
  refreshes complete state, and displays localized conflict feedback
- **THEN** the old decision is not automatically replayed against the refreshed
  entry, version, or permission state

#### Scenario: A Host operation returns a safe error

- **WHEN** a typed permission or management service returns a validated stable
  error code
- **THEN** the page displays actionable feedback in the current locale and
  permits an appropriate retry or refresh
- **THEN** raw native messages, paths, stacks, grants, and unvalidated payloads
  do not enter the DOM, log evidence, or accessibility announcement

### Requirement: The management page MUST support both locales, themes, keyboard use, and deterministic focus recovery

All user-visible copy MUST use English as canonical and provide a semantically
aligned Simplified Chinese translation. The page MUST reuse application i18n,
message schema, Semi Design locale/theme, and the fixed Host page surface. List
selection, installation prepare/confirm/cancel, retry, enable, disable,
replacement, grant, revoke, uninstall, data clear, confirmation, and
cancellation MUST be operable with only a keyboard, with visible focus and
accessible names. Permission risk, author reason, Publisher-unverified,
pending, partial success, error, compatibility, effective permission, and
enabled state MUST use text and semantics and MUST NOT rely on color, icon, or
raw permission ID alone.

Every Modal MUST have an accessible title and description, a deterministic
initial focus, pending duplicate/close protection, and explicit confirm/cancel
semantics. Closing, cancelling, rejecting, succeeding, failing, or invalidating
a permission/installation/replacement confirmation MUST return focus to the
still-current trigger or a deterministic adjacent valid entry. Fixed
`650×600` viewport content MUST remain scrollable and readable for both
locales/themes, including long permission reasons and partial-grant feedback.

#### Scenario: Cancel a destructive confirmation with the keyboard

- **WHEN** a keyboard user opens and cancels uninstall, clear-data, or
  permission-revoke confirmation for the selected plugin
- **THEN** the Modal has an accessible title, description, explicit destructive
  and cancel actions, and submits no duplicate mutation
- **THEN** focus returns to the trigger while selection and scroll context remain

#### Scenario: Reject a sensitive grant

- **WHEN** a keyboard user opens a single-permission sensitive confirmation and
  chooses reject or cancel
- **THEN** no grant mutation occurs, the permission remains not-granted, and
  status feedback does not claim success
- **THEN** focus returns to that current permission row's grant control

#### Scenario: The current entry disappears after an operation

- **WHEN** successful uninstall removes the selected entry from the current
  snapshot
- **THEN** the page moves selection and focus to a deterministic adjacent entry
  or to the installation entry point when the list becomes empty
- **THEN** focus does not remain on removed DOM, a noninteractive placeholder,
  or content outside the page

#### Scenario: Prepared state becomes stale

- **WHEN** an installation/replacement/permission confirmation becomes invalid
  because its token, entry, or revision changes
- **THEN** the page clears transient permission selections, closes the stale
  Modal, and announces a safe retry/conflict state
- **THEN** focus returns to a valid installation, replacement, or permission
  control rather than background or removed DOM

#### Scenario: Switch locale and theme

- **WHEN** the management page switches between `en-US` and `zh-CN` and between
  light and dark themes
- **THEN** its list, detail, permission prompts, status, confirmation, error,
  and accessible names use the current locale and supported theme tokens
- **THEN** the fixed native viewport has no critical truncation, lost contrast,
  overlap, or status conveyed only through hard-coded color

### Requirement: Plugin management MUST remain Host-private and have a focused delivery gate

The management contract, adapters, services, view model, permission
confirmations, installation preparations, and data-clear/permission command
clients MUST exist only in the Rust Host, private Tauri boundary, and trusted
root application. They MUST NOT be exported through `@lensx/plugin-contract`,
`@lensx/plugin-sdk`, `@lensx/plugin-ui`, `@lensx/plugin-testkit`, an official or
example plugin, or iframe Runtime. Delivery MUST provide a focused gate covering
Rust and TypeScript wire drift, preparation cleanup/recovery, public package
and workspace boundaries, service orchestration, permission grant/revoke and
Runtime invalidation, UI state, i18n, theme, keyboard, focus, and visual
acceptance at the fixed native viewport.

#### Scenario: Plugin code attempts to import management authority

- **WHEN** an official plugin, example plugin, or external tarball consumer
  attempts to import the management service, installation token/candidate,
  permission confirmation/grant client, data-clear contract, desktop adapter,
  or Tauri command types
- **THEN** the workspace and public-package boundary gate rejects the dependency
- **THEN** plugin code cannot list other plugins, prepare/commit installation,
  change lifecycle/grants, clear data, open a trusted Host prompt, or read
  diagnostics

#### Scenario: Run the focused delivery gate

- **WHEN** a maintainer runs the plugin-permission-prompts/plugin-management-settings
  focused validation
- **THEN** contract fixtures, Rust and TypeScript tests, service and UI tests,
  relevant permission/installation/replacement regressions, boundary checks,
  bilingual light/dark keyboard states, fixed-viewport screenshots, and
  computed styles pass
- **THEN** the focused gate does not replace complete frontend and Rust final
  validation
