## ADDED Requirements

### Requirement: Launcher lifecycle MUST coordinate Host and Child WebView surfaces atomically
Hide, restore, resize, scale-factor change, focus, blur, shortcut activation, close and application teardown MUST update the native Child WebView through the current revisioned presentation binding. Semantic hide/restore MUST preserve the same attempt; Page close or application teardown MUST destroy it. Host-owned overlay or unavailable slot MUST hide the Child WebView before trusted DOM interaction is exposed.

#### Scenario: Launcher hides and restores
- **WHEN** the current plugin facts remain equivalent across temporary Launcher hide and restore
- **THEN** the same Child WebView and Session are hidden then shown without reload
- **THEN** launcher input focus and plugin focus follow the Host-owned activation policy

#### Scenario: Window geometry changes
- **WHEN** resize or scale-factor change produces a new slot revision
- **THEN** Rust applies verified physical bounds to the current WebView without affecting a newer attempt

#### Scenario: Launcher terminates
- **WHEN** the app unmounts or exits
- **THEN** Child WebView teardown joins the existing root lifecycle and leaves no native surface or bridge binding
