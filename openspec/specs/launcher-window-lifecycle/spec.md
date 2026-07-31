# Launcher Window Lifecycle Specification

## Purpose

Define the accepted native launcher window shape, centralized Rust lifecycle
actions, global shortcut behavior, recoverable hide semantics, and input focus
restoration across repeated launcher activations.

## Requirements

### Requirement: The launcher main window must use a compact native window shape

The system MUST configure the main window labeled `main` as a launcher window
with a fixed width of 650px, an initial height of 240px, a minimum height of
180px, and a maximum height of 800px. The window MUST be undecorated,
non-resizable, non-fullscreen, transparent, and always on top.

Through a Rust-validated typed boundary, the Host MUST use fixed discrete
heights of 240px, 480px, and 600px for the App Shell's `home`, `search`, and
`page` presentation states, respectively. The system MUST NOT accept arbitrary
dimensions supplied by the frontend and MUST NOT change the native window
height based on DOM measurements or search-result counts.

#### Scenario: Start the desktop application

- **WHEN** lensX creates the main window and enters the `home` presentation
  state
- **THEN** the main window appears at a width of 650px and an initial height of
  240px
- **THEN** the home shared content region is visible in the window
- **THEN** the main window is undecorated and remains always on top
- **THEN** the user cannot manually resize the main window or enter fullscreen

#### Scenario: Search Actions

- **WHEN** the App Shell moves from the `home` to the `search` presentation
  state
- **THEN** the Host requests a fixed main-window height of 480px
- **THEN** search results scroll inside a bounded region within the window
- **THEN** the window height does not change with the number of results

#### Scenario: Open a Host page

- **WHEN** the App Shell enters the `page` presentation state
- **THEN** the Host requests a fixed main-window height of 600px
- **THEN** the page-context header and shared page content region are visible
  together

#### Scenario: Close a Host page

- **WHEN** the App Shell closes the active page and returns to `home`
- **THEN** the Host requests restoration of the fixed 240px main-window height
- **THEN** the launcher input and shared home content region remain visible

#### Scenario: Submit an unsupported presentation mode

- **WHEN** the Tauri boundary receives a mode other than `home`, `search`, or
  `page`
- **THEN** Rust rejects the request
- **THEN** the frontend cannot use this boundary to submit arbitrary window
  dimensions

#### Scenario: Native height transition fails

- **WHEN** Rust cannot resolve the main window or set the fixed height for the
  requested mode
- **THEN** the command returns a serializable error containing a stable code,
  mode, operation, and safe message
- **THEN** the current App Shell state is not cleared

### Requirement: Rust must execute launcher window actions through one boundary

The system MUST provide a unified launcher main-window action boundary in Rust
that supports at least `show`, `hide`, and `toggle`. Every global-shortcut and
window-lifecycle entry point MUST execute actions through this boundary and
MUST NOT duplicate native window operations in its own handler. A failed window
action MUST return a diagnosable error that identifies both the action and the
failed operation stage.

#### Scenario: Show a hidden launcher

- **WHEN** the system executes `show` for an invisible main window
- **THEN** the system restores the window if it is minimized and shows it
- **THEN** the system requests focus for the main window

#### Scenario: Hide the launcher

- **WHEN** the system executes `hide` for the main window
- **THEN** the system hides the main window
- **THEN** the lensX application process continues running

#### Scenario: Toggle a visible window

- **WHEN** the system executes `toggle` while the main window is visible
- **THEN** the system hides the main window through the unified action boundary

#### Scenario: Toggle an invisible window

- **WHEN** the system executes `toggle` while the main window is invisible
- **THEN** the system shows and focuses the main window through the unified
  action boundary

#### Scenario: A native window operation fails

- **WHEN** window lookup, visibility inspection, restoration, showing, hiding,
  or focus fails during a launcher action
- **THEN** the system returns a diagnosable error
- **THEN** the error identifies the launcher action and failed native operation
  stage

### Requirement: The default global shortcut must toggle the launcher

The system MUST register `Ctrl+Shift+Space` as the default global shortcut. A
press event for that shortcut MUST route to the unified `toggle` action.
Release events and unknown shortcuts MUST NOT trigger window actions. The
application MUST maintain at most one instance of the default binding while it
is running.

#### Scenario: Press the default shortcut from the hidden state

- **WHEN** the main window is invisible and the user presses
  `Ctrl+Shift+Space`
- **THEN** the system executes `toggle`
- **THEN** the main window appears and requests focus

#### Scenario: Press the default shortcut from the visible state

- **WHEN** the main window is visible and the user presses `Ctrl+Shift+Space`
- **THEN** the system executes `toggle`
- **THEN** the main window hides and the application continues running

#### Scenario: Release the default shortcut

- **WHEN** the system receives a release event for `Ctrl+Shift+Space`
- **THEN** the system does not execute another launcher window action

#### Scenario: Default shortcut registration fails

- **WHEN** the global-shortcut plugin is unavailable or
  `Ctrl+Shift+Space` cannot be registered
- **THEN** the system reports a diagnosable error containing the binding and
  failure reason
- **THEN** the system keeps the main window visible and permits ordinary window
  closing behavior
- **THEN** the system does not enable close-to-hide or focus-loss hiding that
  could make the window permanently unreachable through configured paths

### Requirement: A recoverable launcher must hide on close and focus loss

After the default global shortcut is registered successfully, the system MUST
prevent a main-window close request from terminating the application and MUST
route the request to `hide`. The system MUST route main-window focus loss to
`hide`. Window events emitted after a system-initiated hide MUST NOT cause an
action loop or terminate the application.

#### Scenario: Close a ready launcher window

- **WHEN** the default global shortcut has been registered successfully
- **AND** the user requests that the main window close
- **THEN** the system prevents the default close behavior
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the application process continues running

#### Scenario: The launcher main window loses focus

- **WHEN** the default global shortcut has been registered successfully
- **AND** the visible main window loses focus
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the user can restore the window with the default global shortcut

### Requirement: Launcher activation must restore input focus

The system MUST focus the launcher input when the main window first renders.
After Rust completes a subsequent `show` action, it MUST send a typed activation
event to the main window, and React MUST subscribe to that event and focus the
same input again. The event payload MUST use stable, serializable fields to
represent the activation reason and MUST NOT expose native window objects or
internal Rust types. React MUST release the event listener when the subscriber
unmounts.

#### Scenario: Open the application for the first time

- **WHEN** the minimal launcher interface completes its initial render
- **THEN** the launcher input receives focus
- **THEN** the user can enter text immediately

#### Scenario: Restore the launcher with the shortcut

- **WHEN** the hidden main window is shown by the default global shortcut
- **THEN** Rust sends an activation event after showing and requesting focus
  for the window
- **THEN** React receives the event and focuses the launcher input

#### Scenario: Show the launcher repeatedly

- **WHEN** the main window is hidden and shown multiple times
- **THEN** the launcher input regains focus after every successful show
- **THEN** repeated shows do not accumulate duplicate event listeners

#### Scenario: Unmount the React interface

- **WHEN** the React interface that subscribes to launcher activation unmounts
- **THEN** the system releases that interface's activation-event listener
- **THEN** later events do not invoke focus logic for the unmounted interface
