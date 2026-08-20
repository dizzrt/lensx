## MODIFIED Requirements

### Requirement: Delivery MUST prove RPC limits without expanding the public plugin platform

Delivery MUST include deterministic shared valid and malicious fixtures, policy/analyzer unit tests, Host adapter race tests, real Contract and SDK MessageChannel integration, public tarball and workspace-boundary checks, and bounded target macOS WKWebView evidence. Tests MUST cover exact-limit acceptance and over-limit rejection for bytes, depth, node count, concurrency, execution deadline, monotonic request IDs, cancellation races, invalid Handler output, invalid events, safe diagnostics, post-response effects, and zero Handler hits for rejected input.

The focused validation MUST be the stable `plugin-rpc-validation` capability Gate selected through the unified Gate CLI. The change MUST add no public SDK option or export, no new Host API method or error code, no new Tauri command or Rust authority, and no runtime dependency. Canonical English architecture and validation documentation and their Simplified Chinese mirrors MUST distinguish these per-frame and per-Session RPC limits from later iframe, frequency, CPU, memory, isolation, and recovery controls.

#### Scenario: Focused RPC validation gate passes

- **WHEN** the `plugin-rpc-validation` Gate runs with the real Contract, SDK, Host adapter, Dispatcher, storage, MessageChannel, package-boundary, workspace, and macOS evidence prerequisites
- **THEN** valid calls preserve existing behavior while every malicious or over-budget fixture reaches zero unintended Handlers and effects
- **THEN** SDK and Host observe stable compatible errors without exposing private wire or policy modules

#### Scenario: Public or later-runtime scope leaks into delivery

- **WHEN** an RPC policy becomes plugin-configurable, a private validator or diagnostic becomes publicly importable, or the change adds batch, streaming, persistent diagnostics, frequency isolation, plugin suspension, CPU or memory control
- **THEN** the focused boundary Gate fails
- **THEN** the out-of-scope behavior requires its own explicit capability change

#### Scenario: Legacy RPC script entry remains

- **WHEN** the stable registry Gate is available but the root manifest, CI, documentation, or specs still use a dedicated `check:plugin-rpc-validation` script
- **THEN** validation fails as a dual entry
- **THEN** the caller must migrate to the unified Gate CLI without changing RPC coverage
