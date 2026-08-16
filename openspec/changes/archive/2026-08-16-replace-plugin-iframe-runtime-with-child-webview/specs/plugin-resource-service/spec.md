## ADDED Requirements

### Requirement: Resource authority MUST match the current Child WebView source
Entry resolution MUST produce only Host-private facts needed to create the current Child WebView. Every custom-protocol request and verified byte-cache hit MUST match its scope, resource generation, Runtime attempt and actual current Child WebView binding. Destroy, replacement, reload, disable, uninstall and retirement MUST revoke the binding before payload cleanup; Host or old WebViews MUST fail closed even if they know a well-formed URL.

#### Scenario: Current WebView requests a package file
- **WHEN** the current bound Child WebView requests a safe regular file in its exact generation
- **THEN** the service returns fixed MIME and security headers under the existing bounded rules
- **THEN** the response confers no authority on any other WebView

#### Scenario: Generation is replaced during a cached request
- **WHEN** a replacement commits before a previous-generation request or cache lookup completes
- **THEN** compare-current validation rejects the late result and no bytes reach the replacement WebView

## REMOVED Requirements

### Requirement: Task 4.1 MUST leave subsequent Runtime and UI capabilities unimplemented
**Reason**: This breaking migration updates resource delivery together with the already-shipped Runtime and UI.
**Migration**: Validate resource behavior through the complete Child WebView lifecycle matrix.
