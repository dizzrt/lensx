## ADDED Requirements

### Requirement: Open Web baseline MUST execute in a top-level Child WebView context
Dedicated Worker, package/remote HTTPS resources, WSS/HTTPS connections, Blob/Data, WASM and browser origin storage MUST be tested as ordinary Web capabilities of the current top-level Child WebView, without permission prompts. None MUST grant Host DOM, general Tauri, native command, another plugin, old generation or persistent background authority. Official, development and community sources MUST share this exact boundary.

#### Scenario: Plugin uses ordinary Web capabilities
- **WHEN** a current Child WebView uses each supported Web baseline category
- **THEN** supported behavior succeeds without lensX grants while Host-native negative paths remain blocked

#### Scenario: Source metadata changes
- **WHEN** the same package is labeled official, local, development or community
- **THEN** its Child WebView and bridge authority remain identical

### Requirement: Open execution MUST not rely on OS process separation
Isolation claims MUST derive from current WebView identity, origin/data store, resource source binding, navigation, bridge ACL and terminal lifecycle. Tests and documentation MUST NOT claim that one Child WebView always receives a distinct WebContent process.

#### Scenario: WebKit reuses a content process
- **WHEN** platform diagnostics show process reuse
- **THEN** security acceptance remains based on enforced logical boundaries and must still pass all escape tests
