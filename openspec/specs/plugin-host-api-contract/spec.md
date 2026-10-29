# Plugin Host API Contract Specification

## Purpose

Define the stable, bounded, and independently validatable public semantic
contract for Host API `0.4.0` without claiming delivery of transport, dispatch,
permissions, or Host-side effects.
## Requirements

### Requirement: Host API v1 MUST expose one closed, versioned semantic catalog

The public Host API MUST provide an independently versioned `0.4.0` closed semantic catalog, including the existing nine methods plus `actions.get_activation` and `actions.subscribe_activations`, with paired requests, results, events, and bounded errors. Existing method parameter, result, and error semantics MUST be preserved.

#### Scenario: Public HTTP remains generic plugin transport

- **WHEN** a plugin invokes the public http.request method
- **THEN** `http.request` MUST be generic HTTP transport with the same contract and control boundary for every plugin; translation business logic, language decisions, service signing, and credential configuration MUST remain in plugins.

#### Scenario: The public catalog and dispatcher exclude prohibited methods

- **WHEN** the public Host API catalog is inspected or any Host method request is dispatched
- **THEN** The catalog MUST NOT contain `clipboard.read`, `clipboard.write`, permission types, permission-requirement mappings, arbitrary Tauri commands, or general native executors.
- **THEN** Unknown or removed methods MUST fail closed through the Contract and Dispatcher.

#### Scenario: Consumer reads the Host API 0.3.0 catalog
- **WHEN** an external consumer still uses the generated types and closed nine-method catalog of old Host API `0.3.0`
- **THEN** that old catalog declares only its existing Session-bound methods, HTTP remains controlled transport semantics, and current Action activation is absent
- **THEN** the consumer must upgrade Contract/SDK to use the new activation contract; the old catalog still excludes clipboard methods, permission catalogs, grant helpers, private transport types, and translation-specific native methods

#### Scenario: Consumer reads the Host API 0.2.0 catalog
- **WHEN** an existing consumer still uses the old Host API `0.2.0` eight-method closed catalog
- **THEN** the new `http.request` MUST NOT be described as supported by that old catalog, and the consumer must upgrade Contract/SDK to understand the new catalog
- **THEN** old packages outside the new Host version range are explicitly incompatible; silent catalog filtering does not bypass declarations

#### Scenario: Legacy plugin calls clipboard
- **WHEN** a plugin sends `clipboard.read`, `clipboard.write`, or an incompatible old Host API request
- **THEN** the Contract or Dispatcher returns an incompatible, method-not-found, or stable unavailable result without a native side effect
- **THEN** installation facts do not automatically authorize the old call

#### Scenario: Consumer requests an undeclared method
- **WHEN** a consumer validates `system.open_external`, an arbitrary string, or another undeclared method
- **THEN** the Contract rejects it with stable `method_not_found` semantics
- **THEN** a method does not become a capability merely by matching a naming convention

#### Scenario: Official provenance attempts to expand the catalog
- **WHEN** a plugin's source, Publisher, or future signature state indicates official provenance
- **THEN** it uses the same method catalog, payload Schema, and HTTP control boundary as external plugins
- **THEN** official provenance provides no hidden method, translation-specific native shortcut, or Host-authority bypass

#### Scenario: Current consumer reads the Host API 0.4.0 catalog
- **WHEN** a consumer reads the current Schema, generated types, and method catalog
- **THEN** it sees eleven Session-bound methods and independent version `0.4.0`, with events including `runtime.context_changed` and `actions.activated`
- **THEN** the activation contract excludes shortcut configuration, actual keys, global input subscriptions, native input permissions, and plugin executors

### Requirement: Runtime Context MUST be the single capability-discovery snapshot

`PluginRuntimeContext` MUST contain the Host API version, locale, theme, and a complete, sorted, unique capability set of methods actually available to the current Session.

#### Scenario: The Host constructs the current capability set

- **WHEN** a Runtime Context is created from current Session and provider facts
- **THEN** Capabilities MUST derive only from the trusted current Session, provider availability, and Host facts; they MUST NOT contain permissions, grants, Manifest reasons, Publisher, source, or ordinary browser Worker/network capabilities.
- **THEN** Browser capabilities remain determined by the Web Runtime.
- **THEN** Public controlled `http.request` is a separate Host method and MUST appear in capabilities only when the current HTTP provider is available; it does not indicate a change to browser CORS policy.

#### Scenario: Context retrieval or replacement crosses a Session boundary

- **WHEN** runtime.get_context or runtime.context_changed supplies Context or trusted Session identity is invalidated
- **THEN** `runtime.get_context` MUST accept exact empty parameters and return a readonly, copied, frozen Context.
- **THEN** `runtime.context_changed` MUST carry a complete independently validatable Context replacement, not a partial patch.
- **THEN** Invalidation of trusted Session identity MUST terminate the old Session and MUST NOT reauthorize it through an event alone.

#### Scenario: New Session receives Context
- **WHEN** the current plugin completes Session and SDK initialization
- **THEN** Context returns Host API `0.4.0` and the methods actually available now; available HTTP and Action activation methods are declared through capabilities
- **THEN** an empty capability set remains valid and does not mean ordinary browser Worker/network capabilities were denied

#### Scenario: Provider or context changes
- **WHEN** locale, theme, provider availability, or Session currentness changes
- **THEN** the Host sends a complete Context replacement or terminates the old Session
- **THEN** no grant mutation or permission-driven hot injection occurs

#### Scenario: Locale or theme changes without invalidating identity
- **WHEN** the application locale or theme changes while the current Session remains valid
- **THEN** `runtime.context_changed` carries the complete new Context
- **THEN** the plugin no longer treats methods omitted from the new snapshot as callable capabilities

#### Scenario: Plugin supplies trusted Context fields
- **WHEN** parameters, events, or author-controlled payloads attempt to submit identity, source, Host API version, locale, theme, or capability overrides
- **THEN** the exact Schema rejects extra fields or a Context from the wrong source
- **THEN** plugin input cannot change Host-derived Runtime facts

#### Scenario: Activation information remains independent of Runtime Context
- **WHEN** a new invocation enters the current plugin Page or the client queries Runtime Context
- **THEN** Context still contains exactly four fields: `hostApiVersion`, `locale`, `theme`, and `capabilities`
- **THEN** Action invocation source is not transmitted as a fifth field or an extra `runtime.context_changed` field; activation queries and events use an independent contract

### Requirement: Session-scoped UI and Action methods MUST NOT become general Host executors

`ui.close` MUST accept exact empty params and can only request that the current plugin Page Session that made the call be closed.

#### Scenario: The current Session requests closure

- **WHEN** a plugin invokes ui.close
- **THEN** It MUST complete the transport handoff of the `{ accepted: true }` success result before scheduling Host-owned terminal teardown.
- **THEN** It MUST NOT accept a window, Page, plugin, route, or application target.

#### Scenario: A Session opens its own Page Action

- **WHEN** a plugin invokes actions.open
- **THEN** `actions.open` MUST accept only a plugin-local `actionId` that follows the caller's Manifest Action ID rules, and MUST return `{ opened: true }`.
- **THEN** The Host MUST derive the global Action ID from the trusted Session plugin ID and can only resolve a currently available, Page-only Action in the current Registry that belongs to that plugin.
- **THEN** It MUST NOT invoke `lensx.core`, another plugin's Action, an unknown or disabled Action, or a plugin-supplied executor.

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

Host API v1 MUST define `storage.get`, `storage.set`, `storage.delete`, `storage.list`, and `storage.get_quota`.

#### Scenario: Storage parameters remain namespace-neutral JSON

- **WHEN** a public storage request is validated
- **THEN** A key MUST be a bounded, non-empty string.
- **THEN** A value MUST be JSON-compatible and MUST NOT accept a function, symbol, bigint, cyclic object, DOM object, Tauri object, or Host object.
- **THEN** Storage params MUST NOT accept a plugin ID, namespace, path, or installation location.

#### Scenario: Storage results preserve discriminated semantics

- **WHEN** a storage read, delete, list, or quota result is returned or persistence evolves
- **THEN** `storage.get` MUST distinguish `{ found: false }` from `{ found: true, value }`.
- **THEN** `storage.delete` MUST report whether an existing key was deleted.
- **THEN** `storage.list` MUST return keys in stable, paginated order with an opaque continuation cursor and MUST NOT return values in bulk.
- **THEN** `storage.get_quota` MUST return a non-negative safe-integer `usedBytes` and a positive safe-integer `limitBytes` for the current namespace.
- **THEN** A later storage capability defines concrete persistence, total capacity, per-value byte limits, and corruption recovery, but MUST NOT change these v1 discriminated structures.

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

The system MUST provide Draft 2020-12 JSON Schemas and corresponding generated TypeScript types for every method's params and result, every event payload, and the Host API error.

#### Scenario: A semantic payload is validated without transport authority

- **WHEN** a method, result, event, or error is checked against its public Schema
- **THEN** Objects MUST reject unknown fields, methods MUST pair only with their declared params and results, and validators MUST accept `unknown`, leave input unchanged, and return either frozen canonical values or bounded diagnostics in a stable sort order by JSON Pointer path and code.
- **THEN** Public semantic Schemas MUST NOT contain request IDs, nonces, origins, `Window`, `MessagePort`, `postMessage`, a JSON-RPC envelope, plugin identity, Registration revision, a resource token, a Tauri command, or a Host-private error.

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

Host API `0.4.0` MUST preserve the closed error-code set `invalid_request`, `invalid_params`, `method_not_found`, `not_found`, `conflict`, `limit_exceeded`, `unavailable`, `cancelled`, `timeout`, and `internal_error`.

#### Scenario: A failed operation is classified for public transport

- **WHEN** an operation fails or completes with a non-2xx HTTP response
- **THEN** Errors MUST contain only a code and a stable, bounded, non-localized, safe message; they MUST NOT contain raw exceptions, stacks, URLs, paths, payloads, request/response bodies, authorization headers, grants, Host/Rust/Tauri objects, or localized product copy.
- **THEN** Completed non-2xx HTTP responses MUST follow the `http.request` result contract rather than be mistaken for Host transport errors.

#### Scenario: Transport preserves a valid Host rejection

- **WHEN** an SDK consumer receives a Host API error alongside lifecycle failures
- **THEN** Host API errors MUST remain distinguishable from SDK lifecycle errors such as `disposed`, `disconnected`, and `transport_failure`.
- **THEN** Transport MUST NOT collapse a valid Host API rejection into `transport_failure`.

#### Scenario: Handler failure is exposed safely
- **WHEN** a Host handler throws an unknown exception or returns an invalid internal value
- **THEN** the plugin receives only `internal_error` and a safe message
- **THEN** raw exceptions, stacks, paths, payloads, and Host objects do not enter public errors

#### Scenario: Consumer handles a stable rejection
- **WHEN** a plugin catches `not_found`, `limit_exceeded`, or `unavailable`
- **THEN** it can branch on the code without matching message text
- **THEN** message language does not change with the application locale

#### Scenario: Transport disconnects before a Host result exists
- **WHEN** the Session or transport disconnects before a Host API success or rejection exists
- **THEN** the SDK preserves `disconnected` lifecycle semantics rather than inventing Host API `internal_error`
- **THEN** the two error sources remain predictable

### Requirement: Host API evolution MUST use capability discovery and explicit deprecation

The Host API protocol, SDK package, and lensX application MUST be versioned independently.

#### Scenario: A compatible Host API extension is introduced

- **WHEN** the SDK checks a Runtime Context or the Host introduces a compatible method
- **THEN** The SDK MUST check its supported range with SemVer before accepting Runtime Context; plugins MUST invoke only methods declared in current Context `capabilities`.
- **THEN** Compatible new methods MUST increase the Host API minor version and be exposed through capability discovery.
- **THEN** This Action activation extension MUST use Host API `0.4.0` while preserving existing method payload and error semantics, including HTTP introduced in `0.3.0`; Manifest and SDK support ranges MUST still be validated independently.
- **THEN** Existing plugin packages outside those ranges MUST be explicitly incompatible and require authors to upgrade the SDK, update declarations, and repack.
- **THEN** The Host MUST NOT silently negotiate an old catalog, hide new methods to impersonate an old protocol, or rewrite installed packages.

#### Scenario: An existing method is deprecated changed or removed

- **WHEN** Host API evolution changes an existing payload or error contract or removes a method
- **THEN** Incompatible changes to existing payload/error behavior or method removal MUST increase the Host API major version.
- **THEN** Deprecated methods MUST retain their semantics, be marked in specifications and the machine-readable catalog, and remain for at least one compatible minor window before removal in a major version.

#### Scenario: New compatible method appears
- **WHEN** a new Host API minor version adds a method and both the plugin Manifest and SDK support ranges include that version
- **THEN** existing methods retain their semantics, and the new method is invoked only after Context declares it available
- **THEN** a package patch cannot masquerade as a protocol addition; consumers of an old closed catalog must upgrade to an SDK that understands the new catalog

#### Scenario: Host version is incompatible
- **WHEN** Runtime Context's Host API SemVer is outside the SDK support range
- **THEN** SDK initialization fails with `incompatible_host_api` and does not enter ready
- **THEN** a capability snapshot cannot bypass version incompatibility

#### Scenario: Method is deprecated
- **WHEN** a method is marked deprecated in a compatible minor version
- **THEN** the catalog and maintained documentation provide a stable replacement direction while preserving params, result, and error semantics
- **THEN** removal occurs only in a declared incompatible major version

#### Scenario: Upgrade to the current activation protocol
- **WHEN** the current Host and public packages provide Action activation
- **THEN** the Contract package and Host API are `0.4.0`, while the Manifest protocol and WebView carrier remain `0.4.0` and `0.2.0`, respectively
- **THEN** SDK `0.5.0` declares only the support range `>=0.4.0 <0.5.0`; plugin authors upgrade dependencies, adjust Manifest compatibility ranges, and repack
- **THEN** out-of-range old plugins are explicitly classified as incompatible and cannot project executable Actions; the Host does not add old-protocol negotiation, catalog filtering, or installed-package rewriting

### Requirement: Contract delivery MUST prove cross-consumer drift without claiming execution

Delivery MUST include a Schema and generated-type drift gate; valid and invalid fixtures covering every method, result, event, and error; TypeScript and Rust shared-fixture agreement; package boundary tests; an outside-the-repository no-DOM consumer of real Contract and SDK tarballs; and maintained English and Chinese documentation with equivalent semantics.

#### Scenario: Contract gates report their execution boundary

- **WHEN** semantic Contract delivery is validated independently of concrete Host execution
- **THEN** Gates MUST prove that public exports do not leak Host-private types and that `PluginSdkClient` still has no raw method entry or concrete Host API execution capability.
- **THEN** This capability MUST NOT register a Tauri command, send a MessagePort request, execute Action, close, native clipboard, or storage side effects, create Host authority, or claim that the Milestone 5 Runtime call chain has been delivered.

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

### Requirement: Action activation snapshots MUST expose only current Host-owned provenance

`actions.get_activation` MUST accept exact empty parameters and return `{ activation: null | Activation }`. Activation MUST be a readonly `{ actionId, invocationId, source }`: actionId is local to the current plugin, invocationId is a monotonically increasing positive safe integer within the current Page attempt, and source is only `normal | shortcut`. The Host MUST derive these facts from trusted invocations and MUST NOT accept plugin-supplied source or target identity.

#### Scenario: Read a dedicated shortcut invocation
- **WHEN** the current Session Page is activated through its dedicated Action shortcut and calls `actions.get_activation` with `{}`
- **THEN** the response contains the local Action ID, semantic invocation identifier, and `shortcut` source of the latest admitted invocation for that Page
- **THEN** the response excludes actual keys, binding IDs, native handles, RPC request IDs, Session nonces, and invocations belonging to other plugins or Pages

#### Scenario: Normal entry and internal navigation
- **WHEN** the user selects an Action through search, a click, recents, or pinned entries, or the current plugin starts the next invocation through `actions.open`
- **THEN** the resulting activation source is `normal`; a previous ordinary launcher shortcut or a previous shortcut invocation does not change that result
- **THEN** consecutive executions of the same Action still receive distinct, increasing invocationId values

#### Scenario: No invocation and forged source
- **WHEN** a valid current Session has no associated activation, or parameters add actionId, source, plugin identity, or any other field
- **THEN** the former returns `{ activation: null }` and the latter is rejected by exact parameter validation
- **THEN** querying does not create an invocation, change its source, or open another Page

### Requirement: Activation subscriptions MUST preserve a bounded initial batch and current-session events

`actions.subscribe_activations` MUST accept `{}`, atomically open one current-Session channel, and return `{ activations: Activation[] }`. The initial response MUST contain at most 32 pending activations sorted by invocationId. Same-Session retries MUST return the cached initial batch without reopening the channel. Each subsequently admitted invocation MUST emit the same Activation shape through `actions.activated`. Session destruction MUST clear the batch and channel.

#### Scenario: Multiple invocations are admitted during initialization
- **WHEN** a shortcut cold-starts a Page and additional independent invocations enter that same Page before the activation channel is established
- **THEN** at most 32 admitted invocations retain their individual IDs and sources and appear in order in the initial batch
- **THEN** a 33rd invocation that cannot yet be admitted receives explicit busy feedback; the admitted batch is neither overwritten by the latest source nor silently discarded

#### Scenario: Initial response and event arrival interleave
- **WHEN** a new invocation event after the first subscription's atomic boundary reaches the client before the initial response
- **THEN** the response's initial batch and subsequent events cover distinct new invocations, allowing the client to merge, deduplicate, and restore Host invocation order by invocationId
- **THEN** the `actions.activated` payload is Activation itself, without additional identity, permission, actual-key, or transport fields

#### Scenario: Retry after the initial response is lost
- **WHEN** the same valid Session requests `actions.subscribe_activations` again
- **THEN** it receives the same cached initial batch as the first request; the batch is not cleared merely because a response was previously sent, and no second channel is created
- **THEN** replay of the initial batch retains the original invocationId values, so already-delivered business callbacks are not executed again
- **THEN** the cache remains bounded to 32 entries; subsequent events do not accumulate in it, and this method does not replay arbitrary historical events

#### Scenario: Plugin has no business callback
- **WHEN** the current SDK has established its internal activation channel but the plugin has not configured a shortcut business callback
- **THEN** new invocations still navigate or focus normally, while the SDK consumes events and updates the current activation snapshot
- **THEN** the cached initial batch does not consume subsequent invocation admission capacity; omission of a business callback causes neither failure on the 33rd invocation nor unbounded caching

#### Scenario: Old Session or Page becomes invalid
- **WHEN** a Page closes or switches, a plugin is disabled, uninstalled, or replaced, a Runtime is rebuilt, or a Session becomes invalid
- **THEN** the old Session's cache, subscription, and undelivered invocations terminate; late queries, events, or retries cannot deliver to the old client or a replacement Session
- **THEN** independent shortcut invocations for the same still-valid Page preserve its Runtime and input; reading activation does not remount it
