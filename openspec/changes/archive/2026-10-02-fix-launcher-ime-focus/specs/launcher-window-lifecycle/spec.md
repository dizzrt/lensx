# Spec Delta

## ADDED Requirements

### Requirement: Launcher presentation transitions MUST preserve the valid text input responder

Launcher size, constraint, and resizable configuration MUST preserve the
currently valid text input target. Fixed-size transitions between home and
search MUST NOT change the keyboard responder or interrupt continued input
after committed text by reapplying unchanged window configuration. When actual
window configuration has not changed, the system MUST avoid redundant style
changes that could disturb focus.

Necessary macOS window style changes MUST preserve the currently valid
responder belonging to the complete Window within a controlled native boundary
and MUST NOT unconditionally replace a WebView text responder with the original
window view. When no valid responder exists, configuration MUST NOT activate a
Window, restore an invalidated responder, or force focus onto Host or plugin
content.

This constraint MUST apply to ordinary presentation transitions, environment
constraint refreshes, and failure rollback. Failures in existing observable
window-state reads, message submission, size, constraint, or rollback operations
MUST preserve or restore the last complete safe presentation and follow the
typed safe native error boundary. When the native system refuses responder
restoration, the system MUST retain a safe state and provide bounded developer
diagnostics. It MUST NOT unconditionally fall back to the original window view,
activate the Window, or restore an invalidated page. Successful message
submission MUST NOT be interpreted as confirmed native responder restoration.
Late restoration MUST NOT focus a removed page or replace the current valid
input target.

The identity boundaries between the native Window, Host WebView, and Child
WebView MUST remain distinct. Actual resizable-state changes for valid plugin
Pages MUST continue to take effect. Presentation configuration MUST NOT
broadcast Host activation events, grant native authority to plugins, or change
compare-current lifecycle semantics. Genuine main-window focus loss MUST
continue to follow the existing recoverable-hide contract.

#### Scenario: Enter the first ordinary search character

- **WHEN** the home input is focused, a user enters the first ordinary
  character, and the system switches to fixed search presentation
- **THEN** the Window changes to `650×480` under the existing contract and
  remains non-resizable
- **THEN** the original input target continues to accept text without being
  replaced by the original window view during configuration
- **THEN** subsequent Chinese composition can continue using that target

#### Scenario: Commit Chinese text from home

- **WHEN** a user commits a Chinese query from home and the system first enters
  search presentation
- **THEN** the necessary fixed-size change preserves the original valid input
  target
- **THEN** configuration itself neither triggers focus-loss hiding nor prevents
  subsequent input

#### Scenario: Apply an unchanged presentation or fixed resizable state

- **WHEN** the current presentation target arrives repeatedly, or transitions
  between home, search, and Host Page remain non-resizable
- **THEN** the system applies only window configuration that actually needs to
  change
- **THEN** it does not reassign focus through redundant unchanged resizable
  style changes

#### Scenario: Change the actual resizable state of a plugin Page

- **WHEN** a valid plugin Page needs to enable or disable native resizing
- **THEN** the complete main Window applies the required state and existing
  constraints
- **THEN** the valid text input target still belonging to the current Window is
  preserved
- **THEN** the current Child WebView input target is not unconditionally moved
  to the Host or original window view

#### Scenario: No valid responder is available

- **WHEN** no valid text responder exists during a window configuration change,
  or the previous target has left that Window
- **THEN** the system neither activates a hidden Window nor restores focus to
  an invalidated page
- **THEN** subsequent explicit show, page close, and Host activation remain
  governed by the existing focus policy

#### Scenario: Refresh work area constraints

- **WHEN** window movement or scale changes cause the Host to refresh effective
  constraints for the current presentation
- **THEN** the Host continues to use validated window configuration and work
  area boundaries
- **THEN** unchanged style settings do not repeatedly disturb the current valid
  input target

#### Scenario: A presentation change fails and rolls back

- **WHEN** native window-state reads or size, constraint, resizable-state, or
  rollback operations fail
- **THEN** the system provides a safe typed failure and preserves or restores
  the last complete safe presentation
- **THEN** rollback restores from the current actual window state without
  incorrectly skipping a partially applied resizable change
- **THEN** rollback neither replaces a valid input target with the original
  window view nor focuses an invalidated page

#### Scenario: A plugin Child WebView remains attached during return to home

- **WHEN** a plugin Page closes and returns to home while asynchronous
  destruction of the old Child WebView is still pending
- **THEN** the complete Window returns to fixed home dimensions and
  non-resizable state under the existing contract
- **THEN** configuration or rollback does not refocus or redisplay the old Child
- **THEN** the current Host page-close policy restores home input focus

#### Scenario: The native system rejects responder restoration

- **WHEN** the native system refuses restoration of the previous still-valid
  input responder after a necessary style change
- **THEN** the system neither unconditionally switches to the original window
  view, activates the Window, nor restores a removed page
- **THEN** developers receive bounded diagnostics without the ordinary
  interface exposing native objects or internal errors
- **THEN** the system does not represent successful message submission as
  successful native responder restoration

#### Scenario: The main window genuinely loses focus

- **WHEN** the main Window genuinely loses focus and the default recovery
  shortcut is ready
- **THEN** the system continues to hide the complete main Window and current
  Child WebView through the existing unified boundary
- **THEN** configuration focus preservation neither disables focus-loss hiding
  nor polls to reclaim foreground focus
