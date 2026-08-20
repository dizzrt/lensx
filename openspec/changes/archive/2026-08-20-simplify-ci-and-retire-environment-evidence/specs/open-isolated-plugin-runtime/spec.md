## REMOVED Requirements

### Requirement: The open Web baseline must have target-WebView and Host-availability evidence

**Reason**: This requirement makes target macOS WKWebView behavior, Launcher responsiveness, and environment evidence completion conditions for the open Web Runtime. Those conditions exceed the new deterministic validation scope.

**Migration**: Retain open Web capabilities, Host and native isolation, per-plugin and per-generation security domains, and termination semantics. Move provable behavior into resource, CSP, Session, lifecycle, malicious-fixture, and boundary tests, and remove the real WebView producer, records, and Gate.

## ADDED Requirements

### Requirement: The open Web baseline MUST have deterministic capability and Host-boundary validation

Maintained validation MUST cover package and remote resource policy, Dedicated Worker and browser-capability classification, Host and cross-plugin denial, generation teardown state, and Launcher lifecycle non-interference through deterministic Contract, resource, CSP, Session, state-machine, and malicious-fixture tests. It MUST NOT claim real browser execution or retain target-WebView, responsiveness, or environment-evidence prerequisites.

#### Scenario: Deterministic open Runtime matrix passes

- **WHEN** supported Web categories and malicious cross-boundary fixtures run through the maintained deterministic tests
- **THEN** browser-standard capabilities remain permissionless in the public contract while Host, Tauri, cross-plugin, and stale-generation authority remain denied
- **THEN** terminal state tests prove modeled resources and authority are revoked

#### Scenario: Environment proof is proposed as completion evidence

- **WHEN** a maintained caller requires a browser, WebView, GUI, native harness, timing sample, or committed environment record
- **THEN** validation governance rejects that caller
- **THEN** the open Web product boundary remains unchanged without an optional environment Gate
