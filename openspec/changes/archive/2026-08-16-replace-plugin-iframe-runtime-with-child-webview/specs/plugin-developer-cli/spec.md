## ADDED Requirements

### Requirement: CLI MUST generate and validate the current WebView protocol only
`create` MUST generate the maintained Manifest `0.3.0` and SDK `/webview` lifecycle. `validate`, `build`, `pack` and `inspect` MUST share current Contract/package classification, reject legacy iframe authoring with a stable incompatible diagnostic, and MUST NOT rewrite old projects or execute plugin code during inspection.

#### Scenario: New project completes the CLI loop
- **WHEN** an external user runs create, build, validate, pack and inspect
- **THEN** every step agrees on the WebView Runtime and produces a canonical installable package

#### Scenario: Legacy project is validated
- **WHEN** the project contains Manifest `0.2.x`, `runtime.kind: "iframe"` or SDK `/iframe`
- **THEN** CLI fails with bounded migration guidance and performs no automatic edit
