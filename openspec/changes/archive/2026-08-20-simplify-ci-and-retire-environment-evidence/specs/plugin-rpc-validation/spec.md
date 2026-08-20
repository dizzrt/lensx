## REMOVED Requirements

### Requirement: Delivery MUST prove RPC limits without expanding the public plugin platform

**Reason**: This requirement includes bounded target macOS WKWebView evidence in the RPC completion matrix. That environment prerequisite is no longer maintained.

**Migration**: Retain deterministic malicious fixtures, policy and analyzer checks, Host adapter races, real Contract and SDK MessageChannel checks, tarball and workspace boundaries, and limit, error, cancellation, zero-handler-hit, and no-public-expansion assertions. Remove the macOS evidence prerequisite.

## ADDED Requirements

### Requirement: Delivery MUST deterministically prove RPC limits without expanding the public plugin platform

Delivery MUST include deterministic shared valid and malicious fixtures, policy/analyzer unit tests, Host adapter race tests, real Contract and SDK MessageChannel integration, public tarball and workspace-boundary checks. Tests MUST cover exact-limit acceptance and over-limit rejection for bytes, depth, node count, concurrency, execution deadline, monotonic request IDs, cancellation races, invalid Handler output, invalid events, safe diagnostics, post-response effects, current bridge binding, and zero Handler hits for rejected input. Validation MUST use the stable `plugin-rpc-validation` capability Gate and MUST add no public SDK option/export, Host API method/error code, Tauri command, Rust authority, runtime dependency, browser, WebView, native harness, or environment evidence.

#### Scenario: Focused RPC validation gate passes

- **WHEN** the Gate runs with Contract, SDK, Host adapter, Dispatcher, storage, MessageChannel, package-boundary, and workspace checks
- **THEN** valid calls preserve behavior while malicious or over-budget fixtures reach zero unintended Handlers and effects
- **THEN** SDK and Host observe stable compatible errors without exposing private wire or policy modules

#### Scenario: Public or later-runtime scope leaks into delivery

- **WHEN** RPC policy becomes plugin-configurable, a private validator becomes public, or the change adds batch, streaming, frequency, CPU, memory, or suspension control
- **THEN** the focused boundary Gate fails
- **THEN** the out-of-scope behavior requires its own explicit capability change

#### Scenario: Legacy or environment entry remains

- **WHEN** the root manifest, CI, documentation, or specs use a dedicated legacy RPC alias or require target-environment evidence
- **THEN** no-dual-entry or environment policy fails
- **THEN** callers migrate to the deterministic registry Gate without changing RPC coverage
