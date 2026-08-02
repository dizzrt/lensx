# Launcher Action Collections Specification

## Purpose

Define the Host-owned recent and pinned Launcher Action collections, including
their identity-only persistence, Registry resolution, update semantics, and
accessible home-surface interactions.

## Requirements

### Requirement: Launcher Action collections must use bounded ordered Action identities

The system MUST provide Host-owned `recent_action_ids` and
`pinned_action_ids` collections. Each collection MUST contain only unique,
valid, ordered `action_id` values and MUST store at most eight items. Recent
Actions MUST be ordered from newest to oldest successful use, and pinned
Actions MUST preserve the order in which the user pinned them. Collections
MUST NOT store executors, React state, Registry internals, Action titles,
icons, or other derived display data.

The App Shell MUST resolve collection IDs against the current Action Registry
snapshot, display only real Actions that remain registered and enabled, and
preserve collection order. Missing, disabled, or unresolved IDs MUST NOT be
displayed and MUST NOT be replaced with Actions from Registry default order,
simulated Actions, or recommendations.

#### Scenario: Read a valid collection snapshot

- **WHEN** a persisted snapshot contains unique and valid recent and pinned
  Action IDs
- **THEN** the system returns both read-only collections in persisted order
- **THEN** each collection contains at most eight items
- **THEN** the snapshot contains no executor or derived display data

#### Scenario: A collection contains a temporarily unavailable Action

- **WHEN** a collection Action ID is missing from the current Registry snapshot
  or its Action is disabled
- **THEN** the App Shell does not display that Action tile
- **THEN** the App Shell does not fill that position with another Action
- **THEN** the persisted collection retains the ID so a temporarily unavailable
  Action can recover later

#### Scenario: Both collections are empty

- **WHEN** the recent and pinned collections contain no IDs
- **THEN** the App Shell displays localized Recent and Pinned sections with
  their respective empty states
- **THEN** the App Shell does not display fabricated Actions, recommendations,
  or Registry default order

### Requirement: Launcher Action collections must persist through a typed Rust boundary

Rust MUST own a serializable, versioned Launcher Action collections snapshot
and MUST provide typed Tauri commands to read it, record successful use, and
set pinned state. A missing file MUST return empty collections. Reads and
mutations MUST validate fields, version, Action IDs, uniqueness, order, and the
eight-item limit. Persistence MUST use an atomic write process that cannot
leave a partial file. Errors MUST return a stable code, operation, and safe
message and MUST NOT expose file contents, absolute paths, or internal errors.

#### Scenario: The collections file is absent on first launch

- **WHEN** Rust cannot find the Launcher Action collections file
- **THEN** the read command returns empty recent and pinned collections
- **THEN** the App Shell can continue into the home state

#### Scenario: Read an invalid collections file

- **WHEN** the collections file is malformed, has an unsupported version,
  contains duplicate or invalid IDs, or exceeds the item limit
- **THEN** Rust returns a serializable, stable read error
- **THEN** the frontend continues with safe empty collections and displays
  localized failure feedback
- **THEN** the error contains no file contents, absolute path, or internal error

#### Scenario: An atomic write succeeds

- **WHEN** Rust receives a valid request to record use or set pinned state
- **THEN** Rust atomically persists the complete updated snapshot
- **THEN** the command returns the complete confirmed snapshot
- **THEN** a later read returns the same order and content

#### Scenario: A collection write fails

- **WHEN** Rust cannot validate or atomically persist the updated collection
- **THEN** Rust returns a stable and safe write error
- **THEN** the last confirmed persisted snapshot is not partially overwritten
- **THEN** the frontend continues to allow Action search and execution

### Requirement: Successful Action execution must update recent use without changing dispatch semantics

The App Shell MUST request that an `action_id` be recorded only after the Host
Dispatcher returns success. When recorded, an existing ID MUST move to the
front, a new ID MUST be inserted at the front, and the oldest item MUST be
removed when the collection would exceed eight items. Unknown, disabled,
failed, or throwing Actions MUST NOT enter recent use. Failure to persist a
recent-use update MUST NOT change an already successful Dispatcher result into
an Action execution failure.

#### Scenario: Execute an Action successfully for the first time

- **WHEN** the Dispatcher successfully executes an Action not yet in the recent
  collection
- **THEN** the system inserts that Action ID at the front
- **THEN** the recent collection remains unique and contains at most eight items

#### Scenario: Execute a recent Action successfully again

- **WHEN** the Dispatcher successfully executes an Action already in the recent
  collection
- **THEN** the system moves that Action ID to the front
- **THEN** the collection contains no duplicate ID

#### Scenario: Action execution fails

- **WHEN** the Dispatcher returns `action_not_found`, `action_unavailable`, or
  `action_execution_failed`
- **THEN** the recent collection remains unchanged

#### Scenario: The Action succeeds but recent-use persistence fails

- **WHEN** the Dispatcher has returned success but Rust cannot persist the
  recent-use update
- **THEN** the App Shell preserves the successful Action result
- **THEN** the App Shell reports the collection synchronization failure through
  localized, safe feedback
- **THEN** the user can continue to search for and execute Actions

### Requirement: Users must be able to pin and unpin visible home Actions

A recent Action tile MUST provide an accessible pin operation separate from
the primary Action activation. A pinned Action tile MUST provide an accessible
unpin operation separate from the primary Action activation. Pinning an
unpinned ID MUST append it to the pinned collection. Unpinning MUST remove the
ID while preserving the order of remaining items. When the pinned collection
already contains eight items, the system MUST reject another pin and provide
localized feedback instead of silently removing an existing item.

The localized All label MUST be only a visual placeholder beside the Pinned
section heading. It MUST NOT be a button, link, menu trigger, or focusable
element and MUST NOT display a chevron, hover behavior, pointer cursor, or
accessible action name.

#### Scenario: Pin an Action from recent use

- **WHEN** the user activates a recent tile's pin icon button while the pinned
  collection contains fewer than eight items
- **THEN** the system appends that Action ID to the pinned collection
- **THEN** the primary Action is not executed
- **THEN** the Pinned section displays that real Action

#### Scenario: Unpin an Action

- **WHEN** the user activates a pinned tile's unpin icon button
- **THEN** the system removes that Action ID from the pinned collection
- **THEN** the relative order of the remaining pinned IDs is preserved
- **THEN** the primary Action is not executed

#### Scenario: The pinned collection is full

- **WHEN** the pinned collection contains eight items and the user attempts to
  pin another Action
- **THEN** the system rejects the new pin
- **THEN** the existing eight items remain unchanged
- **THEN** the App Shell displays localized and recoverable capacity feedback

#### Scenario: Inspect the All placeholder

- **WHEN** a user or assistive technology inspects the Pinned section heading
- **THEN** the visual interface displays a localized All label beside the
  heading
- **THEN** the page has no button, link, or menu trigger named All
- **THEN** the placeholder is absent from the keyboard focus order

### Requirement: Home Action collections must remain accessible, localized, and theme-aware

Recent and Pinned sections, empty states, Action titles, pin and unpin
accessible names, capacity feedback, and persistence feedback MUST use
application i18n with `en-US` as the default and a semantically aligned
`zh-CN` resource. The primary operation and pin operation for each Action tile
MUST each work with keyboard and pointer input and MUST have visible focus
states. In light and dark themes, tiles, selection, hover, focus, empty states,
and feedback MUST use Semi Design-supported theme tokens and MUST NOT
communicate state through color alone.

#### Scenario: Operate home Actions with the keyboard only

- **WHEN** a user navigates recent or pinned tiles with the keyboard
- **THEN** the user can separately focus and execute the primary Action and its
  pin or unpin operation
- **THEN** the focus order excludes the avatar and All placeholder

#### Scenario: Use Simplified Chinese

- **WHEN** the application locale is `zh-CN`
- **THEN** section headings, empty states, pin operations, and collection
  feedback use Simplified Chinese
- **THEN** Action titles continue to use the existing `zh-CN` to `en-US`
  fallback

#### Scenario: Switch the theme

- **WHEN** the user switches between light and dark themes while the home
  surface is visible
- **THEN** both collections, their tiles, operations, and feedback use the
  corresponding theme tokens
- **THEN** text, focus, and interaction states remain distinguishable
