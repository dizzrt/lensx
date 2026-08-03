## MODIFIED Requirements

### Requirement: Plugin Action execution must remain Host-owned and use the unified Dispatcher

The system MUST synthesize a Host-owned executor for every Page-only Manifest
target that is eligible for publication. The executor MUST pass only a frozen
`{ owner_id: plugin_id, page_id: local_page_id }` target and the global opening
`action_id` to a narrow Host Page opener. A projected Action MUST execute through
the existing Registry lookup and Dispatcher, and successful, not-found,
unavailable, and execution-failure outcomes MUST preserve the existing typed
dispatch semantics. A plugin MUST NOT submit, read, or directly invoke an
executor. Production publication MUST use the current Registration revision,
MUST occur only after the target Plugin Page batch has been committed, and MUST
exclude Actions whose target Page is currently unavailable. Provider removal or
invalidation MUST unregister the provider's Action batch before unregistering
its Page batch.

#### Scenario: The Dispatcher executes a projected Action

- **WHEN** the Dispatcher receives the global `action_id` of a currently
  registered Plugin Action
- **THEN** the Dispatcher invokes the Host-synthesized executor at most once
- **THEN** the Page opener receives the correct plugin owner, plugin-local Page
  ID, and opening Action ID

#### Scenario: The Page opener rejects a target

- **WHEN** the injected Host Page opener throws or rejects because a target is
  unavailable
- **THEN** the existing Dispatcher returns `action_execution_failed`
- **THEN** the result exposes no Page route, exception stack, Tauri object, or
  Rust internal value

#### Scenario: Production publishes an Action after its Page

- **WHEN** production reconciles a current, eligible Plugin Registration detail
  whose Action targets an available Plugin Page
- **THEN** the Plugin Page batch is committed before the Plugin Action enters
  the Launcher Registry
- **THEN** the default production composition starts Plugin Action publication
  without adding a plugin-specific search or Dispatcher branch

#### Scenario: An Action targets an unavailable Page

- **WHEN** a Page is unknown, missing a required Host grant, or otherwise
  unavailable in the current Page batch
- **THEN** an Action targeting that Page is excluded from the provider's
  published Action batch
- **THEN** users do not see an Action that is already known to fail Page
  preflight

#### Scenario: Production removes a provider surface

- **WHEN** a current Registration snapshot removes or invalidates a previously
  published plugin provider
- **THEN** production unregisters the provider's complete Action batch before
  unregistering its Page batch
- **THEN** other plugins and `lensx.core` Actions remain available
