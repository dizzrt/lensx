# Spec Delta

## MODIFIED Requirements

### Requirement: The dispatcher must execute actions uniformly and return typed results

The unified Dispatcher MUST execute each Action using its current registration and enabled state, pass the immutable invocation context to the Host executor, execute at most once, and preserve safe typed success and failure results.

#### Scenario: Execute an available action

- **WHEN** the dispatcher receives the ID of a registered, enabled action
- **THEN** the dispatcher invokes that action's Host executor once
- **THEN** the dispatcher returns `ok = true` and the corresponding `action_id`

#### Scenario: Execute an unknown action

- **WHEN** the dispatcher receives an unregistered action ID
- **THEN** the dispatcher invokes no executor
- **THEN** the dispatcher returns `ok = false` and `action_not_found`

#### Scenario: Execute an unavailable action

- **WHEN** the dispatcher receives the ID of a registered action with
  `enabled = false`
- **THEN** the dispatcher does not invoke that action's executor
- **THEN** the dispatcher returns `ok = false` and `action_unavailable`

#### Scenario: Executor execution fails

- **WHEN** an action executor throws, rejects, or returns an invalid result
- **THEN** the dispatcher returns `ok = false` and
  `action_execution_failed`
- **THEN** the public result contains no internal exception stack or privileged
  object

#### Scenario: Dispatch an Action ID and contain executor failures
- **WHEN** a caller executes a Launcher Action through the shared dispatcher
- **THEN** The system MUST use one dispatcher to resolve and execute an action by
  `action_id`. On every execution, the dispatcher MUST check whether the action
  exists and is enabled, and it MUST invoke the corresponding Host executor at
  most once. The dispatcher MUST return a typed result containing `ok` and
  `action_id`. Failure results MUST use stable codes to distinguish
  `action_not_found`, `action_unavailable`, and `action_execution_failed`. When
  an executor throws or rejects, the dispatcher MUST contain the internal error
  and MUST NOT expose a stack, Tauri window, or Rust internal type to the caller.

#### Scenario: Independent invocations of the same Action
- **WHEN** a user executes the same Action again through a normal entry or dedicated shortcut
- **THEN** every admitted invocation has an independent invocationId and explicit normal or shortcut source
- **THEN** repeated delivery of the same invocation identifier does not execute again, and independent calls are not discarded merely because they share an Action ID
- **THEN** recent use is recorded once per successful invocation, and plugin business callback results do not reinterpret successful Action navigation

### Requirement: The default registry must contain the Host settings Action

The default service MUST register localized lensX Settings as an enabled Host Action. Its private executor MUST use framework-neutral navigation and accept Host invocation context; ordinary React result components continue to select only an Action ID and do not supply trusted provenance.

#### Scenario: Create the default Action service

- **WHEN** the Host creates the default launcher Action service
- **THEN** the registry contains `lensx.core.open_settings`
- **THEN** the descriptor is enabled and passes identity, ownership,
  localization, keyword, and serialization validation
- **THEN** the descriptor does not expose a page target or executor, and its
  English and Simplified Chinese titles are `Settings` and `设置`

#### Scenario: Find the settings Action

- **WHEN** a query in a supported locale matches the settings Action title or
  keywords in any declared language
- **THEN** Action Search returns the real `lensx.core.open_settings` descriptor
- **THEN** the result uses application messages for the current interface
  locale, and description is not a search source

#### Scenario: Execute the settings Action

- **WHEN** the Dispatcher executes `lensx.core.open_settings`
- **THEN** the trusted Host executor requests that the application navigation
  service open owner `lensx.core`, page `settings`
- **THEN** the request records `lensx.core.open_settings` as the Action that
  opened the page
- **THEN** the React component does not directly receive or call the executor
- **THEN** the Dispatcher returns its existing typed success result when page
  preflight and opening succeed
- **THEN** the Page Action context displays `Settings` or `设置` for the current
  locale

#### Scenario: The settings page cannot open

- **WHEN** the application navigation service rejects the request because the
  settings page is missing or unavailable or no active App Shell handler exists
- **THEN** the executor reports an execution failure
- **THEN** the Dispatcher returns `action_execution_failed`
- **THEN** the public Action and Dispatcher contracts remain unchanged

#### Scenario: Register the localized Host Settings Action
- **WHEN** the default Action service initializes
- **THEN** The default Action service MUST register the enabled
  `lensx.core.open_settings` Action with owner `lensx.core`. Its English and
  Simplified Chinese title, description, and search keywords MUST come from
  application message resources. Its titles MUST be `Settings` and `设置`,
  respectively. The public descriptor MUST continue to contain
  only serializable metadata and MUST NOT contain a page target or executable
  function.

#### Scenario: Navigate from the Settings executor without exposing a page target
- **WHEN** the Settings Action is presented for execution or dispatched to its private Host executor
- **THEN** the private Host executor MUST use `LauncherActionExecutor = (invocation: LauncherActionInvocation) => Promise<void> | void`, request `lensx.core/settings` through framework-neutral navigation, and pass this Host-created invocation context
- **THEN** ordinary React result components continue to submit only an Action ID; only the trusted native entry establishes shortcut provenance, which never enters the public descriptor

## ADDED Requirements

### Requirement: Action invocation provenance MUST be per-call and Host-owned

Every admitted Action invocation MUST contain a Host-created immutable invocationId and `normal | shortcut` source. UI, plugins, and Manifests MUST NOT claim shortcut provenance. Window activation reasons MUST remain separate from Action invocation sources; unified admission MUST cover UI, native shortcuts, and plugin actions.open.

#### Scenario: Ordinary selection and plugin navigation
- **WHEN** a user clicks, presses search Enter, selects Recent/Pinned, or a plugin calls actions.open
- **THEN** the source is normal and does not inherit the preceding shortcut or window activation source
- **THEN** the public plugin request still carries only the permitted local Action ID and rejects additional source fields

#### Scenario: Enter through a trusted dedicated shortcut
- **WHEN** a current native binding submits its target to the Host invocation entry
- **THEN** the source is shortcut, and execution still rechecks the Registry, Page, and binding generation
- **THEN** provenance exposes no physical binding, native object, other application input, or binding configuration

#### Scenario: Queue concurrent invocations during initialization
- **WHEN** a new independent invocation arrives before the Host is ready or while the same Page Runtime is being created
- **THEN** admitted invocations enter an ordered bounded queue containing at most 32 waiting calls, and the same Page creates only one Runtime
- **THEN** a full queue or a 10-second wait timeout produces admission-layer failure feedback, and invalidated calls do not migrate to another Page attempt
- **THEN** one physical long press or duplicate delivery creates no additional invocation, while an independent press after release creates a new invocation
