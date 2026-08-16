# plugin-sdk-webview-transport Specification

## Purpose
TBD - created by archiving change replace-plugin-iframe-runtime-with-child-webview. Update Purpose after archive.
## Requirements
### Requirement: Official WebView transport MUST connect through one current native bridge
The system MUST provide the framework-neutral `@lensx/plugin-sdk/webview` entry and zero-configuration `createPluginWebviewTransport`. The transport MUST consume only the closed bridge installed by the Host before the current Child WebView document is created, MUST validate the bootstrap and every frame from `unknown`, MUST accept at most one current ready handshake, and MUST NOT accept plugin identity, Page, origin, label, nonce, bridge adapter, Tauri command, or Host object configuration.

#### Scenario: Current Child WebView initializes the SDK
- **WHEN** the current SDK transport sends the exact bootstrap ready through that document's bridge and the Host validates the actual source WebView, generation, and attempt
- **THEN** the transport becomes connected and completes SDK initialization through `runtime.get_context`
- **THEN** loaded, Session ready, transport connected, and SDK ready remain distinct states

#### Scenario: Bridge is absent or untrusted
- **WHEN** the plugin runs in an ordinary browser, a legacy iframe, the wrong WebView, or receives a malformed bootstrap
- **THEN** the transport fails closed with stable `transport_failure` and does not probe Tauri commands or a fallback carrier
- **THEN** it accepts no parent window, MessagePort, wildcard origin, or author-supplied adapter

### Requirement: Native bridge MUST derive authority from actual current WebView source
Host bridge ingress MUST carry the actual native WebView label or handle and compare it against the current registry, plugin, Page, entry, origin, resource generation, Runtime attempt, and Session freshness. Only a matching source's closed frame may enter RPC validation and the Dispatcher. Host-to-plugin responses and events MUST be delivered only to the same current WebView; the WebView label, handle, origin token, and native callback MUST remain Host-private.

#### Scenario: Current source sends a valid request
- **WHEN** the current ready Child WebView sends a Contract-valid request frame
- **THEN** the Host derives Session authority from the native source binding and performs the existing RPC validation
- **THEN** plugin payload cannot override source identity or select another Session

#### Scenario: Stale or forged source sends a valid-shaped frame
- **WHEN** a destroyed, replaced, other-plugin, or wrong-label WebView sends a correctly shaped frame
- **THEN** the Host rejects the frame without invoking the Dispatcher or affecting current pending state
- **THEN** diagnostics reveal no target label, generation, nonce, method payload, or Host object

### Requirement: WebView private wire MUST remain closed, bounded and carrier-independent
The private carrier MUST use a versioned closed union for ready, request, cancel, response, event, and disconnect while preserving strict request IDs, concurrency, cancellation, Host execution deadline, exactly-once settlement, Contract-valid result, error, and event values, and bounded diagnostics. Public SDK declarations MUST NOT expose frame types, codec, bridge global, Tauri or Wry types, WebView label, identity, or Host adapter. The Host implementation MAY choose explicitly ACL-scoped Tauri IPC or a per-WebView Wry handler, but public semantics and negative evidence MUST be identical.

#### Scenario: Requests complete out of order
- **WHEN** one current transport sends multiple valid requests and the Host completes them in a different order
- **THEN** each response settles only its matching operation once by request ID
- **THEN** cancel, timeout, or duplicate frames cannot settle another request or revive terminal state

#### Scenario: Plugin probes generic native authority
- **WHEN** the plugin directly calls any Tauri core, plugin, or application command, or attempts global event authority
- **THEN** the Runtime Authority or bridge adapter rejects the call before the handler with zero privileged side effects
- **THEN** the closed lensX transport bridge remains the only reachable native surface

### Requirement: Transport cleanup MUST terminate both plugin and Host endpoints exactly once
SDK disposal, Session disconnect, Child WebView destroy, Page close, disable, uninstall, replacement, Host reload, bridge message error, fatal codec error, and explicit disconnect MUST converge on idempotent cleanup. Cleanup MUST reject new requests, terminate pending operations, abort Host handlers, remove bridge listeners, clear request and subscription state, send at most one bounded disconnect, and make every late native callback inert.

#### Scenario: Runtime terminates with a pending request
- **WHEN** the current plugin is closed or replaced while a request is pending
- **THEN** the Host and SDK endpoints each become terminal, the pending operation receives a safe lifecycle error, and the handler signal is aborted
- **THEN** a post-destroy response, event, or bridge callback notifies neither the old nor the new consumer

### Requirement: WebView transport delivery MUST prove public packaging and real native isolation
The focused gate MUST cover the SDK, private codec, native bridge adapter, RPC validation, lifecycle, and drift tests. A real tarball consumer MUST prove that the root entry needs no DOM or native types, that the `/webview` entry is consumable by an ordinary external plugin, and that private modules cannot be deep-imported. Real macOS Child WebView evidence MUST cover normal handshake and roundtrip, concurrency, cancel, events, stable errors, forged source, malformed frame, replacement, and terminal cleanup, and MUST prove zero generic Tauri authority hits.

#### Scenario: Complete transport matrix passes
- **WHEN** the unit, consumer, malicious, and target-WebView matrix all pass
- **THEN** the public package exposes only the semantic SDK and zero-configuration factory, and the Host accepts only the current source bridge
- **THEN** no iframe, parent window, transferred MessagePort, or public native adapter is required

