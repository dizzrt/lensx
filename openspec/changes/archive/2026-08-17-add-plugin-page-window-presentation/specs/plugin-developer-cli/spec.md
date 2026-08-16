## MODIFIED Requirements

### Requirement: CLI MUST generate and validate the current WebView protocol only
`create` MUST generate the maintained Manifest `0.4.0` and SDK `/webview` lifecycle. Templates MUST default to an omitted presentation that normalizes to fixed `650×600`, while documented author edits MAY add the bounded Page presentation contract. `validate`, `build`, `pack` and `inspect` MUST share current Contract/package presentation normalization, reject Manifest `0.3.x` and older or iframe authoring with a stable incompatible diagnostic, and MUST NOT rewrite old projects, execute plugin code, persist user size, or expose native Window operations during inspection.

#### Scenario: New project completes the CLI loop
- **WHEN** an external user runs create, build, validate, pack and inspect without adding presentation
- **THEN** every step agrees on Manifest `0.4.0`, WebView Runtime and fixed `650×600` Page default and produces a canonical installable package

#### Scenario: Project declares custom presentation
- **WHEN** an external user adds a valid initial logical size and `resizable` boolean to one Page
- **THEN** validate, pack and inspect produce the same bounded normalized presentation for that Page
- **THEN** machine output contains no monitor coordinates, native handles, user-adjusted size or executable Window configuration

#### Scenario: Legacy project is validated
- **WHEN** the project contains Manifest `0.3.x` or older, `runtime.kind: "iframe"` or SDK `/iframe`
- **THEN** CLI fails with bounded migration guidance and performs no automatic edit

