# Plugin Host API Dispatcher Specification

## Purpose

Define the Host-private, Session-scoped Host API v1 Dispatcher that exposes
only currently implemented capabilities through an authenticated Runtime Port,
while preserving trusted identity, currentness, cancellation, lifecycle, and
public Contract boundaries.
## Requirements
### Requirement: Production Host MUST route requests through a closed Dispatcher bound to a trusted Session

The production Host MUST route Host API `0.2.0` requests through a closed Dispatcher bound to the current trusted Runtime Session identity. The Dispatcher MUST compose only base navigation and Context, plugin-scoped storage, and other current non-privileged providers. It MUST NOT compose a permission service, grant source, native clipboard provider, arbitrary Tauri command, or mediation for ordinary Web network or Worker behavior. Every request MUST still pass strict Contract validation, identity and currentness checks, cancellation, deadline, and bounded response validation.

A plugin or wire payload MUST NOT select or override a plugin ID, Page ID, Registration revision, Runtime attempt, origin, provider, executor, Tauri command, storage namespace, path, or another Host object. An unknown or malformed method MUST be rejected before reaching a handler, while a defensive direct dispatch MUST return stable `method_not_found`; a declared method without a current provider MUST return stable `unavailable` without a side effect.

#### Scenario: Current Session calls a non-privileged method
- **WHEN** the current plugin calls a navigation, Context, storage, or close method that is both in the catalog and actually composed
- **THEN** the Dispatcher executes from Session identity and Host facts and returns a Contract-valid result
- **THEN** plugin-provided identity, source, or Web behavior cannot change the Host target

#### Scenario: Plugin calls a removed or private method
- **WHEN** a plugin calls a clipboard, permission mutation, Tauri, unknown, or Host-private method
- **THEN** the Dispatcher returns a stable closed-contract failure before any native effect
- **THEN** installation, official source, network, or Worker context creates no bypass

#### Scenario: Plugin attempts to forge authority

- **WHEN** a request, private frame, or plugin code attempts to submit a plugin or Page identity, origin, Registration revision, provider, executor, Tauri command, storage namespace, path, or Host object
- **THEN** the exact Contract or transport boundary rejects that value before the Dispatcher, or the Dispatcher ignores every authority value not derived from the Session lease
- **THEN** no plugin, Page, Registration, storage namespace, or Host service is operated through the forged value

#### Scenario: Method is unknown or provider is unavailable

- **WHEN** a caller invokes a method outside the Host API catalog or invokes a declared method while its provider is unavailable
- **THEN** the unknown method fails with stable `method_not_found` and the declared unavailable method fails with stable `unavailable`
- **THEN** the Dispatcher invokes no fallback storage, browser, native, or arbitrary executor

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

The Dispatcher MUST generate the complete Context from the current Host API `0.2.0` catalog, Session identity, locale and theme source, and actually composed non-privileged providers. It MUST NOT read Manifest permission requests, persisted grants, a permission catalog, or clipboard availability, and MUST NOT list ordinary Web capabilities as Host API method capabilities.

`runtime.get_context` MUST accept exact `{}` and return a complete, Contract-valid, copied, and frozen Runtime Context. While the same Session remains current, a real locale, theme, or provider-availability change MUST publish one complete `runtime.context_changed` replacement; an identical snapshot MUST NOT be published again. Invalidation of identity, Registration revision, resource generation, or Runtime attempt MUST terminate the old Session and MUST NOT reauthorize it through an event.

#### Scenario: Only base and storage providers are available
- **WHEN** the current Session binds the base and scoped-storage providers
- **THEN** Context lists only the corresponding `0.2.0` methods in sorted, unique order
- **THEN** clipboard, permission, network, and Worker do not appear in the method list

#### Scenario: Legacy permission facts remain in an isolated record
- **WHEN** recovery encounters permission or grant fields in an old record or stale frontend payload
- **THEN** the Dispatcher ignores their authority and rejects incompatible boundary data
- **THEN** Context does not project a legacy clipboard capability

#### Scenario: Unavailable capabilities are excluded from Context

- **WHEN** a composed provider is unavailable to the current Session
- **THEN** Context capabilities exclude only the affected methods
- **THEN** catalog membership, Manifest content, official provenance, and stale legacy facts do not turn a method into a current capability

#### Scenario: Storage namespace becomes degraded

- **WHEN** the Host confirms that the current identity's storage namespace is damaged or blocked while the same Session otherwise remains current
- **THEN** the Host publishes one complete Context replacement without the storage methods and does not modify unrelated capabilities
- **THEN** an identical degraded snapshot is not emitted repeatedly and no storage path, value, usage, or diagnostic enters Context

#### Scenario: Locale or theme changes

- **WHEN** the application locale or theme changes while the current Session's trusted identity and provider availability remain valid
- **THEN** the Host sends one complete, Contract-valid, frozen Context replacement
- **THEN** the SDK replaces the entire Context before notifying subscribers, and the plugin observes no Host-private state

#### Scenario: Session authority changes

- **WHEN** a Registration revision, resource generation, or Runtime attempt change makes the old Session identity no longer current
- **THEN** the old Session terminates through the existing lifecycle and rejects new calls
- **THEN** `runtime.context_changed` does not give the old Session a new identity or reauthorize it

### Requirement: ui.close MUST close only the calling Session's current Page after delivering a successful response

`ui.close` MUST accept exact `{}` only. The Dispatcher MUST derive the sole
target `{ owner_id: plugin_id, page_id }` from trusted Session identity and
MUST NOT accept a window, route, plugin, Page, or other close target. A call may
return `{ accepted: true }` only while that target is still the active Plugin
Page and the Runtime attempt and current Session remain valid.

The Host transport MUST validate and successfully deliver the Contract result
and terminal the request before executing at most one Host-owned close effect.
The close effect MUST recheck currentness and the target match. If the Page or
Session was replaced while the response was pending, the call was cancelled,
or the adapter terminated, the effect MUST NOT close any Page. Closing MUST use
the narrow App Navigation boundary and join the existing iframe, Session,
Port, pending-request, and listener cleanup.

#### Scenario: Current plugin closes its own Page

- **WHEN** a current ready Plugin Page Session calls `ui.close` and the target
  still matches the active Page when the response is delivered
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

### Requirement: actions.open MUST be limited to the calling plugin's currently available local Action

`actions.open` MUST accept only a Contract-valid plugin-local `actionId`. The
Dispatcher MUST derive the global Action ID using the trusted Session
`plugin_id` and the existing projection rule, and MUST resolve and execute it
through the current Launcher Action Registry and Dispatcher. A plugin MUST NOT
submit a global ID, owner, Page route, or executor.

Only an enabled, available, executable Page-only Action owned by the calling
plugin in the current Registry may return `{ opened: true }`. An unknown,
disabled, incompatible, uninstalled, `lensx.core`, or other-plugin target MUST
fail with stable `not_found`. An unknown executor failure MUST map to safe
`internal_error`. No error MUST expose an executor, Registry record, route,
original exception, or Host object.

#### Scenario: Plugin opens its own current Action

- **WHEN** a current Session calls an enabled and available Page Action
  currently projected by the same plugin using its local ID
- **THEN** the Dispatcher derives the global ID from trusted plugin identity
  and reuses the existing Launcher Action Dispatcher
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

### Requirement: Dispatcher MUST preserve stable error, cancellation, and terminal lifecycle semantics

Dispatcher providers MUST produce only a Contract-valid Host API result, a
Contract-valid Host API error, or a Host-private post-response effect that
never crosses the wire. Known domain failures MUST map to closed error codes.
An unknown throw, invalid provider output, or internal failure MUST become
`internal_error` with a fixed safe English message. An original exception,
stack, URL, path, payload, grant, identity, executor, Tauri, Rust, or Host object
MUST NOT enter a plugin-observable result, error, event, or diagnostic.

Every provider MUST check Host cancellation and Session currentness before a
side effect and again after an asynchronous boundary. Cancellation, timeout,
disconnect, Page replacement, disable, uninstall, Host reload, or disposal
MUST prevent every side effect that has not yet occurred. A late result, event,
or effect MUST be dropped and MUST NOT affect a replacement Session.

#### Scenario: Provider throws an unknown exception

- **WHEN** a Context, Navigation, or Action provider throws an unclassified
  exception or returns an internal value that does not match the method
- **THEN** the plugin receives at most a Contract-valid `internal_error` with
  a fixed safe message, or the existing fatal transport path terminates
- **THEN** the original exception, stack, internal value, and Host object do
  not cross the Port

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
- **THEN** other plugin Sessions, Registrations, permissions, and application
  service state are not modified as collateral effects

### Requirement: Delivery MUST prove real production wiring without absorbing later capabilities

Production `PluginRuntimeSlot` MUST install a real Session-scoped Dispatcher
for a current ready lease instead of a fixed unavailable handler. Tests MUST
retain explicit fake or unavailable binding injection. Delivery MUST cover
Dispatcher unit tests, Navigation and Action regressions, all five scoped
storage methods, real SDK and native bridge round trips, concurrency,
cancellation, replacement, cleanup, malicious or stale identity, complete
Context events, response-before-close ordering, persistent storage restart,
bounded diagnostics, and target macOS WKWebView evidence. It MUST prove that
clipboard, permission mutation, arbitrary Tauri, and other removed or private
methods are unavailable.

English architecture, workspace, and validation documentation and their
same-path Simplified Chinese mirrors MUST distinguish the Host API Contract,
transport, Dispatcher, storage, RPC validation, and open-Web versus native
authority boundaries. Root frontend and Rust validation MUST pass without
regression. This capability MUST NOT claim delivery of native clipboard,
permission UI, general RPC quotas, templates, CLI, or development mode.

#### Scenario: Production Dispatcher and storage loops pass

- **WHEN** an external plugin uses only the public Contract and SDK tarballs to
  initialize and call every Host API `0.2.0` method on a real Runtime Session
- **THEN** Context, Page close, same-plugin Action, and scoped persistent
  storage complete through the authenticated current bridge and Host providers
- **THEN** the plugin cannot import Host-private modules, private wire types,
  Tauri, storage paths, cursor codecs, authority coordinators, or executors

#### Scenario: Removed native and permission methods stay unavailable

- **WHEN** a current or legacy plugin requests clipboard, permission mutation,
  an arbitrary Tauri command, or another method outside Host API `0.2.0`
- **THEN** the closed Contract or Dispatcher rejects it without a provider side
  effect or capability projection
- **THEN** focused and WebView evidence does not describe the removed method as
  permission-denied, grantable, or delivered

### Requirement: Dispatcher authority MUST derive only from the current Child WebView Session
Production dispatch MUST accept a request only after native source binding and RPC validation identify the current Child WebView Session. Dispatcher MUST continue to derive plugin/Page/capability/storage namespace from trusted Session facts and MUST receive no plugin-provided WebView label, native handle, origin token, bridge object or Tauri command.

#### Scenario: Current WebView calls a supported method
- **WHEN** a validated bridge request reaches Dispatcher from the current ready Session
- **THEN** existing Host API semantics execute for that Session only

#### Scenario: Old WebView calls a valid method
- **WHEN** a replaced or destroyed source sends an otherwise valid request
- **THEN** request is rejected before provider invocation with zero side effect
