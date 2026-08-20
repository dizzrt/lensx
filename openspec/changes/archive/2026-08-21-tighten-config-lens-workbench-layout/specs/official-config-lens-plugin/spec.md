## MODIFIED Requirements

### Requirement: ConfigLens UI MUST be bilingual, theme-aware, keyboard-operable and automatically verifiable

All user-visible product copy except the unchanged `ConfigLens` brand MUST use an English-default catalog with a semantically aligned Simplified Chinese catalog. Because Host Page chrome already identifies the contributed Page, the Child WebView work area MUST NOT repeat a visible page-level main title or subtitle and MUST retain an accessible main or region name. Its ready layout MUST contain exactly a flexible `content` region followed by a semantic `footer`: the single editable Monaco surface MUST fill the complete content region without page-level outer padding, a content/footer gap, or a standalone card border or radius. The footer MUST meet the content region at one separating edge and MUST contain the explicit language selector, non-diagnostic status, and visible Format and Compact controls. Validation diagnostics MUST continue to reach Monaco markers but MUST NOT render a diagnostic count, error summary, diagnostic list, additional Footer row, third top-level region, or overlay.

At the initial and larger modeled viewports, the footer MUST remain fixed to the viewport bottom at exactly 40 logical pixels high and its language selector, status, Format and Compact controls MUST be vertically center-aligned. Diagnostics, long copy, operation state and editor content MUST NOT increase its height or move it away from the bottom edge. At a modeled viewport no wider than 520 logical pixels or no taller than 260 logical pixels, footer controls MAY use a fixed 72-logical-pixel two-row responsive arrangement, but that height MUST depend only on the responsive breakpoint; outer page padding and the content/footer gap MUST remain zero.

The Page and lightweight startup feedback MUST respond to complete light/dark and locale context replacement through supported Plugin UI and Semi Design theming, preserve predictable keyboard/focus behavior, and expose visible controls for every shortcut. Before Runtime Context is available, normal startup MUST remain visually empty while exposing accessible busy semantics and MUST NOT render a visible brand, progress indicator, or locale/theme-dependent message. A startup failure MAY reveal a focusable recovery control. Deterministic component, state, style-contract and built-output tests MUST cover startup, absent repeated heading, content/footer order and adjacency, fixed-bottom footer geometry, centered controls, absence of Footer diagnostic UI, responsive fallback, initial and bounded resized dimensions, both locales, both themes, long text, focus, empty, valid, invalid, limit, and recovery states without screenshots, pixel comparison, browser rendering, or native visual validation.

#### Scenario: Ready ConfigLens fills the available Page body

- **WHEN** ConfigLens is ready at its initial or a larger user-resized modeled viewport
- **THEN** Monaco fills the complete viewport space above the footer with no outer page padding, card gap, standalone editor radius or unused spacer and relayouts without a second editor, clipped control, duplicated title or document reload
- **THEN** the 40-logical-pixel footer main row directly follows Monaco and vertically centers language, status, Format and Compact in document and visual order

#### Scenario: Invalid input does not expand the Footer

- **WHEN** ConfigLens reports one or more diagnostics at an initial or larger modeled viewport
- **THEN** Monaco updates its internal markers while the Footer renders no diagnostic count, error summary, list or additional row
- **THEN** the Footer remains exactly 40 logical pixels high at the viewport bottom and Monaco remains editable without yielding space to diagnostic UI

#### Scenario: Constrained viewport remains operable

- **WHEN** the modeled viewport is no wider than 520 logical pixels or no taller than 260 logical pixels
- **THEN** the footer MAY use a fixed 72-logical-pixel two-row arrangement without clipping language, Format or Compact
- **THEN** diagnostics and content MUST NOT change that responsive height, and the Page MUST NOT restore outer padding or a content/footer gap

#### Scenario: Locale and theme are replaced while editing

- **WHEN** a ready Page receives a complete `zh-CN` dark context after an `en-US` light context
- **THEN** footer controls and non-diagnostic hints change to aligned Simplified Chinese and dark semantic tokens while the brand remains `ConfigLens`
- **THEN** input, selected language, current generation, presentation attempt, current user size and content/footer layout remain consistent

#### Scenario: Bootstrap waits for Runtime Context

- **WHEN** the Child WebView document is loaded before locale and theme Context is available
- **THEN** normal startup remains visually empty while exposing accessible busy semantics without a visible brand, progress indicator, hard-coded locale-dependent copy or incorrect theme claim
- **THEN** the complete Plugin UI adopts the validated locale/theme and continuous content/footer layout when Context arrives

#### Scenario: Keyboard user formats and recovers from an error

- **WHEN** a user reaches the Page by keyboard, invokes Format through the footer button or `Ctrl/Cmd+Enter`, encounters a diagnostic and corrects the input
- **THEN** focus remains visible and predictable, Monaco may expose its editor-local marker, the Footer adds no diagnostic prompt, and the next operation can succeed
- **THEN** the shortcut does not replace the visible button, trap focus inside Monaco or move the controls outside the Footer
