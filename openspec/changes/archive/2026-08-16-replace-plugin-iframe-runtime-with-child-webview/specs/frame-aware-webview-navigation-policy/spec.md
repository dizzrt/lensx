## ADDED Requirements

### Requirement: Trusted Host navigation policy MUST contain no plugin document exception
The Host main WebView policy MUST classify and protect its own top-level and descendant navigations, but MUST NOT issue or honor a descendant plugin target lease. Plugin documents MUST be loaded only as the top-level document of the current Child WebView under `plugin-child-webview-runtime`; Tauri initialization MUST remain limited to the trusted Host main frame.

#### Scenario: Host descendant requests a plugin document
- **WHEN** any Host main-WebView descendant attempts to navigate to a plugin resource origin
- **THEN** the navigation is rejected before commit without consulting a current plugin lease
- **THEN** no iframe compatibility path or Tauri initialization is created

#### Scenario: Current Child WebView starts
- **WHEN** the Runtime controller creates a current Child WebView
- **THEN** its top-level policy is installed by the Child WebView Runtime rather than the Host descendant-frame policy

## REMOVED Requirements

### Requirement: Active plugin target MUST be exact, Host-private, and lifecycle-bound
**Reason**: The policy no longer authorizes a plugin document inside the Host FrameTree.
**Migration**: Bind exact target facts to the current Child WebView registry and top-level navigation hook.

### Requirement: Descendant navigation MUST match one canonical document target exactly
**Reason**: Plugin navigation is no longer a descendant-frame operation.
**Migration**: Validate the exact current package document as the Child WebView top-level target.

### Requirement: The prerequisite MUST leave plugin Runtime and product presentation unchanged
**Reason**: This change intentionally replaces the Runtime container and presentation integration.
**Migration**: Use the complete Child WebView validation and migration tasks.
