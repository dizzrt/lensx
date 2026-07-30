# Launcher Action Core Specification

## Purpose

Define the accepted launcher action descriptor, stable identity and ownership
rules, Host-owned registry and dispatcher, trust boundaries, typed execution
results, and the first real built-in launcher action.

## Requirements

### Requirement: Launcher actions must use validatable, serializable descriptors

The system MUST provide a plain-data descriptor for every launcher action. The
descriptor MUST contain at least `action_id`, `owner_id`, localized `title`,
optional localized `description`, locale-keyed `default_keywords`, and
`enabled`. A descriptor MUST be serializable and MUST NOT contain an executor,
function, React state, Tauri window, Rust internal type, or any other
non-serializable value. Before registration, the system MUST validate unknown
input and return structured diagnostics sorted by JSON Pointer path and stable
code.

#### Scenario: Accept a valid descriptor

- **WHEN** the Host registers a descriptor with valid field types, identity,
  ownership, localized text, keywords, and enabled state
- **THEN** the validation boundary returns a normalized plain-data descriptor
- **THEN** the descriptor can be serialized independently of its executor
- **THEN** the validation boundary returns no diagnostics

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

One trusted Host application service MUST own the running launcher action
registry. The registry MUST support single and batch registration, lookup by
`action_id`, and descriptor snapshots sorted in ascending `action_id` order.
Batch registration MUST be atomic. If any descriptor is invalid, duplicates an
existing action, or duplicates another action in the batch, the registry MUST
reject the entire batch. Public descriptors and snapshots MUST be isolated
from caller input and MUST NOT expose or allow mutation of internal executors.

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

### Requirement: The dispatcher must execute actions uniformly and return typed results

The system MUST use one dispatcher to resolve and execute an action by
`action_id`. On every execution, the dispatcher MUST check whether the action
exists and is enabled, and it MUST invoke the corresponding Host executor at
most once. The dispatcher MUST return a typed result containing `ok` and
`action_id`. Failure results MUST use stable codes to distinguish
`action_not_found`, `action_unavailable`, and `action_execution_failed`. When
an executor throws or rejects, the dispatcher MUST contain the internal error
and MUST NOT expose a stack, Tauri window, or Rust internal type to the caller.

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
