## ADDED Requirements

### Requirement: External Runtime authoring MUST use the WebView protocol exclusively
Manifest Contract `0.3.0` MUST accept exactly `runtime.kind: "webview"` for an external Page Runtime and MUST keep `runtime.entry` as a safe package-relative HTML reference. It MUST reject `runtime.kind: "iframe"`, Manifest `0.2.x`, unknown Runtime kinds, native labels, bridge configuration, WebView options and permissions. Validation MUST remain deterministic across TypeScript and Rust.

#### Scenario: A current WebView Manifest is normalized
- **WHEN** an author Manifest declares protocol `0.3.0`, `runtime.kind: "webview"` and a valid package-relative entry
- **THEN** Contract and Host normalize the same bounded Runtime descriptor
- **THEN** the descriptor contains no Child WebView, Tauri, bridge, origin or native configuration

#### Scenario: An iframe Manifest is inspected
- **WHEN** an author Manifest uses protocol `0.2.x` or `runtime.kind: "iframe"`
- **THEN** validation returns the stable incompatible-protocol diagnostic
- **THEN** no alias, rewrite or fallback Runtime is created

## REMOVED Requirements

### Requirement: The first external Runtime must be an iframe
**Reason**: External Pages now execute in a Host-owned Child WebView.
**Migration**: Upgrade the Manifest to `0.3.0` and replace `runtime.kind: "iframe"` with `runtime.kind: "webview"`.
