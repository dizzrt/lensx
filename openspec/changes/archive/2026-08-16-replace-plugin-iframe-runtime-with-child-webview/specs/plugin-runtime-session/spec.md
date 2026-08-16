## MODIFIED Requirements

### Requirement: Host MUST derive every Runtime Session identity from current trusted facts
The Host MUST establish a private Session only for the actual current, enabled and compatible Child WebView. Identity MUST derive from current Page, Registration, resource descriptor, plugin/version/Page/entry, isolated origin, generation, Runtime attempt and native WebView label/handle. No Manifest field, bridge payload, public UI value or plugin-provided identity MUST select or replace those facts.

#### Scenario: Current Child WebView establishes a Session
- **WHEN** current trusted facts and the actual native source converge on one Runtime attempt
- **THEN** Host creates a read-only Session identity without exposing path, digest, scope, label, handle, origin token or native object

#### Scenario: Plugin self-reports another identity
- **WHEN** a bridge frame contains identity, source, Page, generation or authority fields
- **THEN** exact validation rejects it and no Session authority changes

#### Scenario: Legacy permission facts are presented
- **WHEN** a legacy Manifest, Registration payload or plugin message contains permission requests or grant fields
- **THEN** the current Contract or Registration boundary rejects or isolates those facts before Session identity is created
- **THEN** enabled, external, official, development or Publisher text creates no native Host authority

### Requirement: Session lifecycle MUST distinguish loaded, Session ready, SDK ready, disconnect, and disposal
Native finished-load MUST establish only `loaded`. A single-use current bridge-ready handshake MUST establish Session ready only after actual source, attempt, generation, private carrier version and freshness match. Successful validated `runtime.get_context` MUST establish SDK ready. Disconnect or disposal MUST terminate the Session and MUST NOT be reversed by a late native callback.

#### Scenario: Normal lifecycle reaches SDK ready
- **WHEN** the current Child WebView loads, completes bridge ready and obtains a valid Runtime Context
- **THEN** each state transition occurs once in order and only SDK ready enables public Host API operations

#### Scenario: Loaded WebView sends a stale ready
- **WHEN** ready belongs to an old attempt, wrong source or consumed freshness value
- **THEN** Session fails closed and cannot reach ready

## ADDED Requirements

### Requirement: Host MUST bootstrap one source-authenticated native bridge Session
Before loading the plugin document, Host MUST install the minimal versioned bridge for that Child WebView and create at least 128 bits of unpredictable, single-use attempt freshness. Host MUST accept ready only from the native callback of the actual current WebView and exact freshness value. The bridge MUST NOT fall back to `window.parent`, `postMessage`, `MessageChannel`, a global event bus or a plugin-selected Tauri command.

#### Scenario: Exact current bridge becomes ready
- **WHEN** the actual current WebView returns the exact supported ready frame once
- **THEN** Host consumes freshness, marks the Session ready and retains only the current bridge binding

#### Scenario: Ready is replayed or forged
- **WHEN** any source repeats freshness or submits malformed, old or mismatched ready data
- **THEN** no Session is created, replaced or revived and rejection remains non-oracular

## REMOVED Requirements

### Requirement: Host MUST bootstrap one authenticated MessagePort with exact target and single-use nonce
**Reason**: Child WebViews do not have the trusted DOM parent relationship used to transfer a Port.
**Migration**: Authenticate a private native bridge using actual current WebView source plus single-use attempt freshness.

### Requirement: Task 4.3 MUST leave SDK transport, Host API, permission decisions, and complete lifecycle unimplemented
**Reason**: This migration rewires the already-shipped SDK and Dispatcher in one breaking architecture change.
**Migration**: Retain existing public Host API semantics while validating the complete Child WebView path.
