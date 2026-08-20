## MODIFIED Requirements

### Requirement: Plugin management MUST remain Host-private and have a focused delivery gate

Plugin-management composition, installation, replacement, lifecycle, data and development mutations, and interaction state MUST remain root-private, typed, and revision-bound. Public packages, plugin documents, and plugin messages MUST NOT invoke trusted management operations or open a Host modal. Focused deterministic validation MUST prove that permission services and UI no longer exist while verifying the remaining list and detail views, operations, bilingual behavior, themes, keyboard and focus behavior, StrictMode lifecycle, and boundaries without screenshots, computed-style capture, browser rendering, or native evidence.

Management contracts, adapters, services, view models, installation preparations, and lifecycle, replacement, and data command clients MUST NOT be exported through `@lensx/plugin-contract`, `@lensx/plugin-sdk`, `@lensx/plugin-ui`, `@lensx/plugin-testkit`, an official or example plugin, or the Runtime document boundary.

#### Scenario: Plugin attempts to open management authority

- **WHEN** a plugin import, Runtime message, remote code, or SDK request attempts installation, replacement, lifecycle, data, or a legacy grant mutation
- **THEN** the public, workspace, or transport boundary rejects the path
- **THEN** an open Web Runtime does not constitute trusted Host management authority

#### Scenario: Focused management validation runs

- **WHEN** deterministic management tests run healthy, empty, loading, degraded, legacy-incompatible, and mutation scenarios
- **THEN** the remaining capabilities pass with no reachable permission UI, service, copy, or command
- **THEN** English and Chinese, light and dark semantic theme state, keyboard, and focus assertions remain complete

#### Scenario: Focused validation does not replace final validation

- **WHEN** management fixtures, Rust and TypeScript tests, service/component tests, boundary checks, and bilingual theme/keyboard states pass
- **THEN** complete frontend and Rust final validation is still required before delivery is complete
- **THEN** no screenshot, pixel, browser, computed-style capture, or native evidence path is retained
