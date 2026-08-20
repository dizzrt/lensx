## REMOVED Requirements

### Requirement: WebView transport delivery MUST prove public packaging and real native isolation

**Reason**: This requirement makes real macOS Child WebView handshake, roundtrip, and isolation evidence a delivery condition for the SDK transport. That native environment validation is retired.

**Migration**: Retain the SDK, private codec, Host bridge adapter, RPC, lifecycle, drift, real tarball consumer, root and WebView entries, and no-deep-import checks. Cover them with deterministic adapter, integration, and malicious-input tests, with no target-WebView Gate.

## ADDED Requirements

### Requirement: WebView transport delivery MUST prove public packaging and deterministic bridge isolation

Focused deterministic validation MUST cover SDK lifecycle, private codec, production bridge-adapter composition, RPC validation, drift tests, malicious frames, replacement, and terminal cleanup. A real tarball consumer MUST prove that the root entry needs no DOM or native types, `/webview` is consumable by an ordinary external plugin, and private modules cannot be deep-imported. Adapter integration MUST cover handshake state, roundtrip, concurrency, cancel, events, stable errors, forged source, malformed frame, replacement, cleanup, and zero generic Tauri authority hits without launching a real Child WebView.

#### Scenario: Complete deterministic transport matrix passes

- **WHEN** unit, consumer, adapter-integration, and malicious matrices pass
- **THEN** the public package exposes only the semantic SDK and zero-configuration factory, and production composition accepts only the modeled current source bridge
- **THEN** no iframe compatibility transport, parent-window bus, public native adapter, or environment evidence is required

#### Scenario: Real native isolation is claimed

- **WHEN** only deterministic adapter and package validation has run
- **THEN** completion MUST NOT claim real native or WebView isolation evidence
- **THEN** the supported deterministic transport and boundary conclusions remain reportable
