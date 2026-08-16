## ADDED Requirements

### Requirement: Plugin UI MUST remain document-local inside the Child WebView
`@lensx/plugin-ui` MUST continue to consume only validated public Runtime Context and plugin-owned React/Semi dependencies inside the plugin document. It MUST NOT access Host DOM, native slot/bounds, Child WebView handles, bridge frames, Tauri APIs or Host navigation. Its theme, locale, accessibility and feedback behavior MUST work when rendered as the top-level Child WebView document.

#### Scenario: Plugin UI renders in current Child WebView
- **WHEN** a plugin supplies validated Runtime Context to `PluginUiProvider`
- **THEN** components adapt locale/theme within the plugin document without native or Host authority

#### Scenario: Package declarations are inspected
- **WHEN** public tarball boundaries are checked
- **THEN** no Runtime container, bridge or Host-private type leaks through Plugin UI exports
