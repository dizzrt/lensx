## ADDED Requirements

### Requirement: The SDK client MUST expose only Contract-closed Host API requests and events

`PluginSdkClient` MUST provide a request operation whose input is the `@lensx/plugin-contract` `HostApiRequest` discriminated union and whose resolved result is derived from the same request method's `HostApiResult`. The client MUST validate and freeze the request before calling its semantic transport, MUST accept the existing SDK cancellation and timeout options, and MUST reject communication unless the client is ready. It MUST NOT provide a call surface accepting an arbitrary string, a private method, an unpaired params object, plugin identity, grant state, origin, Port, envelope, Host executor or Tauri command.

The client MUST provide typed subscription only for declared `HostApiEventName` values and MUST validate every event before notifying a consumer. A valid `runtime.context_changed` MUST replace the client's read-only Runtime context before notification. SDK request and event types and validators MUST come from the Contract public entry; the SDK MUST NOT copy the Host API catalog, Schema, current Host API version or error definitions.

#### Scenario: A ready client sends a declared request

- **WHEN** a ready client receives a Contract-valid request for a declared Host API method with SDK operation options
- **THEN** it passes one frozen semantic request and cancellation signal to the configured transport and resolves with only the result paired to that method
- **THEN** the plugin does not construct a request ID, private envelope, identity, origin or Port

#### Scenario: A plugin attempts an undeclared or mismatched request

- **WHEN** plugin code supplies an arbitrary method, method/params mismatch, extra trusted field, non-JSON value, or bypasses static typing with `unknown`
- **THEN** Contract validation rejects the request before the transport is called
- **THEN** the failure does not expose a raw validator exception, wire value or Host object

#### Scenario: A declared request is attempted outside ready state

- **WHEN** a client is idle, initializing, disconnected or disposed and receives a Host API request
- **THEN** it rejects with the applicable stable SDK lifecycle error and sends no transport request

#### Scenario: A valid context replacement event arrives

- **WHEN** a ready client receives a Contract-valid `runtime.context_changed` event through its transport
- **THEN** it installs the copied and frozen complete context before notifying active typed subscribers
- **THEN** invalid, unknown, late or post-disposal events neither change context nor notify a consumer

## MODIFIED Requirements

### Requirement: The SDK MUST define a transport abstraction that does not leak the wire protocol

The system MUST expose a framework-neutral `PluginSdkTransport` injection boundary that expresses connection, abstract request, abstract event, disconnection notification, and disposal semantics. This public interface MUST NOT contain request IDs, nonces, plugin identity, origins, `Window`, `MessagePort`, `postMessage`, a JSON-RPC envelope, or Host-private types. `PluginSdkClient` MUST NOT expose a raw Host API call entry that accepts an arbitrary method string.

The package MUST additionally declare an official `@lensx/plugin-sdk/iframe` entry that creates a production iframe implementation of the same semantic transport interface. The iframe entry's public declarations MUST NOT require DOM global types or expose bootstrap, Port, origin, nonce, request ID, frame, codec, identity or Host adapter configuration. Importing the root SDK entry MUST NOT access browser globals or create a transport implicitly.

#### Scenario: A test transport is injected in a non-browser environment

- **WHEN** a test implements the public transport interface in an environment without DOM or Tauri and injects it into an SDK client
- **THEN** the test can drive initialization, request results, events, cancellation, timeout, disconnection, and disposal semantics
- **THEN** importing or using the SDK root entry does not require a real iframe transport or browser global

#### Scenario: An external plugin uses the official iframe entry

- **WHEN** a browser plugin outside the workspace installs a real SDK tarball, imports only `@lensx/plugin-sdk` and `@lensx/plugin-sdk/iframe`, and passes the created transport to `createPluginSdk`
- **THEN** package resolution, TypeScript compilation and browser Runtime loading succeed without access to lensX source or an undeclared deep import
- **THEN** the consumer neither supplies nor observes the private wire, trusted identity, origin policy, nonce, Port or Host object

#### Scenario: Public transport types are inspected

- **WHEN** a consumer inspects the SDK root and iframe entry declarations
- **THEN** the declarations describe only semantic operations and the zero-trust-configuration iframe factory and do not expose or require construction of a private wire envelope, trusted identity, browser messaging object or Host object

#### Scenario: A plugin attempts to call an arbitrary Host method

- **WHEN** a plugin author holds only a public `PluginSdkClient`
- **THEN** the client provides no public call interface that accepts an arbitrary string outside the Contract's closed `HostApiRequest` union
- **THEN** private or future method names cannot be forwarded merely through a cast or handcrafted transport frame

### Requirement: The SDK MUST expose stable, safe SDK-level errors

The system MUST provide a discriminated `PluginSdkError` and stable `PluginSdkErrorCode` values that cover at least `cancelled`, `timeout`, `disconnected`, `disposed`, `incompatible_host_api`, `invalid_runtime_context`, `invalid_argument`, and `transport_failure`. Errors MUST provide safe, predictable messages but MUST NOT expose raw transport exceptions, stacks, Host objects, or private wire data to consumers. Specific Host API method, parameter, permission, domain, and internal errors MUST remain owned by `@lensx/plugin-contract`, stay discriminable from SDK lifecycle errors, and MUST NOT be duplicated or silently collapsed into `transport_failure`.

#### Scenario: An unknown transport failure is mapped

- **WHEN** the transport rejects initialization or an operation with an unknown exception before a valid Host API result or rejection exists
- **THEN** the SDK throws a `PluginSdkError` whose code is `transport_failure`
- **THEN** the error does not contain the original exception object, a private stack, Host value or transport envelope

#### Scenario: A consumer handles an SDK error by stable code

- **WHEN** a consumer catches an SDK lifecycle, timeout, cancellation, compatibility or transport error
- **THEN** the consumer can branch reliably on the SDK error code without matching localized text or an internal exception type

#### Scenario: The SDK does not duplicate Host API errors

- **WHEN** a consumer inspects the SDK request and error declarations
- **THEN** permission denial, unknown method, invalid Host params, domain failures and Host internal rejection use the public Host API Contract types rather than SDK-owned copies
- **THEN** the SDK package does not redefine the Host API error code set or current Host API version

#### Scenario: A valid Host API rejection crosses the real transport

- **WHEN** the official iframe transport receives a Contract-valid Host API rejection for a pending SDK request
- **THEN** the SDK preserves its Host API error discrimination and does not map it to `transport_failure`
- **THEN** raw private envelope, exception, stack, path, payload, grant and Host values remain hidden
