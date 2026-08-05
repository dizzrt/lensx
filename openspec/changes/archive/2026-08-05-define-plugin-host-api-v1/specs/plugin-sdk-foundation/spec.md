## MODIFIED Requirements

### Requirement: Runtime context MUST be read-only, versioned, and validated at Runtime

The system MUST define `PluginRuntimeContext` separately from the client lifecycle state and MUST derive its public shape and validation facts from the Host API Contract rather than maintaining a second SDK-owned definition. The first context version MUST contain a Host API SemVer, an `en-US | zh-CN` locale, a `light | dark` theme, and a read-only capability snapshot whose values are sorted, unique Host API method IDs. An empty capability snapshot MUST be valid. Before a client enters `ready`, the SDK MUST validate through the shared Contract facts, copy and freeze the context. The context MUST NOT accept plugin-provided identity, permission, source, installation or Host lifecycle facts, and a capability MUST NOT be invented from Manifest requests or the complete method catalog.

#### Scenario: A valid Runtime context is accepted

- **WHEN** the transport returns a compatible Host API version, a supported locale and theme, and a valid snapshot of currently callable Host API method IDs
- **THEN** the client enters `ready` and exposes a context snapshot that the consumer cannot modify
- **THEN** SDK and Contract validation agree on the complete normalized value

#### Scenario: An empty capability snapshot is accepted

- **WHEN** the transport returns an empty `capabilities` array
- **THEN** the context remains valid, and the SDK does not invent any available Host API method from the catalog, Manifest or source

#### Scenario: An invalid Runtime context is rejected

- **WHEN** the transport returns an unknown locale or theme, an invalid SemVer, an unknown/duplicate/unsorted capability ID, or omits/adds a field
- **THEN** initialization fails with `invalid_runtime_context`, and the client returns to `idle`
- **THEN** no part of the invalid context is written to the client

#### Scenario: A plugin attempts to change trusted Runtime facts

- **WHEN** a consumer attempts to modify a returned context or provide plugin identity, Page identity, permissions, source or capabilities through initialization options
- **THEN** the context snapshot remains unchanged, and those Host-owned facts do not become supported SDK inputs

#### Scenario: SDK initialization consumes the Host API Context semantics

- **WHEN** a future real transport connects a client to a current Runtime Session
- **THEN** initialization obtains the semantic result defined for `runtime.get_context` and does not use a second Context protocol
- **THEN** this foundation still exposes no raw Host method call or private RPC envelope

### Requirement: The SDK MUST expose stable, safe SDK-level errors

The system MUST provide a discriminated `PluginSdkError` and stable `PluginSdkErrorCode` values that cover at least `cancelled`, `timeout`, `disconnected`, `disposed`, `incompatible_host_api`, `invalid_runtime_context`, `invalid_argument`, and `transport_failure`. Errors MUST provide safe, predictable messages but MUST NOT expose raw transport exceptions, stacks, Host objects, or private wire data to consumers. Specific Host API method, parameter, permission, domain and internal errors MUST remain owned by `@lensx/plugin-contract`, stay discriminable from SDK lifecycle errors, and MUST NOT be duplicated or silently collapsed into `transport_failure`.

#### Scenario: An unknown transport failure is mapped

- **WHEN** the transport rejects initialization or an operation with an unknown exception before a valid Host API result or rejection exists
- **THEN** the SDK throws a `PluginSdkError` whose code is `transport_failure`
- **THEN** the error does not contain the original exception object, a private stack, or a transport envelope

#### Scenario: A consumer handles an SDK error by stable code

- **WHEN** a consumer catches an SDK lifecycle, timeout, cancellation or compatibility error
- **THEN** the consumer can branch reliably on the SDK error code without matching localized text or an internal exception type

#### Scenario: The SDK does not duplicate Host API errors

- **WHEN** a consumer inspects the SDK foundation's error declarations
- **THEN** permission denial, unknown method, invalid Host params and Host internal rejection use the public Host API Contract types rather than SDK-owned copies
- **THEN** `PluginSdkClient` still exposes no concrete Host API operation before the later transport/API integration capability

#### Scenario: A valid Host API rejection crosses a future transport

- **WHEN** a later real transport receives a Schema-valid Host API rejection
- **THEN** the SDK preserves its Host API error discrimination and does not map it to `transport_failure`
- **THEN** raw private envelope, exception and Host values remain hidden
