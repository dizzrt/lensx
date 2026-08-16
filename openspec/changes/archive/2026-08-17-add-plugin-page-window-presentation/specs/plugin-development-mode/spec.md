## MODIFIED Requirements

### Requirement: Development execution MUST use the production Child WebView path
Development registration and manual reload MUST use the same Manifest `0.4.0`, bounded Page presentation normalization, native surface coordinator, Child WebView registry, origin/resource binding, navigation, bridge, Session, RPC, Host API and teardown boundaries as installed plugins. Development source MUST grant no alternate Tauri command, bridge, bounds, CSP, Host authority, runtime resize setter, or user-size persistence. A development Page's valid presentation MUST receive the same fixed/resizable behavior, work-area fitting, same-attempt retention and actual-close reset as an installed Page.

#### Scenario: Development Page opens
- **WHEN** an opted-in validated development snapshot with an explicit Page presentation becomes current
- **THEN** it runs through the production Child WebView and native surface services without a dev-only Runtime or presentation path
- **THEN** invalid presentation or Manifest `0.3.x` is rejected before Registration commit

#### Scenario: Manual reload commits
- **WHEN** a new immutable `0.4.0` snapshot and generation commit atomically after the user resized the previous attempt
- **THEN** old Child WebView teardown completes and a fresh attempt/WebView uses the new snapshot's Manifest initial size
- **THEN** uncommitted reload failure leaves the current WebView and its transient current size unchanged

