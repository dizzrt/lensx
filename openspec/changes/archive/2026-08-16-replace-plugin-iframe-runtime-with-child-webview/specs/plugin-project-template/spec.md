## ADDED Requirements

### Requirement: Maintained templates MUST author and execute only the WebView Runtime
Framework-neutral and React/Semi templates MUST emit Manifest `0.3.0` with `runtime.kind: "webview"`, import `@lensx/plugin-sdk/webview`, initialize one SDK client through `createPluginWebviewTransport`, and dispose it with the Page lifecycle. They MUST contain no iframe bootstrap, parent messaging, MessagePort, Tauri, Host source import or native configuration.

#### Scenario: Either template is generated and packed
- **WHEN** an external consumer builds, tests, validates and packs a fresh template
- **THEN** the canonical `.lxp` is accepted by the current Host and opens through the Child WebView path

#### Scenario: Generated project is run outside lensX
- **WHEN** its page is loaded without the Host bridge
- **THEN** SDK initialization fails safely without probing legacy or native fallbacks
