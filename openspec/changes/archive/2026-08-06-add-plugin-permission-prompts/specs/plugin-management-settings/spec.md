## ADDED Requirements

### Requirement: Permission controls and diagnostic presentation MUST remain trusted and minimally disclosing

The management page MUST display current requested, supported, persisted-grant and effective permission states separately. For a healthy, current, requested and supported permission, it MUST expose only the grant/revoke operation allowed by current Host facts through the root-private typed permission service. Every permission mutation MUST bind the current opaque `entry_id`, exact Registration revision, one closed permission ID and target boolean; React MUST NOT invoke Tauri directly, submit a complete grant array, persist authority, optimistically render grant success or copy Plugin Manager rules.

Sensitive grant and revoke MUST require an accessible single-permission confirmation. The page MUST serialize permission writes with installation, replacement, lifecycle and data mutations, wait for returned-revision snapshot/detail convergence, and clear stale confirmation on conflict. A successful revoke MUST present actionable feedback that affected Runtime authority and an active plugin Page may terminate immediately. Quarantined, degraded, stale, unrequested and unsupported states MUST NOT expose a grant action.

Diagnostics and all mutation failures MUST continue to map only closed safe codes to localized actionable feedback and MUST NOT display a raw error, stack, absolute path, digest, Store key, damaged record, storage key/value, Tauri/Rust object, complete grant set or plugin payload. Publisher text, Host source, enabled intent and official naming MUST NOT be shown as signature, trust or permission authority.

#### Scenario: A requested permission is not granted

- **WHEN** a healthy current Manifest requests a supported permission absent from the grant snapshot
- **THEN** detail displays requested, supported, not-granted and risk facts and offers one Host-owned grant action
- **THEN** grant remains unchanged until the user completes the exact permission confirmation and current service mutation

#### Scenario: User revokes a current grant

- **WHEN** the user confirms revoke for one persisted grant and the typed service returns a new revision
- **THEN** the page waits for current detail to prove the grant absent and announces successful immediate authority reduction
- **THEN** the page does not simulate Runtime state, automatically reopen a closed Page, or modify any other permission/plugin

#### Scenario: Permission write conflicts

- **WHEN** Registration revision changes after a grant/revoke confirmation opens or before the write commits
- **THEN** the page closes the stale confirmation, clears transient selection, refreshes complete state and displays localized conflict feedback
- **THEN** the old decision is not automatically replayed against the refreshed entry, version or permission state

#### Scenario: A Host operation returns a safe error

- **WHEN** a typed permission or management service returns a validated stable error code
- **THEN** the page displays actionable feedback in the current locale and permits an appropriate retry or refresh
- **THEN** raw native messages, paths, stacks, grants and unvalidated payloads do not enter the DOM, log evidence or accessibility announcement

## MODIFIED Requirements

### Requirement: Lifecycle and local replacement MUST execute only through typed Host services

The management page MUST execute prepared local installation, enable, disable, replacement, uninstall, data-clear and permission operations through root-private typed services. Every installed-entry mutation MUST bind the current opaque entry ID and expected Registration revision. At most one mutation or durable-operation confirmation MAY be active on a management page at a time, and pending state MUST prevent duplicate or conflicting submission. After success, the service MUST wait for every returned revision to converge with the shared snapshot/detail. A conflict MUST cancel or close stale preparation/confirmation, refresh state and require a new user decision; the service MUST NOT replay a destructive or authority-expanding action automatically.

Prepared installation and replacement MAY collect transient permission selections, but durable install MUST create an empty grant snapshot and replacement MUST first commit only its existing grant intersection. The management service MAY apply each separately confirmed permission after durable commit only through the independent revision-bound permission service. A post-commit grant failure MUST preserve the durable operation and actual narrower grant state, stop remaining grants, refresh, and distinguish partial permission application from install/replacement failure.

#### Scenario: Disable a current plugin

- **WHEN** the user confirms disabling a current manageable healthy plugin
- **THEN** the page uses the lifecycle service to quiesce surfaces, submit the revision-bound disable operation, and await snapshot convergence
- **THEN** React neither calls the Plugin Manager directly nor simulates a disabled state

#### Scenario: Local replacement requires confirmation

- **WHEN** replacement preparation returns `upgrade`, `downgrade`, or `reinstall` with a permission difference
- **THEN** the page displays source/target versions, classification, retained grants, added and removed permission IDs, risk and Publisher-unverified facts before requiring explicit confirmation
- **THEN** added permissions remain ungranted and default off before durable replacement; only individually confirmed supported additions may be granted afterward through the permission service

#### Scenario: First installation requires confirmation

- **WHEN** local installation preparation returns a compatible candidate with or without requested permissions
- **THEN** the page displays bounded candidate and permission facts and allows explicit cancel or installation with zero grants
- **THEN** durable commit uses only the opaque preparation token, while any individually confirmed grants run afterward through the independent permission service

#### Scenario: A post-commit permission write fails

- **WHEN** installation/replacement commits successfully but a selected grant later fails or cannot converge
- **THEN** the page reports the durable operation as successful and the permission application as partial/failed, then reloads actual current detail
- **THEN** it does not roll back the package/version, mark uncommitted grants as granted, or automatically retry remaining permission choices

#### Scenario: A write encounters a revision conflict

- **WHEN** the target Registration revision changes after user confirmation
- **THEN** the service rejects the stale request, closes/cancels stale confirmation or preparation, refreshes complete state, and displays localized conflict feedback
- **THEN** the page does not apply the old action to the refreshed plugin state

### Requirement: The management page MUST support both locales, themes, keyboard use, and deterministic focus recovery

All user-visible copy MUST use English as canonical and provide a semantically aligned Simplified Chinese translation. The page MUST reuse application i18n, message schema, Semi Design locale/theme, and the fixed Host page surface. List selection, installation prepare/confirm/cancel, retry, enable, disable, replacement, grant, revoke, uninstall, data clear, confirmation, and cancellation MUST be operable with only a keyboard, with visible focus and accessible names. Permission risk, author reason, Publisher-unverified, pending, partial success, error, compatibility, effective permission and enabled state MUST use text and semantics and MUST NOT rely on color, icon or raw permission ID alone.

Every Modal MUST have an accessible title and description, a deterministic initial focus, pending duplicate/close protection, and explicit confirm/cancel semantics. Closing, cancelling, rejecting, succeeding, failing or invalidating a permission/installation/replacement confirmation MUST return focus to the still-current trigger or a deterministic adjacent valid entry. Fixed `650×600` viewport content MUST remain scrollable and readable for both locales/themes, including long permission reasons and partial-grant feedback.

#### Scenario: Cancel a destructive confirmation with the keyboard

- **WHEN** a keyboard user opens and cancels uninstall, clear-data or permission-revoke confirmation for the selected plugin
- **THEN** the Modal has an accessible title, description, explicit destructive and cancel actions, and submits no duplicate mutation
- **THEN** focus returns to the trigger while selection and scroll context remain

#### Scenario: Reject a sensitive grant

- **WHEN** a keyboard user opens a single-permission sensitive confirmation and chooses reject or cancel
- **THEN** no grant mutation occurs, the permission remains not-granted, and status feedback does not claim success
- **THEN** focus returns to that current permission row's grant control

#### Scenario: The current entry disappears after an operation

- **WHEN** successful uninstall removes the selected entry from the current snapshot
- **THEN** the page moves selection and focus to a deterministic adjacent entry or to the installation entry point when the list becomes empty
- **THEN** focus does not remain on removed DOM, a noninteractive placeholder, or content outside the page

#### Scenario: Prepared state becomes stale

- **WHEN** an installation/replacement/permission confirmation becomes invalid because its token, entry or revision changes
- **THEN** the page clears transient permission selections, closes the stale Modal and announces a safe retry/conflict state
- **THEN** focus returns to a valid installation, replacement or permission control rather than background or removed DOM

#### Scenario: Switch locale and theme

- **WHEN** the management page switches between `en-US` and `zh-CN` and between light and dark themes
- **THEN** its list, detail, permission prompts, status, confirmation, error and accessible names use the current locale and supported theme tokens
- **THEN** the fixed native viewport has no critical truncation, lost contrast, overlap or state conveyed only through hard-coded color

### Requirement: Plugin management MUST remain Host-private and have a focused delivery gate

The management contract, adapters, services, view model, permission confirmations, installation preparations and data-clear/permission command clients MUST exist only in the Rust Host, private Tauri boundary, and trusted root application. They MUST NOT be exported through `@lensx/plugin-contract`, `@lensx/plugin-sdk`, `@lensx/plugin-ui`, `@lensx/plugin-testkit`, an official or example plugin, or iframe Runtime. Delivery MUST provide a focused gate covering Rust and TypeScript wire drift, preparation cleanup/recovery, public package/workspace boundaries, service orchestration, permission grant/revoke and Runtime invalidation, UI state, i18n, theme, keyboard, focus and visual acceptance at the fixed native viewport.

#### Scenario: Plugin code attempts to import management authority

- **WHEN** an official plugin, example plugin, or external tarball consumer attempts to import the management service, installation token/candidate, permission confirmation/grant client, data-clear contract, desktop adapter or Tauri command types
- **THEN** the workspace and public-package boundary gate rejects the dependency
- **THEN** plugin code cannot list other plugins, prepare/commit installation, change lifecycle/grants, clear data, open a trusted Host prompt or read diagnostics

#### Scenario: Run the focused delivery gate

- **WHEN** a maintainer runs the plugin-permission-prompts/plugin-management-settings focused validation
- **THEN** contract fixtures, Rust and TypeScript tests, service/UI tests, relevant permission/installation/replacement regressions, boundary checks, bilingual light/dark keyboard states, fixed-viewport screenshots and computed styles pass
- **THEN** the focused gate does not replace complete frontend and Rust final validation

## REMOVED Requirements

### Requirement: Permission and diagnostic presentation MUST remain read-only and minimally disclosing

**Reason**: Task 6.2 intentionally replaces Task 6.1's read-only permission presentation with trusted, revision-bound, single-permission grant/revoke controls while retaining the same minimal-disclosure requirements for diagnostics and Host facts.

**Migration**: Existing read-only permission rows become current-state rows with operation availability supplied by `PluginManagementService`; all writes use the already shipped `PluginPermissionService.setGrant` boundary, and unsupported, quarantined, degraded or stale rows remain read-only/fail-closed.
