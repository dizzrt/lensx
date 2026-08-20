## REMOVED Requirements

### Requirement: macOS accessory and full-screen behavior MUST have target product evidence

**Reason**: This requirement specifically mandates packaged `.app`, Launch Services, Dock, Space, fullscreen accessory-window, and real focus-interaction evidence. All of that macOS product-environment validation is retired by this change.

**Migration**: Retain product requirements for accessory policy, Dock tile behavior, cross-Space behavior, fullscreen recovery, shortcuts, focus, and Child WebView coordination. Continue deterministic Rust state, configuration, bundle-policy, error, and race tests, while removing the packaged-app harness, evidence producer and records, and focused macOS Gate without a manual compatibility entry point.
