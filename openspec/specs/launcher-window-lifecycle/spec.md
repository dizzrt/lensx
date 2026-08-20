# Launcher Window Lifecycle Specification

## Purpose

Define the accepted native launcher window shape, centralized Rust lifecycle
actions, global shortcut behavior, recoverable hide semantics, and input focus
restoration across repeated launcher activations.
## Requirements

### Requirement: The launcher main window must use a compact native window shape

The system MUST configure the main window labeled `main` as an undecorated, non-fullscreen, transparent, always-on-top Launcher Window with initial logical size `650×320`. Home, Search, and Host Page states MUST remain non-resizable and use fixed logical sizes `650×320`, `650×480`, and `650×600`, respectively. A plugin Page MUST use its current validated Page presentation, whose effective initial size is bounded by Contract hard limits and the current monitor work area and whose native user resizing is enabled only when `resizable: true`.

Through a Rust-validated tagged boundary, the Host MUST distinguish `home`, `search`, `host_page`, and identity-bound `plugin_page` targets. Only `plugin_page` MAY carry validated initial size and resizable data. The system MUST NOT accept dimensions from plugin Runtime messages, Host API, DOM measurement, collection/result counts, or arbitrary unbound frontend input. Every transition MUST address the complete native `main` Window while a plugin Child WebView is attached and MUST NOT depend on asynchronous Child WebView teardown completing first.

#### Scenario: Start the desktop application
- **WHEN** lensX creates the main Window and enters `home`
- **THEN** it appears at `650×320` logical pixels with native user resizing disabled
- **THEN** the launcher input and shared Recent and Pinned content region are visible, and the Window remains undecorated, always on top, and non-fullscreen

#### Scenario: Search Actions
- **WHEN** the App Shell moves from `home` to `search`
- **THEN** the Host requests fixed `650×480` and keeps native user resizing disabled
- **THEN** the size does not change with result count or DOM measurement

#### Scenario: Open a Host page
- **WHEN** the App Shell opens a Host Page
- **THEN** the Host requests fixed `650×600` and keeps native user resizing disabled
- **THEN** Page Context and shared content remain visible together

#### Scenario: Open a fixed custom plugin Page
- **WHEN** a resolved plugin Page declares a valid custom initial size and `resizable: false`
- **THEN** the Host applies its effective work-area-bounded initial size to the complete native Window
- **THEN** the user cannot resize it and the plugin receives no native setter authority

#### Scenario: Open a resizable plugin Page
- **WHEN** a resolved plugin Page declares a valid initial size and `resizable: true`
- **THEN** the Host applies its effective initial size and enables native edge/corner user resizing within Host constraints
- **THEN** Home, Search, Host Pages, and other plugin Pages remain unaffected by that opt-in

#### Scenario: Close a Host page
- **WHEN** the App Shell closes a Host Page and returns to `home`
- **THEN** the Host restores `650×320` and `resizable: false`
- **THEN** the launcher input and shared Recent and Pinned content region remain visible

#### Scenario: Close a plugin page while its Child WebView is attached
- **WHEN** the App Shell closes an active fixed or user-resized plugin Page while asynchronous Child WebView teardown is pending
- **THEN** the complete native Window restores to `650×320` and `resizable: false` without waiting, polling, or retrying a single-WebView conversion
- **THEN** the Child WebView becomes hidden and terminal through its compare-current close path and Home retains no plugin presentation state

#### Scenario: Switch between plugin Pages
- **WHEN** plugin Page A transitions directly to plugin Page B with a different validated presentation
- **THEN** the Host applies B's complete effective initial size, constraints, and resizable state
- **THEN** no user-resized size or resizable state from A is inherited

#### Scenario: Home collections change
- **WHEN** a Recent or Pinned collection changes while the App Shell is in `home`
- **THEN** the Window remains fixed `650×320` and non-resizable
- **THEN** the frontend does not measure the DOM or submit another size

#### Scenario: Submit an unsupported presentation
- **WHEN** the Tauri boundary receives an unknown variant, unbound plugin identity, invalid size, or author-disallowed native field
- **THEN** Rust rejects the request
- **THEN** the caller cannot use the boundary to submit arbitrary native Window operations

#### Scenario: Native presentation transition fails
- **WHEN** Rust cannot resolve the native Window, work area, size, constraints, resizable setter, or rollback stage
- **THEN** the command returns a serializable error containing a stable code, target kind, operation, and safe message
- **THEN** the Host retains or restores the last complete safe presentation rather than leaving mixed target/previous state

### Requirement: Launcher MUST separate native Window and Host WebView identities

The system MUST treat the native `main` Window, the trusted Host WebView, and
the plugin Child WebView as distinct identities. Native sizing, visibility,
show, hide, focus, window-event, and native-dialog parent operations MUST
always target the complete native `main` Window and MUST remain resolvable
before and after a Child WebView is attached or removed. Host activation events
MUST target only the trusted Host WebView and MUST NOT be broadcast to plugin
Child WebViews as a consequence of native Window operations.

#### Scenario: Resolve the native parent after attaching a Child WebView

- **WHEN** the native `main` Window contains both the Host WebView and the
  current plugin Child WebView
- **THEN** Launcher native size, visibility, show, hide, focus, and window-event
  operations still resolve the same complete native Window
- **THEN** the Child WebView's distinct label does not invalidate the main
  Window lookup

#### Scenario: Emit activation after restoring a plugin page

- **WHEN** the Launcher restores a hidden native Window containing the current
  plugin Child WebView
- **THEN** the typed activation event is sent only to the trusted Host WebView
- **THEN** the plugin Child WebView receives neither the Host activation event
  nor additional Host authority as a consequence of the native Window restore

#### Scenario: Open a native dialog from the Host

- **WHEN** the Host opens a native dialog from an allowed Launcher surface
- **THEN** the dialog uses the complete native `main` Window as its parent
- **THEN** the dialog guard continues to suppress focus-loss hiding throughout
  the dialog lifecycle without changing Child WebView authority

### Requirement: The unified launcher top region must support native window dragging

The system MUST allow the user to initiate native main-window dragging with
the primary mouse button from the complete unified launcher top region in the
`home`, `search`, and `page` presentation states. The region MUST span the
window width and extend from the top edge through the lower edge of the shared
top slot, including top blank space, the search input, non-interactive page
context, and the decorative avatar. Dragging MUST execute through a constrained
Host window boundary and MUST NOT allow the frontend to submit window
coordinates, arbitrary dimensions, resize requests, or maximize requests.

The page-context close control and every explicitly excluded interactive
control MUST NOT initiate window dragging. Auxiliary mouse buttons and keyboard
events MUST NOT initiate window dragging. Whether dragging succeeds or fails,
it MUST NOT change the current presentation state, query, Action selection,
active page, or fixed window shape.

#### Scenario: Move the window from blank top space in home

- **WHEN** the launcher is in the `home` state and the user drags blank space in
  the unified top region with the primary mouse button
- **THEN** the Host initiates native main-window dragging
- **THEN** the main window retains its logical `650×320px` dimensions

#### Scenario: Move the window from the search input region

- **WHEN** the launcher is in the `search` state and the user starts a drag from
  the search input with the primary mouse button
- **THEN** the Host initiates native main-window dragging
- **THEN** the current query, search results, and Action selection remain
  unchanged
- **THEN** the main window retains its logical `650×480px` dimensions

#### Scenario: Move the window from the decorative avatar

- **WHEN** the user drags the decorative avatar at the far right of the unified
  top region with the primary mouse button
- **THEN** the Host initiates native main-window dragging
- **THEN** the avatar does not invoke account, menu, navigation, or other
  product behavior

#### Scenario: Move the window from non-interactive page context

- **WHEN** the launcher is in the `page` state and the user drags the page
  context text or its surrounding blank space
- **THEN** the Host initiates native main-window dragging
- **THEN** the active page remains open and the main window retains its logical
  `650×600px` dimensions

#### Scenario: Operate the page close control

- **WHEN** the launcher is in the `page` state and the user activates the
  page-context close control with the primary mouse button
- **THEN** the system does not initiate window dragging
- **THEN** the system closes the active page and returns to the `home` state

#### Scenario: Use a non-primary mouse button or keyboard

- **WHEN** the user sends an auxiliary-mouse-button, right-click, or keyboard
  event within the unified top region
- **THEN** the system does not initiate window dragging
- **THEN** the current launcher state remains unchanged

#### Scenario: Native dragging cannot start

- **WHEN** the Host cannot initiate native window dragging
- **THEN** the current window position and fixed shape remain at their last
  successful state
- **THEN** the current query, Action selection, presentation state, and active
  page remain unchanged
- **THEN** the failure is available for developer diagnosis without exposing
  native error details to the user

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
route the request to `hide`. On macOS, the system MUST provide exactly one
application-local `Cmd+W` window-close shortcut entry point. When the
undecorated main window cannot produce a close event through the native close
command, that entry point MUST still route to `hide` through the unified action
boundary. The system MUST NOT register `Cmd+W` as a system-wide global
shortcut. The system MUST route main-window focus loss to `hide`. Window events
emitted after a system-initiated hide MUST NOT cause an action loop or terminate
the application.

The application-local macOS `Cmd+W` entry point MUST be enabled only after the
default global shortcut is registered successfully. If menu-event installation
or routing fails, or if the hide operation fails, the system MUST make failure
information available for developer diagnosis, MUST NOT expose native error
details to the user, and MUST NOT terminate the application process because of
the failure.

When a current Child WebView exists, the hide boundary MUST resolve the
complete native main Window before changing Child presentation. It MUST hide
the Child WebView before the native parent to prevent overlay leakage, and MUST
either hide both surfaces or restore the still-current Child presentation when
native parent hide fails. A failed hide MUST NOT leave the Host window visible
with only the plugin content blank. Restore MUST show and focus the native
parent before restoring and focusing the same current Child WebView.

#### Scenario: Close a ready launcher window

- **WHEN** the default global shortcut has been registered successfully
- **AND** the user requests that the main window close
- **THEN** the system prevents the default close behavior
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the application process continues running

#### Scenario: Press Cmd+W in a ready macOS launcher

- **WHEN** the default global shortcut has been registered successfully
- **AND** the macOS main window is visible and lensX is the foreground
  application
- **AND** the user presses `Cmd+W`
- **THEN** exactly one application-local menu shortcut entry point handles the
  key press
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the main window is not destroyed and the application process
  continues running

#### Scenario: Press Cmd+W while a plugin Child WebView is visible

- **WHEN** the foreground macOS Launcher contains a visible current plugin
  Child WebView
- **AND** the user presses `Cmd+W`
- **THEN** the unified action resolves and hides the complete native Window and
  current Child WebView as one semantic transition
- **THEN** the Host page chrome and plugin content are both absent from the
  screen while the process and same Runtime attempt continue
- **THEN** the Launcher does not remain visible with an empty plugin content
  region

#### Scenario: Restore the launcher after Cmd+W

- **WHEN** the macOS main window has been hidden by `Cmd+W`
- **AND** the user presses the default global shortcut
- **THEN** the system shows and focuses the main window through the unified
  action boundary
- **THEN** the existing typed activation event restores focus according to the
  Host-owned page/input policy

#### Scenario: Restore a plugin page after Cmd+W

- **WHEN** `Cmd+W` semantically hid a Launcher with an equivalent current
  plugin attempt
- **AND** the user restores Launcher with the default global shortcut
- **THEN** the complete native Window is shown before the same Child WebView is
  shown and focused
- **THEN** the plugin document, Session, model, and Worker are reused without a
  fresh loading cycle

#### Scenario: Default recovery shortcut is unavailable on macOS

- **WHEN** the global-shortcut plugin is unavailable or registration of the
  default global shortcut fails
- **AND** the user presses `Cmd+W`
- **THEN** the new application-local `Cmd+W` entry point does not hide the main
  window
- **THEN** the system does not produce a hidden window that cannot be restored
  through a configured path

#### Scenario: Cmd+W hide fails before Child presentation changes

- **WHEN** the application-local macOS `Cmd+W` entry point cannot resolve the
  complete native main Window
- **THEN** the system preserves both the Host and current Child WebView at their
  last successfully established visibility state
- **THEN** the failure identifies the requested action and `resolve_window`
  stage for developer diagnosis
- **THEN** no empty plugin content region is introduced

#### Scenario: Cmd+W native hide fails after Child WebView hides

- **WHEN** the application-local macOS `Cmd+W` entry point resolves the native
  main Window and hides the current Child WebView
- **AND** hiding the native parent fails
- **THEN** the system restores the equivalent current Child WebView or
  terminates it fail-closed if rollback cannot be proven current
- **THEN** the failure information identifies the requested action and failed
  native operation stage
- **THEN** the system does not expose native error details to the user or
  terminate the application process

#### Scenario: The launcher main window loses focus

- **WHEN** the default global shortcut has been registered successfully
- **AND** the visible main window loses focus
- **THEN** the system hides the complete native main Window and current Child
  WebView through the unified action boundary
- **THEN** the user can restore the window and same equivalent attempt with the
  default global shortcut

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

### Requirement: Launcher lifecycle MUST coordinate Host and Child WebView surfaces atomically
Hide, restore, resize, scale-factor change, focus, blur, shortcut activation, close and application teardown MUST update the native Child WebView through the current revisioned presentation binding. Semantic hide/restore MUST preserve the same attempt; Page close or application teardown MUST destroy it. Host-owned overlay or unavailable slot MUST hide the Child WebView before trusted DOM interaction is exposed.

The complete native Window and current Child WebView MUST NOT settle in
contradictory presentation states after an operation reports failure. All
rollback or teardown work MUST remain compare-current so an old attempt cannot
reveal, focus, resize, or destroy a replacement.

#### Scenario: Launcher hides and restores
- **WHEN** the current plugin facts remain equivalent across temporary Launcher hide and restore
- **THEN** the same Child WebView and Session are hidden then shown without reload
- **THEN** launcher input focus and plugin focus follow the Host-owned activation policy

#### Scenario: Parent lookup fails before semantic hide

- **WHEN** the system cannot resolve the complete native parent before a
  semantic hide
- **THEN** the current Child WebView is not hidden independently
- **THEN** the action reports a bounded failure while preserving the last
  complete presentation state

#### Scenario: A stale rollback completes after replacement

- **WHEN** a failed hide starts Child presentation rollback and a newer Runtime
  attempt becomes current first
- **THEN** the old rollback is inert and cannot show, focus, resize, or destroy
  the replacement
- **THEN** the replacement follows only its own current presentation revision

#### Scenario: Window geometry changes
- **WHEN** resize or scale-factor change produces a new slot revision
- **THEN** Rust applies verified physical bounds to the current WebView without affecting a newer attempt

#### Scenario: Launcher terminates
- **WHEN** the app unmounts or exits
- **THEN** Child WebView teardown joins the existing root lifecycle and leaves no native surface or bridge binding

### Requirement: macOS Host MUST run as an accessory Launcher without a Dock tile

On macOS, the system MUST configure lensX as a programmatically activatable
accessory application from the observable start of the packaged application.
While lensX is running, it MUST NOT show a Dock tile or ordinary application
menu bar, MUST NOT use the prohibited activation policy that prevents Window
creation or activation, and MUST keep the process and default global shortcut
available after the Launcher Window is hidden. This policy MUST belong only to
the trusted Rust Host. React, plugin Runtimes, plugin Host APIs, and public Host
APIs MUST NOT receive authority to change the application activation policy or
Dock visibility.

If the Host cannot establish or confirm the required accessory policy, startup
MUST fail before presenting an ordinary Dock application and MUST provide a
safe, diagnosable setup stage. The system MUST NOT silently fall back to the
Regular policy.

#### Scenario: Launch the packaged macOS application

- **WHEN** the user launches the packaged lensX `.app` through Launch Services
- **THEN** the process runs under a programmatically activatable accessory
  policy
- **THEN** no lensX Dock tile appears from observable startup through process
  exit
- **THEN** the system does not show an ordinary lensX application menu bar

#### Scenario: Hide an accessory Launcher

- **WHEN** the ready macOS Launcher hides through the unified action boundary
- **THEN** the lensX process and default global shortcut continue running
- **THEN** hiding does not create a Dock tile, status item, or other persistent
  clickable entry point

#### Scenario: Accessory setup fails

- **WHEN** the Host cannot set or confirm the macOS accessory activation policy
- **THEN** startup terminates before showing an ordinary Regular application
  Window
- **THEN** developer diagnostics identify the application-policy setup stage
  without exposing native error details to the user

#### Scenario: Untrusted code requests application policy authority

- **WHEN** React, a plugin Runtime, a plugin Host API, or a public Contract
  attempts to change activation policy, Dock visibility, or application-menu
  identity
- **THEN** the system provides no such operation boundary
- **THEN** the Host retains its confirmed accessory policy

### Requirement: macOS Launcher MUST restore over another application's full-screen Space

The complete native macOS `main` Window MUST participate in all Spaces and MUST
be configured to coexist with another application's full-screen Window.
Always-on-top, cross-Space, and full-screen auxiliary behavior MUST be
established by the trusted Rust Host, MUST preserve the Launcher's existing
non-full-screen semantics, and MUST NOT be exposed as native setters controlled
by the frontend, plugins, DOM measurement, or Runtime messages.

When the Launcher is hidden and the user presses the default global shortcut
while another application occupies the current full-screen Space, the system
MUST use the unified `toggle`/`show` action boundary to activate the accessory
application, restore and show the complete native Window, request keyboard
focus, and then send the Host activation event. The Launcher MUST appear above
the full-screen content in the user's current full-screen Space. The system
MUST NOT switch the user back to the Launcher's previous ordinary Space or
exit, minimize, or otherwise change the foreground application's full-screen
state.

#### Scenario: Restore from another application's full-screen Space

- **WHEN** the macOS Launcher is hidden
- **AND** another application is full-screen in the user's current Space
- **AND** the user presses the default global shortcut
- **THEN** the pressed event enters the show path through the unified `toggle`
  action
- **THEN** the complete lensX Window is visible above the full-screen content
  in the current full-screen Space and receives keyboard focus
- **THEN** the system does not switch to the previous Space or exit, minimize,
  or change the foreground application's full-screen state

#### Scenario: Restore from an ordinary Space

- **WHEN** the macOS Launcher is hidden and the user is in an ordinary,
  non-full-screen Space
- **AND** the user presses the default global shortcut
- **THEN** the system shows and focuses the Launcher through the same action
  boundary
- **THEN** cross-Space policy does not change the existing size, position,
  non-full-screen state, or presentation state

#### Scenario: Repeated full-screen toggles

- **WHEN** the user repeatedly hides and restores the Launcher in another
  application's full-screen Space
- **THEN** each pressed event executes exactly one hide or show
- **THEN** after each show the Window is visible and accepts input, and after
  each hide the Window no longer obscures full-screen content
- **THEN** the system does not accumulate duplicate shortcuts, Windows, Space
  listeners, or focus listeners

#### Scenario: Restore a current plugin Page over full-screen content

- **WHEN** the hidden Launcher contains the same equivalent current plugin
  attempt
- **AND** the user restores the Launcher from another application's full-screen
  Space with the default global shortcut
- **THEN** the system shows and focuses the complete native parent before
  restoring the same Child WebView presentation
- **THEN** Host chrome and plugin content are visible together in the same
  current full-screen Space
- **THEN** the Runtime attempt, Session, plugin document, and in-memory state are
  not recreated because of the cross-Space restore

#### Scenario: Full-screen Space setup cannot be established

- **WHEN** the Host cannot resolve the complete native `main` Window, apply
  collection behavior on the main thread, or confirm the cross-Space and
  full-screen auxiliary policy
- **THEN** setup fails before the Launcher is declared ready
- **THEN** the system does not fall back to calling only `show`, switching to
  the previous Space, or weakening visibility assertions
- **THEN** developer diagnostics identify the safe native setup stage

### Requirement: Accessory Launcher MUST retain application-local close and quit shortcuts

When the macOS accessory policy removes the ordinary application menu bar, the
system MUST continue to provide exactly one lensX application-local `Cmd+W`
entry point and exactly one lensX application-local `Cmd+Q` entry point.
`Cmd+W` MUST follow the existing recoverable-hide requirement and enter the
unified Hide action. `Cmd+Q` MUST terminate the lensX process after performing
the existing application teardown. Both entry points MUST handle keys only
while lensX is the foreground application, MUST NOT be registered as
system-wide global shortcuts, and MUST NOT intercept the corresponding commands
for another foreground application.

#### Scenario: Press Cmd+W without a visible application menu bar

- **WHEN** the accessory lensX Window is visible and focused without an
  ordinary application menu bar
- **AND** the user presses `Cmd+W`
- **THEN** exactly one application-local entry point hides the complete Launcher
  through the unified Hide action
- **THEN** the process and default recovery shortcut continue running

#### Scenario: Press Cmd+Q without a visible application menu bar

- **WHEN** the accessory lensX Window is visible and focused without an
  ordinary application menu bar
- **AND** the user presses `Cmd+Q`
- **THEN** exactly one application-local entry point requests lensX exit
- **THEN** application teardown terminates the current Child WebView and Host
  resources before the process ends

#### Scenario: Another application owns the foreground

- **WHEN** another application is the macOS foreground application
- **AND** the user presses `Cmd+W` or `Cmd+Q` in that application
- **THEN** lensX does not hide, exit, or consume the corresponding key event
- **THEN** the foreground application retains its own local shortcut behavior

#### Scenario: Recovery shortcut registration fails

- **WHEN** the default lensX global recovery shortcut cannot be registered
- **THEN** the system does not enable application-local `Cmd+W` or focus-loss
  hiding that would hide the Launcher
- **THEN** the visible Window retains an exit path and the system does not leave
  a hidden process without a Dock tile or recovery entry point
