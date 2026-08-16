## ADDED Requirements

### Requirement: Every isolated origin MUST be bound to one actual current Child WebView
The Host MUST derive a distinct origin and data-store identity for every current resource generation before Child WebView creation. Resource and navigation access MUST additionally match the actual current WebView label/handle and Runtime attempt; the origin alone MUST NOT authorize a Host WebView, remote document, old WebView or another plugin. The public plugin surface MUST NOT reveal origin tokens or data-store identifiers.

#### Scenario: Current Child WebView loads its module graph
- **WHEN** the actual current Child WebView requests the exact entry and same-generation package resources
- **THEN** the isolated origin supports the representative module and Worker graph without CORS relaxation
- **THEN** Host DOM, Tauri authority and another generation remain unreachable

#### Scenario: An old WebView reuses a current origin URL
- **WHEN** a destroyed or replaced WebView requests a syntactically current resource URL
- **THEN** source binding rejects the request without revealing whether the scope exists

## REMOVED Requirements

### Requirement: Delivery MUST use real macOS WKWebView evidence and preserve the Runtime-free product state
**Reason**: The delivery now intentionally includes the real Child WebView Runtime.
**Migration**: Preserve real macOS origin/storage evidence while validating the shipped Child WebView path.
