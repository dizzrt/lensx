# Launcher Action Core Specification

## Purpose

Define the accepted launcher action descriptor, stable identity and ownership
rules, Host-owned registry and dispatcher, trust boundaries, typed execution
results, and built-in launcher actions.

## Requirements

### Requirement: Launcher actions must use validatable, serializable descriptors

Launcher Actions MUST use validated serializable plain-data descriptors with localized metadata and optional safe Host icons. Executors and internal objects MUST remain private, with deterministic structured validation diagnostics.

#### Scenario: Accept a valid descriptor

- **WHEN** the Host registers a descriptor with valid field types, identity,
  ownership, localized text, keywords, enabled state, and an optional valid
  Host icon token
- **THEN** the validation boundary returns a normalized plain-data descriptor
- **THEN** the descriptor can be serialized independently of its executor
- **THEN** the Registry snapshot preserves optional icon metadata but contains
  no executor
- **THEN** the validation boundary returns no diagnostics

#### Scenario: Accept a descriptor without an icon

- **WHEN** a valid descriptor omits the optional icon
- **THEN** the system accepts the descriptor
- **THEN** the presentation layer uses the stable generic Action fallback icon
- **THEN** the Action title remains its accessible name

#### Scenario: Reject invalid icon metadata

- **WHEN** descriptor icon metadata contains an unknown kind, invalid token,
  ReactNode, function, arbitrary URL, unvalidated path, or unknown field
- **THEN** the system rejects the descriptor
- **THEN** the system returns a diagnostic with a stable code and corresponding
  JSON Pointer path
- **THEN** the Registry does not store the input

#### Scenario: Reject unknown or non-serializable fields

- **WHEN** a descriptor contains an unknown field, function, class instance, or
  another value not declared by the contract
- **THEN** the system rejects the descriptor
- **THEN** the system returns a diagnostic with a stable code and corresponding
  JSON Pointer path
- **THEN** the registry does not store the input

#### Scenario: Keep multiple descriptor errors in deterministic order

- **WHEN** one descriptor contains multiple errors that can be aggregated
  safely
- **THEN** the system returns every safely aggregatable structured diagnostic
- **THEN** the diagnostics use deterministic path and code ordering
- **THEN** callers do not need to inspect diagnostic messages to determine
  error types

#### Scenario: Validate Action display metadata and optional icon
- **WHEN** unknown input is supplied as a Launcher Action descriptor
- **THEN** The system MUST provide a plain-data descriptor for every Launcher Action. The
  descriptor MUST contain at least `action_id`, `owner_id`, localized `title`,
  optional localized `description`, locale-keyed `default_keywords`, and
  `enabled`, and MAY contain an optional Host-owned display `icon`. When present,
  the icon MUST be serializable plain data made of a fixed `kind` and a validated,
  stable token. It MUST NOT be a ReactNode, function, arbitrary URL, unvalidated
  file path, or Provider-private object.

#### Scenario: Publish a descriptor without exposing execution internals
- **WHEN** the registry validates, clones, looks up, or snapshots Action metadata
- **THEN** A descriptor MUST be serializable and MUST NOT contain an executor, function,
  React state, Tauri window, Rust internal type, or any other non-serializable
  value. Before registration, the system MUST validate unknown input and return
  structured diagnostics sorted by JSON Pointer path and stable code. Registry
  lookup, cloning, and snapshots MUST preserve valid icon metadata while
  continuing to isolate the executor.

### Requirement: Action IDs must express stable owner relationships

An `owner_id` MUST contain at least two dot-separated namespace segments. An
`action_id` MUST equal its complete `owner_id`, one dot, and one local action
segment. Every segment MUST begin with an ASCII lowercase letter and MUST
contain only ASCII lowercase letters, digits, underscores, or hyphens. A
segment MUST NOT exceed 64 characters, and a complete ID MUST NOT exceed 255
characters. A published action ID MUST NOT be reused for an action with
different semantics.

#### Scenario: Accept a built-in Host action ID

- **WHEN** the owner is `lensx.core` and the action ID is
  `lensx.core.hide_launcher`
- **THEN** the system accepts the owner and action ID relationship

#### Scenario: Reject an action ID that does not belong to its owner

- **WHEN** a descriptor's `action_id` does not begin with the complete
  `owner_id` followed by one dot
- **THEN** the system rejects the descriptor
- **THEN** the diagnostic identifies the inconsistent owner and action ID

#### Scenario: Reject an invalid namespaced ID

- **WHEN** an owner or action ID contains an empty segment, uppercase starting
  character, invalid character, overlong segment, or overlong complete ID
- **THEN** the system rejects the descriptor
- **THEN** the diagnostic points to the corresponding ID field

### Requirement: Action metadata must support application locales and English fallback

An action `title` MUST contain a non-empty `en-US` value after trimming. When a
`description` is present, it MUST also contain a non-empty English value. A
`zh-CN` value MAY be absent; when text for the current locale is absent, the
system MUST fall back to `en-US`. Every default keyword MUST be non-empty after
trimming and MUST be unique within its locale after locale-aware lowercasing.
User-visible titles and descriptions for Host built-in actions MUST come from
application message resources.

#### Scenario: Resolve action metadata for the current locale

- **WHEN** an action provides both `en-US` and current-locale text for a title
  or description
- **THEN** the system returns the current-locale text

#### Scenario: Current-locale text is absent

- **WHEN** an action does not provide current-locale text for a title or
  description
- **THEN** the system returns the corresponding `en-US` text

#### Scenario: English title is absent or empty

- **WHEN** a descriptor omits `title.en-US` or that value is empty after
  trimming
- **THEN** the system rejects the descriptor
- **THEN** the diagnostic points to the English title

#### Scenario: A keyword is empty or duplicated

- **WHEN** a locale keyword is empty after trimming or two locale keywords are
  equal after locale-aware lowercasing
- **THEN** the system rejects the descriptor
- **THEN** the diagnostic points to the corresponding keyword

### Requirement: The Host registry must register atomically and provide deterministic immutable snapshots

One trusted Host registry MUST provide atomic Action registration and owner replacement with deterministic immutable snapshots. Invalid batches MUST preserve the old state and public descriptors MUST not expose executors or bookkeeping.

#### Scenario: Register a valid action batch

- **WHEN** the Host registers a batch of valid actions with unique IDs
- **THEN** the registry stores every action atomically
- **THEN** ID lookup returns the corresponding descriptor
- **THEN** the snapshot is sorted in ascending `action_id` order

#### Scenario: A batch contains an invalid action

- **WHEN** a registration batch contains at least one invalid descriptor
- **THEN** the registry rejects the entire batch
- **THEN** the registry stores none of the actions from that batch

#### Scenario: Register a duplicate action ID

- **WHEN** a new action ID duplicates an existing action or another action in
  the same batch
- **THEN** the registry rejects the registration or entire batch
- **THEN** the registry remains in its pre-registration state
- **THEN** the diagnostic identifies the duplicate `action_id`

#### Scenario: A caller attempts to modify a descriptor

- **WHEN** a caller modifies original input, a lookup result, or a snapshot
  after registration
- **THEN** the registry's internal descriptor remains unchanged
- **THEN** later lookups and snapshots expose neither executors nor mutable
  internal references

#### Scenario: Look up an unknown action

- **WHEN** a caller looks up an unregistered `action_id`
- **THEN** the registry returns no value
- **THEN** the registry state remains unchanged

#### Scenario: Replace one provider's complete Action batch

- **WHEN** a trusted provider submits a valid complete batch whose descriptors
  all belong to that provider owner
- **THEN** the Registry atomically removes that provider's previous Actions and
  commits the new batch
- **THEN** no snapshot exposes a partial mixture of the provider's old and new
  batches
- **THEN** Actions owned by other providers remain unchanged

#### Scenario: Provider replacement contains invalid or cross-owner input

- **WHEN** a provider replacement contains an invalid descriptor, duplicate ID,
  ID owned by another provider, or descriptor whose `owner_id` differs from the
  declared provider owner
- **THEN** the Registry rejects the entire replacement with deterministic
  diagnostics
- **THEN** the complete pre-call Registry state remains unchanged

#### Scenario: Unregister one provider

- **WHEN** a trusted provider replaces its complete batch with an empty batch
- **THEN** the Registry removes every Action owned by that provider
- **THEN** the Registry preserves every Action and executor owned by another
  provider

#### Scenario: Atomically register replace or remove an owner Action batch
- **WHEN** the trusted Action registry is initialized, mutated, looked up, or read as a snapshot
- **THEN** One trusted Host application service MUST own the running launcher action
  registry. The registry MUST support single and batch registration, lookup by
  `action_id`, descriptor snapshots sorted in ascending `action_id` order, and
  trusted provider-scoped replacement or unregistration of one owner's complete
  Action batch. Batch registration and provider replacement MUST be atomic. If
  any descriptor is invalid, duplicates an existing Action owned by another
  provider, duplicates another Action in the batch, or does not belong to the
  declared provider owner, the registry MUST reject the entire batch. A failed
  provider replacement MUST preserve the complete pre-call Registry state. A
  successful provider replacement MUST remove the provider's previous batch and
  commit the new complete batch in one transition; an empty provider batch MUST
  unregister only that provider's Actions. Public descriptors and snapshots MUST
  be isolated from caller input and MUST NOT expose or allow mutation of internal
  executors or provider bookkeeping.

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

### Requirement: Descriptors and executors must preserve the Host trust boundary

A public registry snapshot MUST contain descriptor metadata only. Executors
MUST exist only inside the trusted Host registry. React components and future
provider inputs MUST NOT register or receive executable functions. An executor
that needs privileged behavior MUST call Rust through an explicit typed desktop
adapter, and Rust MUST constrain the allowed native operation again at the
command boundary.

#### Scenario: Consume a registry snapshot

- **WHEN** a UI, search service, or provider adapter reads a registry snapshot
- **THEN** the snapshot contains serializable descriptors only
- **THEN** the consumer cannot obtain or replace an executor through the
  snapshot

#### Scenario: Execute a privileged action

- **WHEN** a Host executor needs a native window capability
- **THEN** the executor calls an explicitly allowed Rust command through a
  typed desktop adapter
- **THEN** the executor does not access a Tauri window or Rust internal object
  directly

#### Scenario: Registering an action does not change the current interface

- **WHEN** the default action service registers built-in actions
- **THEN** the current minimal App Shell does not automatically display an
  action or result list
- **THEN** action presentation remains deferred to a separate search
  capability

### Requirement: The default registry must contain the real hide-launcher action

The default action service MUST register the enabled
`lensx.core.hide_launcher` action with owner `lensx.core`. Its English and
Simplified Chinese title and description MUST come from application message
resources. When the dispatcher executes this action, it MUST call the Rust
`hide_launcher` command through a typed desktop adapter. The Rust command MUST
reuse the existing unified launcher window `hide` action and MUST NOT duplicate
the native window hide operation directly.

#### Scenario: Create the default action service

- **WHEN** the Host creates the default launcher action service
- **THEN** the registry contains `lensx.core.hide_launcher`
- **THEN** the descriptor is enabled and passes all identity, ownership,
  localization, and keyword validation

#### Scenario: Execute the hide-launcher action

- **WHEN** the dispatcher executes `lensx.core.hide_launcher`
- **THEN** the corresponding executor calls the typed desktop adapter
- **THEN** the Rust command executes `hide` through the existing unified
  launcher window action boundary
- **THEN** the dispatcher returns a typed success result when execution
  succeeds

#### Scenario: Rust fails to hide the launcher window

- **WHEN** Rust cannot resolve the main window or execute the unified `hide`
  action
- **THEN** the Rust command returns a serializable error containing a stable
  code, action, operation, and message
- **THEN** the TypeScript adapter maps the failure to an executor failure
- **THEN** the dispatcher returns `action_execution_failed`

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

### Requirement: Action titles MUST express user-facing entry names

An Action's `title` MUST be its primary user-facing name for recognition and
selection, without requiring a verb phrase. Maintained Page or tool entries
MUST use distinguishable destination names and omit generic `Open` / `打开`
prefixes that merely repeat entry behavior. Entries that perform operations
MUST retain the verbs needed to express those operations. Copy changes MUST
preserve stable Action identity and execution semantics.

#### Scenario: A maintained entry opens a destination

- **WHEN** a maintained Action only opens a tool or Page
- **THEN** its title uses a name by which users can recognize that destination
- **THEN** it does not add a generic `Open` / `打开` prefix merely because the
  entry is executable

#### Scenario: A maintained Action performs an operation

- **WHEN** a user chooses the Action that hides the launcher window
- **THEN** its title remains `Hide launcher` / `隐藏启动器`
- **THEN** naming rules neither remove the necessary operation verb nor change
  its execution behavior

#### Scenario: A renamed entry already appears in collections

- **WHEN** Recent or Pinned contains the stable ID of an Action whose title has
  changed
- **THEN** the record resolves to the same Action and displays its new title
  for the current locale
- **THEN** search, collection, and keyboard activation execute the same
  operation; the title remains the entry's accessible name, with existing
  theme and focus semantics

### Requirement: Entry title simplification MUST NOT introduce legacy search aliases

When maintained entry titles are simplified, the system and authoring tools
MUST NOT add replaced full titles or compatibility `Open` / `打开` prefixes to
`default_keywords`, hidden aliases, or extra search sources. The settings,
ConfigLens, and template title changes MUST preserve existing functional
keywords. Matching and scoring MUST continue to use only declared current
titles and keywords, without guaranteeing matches for old full titles.

#### Scenario: Search uses the simplified metadata

- **WHEN** a user searches for a renamed entry by its new title or existing
  functional keywords
- **THEN** the system matches its current title and keywords under the existing
  cross-language rules
- **THEN** scores can change naturally with the new title, while description
  participates in neither matching nor scoring

#### Scenario: An old full title has no remaining searchable match

- **WHEN** a controlled snapshot contains only the renamed target Action and
  at least one token of its old full title matches neither a current title nor
  an existing keyword
- **THEN** the old full title does not return that Action
- **THEN** the system does not restore the match through a legacy title alias,
  an automatically added prefix, or description

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
