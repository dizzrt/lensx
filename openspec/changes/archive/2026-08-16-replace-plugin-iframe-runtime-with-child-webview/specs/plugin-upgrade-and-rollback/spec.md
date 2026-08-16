## ADDED Requirements

### Requirement: Replacement MUST NOT bridge legacy iframe and current WebView authority
Preparation MAY classify an installed legacy registration or selected legacy package for user feedback, but commit MUST publish only a current WebView-compatible registration. Runtime quiescence MUST destroy the old container and authority before replacement publication. Host MUST NOT run an iframe compatibility adapter, reuse a MessagePort Session or silently rewrite package bytes; rollback history MUST NOT retain executable old Runtime authority.

#### Scenario: Current WebView plugin replaces another current version
- **WHEN** preparation and commit succeed
- **THEN** old Child WebView teardown completes and the next open derives a fresh generation, attempt, WebView and Session

#### Scenario: Replacement package uses iframe protocol
- **WHEN** preparation inspects a legacy Manifest
- **THEN** it returns incompatible before commit and leaves the current registration and Runtime unchanged
