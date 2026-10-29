# Spec Delta

## Purpose

Define user-owned lensX shortcut bindings so key combinations and modifier double taps can reliably open the application or execute an Action, with explicit reserved-key protection, internal uniqueness, system authorization, failure recovery, and persistence boundaries.

## ADDED Requirements

### Requirement: Shortcut bindings MUST have explicit targets and supported trigger kinds

The system MUST support opening lensX and stable Action IDs as targets, with chord or single-modifier double-tap triggers. The Launcher MUST have exactly one selected trigger, defaulting to Ctrl+Shift+Space. Saving a different kind MUST deactivate the previous entry without retaining a hidden fallback chord. Each Action MUST have at most one clearable binding.

#### Scenario: First launch and existing-user migration
- **WHEN** no shortcut configuration exists
- **THEN** configuration v2 has one Launcher chord `Ctrl+Shift+Space` and empty Action bindings
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

### Requirement: Canonical shortcut identity MUST be unique across all configured targets

The system MUST deduplicate the single Launcher trigger and all Action bindings after normalization. Modifier order, case, and supported aliases MUST NOT create different identities. Retained unavailable Action bindings MUST continue to occupy their trigger and Action ID until cleared.

#### Scenario: Equivalent spellings identify one chord
- **WHEN** two targets submit equivalent `Cmd+Shift+K` and `Shift+Command+k` combinations
- **THEN** the later change is rejected and identifies the target already using that chord
- **THEN** existing configuration and effective bindings remain unchanged

#### Scenario: Launcher and Action request the same double tap
- **WHEN** the launcher is bound to double Cmd and an Action requests double Cmd
- **THEN** the duplicate is rejected; left and right Cmd do not bypass uniqueness

#### Scenario: Edit an existing binding
- **WHEN** the user saves the same canonical binding for the same target in a current v2 configuration without pending migration
- **THEN** the system treats it as unchanged, without a self-conflict or repeated registration

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

Rust MUST serialize validation, registration, unregistration, and versioned shortcut persistence. Success MUST return confirmed persisted configuration and per-binding runtime status. Chords for available targets MUST complete registration before success; unauthorized double taps and unavailable Action targets MAY persist as explicitly inactive. Failures MUST return safe errors, and failed compensation MUST report degradation. An old file alone MUST NOT prove recovery.

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

### Requirement: Shortcut recording MUST suspend target execution with bounded native ownership

Recording MUST retain native registrations but suspend all user-configurable target execution under the current Host recording session. Cancellation, blur, hide, Host invalidation, exit, or bounded expiry MUST revoke recording independently of frontend cleanup. Reserved close and quit commands MUST retain existing semantics.

#### Scenario: Record an already-bound shortcut
- **WHEN** the user records an already-bound chord
- **THEN** it only supplies a candidate, without launcher/Action execution or losing candidate feedback because the chord is registered
- **THEN** bare Escape cancels recording and modified Escape follows ordinary candidate rules

#### Scenario: The recording page is invalidated or closed
- **WHEN** the user presses Cmd+W/Q, the window blurs or hides, the recording page/Host is invalidated, or the recording session expires
- **THEN** the native boundary revokes recording and clears candidates while reserved commands execute their existing foreground semantics
- **THEN** configured execution resumes after current keys are released, without replaying old candidates or ending events

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

Configuration v2 MUST represent one `launcher` trigger. Reads MUST NOT rewrite legacy files. A valid v1 chord-only configuration MAY project losslessly to v2. When valid v1 contains both Launcher entries, the Host MUST retain both choices and the original file, require explicit selection, and keep the window visible. Other configuration writes MUST NOT silently choose or discard a legacy entry.

#### Scenario: Read and save a chord-only v1 file
- **WHEN** the existing v1 file contains a chord and no Launcher double tap
- **THEN** the Host exposes the same chord and Action bindings in v2 without rewriting the file during read
- **THEN** a later explicit successful save commits v2, even if its semantic bindings are unchanged

#### Scenario: Resolve a v1 file with two Launcher entries
- **WHEN** a valid v1 file contains both a chord and a Launcher double tap
- **THEN** the snapshot exposes `launcher_migration` with both validated choices and the Launcher as degraded, with no active Launcher trigger or automatic fallback
- **THEN** the window remains visible and settings require a type selection and explicit save before allowing other configuration writes
- **THEN** only the selected entry is committed as the v2 Launcher and activated according to its actual availability; the other entry is not kept as a hidden shortcut

#### Scenario: A migration commit fails or has an uncertain result
- **WHEN** an explicit migration save fails
- **THEN** the old file and unresolved choices remain unless rereading storage confirms the v2 candidate was committed
- **THEN** a confirmed v2 commit clears migration facts even when the operation must still report an I/O failure; unconfirmed storage retains degraded recovery

#### Scenario: Restore defaults during unresolved migration
- **WHEN** the user explicitly confirms restoring shortcut defaults
- **THEN** the same full transaction may resolve migration with the default Launcher chord while preserving all existing Action bindings
- **THEN** an Action occupying the default chord causes a conflict instead of being removed or reassigned
- **THEN** failure retains confirmed state and never claims completion
