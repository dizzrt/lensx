# Launcher Window Lifecycle Specification

## Purpose

Define the accepted native launcher window shape, centralized Rust lifecycle
actions, global shortcut behavior, recoverable hide semantics, and input focus
restoration across repeated launcher activations.
## Requirements

### Requirement: The launcher main window must use a compact native window shape

The system MUST configure the main window labeled `main` as an undecorated, non-fullscreen, transparent, always-on-top Launcher Window with initial logical size `650×320`.

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

#### Scenario: Choose native shape for the current launcher surface
- **WHEN** the Host applies a Home, Search, Host Page, or plugin Page presentation
- **THEN** Home, Search, and Host Page states MUST remain non-resizable and use fixed logical sizes `650×320`, `650×480`, and `650×600`, respectively.
- **THEN** A plugin Page MUST use its current validated Page presentation, whose effective initial size is bounded by Contract hard limits and the current monitor work area and whose native user resizing is enabled only when `resizable: true`.

#### Scenario: Validate a tagged native presentation transition
- **WHEN** a frontend presentation target reaches the native main Window boundary
- **THEN** Through a Rust-validated tagged boundary, the Host MUST distinguish `home`, `search`, `host_page`, and identity-bound `plugin_page` targets.
- **THEN** Only `plugin_page` MAY carry validated initial size and resizable data.
- **THEN** The system MUST NOT accept dimensions from plugin Runtime messages, Host API, DOM measurement, collection/result counts, or arbitrary unbound frontend input.
- **THEN** Every transition MUST address the complete native `main` Window while a plugin Child WebView is attached and MUST NOT depend on asynchronous Child WebView teardown completing first.

### Requirement: Launcher MUST separate native Window and Host WebView identities

The system MUST treat the native `main` Window, the trusted Host WebView, and the plugin Child WebView as distinct identities.

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

#### Scenario: Route native operations and activation to distinct surfaces
- **WHEN** the Host sizes, shows, hides, focuses, or parents a dialog while a Child WebView may be attached
- **THEN** Native sizing, visibility, show, hide, focus, window-event, and native-dialog parent operations MUST always target the complete native `main` Window and MUST remain resolvable before and after a Child WebView is attached or removed.
- **THEN** Host activation events MUST target only the trusted Host WebView and MUST NOT be broadcast to plugin Child WebViews as a consequence of native Window operations.

### Requirement: The unified launcher top region must support native window dragging

The system MUST allow the user to initiate native main-window dragging with the primary mouse button from the complete unified launcher top region in the `home`, `search`, and `page` presentation states.

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

#### Scenario: Delegate dragging across the unified top region
- **WHEN** the user presses the primary mouse button within the launcher top region
- **THEN** The region MUST span the window width and extend from the top edge through the lower edge of the shared top slot, including top blank space, the search input, non-interactive page context, and the decorative avatar.
- **THEN** Dragging MUST execute through a constrained Host window boundary and MUST NOT allow the frontend to submit window coordinates, arbitrary dimensions, resize requests, or maximize requests.

#### Scenario: Exclude interactive controls and preserve launcher state
- **WHEN** a pointer or keyboard event occurs on a close control or another excluded top-region control
- **THEN** The page-context close control and every explicitly excluded interactive control MUST NOT initiate window dragging.
- **THEN** Auxiliary mouse buttons and keyboard events MUST NOT initiate window dragging.
- **THEN** Whether dragging succeeds or fails, it MUST NOT change the current presentation state, query, Action selection, active page, or fixed window shape.

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

After the default global shortcut is registered successfully, the system MUST prevent a main-window close request from terminating the application and MUST route the request to `hide`.

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

#### Scenario: Route ready close and blur events to recoverable hide
- **WHEN** the recovery shortcut is registered and the main Window receives a close or focus-loss event
- **THEN** On macOS, the system MUST provide exactly one application-local `Cmd+W` window-close shortcut entry point.
- **THEN** When the undecorated main window cannot produce a close event through the native close command, that entry point MUST still route to `hide` through the unified action boundary.
- **THEN** The system MUST NOT register `Cmd+W` as a system-wide global shortcut.
- **THEN** The system MUST route main-window focus loss to `hide`.
- **THEN** Window events emitted after a system-initiated hide MUST NOT cause an action loop or terminate the application.

#### Scenario: Handle unavailable local close routing
- **WHEN** the Host installs or executes the application-local macOS close shortcut
- **THEN** The application-local macOS `Cmd+W` entry point MUST be enabled only after the default global shortcut is registered successfully.
- **THEN** If menu-event installation or routing fails, or if the hide operation fails, the system MUST make failure information available for developer diagnosis, MUST NOT expose native error details to the user, and MUST NOT terminate the application process because of the failure.

#### Scenario: Coordinate Child and native parent hide or restore
- **WHEN** the Host hides or restores a Window with a current Child WebView
- **THEN** When a current Child WebView exists, the hide boundary MUST resolve the complete native main Window before changing Child presentation.
- **THEN** It MUST hide the Child WebView before the native parent to prevent overlay leakage, and MUST either hide both surfaces or restore the still-current Child presentation when native parent hide fails.
- **THEN** A failed hide MUST NOT leave the Host window visible with only the plugin content blank.
- **THEN** Restore MUST show and focus the native parent before restoring and focusing the same current Child WebView.

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

Hide, restore, resize, scale-factor change, focus, blur, shortcut activation, close and application teardown MUST update the native Child WebView through the current revisioned presentation binding.

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

#### Scenario: Apply lifecycle changes to the current presentation binding
- **WHEN** a launcher lifecycle event updates a current Child WebView
- **THEN** Semantic hide/restore MUST preserve the same attempt; Page close or application teardown MUST destroy it.
- **THEN** Host-owned overlay or unavailable slot MUST hide the Child WebView before trusted DOM interaction is exposed.

#### Scenario: Keep failed surface transitions compare-current
- **WHEN** an operation fails or completes rollback after the Child attempt may have changed
- **THEN** The complete native Window and current Child WebView MUST NOT settle in contradictory presentation states after an operation reports failure.
- **THEN** All rollback or teardown work MUST remain compare-current so an old attempt cannot reveal, focus, resize, or destroy a replacement.

### Requirement: macOS Host MUST run as an accessory Launcher without a Dock tile

On macOS, the system MUST configure lensX as a programmatically activatable accessory application from the observable start of the packaged application.

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

#### Scenario: Keep accessory policy within trusted native ownership
- **WHEN** the macOS application starts or remains running with its Launcher Window hidden
- **THEN** While lensX is running, it MUST NOT show a Dock tile or ordinary application menu bar, MUST NOT use the prohibited activation policy that prevents Window creation or activation, and MUST keep the process and default global shortcut available after the Launcher Window is hidden.
- **THEN** This policy MUST belong only to the trusted Rust Host.
- **THEN** React, plugin Runtimes, plugin Host APIs, and public Host APIs MUST NOT receive authority to change the application activation policy or Dock visibility.

#### Scenario: Fail safely when accessory startup cannot be established
- **WHEN** the Rust Host cannot establish or confirm accessory activation policy
- **THEN** If the Host cannot establish or confirm the required accessory policy, startup MUST fail before presenting an ordinary Dock application and MUST provide a safe, diagnosable setup stage.
- **THEN** The system MUST NOT silently fall back to the Regular policy.

### Requirement: macOS Launcher MUST restore over another application's full-screen Space

The complete native macOS `main` Window MUST participate in all Spaces and MUST be configured to coexist with another application's full-screen Window.

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

#### Scenario: Configure full-screen auxiliary participation
- **WHEN** the trusted Rust Host configures the native macOS main Window
- **THEN** Always-on-top, cross-Space, and full-screen auxiliary behavior MUST be established by the trusted Rust Host, MUST preserve the Launcher's existing non-full-screen semantics, and MUST NOT be exposed as native setters controlled by the frontend, plugins, DOM measurement, or Runtime messages.

#### Scenario: Restore through the native action boundary in the active Space
- **WHEN** the hidden launcher is activated while another application occupies the current full-screen Space
- **THEN** When the Launcher is hidden and the user presses the default global shortcut while another application occupies the current full-screen Space, the system MUST use the unified `toggle`/`show` action boundary to activate the accessory application, restore and show the complete native Window, request keyboard focus, and then send the Host activation event.
- **THEN** The Launcher MUST appear above the full-screen content in the user's current full-screen Space.
- **THEN** The system MUST NOT switch the user back to the Launcher's previous ordinary Space or exit, minimize, or otherwise change the foreground application's full-screen state.

### Requirement: Accessory Launcher MUST retain application-local close and quit shortcuts

When the macOS accessory policy removes the ordinary application menu bar, the system MUST continue to provide exactly one lensX application-local `Cmd+W` entry point and exactly one lensX application-local `Cmd+Q` entry point.

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

#### Scenario: Dispatch local close and quit only for foreground lensX
- **WHEN** the user invokes Cmd+W or Cmd+Q while the accessory application has no ordinary visible menu bar
- **THEN** `Cmd+W` MUST follow the existing recoverable-hide requirement and enter the unified Hide action.
- **THEN** `Cmd+Q` MUST terminate the lensX process after performing the existing application teardown.
- **THEN** Both entry points MUST handle keys only while lensX is the foreground application, MUST NOT be registered as system-wide global shortcuts, and MUST NOT intercept the corresponding commands for another foreground application.

### Requirement: Launcher presentation transitions MUST preserve the valid text input responder

Launcher size, constraint, and resizable configuration MUST preserve the currently valid text input target.

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

#### Scenario: Avoid redundant configuration during text entry
- **WHEN** a fixed-size presentation transition applies unchanged native window configuration
- **THEN** Fixed-size transitions between home and search MUST NOT change the keyboard responder or interrupt continued input after committed text by reapplying unchanged window configuration.
- **THEN** When actual window configuration has not changed, the system MUST avoid redundant style changes that could disturb focus.

#### Scenario: Preserve only a valid responder during native style changes
- **WHEN** a necessary macOS window style change is applied
- **THEN** Necessary macOS window style changes MUST preserve the currently valid responder belonging to the complete Window within a controlled native boundary and MUST NOT unconditionally replace a WebView text responder with the original window view.
- **THEN** When no valid responder exists, configuration MUST NOT activate a Window, restore an invalidated responder, or force focus onto Host or plugin content.

#### Scenario: Handle failed configuration and late responder restoration
- **WHEN** an ordinary transition, environment refresh, or rollback encounters a native failure or delayed restoration
- **THEN** This constraint MUST apply to ordinary presentation transitions, environment constraint refreshes, and failure rollback.
- **THEN** Failures in existing observable window-state reads, message submission, size, constraint, or rollback operations MUST preserve or restore the last complete safe presentation and follow the typed safe native error boundary.
- **THEN** When the native system refuses responder restoration, the system MUST retain a safe state and provide bounded developer diagnostics.
- **THEN** It MUST NOT unconditionally fall back to the original window view, activate the Window, or restore an invalidated page.
- **THEN** Successful message submission MUST NOT be interpreted as confirmed native responder restoration.
- **THEN** Late restoration MUST NOT focus a removed page or replace the current valid input target.

#### Scenario: Keep responder repair within existing Window boundaries
- **WHEN** the Host applies presentation configuration while a plugin Page or Child WebView may be current
- **THEN** The identity boundaries between the native Window, Host WebView, and Child WebView MUST remain distinct.
- **THEN** Actual resizable-state changes for valid plugin Pages MUST continue to take effect.
- **THEN** Presentation configuration MUST NOT broadcast Host activation events, grant native authority to plugins, or change compare-current lifecycle semantics.
- **THEN** Genuine main-window focus loss MUST continue to follow the existing recoverable-hide contract.

### Requirement: Accessory Launcher MUST deliver standard editing commands through the current native focus

On macOS, the foreground lensX Accessory Launcher MUST use a native editing dispatch boundary shared by the Host and Child to let the current valid text focus handle Select All, Copy, Cut, Paste, Undo, and Redo according to the target control and native editing-command semantics.

#### Scenario: Edit text in the Host without a visible application menu bar

- **WHEN** lensX is foreground, Host search or another ordinary input owns valid native focus, and the user invokes a standard editing shortcut
- **THEN** Select All, Copy, Cut, Paste, Undo, and Redo affect the current selection, text, and undo history according to that input's existing semantics
- **THEN** each gesture performs at most one edit, focus is preserved, and the application still has no Dock tile or ordinary visible menu bar

#### Scenario: The same command follows the focused Child input

- **WHEN** the current visible plugin's `input`, `textarea`, `contenteditable`, Monaco body, or Find input obtains native focus and receives a standard editing shortcut
- **THEN** the command affects only the current text target; editing a Find query does not select or change the Monaco body, and Child editing does not affect Host search
- **THEN** official, external, and Development Mode plugins share the same dispatch semantics without plugin-specific Host mappings or SDK changes

#### Scenario: Copy and paste exchange text with another application

- **WHEN** the user copies a copyable selection from the current valid text target and pastes it in another application, or copies text from another application and returns to a valid editable lensX target to paste
- **THEN** native text-clipboard semantics deliver the user-selected text, inserting it once per paste
- **THEN** a plugin-internal cache round trip does not replace this behavior, and the plugin gains no background clipboard-reading capability

#### Scenario: Web content already handled or cancelled the event

- **WHEN** the current Web document has handled the keyboard event or cancelled its default behavior under its editing rules
- **THEN** the Host respects that result without additionally invoking the corresponding editing command, duplicating copy/paste, or changing undo history again
- **THEN** the Page's existing business shortcuts, input, and composition semantics remain valid

#### Scenario: An unhandled event continues through native editing semantics

- **WHEN** the current target is confirmed not to have handled the event and the native menu and current responder chain provide an applicable standard editing command
- **THEN** that command executes at most once and retains its actual handling result, without the repair layer additionally synthesizing or resending the same keyboard event
- **THEN** when no handler is available or the command cannot handle the event, native propagation continues without marking it as a successful edit

#### Scenario: Pending native handling completes without duplicate editing

- **WHEN** the native WebView takes over an event while Web handling remains pending and later provides a result through legal completion or unhandled-event reentry
- **THEN** the synchronous takeover result does not trigger early menu execution, and legal reentry is not treated as a new user gesture
- **THEN** final handling or default cancellation does not edit again; only finally confirmed non-handling continues through the native menu and responder chain
- **THEN** any repair-owned delayed compensation is bound to the original Window/target/Child generation and cancelled after a focus or generation change, without editing an old target, restoring old focus, or redirecting the old operation to a new target

#### Scenario: Read-only disabled or empty editing state retains native semantics

- **WHEN** the target is read-only or disabled, the selection or clipboard is empty, or no undo/redo content exists
- **THEN** the current control and native command determine available operations and results; dispatch does not forcibly change text or clear the clipboard
- **THEN** normal editing can continue after the user restores a valid selection, editable content, or available undo history

#### Scenario: Focus changes or the previous target becomes invalid

- **WHEN** focus moves from Host to Child or body to query, or the previous target is hidden, removed, replaced, or leaves the current Window
- **THEN** subsequent commands use only the still-valid current native target, without retaining the old target or forcibly returning focus
- **THEN** no valid target means no edit, hidden-window reveal, or invalidated-Page restoration

#### Scenario: Reserved and background application commands retain their ownership

- **WHEN** the user presses `Cmd+W/Q` while lensX is foreground, or uses editing, close, and quit shortcuts in another foreground application
- **THEN** the former retain single Hide/Quit execution and the corresponding cleanup, while lensX does not consume the latter
- **THEN** the default global activation shortcut, recovery entry point, and other non-editing Window behavior retain their existing contracts

#### Scenario: Standard command coverage does not become a per-key or per-plugin patch

- **WHEN** acceptance uses `Cmd+A/C/X/V/Z` and `Cmd+Shift+Z` samples across different native text targets
- **THEN** commands follow unified native editing semantics without production key-code allowlists, plugin identity, page-index, or DOM branches that redispatch them
- **THEN** compliant external plugins obtain this behavior through ordinary controls and the public Runtime, without new permissions, Host APIs, or script injection

#### Scenario: Deliver editing to supported native text controls
- **WHEN** the user invokes a standard editing command in the current foreground Host or plugin text control
- **THEN** This behavior MUST cover Host search and other ordinary inputs, external-plugin `input`/`textarea`/`contenteditable` controls, and the Monaco body and Find input.
- **THEN** User-initiated copy and paste MUST exchange text with other applications rather than only round-tripping through a plugin's private memory.
- **THEN** Plugin business commands remain defined by their owning Page.

#### Scenario: Complete handled and unhandled editing exactly once
- **WHEN** the original editing event enters dispatch, is processed by the Web document, and completes as handled or unhandled
- **THEN** Dispatch MUST preserve the original event, modifiers, current native focus, and single-execution semantics.
- **THEN** When the Web document has handled the event or cancelled its default behavior under its input rules, the Host MUST NOT execute the corresponding standard editing command again.
- **THEN** When handling is finally confirmed as unhandled, dispatch MUST continue native-menu and current-responder-chain semantics, execute an available command at most once, and continue propagating events that remain unhandled.
- **THEN** The repair layer MUST NOT additionally synthesize or resend the same keyboard event, recursively invoke the editing chain, or unconditionally perform another DOM edit.
- **THEN** WebKit's legal completion and unhandled-event reentry MUST be preserved and MUST NOT be treated as a new user gesture.

#### Scenario: Preserve asynchronous editing completion ownership
- **WHEN** native editing dispatch is awaiting WebKit completion or a delayed compensation path
- **THEN** While asynchronous handling is incomplete, the Host MUST preserve the native completion and reentry protocol.
- **THEN** It MUST NOT interpret the synchronous native takeover result as final handling or confirmed non-handling, and MUST NOT unconditionally execute a menu command immediately after invoking the superclass.
- **THEN** If the repair introduces delayed compensation, that compensation MUST be associated with the original gesture's initial Window, text target, and applicable Child generation, and MUST revalidate those identities and native focus before executing.
- **THEN** A focus change, invalid target, or generation change during the wait MUST cancel that event's compensation rather than read a new first responder and redirect the old event to a new target.
- **THEN** WebKit's own legal reentry MUST retain its existing mechanism.

#### Scenario: Reject stale or ineligible editing targets
- **WHEN** dispatch considers any candidate editing target, including a current, hidden, unfocused, removed, replaced, unverifiable, ineligible, or restored target
- **THEN** At dispatch time, the target MUST still belong to the current valid Window/WebView.
- **THEN** A hidden, unfocused, removed, replaced, or unverifiable target MUST NOT consume the event, steal focus, reveal itself, or affect another input target.
- **THEN** Read-only, disabled, empty-selection, empty-clipboard, and empty-undo states MUST retain the corresponding control and native-command semantics.
- **THEN** The dispatch layer MUST NOT forcibly change content, clear the clipboard, or fabricate successful editing.
- **THEN** Normal editing MUST resume when valid focus and input conditions are restored.

#### Scenario: Keep editing repair independent of plugin implementation
- **WHEN** the Host supplies standard editing support to an existing compliant plugin
- **THEN** `Cmd+A/C/X/V/Z` and `Cmd+Shift+Z` MUST be standard-editing acceptance samples rather than a production key-code allowlist.
- **THEN** The Host MUST NOT select patches by plugin identity, Publisher, page index, DOM structure/selector, or editor type, and MUST NOT require existing compliant plugins to modify lensX source, update the SDK, or add platform adapters.
- **THEN** The repair MUST NOT inject scripts, call `eval`, generate synthetic keyboard events, or add a programmatic Host clipboard API, plugin permission, generic Tauri capability, native handle, or global editing shortcut.

#### Scenario: Preserve accessory activation and local lifecycle shortcuts
- **WHEN** editing dispatch runs while lensX or another application owns foreground focus
- **THEN** The system MUST preserve Accessory policy, the absence of a Dock tile and ordinary visible application menu bar, the default global activation shortcut, and the existing Window lifecycle.
- **THEN** `Cmd+W/Q` MUST continue to execute recoverable Hide and complete Quit respectively once, only within foreground lensX.
- **THEN** When another application is foreground, lensX MUST NOT intercept that application's editing, close, or quit commands.
- **THEN** Repairing the standard editing chain MUST NOT change unrelated non-editing behavior.
