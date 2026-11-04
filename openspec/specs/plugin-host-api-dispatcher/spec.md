# Plugin Host API Dispatcher Specification

## Purpose


Define the Host-private, Session-scoped Host API Dispatcher over authenticated
native Runtime bridge bindings, preserving instance identity, caller-window
routing, currentness, cancellation, lifecycle isolation, and public Contract
boundaries across main and detached windows.

## Requirements

### Requirement: Production Host MUST route requests through a closed Dispatcher bound to a trusted Session

The production Host MUST route Host API `0.4.0` requests through a closed Dispatcher bound to the current trusted Runtime Session, including Action activation methods whose real providers are available.

#### Scenario: Current Session calls a non-privileged method
- **WHEN** the current plugin invokes a navigation, Context, storage, HTTP, close, or Action activation method in the current catalog with a composed provider
- **THEN** the Dispatcher executes from Session identity and Host facts and returns a Contract-valid result
- **THEN** plugin-provided identity, source, or Web behavior cannot change the Host target or HTTP control boundary

#### Scenario: Plugin calls a removed or private method
- **WHEN** a plugin invokes clipboard, permission mutation, Tauri, unknown, or Host-private methods
- **THEN** the Dispatcher returns a stable closed-contract failure before native side effects
- **THEN** installation, official source, network, or Worker context creates no bypass

#### Scenario: Plugin attempts to forge authority
- **WHEN** a request, private frame, or plugin code attempts to submit plugin/Page identity, origin, Registration revision, provider, executor, Tauri command, storage namespace, paths, or Host objects
- **THEN** exact Contract/transport validation rejects it before the Dispatcher, or the Dispatcher ignores authority not derived from the Session lease
- **THEN** forged values cannot select plugins, Pages, Registrations, storage namespaces, or Host services

#### Scenario: Method is unknown or provider is unavailable
- **WHEN** a method outside the catalog is invoked or a declared method is invoked without its provider available
- **THEN** stable `method_not_found` or `unavailable` is returned respectively
- **THEN** the Dispatcher invokes no fallback storage, browser fetch, arbitrary native executor, or other implicit fallback

#### Scenario: Compose only current public providers in production
- **WHEN** a ready trusted Runtime Session receives a Host API request
- **THEN** the Dispatcher MUST compose base navigation/Context, plugin-scoped storage, public controlled HTTP, and Session-owned Action activation providers; it MUST NOT compose permission/grant, native clipboard, arbitrary Tauri commands, or implicit proxies for ordinary Web behavior.
- **THEN** `http.request` MUST be an explicit public method executing generic HTTPS transport without translation, signing, or credential-management business logic.
- **THEN** Every request MUST pass strict Contract validation, identity/currentness checks, cancellation, deadlines, and bounded response validation.

#### Scenario: Reject wire-selected Host identities and targets
- **WHEN** a plugin sends an unknown, malformed, unavailable, or identity-overriding request
- **THEN** Plugins or wire payloads MUST NOT choose or override plugin ID, Page ID, Registration revision, Runtime attempt, origin, provider, executor, Tauri command, storage namespace, paths, or other Host objects.
- **THEN** Unknown or malformed methods MUST be rejected before a handler; defensive direct dispatch MUST return stable `method_not_found`, while declared methods without an available current provider MUST return stable `unavailable` without side effects.

#### Scenario: Activation requests cannot select another source
- **WHEN** the current plugin calls actions.get_activation or actions.subscribe_activations
- **THEN** the Dispatcher derives activation state from the current Session and Page attempt and accepts no plugin-supplied source, owner, Page, or native binding
- **THEN** actions.open creates a new normal invocation without inheriting earlier shortcut provenance

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

The Dispatcher MUST derive complete Context from the current Host API `0.4.0` catalog, trusted Session, locale/theme, and actually composed providers; a missing activation provider does not invalidate other capabilities or empty-capability Context.

#### Scenario: Only base and storage providers are available
- **WHEN** the current Session binds only base and scoped-storage providers
- **THEN** Context lists only their corresponding methods in sorted, unique order, excluding `http.request`
- **THEN** clipboard, permissions, ordinary browser network, and Worker do not appear in the method list

#### Scenario: HTTP provider is available
- **WHEN** the current trusted Session composes an available controlled HTTP provider
- **THEN** complete Context includes `http.request`, with the same decision for every plugin source
- **THEN** HTTP unavailability omits the method without falling back to plugin-specific native shortcuts

#### Scenario: Legacy permission facts remain in an isolated record
- **WHEN** recovery encounters old permission/grant fields in isolated records or stale frontend payloads
- **THEN** the Dispatcher ignores their authority and rejects incompatible boundary data
- **THEN** Context does not project old clipboard capabilities

#### Scenario: Unavailable capabilities are excluded from Context
- **WHEN** a composed provider is unavailable to the current Session
- **THEN** Context removes only the affected methods
- **THEN** catalog membership, Manifest content, official source, and old facts cannot make a method a current capability

#### Scenario: Storage namespace becomes degraded
- **WHEN** the Host confirms that the current identity's storage namespace is damaged or blocked while the rest of the Session remains valid
- **THEN** the Host publishes complete Context without the five storage capabilities, leaving other capabilities unchanged
- **THEN** identical degraded snapshots are not repeated, and Context contains no storage paths, values, usage, or diagnostics

#### Scenario: Locale or theme changes
- **WHEN** application locale/theme changes while Session identity and provider availability remain valid
- **THEN** the Host sends one complete, Contract-valid, frozen Context replacement
- **THEN** the SDK replaces all Context before notifying subscribers, and plugins see no Host-private state

#### Scenario: Session authority changes
- **WHEN** changes to Registration facts relevant to that instance, resource generation, or Runtime attempt invalidate the old Session identity
- **THEN** the old Session terminates and its old Context cannot authorize subsequent provider calls
- **THEN** `runtime.context_changed` cannot grant new identity to or reauthorize the old Session

#### Scenario: Derive available methods from actually composed providers
- **WHEN** the Dispatcher constructs Context for a current Session
- **THEN** It MUST NOT read Manifest permission requests, persisted grants, permission catalogs, or clipboard availability, and MUST NOT list ordinary browser capabilities as Host API methods.
- **THEN** Context MUST list the separate `http.request` method only when the controlled HTTP provider is currently available.

#### Scenario: Publish complete Context replacements and retire invalid identities
- **WHEN** a runtime.get_context call or Host fact change occurs
- **THEN** `runtime.get_context` MUST accept exact `{}` and return complete, Contract-valid, copied, frozen Context.
- **THEN** Real locale, theme, or provider-availability changes in the same Session MUST publish one complete `runtime.context_changed` replacement; identical snapshots MUST NOT be published repeatedly.
- **THEN** Invalidation of identity, relevant Registration facts, resource generation, or Runtime attempt MUST terminate the affected old Session rather than reauthorizing it through an event; an unrelated global revision or valid window detachment MUST NOT invalidate a still-valid Session.

#### Scenario: Compose or omit an activation provider
- **WHEN** the current Session has a valid composed activation provider or that provider is absent
- **THEN** the former Context advertises the available actions.get_activation and actions.subscribe_activations methods, while the latter omits unavailable methods
- **THEN** Context retains its four-field shape, and independent queries and events provide activation facts without inventing plugin permissions or native input-monitoring capabilities

#### Scenario: Multiple instances receive the same application settings change

- **WHEN** locale, theme, or actual provider availability changes while the main and detached windows contain multiple valid Sessions
- **THEN** Host MUST publish a complete, valid, deduplicated Context replacement separately for each affected Session, deriving capabilities from that Session's own provider state
- **THEN** Sessions of the same plugin MUST NOT share an event queue or identity; invalidating one instance cannot cause another valid instance to miss updates or receive events with the wrong identity

### Requirement: ui.close MUST close only the calling Session's current Page after delivering a successful response

`ui.close` MUST accept only exact `{}`. Host MUST derive one unique close target from the trusted calling Session's instance lease; sibling instances of the same plugin/Page cannot substitute for that target. The successful response MUST be delivered first, followed by closure of only the calling instance and its Page; a detached instance closes its owning detached window, while a main-window instance returns Home under the main-window navigation contract.

#### Scenario: Current plugin closes its own Page

- **WHEN** a valid, ready plugin Session calls `ui.close` and its original instance and the Page on its owning surface still match when the response is delivered
- **THEN** the SDK first receives
  `{ method: "ui.close", result: { accepted: true } }`
- **THEN** the Host closes that Page and terminates its Runtime, and the effect
  executes only once

#### Scenario: Old Session attempts to close a replacement Page

- **WHEN** Page navigation, Session replacement, disable, uninstall,
  disconnect, disposal, or cancellation occurs while a `ui.close` response is
  pending
- **THEN** the post-response effect fails its currentness or target-match check
  and does not close the new or unrelated Page
- **THEN** a late callback does not revive the old Session, send a second
  result, or affect another plugin

#### Scenario: Plugin selects a close target

- **WHEN** `ui.close` params contain a plugin ID, Page ID, window, route, or any
  extra field
- **THEN** the Contract rejects the request with stable `invalid_params`
- **THEN** no current or other Page is closed

#### Scenario: Derive the close target only from current Session identity
- **WHEN** the calling plugin requests ui.close
- **THEN** Dispatcher MUST derive one unique target from trusted Session identity and the independent instance lease; `{ owner_id: plugin_id, page_id }` describes only the business Page and cannot select a running instance by itself. Public calls MUST NOT accept window, instance, route, plugin, Page, or other target fields.
- **THEN** only when the target remains the unterminated Plugin Page instance bound to the calling Session, with its attempt, Session, and current source lease still valid, may the call return `{ accepted: true }`; in `recovery_required`, the same Host-retained instance/transaction context may select the explicit termination target without falsely claiming stable window ownership. Current operating-system focus and the main-window active Page MUST NOT substitute for this determination.

#### Scenario: Deliver the close response before a compare-current effect
- **WHEN** the Host transport completes or loses a pending ui.close result
- **THEN** The Host transport MUST validate and successfully deliver the Contract result and terminal the request before executing at most one Host-owned close effect.
- **THEN** The close effect MUST recheck currentness and the target match.
- **THEN** If the Page or Session was replaced while the response was pending, the call was cancelled, or the adapter terminated, the effect MUST NOT close any Page.
- **THEN** Close MUST use Host's instance-level navigation boundary and clean up that instance's WebView, Session, bridge, pending requests, and listeners without cleaning up other instances of the same plugin/Page.

#### Scenario: Close the caller among multiple instances of the same plugin

- **WHEN** A and B belong to the same plugin/Page and A calls `ui.close` while B or the main window has focus
- **THEN** after delivering the valid response, Host MUST close only A and its owning detached window; B and other Pages in the main window MUST remain unchanged
- **THEN** a caller cannot use matching business identity, focus changes, or known public Actions to close other instances

#### Scenario: Valid detachment occurs before a close response is delivered

- **WHEN** A's valid close response is still pending delivery and A successfully moves to a detached window while its Session and attempt remain valid
- **THEN** the single post-delivery close effect MUST resolve A's current trusted ownership and close only the transferred A
- **THEN** it MUST NOT close Launcher after Launcher has returned Home or opened a new instance, nor execute again because of the transfer

#### Scenario: Recovery-required state still permits explicitly closing the calling instance
- **WHEN** the original instance in `recovery_required` still passes current-source and Session validation and requests valid `ui.close`
- **THEN** after successful response delivery, the sole close effect MUST terminate that instance and its recovery context by the original attempt, without waiting indefinitely for recovery, depending on main's active Page or a guessed owner, or closing sibling/replacement instances
- **THEN** a failed or cancelled response MUST produce no close effect, and late recovery after termination MUST NOT revive or reauthorize that instance

### Requirement: actions.open MUST be limited to the calling plugin's currently available local Action

`actions.open` MUST accept only a valid plugin-local `actionId` and derive instance/window from its Session. Same-Page navigation MUST preserve that instance; another Page replaces only its surface. It MUST NOT create windows, take over main or select a sibling. Ordinary migration permits only bounded ownership waits; `recovery_required` MUST return bounded `unavailable`, preserving the original instance without automatic replay after recovery.

#### Scenario: Plugin opens its own current Action

- **WHEN** a current Session calls an enabled and available Page Action
  currently projected by the same plugin using its local ID
- **THEN** Dispatcher MUST derive the global ID from trusted plugin identity, reuse unified Action validation and execution semantics, and constrain navigation to the calling instance's owning surface
- **THEN** the Action produces its real navigation effect and returns
  `{ method: "actions.open", result: { opened: true } }`

#### Scenario: Plugin attempts to invoke a core or other-plugin Action

- **WHEN** a local ID attempts to express a global, core, or other-provider
  namespace, or the derived Action owner differs from the Session plugin
- **THEN** the Contract or Dispatcher rejects the call with stable
  `invalid_params` or `not_found`
- **THEN** `lensx.core`, other plugins, and every plugin-supplied executor do
  not execute

#### Scenario: Action is no longer available at call time

- **WHEN** an Action was removed, disabled, became incompatible, was
  uninstalled, or can no longer be resolved from the current Registry after
  Context discovery
- **THEN** the Dispatcher returns stable `not_found` from current Registry
  facts
- **THEN** a cached descriptor or old capability snapshot does not execute a
  stale executor

#### Scenario: Resolve a plugin-local Action through the unified Registry
- **WHEN** the calling plugin submits an actions.open request
- **THEN** Dispatcher MUST derive the global Action ID from the trusted Session `plugin_id` and existing projection rules, validate and execute it through the current unified Registry and Dispatcher, and bind the owning instance and surface through Host-private invocation context; public parameters gain no target instance or window.
- **THEN** A plugin MUST NOT submit a global ID, owner, Page route, or executor.

#### Scenario: Reject unavailable or foreign Action targets safely
- **WHEN** the requested local Action is unavailable or its Host executor fails
- **THEN** Only an enabled, available, executable Page-only Action owned by the calling plugin in the current Registry may return `{ opened: true }`.
- **THEN** An unknown, disabled, incompatible, uninstalled, `lensx.core`, or other-plugin target MUST fail with stable `not_found`.
- **THEN** An unknown executor failure MUST map to safe `internal_error`.
- **THEN** No error MUST expose an executor, Registry record, route, original exception, or Host object.

#### Scenario: Open the same Page Action within a detached window

- **WHEN** valid detached instance A invokes an Action of its own plugin whose target remains A's current Page
- **THEN** Host MUST deliver a new `normal` activation to A's existing instance while preserving A's document, Session, input, and business state
- **THEN** main and B with the same plugin/Page MUST NOT be focused, reloaded, replaced, or receive A's activation

#### Scenario: Navigate to another Page of the same plugin within a detached window

- **WHEN** A invokes a valid Action of its own plugin whose target is a different Page
- **THEN** Host MUST perform Page replacement and the corresponding termination/creation rules only within A's detached window, preserving that window's independent hosting identity
- **THEN** the new Page MUST use its own validated presentation, while main and sibling instances MUST remain unchanged
- **THEN** successful results and termination of old requests MUST preserve existing response, cancellation, and strict-currentness rules without reviving an old Session to deliver a result

#### Scenario: External Launcher entry and plugin-internal entry use separate routes

- **WHEN** Launcher search, click, recent use, pinned entries, or a global Action shortcut initiates a plugin Action while that plugin already has a detached instance
- **THEN** Host MUST route that external entry to the main Launcher surface, reusing its current Page or establishing a new instance under main-window rules
- **THEN** external entry MUST NOT select, focus, or broadcast to detached instances by default; plugin-internal `actions.open` remains scoped to the caller's surface

#### Scenario: Action calls in recovery-required state are rejected within a bound
- **WHEN** the calling Session's instance is in `recovery_required` or enters that state while waiting for ordinary migration ownership
- **THEN** `actions.open` MUST return `unavailable` within the existing bounded wait, without creating/replacing a Page, selecting another window, or queuing execution for automatic replay after the user recovers
- **THEN** other still-valid data calls and ongoing results for the original Session MUST continue passing current source/generation/lease and quota checks; recovery state grants no new authority and does not change the boundary for explicit close after a successful response

### Requirement: Dispatcher MUST preserve stable error, cancellation, and terminal lifecycle semantics

Dispatcher providers MUST produce only a Contract-valid Host API result, a Contract-valid Host API error, or a Host-private post-response effect that never crosses the wire.

#### Scenario: Provider throws an unknown exception

- **WHEN** a Context, Navigation, or Action provider throws an unclassified
  exception or returns an internal value that does not match the method
- **THEN** the plugin receives at most a Contract-valid `internal_error` with
  a fixed safe message, or the existing fatal transport path terminates
- **THEN** original exceptions, call stacks, internal values, and Host objects MUST NOT enter plugin-observable native bridge responses, events, or diagnostics

#### Scenario: Cancellation wins before a side effect

- **WHEN** SDK cancellation, timeout, or Host terminal cleanup wins before a
  provider effect
- **THEN** the Host-owned signal is aborted and pending navigation, Action, or
  Context event work does not execute
- **THEN** a late completion sends no second response, event, or effect

#### Scenario: One plugin Dispatcher fails

- **WHEN** a Session request, provider, codec, or lifecycle fails
- **THEN** the failure terminates at most that Session or adapter and produces
  a safe bounded diagnostic
- **THEN** other instances' Sessions, Registration, and application service state MUST NOT be collaterally modified; old permission or grant facts cannot change this isolation boundary

#### Scenario: Keep provider failures inside the safe wire contract
- **WHEN** a Dispatcher provider returns, throws, or prepares a post-response effect
- **THEN** Known domain failures MUST map to closed error codes.
- **THEN** An unknown throw, invalid provider output, or internal failure MUST become `internal_error` with a fixed safe English message.
- **THEN** An original exception, stack, URL, path, payload, grant, identity, executor, Tauri, Rust, or Host object MUST NOT enter a plugin-observable result, error, event, or diagnostic.

#### Scenario: Cancel stale asynchronous provider work
- **WHEN** an operation crosses an asynchronous boundary or its Session is cancelled or invalidated
- **THEN** Every provider MUST check Host cancellation and Session currentness before a side effect and again after an asynchronous boundary.
- **THEN** Cancellation, timeout, disconnect, Page replacement or disposal of the owning instance, and disable, uninstall, or trusted Host coordinator reload that invalidates the instance MUST prevent effects that have not yet occurred; ordinary main-window presentation replacement and hiding do not terminate detached instances.
- **THEN** A late result, event, or effect MUST be dropped and MUST NOT affect a replacement Session.

#### Scenario: Detachment does not cancel the caller's valid requests

- **WHEN** the original instance successfully detaches during valid storage, HTTP, Context, or activation operations
- **THEN** pending operations and the request sequence in the same Session MUST remain valid and results return only to the original caller; returning main Home MUST NOT cancel them
- **THEN** HTTP MUST retain the existing limit of 4 concurrent requests per attempt and 16 globally, plus existing deadlines, without resubmission or quota reset because of migration

#### Scenario: Terminating one instance of the same plugin cancels only its own operations

- **WHEN** A and B call Host API concurrently and only A closes, retries, or terminates on failure
- **THEN** Host MUST cancel only A's pending requests, events, and unexecuted effects and discard its late results; B's valid requests MUST continue
- **THEN** committed plugin-level storage writes MUST retain their existing atomic-commit semantics and cannot be rolled back because A's response is lost; B can observe committed values through subsequent normal reads

#### Scenario: Plugin invalidation or application exit terminates all affected requests

- **WHEN** plugin disable, uninstall, generation change, or application exit invalidates multiple Sessions
- **THEN** Host MUST idempotently cancel pending operations for every affected Session and suppress unexecuted effects and late responses
- **THEN** unrelated, still-valid Sessions MUST NOT be cancelled; application exit cleans up all Sessions

### Requirement: Dispatcher authority MUST derive only from the current Child WebView Session

Dispatch MUST require native-source, independent-lease and RPC validation. Trusted Session facts alone MUST determine plugin/Page, owner, capability and storage namespace. Effects/responses MUST revalidate the original caller, never substitute current Page, focus or a same-plugin/Page sibling. Plugins cannot supply source, handle, instance, window or authority.

#### Scenario: Current WebView calls a supported method
- **WHEN** a validated bridge request reaches Dispatcher from the current ready Session
- **THEN** existing Host API semantics execute for that Session only

#### Scenario: Old WebView calls a valid method
- **WHEN** a replaced or destroyed source sends an otherwise valid request
- **THEN** request is rejected before provider invocation with zero side effect

#### Scenario: Identical request sequence numbers return to their own sources

- **WHEN** A and B belong to the same plugin/Page and their respective Sessions use the same public request sequence number to call the same method
- **THEN** Host MUST independently validate, execute, and return each call by native source and instance/Session binding; cancelling A MUST NOT cancel B
- **THEN** A's private frames, responses, or events MUST NOT forge B's source binding or use a shared generation scope to bypass validation

### Requirement: Delivery MUST prove deterministic production composition without absorbing later capabilities

Production `PluginRuntimeSlot` MUST install a real Session-scoped Dispatcher for the current ready lease instead of a fixed unavailable handler; tests retain explicit fake/unavailable binding injection.

#### Scenario: Production Dispatcher composition and storage loops pass
- **WHEN** deterministic production-composition tests connect public Contract/SDK to the current Dispatcher Session
- **THEN** Context, Page close, same-plugin Actions, independent activation, scoped storage, and controlled HTTP all use current trusted adapters
- **THEN** public plugins cannot import Host-private wire types, Tauri, storage paths, authority coordinators, or executors

#### Scenario: Removed native and permission methods stay unavailable
- **WHEN** current or old fixtures request clipboard, permission mutation, arbitrary Tauri, or methods outside the current Host API `0.4.0` catalog
- **THEN** the closed Contract/Dispatcher rejects them without provider side effects or capability projection
- **THEN** validation does not describe removed methods as permission-denied, grantable, or delivered

#### Scenario: Real Runtime evidence is inferred from deterministic composition
- **WHEN** only deterministic tests and package checks have run
- **THEN** conclusions may confirm maintained production composition and boundary coverage
- **THEN** they MUST NOT claim real WebView, real-account HTTP, or native roundtrips were executed

#### Scenario: Validate real production composition with controlled providers
- **WHEN** deterministic delivery checks exercise the production Runtime Dispatcher and public package boundaries
- **THEN** Delivery MUST cover Dispatcher, production composition, Navigation/Action regressions, five scoped-storage methods, controlled HTTP, SDK codec/bridge adapters, concurrency, cancellation, replacement, cleanup, malicious/stale identity, complete Context, response-before-close, storage restart, bounded diagnostics, and unsupported clipboard, permission mutation, arbitrary Tauri, and removed/private methods.
- **THEN** HTTP validation MUST use deterministic DNS/transport fakes covering control policies and lifecycle without invoking real paid services.
- **THEN** Public tarballs and workspace-boundary checks MUST prove Host-private modules cannot be imported; maintained acceptance MUST NOT require browser, WebView, GUI, or environment evidence.

#### Scenario: Validate activation delivery and termination deterministically
- **WHEN** production-composition tests connect the activation channel through the current Contract, SDK, bridge, and Dispatcher
- **THEN** coverage includes initial batches, early events, repeated subscriptions, absent callbacks, source-identity forgery, currentness, stream-opening failure termination, and cleanup
- **THEN** old catalog assertions do not incorrectly reject new methods, while old, unknown, or removed private methods continue to reject without side effects
- **THEN** these tests do not claim execution of real keyboard monitoring, WebViews, or system authorization flows

### Requirement: Host API services MUST remain available independently of Launcher presentation lifecycle

Hiding the main window, returning Home, or navigating its Pages MUST NOT unmount trusted Host coordination serving still-valid detached instances. Each window MUST use trusted presentation and control boundaries scoped to its instance; shared application facts and services cannot acquire competing owners for global shortcut registration, Action registration, or Settings persistence as windows are added.

#### Scenario: A detached plugin continues calling Host API while main is hidden

- **WHEN** Launcher is hidden on Home after successful detachment and a detached instance continues calling Context, storage, HTTP, or its own Actions
- **THEN** its valid calls MUST be served normally under existing capabilities and instance routing rather than being considered stale because main has no active plugin Page
- **THEN** showing main again, hiding it, or opening another plugin MUST NOT recreate the detached instance's Dispatcher binding

#### Scenario: Close one trusted window presentation

- **WHEN** a detached window closes and removes its trusted chrome while other window instances remain valid
- **THEN** Host MUST remove only that window's and instance's presentation, listeners, and control leases while preserving shared coordination needed by other instances
- **THEN** actual application exit or coordinator invalidation MUST use unified termination, leaving no instance with native authority but without Host service
