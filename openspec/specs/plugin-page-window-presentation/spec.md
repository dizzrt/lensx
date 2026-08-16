# Plugin Page Window Presentation

## Purpose

Define bounded author presentation preferences and Host-owned native Window behavior for plugin Pages, including user resize, lifecycle reset, and Child WebView convergence.

## Requirements

### Requirement: Plugin Pages MUST declare only bounded presentation preferences

Manifest `0.4.0` MUST allow each plugin Page to declare an optional strict `presentation` containing required `initial_size.width`, `initial_size.height`, and `resizable`. Width and height MUST be integer logical pixels within the Contract hard bounds of `320..=4096` and `180..=4096`, respectively. An absent presentation MUST normalize to `650×600` and `resizable: false`. The declaration MUST NOT contain position, monitor, minimum or maximum constraints, maximize, fullscreen, z-order, native label, handle, Tauri option, or another Window/WebView configuration.

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

The Host MUST carry only validated Page presentation through Registration detail, Page projection, Page resolution, trusted App Shell state, and a Rust-validated native surface boundary. On Page open, the Host MUST fit the author-selected initial logical size within the current monitor work area while preserving the Contract hard minimum and MUST apply the target size, constraints, and resizable state to the complete native `main` Window. The plugin Runtime MUST NOT submit, override, or receive native bounds, Window handles, work-area facts, setter results, or transition errors.

#### Scenario: Valid custom Page opens on a sufficiently large monitor
- **WHEN** a plugin Page declares `800×600` and `resizable: true` and the current work area can contain it
- **THEN** the Host opens the Page in an `800×600` logical main Window and enables native user resize
- **THEN** the same Page still runs through the ordinary public Child WebView, Session, SDK, and Host API boundaries

#### Scenario: Initial size exceeds current work area
- **WHEN** a valid declared initial size cannot fit inside the current monitor work area
- **THEN** the Host constrains the effective width and height to a fully operable in-work-area shape without changing the Manifest
- **THEN** the Page receives only the resulting ordinary Web viewport and no monitor or clamp diagnostic

#### Scenario: Plugin code requests native resize
- **WHEN** plugin code calls an undeclared Host method, Tauri command, bridge message, or Runtime payload to set size, resizable, position, constraints, maximize, or fullscreen
- **THEN** the normal Host/Runtime boundary rejects or ignores the request with zero native side effect
- **THEN** author-selected presentation remains static metadata rather than executable authority

### Requirement: User resize MUST be opt-in, current-attempt-only, and non-persistent

Only a current plugin Page normalized with `resizable: true` MUST permit the user to resize the native Window through operating-system edges or corners. A Page with `resizable: false`, Home, Search, and every Host Page MUST remain non-resizable. User resize MUST change only the current native Window and current Page attempt; it MUST NOT update Manifest, Registration, preferences, plugin storage, browser storage, package bytes, evidence, or another Page's presentation.

#### Scenario: User resizes an opted-in Page
- **WHEN** a user drags the native boundary of a current `resizable: true` plugin Page within Host constraints
- **THEN** the native Window and Host-owned content slot converge on the new size without Runtime reload, Session replacement, or new authority
- **THEN** the plugin may observe only normal Web viewport and ResizeObserver changes

#### Scenario: User tries to resize a fixed surface
- **WHEN** Home, Search, a Host Page, or a `resizable: false` plugin Page is current
- **THEN** native user resizing remains disabled
- **THEN** the surface retains its Host or Manifest-derived fixed logical size

#### Scenario: Page is closed and reopened
- **WHEN** the user resizes an opted-in Page, truly closes it, and later opens the same Page again
- **THEN** the new attempt starts from the current Manifest initial size fitted to the current work area
- **THEN** the old user-adjusted size is not restored from any persistent or hidden state

### Requirement: Presentation transitions MUST not leak state across surfaces

Semantic hide/restore of an equivalent current Page attempt MUST preserve its current native size and resizable state. Actual Page close, navigation away, disable, replacement, upgrade, uninstall, development reload, explicit retry, fatal Session/Runtime failure, Host reload, App teardown, or process restart MUST terminate that transient state. Transition to Home, Search, or a Host Page MUST immediately apply that Host surface's fixed size and `resizable: false` without waiting for asynchronous Child WebView teardown. Transition between plugin Pages MUST apply the target Page declaration and MUST NOT inherit the previous Page's user size or resizable state.

#### Scenario: Hidden resized Page is restored
- **WHEN** an opted-in Page is user-resized and then hidden/restored through `Cmd+W`, focus loss, and the global shortcut while its attempt remains current
- **THEN** the Host restores the same Page attempt at its current user size with the same resizable state
- **THEN** no Manifest default is replayed and no size is persisted

#### Scenario: Resizable plugin Page closes to Home
- **WHEN** a current resized plugin Page closes while Child WebView destroy is still pending
- **THEN** the complete native Window becomes non-resizable and returns to `650×320` without waiting for destroy completion
- **THEN** Home cannot be resized and does not retain the plugin width, height, constraints, or presentation state

#### Scenario: One plugin Page replaces another
- **WHEN** plugin Page A is user-resized and navigation opens plugin Page B with a different initial size or resizable value
- **THEN** the Host applies B's current validated presentation as a complete transition
- **THEN** A's size and resizable state are terminal and cannot affect B or a later replacement

#### Scenario: Native presentation transition fails
- **WHEN** Window resolution, work-area resolution, size, constraints, resizable, or rollback fails during a transition
- **THEN** the Host retains or restores the last complete safe presentation and returns a stable bounded stage error
- **THEN** it does not leave a resizable Home, a mixed previous/target plugin state, an exposed Child surface, or native diagnostic details

### Requirement: Delivery MUST prove responsive native and Child WebView behavior

Automated Contract, Rust, React, boundary, package, Development Mode, visual, and real target macOS evidence MUST cover default and explicit presentations, hard-bound rejection, work-area fitting, fixed and resizable Pages, user resize bursts, monitor/scale changes, same-attempt hide/restore, actual close/reopen, multi-plugin switching, failure rollback, and immediate Home restoration. Evidence MUST record only bounded sizes, booleans, counts, revisions, and stable stages and MUST NOT contain user content, native handles, absolute monitor coordinates, raw errors, or persistent user size.

#### Scenario: Real macOS Page is resized and closed
- **WHEN** target macOS evidence opens a canonical opted-in plugin Page, user-resizes it, hides/restores it, closes it, and reopens it
- **THEN** bounds converge without reload, hide/restore preserves the same attempt and current size, close restores non-resizable Home, and reopen uses Manifest initial size
- **THEN** evidence proves zero plugin native setter calls and zero persisted user-size state


