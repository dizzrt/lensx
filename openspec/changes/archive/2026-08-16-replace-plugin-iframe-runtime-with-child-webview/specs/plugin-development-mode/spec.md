## ADDED Requirements

### Requirement: Development execution MUST use the production Child WebView path
Development registration and manual reload MUST use the same Manifest `0.3.0`, Child WebView registry, origin/resource binding, navigation, bridge, Session, RPC, Host API and teardown boundaries as installed plugins. Development source MUST grant no alternate Tauri command, bridge, bounds, CSP or Host authority.

#### Scenario: Development Page opens
- **WHEN** an opted-in validated development snapshot becomes current
- **THEN** it runs through the production Child WebView service without a dev-only Runtime

#### Scenario: Manual reload commits
- **WHEN** a new immutable snapshot and generation commit atomically
- **THEN** old Child WebView teardown completes and a fresh attempt/WebView loads the new generation
- **THEN** uncommitted reload failure leaves the current WebView unchanged

## REMOVED Requirements

### Requirement: Development execution MUST use the exact formal Runtime and permission boundaries
**Reason**: The formal Runtime boundary changes from iframe to Child WebView and the legacy permission/grant model is absent.
**Migration**: Use the production Child WebView boundary specified above with no source-based authority.
