## ADDED Requirements

### Requirement: User-resized plugin Pages MUST converge through the Host-owned slot

When native user resizing is enabled by the current validated Page presentation, Window resize bursts, monitor/work-area fitting, Retina scale changes, Page chrome changes, and locale/theme layout changes MUST be observed only by the trusted Host layout and MUST produce serialized, latest-wins presentation revisions for the current Child WebView. The final accepted physical bounds MUST converge on the current Host-owned content slot without document reload, Session replacement, model/Worker recreation, or plugin-supplied bounds. Intermediate revisions MAY be coalesced, but a stale attempt MUST never resize, reveal, focus, or destroy a replacement.

#### Scenario: User drags a resizable plugin Window
- **WHEN** the user continuously resizes a current opted-in plugin Page
- **THEN** Host DOM/window observation advances bounded slot revisions and Rust applies the newest valid physical bounds to the same Child WebView
- **THEN** the Page remains interactive through the same attempt, document, Session, models, and Workers

#### Scenario: Scale or monitor work area changes during resize
- **WHEN** the current Window changes scale factor or monitor/work-area constraints while a plugin Page remains current
- **THEN** the Host recomputes effective logical constraints and scale-correct physical slot bounds
- **THEN** no plugin message, content, author DOM size, or old scale revision becomes a native bounds input

#### Scenario: Late resize targets a replaced Page
- **WHEN** a queued resize revision from Page A completes after Page B has become current
- **THEN** compare-current validation makes A's update inert
- **THEN** B follows only its own presentation and slot revision sequence

#### Scenario: Resized Page is hidden and restored
- **WHEN** an equivalent current plugin Page is user-resized, semantically hidden, and restored
- **THEN** the same Child WebView reappears in the preserved current slot without a fresh create or initial-size replay
- **THEN** actual Page close still destroys the attempt and a later open uses the Manifest initial size

