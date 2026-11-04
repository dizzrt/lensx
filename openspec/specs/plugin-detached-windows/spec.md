# plugin-detached-windows Specification

## Purpose

Define the observable behavior of detaching the current original plugin instance into a separate window, continuing to use the Launcher, and opening multiple instances of the same plugin, including state continuity, window ownership, independent lifecycles, failure recovery, and closed Host boundaries.

## Requirements

### Requirement: Host MUST detach the existing ready plugin instance without restarting it

Host MUST allow users to detach a ready plugin instance in the main window through the application-local shortcut, defaulting to `Cmd+D`. Successful detachment MUST preserve the same document, Session, SDK, input, results, selection, undo history, Worker, activation sequence, and ongoing tasks; it MUST NOT reload the Page, re-execute the opening Action, or replace migration with copying partial state.

#### Scenario: Detach a working editor or translation instance
- **WHEN** the main-window plugin is ready, the user has edited content, accumulated undo history, or started unfinished tasks, and invokes detachment
- **THEN** the detached window continues presenting the original instance, and task results still reach that instance exactly once
- **THEN** no new Runtime load, SDK bootstrap, Action activation, or business-task replay occurs

#### Scenario: The current surface is not detachable
- **WHEN** the current surface is Home, Search, a Host Page, a loading, failed, or terminated plugin, or an already detached window
- **THEN** the detach shortcut creates or clones no window
- **THEN** original key events not admitted by the Host detach command follow existing Page input rules

#### Scenario: Trusted overlay or composition prevents detachment
- **WHEN** main is covered by Settings, a confirmation dialog, or another trusted modal, shortcut recording is active, or current input-method composition is incomplete
- **THEN** the detach shortcut MUST admit no migration, bypass no current interaction, and neither commit, cancel, nor reconstruct input-method composition
- **THEN** keys continue following the current overlay, recording, or input-method rules; detachment becomes available again only after those conditions clear

#### Scenario: Launcher recovery becomes unavailable
- **WHEN** the Launcher recovery entry has not been confirmed active or recovery capability is lost before migration commits
- **THEN** Host MUST reject or roll back detachment that would hide main; if compensation itself cannot be confirmed, it enters `recovery_required`, preserving the original instance and a visible repair entry without leaving an unrecoverable main window
- **THEN** contention while reading shortcut status MUST NOT be treated as loss of a confirmed recovery entry or as an active recording lease

### Requirement: Successful detachment MUST release the Launcher for independent use

Successful detachment MUST focus the target window, return the main window to fixed-size, non-resizable Home, and then hide it. Summoning the Launcher again MUST restore only the main window and its current entry, without moving, hiding, or activating detached instances.

#### Scenario: Summon Home after detachment
- **WHEN** plugin A₁ has detached and the user invokes the Launcher entry again
- **THEN** the main window shows Home and accepts search input while A₁ retains its window, state, and tasks
- **THEN** restoring the main window must not reattach A₁ or restore the old plugin content slot

#### Scenario: The main window receives a late layout update
- **WHEN** a main-window size, visibility, or focus update issued before detachment completes after detachment commits
- **THEN** the old-owner update must not resize, hide, focus, or destroy the detached instance
- **THEN** the main window continues to follow Home size and hidden state

### Requirement: The same plugin MUST support multiple independent live instances

Host MUST allow multiple detached windows for the same plugin and Page to coexist, and allow the Launcher to open further instances. Plugin/Page identity MUST NOT be a process-wide singleton key; each instance belongs to exactly one hosting window, and each window hosts at most one plugin instance.

#### Scenario: Open and detach the same plugin repeatedly
- **WHEN** the user detaches A₁, summons the Launcher to open the same plugin as A₂, and then detaches A₂
- **THEN** A₁ and A₂ run concurrently, and the main window can still open A₃ or another plugin
- **THEN** opening a new instance neither redirects to an existing detached window nor copies its temporary input or tasks

#### Scenario: Work in two instances of the same Page
- **WHEN** two instances edit different text, run different tasks, or use the same request sequence number
- **THEN** input, results, undo history, request responses, and activation streams remain bound to their respective original instances
- **THEN** closing, failing, or retrying one instance neither replaces nor terminates the other

#### Scenario: Native allocation fails while opening another instance
- **WHEN** Host cannot allocate native resources for a new instance or target window
- **THEN** the new operation returns a bounded failure outcome, records the stage in Host-private diagnostics and leaves existing instances available
- **THEN** Host does not fabricate success by evicting other windows, cloning an old Session, or reusing an old identity

### Requirement: Detached windows MUST have independent foreground window lifecycles

Detached windows MUST remain visible on focus loss; `Cmd+W`, the close control, a native close request, and successful `ui.close` for a detached window MUST terminate only that window's instance. `Cmd+Q` while lensX is foreground MUST clean up all instances and exit the process. The main window MUST retain its existing recoverable-hide semantics.

#### Scenario: Focus moves between plugin windows and other applications
- **WHEN** the user moves focus from a detached window to main, another detached window, or another application
- **THEN** the original detached window neither hides, stops, nor reclaims focus because of focus loss
- **THEN** keyboard and editing operations go only to the current valid focus target

#### Scenario: Close one detached instance
- **WHEN** A₁, A₂, and the main window coexist and the user closes current A₂
- **THEN** A₂'s requests, Session, view, and window are cleaned up once, while A₁ and the main window remain unchanged
- **THEN** no hidden A₂ Runtime remains, and A₂ is not merged back into main

#### Scenario: Quit the application from any lensX window
- **WHEN** the user invokes `Cmd+Q` while lensX is foreground
- **THEN** all plugin instances and uncommitted detach operations enter terminal processing before the application exits
- **THEN** lensX does not intercept W/Q/D keys when another application is foreground

### Requirement: Detachment MUST commit once or preserve the original instance

Detachment MUST transfer ownership once without early release or success. Failure MUST restore the original instance and safe main state before cleaning a target confirmed empty of it; unconfirmed compensation MUST retain both instance and context as `recovery_required`. Neither failure path may reload, replay, reopen, destroy automatically, lose temporary state or report false success. Explicit close, invalidation or exit may terminate; compensation MUST NOT revive.

#### Scenario: Target creation or transfer fails
- **WHEN** target creation, transfer, window ownership, content slot, presentation, or main-window reset fails, compensation can be confirmed successful, and the original instance has not been explicitly terminated
- **THEN** the original instance remains in main and becomes operable again, and the uncommitted target window is cleaned up
- **THEN** retry uses the still-valid original instance, and failure feedback contains no native handle, internal path, or original exception
- **THEN** Host-private developer diagnostics MUST retain the failed step and available substage. An ordinary window failure MUST NOT render a generic Action error, window error banner or status-check button on the plugin Page. Explicit recovery, instance close and Quit remain available when the original instance requires repair.

#### Scenario: Hidden shell subscribes without a revision change
- **WHEN** the hidden trusted shell subscribes successfully and receives the same window revision as its bootstrap snapshot
- **THEN** the shell MUST report its first ready geometry after the current layout commits, without requiring another resize or revision change. Unmounted or superseded subscriptions MUST NOT change the current window state.

#### Scenario: The detach gesture repeats during transfer
- **WHEN** repeated triggers or key auto-repeat arrive before detachment of the same instance finishes
- **THEN** Host starts no second transfer and creates no second instance or window
- **THEN** the admitted operation has only one terminal outcome; the admitted gesture does not also execute as a plugin business shortcut

#### Scenario: Detachment races with terminal invalidation
- **WHEN** detachment interleaves with close, disable, uninstall, upgrade, development reload, or exit
- **THEN** Host determines final ownership and termination scope from the trusted instance and generation, and cleans up at most once
- **THEN** stale completion or rollback must neither restore an invalidated instance nor operate on a newly created replacement

### Requirement: Native compensation failure MUST retain the original instance and provide constrained recovery operations

Unconfirmed compensation MUST enter `recovery_required`, retaining the same WebView, Session, attempt, token and original snapshot. Affected instances/surfaces MUST freeze ownership, navigation replacement and detachment. Host MUST NOT claim success or resolve failure by reload, replay or automatic destruction. Main MUST visibly offer localized explicit recovery, instance close and Quit.

#### Scenario: Compensation itself cannot be confirmed
- **WHEN** after forward detachment fails, compensation restoring parent, frame, responder, registry, navigation, or visibility cannot be confirmed and the original instance has not been explicitly terminated
- **THEN** Host MUST retain the original object, original snapshot, and still-needed windows, enter `recovery_required`, and block ordinary ownership-sensitive updates and repeated D
- **THEN** before readback confirms actual native ownership, Host MUST NOT destroy a target window that may still contain the original WebView; retained windows and context MUST have an explicit recovery or termination owner and must not become unmanaged leaks
- **THEN** main close-to-hide, blur, Toggle, and local `Cmd+W` Hide MUST NOT hide trusted repair and quit entries

#### Scenario: The user explicitly retries recovery of the original instance
- **WHEN** the user chooses retry recovery in the recovery-required state
- **THEN** Host MUST continue compensation using the same attempt/token and original snapshot within a bounded deadline, unfreezing and cleaning up safe targets only after confirming the original main ownership, presentation, and focus
- **THEN** another compensation failure MUST retain `recovery_required` and recovery context, without automatic loops, a new Runtime, input or Action replay, or success reporting
- **THEN** this operation MUST remain distinct from ordinary Runtime Retry that creates a new attempt; successful recovery means only that the original instance was restored and must not be reported as successful detachment

#### Scenario: Recovery-required state receives explicit termination
- **WHEN** explicit instance close, successfully responded valid `ui.close` from that instance, plugin invalidation, or application Quit interleaves with recovery
- **THEN** Host MUST apply the corresponding instance, generation, or application-wide termination scope using the original attempt and current trusted source/lease, releasing its recovery snapshot, transaction, requests, and window resources
- **THEN** late recovery MUST NOT revive a terminated instance, reauthorize an old source, or operate on sibling/replacement instances; public Manifest, SDK, and Host API contracts gain no window permission

### Requirement: Public plugin contracts MUST remain instance-bound without native window authority

Detachment and multiple instances MUST be transparent to plugins that conform to existing public protocols and require no new Manifest permission or declaration. `ui.close` and `actions.open` MUST derive the owning instance and hosting window from the calling Session; plugins MUST NOT specify a window or instance. Global Launcher/Action entry points MUST continue targeting main without broadcasting to all instances of the same plugin.

#### Scenario: A detached plugin navigates through its own Action
- **WHEN** detached A₁ invokes valid `actions.open` for its own plugin
- **THEN** the target resolves within A₁'s owning window; the same Page reuses that instance, and another Page replaces only that window's instance
- **THEN** main and A₂ remain unaffected; foreign-plugin, core, or unavailable Actions remain rejected

#### Scenario: A global Action shortcut opens the same plugin
- **WHEN** A₁ is detached and the user invokes that plugin's global Action shortcut
- **THEN** Host shows main and opens or reuses the current Page there; only the main-window target receives this activation
- **THEN** A₁'s input, tasks, and activation sequence remain unchanged

#### Scenario: Plugin code tries to manage windows
- **WHEN** plugin code submits window/instance fields, native commands, or requests to open its own popup window
- **THEN** existing exact-parameter and native boundaries reject the request; Host detachment grants no generic window or Tauri permission

### Requirement: Shared plugin persistence MUST remain distinct from per-instance working state

`storage.*` for the same plugin MUST continue using the existing plugin-level persistence namespace and atomic-commit rules; multiple instances MUST NOT create separate configuration copies. Each instance's document, Workers, and Page memory MUST remain independent. Detachment MUST NOT persist temporary state or window layout, and application restart MUST NOT automatically restore old instances.

#### Scenario: Two instances read and update plugin settings
- **WHEN** multiple instances of the same plugin read and write the same configuration key through `storage.*`
- **THEN** existing serial-commit and quota semantics continue to apply, and subsequent reads observe committed results
- **THEN** Host promises no additional automatic refresh for plugin Pages that have not initiated a read and does not synchronize their temporary input or results

#### Scenario: Restart after several detached windows existed
- **WHEN** lensX exits and starts again
- **THEN** persisted plugin configuration survives under existing rules; old windows, Sessions, tasks, and temporary editing state are not restored

### Requirement: Detached presentation MUST preserve trusted accessible Host controls

Each detached macOS window MUST have a native title bar with hidden title text and only the standard close, minimize and full-screen buttons. The plugin fills the content area below the title bar. Trusted window metadata and accessible naming remain available. Locale and theme changes MUST update live windows without reloading the plugin.

#### Scenario: Configure detachment in Shortcut Settings and keep the main Page chrome clear
- **WHEN** the user opens a plugin Page in main or inspects the in-app group in Shortcut Settings
- **THEN** main plugin chrome MUST omit the detach control, shortcut hint and their reserved space. Keyboard users can inspect and edit the configured binding in Settings.
- **THEN** detached windows offer no entry point for further detachment or implicit cloning

#### Scenario: Detached window uses standard macOS window controls
- **WHEN** a detached plugin window appears or changes size
- **THEN** its title bar shows only native close, minimize and full-screen buttons, with no visible title, Page context capsule or duplicate close button
- **THEN** minimization preserves the instance and closing terminates only that instance. Content dimensions and bounds refer to the area below the title bar.

#### Scenario: Toggle native full screen on the detached window
- **WHEN** the user clicks the detached window’s green button
- **THEN** that window enters native macOS full screen and its plugin instance stays active
- **THEN** clicking the green button again exits full screen and restores the same window to its previous size

#### Scenario: Change global locale or theme with multiple windows open
- **WHEN** the user changes locale or theme in main-window settings
- **THEN** each trusted window interface and valid Session receives the corresponding current context update while unfinished business tasks continue
- **THEN** invalidated or closed instances receive no later updates, and plugins gain no information about other windows through these updates

### Requirement: Detachment delivery MUST have deterministic cross-layer validation

Delivery MUST validate continuity, isolation, shortcut routing, compensation, retained recovery context, explicit recovery/termination, terminal races and native boundaries. Maintained tests MUST use deterministic state, policy, component, package, static and build checks. They MUST NOT launch a browser, WebView, GUI or native interaction harness, or present model results as actual macOS measurements.

#### Scenario: Verify identity and task continuity
- **WHEN** validation detaches an instance while tasks remain unfinished, its model contains undo history, multiple instances exist, and closes occur concurrently
- **THEN** assertions establish preserved identity and state and exactly-once response delivery without additional load, initialization, or destruction calls, and closing a sibling does not cancel a surviving instance's tasks

#### Scenario: Verify every failure stage and stale completion
- **WHEN** fault injection covers target creation, movement, ownership commit, slot, presentation, main-window reset, and termination races
- **THEN** forward failure with successful compensation returns to the original instance; compensation failure retains managed recovery state, the original object, and necessary windows; explicit termination is not revived, no target lacks an owner, and other instances have no side effects
- **THEN** if an invariant for preserving the original instance, successful compensation, recovery-required safety, or explicit recovery/termination cannot be established, delivery remains incomplete; neither reloading nor false success reporting may substitute
