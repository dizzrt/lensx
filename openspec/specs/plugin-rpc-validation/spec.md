# Plugin RPC Validation Specification

## Purpose

Define bounded, fail-closed validation and resource controls for plugin Runtime Session RPC while preserving public Contract semantics and Host-private authority.
## Requirements
### Requirement: The Host MUST enforce one immutable RPC v1 budget before recursive Contract validation

The Host MUST apply one Host-private, frozen RPC v1 policy to every value received from or sent to a plugin Runtime Session. The policy MUST allow at most 5,242,880 bytes of canonical JSON-compatible cost per private frame, a semantic payload nesting depth of 32, a total private-frame depth of 36, and 16,384 visited values and object keys. The private wire MUST remain single-request: one frame MUST contain at most one request, and a batch or array envelope MUST NOT be accepted.

Inbound analysis MUST begin after only the fixed outer envelope fields needed for safe correlation have been classified and MUST finish before recursive public Contract validation or Handler invocation. It MUST use bounded, early-terminating traversal without first serializing the complete value. A Manifest, plugin source, legacy permission or grant claim, SDK option, payload field, or public API MUST NOT increase or disable a production limit.

#### Scenario: A valid bounded request reaches Contract validation

- **WHEN** a current Session sends one exact request frame whose JSON-compatible cost, semantic depth, total depth, and node count are within the v1 policy
- **THEN** the Host proceeds to the matching public Contract request validator
- **THEN** the analyzer neither mutates the input nor derives identity or authority from it

#### Scenario: An oversized or deeply nested request is rejected early

- **WHEN** a correlatable request exceeds the byte, semantic-depth, total-depth, or visited-value budget
- **THEN** the Host returns stable `limit_exceeded` for that request and does not invoke the Dispatcher or any provider
- **THEN** traversal stops at the first proven limit and no raw value or payload enters the response or diagnostic

#### Scenario: A batch envelope is attempted

- **WHEN** a plugin sends an array of requests, a request frame containing multiple requests, or another batch envelope
- **THEN** the Host accepts zero batched requests because the v1 batch limit is one
- **THEN** an uncorrelatable batch is treated as a protocol violation and cannot produce any Handler invocation

### Requirement: Recoverable request failures and terminal protocol violations MUST remain distinct

The Host MUST classify a request failure as recoverable only when the private version, request frame type, and bounded request ID are trustworthy enough to correlate exactly one response. A correlatable malformed Host API request MUST return `invalid_request`; a declared method with invalid or mismatched params MUST return `invalid_params`; an undeclared method MUST retain `method_not_found`; and a budget rejection MUST return `limit_exceeded`. These request-level rejections MUST terminal only that request ID, MUST NOT consume an execution slot, and MUST NOT disconnect an otherwise current Session.

An unsupported private version, unknown frame type, invalid or reused request ID, extra private envelope authority field, non-JSON frame, stale lease, or another value that cannot be correlated safely MUST fail closed through the existing Session terminal path. Contract-valid errors produced by the current Dispatcher MUST retain their Contract code and MUST NOT be reclassified as transport failures.

#### Scenario: Known method carries invalid params

- **WHEN** a correlatable request for a declared method carries params that fail the method's exact Contract Schema
- **THEN** the Host returns one safe `invalid_params` error and records the request ID as terminal
- **THEN** no Dispatcher branch, provider, native effect, or post-response effect runs

#### Scenario: Request object is malformed but safely correlated

- **WHEN** an exact request envelope has a valid version and request ID but its request member is not a valid Host API request object
- **THEN** the Host returns one safe `invalid_request` error without invoking a Handler
- **THEN** the Session remains available for a later strictly newer valid request

#### Scenario: Private authority or invalid identity field is injected

- **WHEN** a frame adds plugin identity, Page identity, grant, origin, path, executor, Tauri command, Host object, or another extra envelope field
- **THEN** the Host treats the frame as a protocol violation and terminates only the affected Session
- **THEN** it sends no request-level parsing oracle and performs no privileged effect

### Requirement: Every Session MUST have bounded in-flight state and a Host-owned execution deadline

The Host MUST accept at most 32 in-flight Handler requests for one Runtime Session and MUST reject each additional correlatable request with `limit_exceeded` without invoking its Handler. Official SDK request IDs MUST remain strictly increasing fixed-width sequences, and the Host MUST enforce a high-water mark so a completed, cancelled, rejected, or timed-out ID cannot be replayed without retaining an unbounded terminal-ID collection.

Every admitted request MUST have one Host-owned 10,000 millisecond execution deadline. Host deadline, plugin cancellation, Session invalidation, adapter cleanup, and Handler completion MUST compete through one exactly-once settlement. A Host deadline that wins MUST abort the Handler signal, release the pending slot, return one Contract-valid `timeout`, suppress every late completion and post-response effect, and leave an otherwise healthy Session available. An SDK lifecycle timeout that wins first MUST remain an SDK timeout and MUST NOT be relabeled as a Host API error.

#### Scenario: The per-Session concurrency budget is full

- **WHEN** 32 requests are still in flight and a strictly newer valid request arrives
- **THEN** the newer request receives one `limit_exceeded`, uses no pending controller or execution timer, and never reaches the Handler
- **THEN** completion or cancellation of an admitted request releases its slot for a later strictly newer request

#### Scenario: Host execution deadline wins

- **WHEN** an admitted Handler has not settled after 10,000 milliseconds and the Session is still current
- **THEN** the Host aborts that Handler and sends exactly one safe Host API `timeout`
- **THEN** a late result, rejection, throw, cancel, or post-response effect is ignored and cannot settle another request

#### Scenario: SDK cancellation wins before the Host deadline

- **WHEN** SDK cancellation or SDK lifecycle timeout reaches the Host before its execution deadline
- **THEN** the matching Handler signal is aborted at most once and the pending slot and timer are released
- **THEN** the Host sends no later result or Host timeout for that request and the SDK preserves its existing lifecycle semantics

#### Scenario: An old request ID is replayed

- **WHEN** a request ID is duplicate, lower than, or equal to the Session high-water mark after its original request is no longer pending
- **THEN** the Host treats the replay as a protocol violation and invokes no Handler
- **THEN** the adapter does not require an ever-growing terminal request-ID set to reject it

### Requirement: Host results, errors, events, and post-response effects MUST pass bounded egress validation

Before posting a result, error, or event, the Host MUST apply the same byte, depth, node, JSON-compatibility, exact-shape, and public Contract validation used by the RPC v1 policy. A result MUST match the original request method. A Handler throw, rejected promise, non-JSON value, over-budget value, invalid error, invalid result, or method/result mismatch MUST become exactly one fixed safe `internal_error` for the affected request; the original value, exception, stack, URL, path, payload, permission, identity, provider, executor, Rust object, Tauri object, or Host object MUST NOT cross the Port.

An invalid or over-budget Host event MUST be suppressed and diagnosed without notifying an SDK subscriber. A private post-response effect MUST run at most once and only after its paired Contract-valid, within-budget response is posted successfully while the request and Session remain current. A failed Port operation, message error, or lost currentness MUST continue to use terminal cleanup.

#### Scenario: Handler returns a mismatched or private value

- **WHEN** a Handler throws or returns an invalid value, a result for another method, a Host object, or an over-budget result
- **THEN** the plugin receives only one fixed Contract-valid `internal_error` for its request
- **THEN** the Session remains usable, the pending slot is released, and no private detail enters the wire

#### Scenario: Host emits an invalid event

- **WHEN** a Host producer emits an undeclared, malformed, private, or over-budget event
- **THEN** the adapter sends no event and no SDK subscriber is notified
- **THEN** the adapter records a safe egress diagnostic without disconnecting an otherwise current Session

#### Scenario: Post-response output is invalid or times out

- **WHEN** a private post-response outcome contains an invalid response or the request becomes cancelled, timed out, stale, or disconnected before successful posting
- **THEN** its effect does not execute
- **THEN** a late callback cannot close or mutate a replacement Page or Session

### Requirement: RPC diagnostics MUST be bounded, private, and non-authoritative

The Host MUST offer an optional observational diagnostic sink whose immutable records contain only the trusted Session plugin ID, an already validated catalog method when available, an `ingress`, `execution`, or `egress` stage, one closed diagnostic code, and a fixed safe English message. A record MUST NOT contain a request ID, params, result, event or error payload, raw value, URL, path, origin, resource token, grant, exception, stack, MessagePort, provider, executor, Rust object, Tauri object, or Host object.

Diagnostic delivery failure MUST NOT change request settlement, Host authority, provider effects, Session currentness, or cleanup. This capability MUST NOT persist diagnostic history or expose it to plugins or public packages.

#### Scenario: Resource rejection is diagnosed safely

- **WHEN** a correlatable request exceeds an RPC budget
- **THEN** the Host may emit one frozen diagnostic with the trusted plugin ID, safe method when known, `ingress` stage, closed limit code, and fixed message
- **THEN** inspection of the record cannot recover the rejected payload or any private authority fact

#### Scenario: Diagnostic sink throws

- **WHEN** the optional diagnostic sink throws while observing an RPC failure
- **THEN** the adapter swallows the observational failure and completes the predetermined request or terminal action
- **THEN** no request is settled twice and no Handler gains authority from diagnostic behavior

### Requirement: Delivery MUST prove RPC limits without expanding the public plugin platform

Delivery MUST include deterministic shared valid and malicious fixtures, policy/analyzer unit tests, Host adapter race tests, real Contract and SDK MessageChannel integration, public tarball and workspace-boundary checks, and bounded target macOS WKWebView evidence. Tests MUST cover exact-limit acceptance and over-limit rejection for bytes, depth, node count, concurrency, execution deadline, monotonic request IDs, cancellation races, invalid Handler output, invalid events, safe diagnostics, post-response effects, and zero Handler hits for rejected input.

The focused validation MUST be the stable `plugin-rpc-validation` capability Gate selected through the unified Gate CLI. The change MUST add no public SDK option or export, no new Host API method or error code, no new Tauri command or Rust authority, and no runtime dependency. Canonical English architecture and validation documentation and their Simplified Chinese mirrors MUST distinguish these per-frame and per-Session RPC limits from later iframe, frequency, CPU, memory, isolation, and recovery controls.

#### Scenario: Focused RPC validation gate passes

- **WHEN** the `plugin-rpc-validation` Gate runs with the real Contract, SDK, Host adapter, Dispatcher, storage, MessageChannel, package-boundary, workspace, and macOS evidence prerequisites
- **THEN** valid calls preserve existing behavior while every malicious or over-budget fixture reaches zero unintended Handlers and effects
- **THEN** SDK and Host observe stable compatible errors without exposing private wire or policy modules

#### Scenario: Public or later-runtime scope leaks into delivery

- **WHEN** an RPC policy becomes plugin-configurable, a private validator or diagnostic becomes publicly importable, or the change adds batch, streaming, persistent diagnostics, frequency isolation, plugin suspension, CPU or memory control
- **THEN** the focused boundary Gate fails
- **THEN** the out-of-scope behavior requires its own explicit capability change

#### Scenario: Legacy RPC script entry remains

- **WHEN** the stable registry Gate is available but the root manifest, CI, documentation, or specs still use a dedicated `check:plugin-rpc-validation` script
- **THEN** validation fails as a dual entry
- **THEN** the caller must migrate to the unified Gate CLI without changing RPC coverage

### Requirement: RPC validation MUST accept frames only from the current WebView bridge binding
The existing closed RPC budgets, validators, cancellation, deadline, exactly-once and egress rules MUST execute only after native bridge ingress proves the actual current Child WebView Session. Carrier decoding MUST treat input as `unknown`; a malformed, oversized, stale or wrong-source frame MUST NOT reach Dispatcher or reveal expected identity. Valid responses and events MUST be encoded and delivered only to the same current WebView.

#### Scenario: Current request passes carrier validation
- **WHEN** the current source sends a bounded frame containing a Contract-valid request
- **THEN** the existing RPC and semantic validators execute before Dispatcher and the result returns to that source only

#### Scenario: Wrong source sends a valid-shaped request
- **WHEN** a destroyed or unrelated WebView submits a frame within all structural budgets
- **THEN** source validation rejects it before in-flight state or a Host handler is created
