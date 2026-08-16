# Plugin Testkit Specification

## Purpose

Define the stable public `@lensx/plugin-testkit` package for testing the shipped Plugin Contract and Plugin SDK without starting the lensX desktop Host, including Manifest and Runtime context fixtures, semantic transport control, cancellation and deferred helpers, lifecycle coverage, package boundaries, and release validation. This capability does not claim delivery of a real Host API, permission system, native plugin Runtime, plugin execution path, or formal plugin project template.
## Requirements
### Requirement: The system MUST provide a constrained, framework-neutral public Plugin Testkit package

The system MUST provide the independently buildable, testable, and packable `@lensx/plugin-testkit@0.1.0` workspace package. The package MUST depend only on the public root entries of `@lensx/plugin-contract` and `@lensx/plugin-sdk`. Its public Runtime and type entries MUST NOT depend on the private root Host, `src/app/**`, React, Semi Design, Tauri, DOM global types, Node filesystem APIs, Host-internal styles, or any test-runner API. Paths that are not declared in the package exports MUST NOT become public APIs.

#### Scenario: An external consumer uses the Testkit root entry

- **WHEN** a consumer outside the workspace installs real Contract, SDK, and Testkit tarballs and imports only `@lensx/plugin-testkit`
- **THEN** the consumer's TypeScript compilation and ESM Runtime smoke test succeed in an ES2022 environment without DOM, React, Semi Design, Tauri, Host-private modules, or test-runner types

#### Scenario: A consumer attempts a deep import

- **WHEN** a consumer imports Testkit source code, tests, build scripts, or an internal module that is not declared in the package exports
- **THEN** package resolution rejects the import

#### Scenario: Two Testkit instances are used concurrently

- **WHEN** two tests independently create fixtures, cancellation controllers, or fake transports
- **THEN** the handlers, observations, listeners, contexts, and cancellation state of either test do not change the other test's state

### Requirement: Testkit MUST use the real Contract to create and transform Manifest fixtures

Testkit MUST provide a Manifest author-input fixture factory that returns a fresh, minimal, complete input satisfying the current Manifest Contract on every call. Testkit MUST use public `@lensx/plugin-contract` types and current-version constants, and its baseline MUST be checked with the real validator and normalizer. Testkit MUST NOT duplicate the Manifest Schema, diagnostic ordering, compatibility, or normalization algorithms. Testkit MUST also provide a JSON Pointer based helper that explicitly applies ordered `set` and `remove` mutations to a deep copy and returns `unknown`. The helper MUST NOT modify caller input or implicitly deep-merge arrays or objects.

#### Scenario: A current valid Manifest fixture is created

- **WHEN** a consumer creates a default Manifest fixture and passes it to the public Manifest validator and normalizer
- **THEN** the validator accepts the input and the normalizer returns a deterministic result compatible with the current version
- **THEN** the fixture contains no Host-owned registration, permission grant, or Runtime state

#### Scenario: Manifest fixtures are created repeatedly

- **WHEN** a consumer creates two default fixtures and changes a nested value in one fixture
- **THEN** the other fixture and later default fixtures returned by Testkit remain unchanged

#### Scenario: An invalid Manifest is constructed explicitly

- **WHEN** a consumer uses a JSON Pointer mutation to remove a required field or set an invalid value
- **THEN** the helper returns a candidate `unknown` value without changing the original input
- **THEN** the real Contract validator rejects the candidate using its stable diagnostics

#### Scenario: A mutation location is invalid

- **WHEN** a mutation uses an invalid JSON Pointer, an out-of-range array index, or an operation that cannot be completed
- **THEN** the helper fails with a deterministic Testkit configuration error before returning a partially transformed result
- **THEN** the original input remains unchanged

### Requirement: Testkit MUST create Runtime context fixtures that express only the current SDK boundary

Testkit MUST provide a Runtime context fixture factory whose defaults use the Contract's current Host API version, the `en-US` locale, the `light` theme, and an empty capability list. Consumers MUST be able to replace the Host API version, locale, theme, and complete capability list. Every result and its capability list MUST be copied and frozen. The fixture MUST NOT accept or add plugin identity, Page identity, installation source, Manifest permission requests, user authorization, or session grants.

#### Scenario: A default Runtime context is created

- **WHEN** a consumer creates the default context and initializes an SDK client through the fake transport
- **THEN** the client enters `ready` with the current compatible Host API version, English locale, light theme, and an empty capability list

#### Scenario: Locale, theme, and capabilities are overridden

- **WHEN** a consumer creates a context with `zh-CN`, the dark theme, and a non-empty list of unique capability IDs
- **THEN** the SDK accepts the values, and neither mutation of the input array nor attempted mutation of the result changes the context snapshot

#### Scenario: An invalid or incompatible context is tested

- **WHEN** the fake transport is configured to return an invalid context or a Host API version unsupported by the SDK
- **THEN** the real SDK returns its stable `invalid_runtime_context` or `incompatible_host_api` error respectively
- **THEN** Testkit does not replace SDK validation

#### Scenario: A capability is mistaken for permission authorization

- **WHEN** a context fixture contains a capability ID
- **THEN** Testkit does not create a permission grant, permission decision, or corresponding Host API execution capability

### Requirement: The fake transport MUST be scriptable and provide controlled observations

Testkit MUST provide a semantic fake transport implementing the public `PluginSdkTransport`. By default, the fake MUST connect with a fresh valid Runtime context. Consumers MUST be able to configure explicit connect and request handlers, emit abstract events, notify disconnection, and keep operations pending. Handlers MUST receive the structural cancellation signal supplied by the SDK. The fake MUST expose read-only observation snapshots for connection attempts, requests, signals, subscriptions, and disposal. It MUST NOT expose or require an RPC envelope, request ID, nonce, origin, `Window`, `MessagePort`, `postMessage`, Host object, or trusted identity field.

#### Scenario: The default fake initializes the SDK

- **WHEN** a consumer injects an otherwise unconfigured fake transport into a new SDK client and initializes it
- **THEN** the client enters `ready`, the fake records one connection attempt, and its observations expose no private wire data

#### Scenario: A transport failure is configured

- **WHEN** a connect handler fails with an arbitrary private exception
- **THEN** the real SDK maps the result to the safe `transport_failure` error
- **THEN** the fake's public observations do not expose the exception stack, Host object, or wire payload

#### Scenario: An abstract event subscription is used and cancelled

- **WHEN** a consumer subscribes to an abstract event, emits a payload through the fake, repeatedly unsubscribes, and emits another payload
- **THEN** the listener receives only the payload emitted before unsubscription, and repeated unsubscription has no additional side effects

#### Scenario: The Host disconnects before a pending result arrives

- **WHEN** initialization or a semantic request remains pending, the fake reports a disconnection, and the pending handler later completes
- **THEN** the SDK enters `disconnected`, aborts its signal, and ignores the late result without restoring the client or notifying the consumer again

#### Scenario: The fake is cleaned up repeatedly

- **WHEN** the SDK or consumer invokes disposal repeatedly
- **THEN** fake listeners are released, disposal observations remain predictable, and other fake instances are unaffected

### Requirement: Testkit MUST provide framework-neutral cancellation and asynchronous control helpers

Testkit MUST provide a cancellation controller implementing `PluginSdkCancellationSignal` and a generic deferred factory. The controller MUST provide a structural signal, listener addition and removal, and idempotent abort. The deferred helper MUST expose only its promise, resolve function, and reject function. Neither helper MUST modify global timers, install runner matchers, or require DOM `AbortController` or any particular test runner.

#### Scenario: A caller cancels initialization

- **WHEN** a connect handler remains pending and a consumer cancels SDK initialization with the Testkit cancellation controller
- **THEN** the SDK returns `cancelled`, aborts the transport signal, removes cancellation listeners, and ignores a late resolution without changing client state

#### Scenario: An SDK operation times out

- **WHEN** a handler remains pending through a deferred and the configured SDK timeout elapses
- **THEN** the SDK returns `timeout`, aborts the transport signal, and ignores the deferred's late completion

#### Scenario: Abort or deferred completion is repeated

- **WHEN** a consumer repeatedly aborts the same controller or resolves or rejects an already settled deferred
- **THEN** the published cancellation state and Promise outcome remain unchanged, and no additional listener notification occurs

### Requirement: Testkit MUST verify only the current public SDK lifecycle without inventing future Host capabilities

Testkit MUST support tests for successful initialization, explicit retry, invalid or incompatible contexts, cancellation, timeout, transport failure, Host disconnection, event unsubscription, and idempotent disposal. The initial Testkit MUST NOT add an arbitrary string-based call method to `PluginSdkClient`, define real Host API method or error Schemas, provide a permission harness or authorization result, implement an iframe transport, Runtime session, Page Runtime, or plugin execution path. The transport's abstract `request` MUST NOT be described as a delivered Host API call.

#### Scenario: Initialization is explicitly retried after failure

- **WHEN** an initial connection fails through cancellation, timeout, or transport failure and the client returns to `idle`, and the consumer then reconfigures the fake and initializes again
- **THEN** the second initialization can succeed, and Testkit neither retries automatically nor hides the first SDK error

#### Scenario: A client is disposed idempotently

- **WHEN** a consumer disposes any non-disposed client one or more times
- **THEN** the client remains `disposed`, pending operations and listeners are released, and the SDK cleans up the transport at most once

#### Scenario: A consumer attempts to obtain a permission decision

- **WHEN** a consumer inspects the initial Testkit public entry
- **THEN** it contains no permission grant or denial harness, Host permission catalog, or invented stable `PermissionDenied` error

#### Scenario: A consumer attempts to simulate an iframe wire protocol

- **WHEN** a consumer holds only the initial Testkit fake transport
- **THEN** its API does not permit configuration of an origin, nonce, window, message port, or RPC envelope and does not claim to validate iframe source security

### Requirement: Testkit MUST participate in complete workspace, release, and documentation validation

The Testkit package MUST declare meaningful `build`, `typecheck`, `test`, `check`, and real-tarball validation scripts. Root aggregate commands and a dedicated Testkit gate MUST cover those scripts. The real-tarball gate MUST validate the release file allowlist, root entry, public declarations, and dependency metadata, and MUST install real Contract, SDK, and Testkit tarballs in an isolated consumer outside the workspace. Canonical English architecture and development documentation and their Simplified Chinese mirrors at the same relative paths MUST describe Testkit usage, boundaries, and validation and MUST state that Testkit does not deliver a real Host API, permission system, native plugin Runtime, or plugin execution.

#### Scenario: Root commands cover Testkit

- **WHEN** a developer runs the root `build`, `typecheck`, `test`, or `check` command
- **THEN** the corresponding Testkit package lifecycle script runs, and failures propagate to the root command

#### Scenario: A Testkit tarball is consumed in isolation

- **WHEN** the pack gate installs real Contract, SDK, and Testkit tarballs
- **THEN** the isolated consumer can create Manifest and context fixtures, initialize the SDK with the fake transport, observe state, and dispose without reading lensX source code or starting the desktop Host

#### Scenario: Testkit release contents drift

- **WHEN** a tarball leaks tests, build scripts, Host-private source, or an undeclared deep entry, or omits required Runtime JavaScript, declarations, license, usage documentation, or dependency metadata
- **THEN** the Testkit release gate fails and reports the drift

#### Scenario: A developer reads the bilingual Testkit documentation

- **WHEN** a developer reads the English or Simplified Chinese plugin architecture and workspace documentation
- **THEN** both languages describe the public helpers, typical lifecycle testing, and root and package validation commands with equivalent semantics
- **THEN** neither language presents the Testkit simulation as an implemented Host API, permission decision, native plugin Runtime, formal project template, or plugin execution capability

### Requirement: Testkit MUST remain a semantic fake across the Child WebView migration
The public Testkit MUST model SDK lifecycle, Runtime Context, Contract requests/results/events, cancellation and asynchronous control through `PluginSdkTransport`. It MUST NOT simulate a Child WebView, native bridge, WebView label, bounds, Tauri ACL, navigation policy or process isolation. Real Runtime claims MUST remain in Host/native integration and target macOS gates.

#### Scenario: Plugin author tests business behavior
- **WHEN** an external test injects `FakePluginSdkTransport`
- **THEN** it can deterministically test public SDK behavior without browser or native dependencies

#### Scenario: Test attempts to claim native isolation
- **WHEN** only Testkit evidence is available
- **THEN** completion gates reject it as proof of bridge, navigation, WebView or teardown enforcement
