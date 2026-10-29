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

- **WHEN** initialization fails through timeout, cancellation, or a recoverable transport failure before attempting to open the Action activation channel
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

#### Scenario: Initialization fails after attempting to open the activation stream
- **WHEN** the SDK has attempted `actions.subscribe_activations` and the overall initialization subsequently fails through timeout, cancellation, an invalid response, buffer overload, or transport error
- **THEN** the current Session and Page attempt terminate, the SDK enters disconnected or remains disposed if already disposed by the caller, and the failure is explicitly reported to the caller
- **THEN** initialization on the same Session after clearing listeners and buffers is not described as losslessly recoverable; explicit retry must create a new Runtime attempt and SDK without replaying old invocations
- **THEN** repeated subscription within the same still-pending initialize retains the same internal listener and buffer and merges the cached batch with intervening events using their original invocationId values

### Requirement: The SDK client MUST expose only Contract-closed Host API requests and events

`PluginSdkClient` MUST provide a request operation whose input is the `@lensx/plugin-contract` `HostApiRequest` discriminated union and whose resolved result is derived from the same request method's `HostApiResult`.

#### Scenario: A ready client sends a declared request

- **WHEN** a ready client receives a Contract-valid request for a declared Host API method with SDK operation options
- **THEN** it passes one frozen semantic request and cancellation signal to the configured transport and resolves with only the result paired to that method
- **THEN** the plugin does not construct a request ID, private envelope, identity, origin or Port

#### Scenario: A plugin attempts an undeclared or mismatched request

- **WHEN** plugin code supplies a removed clipboard or permission method, an arbitrary method, method/params mismatch, extra trusted field, non-JSON value, or bypasses static typing with `unknown`
- **THEN** Contract validation rejects the request before the transport is called
- **THEN** the failure does not expose a raw validator exception, wire value or Host object

#### Scenario: A declared request is attempted outside ready state

- **WHEN** a client is idle, initializing, disconnected or disposed and receives a Host API request
- **THEN** it rejects with the applicable stable SDK lifecycle error and sends no transport request

#### Scenario: A valid context replacement event arrives

- **WHEN** a ready client receives a Contract-valid `runtime.context_changed` event through its transport
- **THEN** it installs the copied and frozen complete context before notifying active typed subscribers
- **THEN** invalid, unknown, late or post-disposal events neither change context nor notify a consumer

#### Scenario: Submit a semantic Host API operation

- **WHEN** a consumer calls PluginSdkClient request
- **THEN** The client MUST validate and freeze the request before calling its semantic transport, MUST accept the existing SDK cancellation and timeout options, and MUST reject communication unless the client is ready.
- **THEN** It MUST NOT provide a call surface accepting an arbitrary string, a private method, an unpaired params object, plugin identity, legacy permission or grant state, Host authority, origin, Port, envelope, Host executor or Tauri command.

#### Scenario: Deliver a declared SDK event

- **WHEN** the SDK receives an event for a typed subscription
- **THEN** The client MUST provide typed subscription only for declared `HostApiEventName` values and MUST validate every event before notifying a consumer.
- **THEN** A valid `runtime.context_changed` MUST replace the client's read-only Runtime context before notification.

#### Scenario: Define and consume SDK request and event facts

- **WHEN** SDK public request or event declarations and validators are defined or consumed
- **THEN** SDK request and event types and validators MUST come from the Contract public entry; the SDK MUST NOT copy the Host API catalog, Schema, current Host API version or error definitions.

#### Scenario: Consume the current Action activation contract
- **WHEN** the SDK initializes or operates the current plugin's activation channel
- **THEN** request, result, Activation, and `actions.activated` types and validation all come from the public Contract entry
- **THEN** the SDK may obtain the initial activation batch through its internal initialization flow before ready, while the plugin-facing `request()` operation remains available only in ready state
- **THEN** callbacks, readonly activation snapshots, and errors do not expose internal bridge, Session, source-authentication, or native-input types

### Requirement: The SDK MUST unify cancellation, timeout, event, and late-result semantics

The system MUST apply a configurable, positive, finite timeout to initialization and SDK-managed requests, and the default timeout MUST be 10000 milliseconds.

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

#### Scenario: Cancel an operation or unsubscribe from an event

- **WHEN** a consumer supplies cancellation input, subscribes, unsubscribes, or a managed operation terminates
- **THEN** Cancellation input MUST accept a signal that is structurally compatible with native `AbortSignal` without requiring a DOM type library.
- **THEN** Event subscriptions MUST return an idempotent unsubscribe function.
- **THEN** Results and events that arrive after an operation is cancelled, times out, is disconnected, or is disposed MUST NOT change client state or notify a consumer again.

### Requirement: Runtime context MUST be read-only, versioned, and validated at Runtime

The system MUST define `PluginRuntimeContext` separately from the client
lifecycle state and MUST derive its public shape and validation facts from the
Host API Contract rather than maintaining a second SDK-owned definition.

#### Scenario: A valid Runtime context is accepted

- **WHEN** the transport returns a compatible Host API version, a supported
  locale and theme, and a valid snapshot of currently callable Host API method
  IDs
- **THEN** the client enters `ready` and exposes a context snapshot that the
  consumer cannot modify
- **THEN** SDK and Contract validation agree on the complete normalized value

#### Scenario: An empty capability snapshot is accepted

- **WHEN** the transport returns an empty `capabilities` array
- **THEN** the context remains valid, and the SDK does not invent any available
  Host API method from the catalog, Manifest, or source

#### Scenario: An invalid Runtime context is rejected

- **WHEN** the transport returns an unknown locale or theme, an invalid SemVer,
  an unknown, duplicate, or unsorted capability ID, or omits or adds a field
- **THEN** initialization fails with `invalid_runtime_context`, and the client
  returns to `idle`
- **THEN** no part of the invalid context is written to the client

#### Scenario: A plugin attempts to change trusted Runtime facts

- **WHEN** a consumer attempts to modify a returned context or provide plugin
  identity, Page identity, authority, source, or capabilities through
  initialization options
- **THEN** the context snapshot remains unchanged, and those Host-owned facts
  do not become supported SDK inputs

#### Scenario: SDK initialization consumes the Host API Context semantics

- **WHEN** a future real transport connects a client to a current Runtime
  Session
- **THEN** initialization obtains the semantic result defined for
  `runtime.get_context` and does not use a second Context protocol
- **THEN** this foundation still exposes no raw Host method call or private RPC
  envelope

#### Scenario: Accept a candidate Runtime Context

- **WHEN** the SDK defines, receives, validates, or replaces a Runtime Context
- **THEN** The first context version MUST contain a Host API SemVer, an `en-US | zh-CN` locale, a `light | dark` theme, and a read-only capability snapshot whose values are sorted, unique Host API method IDs.
- **THEN** An empty capability snapshot MUST be valid.
- **THEN** Before a client enters `ready`, the SDK MUST validate through the shared Contract facts, copy, and freeze the context.
- **THEN** The context MUST NOT accept plugin-provided identity, authority, source, installation, or Host lifecycle facts, and a capability MUST NOT be invented from Manifest requests or the complete method catalog.

### Requirement: The SDK MUST expose stable, safe SDK-level errors

The system MUST provide a discriminated `PluginSdkError` and stable `PluginSdkErrorCode` values that cover at least `cancelled`, `timeout`, `disconnected`, `disposed`, `incompatible_host_api`, `invalid_runtime_context`, `invalid_argument`, and `transport_failure`.

#### Scenario: An unknown transport failure is mapped

- **WHEN** the transport rejects initialization or an operation with an unknown
  exception before a valid Host API result or rejection exists
- **THEN** the SDK throws a `PluginSdkError` whose code is `transport_failure`
- **THEN** the error does not contain the original exception object, a private stack, Host value or transport envelope

#### Scenario: A consumer handles an SDK error by stable code

- **WHEN** a consumer catches an SDK lifecycle, timeout, cancellation, compatibility or transport error
- **THEN** the consumer can branch reliably on the SDK error code without matching localized text or an internal exception type

#### Scenario: The SDK does not duplicate Host API errors

- **WHEN** a consumer inspects the SDK request and error declarations
- **THEN** unknown method, invalid Host params, domain failures and Host internal rejection use the public Host API Contract types rather than SDK-owned copies
- **THEN** the SDK package does not redefine the Host API error code set or current Host API version

#### Scenario: A valid Host API rejection crosses the real transport

- **WHEN** the official WebView transport receives a Contract-valid Host API rejection for a pending SDK request
- **THEN** the SDK preserves its Host API error discrimination and does not map
  it to `transport_failure`
- **THEN** raw private envelope, exception, stack, path, payload, grant and Host values remain hidden

#### Scenario: Expose an SDK or Host API failure

- **WHEN** a consumer receives a lifecycle, transport, or Host API failure
- **THEN** Errors MUST provide safe, predictable messages but MUST NOT expose raw transport exceptions, stacks, Host objects, or private wire data to consumers.
- **THEN** Specific Host API method, parameter, domain, and internal errors MUST remain owned by `@lensx/plugin-contract`, stay discriminable from SDK lifecycle errors, and MUST NOT be duplicated or silently collapsed into `transport_failure`.

### Requirement: The SDK package MUST participate in complete workspace, release, and documentation validation

The SDK package MUST declare meaningful `build`, `typecheck`, `test`, and `check` scripts, and the root aggregate commands MUST cover them.

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

#### Scenario: Inspect the SDK tarball and documentation

- **WHEN** release validation or a consumer examines the public SDK package and its bilingual reference
- **THEN** The repository MUST validate the contents, exports, declarations, and Runtime consumption of a real tarball, and MUST exclude tests, fixtures, build scripts, and Host-private source code.
- **THEN** Canonical English architecture and development documentation and their Simplified Chinese mirrors at the same relative paths MUST describe the SDK public boundary and MUST explicitly state that the SDK alone does not deliver the Host Runtime, Host API execution, native authority, plugin execution, or a public Testkit fake.

### Requirement: SDK MUST expose an official zero-configuration WebView transport entry

The package MUST export `@lensx/plugin-sdk/webview` and `createPluginWebviewTransport` as the only production Runtime transport factory.

#### Scenario: External plugin consumes SDK 0.4.0
- **WHEN** a temporary external consumer still imports root and `/webview` entries from an old SDK `0.4.0` tarball
- **THEN** its existing TypeScript and browser-build boundaries remain independent of workspace source or private modules, and its factory still discovers only the current Host-installed bridge
- **THEN** buildability of the old package does not establish compatibility with current Host API `0.4.0`; using the new activation protocol still requires an SDK upgrade and repack

#### Scenario: External plugin consumes SDK 0.3.0
- **WHEN** an external plugin still bundles old SDK `0.3.0`
- **THEN** its existing root and `/webview` contracts remain independent but MUST NOT be described as supporting new HTTP methods or Host API `0.3.0`
- **THEN** the plugin must upgrade the SDK, check Manifest ranges, and repack to use new capabilities on the new Host

#### Scenario: Root SDK is imported outside a browser
- **WHEN** tests import the root package and inject semantic fake transport
- **THEN** no browser/native globals are read and normal SDK lifecycle remains testable

#### Scenario: Consume the semantic root or WebView transport

- **WHEN** an external consumer imports SDK transport exports or invokes HTTP through them
- **THEN** The root `PluginSdkTransport` abstraction MUST remain semantic, framework-neutral, and usable without DOM/native types.
- **THEN** The WebView entry MUST NOT expose or accept bridge globals, labels, handles, identities, origins, nonces, frame codecs, Tauri commands, or Host adapters.
- **THEN** New `http.request` MUST reuse the same controlled typed request and WebView transport without adding plugin-importable Tauri/native HTTP entries.

#### Scenario: External plugin consumes SDK 0.5.0
- **WHEN** an external plugin consumes root and `/webview` entries from an actual SDK `0.5.0` tarball
- **THEN** TypeScript and browser builds succeed, the root remains independent of DOM or native global types, and the transport still accepts no trust configuration
- **THEN** the SDK establishes initialization and the activation channel for current Host API `0.4.0` without adding a second carrier or a plugin-callable native input entry

### Requirement: SDK MUST preserve the declared Host API compatibility boundary

The current SDK package MUST be version `0.5.0` with Host API support range `>=0.4.0 <0.5.0`. The SDK MUST use current request, result, Context, activation, and event validation from the public Contract entry rather than copying an independent catalog. An old SDK package does not automatically support a new protocol merely because a newer Host exists.

#### Scenario: Compatible Host API initializes
- **WHEN** Runtime Context reports a valid Host API `0.4.x` version
- **THEN** SDK `0.5.0` enters ready only after the other initialization, Context, and activation checks succeed
- **THEN** only Sessions whose actual Context includes `http.request` can invoke HTTP

#### Scenario: Incompatible Host API initializes
- **WHEN** Runtime Context falls outside the declared half-open support range
- **THEN** initialization fails with the existing stable incompatibility error

#### Scenario: HTTP request is cancelled or the SDK is disposed
- **WHEN** callers cancel, the SDK is disposed, the Session disconnects, or the Runtime is replaced during HTTP
- **THEN** existing cancellation and lifecycle semantics settle the call only once and late responses cannot revive old calls
- **THEN** the SDK uses the same public cancellation boundary without exposing native request handles

#### Scenario: Initialize a compatible SDK and gate HTTP

- **WHEN** the current SDK initializes against a Host or handles an HTTP capability request
- **THEN** The minimum supported version MUST be `0.4.0`; this increase is an explicit protocol migration, and Host API `0.2.x` and `0.3.x` are outside SDK `0.5.0`'s support range.
- **THEN** Initialization MUST reject incompatible Runtime Context before ready.
- **THEN** The SDK MUST allow `http.request` only when current Context advertises it; absence of the capability on the current Host is explicitly rejected without fallback to browser fetch or a private native entry.

#### Scenario: Migrate an older SDK package to new capabilities

- **WHEN** a plugin using SDK `0.3.0` or `0.4.0` is described, executed, or upgraded to use the current activation capability
- **THEN** The existing support ranges and closed catalogs of old SDK `0.3.0` or `0.4.0` MUST NOT be described as already supporting Host API `0.4.0` or the new activation capability.
- **THEN** Authors MUST rebuild and repack using the new SDK and corresponding Manifest ranges to use new capabilities, and the Host MUST NOT rewrite old plugin packages.

#### Scenario: Plugin upgrades without implementing a business callback
- **WHEN** a plugin upgrades to SDK `0.5.0` and current Contract, declares compatibility with Host API `0.4.0`, and repacks while omitting the shortcut callback
- **THEN** initialization and opening or focusing the Page through normal entry or a dedicated shortcut still succeed, without requiring callback code for existing business features
- **THEN** the Host does not preserve old SDK execution by sending old Context, filtering the catalog, negotiating an old protocol, or rewriting installed packages

### Requirement: SDK MUST provide an optional factory callback for shortcut activations

`CreatePluginSdkOptions.onShortcutActivated` MUST be an optional `(activation: Activation) => void | Promise<void>`. Only after ready, the SDK MUST invoke it once for each admitted, not-yet-delivered activation whose source is `shortcut`, starting calls in Host invocation order; normal activations MUST NOT invoke it. `PluginSdkClient.activation` MUST expose the readonly current activation, undefined before ready and after termination, and null when ready without an activation.

#### Scenario: First shortcut activation and safe SDK requests from its callback
- **WHEN** a plugin configures the callback while creating its SDK and a dedicated shortcut opens the Page for the first time
- **THEN** the callback receives the first invocation once after the SDK is ready and Context and activation are installed, and may call `sdk.request()` for currently advertised capabilities
- **THEN** the callback receives only frozen local actionId, invocationId, and source values, without actual keys or native information

#### Scenario: Current Page is activated again
- **WHEN** the same valid Page receives another dedicated shortcut invocation
- **THEN** each new invocationId starts one callback in order while preserving Runtime, input, and plugin business state
- **THEN** the SDK does not wait for the previous callback's Promise before starting the next and does not cancel, merge, reset, or retry business operations on the plugin's behalf
- **THEN** this guarantee covers callback initiation and does not claim exactly-once network or other business side effects

#### Scenario: Normal invocation updates the snapshot without triggering shortcut business behavior
- **WHEN** a user manually selects an Action or a plugin enters the current Page normally through `actions.open`
- **THEN** SDK.activation updates to the current invocation with source `normal`, and the shortcut callback does not run
- **THEN** displaying lensX first through an ordinary launcher shortcut does not change the normal source of a subsequent manually selected Action

#### Scenario: Callback is omitted
- **WHEN** onShortcutActivated is omitted when creating the SDK
- **THEN** the SDK still initializes the activation channel and updates readonly activation, consuming events without additional business actions
- **THEN** omission does not cause invocation failure, unbounded buffering, or blocking on the 33rd call; the Page still opens or receives focus according to the existing Action semantics
- **THEN** the SDK offers no indefinitely delayed callback registration or arbitrary historical activation replay API

#### Scenario: Callback throws or rejects
- **WHEN** a callback throws synchronously or its returned Promise rejects
- **THEN** the SDK isolates the error, remains ready, and continues processing later activations without converting it into navigation or initialization failure
- **THEN** the SDK does not automatically retry the invocation or expose raw exceptions, stacks, or Host-private values

### Requirement: SDK activation initialization MUST merge snapshots and events without duplicate callbacks

The SDK MUST open its internal channel only when Context advertises `actions.subscribe_activations`, install event reception before subscribing, and merge the initial batch with early events, deduplicated and sorted by invocationId. Callbacks MUST wait until ready. Reception MUST work without a business callback. Initialization buffering MUST be bounded, and ready-state events MUST NOT accumulate unbounded history. Missing capability MUST NOT prevent normal readiness.

#### Scenario: Events arrive before the subscription response
- **WHEN** one or more `actions.activated` events arrive before the initialization response
- **THEN** the SDK retains them in a bounded temporary buffer and merges and sorts them by invocation identifier with the initial batch of at most 32 entries
- **THEN** no business callback runs before initialization finishes, and an old snapshot does not overwrite a newer admitted activation
- **THEN** initialization buffering accepts at most 64 distinct invocations; exceeding capacity terminates initialization with a stable SDK failure and explicit feedback rather than entering ready and silently dropping admitted invocations

#### Scenario: Duplicate initial batch and events
- **WHEN** the same invocationId appears in the recovered initial batch, duplicate transport delivery, or previously received events
- **THEN** the SDK updates and delivers that invocation only once, using bounded state and a consumed high-water mark rather than an unbounded historical set
- **THEN** distinct increasing invocationId values are not merged even when actionId and source are identical

#### Scenario: Explicit retry after initialization fails
- **WHEN** overall initialization fails after attempting to open the activation stream and the user explicitly retries
- **THEN** retry creates a new Runtime attempt, Session, and SDK; the old channel, listeners, and buffer terminate, and old invocations are not replayed across Sessions
- **THEN** concurrent initialize calls within the same nonterminal attempt still coalesce into one flow; repeated subscription retains the internal listener and buffer, merges only by original invocationId, and does not duplicate business callbacks
- **THEN** the SDK does not automatically retry; failed calls receive explicit failure results rather than entering ready with silently missing invocations

#### Scenario: Disposal and Session termination
- **WHEN** the SDK is disposed or disconnected, a Page closes, a plugin is uninstalled or replaced, or the old Session becomes invalid
- **THEN** the SDK stops internal event reception and clears the initial batch, temporary buffer, and activation; late responses or events start no new business callbacks
- **THEN** repeated cleanup has no additional side effects; rejection of already-started business Promises remains isolated, but the SDK does not claim to undo their external side effects automatically

#### Scenario: Activation capability is missing or capabilities are empty
- **WHEN** valid Context has empty capabilities or omits `actions.subscribe_activations`
- **THEN** the SDK enters ready normally with activation null, without requesting an undeclared subscription method or invoking the shortcut business callback
- **THEN** `actions.get_activation` independently follows current capability discovery; absence of that method alone does not prevent ready, and public requests still reject undeclared methods
