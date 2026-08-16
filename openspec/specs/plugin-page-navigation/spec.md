# Plugin Page Navigation Specification

## Purpose

Define how trusted Host services project registered plugin Pages into a unified
Page Registry, coordinate Page and Action publication, navigate through the
existing single-window application surface, and fail closed without loading or
executing plugin Runtime code.
## Requirements
### Requirement: Plugin Pages must project into stable Host-owned descriptors

The system MUST project normalized Manifest Pages from current, validated Plugin
Registration details into Host-private Page descriptors. Each Plugin Page's
stable global identity MUST be
`{ owner_id: manifest.plugin_id, page_id: plugin-local Page ID }`; the system
MUST NOT create a second author-controlled or concatenated Page identity. A
descriptor MUST retain the locale-resolvable Page title, plugin-private route,
same-owner parent target, and Host-derived availability. Routes, Publisher data, installation paths, and
Runtime entries MUST NOT enter `ActivePage`, Launcher Action descriptors, or
presentation props.

#### Scenario: Project a plugin Page graph

- **WHEN** a current eligible plugin contributes a `home` Page and a `settings`
  Page whose parent is `home`
- **THEN** both descriptors use the plugin ID as `owner_id`, while their
  `page_id` values remain `home` and `settings`
- **THEN** the `settings` parent target points to `home` under the same owner
- **THEN** the system creates no second global Page ID, breadcrumb, or Router
  state

#### Scenario: Keep sensitive navigation metadata private

- **WHEN** the Host resolves a projected Page for navigation and presentation
- **THEN** `ActivePage` contains only the owner ID, Page ID, and opening Action
  ID
- **THEN** routes, installation paths, Runtime entries,
  executors, and Host objects do not enter Launcher snapshots, React
  presentation props, or public errors

### Requirement: Plugin Page Registry must replace provider batches atomically

The system MUST provide a trusted Host-owned Page Registry that atomically
replaces or unregisters one complete descriptor batch per plugin owner and uses
the same unified lookup as protected Host Pages. The Registry MUST validate the
declared owner, every target, parent ownership, duplicate identities,
descriptor fields, and `lensx.core` isolation. Any invalid input MUST reject the
complete batch and preserve the pre-call state. Snapshots and lookups MUST
return immutable copies in deterministic owner-ID and Page-ID order, and MUST
NOT expose provider bookkeeping or mutation APIs to plugins.

#### Scenario: Replace one plugin Page batch

- **WHEN** trusted projection submits a complete valid Page batch belonging to
  one plugin owner
- **THEN** the Registry removes that owner's old descriptors and commits the
  complete new batch in one transition
- **THEN** lookup never observes a partial mix of the owner's old and new Page
  graphs
- **THEN** other plugins and `lensx.core/settings` remain unchanged

#### Scenario: Reject an invalid or cross-owner batch

- **WHEN** a replacement contains a duplicate target, cross-owner parent,
  incorrect owner, or an attempt to replace a `lensx.core` descriptor
- **THEN** the Registry rejects the complete batch with a deterministic safe
  diagnostic
- **THEN** the complete pre-call state remains unchanged

#### Scenario: Unregister one plugin provider

- **WHEN** trusted projection unregisters a plugin owner with an empty batch
- **THEN** the Registry removes only that owner's Plugin Page descriptors
- **THEN** other providers and protected Host Pages remain available

### Requirement: Page availability must fail closed from current Registration facts

Plugin Page availability MUST derive from the current healthy Registration, enabled intent, compatibility, quarantine state, current descriptor, and resource and Runtime prerequisites. It MUST NOT read `required_permissions`, a grant snapshot, or a permission service. Open Web behavior, Publisher or source, and remote content MUST NOT change Host-owned Page identity, route, or availability. Invalid, disabled, incompatible, quarantined, stale, or removed entries MUST continue to fail closed.

The system MUST retain a Page provider only when snapshot and detail identities and revisions match. Action publication MUST exclude Actions whose target Page is currently unavailable.

#### Scenario: Healthy permissionless Page is available
- **WHEN** a current Manifest `0.2.0` Page belongs to a healthy, enabled, compatible Registration and Runtime prerequisites are available
- **THEN** the Page descriptor is available without a lensX grant
- **THEN** ordinary Web behavior such as Worker or network use is not part of the Page-availability calculation

#### Scenario: Legacy Page contains required permissions
- **WHEN** a package uses a legacy Manifest or Page `required_permissions`
- **THEN** the Contract or Registration classifies it as incompatible or invalid without creating a partial Page descriptor
- **THEN** navigation does not silently ignore the legacy gate and open the Page

#### Scenario: Registration becomes unavailable
- **WHEN** a plugin is disabled, removed, replaced, quarantined, or its current facts become stale
- **THEN** the Page immediately disappears from the current registry and a matching active Page closes
- **THEN** open network, Worker, or remote code cannot preserve the old descriptor

### Requirement: Page and Action projection must converge from one Registration revision

Production MUST use one serial coordinator to generate Plugin Page and Action
batches from the same complete Registration snapshot and same-revision detail.
For additions or replacements, it MUST commit the Page batch before publishing
the Action batch filtered to available Pages. For invalidation or removal, it
MUST unregister the Action batch before unregistering the Page batch. Stale
details, identity or revision mismatches, mapping failures, Registry failures,
or results arriving after destruction MUST NOT publish partial provider state.
A failure MUST fail closed only the corresponding provider and produce a
bounded diagnostic without sensitive values.

#### Scenario: Publish a current plugin surface

- **WHEN** the coordinator receives a current complete snapshot and reads an
  eligible detail with the same revision and matching identity
- **THEN** it atomically commits the provider's complete Page batch first
- **THEN** it atomically commits the complete Action batch filtered to available
  Pages second
- **THEN** every executable Plugin Action can preflight its target through the
  Page Registry

#### Scenario: Remove or invalidate a provider

- **WHEN** the current snapshot indicates that a known provider disappeared or
  is no longer eligible
- **THEN** the coordinator withdraws the provider's complete Action batch
  before its complete Page batch
- **THEN** persisted recent and pinned Action IDs are not deleted, and other
  providers are unaffected

#### Scenario: A commit or detail fails

- **WHEN** detail reading, identity or revision validation, Page mapping, Page
  replacement, or Action replacement fails
- **THEN** the coordinator withdraws that provider's Plugin Actions and Pages
  and reports a safe diagnostic
- **THEN** it exposes no route, installation path, raw error, stack, Tauri
  object, or Rust value

#### Scenario: Refresh recovery supersedes stale work

- **WHEN** a missed changed event, Launcher activation, listener recovery, or a
  higher-revision complete snapshot triggers refresh
- **THEN** the coordinator serially converges on the latest observable revision
  and discards stale detail results
- **THEN** asynchronous results arriving after destruction cannot recommit any
  Page or Action

### Requirement: Plugin Page navigation must remain framework-neutral and Host-controlled

The system MUST use the unified framework-neutral application navigation
service to accept `{ owner_id, page_id }` and an opening Action ID. Before
notifying the one App Shell handler, the service MUST look up a currently
available descriptor in the Page Registry. Unknown, unavailable, or removed
Pages MUST be rejected with stable, safe `page_unavailable` semantics. Plugins,
Manifests, Action descriptors, and projection payloads MUST NOT receive a React
setter, navigation handler, route executor, Registry mutation API, Tauri API,
or Page renderer.

#### Scenario: Open an available Plugin Page

- **WHEN** the Dispatcher executes a Host-synthesized Plugin Action executor
  whose target is currently available in the Page Registry
- **THEN** the navigation service sends the App Shell a flat `ActivePage` with
  the correct owner ID, Page ID, and opening Action ID
- **THEN** the Dispatcher preserves its existing typed success semantics
- **THEN** neither the React result component nor the plugin receives an
  executor or setter

#### Scenario: Reject an unavailable target

- **WHEN** a target is unknown, unavailable, removed, or the navigation handler
  is unavailable
- **THEN** the navigation service does not change the current App Shell
  presentation
- **THEN** the unified Dispatcher still reduces Plugin Action failure to
  `action_execution_failed`
- **THEN** the public result does not distinguish internal failure causes that
  could enumerate plugin state

### Requirement: Plugin Page presentation must resolve current localized metadata safely

Before rendering shared Page context, the system MUST resolve serializable
presentation information from the current Page descriptor, current locale, and
Launcher Registry snapshot. A plugin Owner name MUST use the Registration
display name with `zh-CN` to `en-US` fallback. When the opening Action exists,
the system MUST use its current localized title; when it is missing, the system
MUST fall back to the Page title. Until a safe resource resolver ships, a plugin
Owner icon MUST use the stable generic-provider fallback and MUST NOT use the
opening Action icon, a Manifest asset path, or Publisher identity.

#### Scenario: Resolve a Plugin Page context

- **WHEN** a Plugin Page was opened by an Action still present in the Launcher
  Registry
- **THEN** shared context displays the plugin Owner name and opening Action title
  in the current locale
- **THEN** the Owner icon uses the generic-provider fallback, and Owner and
  Action segments remain non-interactive

#### Scenario: Opening Action disappears or locale changes

- **WHEN** the Page remains active while the opening Action is unregistered or
  the user changes application locale
- **THEN** context uses the current localized Page title as the missing-Action
  fallback
- **THEN** Owner, Page, and Action strings are resolved again from current
  descriptors instead of stale copies in `ActivePage`

#### Scenario: Presentation metadata cannot be resolved

- **WHEN** the active target can no longer be resolved from the current Page
  Registry
- **THEN** the system closes the active Page and returns Home instead of
  displaying a raw owner ID, route, or stale author text

### Requirement: Active Plugin Pages must close when their descriptor becomes unavailable

The system MUST revalidate the current active Plugin Page after Page Registry
replacement. When the target is removed or its availability becomes false, a
Host-owned navigation invalidation transition MUST close the Page, return Home,
and restore safe Launcher state; a plugin MUST NOT receive or call the
invalidation handler. Changes only to title, Owner presentation, parent, route,
  while availability remains true MUST NOT close an active Page
with the same identity.

#### Scenario: An active Page loses availability

- **WHEN** a new Registration revision removes the active Page or makes its
  provider ineligible
- **THEN** the Host navigation boundary closes the active Page and returns Home
- **THEN** unregistered plugin code receives no execution opportunity, and
  other providers' active and registered state is unaffected

#### Scenario: Active Page metadata changes without losing availability

- **WHEN** the title, parent, or other descriptor metadata changes for the same
  `{ owner_id, page_id }` while the Page remains available
- **THEN** the active Page identity remains open and uses the latest resolvable
  presentation
- **THEN** the system creates no second Page state or navigation history entry

### Requirement: External Plugin Page presentation MUST declare a Host-owned native slot
When the current descriptor resolves to an executable external Page, React MUST render Host chrome plus a non-authoritative `PluginRuntimeSlot` whose revisioned physical bounds and visibility are sent to the private presentation controller. The Page layer MUST NOT create an iframe, receive a Child WebView handle or let plugin content control title, close, layout, route identity or Host navigation.

#### Scenario: External Page is selected
- **WHEN** a current Page descriptor and Runtime facts are available
- **THEN** Host shows loading chrome and declares the slot while Rust creates the Child WebView
- **THEN** plugin content becomes visible only after current load and Session readiness

#### Scenario: Descriptor becomes unavailable
- **WHEN** current Registration removes or disables the Page
- **THEN** navigation closes the Page and terminally destroys its Child WebView before returning focus
