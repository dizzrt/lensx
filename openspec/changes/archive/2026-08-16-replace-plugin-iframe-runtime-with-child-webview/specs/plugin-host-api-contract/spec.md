## ADDED Requirements

### Requirement: Host API semantic values MUST remain independent of native WebView transport
The public Host API version and method/result/event semantics MUST remain unchanged by the container migration. Runtime Context, capabilities, requests, results, errors and events MUST NOT contain Child WebView label/handle, bounds, bridge objects, private frames, Session nonce, origin token, Tauri/Wry types or process facts. No method may be added solely to resize, focus, navigate or configure the native view.

#### Scenario: Public Contract declarations are inspected
- **WHEN** release validation compares Host API `0.2.x` before and after migration
- **THEN** semantic shapes and capability discovery remain stable while native implementation facts stay private

#### Scenario: Plugin requests WebView control
- **WHEN** a plugin constructs an unknown native-view method or extra trusted fields
- **THEN** Contract validation rejects it before transport or Dispatcher side effects
