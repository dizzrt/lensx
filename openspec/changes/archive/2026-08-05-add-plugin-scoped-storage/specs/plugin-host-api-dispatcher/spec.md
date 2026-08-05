## MODIFIED Requirements

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
MUST route only to the Host-private scoped-storage provider; `clipboard.*`
MUST remain unavailable until its native and permission providers are complete.

#### Scenario: Current Session calls an implemented method

- **WHEN** a current ready Session sends a Contract-valid
  `runtime.get_context`, `ui.close`, `actions.open`, `storage.get`,
  `storage.set`, `storage.delete`, `storage.list`, or `storage.get_quota`
  request through its authenticated Port
- **THEN** the Host adapter passes the lease identity, validated request, and
  Host-owned cancellation signal to that Session's Dispatcher
- **THEN** the Dispatcher invokes only the narrow provider for that method and
  does not allow the request to select an identity, storage namespace, path, or
  executor

#### Scenario: Plugin attempts to forge authority

- **WHEN** a request, private frame, or plugin code attempts to submit a
  plugin or Page identity, origin, grant, Registration revision, provider,
  executor, Tauri command, storage namespace, path, or Host object
- **THEN** the exact Contract or transport boundary rejects that value before
  the Dispatcher, or the Dispatcher ignores every authority value not derived
  from the lease
- **THEN** no plugin, Page, Registration, permission, storage namespace, or
  Host service is operated through the forged value

#### Scenario: Method is unknown or not yet implemented

- **WHEN** a caller invokes a method outside the Host API catalog, invokes a
  storage method while its provider is not currently available, or invokes
  `clipboard.*` before complete native and permission providers exist
- **THEN** an unknown method fails with stable `method_not_found`, and a
  declared but unavailable method fails with stable `unavailable`
- **THEN** the Dispatcher invokes no fallback storage, clipboard, native,
  permission, or arbitrary executor

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
available. `clipboard.*` without complete current permission and native
providers MUST NOT appear. Context MUST NOT include plugin or Page identity,
source, Manifest requests, raw grants, Registration revision, storage usage,
paths, executors, or Host lifecycle objects.

While the same Session remains current, a real locale, theme, or capability
snapshot change, including confirmed storage-provider degradation or recovery,
MUST publish a complete `runtime.context_changed` replacement. An identical
snapshot MUST NOT be published again. Invalidation of identity, Registration
revision, resource generation, Runtime attempt, or grant snapshot MUST terminate
the old Session and MUST NOT reauthorize it through an event.

#### Scenario: SDK initializes from a real Context

- **WHEN** the official iframe transport sends its initialization
  `runtime.get_context` request on a current ready Session whose storage provider
  is available
- **THEN** the Dispatcher returns the current Host API version, locale, theme,
  and sorted callable capability snapshot including all five storage methods
- **THEN** the SDK can pass Contract validation and call storage without
  receiving the former production placeholder `unavailable`

#### Scenario: Unavailable capabilities are excluded from Context

- **WHEN** the scoped-storage provider is unavailable for the current identity,
  or clipboard native and permission providers are not delivered
- **THEN** Context capabilities exclude the affected methods
- **THEN** catalog membership, a Manifest permission request, official
  provenance, or old grant snapshot does not turn a method into a current
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
  rejects new calls
- **THEN** `runtime.context_changed` does not give the old Session a new
  identity or reauthorize it

### Requirement: Delivery MUST prove real production wiring without absorbing later capabilities

Production `PluginRuntimeFrame` MUST install a real Session-scoped Dispatcher
for a current ready lease instead of a fixed unavailable handler. Tests MUST
retain explicit fake or unavailable binding injection. Delivery MUST cover
Dispatcher unit tests, Navigation and Action regressions, all five scoped
storage methods, real SDK and MessageChannel round trips, concurrency,
cancellation, replacement, cleanup, malicious or stale identity, complete
Context events, response-before-close ordering, persistent storage restart and
target macOS WKWebView evidence.

English architecture, workspace, and validation documentation and their
same-path Simplified Chinese mirrors MUST distinguish delivery status for the
Host API Contract, transport, Dispatcher, permission, storage, and RPC
validation. Root frontend build, type checking, tests, formatting and static
checks, plus Rust formatting, tests, and static checks, MUST pass without
regression. This capability MUST NOT claim delivery of clipboard native
execution, complete permission management, general RPC limits, templates, CLI,
or development mode.

#### Scenario: Production Dispatcher and storage loop passes

- **WHEN** an external plugin uses only the public Contract and SDK tarballs to
  initialize and call the eight implemented methods on a real Runtime Session
- **THEN** Context, Page close, same-plugin Action and scoped persistent storage
  complete through the same authenticated Port and real Host providers with
  stable results, errors, isolation and terminal cleanup
- **THEN** the plugin neither needs nor can import Host-private modules, private
  wire types, Tauri, storage paths, cursor codecs, or executors

#### Scenario: Later methods remain undelivered

- **WHEN** the Task 5.4 focused and complete validation gates pass while the
  permission or RPC-limit changes remain incomplete
- **THEN** scoped `storage.*` methods are callable, while `clipboard.*` remains
  excluded from current capabilities and fails closed with stable errors
- **THEN** the Roadmap and documentation mark Task 5.4 complete but do not
  describe Task 5.5, Task 5.6, or Milestone 5 as complete
