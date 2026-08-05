# Plugin Host API Dispatcher Specification

## Purpose

Define the Host-private, Session-scoped Host API v1 Dispatcher that exposes
only currently implemented capabilities through an authenticated Runtime Port,
while preserving trusted identity, currentness, cancellation, lifecycle, and
public Contract boundaries.

## Requirements

### Requirement: Production Host MUST route requests through a closed Dispatcher bound to a trusted Session

The system MUST create one Host-private Dispatcher binding for every current,
ready Runtime Session. Every dispatch MUST use only the identity frozen in the
authenticated Port lease, a Contract-valid Host API request, a Host-owned
cancellation signal, and current Host service state. A plugin or wire payload
MUST NOT select or override a plugin ID, Page ID, Registration revision,
Runtime attempt, origin, grant, provider, executor, Tauri command, storage
namespace, path, or other Host object.

The Dispatcher MUST use a closed dispatch table for the Host API `0.1.0`
method catalog. An unknown or malformed method in the normal production path
MUST be rejected by the Contract or transport before reaching a handler. A
defensive direct dispatch MUST fail with stable `method_not_found`. A declared
method without a current production provider MUST fail with stable
`unavailable` and MUST NOT produce a side effect. The five `storage.*` methods
MUST route only to the Host-private scoped-storage provider. `clipboard.read`
and `clipboard.write` MUST route only to the Host-private, permission-backed
plain-text clipboard provider, and MUST reauthorize the current Session against
current Host facts before every native effect.

#### Scenario: Current Session calls an implemented method

- **WHEN** a current ready Session sends a Contract-valid
  `runtime.get_context`, `ui.close`, `actions.open`, `storage.get`,
  `storage.set`, `storage.delete`, `storage.list`, `storage.get_quota`,
  `clipboard.read`, or `clipboard.write` request through its authenticated Port
- **THEN** the Host adapter passes the lease identity, validated request, and
  Host-owned cancellation signal to that Session's Dispatcher
- **THEN** the Dispatcher invokes only the narrow provider for that method and
  does not allow the request to select an identity, storage namespace, path,
  native clipboard object, permission decision, or executor

#### Scenario: Plugin attempts to forge authority

- **WHEN** a request, private frame, or plugin code attempts to submit a
  plugin or Page identity, origin, grant, Registration revision, provider,
  executor, Tauri command, storage namespace, path, or Host object
- **THEN** the exact Contract or transport boundary rejects that value before
  the Dispatcher, or the Dispatcher ignores every authority value not derived
  from the lease
- **THEN** no plugin, Page, Registration, permission, storage namespace, or
  Host service is operated through the forged value

#### Scenario: Method is unknown or its provider is unavailable

- **WHEN** a caller invokes a method outside the Host API catalog, invokes a
  storage method while its provider is unavailable, or invokes a clipboard
  method while its native or permission provider is unavailable
- **THEN** an unknown method fails with stable `method_not_found`, and a
  declared but unavailable method fails with stable `unavailable`
- **THEN** the Dispatcher invokes no fallback storage, clipboard, browser,
  native, permission, or arbitrary executor

#### Scenario: Clipboard authorization is absent

- **WHEN** a current Session invokes a clipboard method that its Manifest did
  not request or its current Registration did not grant
- **THEN** the Dispatcher returns stable `permission_denied`
- **THEN** no native clipboard read or write occurs, and clipboard content does
  not enter an error or diagnostic

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

`runtime.get_context` MUST accept exact `{}` and return a complete,
Contract-valid, copied, and frozen Runtime Context. Context fields MUST contain
only the Contract's current Host API SemVer, current `en-US | zh-CN` locale,
current `light | dark` theme, and a sorted and deduplicated list of capability
method IDs.

A capability MUST mean that the Host currently has a real provider, the
provider is available to the current Session, and current authorization permits
the call. Production capabilities delivered through the Dispatcher MUST include
the real `runtime.get_context`, `ui.close`, `actions.open`, `storage.get`,
`storage.set`, `storage.delete`, `storage.list`, and `storage.get_quota`
providers while their corresponding Host services and current namespace remain
available. `clipboard.read` and `clipboard.write` MUST appear independently only
when the current platform has the narrow native provider, the permission
catalog supports that method, and the Session identity contains the
corresponding actual grant. Context MUST NOT include plugin or Page identity,
source, Manifest requests, raw grants, Registration revision, storage usage,
clipboard content, paths, executors, or Host lifecycle objects.

While the same Session remains current, a real locale, theme, or capability
snapshot change, including confirmed storage-provider degradation or recovery,
MUST publish a complete `runtime.context_changed` replacement. An identical
snapshot MUST NOT be published again. Invalidation of identity,
Registration revision, resource generation, Runtime attempt, or grant snapshot
MUST terminate the old Session and MUST NOT reauthorize it through an event.

#### Scenario: SDK initializes from a real Context

- **WHEN** the official iframe transport sends its initialization
  `runtime.get_context` request on a current ready Session whose storage
  provider is available and whose identity has one currently supported
  clipboard grant
- **THEN** the Dispatcher returns the current Host API version, locale, theme,
  and sorted callable capability snapshot including all five storage methods
  and only the granted clipboard method
- **THEN** the SDK passes Contract validation and can call those methods without
  receiving the former production placeholder `unavailable`

#### Scenario: Unavailable capabilities are excluded from Context

- **WHEN** scoped storage is unavailable, the native clipboard provider is
  unavailable, or the Session lacks one clipboard grant
- **THEN** Context capabilities exclude only the affected methods
- **THEN** catalog membership, a Manifest permission request, official
  provenance, or a stale grant snapshot does not turn a method into a current
  capability

#### Scenario: Storage namespace becomes degraded

- **WHEN** the Host confirms that the current identity's storage namespace is
  damaged or blocked while the same Session otherwise remains current
- **THEN** the Host publishes one complete Context replacement without the five
  storage methods and does not modify unrelated capabilities
- **THEN** an identical degraded snapshot is not emitted repeatedly and no
  storage path, value, usage, or diagnostic enters Context

#### Scenario: Locale or theme changes

- **WHEN** the application locale or theme changes while the current Session's
  trusted identity and capability availability remain valid
- **THEN** the Host sends one complete, Contract-valid, and frozen Context
  replacement
- **THEN** the SDK replaces the entire Context before notifying subscribers,
  and the plugin observes no Host-private state

#### Scenario: Session authority changes

- **WHEN** a Registration revision, resource generation, Runtime attempt, or
  grant snapshot change makes the old Session identity no longer current
- **THEN** the old Session terminates through the existing lifecycle and
  rejects new calls, including clipboard calls initiated before event
  convergence
- **THEN** `runtime.context_changed` does not give the old Session a new
  identity or reauthorize it

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

Production `PluginRuntimeFrame` MUST install a real Session-scoped Dispatcher
for a current ready lease instead of a fixed unavailable handler. Tests MUST
retain explicit fake or unavailable binding injection. Delivery MUST cover
Dispatcher unit tests, Navigation and Action regressions, all five scoped
storage methods, both independently authorized clipboard methods, real SDK and
MessageChannel round trips, concurrency, cancellation, replacement, cleanup,
malicious or stale identity, complete Context events, response-before-close
ordering, persistent storage restart, permission revocation, bounded native
clipboard evidence, and target macOS WKWebView evidence.

English architecture, workspace, and validation documentation and their
same-path Simplified Chinese mirrors MUST distinguish delivery status for the
Host API Contract, transport, Dispatcher, permission, storage, and RPC
validation. Root frontend build, type checking, tests, formatting and static
checks, plus Rust formatting, tests, and static checks, MUST pass without
regression. This capability MUST NOT claim delivery of permission prompts or
settings, general RPC limits, templates, CLI, or development mode.

#### Scenario: Production Dispatcher, storage, and clipboard loops pass

- **WHEN** an external plugin uses only the public Contract and SDK tarballs to
  initialize and call the ten implemented methods on a real Runtime Session
- **THEN** Context, Page close, same-plugin Action, scoped persistent storage,
  and independently granted plain-text clipboard operations complete through
  the same authenticated Port and real Host providers with stable results,
  errors, isolation, per-call authorization, and terminal cleanup
- **THEN** the plugin neither needs nor can import Host-private modules, private
  wire types, Tauri, storage paths, cursor codecs, native clipboard objects,
  permission coordinators, or executors

#### Scenario: Permission UI and RPC limits remain undelivered

- **WHEN** the Task 5.5 focused and complete validation gates pass while the
  permission UI and RPC-limit changes remain incomplete
- **THEN** scoped `storage.*` methods and currently granted clipboard methods
  are callable, while permission prompts, settings, and general RPC limits
  remain unavailable
- **THEN** the Roadmap and documentation mark Task 5.5 complete but do not
  describe Task 5.6 or Milestone 5 as complete
