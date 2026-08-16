## ADDED Requirements

### Requirement: Installation MUST commit only Child-WebView-compatible registrations
Preparation MUST classify the immutable package with the current Contract and MUST reject Manifest `0.2.x`, `runtime.kind: "iframe"` and other unsupported Runtime protocols before staging or registration publication. A committed registration MUST contain only normalized public WebView Runtime facts; native labels, bridge configuration, origin tokens, WebView handles and Tauri permissions MUST remain absent.

#### Scenario: User selects a current package
- **WHEN** a valid `0.3.0` WebView `.lxp` passes all existing package and first-install checks
- **THEN** installation may atomically commit a registration consumable by the Child WebView Runtime

#### Scenario: User selects a legacy iframe package
- **WHEN** the archive is safe but its Manifest protocol is obsolete
- **THEN** installation reports incompatible plugin without committing payload or registration authority
