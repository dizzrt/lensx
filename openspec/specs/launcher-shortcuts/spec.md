# Launcher Shortcuts Specification

## Purpose


Define user-owned global Launcher and Action shortcuts and the application-local
plugin-detachment chord, including canonical conflicts, reserved-key protection,
recording, migration, confirmed persistence, precise native routing, and recovery.

## Requirements

### Requirement: Shortcut bindings MUST have explicit targets and supported trigger kinds

Host MUST support global chords or single-modifier double taps for Launcher and stable Action IDs. Launcher MUST have one trigger (default `Ctrl+Shift+Space`); type changes disable the old entry without fallback. Each Action has at most one clearable binding. Configuration v3 MUST add nullable application-local `detach` (default `Cmd+D`), never a global registration, Action target or public plugin capability.

#### Scenario: First launch and existing-user migration
- **WHEN** no shortcut configuration exists
- **THEN** configuration v3 MUST contain Launcher chord `Ctrl+Shift+Space`, empty Action bindings, and application-local `detach` chord `Cmd+D`
- **THEN** theme, locale, plugin configuration, and existing collections remain unchanged

#### Scenario: Configure a supported double tap
- **WHEN** the user chooses a modifier double tap
- **THEN** the choices are `Cmd`, `Ctrl`, `Option`, and `Shift`, without separate left/right bindings
- **THEN** triple taps, character or chord double taps, single modifier presses, and macros are rejected

#### Scenario: Remove or replace a binding
- **WHEN** the user clears an Action binding or replaces the selected Launcher trigger
- **THEN** a cleared Action binding becomes inactive; a Launcher replacement leaves only the newly confirmed selected trigger configured
- **THEN** clearing the sole Launcher trigger is rejected, and replacing either kind requires complete save validation

#### Scenario: Validate a chord
- **WHEN** a chord configuration is submitted
- **THEN** it contains one supported primary key and at least one of `Cmd`, `Ctrl`, or `Option`, with optional `Shift`
- **THEN** bare characters, Shift-only character combinations, missing or multiple primary keys, unknown keys, and extra fields are rejected

#### Scenario: Change or clear the detach shortcut
- **WHEN** the user saves a supported chord for the detach command or clears its binding in settings
- **THEN** after complete validation and confirmed persistence, the system MUST enable only the new chord, or save `detach` as `null` and disable the shortcut entry
- **THEN** clearing the detach shortcut MUST disable shortcut detachment and preserve the Launcher recovery entry and existing Action bindings
- **THEN** the detach target MUST NOT accept modifier double taps, bare characters, macros, multiple primary keys, or extra fields

### Requirement: Canonical shortcut identity MUST be unique across all configured targets

Launcher, Action and non-null `detach` bindings MUST share canonical uniqueness regardless of execution scope, modifier order, case or aliases. Unavailable Actions MUST reserve their trigger and ID until cleared. Migration conflicts with default detach MUST preserve the old global binding and set `detach` to `null`, never configuring two targets for one chord.

#### Scenario: Equivalent spellings identify one chord
- **WHEN** two targets submit equivalent `Cmd+Shift+K` and `Shift+Command+k` combinations
- **THEN** the later change is rejected and identifies the target already using that chord
- **THEN** existing configuration and effective bindings remain unchanged

#### Scenario: Launcher and Action request the same double tap
- **WHEN** the launcher is bound to double Cmd and an Action requests double Cmd
- **THEN** the duplicate is rejected; left and right Cmd do not bypass uniqueness

#### Scenario: Edit an existing binding
- **WHEN** the user saves the same canonical binding for the same target in current v3 configuration with no unresolved migration
- **THEN** the system treats it as unchanged, without a self-conflict or repeated registration

#### Scenario: Conflicts between detach and global bindings in either direction
- **WHEN** the user saves the detach shortcut as a canonical chord already occupied by the Launcher or a retained Action, or saves a global binding as the current detach chord
- **THEN** the save MUST be rejected, and readable bilingual feedback MUST identify the occupying target
- **THEN** existing configuration and effective bindings MUST remain unchanged; the system MUST NOT bypass uniqueness based on scope, current plugin availability, or window visibility

### Requirement: Reserved operating-system and common editing shortcuts MUST be rejected

The final save boundary MUST reject the maintained macOS reserved combinations without user or plugin bypass. Protection MUST include explicit close, quit, hide, minimize, editing, application switching, input source, system search, screenshot, lock, logout, force-quit, and accessibility-panel combinations. Unknown OS registration failures MUST NOT be misreported as occupation by a known application.

#### Scenario: Reject close quit and editing combinations
- **WHEN** a candidate is `Cmd+W/Q/H/M/A/C/X/V/Z`, `Cmd+Shift+W/Q/Z/V`, `Cmd+Option+W/H/M`, or `Cmd+Option+Shift+V/Q`
- **THEN** saving is rejected with a localized reserved reason and existing bindings remain unchanged

#### Scenario: Reject system combinations
- **WHEN** a candidate is `Cmd+Tab`, `Cmd+Shift+Tab`, Cmd plus backquote or its Shift variant, `Cmd+Space`, `Cmd+Option+Space`, `Ctrl+Space`, `Ctrl+Option+Space`, `Ctrl+Cmd+Q/F`, `Cmd+Option+Esc`, `Cmd+Option+F5`, `Ctrl+F2/F3`, `Ctrl+Left/Right/Up/Down`, or `Cmd+Shift+3/4/5/6` and their Ctrl screenshot variants
- **THEN** the binding is rejected without native registration

#### Scenario: Use an ordinary chord during a double tap
- **WHEN** `Cmd+C`, `Cmd+Q`, or another keyboard or mouse-button operation occurs during a candidate double tap
- **THEN** the candidate is cancelled and the original event retains its ordinary system or foreground application behavior
- **THEN** lensX does not protect its bindings by consuming, synthesizing, or replaying events

#### Scenario: External shortcut detection boundary
- **WHEN** settings report internal validation or native registration results
- **THEN** they claim only lensX internal uniqueness, compliance with the explicit reserved table, and the current registration result
- **THEN** they do not claim to enumerate all other applications' shortcuts, provide OS-exclusive double taps, or identify an occupying application without evidence

### Requirement: Modifier double taps MUST use bounded complete presses and quiet confirmation

A double tap MUST comprise two complete presses and releases of the same physical modifier. Each hold MUST last at most 200ms and the first release to second press gap at most 300ms. After the second release, the system MUST wait for 300ms of quiet confirmation. A third press during that interval MUST cancel the entire candidate without a triple-tap action.

#### Scenario: Confirm a valid double tap
- **WHEN** the same physical Cmd key completes two presses within the limits followed by 300ms without interference
- **THEN** the bound target executes once
- **THEN** Option, Ctrl, and Shift use the same counting and confirmation rules

#### Scenario: Mixed sides or long holds
- **WHEN** the two presses use different left/right keys of the same modifier, overlap two keys, hold longer than 200ms, or generate repeat events
- **THEN** no valid double tap forms and repeat events do not increment the tap count

#### Scenario: Three or more consecutive presses
- **WHEN** a third press arrives during confirmation, including five consecutive Shift or Option presses within the defined window
- **THEN** no lensX binding fires and a new gesture is accepted only after all keys are released and another 300ms of quiet
- **THEN** the third and fourth presses are not recombined into a sliding pair and original system events still propagate

#### Scenario: Time boundaries and interruptions
- **WHEN** an input arrives exactly at the confirmation deadline or permission, monitoring, recording, sleep, or configuration state changes
- **THEN** same-timestamp input takes precedence over confirmation; interruption clears candidates and timers without later replay
- **THEN** timing is monotonic and system clock adjustments cannot trigger gestures

#### Scenario: Pointer interference boundary
- **WHEN** a mouse button or wheel operation occurs during the candidate or confirmation interval
- **THEN** the candidate is cancelled while the original operation is preserved; pointer movement alone does not cancel it

### Requirement: Double-tap availability MUST reflect native monitoring authorization

The system MUST execute double taps only while passive monitoring is authorized and available. Settings MUST distinguish authorization missing, monitor unavailable, and active states. This authorization belongs to Host native integration, not plugin permissions or SDK capabilities. Monitoring MUST NOT store or transmit raw input content to plugins.

#### Scenario: Monitoring is not authorized
- **WHEN** the user configures a double tap while monitoring authorization is unavailable
- **THEN** it may be saved as inactive with explicit authorization status and a user-initiated authorization entry
- **THEN** the system does not claim it is active or request monitoring authorization during ordinary startup or chord configuration
- **THEN** an unavailable Action double tap does not disable an otherwise active Launcher; if the selected Launcher is that unavailable double tap, the window stays visible for repair or quit without secretly enabling another chord

#### Scenario: Authorization revoked or monitoring interrupted
- **WHEN** monitoring fails, the system disables it, or current input cannot be observed reliably
- **THEN** all candidates are cleared, bindings show unavailable or suspended, and observation resumes from a new sequence
- **THEN** when the sole Launcher double tap becomes unavailable, even a hidden window is shown and unrecoverable hiding is disabled until the selected entry is active again
- **THEN** the system does not bypass Secure Input or disable another application's system protection

### Requirement: Shortcut persistence MUST report confirmed state and compensating failures

Rust MUST serialize validation, global registration, local detach updates and versioned persistence. Success MUST return confirmed config/status: available global chords registered; unauthorized double taps or unavailable Actions explicitly inactive. Detach MUST use only local execution, without global registration or Input Monitoring. Failures MUST be safe; failed compensation MUST report degradation. The old file alone cannot prove recovery.

#### Scenario: Successfully change the recovery chord
- **WHEN** a new chord is valid and registrable, the old chord can be released, and configuration can be written completely
- **THEN** the new chord becomes active, the old one becomes inactive, and restart loads the same configuration
- **THEN** concurrent theme or locale writes do not overwrite shortcuts

#### Scenario: New registration or storage fails
- **WHEN** new chord registration or configuration commit fails
- **THEN** the system compensates uncommitted effects and retains the confirmed recoverable original configuration and bindings
- **THEN** the UI reports failure and does not display an uncommitted candidate as active

#### Scenario: Unregistration or compensation also fails
- **WHEN** release of an old binding or recovery through the selected Launcher trigger cannot be confirmed
- **THEN** the system shows degradation, keeps repair and quit accessible in a visible window, and stops hiding that would make the window unrecoverable
- **THEN** residual native occupation is not falsely displayed as released

#### Scenario: Damaged configuration and concurrent saves
- **WHEN** startup reads an invalid version, duplicate/reserved bindings, or damaged file, or a write carries a stale revision
- **THEN** invalid configuration is neither executed nor silently overwritten; startup uses a registration-confirmed default recovery entry and reports diagnostics
- **THEN** stale writes are rejected and the caller rereads the confirmed snapshot

#### Scenario: A valid custom recovery chord cannot register at startup
- **WHEN** the selected Launcher chord in valid configuration cannot register in the current startup
- **THEN** configuration is retained, repair and quit remain visible, and unrecoverable hiding is disabled
- **THEN** the system does not automatically register or retarget the default chord, even when that chord is validly assigned to an Action

#### Scenario: Application-local detach configuration commit fails
- **WHEN** detach-chord validation, application-local execution-boundary update, or configuration commit fails
- **THEN** the system MUST compensate uncommitted effects, retain or reconfirm the original configuration, and must not display the candidate chord as effective
- **THEN** an unavailable detach entry MUST NOT be misreported as another application occupying the chord, missing Input Monitoring authorization, or loss of Launcher recovery
- **THEN** currently effective global Launcher/Action bindings MUST retain their existing state; unconfirmed local detach state MUST be shown explicitly without silently substituting another shortcut

### Requirement: Shortcut recording MUST suspend target execution with bounded native ownership

Recording MUST retain global registrations but suspend all configurable targets, including detach, under a bounded Host lease. Cancel, recording-window blur/hide, Host loss, exit or expiry MUST revoke it natively without frontend cleanup. Reserved close/quit MUST still use actual focus to select main Hide, detached Close or application Quit.

#### Scenario: Record an already-bound shortcut
- **WHEN** the user records an already-bound chord
- **THEN** it only supplies a candidate, without launcher/Action execution or losing candidate feedback because the chord is registered
- **THEN** bare Escape cancels recording and modified Escape follows ordinary candidate rules

#### Scenario: The recording page is invalidated or closed
- **WHEN** the user presses Cmd+W/Q, the window blurs or hides, the recording page/Host is invalidated, or the recording session expires
- **THEN** the native boundary revokes recording and clears candidates while reserved commands execute their existing foreground semantics
- **THEN** configured execution resumes after current keys are released, without replaying old candidates or ending events

#### Scenario: Record the current detach chord
- **WHEN** the user presses the currently configured detach chord in a valid shortcut-recording session
- **THEN** the gesture MUST produce only candidate feedback, without detaching the current instance or triggering a global target with the same chord
- **THEN** after recording is cancelled, completed, or invalidated, configured execution MUST wait until current keys are released before resuming, without replaying old keys or ending events
- **THEN** application-local chord recording MUST NOT require system-wide monitoring authorization

### Requirement: Action shortcut delivery MUST use current targets and bounded invocation handling

A dedicated shortcut MUST show and activate lensX, then execute the current available target through the unified Action entry with `shortcut` provenance. Each independent accepted trigger MUST have a unique invocation identifier. Repeated native events MUST NOT duplicate invocation. Initialization requests MUST be bounded and admission failures MUST be reported.

#### Scenario: Execute an already-open Action
- **WHEN** the user triggers the current Page's dedicated Action shortcut again
- **THEN** the Page receives focus and a new invocation while its Runtime, input, and business state remain
- **THEN** the system does not Toggle, hide the window, or remount the Page

#### Scenario: Select an Action after ordinary launcher activation
- **WHEN** the user opens lensX with the launcher chord or double tap and then manually selects an Action
- **THEN** that Action uses `normal` provenance without inheriting the window activation reason

#### Scenario: Target unavailability and recovery
- **WHEN** a plugin is disabled, uninstalled, incompatible, or withdraws its Action
- **THEN** the user binding is retained as unavailable while its native chord registration or double-tap execution mapping is released
- **THEN** return of the same stable ID revalidates and attempts activation; external registration failure leaves it inactive
- **THEN** every execution checks the current Action and Page without using a stale executor

#### Scenario: Native repeats and overload
- **WHEN** holding a chord generates repeated presses, an event is delivered repeatedly, or initialization waits exceed capacity
- **THEN** one physical press or invocation identifier executes at most once; a fresh press after release can create a new invocation
- **THEN** overload reports an explicit busy failure without silently dropping accepted calls or creating an unbounded queue

### Requirement: Versioned Launcher migration MUST preserve unresolved user choice

V3 MUST retain one `launcher` trigger, original Action bindings and nullable detach. Reading v1/v2 MUST preserve files and global bindings. One v1 chord projects losslessly; two Launcher entries MUST retain both choices and the file, require explicit selection and keep main visible. Default detach MUST pass conflict validation. Migration and later writes MUST NOT silently choose, override or discard old bindings.

#### Scenario: Read and save a chord-only v1 file
- **WHEN** the existing v1 file contains a chord and no Launcher double tap
- **THEN** Host MUST preserve the same chord and Action bindings in the v3 projection and populate `detach` according to the detach-default migration rules, without rewriting the file on read
- **THEN** a later explicit successful save MUST commit v3 even when existing global-binding semantics are unchanged

#### Scenario: Resolve a v1 file with two Launcher entries
- **WHEN** a valid v1 file contains both a chord and a Launcher double tap
- **THEN** the snapshot exposes `launcher_migration` with both validated choices and the Launcher as degraded, with no active Launcher trigger or automatic fallback
- **THEN** the window remains visible and settings require a type selection and explicit save before allowing other configuration writes
- **THEN** only the selected entry MUST be committed as the v3 Launcher and activated according to actual availability; the other entry MUST NOT remain as a hidden shortcut

#### Scenario: A migration commit fails or has an uncertain result
- **WHEN** an explicit migration save fails
- **THEN** the original file and unresolved choice MUST be preserved unless rereading storage confirms that the candidate v3 configuration committed
- **THEN** a confirmed v3 commit MUST clear resolved migration facts even if the operation must still report an I/O failure; unconfirmed storage MUST retain the corresponding unresolved state, and an unresolved Launcher choice continues to imply degraded recovery

#### Scenario: Restore defaults during unresolved migration
- **WHEN** the user explicitly confirms restoring shortcut defaults
- **THEN** the same full transaction may resolve migration with the default Launcher chord while preserving all existing Action bindings
- **THEN** an Action occupying the default chord causes a conflict instead of being removed or reassigned
- **THEN** failure retains confirmed state and never claims completion

#### Scenario: Migrate v2 when the default detach chord is unoccupied
- **WHEN** no Launcher or retained Action in valid v2 configuration uses canonical `Cmd+D`
- **THEN** the v3 projection MUST fully preserve the old revision and Launcher and Action bindings, setting `detach` to application-local `Cmd+D`
- **THEN** the system MUST NOT rewrite the old file on read; only a later explicit successful save commits v3

#### Scenario: The default detach chord conflicts with an existing global binding
- **WHEN** the Launcher, a retained Action, or an unresolved valid Launcher choice in valid v1/v2 configuration already occupies canonical `Cmd+D`
- **THEN** the system MUST preserve the old binding and its previously confirmable effective state, project `detach` as `null`, and show actionable feedback identifying the specific target conflicting with the detach default
- **THEN** the system MUST NOT delete, reassign, or suspend the original global binding, enable a substitute detach chord, or treat valid old configuration as damaged and fall back
- **THEN** the user MUST be able to explicitly select an unoccupied detach chord or confirm leaving the detach shortcut disabled; unresolved feedback MUST NOT silently disappear after an unrelated save
- **THEN** a conflict involving only the detach default MUST NOT degrade a still-valid Launcher recovery entry; existing unresolved v1 dual-entry rules continue to apply

#### Scenario: Restore the detach default
- **WHEN** the user explicitly restores the detach shortcut to `Cmd+D`
- **THEN** the system MUST revalidate conflicts through the same complete transaction, preserving all confirmed bindings and identifying the occupying target on conflict
- **THEN** the existing operation that restores only the Launcher system shortcut MUST NOT reset detach or delete Action bindings

### Requirement: The application-local detach shortcut MUST execute only in a trusted eligible main window

Detach MUST require foreground lensX, actual main key Window and its ready detachable instance. Modal overlays, recording, IME composition, unconfirmed Launcher recovery or `recovery_required` MUST block admission. Native window/current-instance facts MUST select the target, never plugin, DOM or shortcut claims. Host MUST consume eligible gestures before plugin handling; other apps and ineligible windows retain native events.

#### Scenario: Detach while the Child WebView has focus
- **WHEN** the current main-window plugin is ready and meets every detach condition, no trusted modal, recording, or incomplete input-method composition exists, Host chrome or that instance's Child WebView holds current valid focus, and the user presses the configured detach chord
- **THEN** Host MUST submit one detach operation for the current instance and consume the original key event once; the plugin must not also handle that gesture
- **THEN** default `Cmd+D` MUST give the user-selected Host detach semantics priority over Monaco or other plugin functions on the same chord
- **THEN** the operation MUST NOT depend on React DOM receiving Child keyboard events, and must require neither a plugin SDK update nor additional authorization

#### Scenario: Pass through events in ineligible states
- **WHEN** a new physical key gesture not yet taken over by Host arrives while another application is foreground, actual focus is in Home, Search, a Host Page, a detached plugin window, an invalidated or unready instance, or no valid `detach` binding exists
- **THEN** the detach command MUST NOT execute, activate, or focus any window, and MUST preserve normal propagation of the original event
- **THEN** `Cmd+D` in a detached plugin window MUST remain available for the plugin's own keyboard semantics, without cloning or detaching the instance again

#### Scenario: Repeated events and reentrant detachment
- **WHEN** a physical key gesture produces auto-repeat or duplicate delivery, or another detach request arrives before the same instance's detach transaction terminates
- **THEN** the system MUST admit at most one detach transaction, without creating a second window, repeating migration, or replaying an Action
- **THEN** repeated events from a gesture already taken over by Host MUST NOT leak as a second same-chord plugin operation; an unavailable event with no previously admitted gesture MUST NOT be consumed as successful detachment
- **THEN** transaction results and errors MUST remain bound to the instance and window at admission; an invalidated target must not cause a replacement instance to be detached instead

#### Scenario: Overlays recording and input-method composition prevent detachment
- **WHEN** main contains Settings or a confirmation modal, shortcut recording, or incomplete input-method composition, and the user presses the detach chord
- **THEN** Host MUST NOT migrate the window, interrupt composition, or bypass the overlay; keys continue through the existing modal, recording, or input-method boundary
- **THEN** a new detach gesture may be admitted only after the conditions clear and the source remains valid; rejected old events are not replayed

#### Scenario: Recovery-required state blocks repeated detachment while retaining terminal controls
- **WHEN** the current instance retains `recovery_required` context and the user presses the detach chord again or invokes a local close/quit command
- **THEN** Host MUST admit no repeated detachment, create no new token/window, and replay no Action; repeated events from an already admitted gesture must not become a second same-chord plugin operation
- **THEN** main-window local `Cmd+W` MUST NOT hide the recovery entry; explicit instance close and foreground `Cmd+Q` MUST remain executable through the original attempt/token terminal boundary, without being blocked by recovery waits or repeated D

### Requirement: Detach shortcut settings MUST clearly distinguish application-local and global scopes

Settings MUST provide a fixed application-local detach-command row supporting chord recording, editing, clearing, and restoring the default, and display confirmed bindings, scope, reasons for unavailability, and conflict targets. All new copy MUST use application i18n with English as the default and Simplified Chinese, preserving light and dark themes, keyboard operation, accessible names, and focus recovery after saving.

#### Scenario: Edit the detach binding
- **WHEN** the user opens shortcut settings and edits the detach command
- **THEN** the row MUST clearly state that only the current Launcher plugin Page can be detached, and must not expose a replaceable Action target or modifier double-tap option
- **THEN** feedback before and after saving MUST distinguish candidate values, confirmed configuration, and actual execution availability; conflicts or failures must not present an uncommitted candidate as active
- **THEN** keyboard and assistive-technology users MUST be able to clear, change or restore the detach chord in Settings. The main plugin Page displays no detach button or shortcut hint
