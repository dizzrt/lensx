# Plugin SDK Foundation Specification

## Purpose

Define the stable public foundation for `@lensx/plugin-sdk`, including its package boundary, client lifecycle, Runtime context, transport abstraction, operation semantics, version compatibility, safe errors, and release validation, without claiming delivery of a working plugin Runtime or Host API.

## Requirements

### Requirement: The system MUST provide a constrained, framework-neutral public Plugin SDK package

The system MUST provide the public workspace package `@lensx/plugin-sdk`, which MUST be independently buildable, testable, and packable. Its public Runtime and type entries MUST NOT depend on the private root Host, `src/app/**`, React, Semi Design, Tauri, DOM global types, Node filesystem APIs, or Host-internal styles. Paths that are not declared in the package exports MUST NOT become public APIs.

#### Scenario: An external consumer uses the public SDK entry

- **WHEN** a consumer outside the workspace installs the package from a real SDK tarball and imports only the declared public entry
- **THEN** the consumer's TypeScript compilation and ESM Runtime smoke test succeed
- **THEN** the consumer does not need to access lensX source code, React, Semi Design, Tauri, a DOM library, or Node filesystem APIs

#### Scenario: A consumer attempts a deep import

- **WHEN** a consumer imports SDK source code, tests, fixtures, or internal modules that are not declared in the package exports
- **THEN** package resolution rejects the import

#### Scenario: The SDK public declaration boundary is checked

- **WHEN** repository validation checks the SDK's generated public declarations and Runtime dependencies
- **THEN** validation rejects leaked Host-private types, UI frameworks, Tauri, DOM global types, or undeclared Runtime dependencies

### Requirement: The SDK client MUST use an instance-based, predictable lifecycle

The system MUST create mutually isolated SDK clients through an explicit factory and MUST NOT use a process-level or module-level singleton. A client MUST expose the read-only lifecycle states `idle`, `initializing`, `ready`, `disconnected`, and `disposed`, and MUST provide initialization, state subscription, and idempotent disposal capabilities.

#### Scenario: Independent clients initialize successfully

- **WHEN** two SDK clients initialize successfully with their respective transports
- **THEN** each client independently moves from `idle` to `initializing` and then to `ready`
- **THEN** the state, context, subscriptions, or disposal of one client does not change the other client

#### Scenario: Concurrent initialization calls are coalesced

- **WHEN** the same `idle` client receives multiple initialization calls before its first initialization completes
- **THEN** the client starts transport initialization only once
- **THEN** every caller observes the same successful result or the same stable SDK error

#### Scenario: Initialization is retried after a recoverable failure

- **WHEN** initialization fails because of a timeout, cancellation, or transport failure
- **THEN** the client returns to `idle` without retaining listeners or pending operations
- **THEN** the caller can explicitly initialize again, and the SDK does not retry automatically

#### Scenario: The transport disconnects

- **WHEN** the transport of a ready client reports a disconnection
- **THEN** the client enters `disconnected`, terminates pending operations, and rejects new communication operations
- **THEN** the SDK does not automatically establish a new session

#### Scenario: Client disposal is idempotent

- **WHEN** the caller disposes any non-disposed client one or more times
- **THEN** the client ultimately remains `disposed`, the transport is disposed at most once, and all SDK listeners and pending operations are released
- **THEN** subsequent initialization or communication attempts fail with a `disposed` error

### Requirement: The SDK MUST define a transport abstraction that does not leak the wire protocol

The system MUST expose a framework-neutral `PluginSdkTransport` injection boundary that expresses connection, abstract request, abstract event, disconnection notification, and disposal semantics. This public interface MUST NOT contain request IDs, nonces, plugin identity, origins, `Window`, `MessagePort`, `postMessage`, a JSON-RPC envelope, or Host-private types. `PluginSdkClient` MUST NOT expose a raw Host API call entry that accepts an arbitrary method string.

#### Scenario: A test transport is injected in a non-browser environment

- **WHEN** a test implements the public transport interface in an environment without DOM or Tauri and injects it into an SDK client
- **THEN** the test can drive initialization, request results, events, cancellation, timeout, disconnection, and disposal semantics
- **THEN** the SDK package does not require a real iframe transport

#### Scenario: Public transport types are inspected

- **WHEN** a consumer inspects the SDK's public transport declarations
- **THEN** the declarations describe only semantic operations and listeners and do not expose or require construction of a private wire envelope, trusted identity, or Host object

#### Scenario: A plugin attempts to call an arbitrary Host method

- **WHEN** a plugin author holds only a public `PluginSdkClient`
- **THEN** the client provides no public call interface that accepts an arbitrary string to bypass future typed Host API methods

### Requirement: The SDK MUST unify cancellation, timeout, event, and late-result semantics

The system MUST apply a configurable, positive, finite timeout to initialization and SDK-managed requests, and the default timeout MUST be 10000 milliseconds. Cancellation input MUST accept a signal that is structurally compatible with native `AbortSignal` without requiring a DOM type library. Event subscriptions MUST return an idempotent unsubscribe function. Results and events that arrive after an operation is cancelled, times out, is disconnected, or is disposed MUST NOT change client state or notify a consumer again.

#### Scenario: An operation completes normally

- **WHEN** the transport successfully completes an uncancelled operation before its timeout
- **THEN** the SDK delivers the successful result exactly once and cleans up the timer and cancellation listener

#### Scenario: The caller cancels an operation

- **WHEN** a compatible signal supplied by the caller becomes aborted before an operation completes
- **THEN** the SDK ends the operation with a `cancelled` error and notifies the transport to stop work
- **THEN** a late result from the transport is ignored

#### Scenario: An operation times out

- **WHEN** the transport does not complete an operation within the default or explicitly overridden timeout
- **THEN** the SDK ends the operation with a `timeout` error, triggers transport cancellation, and cleans up related resources

#### Scenario: An invalid timeout is configured

- **WHEN** the caller provides a zero, negative, non-finite, or non-integer timeout
- **THEN** the SDK rejects the configuration with a stable argument error before starting the transport operation

#### Scenario: An event subscription is cancelled

- **WHEN** a consumer calls the unsubscribe function returned by an event subscription one or more times
- **THEN** the listener receives no subsequent events, and repeated unsubscribe calls have no side effects

### Requirement: Runtime context MUST be read-only, versioned, and validated at Runtime

The system MUST define `PluginRuntimeContext` separately from the client lifecycle state. The first context version MUST contain a Host API SemVer, an `en-US | zh-CN` locale, a `light | dark` theme, and a read-only capability ID snapshot. An empty capability snapshot MUST be valid, and every non-empty capability ID MUST be unique and non-empty. Before a client enters `ready`, the SDK MUST validate, copy, and freeze the context. The context MUST NOT accept plugin-provided identity, permission, source, installation, or Host lifecycle facts.

#### Scenario: A valid Runtime context is accepted

- **WHEN** the transport returns a compatible Host API version, a supported locale and theme, and a valid capability snapshot
- **THEN** the client enters `ready` and exposes a context snapshot that the consumer cannot modify

#### Scenario: An empty capability snapshot is accepted

- **WHEN** the transport returns an empty `capabilities` array
- **THEN** the context remains valid, and the SDK does not invent any available Host API method

#### Scenario: An invalid Runtime context is rejected

- **WHEN** the transport returns an unknown locale or theme, an invalid SemVer, a duplicate or empty capability ID, or omits a required field
- **THEN** initialization fails with `invalid_runtime_context`, and the client returns to `idle`
- **THEN** no part of the invalid context is written to the client

#### Scenario: A plugin attempts to change trusted Runtime facts

- **WHEN** a consumer attempts to modify a returned context or provide plugin identity, Page identity, permissions, or source through initialization options
- **THEN** the context snapshot remains unchanged, and those Host-owned facts do not become supported SDK inputs

### Requirement: The SDK and Host API MUST use independent, single-source version boundaries

The system MUST independently version the SDK package and public API starting at `0.1.0`, and MUST expose the SDK version and the half-open Host API support range `>=0.1.0 <0.2.0`. The current Host API version MUST continue to use `PLUGIN_HOST_API_VERSION` from `@lensx/plugin-contract` as its sole source of truth, and the SDK MUST NOT define a second current Host API version constant. Before initialization completes, the SDK MUST check the Runtime context's Host API version according to SemVer precedence.

#### Scenario: A compatible Host API initializes

- **WHEN** the Runtime context's Host API version satisfies the SDK's half-open support range
- **THEN** the version check succeeds, and initialization can continue

#### Scenario: An incompatible Host API is rejected

- **WHEN** the Runtime context's Host API version is below the minimum or reaches the exclusive upper bound
- **THEN** initialization fails with `incompatible_host_api`, and the client does not enter `ready`

#### Scenario: A prerelease version is compared

- **WHEN** the SDK checks a valid prerelease SemVer Host API version
- **THEN** comparison follows SemVer prerelease precedence rather than ordinary string ordering

#### Scenario: The SDK receives an implementation revision

- **WHEN** the SDK package receives a fix that does not change its public API or supported Host API range
- **THEN** the SDK package version can increase independently without changing the Manifest or Host API protocol version

### Requirement: The SDK MUST expose stable, safe SDK-level errors

The system MUST provide a discriminated `PluginSdkError` and stable `PluginSdkErrorCode` values that cover at least `cancelled`, `timeout`, `disconnected`, `disposed`, `incompatible_host_api`, `invalid_runtime_context`, `invalid_argument`, and `transport_failure`. Errors MUST provide safe, predictable messages but MUST NOT expose raw transport exceptions, stacks, Host objects, or private wire data to consumers. Specific Host API permission, method, and parameter errors MUST remain for a future Host API contract to define.

#### Scenario: An unknown transport failure is mapped

- **WHEN** the transport rejects initialization or an operation with an unknown exception
- **THEN** the SDK throws a `PluginSdkError` whose code is `transport_failure`
- **THEN** the error does not contain the original exception object, a private stack, or a transport envelope

#### Scenario: A consumer handles an error by stable code

- **WHEN** a consumer catches an SDK lifecycle, timeout, cancellation, or compatibility error
- **THEN** the consumer can branch reliably on the public error code without matching localized text or an internal exception type

#### Scenario: The SDK does not invent Host API errors

- **WHEN** a consumer inspects the foundation's error types
- **THEN** the package does not claim to have defined permission-denial, unknown-Host-method, or Host-parameter-Schema errors

### Requirement: The SDK package MUST participate in complete workspace, release, and documentation validation

The SDK package MUST declare meaningful `build`, `typecheck`, `test`, and `check` scripts, and the root aggregate commands MUST cover them. The repository MUST validate the contents, exports, declarations, and Runtime consumption of a real tarball, and MUST exclude tests, fixtures, build scripts, and Host-private source code. Canonical English architecture and development documentation and their Simplified Chinese mirrors at the same relative paths MUST describe the SDK public boundary and MUST explicitly state that this capability does not deliver the iframe Runtime, Host API, permissions, plugin execution, or a public Testkit fake.

#### Scenario: Root commands cover the SDK package

- **WHEN** a developer runs the root `build`, `typecheck`, `test`, or `check` command
- **THEN** the corresponding SDK package lifecycle script runs, and failures propagate to the root command

#### Scenario: The SDK tarball is validated

- **WHEN** the SDK is packed and installed into an isolated external consumer
- **THEN** the tarball contains only the declared release files and dependency metadata, and public typechecking and the Runtime smoke test succeed
- **THEN** tests, fixtures, build scripts, and Host-private source code are absent from the tarball

#### Scenario: A developer reads the bilingual SDK documentation

- **WHEN** a developer reads the English or Chinese plugin architecture and workspace documentation
- **THEN** both languages describe SDK initialization, context, versioning, errors, and the transport injection boundary with equivalent semantics
- **THEN** neither language describes the SDK foundation as a Runtime that can already install, register, or execute plugins
