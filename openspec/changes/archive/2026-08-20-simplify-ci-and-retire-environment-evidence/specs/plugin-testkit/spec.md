## MODIFIED Requirements

### Requirement: Testkit MUST remain a semantic fake across the Child WebView migration

The public Testkit MUST model SDK lifecycle, Runtime Context, Contract requests/results/events, cancellation, and asynchronous control through `PluginSdkTransport`. It MUST NOT simulate a Child WebView, native bridge, WebView label, bounds, Tauri ACL, navigation policy, or process isolation. Maintained repository validation MUST treat Testkit only as deterministic author-side behavior support and MUST NOT delegate real Runtime completion claims to a target macOS Gate or any replacement environment-evidence path.

#### Scenario: Plugin author tests business behavior

- **WHEN** an external test injects `FakePluginSdkTransport`
- **THEN** it can deterministically test public SDK behavior without browser or native dependencies

#### Scenario: Test attempts to claim native isolation

- **WHEN** only Testkit evidence is available
- **THEN** completion reports only semantic SDK behavior coverage
- **THEN** it MUST NOT claim bridge, navigation, WebView, native isolation, or real teardown enforcement

#### Scenario: Environment Gate is used to supplement Testkit

- **WHEN** a maintained Testkit caller requires a browser, real WebView, native harness, or target macOS evidence
- **THEN** validation governance rejects the caller
- **THEN** no compatibility Gate is retained
