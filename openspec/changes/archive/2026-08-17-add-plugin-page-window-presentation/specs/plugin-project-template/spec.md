## MODIFIED Requirements

### Requirement: Maintained templates MUST author and execute only the WebView Runtime
Framework-neutral and React/Semi templates MUST emit Manifest `0.4.0` with `runtime.kind: "webview"`, import `@lensx/plugin-sdk/webview`, initialize one SDK client through `createPluginWebviewTransport`, and dispose it with the Page lifecycle. Default generated Pages MUST omit presentation and therefore normalize to fixed `650×600`; maintained guidance or fixtures MAY demonstrate an explicit bounded initial size and `resizable` opt-in. Templates MUST contain no iframe bootstrap, parent messaging, MessagePort, Tauri, Host source import, native Window configuration, runtime resize setter, or user-size persistence.

#### Scenario: Either template is generated and packed
- **WHEN** an external consumer builds, tests, validates and packs a fresh template
- **THEN** the canonical `.lxp` uses Manifest `0.4.0`, is accepted by the current Host and opens through the Child WebView path at the fixed default presentation

#### Scenario: Author opts one Page into user resize
- **WHEN** the author adds a Contract-valid Page presentation following maintained guidance
- **THEN** template tests and package inspection agree on the bounded initial size and boolean opt-in
- **THEN** the generated Runtime still has no Tauri/native resize API and observes user changes only through normal Web viewport behavior

#### Scenario: Generated project is run outside lensX
- **WHEN** its page is loaded without the Host bridge
- **THEN** SDK initialization fails safely without probing legacy, presentation, or native fallbacks

