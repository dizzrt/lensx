## ADDED Requirements

### Requirement: Testkit MUST remain a semantic fake across the Child WebView migration
The public Testkit MUST model SDK lifecycle, Runtime Context, Contract requests/results/events, cancellation and asynchronous control through `PluginSdkTransport`. It MUST NOT simulate a Child WebView, native bridge, WebView label, bounds, Tauri ACL, navigation policy or process isolation. Real Runtime claims MUST remain in Host/native integration and target macOS gates.

#### Scenario: Plugin author tests business behavior
- **WHEN** an external test injects `FakePluginSdkTransport`
- **THEN** it can deterministically test public SDK behavior without browser or native dependencies

#### Scenario: Test attempts to claim native isolation
- **WHEN** only Testkit evidence is available
- **THEN** completion gates reject it as proof of bridge, navigation, WebView or teardown enforcement
