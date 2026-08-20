## MODIFIED Requirements

### Requirement: ConfigLens UI MUST be bilingual, theme-aware, keyboard-operable and automatically verifiable

All user-visible product copy except the unchanged `ConfigLens` brand MUST use an English-default catalog with a semantically aligned Simplified Chinese catalog. Because Host Page chrome already identifies the contributed Page, the Child WebView work area MUST NOT repeat a visible page-level main title or subtitle and MUST retain an accessible main or region name. Its ready layout MUST contain exactly a flexible `content` region followed by a semantic `footer`: the single editable Monaco surface MUST fill the complete content region, while the footer MUST contain the explicit language selector, non-color-only status, visible Format and Compact controls, and a bounded conditional diagnostics region. Diagnostics MUST remain accessible and scrollable without creating a third top-level layout region.

The Page and lightweight startup feedback MUST respond to complete light/dark and locale context replacement through supported Plugin UI and Semi Design theming, preserve predictable keyboard/focus behavior, expose visible controls for every shortcut, and keep diagnostics in an appropriately bounded live region. Before Runtime Context is available, normal startup MUST remain visually empty while exposing accessible busy semantics and MUST NOT render a visible brand, progress indicator, or locale/theme-dependent message. A startup failure MAY reveal a focusable recovery control. Deterministic component and state tests MUST cover startup, absent repeated heading, content/footer order, initial and bounded resized dimensions, both locales, both themes, long text, focus, empty, valid, invalid, limit, and recovery states without screenshots, pixel comparison, browser rendering, or native visual validation.

#### Scenario: Ready ConfigLens fills the available Page body

- **WHEN** ConfigLens is ready at its initial or a user-resized modeled viewport
- **THEN** Monaco fills all space above the footer and relayouts without a second editor, clipped control, duplicated title, or document reload
- **THEN** language, status, Format, Compact and any bounded diagnostics remain inside the footer in document and visual order

#### Scenario: Locale and theme are replaced while editing

- **WHEN** a ready Page receives a complete `zh-CN` dark context after an `en-US` light context
- **THEN** footer controls, hints and diagnostics change to aligned Simplified Chinese and dark semantic tokens while the brand remains `ConfigLens`
- **THEN** input, selected language, current generation, presentation attempt and current user size remain consistent

#### Scenario: Bootstrap waits for Runtime Context

- **WHEN** the Child WebView document is loaded before locale and theme Context is available
- **THEN** normal startup remains visually empty while exposing accessible busy semantics without a visible brand, progress indicator, hard-coded locale-dependent copy or incorrect theme claim
- **THEN** the complete Plugin UI adopts the validated locale/theme and content/footer layout when Context arrives

#### Scenario: Keyboard user formats and recovers from an error

- **WHEN** a user reaches the Page by keyboard, invokes Format through the footer button or `Ctrl/Cmd+Enter`, encounters a diagnostic and corrects the input
- **THEN** focus remains visible and predictable, the bounded footer diagnostic is available without color alone, and the next operation can succeed
- **THEN** the shortcut does not replace the visible button or trap focus inside Monaco

### Requirement: Task 7.2 completion MUST use the immutable official candidate through the full product lifecycle

The same canonical ConfigLens `.lxp` bytes MUST pass plugin unit, integration, type, static, build, and supported deterministic built-artifact checks; two byte-identical packs; TypeScript and Rust inspection; and ordinary local-install preparation. Deterministic lifecycle tests MUST cover install projection, Action search, open state, SDK-ready state, package-owned Monaco and Worker resource resolution, four-language processing, Launcher hide/shortcut restore state, close, reopen, disable, upgrade, and uninstall without requiring browser, WebView, GUI, or target macOS execution. Task 7.2 completion MUST require focused deterministic ConfigLens and official release gates, complete frontend/shared and Rust validation, bilingual documentation drift checks, and strict OpenSpec validation.

#### Scenario: Complete candidate succeeds

- **WHEN** one immutable ConfigLens candidate passes every supported plugin, package, install-projection, lifecycle, documentation, and repository final gate
- **THEN** Roadmap Task 7.2 may be marked complete and the candidate may enter the existing digest-pinned official release handoff
- **THEN** completion does not claim real Runtime execution, publish the desktop application, grant Host authority, or make a release sidecar part of Runtime trust

#### Scenario: Any language or deterministic lifecycle check fails

- **WHEN** one supported language, fidelity invariant, Worker boundary, installation preparation, modeled lifecycle path, or final validation command fails
- **THEN** Task 7.2 remains incomplete and ConfigLens MUST NOT be described as fully validated under the maintained deterministic scope
- **THEN** after correction, the failed command and complete final validation set MUST run again without reusing an invalid candidate

## REMOVED Requirements

### Requirement: ConfigLens performance evidence MUST separate container startup from editor operations

**Reason**: This requirement primarily defines real target-macOS cold-open, first-interaction, recovery, heartbeat, and formatting-latency sampling plus an evidence producer. That target-environment performance proof is explicitly retired.

**Migration**: Retain the minimal bootstrap, SDK-before-React-and-Monaco ordering, one Session, Monaco single-flight behavior, package-owned Workers, recoverable errors, and deterministic budgets for resources referenced by HTML. Remove real-product sample counts, p95 latency, heartbeat, first-interaction evidence, producer, records, and Gate.

## ADDED Requirements

### Requirement: ConfigLens bootstrap and editor resources MUST remain deterministically bounded

ConfigLens MUST use a minimal HTML-referenced bootstrap graph that starts the public `@lensx/plugin-sdk/webview` transport before importing or mounting React, React DOM, Semi Design, Plugin UI, Monaco, or language adapters. Built HTML-referenced JavaScript MUST total at most 256 KiB and HTML-referenced CSS MUST total at most 64 KiB. After valid Runtime Context arrives, ConfigLens MUST load the complete React/Semi UI and Monaco without creating a second SDK client or Session. Monaco loading MUST remain single-flight, the package-owned editor Worker MUST resolve from the candidate, and the language Worker MAY remain demand-created. Deterministic bundle inspection, unit tests, and resource-resolution tests SHALL enforce these properties without target-environment timing claims.

#### Scenario: Minimal bootstrap bundle is inspected

- **WHEN** the canonical ConfigLens candidate is built and its HTML-referenced graph is inspected
- **THEN** JavaScript and CSS remain within the maintained limits and the bootstrap starts the public SDK transport before the UI/editor graph
- **THEN** the candidate contains the package-owned editor Worker and requires no second SDK client or Session

#### Scenario: Resource boundary drifts

- **WHEN** the bootstrap exceeds a maintained byte limit, eagerly imports the editor graph, duplicates SDK initialization, or omits a required Worker asset
- **THEN** deterministic build or package validation fails
- **THEN** completion does not substitute a historical timing record or real-environment sample
