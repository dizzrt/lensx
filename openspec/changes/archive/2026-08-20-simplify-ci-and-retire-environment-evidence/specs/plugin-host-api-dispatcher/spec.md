## REMOVED Requirements

### Requirement: Delivery MUST prove real production wiring without absorbing later capabilities

**Reason**: This requirement demands a real SDK and native-bridge roundtrip plus target macOS WKWebView evidence. Those environment proofs are no longer maintained completion conditions.

**Migration**: Retain production `PluginRuntimeSlot` installation of the Session-scoped Dispatcher, the five storage methods, Context, Page and Action behavior, error, cancellation and termination, persistence, negative authority checks, and public and private package boundaries. Cover them with deterministic integration and adapter tests, and remove real WebView evidence.

## ADDED Requirements

### Requirement: Delivery MUST prove deterministic production composition without absorbing later capabilities

Production `PluginRuntimeSlot` MUST install a real Session-scoped Dispatcher for a current ready lease instead of a fixed unavailable handler, while tests retain explicit fake or unavailable binding injection. Delivery MUST cover Dispatcher unit tests, production composition tests, Navigation and Action regressions, all five scoped storage methods, SDK codec and bridge-adapter integration, concurrency, cancellation, replacement, cleanup, malicious or stale identity, complete Context events, response-before-close ordering, persistent storage restart, bounded diagnostics, and unavailable clipboard, permission mutation, arbitrary Tauri, and removed/private methods. Public tarball and workspace-boundary checks MUST prove that Host-private modules remain unreachable. No browser, WebView, GUI application, or environment evidence is required.

#### Scenario: Production Dispatcher composition and storage loops pass

- **WHEN** deterministic production-composition tests connect the public Contract and SDK boundary to a current Dispatcher Session
- **THEN** Context, Page close, same-plugin Action, and scoped persistent storage complete through authenticated current adapters
- **THEN** the public plugin boundary cannot import Host-private wire types, Tauri, storage paths, authority coordinators, or executors

#### Scenario: Removed native and permission methods stay unavailable

- **WHEN** a current or legacy fixture requests clipboard, permission mutation, arbitrary Tauri, or another method outside Host API `0.2.0`
- **THEN** the closed Contract or Dispatcher rejects it without provider side effects or capability projection
- **THEN** validation does not describe the removed method as permission-denied, grantable, or delivered

#### Scenario: Real Runtime evidence is inferred from deterministic composition

- **WHEN** only deterministic tests and package checks have run
- **THEN** completion may claim the maintained production composition and boundary coverage
- **THEN** it MUST NOT claim a real WebView or native roundtrip was executed
