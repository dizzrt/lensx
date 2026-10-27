# official-translation-plugin Specification

## Purpose

Define the text input, automatic translation, language selection, in-plugin service settings, local credential persistence, and Volcengine request contracts for the standalone lensX Translation plugin, so users can translate short text within the current plugin page and distinguish current results, pending work, and recoverable errors.

## Requirements

### Requirement: Translation MUST be a standalone foreground plugin

Translation MUST remain a standalone foreground plugin with its declared identity, resizable initial page, public Host API compatibility, and existing isolation and installation boundaries.

#### Scenario: User opens Translation
- **WHEN** the user executes the currently available `dev.lensx.translation.open` Action
- **THEN** the Host opens the plugin's `main` Page and displays `Translation` or `翻译` according to the current interface language
- **THEN** the plugin uses the same isolation, context, and lifecycle boundaries as other plugins

#### Scenario: Official plugin attempts a private capability
- **WHEN** the plugin implementation or package artifact depends on nonpublic Host, Tauri, native proxy, Node Runtime, or persistent background execution capabilities
- **THEN** the artifact does not satisfy this capability's delivery contract
- **THEN** official provenance cannot justify bypassing public plugin boundaries

#### Scenario: Register and open the Translation package
- **WHEN** the Translation package is inspected, registered, opened, or invokes public HTTP during its foreground Runtime
- **THEN** The system MUST provide a standalone plugin with ID `dev.lensx.translation` and package name `@lensx/official-translation`, contributing one `main` Page and one `open` Action targeting that Page, named `Translation` in English and `翻译` in Simplified Chinese. The Page MUST declare an initial logical size of `800×480` and allow resizing, while its actual presentation MUST follow existing Host workspace constraints. The plugin MUST follow the existing Manifest, isolated Web Runtime, public Host API, and installation lifecycle contracts; official status MUST NOT grant private Host, Tauri, filesystem, process, Node Runtime, or background execution privileges. The Translation plugin MUST require Host API `>=0.3.0 <0.4.0` and invoke the public HTTP capability only after the current Context advertises `http.request`.

### Requirement: Translation workspace MUST use responsive source and translation cards

The workspace MUST provide accessible responsive source and readonly translation cards. It MUST preserve plain-text output, native selection and copy, page-local memory, and editing and request continuity as the actual Host-constrained viewport changes.

#### Scenario: User enters and selects multiline text
- **WHEN** the user enters source text containing line breaks and obtains a successful translation
- **THEN** the source text area retains the complete source, and the translation text area displays the readonly translation corresponding to current conditions
- **THEN** the user can select and natively copy the translation but cannot edit it directly

#### Scenario: Service returns markup-shaped text
- **WHEN** a successful translation contains tags, script-shaped strings, or other markup text
- **THEN** the translation is displayed literally as plain text without creating elements, executing scripts, or navigating automatically

#### Scenario: Page starts with no text
- **WHEN** the user opens a new Translation page
- **THEN** source and translated text are empty, and the page does not restore text or translation history from the preceding page
- **THEN** source and translation remain blank without an empty-output instruction, and the page sends no translation request

#### Scenario: Initial window has room for two cards
- **WHEN** the page opens at its initial `800×480` size and the actual available width supports side-by-side reading
- **THEN** the source card is on the left and the translation card is on the right, with language selectors and the settings trigger above them
- **THEN** the user can access both text areas and their actions without horizontally scrolling the page

#### Scenario: Host constrains the page to a narrow viewport
- **WHEN** the actual viewport narrows until it can no longer accommodate two readable columns
- **THEN** the workspace stacks source above translation, and the language bar and actions wrap to fit the available space
- **THEN** text labels, language selectors and swap, status feedback, recovery actions, and settings remain accessible

#### Scenario: Long content or a short window needs scrolling
- **WHEN** source text, translated text, language names, or error feedback is long, or the window height is insufficient
- **THEN** content wraps or scrolls within its respective region, and complete text is neither truncated nor discarded from page state
- **THEN** the page and cards do not hide actions, focus, or settings content through unrecoverable clipping

#### Scenario: Layout changes during composition or a request
- **WHEN** the user changes the window width while composing with an input method, selecting text, or waiting for a translation
- **THEN** the current text controls, focus, selection, input-method session, language values, and request state remain continuous
- **THEN** changing width does not submit composition drafts, reset the 400ms timer, or add requests or configuration writes

#### Scenario: Arrange cards within the actual Host viewport
- **WHEN** the Host supplies the viewport for the Translation page
- **THEN** The plugin MUST provide source and translation cards with clear, accessible, localized labels. The source MUST be an editable multiline text area, and the translation MUST be a selectable but non-editable readonly multiline text area. In the initial `800×480` window when the Host provides sufficient workspace width, the cards MUST appear side by side with source on the left and translation on the right; narrow viewports that cannot accommodate two readable columns MUST stack source above translation. The actual viewport after Host workspace constraints MUST determine the layout, and the plugin MUST NOT force a Host window-size change to retain two columns.

#### Scenario: Read cards with constrained space and either theme
- **WHEN** the workspace renders its cards in any supported theme or viewport
- **THEN** Both outer cards MUST share the same neutral theme surface; the inner source area MUST use a neutral surface and the inner translation area a light primary tint, with headings and spacing distinguishing input from output. Focused text areas MUST NOT add a blue box, label underline, or replacement decoration; native caret, selection, and accessible labels MUST remain intact. Body text and interactive controls MUST remain recognizable in both themes, and selectors and action buttons MUST retain visible keyboard focus. Long text, long language names, narrow viewports, and short windows MUST NOT horizontally clip primary controls or make them unreachable. Long text MUST wrap and scroll, and the page MUST allow access to all content and settings when space is insufficient.

#### Scenario: Expose translation text for reading and native copy
- **WHEN** source or translated text is initialized, edited, held in page memory, or presented for reading and native copy
- **THEN** Translated text MUST be displayed as plain text and MUST NOT be interpreted as HTML or executable content. The translation text area MUST allow text selection and native copy operations, and MUST NOT add or invoke a Host clipboard interface. Source and translated text MUST initially be empty, and text and request state MUST remain only in the current page's memory.

#### Scenario: Rearrange cards without changing translation work
- **WHEN** a viewport change rearranges cards during the current page attempt
- **THEN** Layout changes MUST preserve current text, language values, focus, selection, and input-method sessions. They MUST NOT cancel, restart, or duplicate current requests, and width changes MUST NOT trigger storage writes. The existing 400ms automatic translation and accepted configuration, request, retry, and lifecycle behavior MUST remain effective.

#### Scenario: Compact cards retain access in the shorter initial window
- **WHEN** the page uses its shorter initial window or the Host further limits its height
- **THEN** compact spacing and a shorter minimum text-area height reduce workspace space while long content and the dedicated settings view each remain accessible through the current view or text-control scrolling
- **THEN** cards and text controls do not clip focus, errors, or available actions

### Requirement: Translation workspace MUST present contextual controls and feedback

The workspace MUST center source, a recognizable swap icon, and target above the cards, with Settings on the right. Source/target MUST use filled/outlined pills with visually hidden accessible labels. Language and action controls MUST support both locales, themes, and keyboard focus. The workspace service footer, empty-output instruction, and routine status/metadata below the translation MUST be absent; service disclosure remains in settings.

#### Scenario: User accesses localized language controls
- **WHEN** the workspace is displayed at any supported viewport width
- **THEN** source, target, and swap form a compact centered group that can wrap in a narrow viewport, and all available controls remain keyboard-operable
- **THEN** complete localized source and target labels remain identifiable to assistive technology while visually hidden, without removing keyboard behavior or visible focus
- **THEN** all actions, disabled explanations, and assistive-technology states support English and Simplified Chinese and do not rely only on color or icons
- **THEN** the swap SVG has explicit width, height, and viewBox and remains recognizable when enabled or disabled, without replacing its button's localized accessible name

#### Scenario: User reads service disclosure in settings
- **WHEN** the user opens plugin settings
- **THEN** settings clearly explains that source text is sent to Volcengine and retains the local unencrypted credential-storage explanation
- **THEN** no service-sending line appears beneath the workspace cards

#### Scenario: User changes presentation while retaining translation state
- **WHEN** Host locale or light/dark theme changes, or the user resizes the workspace width
- **THEN** cards, the language bar, assistive-technology states, and settings use current localized copy and theme; text retains its native caret and selection without decoration while other interactive controls retain visible keyboard focus
- **THEN** presentation changes do not rewrite text or language values or add service or storage calls

#### Scenario: User continues automatic translation without a submit action
- **WHEN** the user enters eligible text with configuration ready, settings closed, and composition finished
- **THEN** translation is scheduled automatically 400ms after the last actual edit without a translation-button click
- **THEN** the page offers only language selection and swap, text editing, configuration, and existing recovery actions, without manual or immediate translation, one-click copy, read-aloud, or unimplemented document/image/audio controls

### Requirement: Translation workspace MUST enforce input limits without count controls

The workspace MUST NOT display a source counter or clear button. The controller MUST retain the 5000 Unicode code-point limit without truncating, splitting, or rewriting text. Non-whitespace overflow MUST show accessible limit feedback and block requests. Whitespace-only input MUST take precedence as empty even above the limit. Native deletion and correction MUST remain available.

#### Scenario: Unicode input is checked without a visible counter
- **WHEN** the user enters line breaks, supplementary-plane characters, or combining characters
- **THEN** validation counts one code point represented by a surrogate pair once and each code point in a combining sequence separately
- **THEN** no counter or clear button is shown, and validation neither rewrites text nor changes eligible request content or timing

#### Scenario: Input exceeds the limit and is corrected
- **WHEN** non-whitespace source exceeds 5000 code points and is then edited back within the limit
- **THEN** complete source remains editable while oversized, limit feedback is readable, and no request is sent
- **THEN** once within the limit, current input reenters the 400ms automatic translation flow under the existing conditions

#### Scenario: Oversized whitespace remains empty input
- **WHEN** source contains only whitespace, even when its code-point count exceeds 5000
- **THEN** the page remains empty and clears translation and request feedback
- **THEN** no limit-blocking error or empty-output instruction is shown and no request is sent

### Requirement: Translation workspace MUST keep translation and configuration recovery contextual

The area below the translation MUST NOT display status, RequestId, or detected-language text. Routine waiting, translation, success, and pause MUST retain a visually hidden live region; empty state is unannounced. Actionable input, HTTP, or request errors and retry MUST appear near language controls without a toast or duplicate announcement. Configuration reload, valid-target repair, and request retry remain distinct; credential errors stay in settings.

#### Scenario: Empty translation has no instruction copy
- **WHEN** a new page has no source text or source becomes empty or whitespace-only
- **THEN** the output control remains blank without an empty-translation instruction
- **THEN** no request is sent, and subsequent nonempty routine states remain available to assistive technology through visually hidden text, live-region, and busy-state semantics

#### Scenario: Translation fails and the user retries
- **WHEN** the current request fails and remains eligible for retry
- **THEN** safe error text and an available retry appear near language controls, source remains unchanged, and no automatic retry occurs; no status or diagnostic metadata appears below the translation
- **THEN** explicit retry creates only one current request and repeated activation while it is in flight creates no concurrent request

#### Scenario: Configuration prevents translation
- **WHEN** configuration is missing, unreadable, invalid, or contains an unsupported saved target
- **THEN** the page preserves source text and respectively offers settings, configuration reload, or valid-target selection as recovery
- **THEN** configuration recovery is not presented as request retry and an unusable successful translation is not displayed

#### Scenario: Routine translation feedback remains nonvisual
- **WHEN** current input is waiting, translating, successful, or paused
- **THEN** state text exists only in a visually hidden live region, requests retain busy semantics, and status takes no space beneath the translation
- **THEN** RequestId and detected-language text are not rendered; detected language remains in memory only for current-result Auto swap eligibility, and response-safety filtering remains unchanged

#### Scenario: Input or transport conditions need user action
- **WHEN** input exceeds its limit, the direction is unsupported, or Host HTTP is unavailable
- **THEN** language-context feedback shows the appropriate localized message and relates it to the relevant control without treating a non-request problem as request retry
- **THEN** recovery uses current request conditions and existing scheduling, without mixing feedback into source or readonly translated text

### Requirement: Plugin settings MUST remain inside the current document

Settings MUST use a dedicated view in the same plugin document and Runtime, without a Host Page, route, or native window. It MUST hide and disable workspace interaction while keeping text controls and the controller mounted. Back, Cancel, or successful save MUST restore workspace state, scrolling, and trigger focus; failure retains the current draft. Scheduling still follows confirmed configuration and settings-pause boundaries.

#### Scenario: User edits settings then cancels
- **WHEN** the user opens settings, changes service credentials, and chooses cancel
- **THEN** the translation workspace returns with source, translation, and language selections preserved, and the unsaved draft does not take effect
- **THEN** current eligible input resumes with the last confirmed configuration, without retranslating a successful result whose conditions have not changed

#### Scenario: Settings opens during translation
- **WHEN** the user enters settings during a debounce wait or an in-flight translation request
- **THEN** the plugin cancels that work and stops automatic translation while the workspace is hidden and noninteractive
- **THEN** returning reschedules only current input that still needs a result, and old responses cannot overwrite the translation

#### Scenario: Only the first provider is available
- **WHEN** the user expands the service selector in settings
- **THEN** only Volcengine can be selected, and unimplemented services are not presented as available
- **THEN** this operation neither enters nor modifies the Host's main settings

#### Scenario: Configure Volcengine within the existing page
- **WHEN** the user enters, edits, saves, or leaves the plugin settings view
- **THEN** settings appears independently in the same document and Runtime with Back to translation, service selection, credentials, Save, and Cancel, rather than as a form appended below the workspace
- **THEN** the workspace is fully hidden and excluded from pointer, keyboard, and assistive-technology interaction, while source/output nodes, controller, text, results, languages, selection, and editing history remain continuous
- **THEN** no Host Page, route, or native window is created and Host main settings is not extended; Back or Cancel discards an unsaved draft

#### Scenario: Pause and resume around the inline settings panel
- **WHEN** the settings view opens, remains visible, or returns to the workspace while current input or a result exists
- **THEN** visible settings pauses automatic scheduling and cancels pending or in-flight work; returning resumes according to current text, languages, and confirmed configuration
- **THEN** a successful result with unchanged request conditions remains valid without another request solely for view navigation; cancelled current input without a successful result remains eligible for rescheduling

#### Scenario: Enter and return with view-local focus and scrolling
- **WHEN** the user enters settings from the workspace and returns through Back, Cancel, Escape, or successful save
- **THEN** the prior workspace scroll position is recorded before entry, and visible settings scrolls to the top and focuses the first credential input
- **THEN** return makes the workspace visible before restoring its prior scroll position and focusing the still-existing settings trigger; a hidden workspace receives neither input nor focus
- **THEN** Escape being used by an input method does not leave settings, while ordinary Escape follows the return behavior

#### Scenario: Return while credential persistence is pending
- **WHEN** the user selects Back or Cancel before a credential save or reconciliation has completed
- **THEN** the workspace becomes visible and source remains editable, while conflicting language/configuration submissions and related translation still await persistence confirmation or reconciliation
- **THEN** returning does not claim that an already submitted write was cancelled or rolled back; later scheduling uses the latest input and finally confirmed configuration

#### Scenario: Failed or obsolete saves preserve the current view session
- **WHEN** the current visible settings session receives a definite save failure, or an older save response arrives after leaving and reopening settings
- **THEN** failure in the current session retains the settings view, draft, and feedback; only confirmed success returns that session to the workspace
- **THEN** a late response from an old session cannot close a new settings view, overwrite its draft, or steal focus

### Requirement: Configuration MUST load before any translation request

Translation MUST wait for valid loaded configuration and distinguish missing, failed, invalid, and unsupported-target states. Only a validated unsupported-target record may be repaired without replacing its other fields.

#### Scenario: Text is entered before configuration finishes loading
- **WHEN** the user enters source text while configuration is loading
- **THEN** the plugin retains the input but sends no translation request
- **THEN** after configuration loads successfully and request conditions are satisfied, the plugin schedules only the latest current input

#### Scenario: No saved service configuration exists
- **WHEN** storage explicitly reports that no saved configuration exists
- **THEN** the page displays a service-configuration-required state and allows the user to open plugin settings
- **THEN** the plugin neither sends requests with empty credentials nor automatically writes default configuration

#### Scenario: Configuration read fails or contains invalid data
- **WHEN** storage is unavailable, a read fails, or stored contents do not satisfy the current configuration contract
- **THEN** the page displays a diagnosable, recoverable configuration error and pauses translation
- **THEN** defaults do not overwrite stored contents, and the user can explicitly retry the read

#### Scenario: Resolve saved configuration after Runtime readiness
- **WHEN** saved configuration is read or evaluated after the Runtime receives its first ready context
- **THEN** The plugin MUST read saved configuration after the current Runtime's first ready context, and MUST prohibit translation requests until configuration has loaded successfully, valid service credentials are available, and language state is determined. Missing configuration MUST be distinguished from a read failure or invalid stored contents; missing configuration MUST guide the user to configure the service, while a read failure or invalid configuration MUST provide a localized error and explicit recovery action. The plugin MUST NOT treat a read failure as first use or silently overwrite existing storage with defaults.

#### Scenario: Repair a supported-version record with an invalid target
- **WHEN** saved configuration is evaluated for a target-language repair
- **THEN** When the configuration version is known and all other fields are valid but the saved target language is no longer supported, the plugin MUST retain the validated fields and allow the user to explicitly select a valid target language, resuming translation after the save is confirmed; repair MUST preserve unchanged credentials. An unknown version or structurally damaged record MUST remain intact, and speculative writes MUST be blocked.

### Requirement: Service configuration MUST use confirmed persistence semantics

Service and target configuration MUST become effective only after confirmed, serialized persistence. Failures and ambiguous outcomes MUST preserve or reconcile confirmed state, and stale Runtime callbacks MUST have no effect.

#### Scenario: Configuration saves successfully
- **WHEN** the user submits valid configuration and storage confirms success
- **THEN** subsequent translation uses the new configuration and reevaluates whether the current text needs a request
- **THEN** the unsaved draft no longer exists as a separate effective configuration

#### Scenario: Configuration save fails before confirmation
- **WHEN** saving returns a definite failure
- **THEN** the page displays the save failure and the most recently confirmed configuration remains effective
- **THEN** the page neither claims a successful save nor sends requests using the failed draft

#### Scenario: Save outcome is ambiguous
- **WHEN** a save may have committed but its success or failure cannot be confirmed
- **THEN** the plugin pauses translation that depends on that configuration and rereads storage to reconcile it
- **THEN** only valid configuration confirmed again can be used for requests, and an unreconciled state remains a recoverable error

#### Scenario: Configuration edits would conflict
- **WHEN** service configuration or target-language persistence is incomplete and the user tries to submit another configuration change
- **THEN** the plugin blocks the conflicting submission while preserving source text editing
- **THEN** subsequent submissions use the latest confirmed configuration, so target-language updates do not overwrite saved credentials

#### Scenario: Confirm or reconcile a credential save
- **WHEN** service configuration is submitted, pending confirmation, or reconciled after a storage result
- **THEN** When the user saves service configuration, the plugin MUST validate the service and required Access Key ID and Secret Access Key, then persist them through the existing plugin-scoped `storage.*` boundary. Only configuration whose persistence has been successfully confirmed MUST become the configuration used for translation; duplicate submissions MUST be prevented during saving, and failure MUST retain the most recently confirmed configuration and display failure feedback. If a write may have committed but its response is lost or its outcome is ambiguous, the plugin MUST reread and reconcile persistent state before determining the effective configuration, and MUST NOT guess success, pretend to roll back, or blindly repeat the write.

#### Scenario: Serialize configuration writes across Runtime boundaries
- **WHEN** service or target configuration is written, another submission is attempted, or a configuration callback arrives after Runtime invalidation
- **THEN** Service configuration and target-language writes MUST be serialized, preserving unchanged fields from the latest confirmed configuration; while a write is pending, the plugin MUST block conflicting configuration submissions and pause translation scheduling while still allowing source text editing. Configuration read or write callbacks from any invalidated Runtime MUST NOT update a new page, roll back the current Context, or overwrite newer user choices.

### Requirement: Credentials MUST have explicit local unencrypted storage semantics

Credentials MUST use explicitly disclosed local unencrypted plugin storage with masked input and no secret disclosure. Source text, translations, and history MUST NOT be persisted.

#### Scenario: User views credential settings
- **WHEN** the user views or edits AK/SK
- **THEN** credential fields are masked by default, and the settings explanation explicitly states that storage is local and unencrypted
- **THEN** the page does not describe plugin namespace isolation as encryption

#### Scenario: A request or configuration operation fails
- **WHEN** a request or configuration operation involving credentials fails
- **THEN** the user sees only localized safe error categories and permitted recovery actions
- **THEN** logs, diagnostics, and error contents contain no credentials, signatures, source text, translated text, or raw responses

#### Scenario: Plugin is reopened after a successful save
- **WHEN** the same plugin identity is reopened and its storage is available
- **THEN** the plugin restores its saved service configuration
- **THEN** source and translated text remain empty, because saving credentials does not also save translation contents

#### Scenario: Store credentials without exposing secrets or text history
- **WHEN** the plugin handles credential input, local storage, diagnostics, or source and translation state
- **THEN** AK/SK and service configuration MUST be saved in local unencrypted storage scoped to the current plugin, and MUST NOT be described as using an operating-system keychain or encrypted vault. The settings interface MUST clearly explain the storage method and mask credential inputs. Credentials MUST NOT enter logs, diagnostics, visible errors, package artifacts, or committed content; error presentation MUST NOT directly expose request headers, signatures, raw exceptions, or raw third-party responses. The plugin MUST NOT persist source text, translated text, or translation history.

### Requirement: Source and target languages MUST have distinct initialization and persistence rules

Source language MUST initialize to Auto and remain page-local. Target language MUST restore confirmed storage or derive from the first ready locale, persist explicit changes only after confirmation, and remain stable across later locale updates.

#### Scenario: First open follows the initial Host language
- **WHEN** there is no saved target language and the first ready Host Context is `zh-CN`
- **THEN** the source language is automatic detection and the target language is `zh`
- **THEN** applying this default does not write storage; `en-US` correspondingly defaults to `en`

#### Scenario: User returns with a saved target language
- **WHEN** the user previously saved a supported target language successfully and opens the page again
- **THEN** the plugin restores that target without the current Host interface language overriding it
- **THEN** the source language initializes to automatic detection again

#### Scenario: User selects a new target language
- **WHEN** the user selects a new valid target language from the dropdown
- **THEN** the plugin automatically saves the choice, adopting the new target and rescheduling current text after success
- **THEN** if saving fails, the previous effective choice is retained, the page reports failure, and no request uses the unconfirmed language direction

#### Scenario: Host locale changes during a page lifetime
- **WHEN** the Host Context's interface language changes after the page opens
- **THEN** page copy and language option names update while source and target language values remain unchanged
- **THEN** the plugin neither sends a translation request nor writes a default target language because of that change

#### Scenario: A later page has no persisted target
- **WHEN** the preceding page used only a derived default without saving a user choice, and the new page's first ready Context has a different language
- **THEN** the new page derives its target language from the new Context
- **THEN** the preceding page's derived default is not restored as a persistent user choice

#### Scenario: A saved language is unsupported
- **WHEN** the saved target language is outside the currently supported set
- **THEN** the page asks the user to choose a target language again and blocks requests with an invalid language direction
- **THEN** the plugin does not silently substitute Chinese, English, or another default language

#### Scenario: User repairs only an unsupported saved target
- **WHEN** the configuration version is known, all other fields are valid, and the user explicitly selects a valid target language to repair the old target
- **THEN** the plugin preserves the validated service and credentials, persists the repaired record, and resumes translation after confirmation
- **THEN** save failure retains the old record and blocked state without silently overwriting credentials or pretending that repair succeeded

#### Scenario: Initialize source and target from the first ready context
- **WHEN** a newly opened page initializes its language state
- **THEN** On every newly opened page, the source language MUST default to automatic detection; users MUST be able to select a supported source language manually, and a manual source selection MUST apply only to the current page without persistence. The target language MUST preferentially restore a valid saved user choice. Without a saved target language, the target MUST initialize from the interface language of the current Runtime's first ready Host Context using `en-US → en` and `zh-CN → zh`; this derived default MUST NOT be written to storage automatically.

#### Scenario: Persist an explicit target selection
- **WHEN** an explicit target choice is submitted, confirmed, rejected, or restored in a later page
- **THEN** An explicit user target-language selection MUST automatically start persistence without requiring a separate save action; only after saving succeeds MUST the selection become the effective target language and invalidate results for the old language direction, and subsequent pages MUST preferentially restore that choice. A save failure MUST preserve the previous effective choice; when that choice was only a derived default, the default MUST remain without claiming that the user's selection was saved. An ambiguous submission outcome MUST follow the configuration reread-and-reconcile contract.

#### Scenario: Retain language identity across later Context events
- **WHEN** the current Host locale changes, initial storage resolves, or a later page initializes its language state
- **THEN** During the current page's lifetime, Host interface-language changes MUST affect only interface copy and corresponding control localization, and MUST NOT change the current target language or trigger translation. When a subsequent page opens and there is still no saved target language, it MUST derive the default again from that page's first ready Host Context. If storage reads complete after later Context events, derivation of an unsaved target language MUST still use the page's first ready Context. A saved but currently unsupported language MUST produce a configuration problem and MUST NOT silently replace the user's choice.

### Requirement: Language swap MUST confirm a reversible pair without changing source text

Swap MUST reverse a supported pair without changing source text. Manual or current confirmed detected source MUST be a valid target and the current target a valid source. Auto without valid detection or a reversible pair MUST disable swap with localized explanation. Pending persistence MUST retain the old pair and block conflicting edits; confirmation applies both languages, definite failure retains them, and ambiguity uses authoritative readback without an intermediate request.

#### Scenario: User swaps a supported manual language pair
- **WHEN** the current source and target form a supported reversed pair and the user activates swap
- **THEN** the plugin saves the reversed target and adopts reversed source and target together after confirmation; source text remains byte-for-byte unchanged and translation is not copied into source
- **THEN** eligible current source follows the existing 400ms automatic translation scheduling after confirmation

#### Scenario: Auto uses only current confirmed detected language
- **WHEN** source is Auto and current request conditions have a valid successful result with detectedLanguage
- **THEN** only that detected language may become the reversed target, and it and the current target must satisfy the reversed target/source roles and direction restrictions
- **THEN** missing detection, an invalidated result, an ineligible target code, or an irreversible pair disables swap with an accessible localized explanation, without guessing a language or sending another detection request

#### Scenario: Swap persistence is pending or fails
- **WHEN** a swap target save is awaiting confirmation, definitely fails, or has an uncertain outcome
- **THEN** pending confirmation retains the old pair, disables source/target editing and repeated swap, pauses related scheduling, and preserves source text
- **THEN** definite failure retains the old source and target with language-context feedback; uncertainty follows existing readback reconciliation before using unconfirmed configuration or a partly reversed pair

#### Scenario: An obsolete swap completes after the Runtime changes
- **WHEN** an old swap save or reconciliation returns after Runtime termination or replacement
- **THEN** the old callback cannot change a new page's language, text, configuration, or request state
- **THEN** swap adds no persisted source language, configuration field, or automatic retry

### Requirement: Language choices MUST respect the provider language and direction contract

Language choices MUST follow the reviewed Volcengine release snapshot and direction restrictions. Invalid explicit or detected directions MUST produce safe feedback without silently changing languages or issuing another billable request.

#### Scenario: User chooses a directionally restricted source
- **WHEN** the user selects `bo`, `nan`, `wuu`, `yue`, `cmn`, or `ug` as the source and the target is not `zh`
- **THEN** the plugin reports that the direction is unsupported and blocks the request
- **THEN** the selected target is not silently changed to `zh`

#### Scenario: User inspects source and target choices
- **WHEN** the user expands source- or target-language choices
- **THEN** `sk` appears only among targets and automatic detection only among sources
- **THEN** the six source-only languages do not appear among targets

#### Scenario: Automatic detection returns an unsupported direction
- **WHEN** an automatic-detection request receives service error `-415`
- **THEN** the plugin displays an unsupported-direction error and allows the user to adjust the source or target language before translating again
- **THEN** the plugin neither tries other directions automatically nor presents the preceding translation as the current result

#### Scenario: Offer the reviewed directional language catalog
- **WHEN** a release language snapshot is reviewed, its options are rendered, or a manual direction is selected
- **THEN** The language set included in a plugin release MUST match the official Volcengine text-translation support table checked for that release, and maintained documentation MUST record the snapshot source, date, and verification results. Source-language choices MUST include automatic detection, while target-language choices MUST exclude it. `sk` MUST be available only as a target; `bo`, `nan`, `wuu`, `yue`, `cmn`, and `ug` MUST be available only as sources and MUST allow translation only to `zh`. An explicitly invalid language direction MUST be reported before a request and MUST NOT silently rewrite the selected languages.

#### Scenario: Handle an unsupported automatically detected direction
- **WHEN** automatic detection returns a direction restriction from the service
- **THEN** Restricted directions that cannot be determined before automatic detection MUST be determined from the service result; on `-415`, the plugin MUST display a localized unsupported-direction message and allow language changes, and MUST NOT switch languages automatically, make another billable call, or treat failure as a successful translation.

### Requirement: Input changes MUST trigger debounced translation without composition requests

Eligible input MUST retain 400ms debounce and complete request text without submitting drafts or duplicate values. Native Chinese composition MUST preserve drafts and committed text without stale value overwrite. Source controls MUST opt out of automatic spelling, correction, capitalization, and completion without suppressing IME candidates. Ordinary clearing MUST cancel work; retired-session events MUST NOT restore text.

#### Scenario: User types continuously
- **WHEN** the user edits continuously with less than 400ms between edits
- **THEN** the plugin sends no requests for intermediate text
- **THEN** only final text is scheduled after 400ms have elapsed since the last actual edit

#### Scenario: User enters text with an input method
- **WHEN** input-method composition has not ended, even if more than 400ms have elapsed
- **THEN** native composition drafts remain visible and the plugin does not request draft translation
- **THEN** composition completion preserves the complete final Chinese text and starts a new 400ms wait from that commit

#### Scenario: Input event repeats the same value
- **WHEN** a repeated input event does not change current source text, including a same-value input after composition-end
- **THEN** the existing successful result or current request state remains consistent and the waiting timer is not reset
- **THEN** the plugin creates no duplicate request

#### Scenario: User clears the input
- **WHEN** the user clears source text or changes it to whitespace only through native editing
- **THEN** the translation and old request feedback are cleared, and pending or in-flight work is cancelled
- **THEN** late results and events from a retired composition session cannot restore cleared content

#### Scenario: Schedule effective edits while respecting composition and clearing
- **WHEN** source text is edited, composed, repeated, or cleared, or its request conditions become eligible
- **THEN** with configuration and language conditions satisfied and settings closed, translation runs automatically 400ms after the last effective edit; composition is never submitted before completion, which restarts timing from final committed text
- **THEN** same-value events create no new request; empty or whitespace-only source cancels pending and in-flight work and clears translation and feedback without contacting the service
- **THEN** non-whitespace requests preserve original spaces and line breaks without silent trimming

#### Scenario: Native Chinese composition commits through input events
- **WHEN** the native control receives compositionstart, input during composition, compositionend, and a possible repeated final input
- **THEN** earlier source values do not overwrite the browser draft, complete final Chinese characters are retained, and only the current session's final commit can enter scheduling
- **THEN** no request occurs 399ms after the final commit, and exactly one request sends the complete text at 400ms

#### Scenario: A temporary empty IME draft keeps its composition session
- **WHEN** native events are compositionstart, composition-marked input `n`, composition-marked empty input, composition-marked input `ni`, and compositionend `你`
- **THEN** the temporary empty draft preserves the same active composition session and token, later drafts remain visible, and final `你` is retained and translated only 400ms after commit
- **THEN** the page distinguishes composition drafts from ordinary edits using native `isComposing` or composition `inputType` markers; when native input lacks both kinds of metadata, only a current valid composition token and composing state provide a fallback, which explicit non-composing InputEvent or ordinary change does not use
- **THEN** only ordinary non-composing clearing retires the session, and late old events cannot restore text

#### Scenario: Native input omits composition metadata
- **WHEN** native input after compositionstart lacks boolean isComposing and inputType while the current composition token and composing state remain valid
- **THEN** a temporary empty draft belongs to the current composition session, later drafts and final text remain continuous, and no request occurs during composition
- **THEN** an explicit non-composing deletion still acts as ordinary clearing, retires the old session, and rejects its late commit

#### Scenario: Source editing opts out of automatic text assistance
- **WHEN** the page initializes the source control or the user types, pastes, or composes text
- **THEN** the source declares `spellCheck=false`, `autoCorrect="off"`, `autoCapitalize="off"`, and `autoComplete="off"` to request no automatic spelling, correction, capitalization, or completion prompts
- **THEN** no system-wide preference is changed, source is not rewritten, and Chinese IME candidates and composition events are not cancelled; final text follows the existing scheduling rules

### Requirement: Each request MUST enforce a bounded unsplit text input

Each translation MUST enforce the whitespace-first 5000 Unicode code-point limit without truncation or splitting. Oversized input MUST remain editable and resume normal scheduling after correction.

#### Scenario: Input reaches the exact limit
- **WHEN** nonempty source text contains exactly 5000 Unicode code points and other conditions are valid
- **THEN** the source can be submitted as one text item
- **THEN** surrogate-pair characters are neither double-counted nor split

#### Scenario: Input exceeds the limit
- **WHEN** non-whitespace-only source text contains 5001 or more Unicode code points
- **THEN** the plugin retains the full source and displays limit feedback without sending a request
- **THEN** the plugin neither truncates nor splits the input, and does not retain an old translation as the current result

#### Scenario: User reduces an oversized input
- **WHEN** the user edits oversized source text back to at most 5000 Unicode code points
- **THEN** the size block is removed and the current text is scheduled under the normal 400ms debounce conditions

#### Scenario: Evaluate whitespace and Unicode limits before dispatch
- **WHEN** the controller evaluates source text for a translation request
- **THEN** Input MUST first be evaluated under the whitespace contract; whitespace-only text MUST enter the empty state without a request even when it exceeds 5000 characters. Non-whitespace-only source text for one translation MUST contain no more than 5000 Unicode code points. On exceeding the limit, the plugin MUST retain the complete editable source and show localized limit feedback, and MUST NOT send a request, silently truncate the text, or split it automatically. Normal scheduling MUST resume once input returns within the limit and other conditions are satisfied. Counting MUST NOT treat a UTF-16 surrogate pair representing one Unicode code point as two characters; each code point in a combining-character sequence MUST be counted separately.

### Requirement: Results MUST match the latest request conditions and Runtime attempt

Only results matching the latest request conditions and Runtime attempt MUST update the page. Configuration revisions MUST reflect semantic request changes rather than persistence acknowledgments.

#### Scenario: Earlier request finishes after a newer request
- **WHEN** the request for source A completes after the latest request for source B
- **THEN** the page displays only the result corresponding to the current source B
- **THEN** A's result or error does not change B's translation or loading state

#### Scenario: Language or confirmed service configuration changes
- **WHEN** the user changes an effective language or successfully saved service configuration actually changes request conditions
- **THEN** the old translation is invalidated immediately and old requests can no longer update the page
- **THEN** subsequent requests and displayed results are bound to the new current conditions

#### Scenario: User saves unchanged request conditions
- **WHEN** configuration is saved successfully without changing effective request conditions, or the user persists the current derived target as the same language
- **THEN** the current successful translation remains valid without retranslating because of that persistence confirmation
- **THEN** the new persistent state remains available for restoration on the next page

#### Scenario: Cancellation cannot stop remote processing
- **WHEN** a cancelled request still returns success or failure
- **THEN** the plugin discards that result
- **THEN** the page does not describe local cancellation as having withdrawn third-party processing or charges

#### Scenario: Accept a callback only for current request identity
- **WHEN** request conditions change or a request success, failure, timeout, or completion callback arrives during a Runtime attempt
- **THEN** Only the latest request result matching all of the current source text, source language, target language, service, confirmed configuration revision, and Runtime attempt MUST update the translation or request-error state. When any of these conditions changes, the plugin MUST immediately invalidate old work and clear any old translation that no longer matches; even when cancellation cannot prevent a late response, that response MUST still be discarded. Success, failure, timeout, and completion callbacks from stale requests MUST NOT overwrite current results, errors, or loading state.

#### Scenario: Confirm unchanged configuration without invalidating a result
- **WHEN** persistence confirms unchanged credentials or the same derived target
- **THEN** The request configuration revision MUST change only when configuration contents that affect the request actually change. Saving unchanged configuration or persisting the current derived target as the same language MUST NOT invalidate a successful translation or request translation again merely because persistence was confirmed.

### Requirement: Volcengine requests MUST follow the documented translation contract

Translation MUST use the fixed signed Volcengine endpoint and single-text body through public controlled Host HTTP. Provider logic MUST remain plugin-owned, with no private transport, WebView fetch, remote code, or unconfigured request options.

#### Scenario: Automatic source detection request
- **WHEN** the current source language is automatic detection and valid text is submitted
- **THEN** the request contains one complete `TextList` item and the current `TargetLanguage`, omitting `SourceLanguage`
- **THEN** meaningful leading and trailing spaces and line breaks in the source remain unchanged

#### Scenario: Explicit source language request
- **WHEN** the user selects a supported explicit source language and submits text
- **THEN** the request carries that `SourceLanguage` and the current target language
- **THEN** the request uses the required endpoint, Action, Version, region, and service signing

#### Scenario: Signed request cannot be formed
- **WHEN** current credentials are invalid or a contract-compliant signed request cannot be generated
- **THEN** the plugin displays a safe error and stops that request
- **THEN** the plugin neither sends an unsigned substitute nor downgrades to plaintext HTTP nor invokes a private Host channel

#### Scenario: Host HTTP capability is absent
- **WHEN** the current Host version or Context does not provide `http.request`
- **THEN** the plugin displays a localized Host-upgrade-required or HTTP-unavailable message and preserves the source text
- **THEN** the plugin makes no direct fetch, private native request, or alternative service call

#### Scenario: Browser CORS headers are absent from a service response
- **WHEN** controlled Host HTTP returns a valid bounded HTTP response without cross-origin permission headers
- **THEN** the plugin applies existing service-error and translation validation to the actual status and body
- **THEN** WebView security policies remain enabled and the current page Origin is unchanged

#### Scenario: Send a signed request through controlled public Host HTTP
- **WHEN** Translation initializes its provider and service notice or forms and sends a service request through the Host
- **THEN** The first version MUST call `https://translate.volcengineapi.com/` over HTTPS using `POST`, `Action=TranslateText`, and `Version=2020-06-01`, with signing region `cn-north-1` and service `translate`. Requests MUST use the currently confirmed AK/SK to generate authentication that follows the official signing contract, and the signed content MUST match the actual path, query, headers, and JSON body sent. Requests MUST delegate controlled Rust Host transport through public SDK `http.request`, without sharing Cookies or system credentials, following redirects, or retrying automatically, and the service address MUST be fixed; the plugin MUST NOT offer a custom endpoint or load remote scripts. Translation business logic, AK/SK configuration, signing, and service-response validation MUST remain inside the plugin; the Host MUST perform only generic HTTP and contain no Volcengine exceptions, signing, or translation rules. The plugin MUST NOT invoke private Tauri channels or Node Runtime, and MUST NOT fall back to WebView fetch. The page MUST briefly explain that source text will be sent to the selected service, and MUST NOT add a Host permission prompt for ordinary network requests.

#### Scenario: Serialize one complete source text and explicit language fields
- **WHEN** the plugin constructs the body of an automatic or manual-source request
- **THEN** The request body's `TextList` MUST contain exactly one complete source text, and `TargetLanguage` MUST be the current target language. Automatic source detection MUST omit `SourceLanguage`; manual selection MUST submit its corresponding language code. Requests MUST NOT automatically add terminology libraries, models, other translation services, or business options not configured by the current interface.

### Requirement: Response handling MUST distinguish service errors from valid translated text

Response handling MUST validate HTTP status, service errors, JSON shape, and bounded response bytes before accepting exactly one string translation. Feedback MUST use safe categories and validated diagnostics without exposing raw provider data.

#### Scenario: Service returns HTTP 200 with an error
- **WHEN** an HTTP 200 response contains `ResponseMetadata.Error`
- **THEN** the plugin displays the corresponding localized failure category
- **THEN** the response is not presented as a successful translation

#### Scenario: Service returns a non-success HTTP status with a bounded error
- **WHEN** a non-2xx response contains parseable `ResponseMetadata.Error` within the size limit
- **THEN** the plugin uses that service error for localized classification instead of displaying only generic HTTP failure
- **THEN** the HTTP failure body remains subject to the same size, structure, and safe-display constraints

#### Scenario: Successful response contains one valid translation
- **WHEN** the current request receives a translation with no service error that satisfies the single-input response contract
- **THEN** the readonly text area in the translation card displays that string and ends the current loading state, whether the card is on the right or below the source
- **THEN** other response fields are not mixed into the translated text

#### Scenario: Response is malformed or oversized
- **WHEN** the response is invalid JSON, has an incorrect structure, lacks a valid translation, has an incorrect entry count, or exceeds 1 MiB in body size
- **THEN** the plugin rejects the response and displays a recoverable error
- **THEN** the page does not display raw response text, partially parsed values, or an old translation as the current result

#### Scenario: Error response includes unsafe diagnostic data
- **WHEN** a service error contains raw messages, HTML, credential-shaped content, or a RequestId that violates safety constraints
- **THEN** the plugin displays product-owned localized error copy and ignores unsafe diagnostic fields
- **THEN** the page neither directly renders nor logs raw third-party error contents

#### Scenario: Classify HTTP and service results before accepting a translation
- **WHEN** a service response is evaluated before any translation is presented
- **THEN** The plugin MUST check the HTTP result, response size, JSON structure, and `ResponseMetadata.Error` before presenting a translation. Non-2xx responses MUST also be read within the same size boundary and parsed for service errors, and MUST NOT lose a parseable vendor error category merely because HTTP failed. Even with HTTP status 200, a valid service error in `ResponseMetadata.Error` MUST be handled as failure. Known `Code` values or integer `CodeN` values MUST be used for safe classification, including `InvalidAccessKey`, `InvalidCredential`, and `100009`; unrecognized values MUST retain the service-error fallback without displaying the raw Message. A successful response MUST have a successful HTTP status, no service error, exactly one valid `TranslationList` entry, and a string `Translation` in that entry; missing responses, invalid shapes, incorrect entry counts, or incorrect translation types MUST become recoverable response errors and MUST NOT display partial, guessed, or stringified-object results.

#### Scenario: Bound response reading and filter diagnostic fields
- **WHEN** the plugin reads response bytes or prepares response diagnostics for display
- **THEN** The response body read MUST be limited to 1 MiB; exceeding this limit MUST stop processing and display a safe error. Raw third-party error messages, HTML, and raw responses MUST NOT enter user feedback directly. A `RequestId` MUST be eligible for display only when it contains 1–128 ASCII characters matching `[A-Za-z0-9._:-]+`; other service fields MUST NOT be passed through directly as displayable diagnostics.

### Requirement: Failures MUST have bounded deadlines and explicit retry

Requests MUST have a 15-second total deadline and safe localized failure categories. Retry MUST be explicit and deduplicated, preserve input, and avoid automatic service or language switching.

#### Scenario: Request deadline expires
- **WHEN** the current translation request does not finish processing a valid response within 15 seconds
- **THEN** the plugin ends waiting and displays timeout feedback with an explicit retry action
- **THEN** success or failure after the deadline cannot overwrite the page

#### Scenario: Service rate-limits the request
- **WHEN** the service returns a rate-limit or quota-related error
- **THEN** the plugin displays corresponding localized feedback and preserves source text
- **THEN** the plugin makes no automatic retry or alternative service call

#### Scenario: User retries a failed current input
- **WHEN** the user explicitly retries and source text, configuration, and language direction remain valid
- **THEN** the plugin creates one new request for the current conditions
- **THEN** repeated activation while retrying produces no concurrent duplicate call

#### Scenario: User corrects a blocking error
- **WHEN** the user corrects invalid configuration, language direction, or source text and satisfies translation conditions
- **THEN** the plugin can process the new current conditions under normal input-scheduling rules
- **THEN** an old failure is not retained as the new request's result

#### Scenario: Apply the total deadline and safe transport failure categories
- **WHEN** a translation request starts, fails, or reaches its deadline
- **THEN** Every actual translation request MUST use a 15-second total deadline covering plugin signing, SDK round trips, native network requests, and response reading and processing; HTTP timeout MUST use the remaining deadline, and cancellation MUST propagate to the Host provider; after the deadline, local waiting MUST end with timeout feedback. The plugin MUST provide safe localized classifications or fallbacks for network unavailability, timeout, authentication or signing failure, service activation or account status, rate limits or quotas, unsupported parameters or language direction, invalid responses, and unknown service errors. Host transport failures MUST produce network, timeout, limit, or unavailable feedback based on safe errors, and MUST NOT be described as browser CORS failures.

#### Scenario: Expose explicit retry for failed current input
- **WHEN** a translation request fails or the user attempts to retry current input
- **THEN** Request failures MUST NOT trigger automatic retries, service switches, or language switches. Users MUST be able to explicitly retry still-valid current input; repeated retry activation MUST NOT create concurrent duplicate requests. Waiting, in-flight, successful, configuration-blocked, input-blocked, and failed states MUST be distinguishable, and failure MUST preserve source text for editing.

### Requirement: Locale theme and keyboard behavior MUST remain consistent

Translation MUST follow Host locale and theme without changing request identity. Keyboard operation, settings focus recovery, assistive-technology feedback, and IME priority MUST remain intact. Text controls retain native caret and selection without label underlines or decorative focus boxes; other interactive controls retain visible focus.

#### Scenario: User changes Host locale and theme
- **WHEN** the current page receives a new interface-language or theme Context
- **THEN** control copy, accessible names, and theme update together
- **THEN** current source text, translated text, language values, and request conditions remain unchanged without additional service calls

#### Scenario: Keyboard user configures the service
- **WHEN** the user opens settings, edits fields, and saves or cancels using only the keyboard
- **THEN** each operation is reachable and settings controls retain visible focus; Back to translation leaves the dedicated settings view
- **THEN** returning first makes the workspace visible, then restores its scroll position and still-existing settings-trigger focus, while source text remains unchanged

#### Scenario: A loading or failure state is presented
- **WHEN** the plugin is waiting, requesting, or displaying a configuration error, input error, or request failure
- **THEN** routine states are distinguished by visually hidden live-region text and busy semantics; actionable errors show localized text and recovery near language controls
- **THEN** state meanings do not depend solely on colors or icons, and no status or metadata appears below the translation

#### Scenario: Apply a presentation Context update without resubmission
- **WHEN** the page renders from the current Host Context or receives a locale or theme update
- **THEN** All visible copy, settings explanations, states, errors, language option names, and accessible names MUST support English and Simplified Chinese and follow the current Host Context; the interface MUST support light and dark themes. Host locale or theme updates MUST NOT change translation conditions, resend translation requests, or overwrite user text or selected languages.

#### Scenario: Operate settings and translation controls with the keyboard
- **WHEN** the user edits text, selects languages, or opens, operates, or closes settings and recovery controls
- **THEN** input, language selection, swap, settings, save, cancel, and retry remain keyboard-operable; source/translation labels gain no focus underline and text controls gain no decorative focus box, while native caret and selection remain intact and other interactive controls retain visible focus
- **THEN** entering settings scrolls to the top and focuses credentials; Back, Cancel, or successful save restores scrolling and trigger focus after the workspace is visible, and Escape returns unless the input method is using the key
- **THEN** routine state uses assistive-technology text semantics and actionable errors provide visible text; shortcuts or panel interactions do not submit composition drafts as translations

### Requirement: Runtime lifecycle MUST bound all translation work and page memory

The same Runtime MUST retain page state across temporary hide/restore. Ending or replacing an attempt MUST cancel work, release subscriptions, invalidate callbacks, and start the next attempt with empty text.

#### Scenario: Launcher is hidden and restored
- **WHEN** the Launcher is temporarily hidden and restored, and the Host confirms that it is still the same current Runtime
- **THEN** current source text, translated text, languages, and settings state are retained
- **THEN** restoring the display does not by itself trigger duplicate translation

#### Scenario: Page closes while a request is pending
- **WHEN** the page closes or the Runtime terminates with a pending debounce wait or request
- **THEN** the plugin cancels local work and invalidates callbacks
- **THEN** no background scheduling continues after leaving, and late results do not enter any new page

#### Scenario: Plugin is replaced or SDK is recreated
- **WHEN** plugin replacement, reload, or SDK recreation creates a new Runtime attempt
- **THEN** the new attempt reacquires context and persistent configuration and begins with empty source and translated text
- **THEN** the preceding attempt's request results, errors, and memory contents cannot be restored as current state

#### Scenario: Restore a temporarily hidden current Runtime
- **WHEN** Launcher hides and restores the same active Runtime
- **THEN** When the Launcher is temporarily hidden and the same current Runtime is restored, the plugin MUST retain current text, languages, settings drafts, and request state, following existing Host continuity behavior; hiding itself MUST NOT be treated as closing or reopening, and restoration MUST NOT repeat a request merely to display the page again.

#### Scenario: Retire translation work when an attempt ends
- **WHEN** the page is closed or navigated away from, the plugin is disabled, uninstalled, replaced, or reloaded, or the Runtime or SDK is terminated or recreated
- **THEN** On page close, navigation away, disablement, uninstall, replacement, development reload, Runtime termination, or SDK recreation, the plugin MUST cancel debounce work, requests, deadline timers, and subscriptions, and invalidate all old callbacks. A new Runtime attempt MUST reload persistent configuration using fresh context and begin with empty source and translated text, and MUST NOT restore the preceding attempt's contents, errors, or requests. Translation MUST NOT continue in the background after the page is left.

### Requirement: Delivery MUST use deterministic validation and self-contained plugin artifacts

Delivery MUST prove translation and configuration behavior with deterministic tests and self-contained package checks. It MUST retain explicit limits on claims about real services, WebViews, and native copy.

#### Scenario: Deterministic behavior validation runs
- **WHEN** plugin validation uses controlled time, service responses, and storage responses to cover success, failure, and lifecycle conditions
- **THEN** current-result consistency, credential boundaries, and user-observable behavior can be verified without calling the real translation service
- **THEN** signing results match fixed expected values

#### Scenario: Plugin package is built and checked
- **WHEN** direct-plugin CI executes plugin lifecycles and pure CLI artifact checks
- **THEN** plugin artifacts satisfy self-containment, public-interface, package-structure, and reproducible-packaging requirements
- **THEN** validation does not depend on private Host imports, Node browser shims, real GUI, or third-party keys

#### Scenario: Delivery evidence is reported
- **WHEN** deterministic tests, static checks, builds, and package checks all pass
- **THEN** the report explicitly limits the verified scope
- **THEN** unperformed real-account, real-WebView, and native-copy checks are not claimed to have passed

#### Scenario: Run controlled translation and signing validation
- **WHEN** translation delivery tests are planned or run against text, storage, transport, and signing behavior
- **THEN** Plugin delivery MUST include deterministic evidence covering text and language behavior, configuration and credential persistence semantics, request signing, service success and failure, cancellation and late results, timing boundaries, bilingual themes, keyboard focus, and Runtime termination. Service and storage error paths MUST be verifiable without real credentials or real translation requests; signing correctness MUST be verified with reproducible fixed inputs and expected results.

#### Scenario: Build and inspect a self-contained Translation package
- **WHEN** the plugin artifacts are built, validated, packaged, inspected, or reported as delivery evidence
- **THEN** Build artifacts MUST be self-contained, satisfy the current public plugin-package contract, support pure CLI validation, packaging, and inspection, and participate in existing direct-plugin lifecycles and CI. Maintained acceptance MUST NOT launch a browser, real WebView, GUI, or native interaction harness, and MUST NOT use screenshots, pixel baselines, real paid services, or target-environment performance results as Gates. Passing deterministic validation MUST NOT be described as verification of real-account translation, actual WebView networking, or operating-system copy behavior.
