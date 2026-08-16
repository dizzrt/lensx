## MODIFIED Requirements

### Requirement: ConfigLens MUST keep user content ephemeral and release all Runtime resources

ConfigLens MUST keep input and output in the current Page memory only and MUST NOT send them over network APIs, write them to browser storage, log them, or invoke a Host persistence or clipboard API. Temporarily hiding and restoring the Launcher window MUST NOT count as closing the current Page: while the current plugin's entry, Page, version, origin, resource generation and Runtime attempt remain unchanged, a launcher activation refresh MUST preserve the current Child WebView, Runtime Session, Monaco models, Workers and in-memory input. A global Registration revision MUST remain only a revalidation hint and MUST NOT revoke the current Page when only another plugin changed. Close, navigation, disable, replacement, upgrade, uninstall, development reload, SDK retry, React unmount and document teardown MUST idempotently dispose the SDK client, Monaco instances and models, marker ownership, observers, listeners, timers and all Workers. A later open after one of those actual teardown events MUST create a fresh Child WebView attempt, models, Worker and Session state without restoring old content; Host reuse of immutable current-generation package bytes MUST NOT retain executable or user state.

#### Scenario: Hidden Launcher restores the current ConfigLens Page
- **WHEN** ConfigLens is ready with user input and the Launcher window is hidden and restored through the global shortcut while its relevant entry, Page, version, origin, resource generation and Runtime attempt remain current
- **THEN** the Host keeps the same Child WebView, Runtime attempt, Session, Monaco models and Workers instead of showing a fresh plugin-page loading cycle
- **THEN** ConfigLens retains the current input, selected language, operation state and diagnostics without writing them to persistent storage

#### Scenario: Current Page closes or plugin is disabled
- **WHEN** the Host closes the Page or disables ConfigLens while a Worker operation is active
- **THEN** the Child WebView, operation, Worker, SDK Session and every editor resource become inert
- **THEN** no late result updates the Host, another plugin or a later ConfigLens generation

#### Scenario: Plugin is upgraded or uninstalled
- **WHEN** ordinary replacement installs a new ConfigLens version or ordinary uninstall removes it
- **THEN** the old generation and its in-memory content cannot be recovered by the new or removed registration
- **THEN** upgrade uses the new package's public Runtime resources and uninstall leaves no ConfigLens browser-storage migration to perform

### Requirement: ConfigLens UI MUST be bilingual, theme-aware, keyboard-operable and automatically verifiable

All user-visible product copy except the unchanged `ConfigLens` brand MUST use an English-default catalog with a semantically aligned Simplified Chinese catalog. Because the Host Page chrome already identifies the contributed Page, the Child WebView work area MUST NOT repeat a visible page-level main title or subtitle and MUST instead retain an accessible main or region name. The Page and its lightweight startup feedback MUST respond to complete light/dark and locale context replacement through supported Plugin UI and Semi Design theming, provide accessible names and non-color-only status, preserve predictable focus, expose visible controls for every shortcut, and keep diagnostics in an appropriately bounded live region. Before Runtime Context is available, normal startup MUST remain visually empty while exposing accessible busy semantics and MUST NOT render a visible brand, progress indicator, or locale- or theme-dependent product message. A startup failure MAY reveal a focusable recovery control. Automated component and fixed-viewport visual validation MUST cover startup, the absent repeated heading, editor-before-controls order, both locales, both themes, long text, focus, empty, valid, invalid, limit and recovery states.

#### Scenario: Locale and theme are replaced while editing
- **WHEN** a ready Page receives a complete `zh-CN` dark context after an `en-US` light context
- **THEN** controls, hints and diagnostics change to aligned Simplified Chinese and dark semantic tokens while the brand remains `ConfigLens`
- **THEN** input, selected language and current generation remain consistent and no superseded result replaces editor content

#### Scenario: Bootstrap waits for Runtime Context
- **WHEN** the Child WebView document is loaded before locale and theme Context is available
- **THEN** normal startup remains visually empty while exposing accessible busy semantics without a visible brand, progress indicator, hard-coded locale-dependent copy or an incorrect theme claim
- **THEN** the complete Plugin UI adopts the validated English or Simplified Chinese locale and light or dark theme when Context arrives

#### Scenario: Keyboard user formats and recovers from an error
- **WHEN** a user reaches the Page by keyboard, invokes Format through the visible button or `Ctrl/Cmd+Enter`, encounters a diagnostic and corrects the input
- **THEN** focus remains visible and predictable, the diagnostic is available without color alone, and the next operation can succeed
- **THEN** the shortcut does not replace the visible button or trap focus inside Monaco

### Requirement: ConfigLens performance evidence MUST separate container startup from editor operations
ConfigLens MUST use a minimal HTML-referenced bootstrap graph that starts the public `@lensx/plugin-sdk/webview` transport before importing or mounting React, React DOM, Semi Design, Plugin UI, Monaco or language adapters. HTML-referenced JavaScript MUST total at most 256 KiB and HTML-referenced CSS MUST total at most 64 KiB. After valid Runtime Context arrives, ConfigLens MUST load the complete React/Semi UI and Monaco without creating a second SDK client or Session. Monaco loading MUST remain single-flight, and a Page MUST count as first-interactive only after the current editable model is created and laid out, the package-owned editor Worker is ready, and target macOS evidence confirms keyboard input reaches that editor. The language Worker MAY remain demand-created and MUST NOT be required for an empty editor to become interactive.

Real target macOS evidence MUST run the canonical ConfigLens candidate through the production Child WebView, Resource Service, bridge and SDK path. Over at least twenty fresh release-like opens, Host loading-to-bridge-ready p95 MUST be at most 250 milliseconds and first-interactive p95 MUST be at most 500 milliseconds. Over at least twenty fresh Plugin Development Mode snapshot opens, first-interactive p95 MUST be at most 1000 milliseconds. Evidence MUST record bounded cold Runtime stages separately from warm editor/Worker operations and Host responsiveness. After SDK and Worker readiness, explicit formatting of the maintained small JSON fixture MUST complete within 100 milliseconds at p95 over forty samples in the reference harness; timeout, crash and retry MUST remain recoverable. No gate MAY attribute bundle, editor or Worker delay to the container without stage evidence, and no static committed summary MAY substitute for rerunning the current product path.

#### Scenario: Minimal bootstrap reaches the bridge
- **WHEN** a fresh ConfigLens Child WebView loads its canonical entry document
- **THEN** the HTML-referenced graph stays within 256 KiB JavaScript and 64 KiB CSS and starts the public SDK transport without loading React, Semi Design, Plugin UI, Monaco or language adapters first
- **THEN** bridge-ready still waits for the native finished-load boundary and grants no authority beyond the current source-bound Session

#### Scenario: Release-like cold open becomes interactive
- **WHEN** at least twenty fresh canonical candidate opens run through the current target macOS product Runtime
- **THEN** Host loading-to-bridge-ready p95 is at most 250 milliseconds and action-to-first-interactive p95 is at most 500 milliseconds
- **THEN** each sample proves a real editor model, layout, package-owned editor Worker, keyboard input and terminal cleanup

#### Scenario: Development snapshot cold open becomes interactive
- **WHEN** at least twenty fresh ConfigLens development snapshots run through the same target macOS production Runtime path
- **THEN** action-to-first-interactive p95 is at most 1000 milliseconds and stage evidence identifies development snapshot proof separately
- **THEN** Development Mode receives no alternate bridge, Runtime authority or relaxed teardown

#### Scenario: Warm small JSON is formatted
- **WHEN** the ready ConfigLens editor explicitly formats the maintained four-case small JSON corpus forty times
- **THEN** p95 action-to-model-update latency is at most 100 milliseconds and Host heartbeat remains responsive
- **THEN** measurement records sizes and stage durations but not user content

#### Scenario: Cold open is slow
- **WHEN** Host loading, release-like first-interactive or development first-interactive exceeds its maintained budget
- **THEN** replayable evidence identifies resolve, WebView creation, navigation, load, bridge, SDK, UI bundle, editor and Worker stages separately
- **THEN** the change remains incomplete until the responsible stage is fixed or the accepted budget is explicitly revised in the planning artifacts and requirements

#### Scenario: Cold-open gate uses only committed values
- **WHEN** validation reads a historical timing JSON without rerunning the canonical candidate through the target macOS product Runtime
- **THEN** ConfigLens performance evidence is incomplete even if schema and metric-calculation tests pass
