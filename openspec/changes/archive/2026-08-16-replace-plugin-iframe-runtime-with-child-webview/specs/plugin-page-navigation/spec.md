## ADDED Requirements

### Requirement: External Plugin Page presentation MUST declare a Host-owned native slot
When the current descriptor resolves to an executable external Page, React MUST render Host chrome plus a non-authoritative `PluginRuntimeSlot` whose revisioned physical bounds and visibility are sent to the private presentation controller. The Page layer MUST NOT create an iframe, receive a Child WebView handle or let plugin content control title, close, layout, route identity or Host navigation.

#### Scenario: External Page is selected
- **WHEN** a current Page descriptor and Runtime facts are available
- **THEN** Host shows loading chrome and declares the slot while Rust creates the Child WebView
- **THEN** plugin content becomes visible only after current load and Session readiness

#### Scenario: Descriptor becomes unavailable
- **WHEN** current Registration removes or disables the Page
- **THEN** navigation closes the Page and terminally destroys its Child WebView before returning focus

## REMOVED Requirements

### Requirement: Plugin Page navigation delivery must not claim Runtime or lifecycle capabilities
**Reason**: The shipped Page now coordinates a real Child WebView presentation surface.
**Migration**: Keep Page identity Host-controlled while delegating native lifecycle to the Runtime controller.
