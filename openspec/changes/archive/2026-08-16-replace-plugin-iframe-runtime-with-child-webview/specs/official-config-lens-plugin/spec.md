## ADDED Requirements

### Requirement: ConfigLens MUST consume the same Child WebView Runtime as external plugins
ConfigLens Manifest, SDK initialization, package candidate, installation and Page execution MUST use the public `0.3.0` WebView contract, `@lensx/plugin-sdk/webview` and the production Child WebView service. Repository location, Publisher and official release metadata MUST NOT select a privileged bridge, direct Host import, alternate WebView configuration or retained iframe path.

#### Scenario: Immutable ConfigLens candidate opens
- **WHEN** the released `.lxp` is installed and opened through the normal Launcher flow
- **THEN** it reaches SDK ready and editing through the same source-bound bridge as an external plugin

#### Scenario: Official source requests native authority
- **WHEN** ConfigLens attempts an undeclared Tauri or Host command
- **THEN** the same Runtime boundary rejects it with zero privileged side effect

### Requirement: ConfigLens performance evidence MUST separate container startup from editor operations
Real macOS evidence MUST record bounded cold Runtime stages separately from warm editor/Worker operations and Host responsiveness. After SDK and Worker readiness, explicit formatting of the maintained small JSON fixture MUST complete within the checked millisecond-scale budget of 100 ms at p95 in the reference harness; timeout, crash and retry MUST remain recoverable. No gate may attribute a one-to-two-second Worker or bundle delay to iframe removal without stage evidence.

#### Scenario: Warm small JSON is formatted
- **WHEN** the ready ConfigLens editor explicitly formats the reference small JSON corpus repeatedly
- **THEN** p95 action-to-model-update latency is at most 100 ms and Host heartbeat remains responsive
- **THEN** measurement records sizes and stage durations but not user content

#### Scenario: Cold open is slow
- **WHEN** total first-interactive time exceeds its maintained cold budget
- **THEN** evidence identifies resolve, WebView creation, navigation, bridge, SDK, bundle, editor and Worker stages separately
- **THEN** the change remains incomplete until the responsible stage is fixed or the accepted budget is explicitly revised
