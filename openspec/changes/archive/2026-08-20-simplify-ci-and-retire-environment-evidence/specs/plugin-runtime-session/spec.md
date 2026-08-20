## REMOVED Requirements

### Requirement: Delivery MUST prove source binding on focused and real WebView paths

**Reason**: This requirement makes target macOS WKWebView source and origin, MessagePort, and teardown evidence a completion threshold and explicitly rejects deterministic substitutes. That environment threshold is no longer maintained.

**Migration**: Retain source and origin parsing, nonce and Port handling, readiness, disconnect and disposal, forgery, replay, retry and replacement, old-Port and current-fact invalidation, unrelated-registration stability, and zero-privileged-hit semantics. Verify them through TypeScript, React lifecycle, fixture, bridge-adapter, and boundary tests.

## ADDED Requirements

### Requirement: Delivery MUST deterministically validate Runtime Session source binding

Delivery MUST use pure TypeScript state/parser tests, React lifecycle tests, canonical normal and malicious `.lxp` fixtures, bridge-adapter integration tests, and production composition checks to verify exact source and origin validation, cryptographic single-use nonce semantics, MessagePort transfer handling, ready, disconnect, disposal, cross-plugin forgery, replay, retry/replacement, old-Port invalidation, current-fact invalidation, unrelated Registration stability, and zero privileged Tauri hits. Validation MUST NOT claim a real WebView source or Port transfer was observed.

#### Scenario: Deterministic Session security matrix passes

- **WHEN** normal and malicious fixtures run through Session parsers, state machines, lifecycle controllers, and bridge adapters
- **THEN** only the modeled current isolated-origin source establishes a ready Session with the current attempt's nonce and Port
- **THEN** wrong-source, wrong-origin, cross-plugin, replay, and old-Port attempts fail with bounded diagnostics

#### Scenario: Environment evidence is requested

- **WHEN** completion requires a target WebView, native harness, or committed Session evidence
- **THEN** validation governance rejects the path
- **THEN** the system does not weaken source binding or retain an environment compatibility Gate
