## MODIFIED Requirements

### Requirement: Bilingual developer documentation MUST describe the Child WebView public boundary
Canonical English documentation and identical-path Simplified Chinese mirrors MUST teach Manifest `0.4.0`, SDK `/webview`, bounded per-Page presentation, top-level Web semantics, Host-controlled slot/navigation, current bridge lifecycle, safe recovery and public package flow. They MUST explain logical initial size, the fixed `650×600` default, `resizable` user opt-in, Contract/work-area bounds, same-attempt hide/restore retention, actual-close reset, first-version non-persistence, and the distinction between normal Web viewport observation and forbidden plugin native setters. They MUST explain that ordinary Web capabilities are open, native Host authority is closed, official/development provenance grants no extra power, and OS process isolation is not guaranteed. Current guides and runnable examples MUST NOT instruct iframe, MessagePort, Tauri Window, runtime resize, position, monitor, maximize or fullscreen usage except in explicit migration/security notes.

#### Scenario: External developer follows either tutorial
- **WHEN** the developer uses only published package references, Manifest `0.4.0`, and documented commands
- **THEN** the resulting plugin builds, packs, installs and reaches SDK ready through Child WebView
- **THEN** absent presentation is fixed `650×600`, while an explicit valid presentation changes only initial Host surface and user resizability

#### Scenario: Developer looks for remembered user size
- **WHEN** documentation describes resize lifecycle or a Page is closed and reopened
- **THEN** both languages state that first-version user size exists only for the current Page attempt and is reset on real close/reopen
- **THEN** they do not promise Host preferences, plugin/browser storage, or runtime size restoration

#### Scenario: Documentation drift gate runs
- **WHEN** examples, exports, Manifest Schema, CLI output, Runtime terminology, Page presentation defaults, or authority boundaries diverge
- **THEN** automated documentation validation fails in both languages

