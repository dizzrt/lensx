# Plugin Host API Contract Specification

## Purpose

Define the stable, bounded, and independently validatable public semantic
contract for Host API `0.2.0` without claiming delivery of transport, dispatch,
permissions, or Host-side effects.
## Requirements
### Requirement: Host API v1 MUST expose one closed, versioned semantic catalog

The public Host API MUST expose an independently versioned `0.2.0` closed semantic catalog containing only the current methods, requests, results, events, and bounded errors for `actions.open`, `runtime.get_context`, plugin-scoped storage, and `ui.close`. The catalog MUST NOT contain `clipboard.read`, `clipboard.write`, Host API permission types, permission-requirement mappings, or any Tauri or native executor. Unknown or removed methods MUST fail closed through the Contract and Dispatcher.

#### Scenario: Consumer reads the Host API 0.2.0 catalog
- **WHEN** an external consumer reads generated types and the runtime catalog
- **THEN** it sees only current non-privileged, Session-bound methods and the independent version
- **THEN** no clipboard method, permission catalog, grant helper, or private transport type exists

#### Scenario: Legacy plugin calls clipboard
- **WHEN** a plugin sends a `clipboard.read`, `clipboard.write`, or Host API `0.1.0` request
- **THEN** the Contract or Dispatcher returns an incompatible, method-not-found, or stable unavailable result without a native effect
- **THEN** installation facts do not automatically authorize the legacy call

#### Scenario: Consumer requests an undeclared method

- **WHEN** a consumer validates `system.open_external`, an arbitrary string, or another undeclared method
- **THEN** the Contract rejects the method with stable `method_not_found` semantics
- **THEN** an unknown method does not become a capability merely because it matches a naming convention

#### Scenario: Official provenance attempts to expand the catalog

- **WHEN** a plugin's source, Publisher, or future signature state indicates official provenance
- **THEN** its catalog and payload Schemas are exactly the same as those for an external plugin
- **THEN** official provenance receives no hidden method or Host-authority bypass

### Requirement: Runtime Context MUST be the single capability-discovery snapshot

`PluginRuntimeContext` MUST continue to contain the Host API version, locale, theme, and the complete, sorted, unique method-capability set actually composed for the current Session. Capabilities MUST derive only from the current trusted Session, provider availability, and Host facts. They MUST NOT contain permissions, grants, Manifest reasons, Publisher, source, network, Worker, or other ordinary Web capabilities. Ordinary Web capabilities are determined by the Runtime baseline and are not discovered through Host API Context.

`runtime.get_context` MUST accept exact empty parameters and return a read-only, copied, and frozen Context. `runtime.context_changed` MUST carry a complete independently validatable Context replacement rather than a field patch. A change that invalidates trusted Session identity MUST terminate the old Session and MUST NOT reauthorize it through the event alone.

#### Scenario: New Session receives Context
- **WHEN** the current plugin completes Session and SDK initialization
- **THEN** Context returns Host API `0.2.0` and the current non-privileged method capabilities
- **THEN** an empty capability set remains valid and does not mean that Worker, network, or other Web capabilities were denied

#### Scenario: Provider or context changes
- **WHEN** locale, theme, non-privileged provider availability, or Session currentness changes
- **THEN** the Host sends a complete replacement Context or terminates the old Session
- **THEN** no grant mutation or permission-driven hot injection exists

#### Scenario: Locale or theme changes without invalidating identity

- **WHEN** the current Session remains valid while the application locale or theme changes
- **THEN** `runtime.context_changed` carries the complete new Context snapshot
- **THEN** the plugin no longer treats a method omitted from the new snapshot as currently callable

#### Scenario: Plugin supplies trusted Context fields

- **WHEN** parameters, an event, or another author-controlled payload attempts to submit identity, source, Host API version, locale, theme, or a capability override
- **THEN** the exact Schema rejects extra fields or a Context from the wrong source
- **THEN** plugin input cannot change Host-derived Runtime facts

### Requirement: Session-scoped UI and Action methods MUST NOT become general Host executors

`ui.close` MUST accept exact empty params and can only request that the current
plugin Page Session that made the call be closed. It MUST complete the
transport handoff of the `{ accepted: true }` success result before scheduling
Host-owned terminal teardown. It MUST NOT accept a window, Page, plugin, route,
or application target.

`actions.open` MUST accept only a plugin-local `actionId` that follows the
caller's Manifest Action ID rules, and MUST return `{ opened: true }`. The Host
MUST derive the global Action ID from the trusted Session plugin ID and can
only resolve a currently available, Page-only Action in the current Registry
that belongs to that plugin. It MUST NOT invoke `lensx.core`, another plugin's
Action, an unknown or disabled Action, or a plugin-supplied executor.

#### Scenario: Current plugin closes its own Page

- **WHEN** the current ready Session calls `ui.close` with `{}`
- **THEN** the Host API success semantics are `{ accepted: true }`
- **THEN** closing after the response handoff remains controlled by Host
  currentness checks and terminal lifecycle handling

#### Scenario: Plugin attempts to choose a close target

- **WHEN** `ui.close` params contain a plugin ID, Page ID, window ID, route, or
  any other field
- **THEN** the exact params Schema rejects the request with `invalid_params`
- **THEN** the current Page, other plugin Pages, and application windows cannot
  be selected by the invalid payload

#### Scenario: Plugin opens its own available Action

- **WHEN** the current Session calls `actions.open` with a valid local
  `actionId` and a projected Page-only Action with the same owner is currently
  available
- **THEN** the Host can derive the global ID and return `{ opened: true }`
- **THEN** the payload neither needs nor permits plugin identity, a global ID,
  route, or executor

#### Scenario: Plugin targets another provider or unavailable Action

- **WHEN** `actionId` attempts to express a global, core, or other plugin
  Action, or the local Action is unknown, disabled, incompatible, uninstalled,
  or currently unavailable
- **THEN** the Contract or later Host rejects it with stable `invalid_params`
  or `not_found` semantics
- **THEN** the Dispatcher does not execute an arbitrary Host or cross-plugin
  Action

### Requirement: Private storage methods MUST derive namespace from trusted Session identity

Host API v1 MUST define `storage.get`, `storage.set`, `storage.delete`,
`storage.list`, and `storage.get_quota`. A key MUST be a bounded, non-empty
string. A value MUST be JSON-compatible and MUST NOT accept a function, symbol,
bigint, cyclic object, DOM object, Tauri object, or Host object. Storage params
MUST NOT accept a plugin ID, namespace, path, or installation location.

`storage.get` MUST distinguish `{ found: false }` from
`{ found: true, value }`. `storage.delete` MUST report whether an existing key
was deleted.
`storage.list` MUST return keys in stable, paginated order with an opaque
continuation cursor and MUST NOT return values in bulk. `storage.get_quota`
MUST return a non-negative safe-integer `usedBytes` and a positive safe-integer
`limitBytes` for the current namespace. A later storage capability defines
concrete persistence, total capacity, per-value byte limits, and corruption
recovery, but MUST NOT change these v1 discriminated structures.

#### Scenario: Plugin stores and reads JSON data

- **WHEN** the current Session calls `storage.set` with a valid key and
  JSON-compatible value and then calls `storage.get`
- **THEN** the success structures are `{ stored: true }` and
  `{ found: true, value }`, respectively
- **THEN** the namespace is always derived from the current trusted Session
  plugin ID

#### Scenario: Plugin reads or deletes a missing key

- **WHEN** the requested key does not exist in the current namespace
- **THEN** `storage.get` returns `{ found: false }` without a value
- **THEN** `storage.delete` returns `{ deleted: false }` rather than leaking
  whether another namespace contains the same key

#### Scenario: Plugin lists an empty or paged namespace

- **WHEN** the current namespace is empty or its key count exceeds the current
  page limit
- **THEN** `storage.list` returns empty `keys`, or the current page in stable
  sort order with an opaque `nextCursor`, respectively
- **THEN** the response contains no values, other plugin keys, physical paths,
  or internal storage keys

#### Scenario: Plugin queries its quota

- **WHEN** the current Session calls `storage.get_quota`
- **THEN** the result contains only `usedBytes` and `limitBytes` for the current
  namespace
- **THEN** the result does not expose other plugins' usage, application
  preference usage, or underlying filesystem capacity

#### Scenario: Plugin supplies another namespace or non-JSON value

- **WHEN** params contain a plugin ID, namespace, path, Host object, or a value
  that is not JSON-compatible
- **THEN** the exact Schema or pure Runtime validator rejects them with
  `invalid_params`
- **THEN** invalid input cannot reach a later storage handler

### Requirement: Semantic payload Schemas MUST be exact, paired and independently validatable

The system MUST provide Draft 2020-12 JSON Schemas and corresponding generated
TypeScript types for every method's params and result, every event payload,
and the Host API error. Objects MUST reject unknown fields, methods MUST pair
only with their declared params and results, and validators MUST accept
`unknown`, leave input unchanged, and return either frozen canonical values or
bounded diagnostics in a stable sort order by JSON Pointer path and code.

Public semantic Schemas MUST NOT contain request IDs, nonces, origins,
`Window`, `MessagePort`, `postMessage`, a JSON-RPC envelope, plugin identity,
Registration revision, a resource token, a Tauri command, or a Host-private
error.

#### Scenario: Valid method payload round-trips through validators

- **WHEN** a consumer submits the declared params and result fixtures for every
  method in the catalog
- **THEN** pure validators accept and return frozen values consistent with the
  Schema semantics
- **THEN** repeated validation produces byte-equivalent normalized output

#### Scenario: Method and payload are mismatched

- **WHEN** `actions.open` carries storage params or `storage.get` carries an
  Action result
- **THEN** the validator rejects the incorrect pairing with stable path and
  code diagnostics
- **THEN** a payload cannot enter the wrong handler merely because it is valid
  JSON on its own

#### Scenario: Payload contains private transport or identity fields

- **WHEN** a payload adds a request ID, nonce, origin, plugin ID, grant, path,
  Tauri command, or executor
- **THEN** the exact Schema rejects the extra fields
- **THEN** diagnostics do not echo sensitive field values or the raw payload

### Requirement: Host API errors MUST be stable, bounded and separate from SDK lifecycle errors

Host API `0.2.0` MUST define the closed error-code set `invalid_request`,
`invalid_params`, `method_not_found`, `not_found`,
`conflict`, `limit_exceeded`, `unavailable`, `cancelled`, `timeout`, and
`internal_error`. An error value MUST contain only a code and a stable,
bounded, non-localized, safe message. It MUST NOT contain a raw exception,
stack, URL, path, payload, grant, Host object, Rust object, Tauri object, or
localized product copy.

A Host API error MUST remain discriminable from SDK lifecycle errors such as
`disposed`, `disconnected`, and `transport_failure`. A future transport MUST
NOT collapse a valid Host API rejection into `transport_failure`.

#### Scenario: Handler failure is exposed safely

- **WHEN** a later Host handler throws an unknown exception or returns an
  invalid internal value
- **THEN** the plugin receives only `internal_error` and a safe message
- **THEN** the original exception, stack, path, payload, and Host object do not
  enter the public error

#### Scenario: Consumer handles a stable rejection

- **WHEN** a plugin catches `not_found`, `limit_exceeded`, or `unavailable`
- **THEN** the plugin can branch on the code without matching message text
- **THEN** the message language does not change with the application locale

#### Scenario: Transport disconnects before a Host result exists

- **WHEN** the Session or transport disconnects before a Host API success or
  rejection exists
- **THEN** the SDK preserves its `disconnected` lifecycle semantics rather than
  inventing a Host API `internal_error`
- **THEN** the two error sources remain predictable

### Requirement: Host API evolution MUST use capability discovery and explicit deprecation

The Host API protocol, SDK package, and lensX application MUST be versioned
independently. The SDK MUST check its Host API support range using SemVer before
accepting Runtime Context, and a plugin MUST call only methods declared in the
current Context `capabilities`. A compatible new method MUST increase the Host
API minor version and be exposed through capability discovery. An incompatible
change to an existing payload or error behavior, or removal of a
method, MUST increase the Host API major version. A deprecated method MUST
retain its original semantics, be marked in the specification and
machine-readable catalog, and remain for at least one compatible minor window
before it can be removed in a major version.

#### Scenario: New compatible method appears

- **WHEN** a future Host API minor version adds a method and the SDK's support
  range includes that version
- **THEN** old plugins can continue using their known capabilities, and new
  plugins call the new method only after Context declares it
- **THEN** a package patch does not masquerade as a protocol addition

#### Scenario: Host version is incompatible

- **WHEN** Runtime Context's Host API SemVer does not satisfy the SDK support
  range
- **THEN** SDK initialization fails with `incompatible_host_api` and does not
  enter `ready`
- **THEN** the capability snapshot cannot bypass version incompatibility

#### Scenario: Method is deprecated

- **WHEN** a method is marked deprecated in a compatible minor version
- **THEN** the catalog and maintained documentation provide a stable
  replacement direction while preserving the method's params, result, and
  error semantics
- **THEN** removal occurs only in a declared incompatible major version

### Requirement: Contract delivery MUST prove cross-consumer drift without claiming execution

Delivery MUST include a Schema and generated-type drift gate; valid and
invalid fixtures covering every method, result, event, and error;
TypeScript and Rust shared-fixture agreement; package boundary tests; an
outside-the-repository no-DOM consumer of real Contract and SDK tarballs; and
maintained English and Chinese documentation with equivalent semantics. Gates
MUST prove that public exports do not leak Host-private types and that
`PluginSdkClient` still has no raw method entry or concrete Host API execution
capability.

This capability MUST NOT register a Tauri command, send a MessagePort request,
execute Action, close, native clipboard, or storage side effects, create Host authority,
or claim that the Milestone 5 Runtime call chain has been delivered.

#### Scenario: Complete contract gate passes

- **WHEN** the focused Host API Contract gate and root validation run
- **THEN** Schema, generated types, catalog, fixtures, TypeScript, Rust,
  tarball, and documentation boundaries all agree
- **THEN** an outside-the-repository consumer can independently validate the
  contract without React, DOM, Tauri, or Host-private source

#### Scenario: Public types drift from Schema or catalog

- **WHEN** any method, Context, event, error, or payload fact
  changes in only one consumer
- **THEN** at least one generation check, shared fixture, package boundary, or
  tarball gate fails
- **THEN** the drifted artifact is not considered publishable

#### Scenario: Contract completes before transport and dispatch

- **WHEN** every validation for this change passes while Tasks 5.2 through 5.6
  remain undelivered
- **THEN** Host API v1 can be specified, represented by generated types, and
  independently validated
- **THEN** a plugin still cannot issue or execute a real Host API request
  through the public SDK

### Requirement: Host API semantic values MUST remain independent of native WebView transport
The public Host API version and method/result/event semantics MUST remain unchanged by the container migration. Runtime Context, capabilities, requests, results, errors and events MUST NOT contain Child WebView label/handle, bounds, bridge objects, private frames, Session nonce, origin token, Tauri/Wry types or process facts. No method may be added solely to resize, focus, navigate or configure the native view.

#### Scenario: Public Contract declarations are inspected
- **WHEN** release validation compares Host API `0.2.x` before and after migration
- **THEN** semantic shapes and capability discovery remain stable while native implementation facts stay private

#### Scenario: Plugin requests WebView control
- **WHEN** a plugin constructs an unknown native-view method or extra trusted fields
- **THEN** Contract validation rejects it before transport or Dispatcher side effects

