## MODIFIED Requirements

### Requirement: ConfigLens MUST be a normal public-boundary official plugin

The system MUST provide the product named `ConfigLens` in both `en-US` and `zh-CN` as the independent package `@lensx/official-config-lens` under the canonical source location `plugins/config-lens`, with plugin identity `dev.lensx.config-lens`. Its Manifest MUST use Contract `0.4.0`, contribute exactly one WebView Page and one Launcher Action targeting that Page, and declare that Page with `initial_size: 800×600` logical pixels and `resizable: true`. The declaration MUST use the same public Page presentation contract as external plugins and MUST request no Host permission, Runtime native setter, or unpublished capability. The plugin MUST consume only public plugin package exports and ordinary browser dependencies, and the Host MUST NOT import its source or grant authority based on its official repository location.

#### Scenario: User opens ConfigLens from the Launcher
- **WHEN** the installed ConfigLens Action is found and activated on a work area that can contain its requested size
- **THEN** the Host opens its contributed Page through the ordinary Registration, Resource, isolated Child WebView Runtime and Session path in an `800×600` logical resizable Window
- **THEN** the Host Page chrome presents the brand `ConfigLens` while the plugin work area repeats no visible main title or subtitle
- **THEN** the Child WebView retains an accessible work-area name without receiving Tauri, native Window setters, Host DOM, filesystem, native clipboard or another plugin's state

#### Scenario: User resizes, hides, closes, and reopens ConfigLens
- **WHEN** the user resizes the current ConfigLens Page, hides/restores it, closes it to Home, and later opens it again
- **THEN** hide/restore preserves the current attempt and user size, close restores non-resizable `650×320` Home, and reopen starts from effective `800×600`
- **THEN** no user-adjusted size is written to ConfigLens, Host preferences, browser storage, plugin storage, package metadata, or evidence

#### Scenario: Official source attempts to bypass the public boundary
- **WHEN** `plugins/config-lens` declares or imports Host-private source, Tauri, an unpublished Host API, a workspace-only deep path, another plugin's source, or a runtime Window method
- **THEN** workspace and official release boundary validation MUST reject the member
- **THEN** no official-only import, Runtime, CSP, permission, installation, presentation, or resize exception may be added

#### Scenario: Legacy nested path remains
- **WHEN** ConfigLens source remains under the legacy `plugins/official/config-lens` path
- **THEN** workspace, official release and focused ConfigLens gates MUST report path drift
- **THEN** the system MUST NOT accept both the legacy path and `plugins/config-lens` as product members

### Requirement: ConfigLens UI MUST be bilingual, theme-aware, keyboard-operable and automatically verifiable

All user-visible product copy except the unchanged `ConfigLens` brand MUST use an English-default catalog with a semantically aligned Simplified Chinese catalog. Because Host Page chrome already identifies the contributed Page, the Child WebView work area MUST NOT repeat a visible page-level main title or subtitle and MUST retain an accessible main or region name. Its ready layout MUST contain exactly a flexible `content` region followed by a semantic `footer`: the single editable Monaco surface MUST fill the complete content region, while the footer MUST contain the explicit language selector, non-color-only status, visible Format and Compact controls, and a bounded conditional diagnostics region. Diagnostics MUST remain accessible and scrollable without creating a third top-level layout region.

The Page and lightweight startup feedback MUST respond to complete light/dark and locale context replacement through supported Plugin UI and Semi Design theming, preserve predictable keyboard/focus behavior, expose visible controls for every shortcut, and keep diagnostics in an appropriately bounded live region. Before Runtime Context is available, normal startup MUST remain visually empty while exposing accessible busy semantics and MUST NOT render a visible brand, progress indicator, or locale/theme-dependent message. A startup failure MAY reveal a focusable recovery control. Automated component, responsive and native visual validation MUST cover startup, absent repeated heading, content/footer order, `800×600` initial size, Host hard-min and larger user-resized sizes, both locales, both themes, long text, focus, empty, valid, invalid, limit and recovery states.

#### Scenario: Ready ConfigLens fills the available Page body
- **WHEN** ConfigLens is ready at its initial or a user-resized viewport
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

### Requirement: ConfigLens MUST consume the same Child WebView Runtime as external plugins
ConfigLens Manifest, Page presentation, SDK initialization, package candidate, installation and Page execution MUST use the public `0.4.0` WebView contract, `@lensx/plugin-sdk/webview` and the production Child WebView service. Repository location, Publisher and official release metadata MUST NOT select a privileged bridge, direct Host import, alternate WebView configuration, native Window method or retained iframe path.

#### Scenario: Immutable ConfigLens candidate opens
- **WHEN** the released `.lxp` is installed and opened through the normal Launcher flow
- **THEN** its presentation is resolved through ordinary normalized Registration/Page metadata and it reaches SDK ready through the same source-bound bridge as an external plugin

#### Scenario: Official source requests native authority
- **WHEN** ConfigLens attempts an undeclared Tauri, Host, position, size, resizable, monitor, maximize or fullscreen command
- **THEN** the same Runtime boundary rejects it with zero privileged side effect

