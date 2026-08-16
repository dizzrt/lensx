## ADDED Requirements

### Requirement: Bilingual developer documentation MUST describe the Child WebView public boundary
Canonical English documentation and identical-path Simplified Chinese mirrors MUST teach Manifest `0.3.0`, SDK `/webview`, top-level Web semantics, Host-controlled slot/navigation, current bridge lifecycle, safe recovery and public package flow. It MUST explain that ordinary Web capabilities are open, native Host authority is closed, official/development provenance grants no extra power, and OS process isolation is not guaranteed. Current guides and runnable examples MUST NOT instruct iframe or MessagePort usage except in explicit migration notes.

#### Scenario: External developer follows either tutorial
- **WHEN** the developer uses only published package references and documented commands
- **THEN** the resulting plugin builds, packs, installs and reaches SDK ready through Child WebView

#### Scenario: Documentation drift gate runs
- **WHEN** examples, exports, Manifest Schema, CLI output or Runtime terminology diverge
- **THEN** automated documentation validation fails in both languages
