# Spec Delta

## MODIFIED Requirements

### Requirement: The default global shortcut must toggle the launcher

The system MUST default to `Ctrl+Shift+Space` without configuration, allow one confirmed selected chord or modifier double tap, and use unified `toggle` for ordinary activation. Action entries MUST `show` before execution. Releases, repeat presses, and unknown bindings MUST NOT execute another window action; double taps MUST execute once only after full `launcher-shortcuts` confirmation.

#### Scenario: Press the default shortcut from the hidden state

- **WHEN** the main window is invisible and the user presses
  `Ctrl+Shift+Space`
- **AND** the selected Launcher trigger is the default chord
- **THEN** the system executes `toggle`
- **THEN** the main window appears and requests focus

#### Scenario: Press the default shortcut from the visible state

- **WHEN** the main window is visible and the user presses `Ctrl+Shift+Space`
- **AND** the selected Launcher trigger is the default chord
- **THEN** the system executes `toggle`
- **THEN** the main window hides and the application continues running

#### Scenario: Release the default shortcut

- **WHEN** the system receives a release event for `Ctrl+Shift+Space`
- **THEN** the system does not execute another launcher window action

#### Scenario: Default shortcut registration fails

- **WHEN** an interactive session confirms registration failure for the selected Launcher chord or failure to observe the selected double tap once recovery is eligible
- **THEN** the system reports a diagnosable error containing the binding and
  failure reason
- **THEN** the system keeps the main window visible and permits ordinary window
  closing behavior
- **THEN** the system does not enable close-to-hide or focus-loss hiding that
  could make the window permanently unreachable through configured paths

#### Scenario: Use a customized ordinary Launcher entry
- **WHEN** a user saves a replacement selected Launcher trigger or that trigger is invoked with its confirmed chord/double-tap semantics
- **THEN** the current entry uses unified Toggle to show a hidden window or hide a visible one, executing at most once per independent valid trigger
- **THEN** only the selected trigger remains configured; saving a type switch disables the previous trigger without retaining a hidden fallback
- **THEN** ordinary Launcher activation neither executes the current Action nor marks a subsequently selected Action as shortcut-sourced

#### Scenario: Use a dedicated Action shortcut
- **WHEN** a current valid dedicated Action chord is pressed or its double tap is confirmed
- **THEN** the system activates the complete window with Show before submitting the target to the unified Action invocation boundary
- **THEN** an already visible window does not Toggle or hide, and failed Show does not report the Action as executed

#### Scenario: Fail to change the recovery entry during execution
- **WHEN** shortcut persistence, native unregistration, or compensation fails
- **THEN** window recoverability depends only on the selected trigger being active, not old disk values or an unauthorized double tap
- **THEN** when recovery cannot be confirmed, the system retains visible repair and exit paths and stops actions that could hide the window without recovery

### Requirement: A recoverable launcher must hide on close and focus loss

With confirmed recovery, main close and blur MUST use unified Hide. A confirmed entry fault, degraded compensation or `recovery_required` MUST keep repair and quit reachable and block unrecoverable main Hide on close, blur, Toggle or `Cmd+W`. Lock, sleep and input recovery alone MUST NOT show or focus a running macOS Launcher. Detached windows MUST stay visible on blur. Closing a detached window or pressing `Cmd+W` there MUST terminate only its instance.

#### Scenario: Close a ready launcher window

- **WHEN** the selected Launcher trigger is confirmed active
- **AND** the user requests that the main window close
- **THEN** the system prevents the default close behavior
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the application process continues running

#### Scenario: Press Cmd+W in a ready macOS launcher

- **WHEN** the selected Launcher trigger is confirmed active
- **AND** the macOS `main` Window is visible and is the actual key Window, with lensX as the foreground application
- **AND** the user presses `Cmd+W`
- **THEN** exactly one application-local menu shortcut entry point handles the
  key press
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the main window is not destroyed and the application process
  continues running

#### Scenario: Press Cmd+W while a plugin Child WebView is visible

- **WHEN** the foreground macOS Launcher's actual key Window is `main`, containing a visible current plugin Child WebView
- **AND** the user presses `Cmd+W`
- **THEN** the unified action resolves and hides the complete native Window and
  current Child WebView as one semantic transition
- **THEN** the Host page chrome and plugin content are both absent from the
  screen while the process and same Runtime attempt continue
- **THEN** the Launcher does not remain visible with an empty plugin content
  region

#### Scenario: Restore the launcher after Cmd+W

- **WHEN** the macOS main window has been hidden by `Cmd+W`
- **AND** the user triggers the currently valid ordinary Launcher entry
- **THEN** the system shows and focuses the main window through the unified
  action boundary
- **THEN** the existing typed activation event restores focus according to the
  Host-owned page/input policy

#### Scenario: Restore a plugin page after Cmd+W

- **WHEN** `Cmd+W` semantically hid a Launcher with an equivalent current
  plugin attempt
- **AND** the user restores the Launcher through the currently valid ordinary entry
- **THEN** the complete native Window is shown before the same Child WebView is
  shown and focused
- **THEN** the plugin document, Session, model, and Worker are reused without a
  fresh loading cycle

#### Scenario: Default recovery shortcut is unavailable on macOS

- **WHEN** the selected Launcher entry is unavailable because registration or monitoring fails
- **AND** the user presses `Cmd+W` while the actual key Window is `main`
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

- **WHEN** the selected Launcher trigger is confirmed active
- **AND** the visible main window loses focus
- **THEN** the system hides the complete native main Window and current Child
  WebView through the unified action boundary
- **THEN** the user can restore the complete window and the same equivalent Runtime attempt through the currently valid ordinary Launcher entry

#### Scenario: Route ready close and blur events to recoverable hide
- **WHEN** the selected Launcher entry is active and the main Window receives a close or focus-loss event
- **THEN** On macOS, the system MUST provide exactly one application-local `Cmd+W` window-close shortcut entry point.
- **THEN** When the undecorated main window cannot produce a close event through the native close command, that entry point MUST still route to `hide` through the unified action boundary.
- **THEN** The system MUST NOT register `Cmd+W` as a system-wide global shortcut.
- **THEN** The system MUST route main-window focus loss to `hide`.
- **THEN** Window events emitted after a system-initiated hide MUST NOT cause an action loop or terminate the application.

#### Scenario: Handle unavailable local close routing
- **WHEN** the Host installs or executes the application-local macOS close shortcut
- **THEN** the application-local macOS `Cmd+W` hide entry MUST be enabled only while the current selected Launcher trigger is confirmed active.
- **THEN** If menu-event installation or routing fails, or if the hide operation fails, the system MUST make failure information available for developer diagnosis, MUST NOT expose native error details to the user, and MUST NOT terminate the application process because of the failure.

#### Scenario: Coordinate Child and native parent hide or restore
- **WHEN** Host hides or restores the Launcher main window containing a current Child WebView
- **THEN** When a current Child WebView exists, the hide boundary MUST resolve the complete native main Window before changing Child presentation.
- **THEN** It MUST hide the Child WebView before the native parent to prevent overlay leakage, and MUST either hide both surfaces or restore the still-current Child presentation when native parent hide fails.
- **THEN** A failed hide MUST NOT leave the Host window visible with only the plugin content blank.
- **THEN** Restore MUST show and focus the native parent before restoring and focusing the same current Child WebView.

#### Scenario: Retain double-tap configuration while input monitoring is unavailable
- **WHEN** an interactive session confirms missing permission or monitor failure for the selected Launcher double tap, or an eligible rebuild actually fails
- **THEN** that configuration alone does not establish safe recoverable hiding
- **THEN** the Host MUST show a hidden main window with repair and quit accessible. Close, blur and local `Cmd+W` MUST NOT hide it until the selected entry recovers.
- **THEN** no former or default chord is silently registered as a fallback, and monitoring recovery starts with cleared gesture candidates

#### Scenario: A detached window loses focus or closes
- **WHEN** a detached plugin window loses focus or the user requests that window's closure
- **THEN** focus loss MUST preserve the window, instance, input, and running tasks, without invoking Launcher Hide or reclaiming focus
- **THEN** closing MUST terminate only that window's corresponding instance and its Session, requests, and Workers; main and sibling windows MUST retain their existing lifecycles
- **THEN** even if the Launcher recovery shortcut is unavailable, closing a detached window MUST NOT become hiding, mistakenly close main, or exit the entire process

#### Scenario: Detachment commit interleaves with main-window focus loss
- **WHEN** detachment commit, detached-window focus, and main-window blur/Hide events interleave
- **THEN** main-window Hide MUST affect only content main still owns and must not hide, destroy, or refocus an instance whose migration has committed
- **THEN** an uncommitted migration MUST continue coordinating main-window visibility and failure rollback through its transaction; blur must not leave an empty shell, duplicate visibility, or an instance with no owner

#### Scenario: A hidden main window stays hidden across lock, sleep and unlock

- **WHEN** the running macOS main window is hidden and the user locks and unlocks the session, or sleeps the system, wakes it and unlocks later
- **THEN** without a new summon or confirmed current entry fault, the main window and plugin content MUST remain hidden throughout. The Host MUST NOT activate the app, request keyboard focus or execute an Action.
- **THEN** these notifications MUST NOT reactivate or reclaim focus for an already visible main window. Detached windows retain their own blur and close behavior.

#### Scenario: An ordinary summon restores the previous content

- **WHEN** the user returns to an interactive session and uses the recovered ordinary Launcher shortcut to summon the hidden window
- **THEN** Home MUST return to Home. A valid current Translation Page MUST restore the same instance, input and result, with focus restored under the existing policy.
- **THEN** the summon MUST NOT execute a plugin Action, recreate the plugin or issue another translation request by showing the window

#### Scenario: A stale repair request reaches the main thread

- **WHEN** a repair request reaches the main thread after lock, renewed sleep, configuration or session replacement, entry recovery, or the start of Host shutdown
- **THEN** the stale request MUST NOT show the window, activate the app, restore a Child or change focus. A later independent fault MUST be evaluated against the state at that time.

#### Scenario: A persistent entry fault requires repair in the current interactive session

- **WHEN** the user has returned to an interactive session, a recheck confirms failure of the sole Launcher entry and the main window is hidden
- **THEN** the Host MUST show the main window once to make shortcut repair and quit reachable. An already visible window MUST retain both entries.
- **THEN** repeat notifications for the same continuous fault MUST NOT reclaim focus. A healthy recheck MUST leave a hidden window hidden.

#### Scenario: The user explicitly reopens a running app with a pending repair

- **WHEN** the sole Launcher entry has failed, the main window is hidden and the user explicitly reopens the running lensX app from the desktop, for example through Finder
- **THEN** after rechecking the fault and confirming that all known interruptions have cleared, the Host MUST make repair and quit accessible even without a new ordinary desktop app activation or a press of the failed shortcut
- **THEN** this repair MUST NOT execute a plugin Action. A healthy session or wake alone MUST NOT trigger this repair display.

### Requirement: Accessory Launcher MUST retain application-local close and quit shortcuts

macOS accessory mode MUST retain one local entry each for `Cmd+W` and `Cmd+Q`. W MUST use the actual key Window for recoverable main Hide or detached Close; Q MUST clean all instances and exit. Both MUST require valid native events with lensX foreground, without global registration, cached-focus authority or effects on other applications.

#### Scenario: Press Cmd+W without a visible application menu bar

- **WHEN** accessory lensX's `main` Window is visible and is the actual key Window, without an ordinary application menu bar
- **AND** the user presses `Cmd+W`
- **THEN** exactly one application-local entry point hides the complete Launcher
  through the unified Hide action
- **THEN** the process and currently confirmed effective selected Launcher trigger continue running

#### Scenario: Press Cmd+Q without a visible application menu bar

- **WHEN** accessory lensX's main window or any detached plugin window is visible and is the actual key Window, without an ordinary application menu bar
- **AND** the user presses `Cmd+Q`
- **THEN** exactly one application-local entry point requests lensX exit
- **THEN** application teardown MUST terminate all main-window and detached-window instances and Host resources before process exit, and cancel all Sessions, ongoing requests, subscriptions, and Workers

#### Scenario: Another application owns the foreground

- **WHEN** another application is the macOS foreground application
- **AND** the user presses `Cmd+W` or `Cmd+Q` in that application
- **THEN** lensX does not hide, exit, or consume the corresponding key event
- **THEN** the foreground application retains its own local shortcut behavior

#### Scenario: Recovery shortcut registration fails

- **WHEN** an interactive session confirms failure of the selected Launcher entry, or registration or compensation failures leave recovery unconfirmed
- **THEN** the system MUST NOT enable main-window `Cmd+W` Hide or focus-loss Hide that would make the Launcher unrecoverable; true detached-window Close and application-wide Quit MUST remain available
- **THEN** the visible Window retains an exit path and the system does not leave
  a hidden process without a Dock tile or recovery entry point

#### Scenario: Dispatch local close and quit only for foreground lensX
- **WHEN** the user invokes Cmd+W or Cmd+Q while the accessory application has no ordinary visible menu bar
- **THEN** `Cmd+W` MUST revalidate the actual key Window and instance ownership; main follows recoverable Hide, a detached window closes only its corresponding instance, and an unknown or invalid window target must not be misrouted to main-window Hide.
- **THEN** `Cmd+Q` MUST perform application-wide teardown and clean up every window instance before terminating the lensX process.
- **THEN** Both entry points MUST handle keys only while lensX is the foreground application, MUST NOT be registered as system-wide global shortcuts, and MUST NOT intercept the corresponding commands for another foreground application.

#### Scenario: Cmd+W in a detached plugin window
- **WHEN** lensX is foreground, the actual key Window is a detached plugin window, and the user presses `Cmd+W` in its Host chrome or Child input
- **THEN** the system MUST admit that instance's true close only once and destroy its window and Runtime, without hiding main or terminating other instances or the application
- **THEN** the current instance's `ui.close` and native window-close button MUST converge on the same instance-termination semantics

#### Scenario: Native focus changes and duplicate local command delivery
- **WHEN** native `Cmd+W/Q` delivery, menu routing, key repeat, or queued handling interleaves with window changes
- **THEN** each admitted original gesture MUST execute its corresponding Close/Hide/Quit at most once, without a second operation caused by duplicate entry points or key repeat
- **THEN** the command MUST bind to the trusted actual event Window and key Window at admission; after target invalidation it must not close the newly focused window or hide main as a fallback
- **THEN** when lensX is not foreground, it MUST preserve the original event and execute no local Close/Hide/Quit
