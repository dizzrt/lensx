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

### Requirement: Home must present pinned collections as read-only while management is deferred

Launcher Home MUST continue to resolve Host-owned `pinned_action_ids` and
display real, current, enabled Actions in confirmed order. Recent and Pinned
tiles MUST expose only their primary Action operation and MUST NOT display or
expose pin, unpin, more-menu, or another replacement management entry point.

The localized All label beside the Pinned heading MUST remain only a visual
placeholder and MUST NOT become a button, link, menu trigger, or focusable
element. When no pinned Actions can be resolved, the page MUST use a neutral,
localized empty state that explains that pinned Actions appear in the section
and MUST NOT claim that users can currently pin an Action from its tile.

Removing the visible entry point MUST NOT delete, migrate, reorder, or
fabricate existing pinned IDs, and it MUST NOT change the Rust/Tauri collection
read, write, capacity, or safe-error contracts.

#### Scenario: Display existing pinned Actions

- **WHEN** a persisted snapshot contains pinned Action IDs that resolve through
  the current Registry
- **THEN** the Pinned section displays the corresponding real Actions in
  confirmed order
- **THEN** each tile provides only its primary Action and provides no pin,
  unpin, or menu operation

#### Scenario: Execute an existing pinned Action

- **WHEN** the user activates the primary operation of a Pinned tile with the
  keyboard or pointer
- **THEN** the system executes that Action through the existing Dispatcher path
- **THEN** primary Action execution does not add, remove, or reorder the pinned
  collection

#### Scenario: View an empty pinned collection

- **WHEN** no current pinned Action can be resolved
- **THEN** the Pinned section displays a localized neutral empty state
- **THEN** the page exposes no pin or unpin button and does not direct the user
  to a management entry point that does not currently exist

#### Scenario: Inspect placeholders and focus order

- **WHEN** the user or assistive technology inspects Recent, Pinned, and the All
  placeholder
- **THEN** the Action-tile focus order contains only primary operations
- **THEN** the All placeholder has no button, link, menu-trigger, or keyboard-
  focus semantics

### Requirement: Home Action collections must remain accessible, localized, and theme-aware

Recent and Pinned sections, empty states, Action titles, and collection-read
feedback MUST use application i18n with `en-US` as the default and a
semantically aligned `zh-CN` resource. The primary operation of each visible
Action tile MUST work with keyboard and pointer input and MUST have a visible
focus state. Tiles MUST NOT expose a pin or unpin accessible name, focus
target, or visual-only control. In light and dark themes, tiles, selection,
hover, focus, empty states, and feedback MUST use Semi Design-supported theme
tokens and MUST NOT communicate state through color alone.

#### Scenario: Operate home Actions with the keyboard only

- **WHEN** a user navigates recent or pinned tiles with the keyboard
- **THEN** the user can focus and execute the primary Action on each tile
- **THEN** the focus order excludes pin, unpin, the avatar, and the All
  placeholder

#### Scenario: Use Simplified Chinese

- **WHEN** the application locale is `zh-CN`
- **THEN** section headings, neutral empty states, and collection feedback use
  Simplified Chinese
- **THEN** Action titles continue to use the existing `zh-CN` to `en-US`
  fallback

#### Scenario: Switch the theme

- **WHEN** the user switches between light and dark themes while the home
  surface is visible
- **THEN** both collections, their tiles, primary operations, and feedback use the
  corresponding theme tokens
- **THEN** text, focus, and interaction states remain distinguishable
