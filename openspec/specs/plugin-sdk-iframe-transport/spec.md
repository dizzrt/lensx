# Plugin SDK iframe Transport Specification

## Purpose

Define the official iframe transport that connects the public Plugin SDK to one authenticated Host Runtime Session Port while preserving private wire, Host-derived authority, closed Contract semantics, safe lifecycle behavior, and a production boundary that performs no real Host API dispatch before the Dispatcher capability exists.

## Requirements

### Requirement: The official iframe transport MUST consume exactly one authenticated Runtime Session Port

The system MUST provide an official framework-neutral iframe transport that implements the public `PluginSdkTransport` semantics over the dedicated Port transferred by the current Host Runtime Session. Before accepting that Port, the transport MUST validate the existing bootstrap as `unknown`, require the supported contract version and exact bootstrap shape, require the current parent browsing context and SDK-supported exact Host origin, require exactly one transferred Port, and accept at most one bootstrap. The public factory MUST NOT accept or expose plugin identity, Page identity, source, origin override, nonce override, Port injection, Host object, private codec, or wildcard trust configuration.

The iframe transport MUST use the existing nonce ready acknowledgement on the transferred Port and MUST remove its window bootstrap listener after success or terminal failure. All subsequent communication MUST use only that Port; the transport MUST NOT create a long-lived window message bus or a second authentication handshake. Session ready, transport connected, and SDK ready MUST remain distinct states.

#### Scenario: Current iframe establishes the transport

- **WHEN** the exact current parent and supported Host origin deliver one valid bootstrap with a fresh nonce and exactly one dedicated Port
- **THEN** the iframe transport acknowledges that nonce on the transferred Port exactly once and stops listening for bootstrap messages
- **THEN** Host Session authentication can expose that same Port to one Host transport adapter without making the SDK ready before a valid Runtime context is returned

#### Scenario: Bootstrap source, origin, shape or Port is invalid

- **WHEN** a sibling, nested frame, stale parent, unsupported origin, wrong contract version, malformed value, replay, second bootstrap, missing Port, or multiple Ports attempts to initialize the transport
- **THEN** the transport rejects the attempt without acknowledging it or adopting any Port
- **THEN** no request, event, identity, Host object, raw value, URL, nonce, or private diagnostic is exposed to plugin code

### Requirement: The authenticated Port wire MUST be private, versioned and closed

The system MUST define one private transport contract version and exact request, response, event, cancel, and disconnect frame families. Every received frame MUST be parsed from `unknown` as a plain JSON-compatible value with exact keys, a supported version, a known frame type, and a bounded request ID where applicable. A request MUST contain one Host API Contract request; a success response MUST contain the matching method result; an error response MUST contain one Host API Contract error; an event MUST contain one Host API Contract event. A frame MUST NOT contain plugin or Page identity, origin, nonce, Registration revision, resource generation, grant state, path, executor, Tauri command, Rust value, Host object, stack, or raw exception.

The canonical private wire definition MUST produce or deterministically check both the plugin-side codec and Host-private projection. The SDK package MUST bundle only what the iframe transport needs at Runtime and MUST NOT export frame types, codec helpers, schema, fixtures, Host projection, or deep-import paths as supported public API.

#### Scenario: A valid request and out-of-order response cross the Port

- **WHEN** the iframe transport sends two Contract-valid requests and the Host completes the second request before the first
- **THEN** each response uses its request ID to settle only the matching operation exactly once
- **THEN** neither side requires plugin-supplied identity or response ordering to associate the operations

#### Scenario: A frame is unknown, malformed or carries private fields

- **WHEN** either endpoint receives an unknown type or version, extra key, reused terminal request ID, mismatched method/result, non-JSON value, or attempted identity, grant, path, executor, stack, Host object or raw error field
- **THEN** the value does not enter the transport handler or SDK consumer
- **THEN** the endpoint fails closed through the bounded terminal path without echoing the raw frame or sensitive value

### Requirement: The Host transport adapter MUST derive authority only from the current Port lease

The Host MUST attach at most one private transport adapter to a ready Runtime Session Port lease. For every accepted request, the adapter MUST combine the frozen identity from that lease with the Contract-valid request and a Host-owned cancellation signal before invoking its configured handler. The wire and plugin MUST NOT select or override plugin ID, entry, Page, version, Registration revision, resource generation, Runtime attempt, source, origin, permissions, grants, locale, theme, capability list, handler, or executor.

The adapter MUST reject a request before the handler when the Session or Runtime attempt is no longer current, the Port lease was already consumed, the request is invalid, or the operation has already reached a terminal state. An adapter failure MUST disconnect the affected Session only and MUST NOT mutate Plugin Registration, authorize a permission, execute a Tauri command, or affect another plugin Session.

#### Scenario: Current Session request reaches an injected handler

- **WHEN** a current ready Session sends a Contract-valid request over its authenticated Port
- **THEN** the handler receives the request with exactly the identity frozen by that Session lease and a Host-owned cancellation signal
- **THEN** no wire field or plugin-authored value can replace the identity or select a privileged executor

#### Scenario: A stale or cross-plugin Port sends a request

- **WHEN** a replaced, disposed, revoked, replayed, or different plugin Port attempts a request
- **THEN** no configured handler is invoked and no Host API result, event, permission decision, Registration mutation or privileged side effect occurs
- **THEN** the stale adapter terminates without disconnecting an unrelated current Session

### Requirement: Requests MUST support concurrency, cancellation, timeout and exactly-once settlement

The iframe transport MUST create request IDs internally, keep them unique for the lifetime of one Port, and maintain one pending record per in-flight request. It MUST support concurrent requests and responses in any order. SDK cancellation or timeout MUST terminate the local operation, notify the Host with at most one cancel frame, remove local listeners and pending state, and suppress later response delivery. The Host adapter MUST abort the matching handler signal at most once and MUST suppress any later handler result or error.

An unknown cancel ID, duplicate cancel, duplicate response, response after terminal cleanup, or handler completion after cancellation MUST NOT settle another request, resurrect pending state, or notify a consumer twice. Global concurrency, frequency, message-size, nesting-depth and Host execution limits remain a later resource-validation capability.

#### Scenario: Multiple requests complete in a different order

- **WHEN** a ready SDK starts multiple valid requests and the Host handler completes them in a different order
- **THEN** every caller receives only its own Contract-valid result or error and all request records are released
- **THEN** completion of one request does not cancel, resolve or mutate another request

#### Scenario: Cancellation wins a race with handler completion

- **WHEN** an SDK operation is cancelled or times out before its response is accepted
- **THEN** the SDK settles with its existing `cancelled` or `timeout` lifecycle error, the Host handler signal is aborted, and pending state is removed at both endpoints
- **THEN** any later result, error, cancel or response for that ID is ignored and cannot produce a Host API error or second settlement

### Requirement: Host API results, errors and events MUST retain Contract semantics across the transport

Before sending or delivering a response or event, the responsible endpoint MUST validate it with the public Host API Contract and pair a result with the original request method. A Contract-valid Host API error MUST remain distinguishable from SDK `cancelled`, `timeout`, `disconnected`, `disposed`, `incompatible_host_api`, `invalid_runtime_context`, `invalid_argument`, and `transport_failure` errors. Unknown handler exceptions, invalid handler values, private diagnostics and codec failures MUST NOT cross the Port as a valid Host API error.

The transport MUST carry only declared Host API events. A valid `runtime.context_changed` event MUST be delivered as a complete validated Runtime context replacement. An empty capability list MUST remain valid; locale or theme changes MUST preserve their `en-US | zh-CN` and `light | dark` Contract values. Invalid or undeclared events MUST NOT notify SDK subscribers.

#### Scenario: Handler returns a stable Host API rejection

- **WHEN** the injected handler returns a Contract-valid `permission_denied`, `not_found`, `limit_exceeded`, `unavailable`, or another declared Host API error for a pending request
- **THEN** the SDK caller receives that Host API error without it being collapsed into `transport_failure`
- **THEN** no private envelope, exception, stack, path, payload, grant or Host value becomes observable

#### Scenario: Runtime context changes or becomes empty

- **WHEN** the Host adapter emits a valid `runtime.context_changed` event containing a new locale, theme or an empty capability list
- **THEN** the SDK validates and installs the complete replacement before notifying active typed subscribers
- **THEN** a capability omitted from the replacement is no longer considered callable and no identity or grant detail appears in the context

### Requirement: Every transport endpoint MUST have one idempotent terminal cleanup path

Session disconnect or disposal, iframe or Page teardown, Plugin disable/uninstall/replacement, Host reload, Port message error, explicit disconnect frame, fatal codec error and SDK disposal MUST converge on idempotent cleanup. Cleanup MUST reject new requests, terminate all pending operations with the applicable safe SDK lifecycle error, abort Host handler signals, deactivate subscriptions, remove window and Port listeners, clear request state, attempt at most one bounded disconnect notification when possible, and close or forget the Port safely.

Session disposal MUST remain authoritative: an old adapter or late callback MUST NOT dispose a replacement Session or reconnect automatically. SDK `disposed` MUST remain distinct from transport `disconnected`, and repeated cleanup MUST have no additional effects.

#### Scenario: Host closes a ready plugin Page

- **WHEN** the Host terminally closes, navigates away from, disables, uninstalls or replaces the Page owning a ready transport with pending requests and active subscriptions
- **THEN** all pending work and subscriptions terminate, no new request reaches a handler, and the Port and listeners are released
- **THEN** late frames, handler results and callbacks cannot affect a replacement Page or Session

#### Scenario: Cleanup is repeated or races

- **WHEN** disconnect, message error, SDK disposal, Session disposal and late response callbacks occur more than once or in different orders
- **THEN** exactly one terminal state wins, every cleanup action is safe to repeat, and no consumer is notified twice

### Requirement: Transport delivery MUST stop before real Host API dispatch and permission decisions

This capability MUST provide only the official iframe transport, private wire, Host Port adapter, typed SDK handoff, injected fixture/unavailable handler, lifecycle integration, security evidence and maintained documentation. Production integration before the Host API Dispatcher exists MUST return a stable `unavailable` Host API rejection and MUST NOT implement `runtime.get_context`, `ui.close`, `actions.open`, storage, clipboard, application service, Rust command, permission decision, grant mutation or privileged side effect.

Fixture handlers MAY return Contract-valid context, results, errors and events solely to prove transport behavior, but they MUST NOT become production providers or a public Host executor. A successful fixture round-trip MUST NOT be described as an executable production Host API.

#### Scenario: Task 5.2 completes before the Dispatcher

- **WHEN** the real SDK, iframe transport and Host adapter pass their delivery gates while no Task 5.3 Dispatcher is configured
- **THEN** focused and WebView fixtures can complete SDK initialization and request round-trips through an injected fixture handler
- **THEN** production requests receive `unavailable`, produce no application or native side effect, and cannot obtain a new permission decision

### Requirement: Delivery MUST prove public packaging, malicious isolation and target WebView behavior

The system MUST provide a focused `check:plugin-sdk-transport` gate covering SDK, codec, Host adapter, lifecycle and drift tests. Real SDK tarball validation MUST prove that the root entry remains usable without DOM types, the declared iframe entry works in a browser consumer, private transport modules cannot be deep-imported, and release dependencies and contents stay bounded. Browser MessageChannel and target macOS WKWebView evidence MUST cover normal handshake and round-trip, concurrent and cancelled requests, events, stable errors, forged or stale sources and Ports, malformed frames, Page replacement, and terminal cleanup with zero late handler hits.

Canonical English architecture, workspace and validation documentation and their Simplified Chinese mirrors at identical paths MUST distinguish Session ready, SDK ready, transport delivery and real Host API execution. Root workspace tests, formatting/static checks, type checking and build plus Rust formatting, tests and static checks MUST remain successful even though this change adds no new Rust command.

#### Scenario: Complete transport gate passes

- **WHEN** the focused gate, tarball consumers, browser fixture, target WebView evidence, bilingual documentation checks and complete repository validation all pass
- **THEN** an external plugin can use only declared Contract and SDK package entries to establish and test the transport without importing Host-private code or private wire modules
- **THEN** the evidence demonstrates exact Port/session binding, semantic parity and terminal cleanup without claiming real Dispatcher, permissions or Host API side effects

#### Scenario: Packaging, drift or security evidence fails

- **WHEN** a public declaration leaks DOM or Host-private types, a private module becomes importable, codec projections drift, a forged/stale source reaches a handler, a late request survives cleanup, or target WebView behavior cannot prove the boundary
- **THEN** the focused or final validation fails and the capability is not reported complete
