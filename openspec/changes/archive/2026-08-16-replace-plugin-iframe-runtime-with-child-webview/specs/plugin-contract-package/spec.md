## ADDED Requirements

### Requirement: Contract package MUST publish the WebView Manifest boundary as one fact chain
`@lensx/plugin-contract` MUST publish the `0.3.0` Manifest Schema, generated types, normal and malicious fixtures, validator and normalizer for the WebView Runtime. Public declarations and packed files MUST NOT retain iframe Runtime authoring types or expose Child WebView, Tauri, bridge, label, origin token or Host-private Session facts.

#### Scenario: An external consumer installs the packed Contract
- **WHEN** a temporary consumer validates the canonical WebView and legacy iframe fixtures from the packed tarball
- **THEN** the WebView fixture succeeds and the iframe fixture receives the same stable incompatible result as the Host
- **THEN** no workspace source import or private Runtime declaration is required

#### Scenario: Contract artifacts drift
- **WHEN** Schema, generated types, fixtures, validator, normalizer or Rust consumer disagree about the Runtime kind or protocol version
- **THEN** the contract drift gate fails before publication
