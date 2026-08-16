## ADDED Requirements

### Requirement: Official candidates MUST pass the production Child WebView lifecycle gate
Every official release candidate MUST use the current WebView Manifest/SDK protocol and pass installation, open, native load, bridge ready, SDK ready, representative interaction, close and terminal-destroy evidence through the production Host. The gate MUST reject iframe exports, legacy Manifests, privileged official-only Runtime branches and candidates that leave a Child WebView or bridge alive.

#### Scenario: Candidate is eligible for publication
- **WHEN** its digest-fixed `.lxp` passes package, public-consumer and real Child WebView lifecycle validation
- **THEN** release jobs may publish the exact verified bytes and audit sidecars without executing code under release authority

#### Scenario: Candidate uses a legacy Runtime
- **WHEN** inspection or smoke evidence finds iframe Manifest/SDK/runtime behavior
- **THEN** publication fails before any GitHub Release asset is created
