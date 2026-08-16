## ADDED Requirements

### Requirement: SDK MUST expose an official zero-configuration WebView transport entry
The package MUST export `@lensx/plugin-sdk/webview` and `createPluginWebviewTransport` as the only production Runtime transport factory. The root `PluginSdkTransport` abstraction MUST remain semantic, framework-neutral and usable without DOM/native types. The WebView entry MUST NOT expose or accept bridge globals, labels, handles, identities, origins, nonces, frame codecs, Tauri commands or Host adapters.

#### Scenario: External plugin consumes SDK 0.3.0
- **WHEN** a temporary external consumer imports the root and `/webview` entries from a packed SDK
- **THEN** TypeScript and browser loading succeed without workspace sources or private modules
- **THEN** the factory discovers only the Host-installed current bridge

#### Scenario: Root SDK is imported outside a browser
- **WHEN** a test imports the root package and injects a semantic fake transport
- **THEN** no browser or native global is read and the normal SDK lifecycle remains testable

### Requirement: SDK 0.3.0 MUST preserve the current Host API compatibility boundary
The SDK version MUST be `0.3.0` while its Host API support range remains `>=0.2.0 <0.3.0`, sourced from the public Contract rather than a copied catalog. Initialization MUST reject an incompatible Runtime Context before entering ready.

#### Scenario: Compatible Host API initializes
- **WHEN** Runtime Context reports Host API `0.2.x`
- **THEN** SDK 0.3.0 may initialize after all other validation succeeds

#### Scenario: Incompatible Host API initializes
- **WHEN** Runtime Context falls outside the declared half-open range
- **THEN** initialization fails with the existing stable incompatibility error

## REMOVED Requirements

### Requirement: The SDK MUST define a transport abstraction that does not leak the wire protocol
**Reason**: The existing requirement mandates the removed `/iframe` production entry even though its abstract transport portion remains valid.
**Migration**: Preserve the root semantic abstraction and replace only the official production entry with `/webview` as specified above.

### Requirement: The SDK and Host API MUST use independent, single-source version boundaries
**Reason**: Its pinned SDK `0.2.0` value is superseded by the breaking `0.3.0` release.
**Migration**: Use the updated SDK-version requirement above; Host API remains `0.2.x` compatible.
