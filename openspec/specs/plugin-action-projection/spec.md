# Plugin Action Projection Specification

## Purpose

Define how trusted Host application services project eligible registered
plugin Actions into the single Launcher Action Registry while preserving
registration revision consistency, provider isolation, Host-owned execution,
and the existing unified search and collection behavior.

## Requirements

### Requirement: Plugin Action projection must consume only current Host registration facts

The system MUST use complete snapshots and corresponding details published by
the Plugin Registration Adapter as the only source of plugin registration facts
for Plugin Action projection. Only entries whose `kind` is `registered`, whose
`enabled` state is `true`, whose `compatibility.lensx` and
`compatibility.host_api` values are both `true`, and whose details belong to the
same current revision MAY contribute Launcher Actions. Installation `source`,
publisher declarations, requested permissions, and existing grants MUST NOT
bypass these eligibility conditions.

#### Scenario: A healthy eligible plugin becomes a projection candidate

- **WHEN** the current snapshot contains an enabled registered entry compatible
  with both lensX and the Host API
- **WHEN** its corresponding detail at the same revision contains a matching
  plugin identity and normalized Manifest
- **THEN** the system treats that Manifest's Actions as the plugin's complete
  candidate batch
- **THEN** a builtin or external source does not change mapping, validation, or
  execution boundaries

#### Scenario: A plugin is not eligible for projection

- **WHEN** an entry is disabled, incompatible on either compatibility dimension,
  quarantined, absent from the snapshot, or the Manager availability is degraded
- **THEN** the system publishes no executable Launcher Action from that entry
- **THEN** the system unregisters the complete Action batch previously owned by
  that plugin

#### Scenario: The registration set is empty

- **WHEN** the current healthy snapshot contains no eligible plugin
- **THEN** the Plugin Action projection result is empty
- **THEN** existing Host built-in Actions remain registered and unchanged

### Requirement: Plugin Actions must map deterministically into the existing Launcher descriptor contract

The system MUST map every normalized Manifest Action to an existing Launcher
Action descriptor whose `owner_id` equals `plugin_id`, whose global `action_id`
equals `<plugin_id>.<local_action_id>`, whose localized `title`, optional
`description`, and locale-keyed `default_keywords` preserve their normalized
values, and whose `enabled` value is `true`. The generated descriptor MUST pass
the existing Launcher descriptor validation. Manifest Page targets, routes,
executors, functions, and other provider-private data MUST NOT appear in a
descriptor, Registry snapshot, or search result.

#### Scenario: Project a valid Action

- **WHEN** plugin `com.acme.notes` contributes local Action `open_notes` that
  targets the plugin's `home` Page
- **THEN** the descriptor uses `owner_id = com.acme.notes` and
  `action_id = com.acme.notes.open_notes`
- **THEN** the descriptor preserves the Action's own localized metadata and
  keywords and sets `enabled = true`
- **THEN** the public descriptor contains neither the `home` Page target nor an
  executor

#### Scenario: A plugin contributes no Action

- **WHEN** an eligible plugin's normalized Manifest contains an empty
  `contributes.actions` list
- **THEN** the system represents the provider's current Launcher Actions as an
  empty batch
- **THEN** the system creates no implicit Action from the plugin's existence,
  Page set, or `default_action_id`

#### Scenario: A default Action does not change unified search

- **WHEN** `contributes.launcher.default_action_id` refers to a projected Action
- **THEN** that field adds or removes no Registry Action and changes neither
  enabled state, matching, scoring, ordering, recent use, nor pinned state
- **THEN** search reads no such Manifest field and adds no plugin-specific branch

### Requirement: Package-local plugin icons must fail safely to the existing generic Action icon

The system MUST NOT project a Manifest package-local asset path into a Launcher
descriptor as a Host icon token, ordinary file path, arbitrary URL, or React
object. Until a safe plugin resource service and corresponding Launcher icon
contract are shipped, a Plugin Action descriptor MUST omit its Manifest asset
icon and the existing presentation layer MUST use the stable generic Action
fallback. The Action title MUST remain its accessible name.

#### Scenario: A Manifest Action declares an asset icon

- **WHEN** a valid Manifest Action declares
  `{ kind: "asset", path: "assets/action.svg" }`
- **THEN** the projected descriptor contains neither the asset path nor a forged
  Host icon token
- **THEN** the Launcher uses the existing generic Action fallback without
  changing the Action's accessible name

#### Scenario: A Manifest Action omits its icon

- **WHEN** a valid Manifest Action omits its icon
- **THEN** the projected descriptor also omits its icon
- **THEN** its search, ordering, execution, and fallback presentation match an
  Action whose declared asset icon was not projected

### Requirement: Plugin Action provider lifecycle must be revision-aware, atomic per plugin, and fail closed

The system MUST subscribe to the existing Registration Adapter's complete
snapshot recovery flow and MUST use one `plugin_id` complete Action batch as
the projection commit and failure-isolation unit. A detail response MUST match
the candidate snapshot's revision, entry identity, and plugin identity. If a
newer revision is observed during asynchronous processing, an older result MUST
NOT be committed. If projection, detail reading, or Registry replacement fails,
the system MUST unregister the plugin's old batch and produce a safe diagnostic
that exposes no path, stack, raw exception, or Host object. One plugin failure
MUST NOT unregister or block other plugins or Host built-in Actions.

#### Scenario: One plugin's Action set changes

- **WHEN** a new revision removes an old Action, changes existing Action metadata,
  and adds a new Action for one eligible plugin
- **THEN** the system commits the plugin's new complete batch in one atomic
  replacement
- **THEN** no Registry snapshot exposes a partly old and partly new Action set
  for that plugin

#### Scenario: A detail result becomes stale during refresh

- **WHEN** the service is reading revision `7` detail and observes a revision `8`
  snapshot
- **THEN** revision `7` detail does not overwrite the Registry
- **THEN** the service converges again from the complete revision `8` snapshot
  and details

#### Scenario: One plugin's detail read or projection fails

- **WHEN** a candidate plugin's detail query fails, its identity does not match,
  or its generated batch fails Registry validation
- **THEN** the system unregisters that plugin's complete previous Action batch
  and reports a safe diagnostic
- **THEN** other plugins and `lensx.core` Actions remain available

#### Scenario: Listener recovery or Launcher activation triggers a complete refresh

- **WHEN** the Registration Adapter publishes a new complete snapshot after
  listener recovery or Launcher activation
- **THEN** the projection service rechecks every known provider against that
  snapshot
- **THEN** a missed event does not leave a removed or changed Plugin Action
  permanently registered

### Requirement: Plugin Action execution must remain Host-owned and use the unified Dispatcher

The system MUST synthesize a Host-owned executor for every Page-only Manifest
target that is eligible for publication. The executor MUST pass only a frozen
`{ owner_id: plugin_id, page_id: local_page_id }` target and the global opening
`action_id` to a narrow Host Page opener. A projected Action MUST execute through
the existing Registry lookup and Dispatcher, and successful, not-found,
unavailable, and execution-failure outcomes MUST preserve the existing typed
dispatch semantics. A plugin MUST NOT submit, read, or directly invoke an
executor. Production publication MUST use the current Registration revision,
MUST occur only after the target Plugin Page batch has been committed, and MUST
exclude Actions whose target Page is currently unavailable. Provider removal or
invalidation MUST unregister the provider's Action batch before unregistering
its Page batch.

#### Scenario: The Dispatcher executes a projected Action

- **WHEN** the Dispatcher receives the global `action_id` of a currently
  registered Plugin Action
- **THEN** the Dispatcher invokes the Host-synthesized executor at most once
- **THEN** the Page opener receives the correct plugin owner, plugin-local Page
  ID, and opening Action ID

#### Scenario: The Page opener rejects a target

- **WHEN** the injected Host Page opener throws or rejects because a target is
  unavailable
- **THEN** the existing Dispatcher returns `action_execution_failed`
- **THEN** the result exposes no Page route, exception stack, Tauri object, or
  Rust internal value

#### Scenario: Production publishes an Action after its Page

- **WHEN** production reconciles a current, eligible Plugin Registration detail
  whose Action targets an available Plugin Page
- **THEN** the Plugin Page batch is committed before the Plugin Action enters
  the Launcher Registry
- **THEN** the default production composition starts Plugin Action publication
  without adding a plugin-specific search or Dispatcher branch

#### Scenario: An Action targets an unavailable Page

- **WHEN** a Page is unknown, missing a required Host grant, or otherwise
  unavailable in the current Page batch
- **THEN** an Action targeting that Page is excluded from the provider's
  published Action batch
- **THEN** users do not see an Action that is already known to fail Page
  preflight

#### Scenario: Production removes a provider surface

- **WHEN** a current Registration snapshot removes or invalidates a previously
  published plugin provider
- **THEN** production unregisters the provider's complete Action batch before
  unregistering its Page batch
- **THEN** other plugins and `lensx.core` Actions remain available

### Requirement: Projected Actions must reuse search and collections without provider-specific behavior

Successfully projected Plugin Actions MUST enter the existing search,
Dispatcher, and Action collections resolution only through the single Launcher
Registry snapshot. Search MUST apply the same locale fallback, matching,
scoring, ordering, enabled filtering, and result limit to Host and Plugin
Actions. Search MUST NOT create a plugin section, source boost, recommendation,
or Marketplace result. Recent and pinned collections MUST continue to persist
only stable global Action IDs. When a provider is temporarily unregistered,
collections MUST hide the Action without deleting its persisted ID.

#### Scenario: One query matches a Host Action and a Plugin Action

- **WHEN** one Host Action and one Plugin Action in the Registry snapshot both
  match the current query
- **THEN** search applies the same scoring rules and `action_id` tie-breaker and
  returns one unified result set
- **THEN** results expose no provider-private Manifest, executor, or registration
  detail

#### Scenario: A pinned Plugin Action is temporarily removed and later restored

- **WHEN** a pinned Plugin Action is unregistered while its provider is
  temporarily unavailable and is later projected with the same global Action ID
- **THEN** home collections hide the Action while it is unavailable but preserve
  the persisted ID
- **THEN** existing collection resolution can display the real Action again after
  it is reprojected
