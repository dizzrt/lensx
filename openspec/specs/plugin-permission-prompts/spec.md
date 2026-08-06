# Plugin Permission Prompts Specification

## Purpose

Define trusted Host-owned permission presentation and explicit, revision-bound
grant and revoke interactions for installation, replacement, and plugin
management settings without creating plugin-driven prompts or public permission
authority.

## Requirements

### Requirement: Host permission interactions MUST separate trusted risk facts, author reasons, and authorization state

The system MUST derive a frozen permission presentation model from the current
Host permission catalog, normalized Manifest request, Registration detail, and
real grant snapshot. Each item MUST display the stable permission ID,
Host-owned localized name and risk description, `standard | sensitive` risk
class, current-platform support state, effective state, and the localized
Manifest reason clearly labelled as author-provided content. Publisher text and
Host source MUST be presented separately from risk and grant state; without
real signature evidence, Publisher MUST be marked unverified, and
official/external source MUST NOT change permission risk, default selection, or
authorization rules.

The presentation model MUST NOT contain a path, digest, package bytes, staging
fact, complete Manifest, complete grant set, raw error, stack, Rust/Tauri
object, or plugin payload. An unknown permission MUST be shown as unsupported
and ineligible for authorization rather than becoming a catalog entry through
copy, naming, or a Publisher claim.

#### Scenario: A local plugin requests the first sensitive permissions

- **WHEN** a local external plugin requests `clipboard.read` and
  `clipboard.write`
- **THEN** the Host displays the two permissions separately with their
  Host-owned risk descriptions, current support states, and Manifest reasons,
  and marks both as `sensitive`
- **THEN** Publisher text is marked unverified, and neither permission becomes
  granted because of its request, reason, source, or name

#### Scenario: A plugin requests an unknown permission

- **WHEN** a candidate Manifest contains a permission ID outside the current
  Host catalog
- **THEN** the Host displays it as unsupported and provides no authorization
  action
- **THEN** the unknown ID does not enter grant mutation, Runtime capability, or
  a native effect

#### Scenario: The author reason lacks the current locale

- **WHEN** the Manifest permission reason lacks the current locale but the
  existing Manifest locale fallback can provide safe text
- **THEN** the Host displays the author reason using the same fallback rule and
  retains its plugin-provided label
- **THEN** fallback content still does not change risk, support, or grant
  conclusions

### Requirement: Sensitive permissions MUST default off and receive individual explicit decisions

Every `sensitive` permission in installation, replacement, and settings MUST
default unselected. Authorization MUST be triggered by an explicit user action
in a Host-owned single-permission confirmation; installing, replacing, enabling
a plugin, selecting Continue, or confirming another permission MUST NOT imply
authorization for the current permission. The system MUST NOT provide default
select-all, one global confirmation for sensitive permissions, an official
source bypass, or a plugin-initiated grant.

The user MUST be able to continue compatible first installation or replacement
without granting any permissions. Explicitly rejecting one permission or
choosing to decide later MUST neither call grant mutation nor add persistent
decision/history state, and the real state MUST remain `not_granted`. Explicit
granting from settings MUST remain available later.

#### Scenario: User installs with zero grants

- **WHEN** a compatible candidate requests one or more sensitive permissions
  and the user leaves every selection off before confirming installation
- **THEN** the Host allows installation to continue and creates the
  Registration with an empty grant snapshot
- **THEN** the corresponding plugin capabilities are unavailable, and install
  confirmation is not interpreted as authorization

#### Scenario: User individually grants two sensitive permissions

- **WHEN** the user selects `clipboard.read` and `clipboard.write` in sequence
- **THEN** the Host displays an independent confirmation for each and records
  only its explicitly confirmed transient selection
- **THEN** confirmation of one permission neither selects, authorizes, nor
  implies the other

#### Scenario: User rejects or decides later

- **WHEN** the user rejects a single-permission confirmation or leaves the
  permission unselected and chooses to decide later
- **THEN** that permission remains `not_granted` and no grant mutation occurs
- **THEN** the Host persists no denied/deferred distinction, timestamp, or
  actor, and continues to provide an explicit grant entry in later settings

### Requirement: Installation and replacement grants MUST reuse existing per-permission authority after durable commit

First installation MUST durably commit with an empty grant snapshot;
replacement MUST continue to retain only the intersection of old grants and
candidate requested permissions. Permission selections in an installation or
replacement confirmation MUST remain transient intent for the current Host
interaction and MUST NOT modify the Manager, Registration revision, active
Runtime, or grant snapshot before durable commit.

After durable commit and convergence of the current Registration snapshot, the
trusted management service MUST call the existing revision-bound grant authority
one permission at a time in stable permission-ID order and use each returned
current revision as the next expected revision. Only a permission currently
requested by the candidate, currently supported by the Host, and individually
confirmed by the user may enter that sequence. A newly added replacement
permission MUST default out of the sequence; a retained grant MUST NOT require
confirmation again, and a removed request MUST NOT retain a grant.

If the durable operation succeeds and later grant application partially fails,
the system MUST preserve the committed installation/replacement and actual
narrower grant state, stop the remaining grant sequence, perform a complete
refresh, and provide recoverable feedback. It MUST NOT roll back the payload,
fabricate complete authorization success, or automatically retry old
selections.

#### Scenario: Apply one explicit grant after first installation

- **WHEN** the user explicitly allows only `clipboard.read` during first-install
  confirmation, durable install commits with empty grants, and the snapshot
  converges
- **THEN** the management service submits one `clipboard.read` grant through
  the existing `setGrant` authority for the current entry and revision
- **THEN** `clipboard.write` remains `not_granted`, and the new authority takes
  effect only through the new Registration revision and Runtime identity

#### Scenario: Replacement adds a permission

- **WHEN** a replacement candidate retains one existing grant, removes one old
  request, and adds one sensitive permission request
- **THEN** confirmation displays retained, removed, and added facts separately,
  the added item defaults off, and no grant mutation occurs before durable
  replacement
- **THEN** replacement commit preserves the intersection and removes the old
  grant; only a separately confirmed added permission is sent through the
  existing grant authority at the committed revision

#### Scenario: A grant fails after a durable operation

- **WHEN** installation or replacement has durably succeeded but the first or
  a later grant fails because of conflict, persistence, unsupported state, or
  convergence
- **THEN** the Host stops remaining grants, rereads complete current detail,
  and clearly reports that the durable operation succeeded but permissions were
  not fully applied
- **THEN** grants actually committed remain effective, uncommitted items remain
  unauthorized, and the system neither rolls back the version nor
  automatically replays old decisions

### Requirement: Settings MUST provide current, revision-bound per-permission grant and revoke

Permission detail for a healthy plugin MUST display requested, supported,
persisted-grant, and effective states separately. For a current, requested,
supported, and `not_granted` permission, settings MUST provide one grant action;
for a real persisted grant, settings MUST provide one revoke action. Grant and
revoke MUST go through the root-private management facade and typed permission
service, bound to the current opaque `entry_id` and exact Registration revision;
React MUST NOT invoke Tauri directly, submit a complete grant array,
optimistically modify authority, or duplicate Manager transitions.

Permission mutation MUST share the page-level serialization boundary with
installation, replacement, lifecycle, and data mutations. After success, the UI
MUST wait for complete snapshot/detail convergence at the returned revision. A
conflict MUST close stale confirmation, clear transient selection, refresh, and
require a new decision. Successful revoke MUST reuse existing Runtime
invalidation to narrow authority immediately and MUST tell the user that an
active plugin Page or pending call may have terminated.

#### Scenario: Grant a sensitive permission in settings

- **WHEN** the user opens a single-permission confirmation for a current healthy
  plugin's supported, requested, not-granted permission and explicitly allows it
- **THEN** the management facade submits one permission grant for the exact
  entry/revision and waits for the new revision to converge
- **THEN** the page reports success only after current detail proves the grant,
  and new Runtime capability can come only from a new identity

#### Scenario: Revoke a permission from an active plugin

- **WHEN** the user explicitly confirms revoking a current persisted grant
- **THEN** the Host submits one permission revoke, waits for snapshot
  convergence, and immediately removes authority from affected old
  Sessions/Ports/pending calls
- **THEN** the page announces the revocation and possible active Page closure,
  does not automatically reopen a Page, and does not affect unrelated plugins

#### Scenario: Revision changes around permission confirmation

- **WHEN** the target Registration revision changes before or after the user
  confirms grant/revoke
- **THEN** the stale mutation is rejected, the old Modal and transient selection
  are cleared, and the page performs a complete refresh
- **THEN** the Host does not automatically apply the old decision to a new
  version, different entry, or different permission state

#### Scenario: Permission cannot be granted

- **WHEN** the entry is quarantined, the Manager is degraded, the permission is
  unrequested or unsupported, detail and snapshot revisions disagree, or
  another mutation is active
- **THEN** the grant action is unavailable and the Host displays a safe,
  recoverable state
- **THEN** the UI does not fabricate availability, and the underlying authority
  still fails defensive requests closed

### Requirement: Insufficient Runtime permission MUST remain a stable restricted experience without plugin-driven automatic prompts

When a grant is absent or revoked, the system MUST continue to express the
restricted state through existing Page/Action availability, Runtime capability,
and stable Host API errors. iframe RPC, Manifest, SDK payload, plugin source,
Publisher, or a plugin-reported user activation MUST NOT automatically open a
Host permission Modal, navigate to authorization, or create a grant. The user
may grant only through Host-owned installation, replacement, or settings
interactions.

Revocation MUST continue to terminate old Runtime authority immediately; when
revocation comes from the current settings interaction, the Host MUST provide
actionable feedback on that trusted surface. A plugin MAY explain unavailable
functionality from capability/error state in its own UI and use an existing
Host Action to open the ordinary settings entry, but it MUST NOT carry a
permission decision, bypass Host confirmation, or cause the Host to accept a
plugin-claimed user gesture.

#### Scenario: Plugin repeatedly calls an unauthorized method

- **WHEN** an iframe repeatedly invokes a currently unauthorized
  permission-backed Host API
- **THEN** every call returns `permission_denied`, `unavailable`, or a
  termination conclusion under the existing contract
- **THEN** the Host displays no permission Modal, performs no navigation,
  persists no decision, and expands no capability

#### Scenario: Plugin claims that a request came from a user click

- **WHEN** plugin payload, a Manifest reason, or an SDK call claims that a
  permission request came from a user gesture
- **THEN** the Host ignores that claim as authority and neither grants directly
  nor displays a trusted confirmation
- **THEN** the user must explicitly act again on the exact current permission
  in a Host-owned surface

### Requirement: Permission interactions MUST support both locales, themes, keyboard use, focus, and the fixed viewport

All Host-owned product copy MUST use the canonical English locale as source and
provide a semantically aligned Simplified Chinese translation through existing
application i18n, message schema, Semi Design locale/theme, and supported
tokens. Every installation, replacement, single-permission grant, and revoke
fact and action MUST be operable with only a keyboard and have accessible names,
risk descriptions, visible focus, pending reentry protection, and live
status/alert semantics. State MUST NOT be expressed only by color, icon, or
permission ID.

After Modal cancellation, rejection, success, or failure, focus MUST return to
the still-existing trigger or a deterministic adjacent entry. Cancelled or
stale prepared installation/replacement MUST clear interaction state and restore
the corresponding entry point. At the fixed `650×600` native page viewport,
long names, long reasons, unsupported state, all-ungranted state, partial grant,
conflict, and partial-grant feedback in `en-US | zh-CN` × `light | dark` MUST
have no critical truncation, overlap, lost focus, or unreadable contrast.

#### Scenario: Keyboard user rejects a sensitive permission

- **WHEN** a keyboard user opens sensitive confirmation from a permission row
  and selects reject or cancel
- **THEN** the Modal title, description, and actions are perceivable, the
  permission remains unauthorized, and no duplicate submission occurs
- **THEN** focus returns to the current permission row's valid control, and the
  live region announces no false success

#### Scenario: Switch locale and theme

- **WHEN** a permission prompt switches between English and Chinese and between
  light and dark themes
- **THEN** Host risk, author-reason label, Publisher-unverified state, status,
  controls, and feedback use the current locale and supported theme tokens
- **THEN** permission semantics, default-off behavior, and grant state do not
  change with locale or theme

#### Scenario: Prepared target becomes stale

- **WHEN** preparation or a Registration target becomes invalid while
  confirmation is open
- **THEN** the Modal closes, transient selections are cleared, and safe
  conflict/retry feedback appears
- **THEN** focus returns to a new valid entry instead of removed DOM,
  background content, or a noninteractive placeholder

### Requirement: Permission prompt capability MUST remain Host-private and have a focused delivery gate

The permission prompt contract, candidate projection, management mutations,
confirmation state, and installation preparation MUST exist only in the Rust
Host, strict private Tauri boundary, and trusted root application. They MUST NOT
be exported or callable through `@lensx/plugin-contract`, `@lensx/plugin-sdk`,
`@lensx/plugin-ui`, `@lensx/plugin-testkit`, an official/example plugin, or
iframe Runtime. Public packages MUST preserve the existing permission IDs,
methods, and error semantics without adding a permission-request or grant API.

Delivery MUST provide focused validation covering local-installation preparation
Rust/TypeScript drift, token/staging recovery, permission-display derivation,
installation/replacement/settings orchestration, per-permission grant/revoke,
partial failure, conflict, Runtime invalidation, public boundaries, bilingual
schema, keyboard/focus, fixed-viewport screenshots, and computed styles. The
focused gate MUST NOT replace complete frontend and Rust validation.

#### Scenario: Plugin code attempts to import permission interaction authority

- **WHEN** an official, example, or external plugin consumer attempts to import
  a prompt model, installation token, management permission mutation, or grant
  adapter
- **THEN** the workspace/public-package boundary gate rejects the dependency
- **THEN** plugin code cannot open a trusted Host Modal, submit a grant, read
  another plugin's state, or fabricate a candidate

#### Scenario: Run the focused delivery gate

- **WHEN** a maintainer runs the plugin-permission-prompts focused validation
- **THEN** strict contracts, services, UI, recovery, security, i18n, theme,
  keyboard, focus, and visual evidence all pass
- **THEN** the gate confirms that no path, digest, payload, grant set, raw error,
  stack, Host object, or unverified authority enters the UI, logs, or public
  packages
