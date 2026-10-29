# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
