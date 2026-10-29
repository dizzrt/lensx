# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
