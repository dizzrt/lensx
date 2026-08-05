## MODIFIED Requirements

### Requirement: The authenticated Port wire MUST be private, versioned and closed

The system MUST define one private transport contract version and exact request, response, event, cancel, and disconnect frame families. Every received frame MUST first undergo bounded RPC v1 envelope and value analysis and then be parsed from `unknown` as a plain JSON-compatible value with exact keys, a supported version, a known frame type, and a bounded request ID where applicable. A request MUST contain one Host API Contract request; a success response MUST contain the matching method result; an error response MUST contain one Host API Contract error; an event MUST contain one Host API Contract event. A frame MUST NOT contain plugin or Page identity, origin, nonce, Registration revision, resource generation, grant state, path, executor, Tauri command, Rust value, Host object, stack, or raw exception.

The Host MUST distinguish a correlatable request-level validation failure from an untrustworthy private protocol violation. A correlatable malformed request, invalid params, unknown method, or exceeded RPC budget MUST use its matching stable Host API error without entering the Handler. An unsupported version, unknown frame type, invalid or replayed request ID, extra private envelope field, non-JSON frame, or other uncorrelatable violation MUST fail closed through the bounded terminal path without an error oracle.

The canonical private wire definition MUST produce or deterministically check both the plugin-side codec and Host-private projection. The SDK package MUST bundle only what the iframe transport needs at Runtime and MUST NOT export frame types, codec helpers, schema, fixtures, Host projection, RPC policy, diagnostic records, or deep-import paths as supported public API.

#### Scenario: A valid request and out-of-order response cross the Port

- **WHEN** the iframe transport sends two Contract-valid requests within the RPC v1 budget and the Host completes the second request before the first
- **THEN** each response uses its request ID to settle only the matching operation exactly once
- **THEN** neither side requires plugin-supplied identity or response ordering to associate the operations

#### Scenario: A correlatable request has invalid params or exceeds a limit

- **WHEN** an exact request envelope has a valid strictly newer request ID but contains invalid method params or exceeds a byte, depth, node, or concurrency limit
- **THEN** the value does not enter the Handler and the Host returns one stable `invalid_params` or `limit_exceeded` response
- **THEN** the otherwise current Session can accept a later strictly newer valid request

#### Scenario: A frame is unknown, malformed or carries private fields

- **WHEN** either endpoint receives an unknown type or version, extra private envelope key, invalid or replayed request ID, mismatched response method, non-JSON value, or attempted identity, grant, path, executor, stack, Host object or raw error field that cannot be correlated safely
- **THEN** the value does not enter the transport Handler or SDK consumer
- **THEN** the endpoint fails closed through the bounded terminal path without echoing the raw frame or sensitive value

### Requirement: Requests MUST support concurrency, cancellation, timeout and exactly-once settlement

The iframe transport MUST create request IDs internally as strictly increasing fixed-width sequences, keep them unique for the lifetime of one Port, and maintain one pending record per in-flight request. It MUST support concurrent requests and responses in any order. The Host adapter MUST enforce the RPC v1 limit of 32 in-flight Handler requests for one Session and a 10,000 millisecond Host-owned execution deadline for every admitted request; it MUST reject excess correlatable requests with `limit_exceeded` without invoking their Handler. The Host MUST use a request-sequence high-water mark rather than an unbounded terminal-ID collection to reject duplicate or replayed request IDs.

SDK cancellation or lifecycle timeout MUST terminate the local operation, notify the Host with at most one cancel frame, remove local listeners and pending state, and suppress later response delivery. The Host adapter MUST abort the matching Handler signal at most once and MUST suppress any later Handler result or error. When the Host execution deadline wins first, the Host MUST release the slot, abort the Handler, and send exactly one Contract-valid Host API `timeout`; when SDK cancellation wins first, the Host MUST send no later Host result or timeout.

An unknown cancel ID, duplicate cancel, duplicate response, response after terminal cleanup, Handler completion after cancellation or timeout, or post-response effect after terminal state MUST NOT settle another request, resurrect pending state, or notify a consumer twice. Per-frame and per-Session byte, depth, node, batch, concurrency, and Host execution limits belong to the RPC validation capability; sustained frequency, iframe, CPU, memory, isolation, and recovery limits remain a later Runtime resource capability.

#### Scenario: Multiple requests complete in a different order

- **WHEN** a ready SDK starts multiple valid requests within the 32-request Session budget and the Host Handler completes them in a different order
- **THEN** every caller receives only its own Contract-valid result or error and all request records and timers are released
- **THEN** completion of one request does not cancel, resolve or mutate another request

#### Scenario: Session concurrency is exceeded

- **WHEN** a strictly newer valid request arrives while 32 Handler requests are still in flight
- **THEN** the Host responds once with `limit_exceeded`, creates no Handler, controller, or execution timer for that request, and keeps the Session current
- **THEN** a later request may be admitted after a pending slot is released

#### Scenario: Host execution deadline wins

- **WHEN** an admitted Handler remains unsettled for 10,000 milliseconds while its Session remains current
- **THEN** the Host aborts it, releases its pending slot, and sends exactly one Contract-valid Host API `timeout`
- **THEN** every later result, error, cancel, throw, or post-response effect for that ID is suppressed

#### Scenario: Cancellation wins a race with Handler completion

- **WHEN** an SDK operation is cancelled or reaches its SDK lifecycle timeout before the Host response or Host execution deadline is accepted
- **THEN** the SDK settles with its existing `cancelled` or `timeout` lifecycle error, the Host Handler signal is aborted, and pending state and timers are removed at both endpoints
- **THEN** any later result, error, cancel or response for that ID is ignored and cannot produce a Host API error or second settlement

### Requirement: Host API results, errors and events MUST retain Contract semantics across the transport

Before sending or delivering a response or event, the responsible endpoint MUST apply the RPC v1 egress budget, validate it with the public Host API Contract, and pair a result with the original request method. A Contract-valid Host API error MUST remain distinguishable from SDK `cancelled`, `timeout`, `disconnected`, `disposed`, `incompatible_host_api`, `invalid_runtime_context`, `invalid_argument`, and `transport_failure` errors. A Handler throw, rejected promise, invalid or over-budget Handler value, invalid Host error, or method/result mismatch MUST become exactly one fixed safe Contract-valid `internal_error` for the affected request and MUST NOT disconnect an otherwise current Session. Private diagnostics and original failures MUST NOT cross the Port.

The transport MUST carry only declared, within-budget Host API events. A valid `runtime.context_changed` event MUST be delivered as a complete validated Runtime context replacement. An empty capability list MUST remain valid; locale or theme changes MUST preserve their `en-US | zh-CN` and `light | dark` Contract values. Invalid, undeclared, or over-budget events MUST NOT notify SDK subscribers and MUST be contained as safe Host diagnostics without disconnecting an otherwise current Session.

#### Scenario: Handler returns a stable Host API rejection

- **WHEN** the injected Handler returns a Contract-valid `permission_denied`, `not_found`, `limit_exceeded`, `unavailable`, or another declared Host API error for a pending request
- **THEN** the SDK caller receives that Host API error without it being collapsed into `transport_failure`
- **THEN** no private envelope, exception, stack, path, payload, grant or Host value becomes observable

#### Scenario: Handler throws or returns invalid output

- **WHEN** the Handler throws, rejects, returns a non-JSON or over-budget value, returns an invalid error, or returns a result for the wrong method
- **THEN** the SDK caller receives exactly one fixed safe Host API `internal_error`
- **THEN** the original failure is diagnosed privately, the pending request is released, and the otherwise current Session remains usable

#### Scenario: Runtime context changes or becomes empty

- **WHEN** the Host adapter emits a valid within-budget `runtime.context_changed` event containing a new locale, theme or an empty capability list
- **THEN** the SDK validates and installs the complete replacement before notifying active typed subscribers
- **THEN** a capability omitted from the replacement is no longer considered callable and no identity or grant detail appears in the context

#### Scenario: Host event is invalid or over budget

- **WHEN** the Host adapter is asked to emit an undeclared, malformed, private, or over-budget event
- **THEN** the adapter suppresses it and no SDK subscriber runs
- **THEN** one safe private diagnostic may be observed without exposing event payload or terminating an otherwise current Session
