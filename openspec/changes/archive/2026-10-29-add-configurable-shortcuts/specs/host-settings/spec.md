# Spec Delta

## MODIFIED Requirements

### Requirement: The first settings version must contain preferences and plugins sections

Settings MUST provide accessible Preferences, Plugins, and Shortcuts navigation on the left, defaulting to Preferences. Preferences MUST retain localized single-select controls; Plugins and Shortcuts MUST display only current Host-confirmed facts, status, and operations.

#### Scenario: View the default Preferences section

- **WHEN** the user opens the settings page
- **THEN** the left navigation exposes Preferences as the current selection
- **THEN** the right pane displays the color-theme and language settings
- **THEN** every setting and control has a localized label and accessible name
- **THEN** each setting displays one current selection and reveals the other
  candidates only when its select is expanded

#### Scenario: View language choices in either interface locale

- **WHEN** the user expands the language select in the `en-US` or `zh-CN`
  interface
- **THEN** the `en-US` option is displayed as `English`
- **THEN** the `zh-CN` option is displayed as `简体中文`

#### Scenario: Read the preference descriptions

- **WHEN** the user reads the color-theme and language descriptions in the
  `en-US` or `zh-CN` interface
- **THEN** the color-theme description explains only that it selects the lensX
  appearance and the language description explains only which language lensX
  uses
- **THEN** neither description mentions the Host, Semi Design, a component
  library, or another internal implementation detail

#### Scenario: Switch top-level sections with the keyboard

- **WHEN** the user selects Plugins from Preferences with the keyboard
- **THEN** the left navigation exposes Plugins as the current selection and
  retains visible focus
- **THEN** the right pane displays the current Plugin Management content
  without creating another Host page or window

#### Scenario: View the plugins section without registrations

- **WHEN** the user enters the `Plugins` section and the current available
  Registration snapshot is empty
- **THEN** the page displays a localized empty state and the trusted local
  installation entry point
- **THEN** the page does not fabricate plugin content or present Manager
  degradation as an ordinary empty state

#### Scenario: View the plugins section with registrations

- **WHEN** the user enters the `Plugins` section and the current available
  Registration snapshot contains entries
- **THEN** the page displays the current plugin list and permits selection of a
  revision-consistent Host-owned detail
- **THEN** lifecycle, replacement and data controls remain inside the trusted
  Host settings boundary and no marketplace operation is displayed

#### Scenario: Switch locale while settings is open

- **WHEN** the user successfully switches the application locale
- **THEN** the left navigation, right-pane section heading, and current
  settings content update together to the new locale
- **THEN** the current section and keyboard-focus semantics remain stable

#### Scenario: Choose a top-level settings section
- **WHEN** settings opens or the user navigates among Preferences, Plugins, and Shortcuts
- **THEN** settings MUST provide localized accessible `Preferences`, `Plugins`, and `Shortcuts` top-level navigation on the left
- **THEN** opening settings MUST select `Preferences` by default, with only the current section in the right pane
- **THEN** navigation MUST expose localized accessible names, current selection, visible focus, and keyboard and pointer selection

#### Scenario: Present theme and language preference choices
- **WHEN** the Preferences section displays its selectable settings
- **THEN** `Preferences` MUST contain color-theme and language settings. Each setting
  MUST use an accessible single-select control instead of displaying every
  option persistently side by side. User-visible descriptions MUST explain only
  the observable purpose of each setting and MUST NOT expose the Host, a
  component library, or another internal implementation detail. In every
  interface locale, the language select MUST display `en-US` as `English` and
  `zh-CN` as `简体中文`; language names MUST NOT be translated according to the
  current interface locale.

#### Scenario: Render the Plugins section from trusted Registration state
- **WHEN** the Plugins section is active
- **THEN** `Plugins` MUST provide the Host-owned local plugin management capability from
  the `plugin-management-settings` specification and MUST render only current
  Registration facts and operations exposed by trusted typed services. It MUST
  NOT display fabricated plugin data, expose plugin management to plugin code,
  or provide marketplace and remote-distribution operations.

#### Scenario: Enter Shortcuts using the keyboard
- **WHEN** the user selects Shortcuts with the keyboard
- **THEN** navigation selection and right-pane content update together while focus remains visible
- **THEN** the same Host settings Page displays one Launcher row and editable Action rows without creating a new window
- **THEN** long lists scroll within the right pane while the shared header and left navigation remain in place

## ADDED Requirements

### Requirement: Shortcut settings MUST expose confirmed bindings and accessible editing

Shortcut settings MUST provide accessible recording, editing, optional-binding clearing, and restore-default operations, distinguishing configuration, runtime availability, and failure feedback. All copy, key displays, conflict targets, and statuses MUST support English and Simplified Chinese and the current theme. Operations MUST follow the binding, protection, uniqueness, and recovery contracts of `launcher-shortcuts`.

#### Scenario: Manage launcher and Action bindings
- **WHEN** the user views the Shortcuts section
- **THEN** the content groups use peer-level localized System shortcuts and Feature shortcuts headings, while the sidebar remains Shortcuts
- **THEN** the surface omits introductory, recording, unsaved-edit, and double-tap setup explanations; editing retains save/cancel controls and relevant operational feedback without empty feedback spacing
- **THEN** exactly one Launcher row shows its localized title, a type select with chord and modifier-double-tap choices, and the current shortcut; there is no separate Launcher double-tap row or Launcher delete control
- **THEN** each Action row shows type select, current shortcut, Action select, and a delete button in that order; each Action has at most one binding
- **THEN** Feature rows use spacing without inter-row dividers, while their enclosing group keeps its bottom divider
- **THEN** the Feature target dropdown excludes `lensx.core.hide_launcher` and `lensx.core.open_settings` by stable ID in all locales, including fallback options for existing rows; their ordinary Launcher search and Registry behavior is unchanged
- **THEN** existing bindings are not silently deleted and remain identifiable for explicit reassignment or deletion without reintroducing excluded targets into the dropdown
- **THEN** a compact localized empty state and Add button remain available below an empty list, without fabricated saved bindings
- **THEN** Restore default shortcuts is right-aligned at the end of System shortcuts before its bottom divider, and Add feature shortcut is right-aligned at the end of Feature shortcuts before its bottom divider
- **THEN** Restore requires confirmation and preserves the existing transaction boundary while changing only the System Launcher trigger, never deleting or rewriting Feature bindings

#### Scenario: Record a chord or choose a double tap
- **WHEN** the user starts editing a binding with keyboard or pointer
- **THEN** chord controls expose accessible recording status, live pressed-key feedback, a validated candidate, and cancellation; double-tap key cells are direct dropdowns offering only Cmd, Ctrl, Option, and Shift without a recording entry or lease
- **THEN** recording only collects candidates, without executing launcher or Action targets or consuming reserved system commands
- **THEN** Escape or cancellation discards the candidate and returns focus to the editing entry without changing confirmed bindings

#### Scenario: Show saving and conflict feedback
- **WHEN** the user saves candidate configuration
- **THEN** controls show progress, prevent duplicate submission of the same edit, and wait for Host confirmation
- **THEN** reserved combinations, duplicate bindings, stale configuration, and registration failures receive corresponding localized feedback; duplicates identify the occupying target
- **THEN** uncommitted candidates are not shown as active and failure preserves candidate input for correction

#### Scenario: Show double-tap authorization and target availability
- **WHEN** a saved double tap lacks input-monitoring authorization, monitoring fails, or an Action target is unavailable
- **THEN** the UI clearly distinguishes saved configuration from inactive entry points and displays safe status reasons
- **THEN** double-tap authorization is user-initiated only, and the selected Launcher entry shows its actual availability without claiming a hidden recovery chord exists
- **THEN** unavailable Action bindings remain viewable, editable, and clearable instead of disappearing from configuration

#### Scenario: Restore default configuration
- **WHEN** the user explicitly chooses and confirms restoring shortcut defaults
- **THEN** the full validation and save flow restores only the single Ctrl+Shift+Space Launcher chord and preserves all Action bindings from the latest confirmed snapshot
- **THEN** if that default chord is occupied by a Feature binding, restoration is rejected with a visible conflict and no Feature binding is cleared, replaced, or reassigned
- **THEN** save and conflict errors remain visible in the confirmation dialog; configuration changes received while it is open are not overwritten by an older snapshot
- **THEN** success displays the confirmed snapshot; failure follows shortcut compensation and degradation feedback without claiming restoration succeeded
- **THEN** theme, locale, plugin settings, and Recent/Pinned collections remain unchanged

#### Scenario: Change locale or theme while reading errors
- **WHEN** the user changes locale or theme while Shortcuts is editing, has a save failure, lacks authorization, or has an unavailable target
- **THEN** navigation, control labels, status, errors, and accessible names update consistently while preserving the candidate, selection, and reasonable focus
- **THEN** status is not conveyed by color alone and feedback exposes no internal paths, native errors, monitoring objects, or other applications' input

#### Scenario: Add and cancel an Action row
- **WHEN** the user selects Add below the Action list
- **THEN** one editable local row appears with type, shortcut, Action, and delete controls in the same column order as saved rows
- **THEN** no configuration is persisted until the user has supplied a complete valid candidate and explicitly saves it
- **THEN** Escape, cancel, or deleting the unsaved row discards it and returns focus to the Add entry without changing confirmed bindings

#### Scenario: Edit or delete a saved Action row
- **WHEN** the user edits a row's type, shortcut, or Action, or deletes that row
- **THEN** editing stays inline with compact save/cancel feedback, and a failed save keeps the candidate available for correction
- **THEN** changing an Action atomically removes the previous ID and adds the selected ID without overwriting another configured Action, including unavailable targets
- **THEN** deletion persists through the existing complete transaction; failure retains the saved row and success restores focus to a remaining list control

#### Scenario: Cancel inline recording from any focused control
- **WHEN** the user presses bare Escape while editing, acquiring a recording lease, recording, or correcting a failed save
- **THEN** the row returns to confirmed state or an unsaved draft is removed, recording is released, and focus returns to the row or Add entry
- **THEN** modified Escape and IME input retain existing behavior, and an already-submitted save keeps its pending guard

#### Scenario: Choose a legacy Launcher entry in the single row
- **WHEN** the Host reports unresolved v1 Launcher migration
- **THEN** the single Launcher row requires an explicit type choice and displays the corresponding retained candidate before saving
- **THEN** a localized explanation makes the unresolved state clear, Action mutations are disabled until resolution, and neither candidate is falsely shown as active

#### Scenario: Select a double-tap modifier directly
- **WHEN** the user selects or edits a modifier double tap for the Launcher or an Action
- **THEN** its key cell displays a modifier dropdown directly, without a recording input or start-recording action
- **THEN** selecting a modifier creates an unsaved candidate without acquiring or renewing a recording lease; switching from an active chord recording releases that lease
- **THEN** explicit save, uniqueness checks, migration resolution, Escape cancellation, and confirmed-state feedback retain their existing contracts

#### Scenario: Preview held chord keys while recording
- **WHEN** the user starts chord recording and presses or releases modifiers and primary keys
- **THEN** the key cell immediately displays the currently held supported modifiers and keys, including incomplete modifier-only prefixes
- **THEN** after all keys are released, the last complete valid candidate remains visible; native registered-chord candidates are also displayed immediately
- **THEN** a new recording does not present the old binding as a new successful capture; incomplete, multiple-primary-key, unknown, reserved, and IME input cannot become a new saved candidate
- **THEN** ending or blurring recording clears transient held-key state without changing confirmed bindings
