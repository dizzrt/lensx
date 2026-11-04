# Plugin Page Window Presentation

## Purpose


Define bounded author presentation preferences and Host-owned native Window
behavior for plugin Pages, including independent instance sizing, user resize,
same-instance detachment, lifecycle reset, and Child WebView convergence.

## Requirements

### Requirement: Plugin Pages MUST declare only bounded presentation preferences

Manifest `0.4.0` MUST allow each plugin Page to declare an optional strict `presentation` containing required `initial_size.width`, `initial_size.height`, and `resizable`.

#### Scenario: Page presentation input is normalized or rejected

- **WHEN** a Manifest supplies or omits Page presentation
- **THEN** Width and height MUST be integer logical pixels within the Contract hard bounds of `320..=4096` and `180..=4096`, respectively.
- **THEN** An absent presentation MUST normalize to `650×600` and `resizable: false`.
- **THEN** The declaration MUST NOT contain position, monitor, minimum or maximum constraints, maximize, fullscreen, z-order, native label, handle, Tauri option, or another Window/WebView configuration.

#### Scenario: Page declares a fixed custom initial size
- **WHEN** a current Manifest Page declares `initial_size: 720×540` and `resizable: false`
- **THEN** TypeScript and Rust normalize the same bounded presentation for that Page
- **THEN** no other Page in the plugin inherits the declaration unless it declares the same values

#### Scenario: Page omits presentation
- **WHEN** a current Manifest Page contains no `presentation`
- **THEN** normalization produces the fixed `650×600` plugin Page default
- **THEN** the omission grants no user or Runtime resize behavior

#### Scenario: Presentation is malformed or out of bounds
- **WHEN** a Page declares a fractional, non-finite, string, null, missing, smaller-than-minimum, larger-than-maximum, unknown, or native Window field
- **THEN** Contract and Host reject the complete Manifest with a stable JSON Pointer diagnostic
- **THEN** no Registration, Page projection, Runtime attempt, native transition, or partial fallback presentation is created

### Requirement: Host MUST own effective plugin Page presentation

Host MUST carry validated Page presentation only through Registration detail, Page projection, Page resolution, trusted App Shell state, and the native validation boundary, applying effective size and resizable state to the current instance's actual owning window; plugins must not select a window or submit native facts.

#### Scenario: The Host applies a Page presentation to its native surface

- **WHEN** a plugin Page opens through the trusted presentation path or plugin code attempts to submit, override, or receive native presentation facts
- **THEN** When a new Page opens, Host MUST fit the author-declared initial logical size within the current monitor work area while preserving the Contract hard minimum; target size, constraints, and resizable state MUST apply to the complete native Window owning that instance. Launcher opens target main; valid navigation within a detached window targets the caller's window.
- **THEN** The plugin Runtime MUST NOT submit, override, or receive native bounds, Window handles, work-area facts, setter results, or transition errors.

#### Scenario: Valid custom Page opens on a sufficiently large monitor
- **WHEN** a plugin Page declares `800×600` and `resizable: true` and the current work area can contain it
- **THEN** Host opens the Page at `800×600` logical size in the complete Window owning that instance and enables native user resize; when opened from the main Launcher, that window is main
- **THEN** the same Page still runs through the ordinary public Child WebView, Session, SDK, and Host API boundaries

#### Scenario: Initial size exceeds current work area
- **WHEN** a valid declared initial size cannot fit inside the current monitor work area
- **THEN** the Host constrains the effective width and height to a fully operable in-work-area shape without changing the Manifest
- **THEN** the Page receives only the resulting ordinary Web viewport and no monitor or clamp diagnostic

#### Scenario: Plugin code requests native resize
- **WHEN** plugin code calls an undeclared Host method, Tauri command, bridge message, or Runtime payload to set size, resizable, position, constraints, maximize, or fullscreen
- **THEN** the normal Host/Runtime boundary rejects or ignores the request with zero native side effect
- **THEN** author-selected presentation remains static metadata rather than executable authority

#### Scenario: Detach a user-resized current Page
- **WHEN** the user resizes the current Page and then detaches it into a separate window
- **THEN** Host transfers the current effective logical size and resizable state, safely fitting them within the target monitor work area
- **THEN** the Manifest initial size is not reapplied, and the same Page's Runtime, Session, and input state remain unchanged

#### Scenario: Fit a detached content size below native window decorations
- **WHEN** detachment fits the effective plugin content size into the target display's work area
- **THEN** Host MUST account for the title bar and system frame when fitting the outer window. It preserves the content dimensions when space permits, otherwise fitting the content to the remaining space. Minimization and entering or leaving native full screen preserve the original instance.

#### Scenario: Confirm the actual macOS content size before publishing presentation
- **WHEN** main or a detached window transitions to a plugin Page with different dimensions or size constraints
- **THEN** Host MUST confirm actual dimensions and constraints in the same coordinate space after native execution and while the owner is current before publishing presentation. Late operations MUST NOT mutate a new owner's window or overwrite current Page feedback.

### Requirement: User resize MUST be opt-in, current-attempt-only, and non-persistent

Host MUST allow user resizing from a window's native edges only when the Page of that window's current instance declares `resizable: true`. `resizable: false`, Home, Search, and Host Pages MUST remain non-resizable. Resizing MUST affect only the instance's owning window and current attempt, and MUST NOT write to the Manifest, Registration, preferences, plugin/browser storage, package, or another instance's presentation state.

#### Scenario: User resizes an opted-in Page
- **WHEN** a user drags the native boundary of a current `resizable: true` plugin Page within Host constraints
- **THEN** the native Window and Host-owned content slot converge on the new size without Runtime reload, Session replacement, or new authority
- **THEN** the plugin may observe only normal Web viewport and ResizeObserver changes

#### Scenario: User tries to resize a fixed surface
- **WHEN** Home, Search, a Host Page, or a `resizable: false` plugin Page is current
- **THEN** dragging the native window edges cannot resize the surface
- **THEN** in windowed mode the surface retains its Host or Manifest-derived fixed logical size. A detached window can still enter and leave native full screen using its green button.

#### Scenario: Page is closed and reopened
- **WHEN** the user resizes an opted-in Page, truly closes it, and later opens the same Page again
- **THEN** the new attempt starts from the current Manifest initial size fitted to the current work area
- **THEN** the old user-adjusted size is not restored from any persistent or hidden state

#### Scenario: Resize one of two identical plugin Pages
- **WHEN** A₁ and A₂ of the same plugin and Page occupy separate windows and the user resizes A₁
- **THEN** only A₁'s native size and slot update; A₂ and main retain their respective sizes
- **THEN** A₁ can retain its current size after detachment; after A₁ truly closes, a new opening starts from the Manifest initial size

### Requirement: Presentation transitions MUST not leak state across surfaces

Hide/restore and Host window detachment of the same valid instance MUST preserve its current native size and resizable state. Presentation state MUST be isolated by instance and current window ownership; main returning to Home must not reset a detached instance.

#### Scenario: The active surface changes or its attempt terminates

- **WHEN** a plugin Page closes, is invalidated, or transitions to another surface
- **THEN** A true Page close, navigation away within its owning window, retry, or fatal failure MUST terminate that instance's temporary size; disable, replacement, upgrade, uninstall, and committed development reload MUST terminate the affected plugin instance state; application-level Host reload, App teardown, or process restart MUST clear all instances. Successful detachment and unmounting the old main presentation MUST NOT terminate the transferred instance's temporary state.
- **THEN** When main transitions to Home, Search, or a Host Page, it MUST immediately apply the corresponding fixed size and `resizable: false`, without waiting for asynchronous old Child cleanup or modifying a detached instance's owning window.
- **THEN** Switching between different plugin Pages on the same surface MUST apply the target Page's declarations and MUST NOT inherit the previous instance's user size or resizable state; successful detachment preserves the same instance and is not such a replacement.

#### Scenario: Hidden resized Page is restored
- **WHEN** an opted-in Page in main has been user-resized and is then hidden/restored through main-window `Cmd+W`, focus loss, and the Launcher entry while its attempt remains valid
- **THEN** the Host restores the same Page attempt at its current user size with the same resizable state
- **THEN** no Manifest default is replayed and no size is persisted

#### Scenario: Resizable plugin Page closes to Home
- **WHEN** a user-resized plugin Page in main truly closes and Child WebView destruction has not yet completed
- **THEN** the complete native Window becomes non-resizable and returns to `650×320` without waiting for destroy completion
- **THEN** Home cannot be resized and does not retain the plugin width, height, constraints, or presentation state
- **THEN** A true detached-window close MUST terminate that window's instance and close the window, without converting it into a detached Home or resetting main

#### Scenario: One plugin Page replaces another
- **WHEN** plugin Page A is user-resized and navigation opens plugin Page B with a different initial size or resizable value
- **THEN** the Host applies B's current validated presentation as a complete transition
- **THEN** A's size and resizable state are terminal and cannot affect B or a later replacement

#### Scenario: Native presentation transition fails
- **WHEN** Window resolution, work-area resolution, size, constraints, resizable, or rollback fails during a transition
- **THEN** for ordinary presentation transitions, Host MUST retain or restore the last complete safe presentation and return a stable bounded stage error; when detachment compensation itself cannot be confirmed, Host MUST retain the same instance and original snapshot in `recovery_required`, without reporting unconfirmed recovery as safe stable presentation
- **THEN** it does not leave a resizable Home, a mixed previous/target plugin state, an exposed Child surface, or native diagnostic details

#### Scenario: Reset main after successful detachment
- **WHEN** resized A₁ detaches successfully and main returns to Home
- **THEN** main immediately returns to `650×320`, becomes non-resizable, and hides; A₁'s detached window retains its effective size
- **THEN** delayed size rollback and resize results from main cannot modify A₁ or a new instance A₂

#### Scenario: Recovery-required state retains the original size snapshot without applying ordinary updates
- **WHEN** native detachment compensation cannot be confirmed and the instance retains its original size, slot, responder, and window snapshot in `recovery_required`
- **THEN** Host MUST freeze ordinary size, visibility, and focus updates for the transaction's source/target, allowing only explicit recovery or termination for the same attempt/token; old updates cannot overwrite the recovery snapshot or affect a replacement instance
- **THEN** explicit recovery retry MUST use the original snapshot rather than Manifest initial values, cleaning up safe targets and unfreezing only after actual restoration is confirmed; another failure retains the state and visible main-window repair entry

### Requirement: Delivery MUST deterministically validate plugin Page presentation

Automated Contract, Rust, React, boundary, package, and Development Mode tests MUST cover default and explicit presentations, hard-bound rejection, modeled work-area fitting, fixed and resizable Pages, resize bursts, monitor/scale state changes, same-attempt hide/restore, close/reopen transitions, multi-plugin switching, failure rollback, and immediate Home restoration.

#### Scenario: Presentation verification respects deterministic boundaries

- **WHEN** maintained Page-presentation validation runs
- **THEN** Maintained validation MUST NOT launch a real Child WebView or native Window, capture visual output, or write target-environment evidence.

#### Scenario: Presentation state matrix passes

- **WHEN** deterministic Contract, Host-controller, React, boundary, and package tests execute the maintained presentation cases
- **THEN** effective bounds, revision convergence, reuse/close semantics, rollback, and non-persistence match the stable product requirements
- **THEN** public plugins expose no native setter, handle, monitor coordinate, or persistent user-size authority

#### Scenario: Native interaction proof is requested

- **WHEN** a completion path requires real resize, focus, hide/restore, close, screenshot, or target macOS evidence
- **THEN** validation governance rejects that path
- **THEN** the environment path is deleted rather than kept as an optional Gate
