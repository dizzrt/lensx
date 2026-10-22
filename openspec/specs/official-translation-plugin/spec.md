# official-translation-plugin Specification

## Purpose

Define the text input, automatic translation, language selection, in-plugin service settings, local credential persistence, and Volcengine request contracts for the standalone lensX Translation plugin, so users can translate short text within the current plugin page and distinguish current results, pending work, and recoverable errors.

## Requirements

### Requirement: Translation MUST be a standalone foreground plugin

The system MUST provide a standalone plugin with ID `dev.lensx.translation` and package name `@lensx/official-translation`, contributing one `main` Page and one `open` Action targeting that Page, named `Translation` in English and `翻译` in Simplified Chinese. The Page MUST declare an initial logical size of `800×600` and allow resizing, while its actual presentation MUST follow existing Host workspace constraints. The plugin MUST follow the existing Manifest, isolated Web Runtime, public Host API, and installation lifecycle contracts; official status MUST NOT grant private Host, Tauri, filesystem, process, Node Runtime, or background execution privileges. The Translation plugin MUST require Host API `>=0.3.0 <0.4.0` and invoke the public HTTP capability only after the current Context advertises `http.request`.

#### Scenario: User opens Translation
- **WHEN** the user executes the currently available `dev.lensx.translation.open` Action
- **THEN** the Host opens the plugin's `main` Page and displays `Translation` or `翻译` according to the current interface language
- **THEN** the plugin uses the same isolation, context, and lifecycle boundaries as other plugins

#### Scenario: Official plugin attempts a private capability
- **WHEN** the plugin implementation or package artifact depends on nonpublic Host, Tauri, native proxy, Node Runtime, or persistent background execution capabilities
- **THEN** the artifact does not satisfy this capability's delivery contract
- **THEN** official provenance cannot justify bypassing public plugin boundaries

### Requirement: Translation workspace MUST use vertically arranged multiline text areas

The plugin MUST provide an editable multiline source text area in the upper portion and a readonly multiline translation text area in the lower portion, with clear, accessible, localized labels. Translated text MUST be displayed as plain text and MUST NOT be interpreted as HTML or executable content. The translation text area MUST allow text selection and native browser copy operations, and MUST NOT add or invoke a Host clipboard interface for copying. Source and translated text MUST initially be empty, and source text, translated text, and request state MUST remain only in the current page's memory.

#### Scenario: User enters and selects multiline text
- **WHEN** the user enters source text containing line breaks and obtains a successful translation
- **THEN** the upper text area retains the source and the lower readonly text area displays its corresponding translation
- **THEN** the user can select and natively copy the translation but cannot edit it directly

#### Scenario: Service returns markup-shaped text
- **WHEN** a successful translation contains tags, script-shaped strings, or other markup text
- **THEN** the translation is displayed literally as text without creating elements, executing scripts, or navigating automatically

#### Scenario: Page starts with no text
- **WHEN** the user opens a new Translation page
- **THEN** source and translated text are empty, and the page does not restore text or translation history from the preceding page
- **THEN** the page displays an empty state and sends no translation request

### Requirement: Plugin settings MUST remain inside the current document

The plugin MUST provide a settings panel within the same page document, containing service selection, corresponding credentials, and explicit save and cancel actions. The first version's service choices MUST contain only Volcengine; settings MUST NOT extend the Host's main settings or create additional Host pages. Opening, editing, saving, and cancelling the panel MUST preserve the current source text and language selections, and cancellation MUST discard unsaved configuration drafts.

While the settings panel is open, the plugin MUST pause automatic translation scheduling and cancel pending or in-flight requests. After the panel closes, scheduling MUST resume according to the current source text, languages, and confirmed configuration; if the request conditions associated with a successful translation remain unchanged, the plugin MUST retain that translation and MUST NOT repeat a request merely because the panel opened or closed. Current input whose work was cancelled without a successful result MUST be eligible for rescheduling after the panel closes.

#### Scenario: User edits settings then cancels
- **WHEN** the user opens settings, changes service credentials, and chooses cancel
- **THEN** source text and language selections are preserved, and the unsaved draft does not take effect
- **THEN** the plugin resumes using its previously confirmed configuration and retains a successful translation whose conditions have not changed

#### Scenario: Settings opens during translation
- **WHEN** the user opens settings during a debounce wait or an in-flight translation request
- **THEN** the plugin cancels that work and stops automatically submitting translation requests
- **THEN** after the panel closes, scheduling resumes only for current input that still needs a result, and late results from old requests cannot update the translation

#### Scenario: Only the first provider is available
- **WHEN** the user expands the service selector
- **THEN** only Volcengine can be selected, and the page does not present unimplemented services as available choices
- **THEN** this configuration operation neither enters nor modifies the Host's main settings

### Requirement: Configuration MUST load before any translation request

The plugin MUST read saved configuration after the current Runtime's first ready context, and MUST prohibit translation requests until configuration has loaded successfully, valid service credentials are available, and language state is determined. Missing configuration MUST be distinguished from a read failure or invalid stored contents; missing configuration MUST guide the user to configure the service, while a read failure or invalid configuration MUST provide a localized error and explicit recovery action. The plugin MUST NOT treat a read failure as first use or silently overwrite existing storage with defaults.

When the configuration version is known and all other fields are valid but the saved target language is no longer supported, the plugin MUST retain the validated fields and allow the user to explicitly select a valid target language, resuming translation after the save is confirmed; repair MUST preserve unchanged credentials. An unknown version or structurally damaged record MUST remain intact, and speculative writes MUST be blocked.

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

### Requirement: Service configuration MUST use confirmed persistence semantics

When the user saves service configuration, the plugin MUST validate the service and required Access Key ID and Secret Access Key, then persist them through the existing plugin-scoped `storage.*` boundary. Only configuration whose persistence has been successfully confirmed MUST become the configuration used for translation; duplicate submissions MUST be prevented during saving, and failure MUST retain the most recently confirmed configuration and display failure feedback. If a write may have committed but its response is lost or its outcome is ambiguous, the plugin MUST reread and reconcile persistent state before determining the effective configuration, and MUST NOT guess success, pretend to roll back, or blindly repeat the write.

Service configuration and target-language writes MUST be serialized, preserving unchanged fields from the latest confirmed configuration; while a write is pending, the plugin MUST block conflicting configuration submissions and pause translation scheduling while still allowing source text editing. Configuration read or write callbacks from any invalidated Runtime MUST NOT update a new page, roll back the current Context, or overwrite newer user choices.

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

### Requirement: Credentials MUST have explicit local unencrypted storage semantics

AK/SK and service configuration MUST be saved in local unencrypted storage scoped to the current plugin, and MUST NOT be described as using an operating-system keychain or encrypted vault. The settings interface MUST clearly explain the storage method and mask credential inputs. Credentials MUST NOT enter logs, diagnostics, visible errors, package artifacts, or committed content; error presentation MUST NOT directly expose request headers, signatures, raw exceptions, or raw third-party responses. The plugin MUST NOT persist source text, translated text, or translation history.

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

### Requirement: Source and target languages MUST have distinct initialization and persistence rules

On every newly opened page, the source language MUST default to automatic detection; users MUST be able to select a supported source language manually, and a manual source selection MUST apply only to the current page without persistence. The target language MUST preferentially restore a valid saved user choice. Without a saved target language, the target MUST initialize from the interface language of the current Runtime's first ready Host Context using `en-US → en` and `zh-CN → zh`; this derived default MUST NOT be written to storage automatically.

An explicit user target-language selection MUST automatically start persistence without requiring a separate save action; only after saving succeeds MUST the selection become the effective target language and invalidate results for the old language direction, and subsequent pages MUST preferentially restore that choice. A save failure MUST preserve the previous effective choice; when that choice was only a derived default, the default MUST remain without claiming that the user's selection was saved. An ambiguous submission outcome MUST follow the configuration reread-and-reconcile contract.

During the current page's lifetime, Host interface-language changes MUST affect only interface copy and corresponding control localization, and MUST NOT change the current target language or trigger translation. When a subsequent page opens and there is still no saved target language, it MUST derive the default again from that page's first ready Host Context. If storage reads complete after later Context events, derivation of an unsaved target language MUST still use the page's first ready Context. A saved but currently unsupported language MUST produce a configuration problem and MUST NOT silently replace the user's choice.

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

### Requirement: Language choices MUST respect the provider language and direction contract

The language set included in a plugin release MUST match the official Volcengine text-translation support table checked for that release, and maintained documentation MUST record the snapshot source, date, and verification results. Source-language choices MUST include automatic detection, while target-language choices MUST exclude it. `sk` MUST be available only as a target; `bo`, `nan`, `wuu`, `yue`, `cmn`, and `ug` MUST be available only as sources and MUST allow translation only to `zh`. An explicitly invalid language direction MUST be reported before a request and MUST NOT silently rewrite the selected languages.

Restricted directions that cannot be determined before automatic detection MUST be determined from the service result; on `-415`, the plugin MUST display a localized unsupported-direction message and allow language changes, and MUST NOT switch languages automatically, make another billable call, or treat failure as a successful translation.

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

### Requirement: Input changes MUST trigger debounced translation without composition requests

When configuration and language conditions are satisfied and the settings panel is closed, source-text changes MUST schedule translation 400ms after the last effective edit. Translation MUST NOT be submitted during input-method composition; after composition ends, timing MUST restart from the final committed text. Repeated input events that do not change the value MUST NOT create new requests. Empty or whitespace-only source text MUST clear the translation and request-related feedback, cancel waiting and in-flight work, and MUST NOT send a request; non-whitespace-only source text MUST preserve its spaces and line breaks without silent trimming for requests.

#### Scenario: User types continuously
- **WHEN** the user types continuously with less than 400ms between edits
- **THEN** the plugin sends no requests for intermediate text
- **THEN** only the final text is scheduled after 400ms have elapsed since the last effective edit

#### Scenario: User enters text with an input method
- **WHEN** input-method composition has not ended, even if more than 400ms elapse
- **THEN** the plugin does not request translation of the composition draft
- **THEN** after composition ends, a new 400ms wait starts from the final text

#### Scenario: Input event repeats the same value
- **WHEN** a repeated input event does not change the current source text
- **THEN** the existing successful result or current request state remains consistent
- **THEN** the plugin creates no duplicate request

#### Scenario: User clears the input
- **WHEN** the user clears the source text or changes it to whitespace only
- **THEN** the translation and old request feedback are cleared, and waiting or in-flight work is cancelled
- **THEN** late results cannot restore the cleared translation

### Requirement: Each request MUST enforce a bounded unsplit text input

Input MUST first be evaluated under the whitespace contract; whitespace-only text MUST enter the empty state without a request even when it exceeds 5000 characters. Non-whitespace-only source text for one translation MUST contain no more than 5000 Unicode code points. On exceeding the limit, the plugin MUST retain the complete editable source and show localized limit feedback, and MUST NOT send a request, silently truncate the text, or split it automatically. Normal scheduling MUST resume once input returns within the limit and other conditions are satisfied. Counting MUST NOT treat a UTF-16 surrogate pair representing one Unicode code point as two characters; each code point in a combining-character sequence MUST be counted separately.

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

### Requirement: Results MUST match the latest request conditions and Runtime attempt

Only the latest request result matching all of the current source text, source language, target language, service, confirmed configuration revision, and Runtime attempt MUST update the translation or request-error state. When any of these conditions changes, the plugin MUST immediately invalidate old work and clear any old translation that no longer matches; even when cancellation cannot prevent a late response, that response MUST still be discarded. Success, failure, timeout, and completion callbacks from stale requests MUST NOT overwrite current results, errors, or loading state.

The request configuration revision MUST change only when configuration contents that affect the request actually change. Saving unchanged configuration or persisting the current derived target as the same language MUST NOT invalidate a successful translation or request translation again merely because persistence was confirmed.

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

### Requirement: Volcengine requests MUST follow the documented translation contract

The first version MUST call `https://translate.volcengineapi.com/` over HTTPS using `POST`, `Action=TranslateText`, and `Version=2020-06-01`, with signing region `cn-north-1` and service `translate`. Requests MUST use the currently confirmed AK/SK to generate authentication that follows the official signing contract, and the signed content MUST match the actual path, query, headers, and JSON body sent. Requests MUST delegate controlled Rust Host transport through public SDK `http.request`, without sharing Cookies or system credentials, following redirects, or retrying automatically, and the service address MUST be fixed; the plugin MUST NOT offer a custom endpoint or load remote scripts. Translation business logic, AK/SK configuration, signing, and service-response validation MUST remain inside the plugin; the Host MUST perform only generic HTTP and contain no Volcengine exceptions, signing, or translation rules. The plugin MUST NOT invoke private Tauri channels or Node Runtime, and MUST NOT fall back to WebView fetch. The page MUST briefly explain that source text will be sent to the selected service, and MUST NOT add a Host permission prompt for ordinary network requests.

The request body's `TextList` MUST contain exactly one complete source text, and `TargetLanguage` MUST be the current target language. Automatic source detection MUST omit `SourceLanguage`; manual selection MUST submit its corresponding language code. Requests MUST NOT automatically add terminology libraries, models, other translation services, or business options not configured by the current interface.

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

### Requirement: Response handling MUST distinguish service errors from valid translated text

The plugin MUST check the HTTP result, response size, JSON structure, and `ResponseMetadata.Error` before presenting a translation. Non-2xx responses MUST also be read within the same size boundary and parsed for service errors, and MUST NOT lose a parseable vendor error category merely because HTTP failed. Even with HTTP status 200, a valid service error in `ResponseMetadata.Error` MUST be handled as failure. Known `Code` values or integer `CodeN` values MUST be used for safe classification, including `InvalidAccessKey`, `InvalidCredential`, and `100009`; unrecognized values MUST retain the service-error fallback without displaying the raw Message. A successful response MUST have a successful HTTP status, no service error, exactly one valid `TranslationList` entry, and a string `Translation` in that entry; missing responses, invalid shapes, incorrect entry counts, or incorrect translation types MUST become recoverable response errors and MUST NOT display partial, guessed, or stringified-object results.

The response body read MUST be limited to 1 MiB; exceeding this limit MUST stop processing and display a safe error. Raw third-party error messages, HTML, and raw responses MUST NOT enter user feedback directly. A `RequestId` MUST be eligible for display only when it contains 1–128 ASCII characters matching `[A-Za-z0-9._:-]+`; other service fields MUST NOT be passed through directly as displayable diagnostics.

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
- **THEN** the lower text area displays that string translation and ends the current loading state
- **THEN** other response fields are not mixed into the translated text

#### Scenario: Response is malformed or oversized
- **WHEN** the response is invalid JSON, has an incorrect structure, lacks a valid translation, has an incorrect entry count, or exceeds 1 MiB in body size
- **THEN** the plugin rejects the response and displays a recoverable error
- **THEN** the page does not display raw response text, partially parsed values, or an old translation as the current result

#### Scenario: Error response includes unsafe diagnostic data
- **WHEN** a service error contains raw messages, HTML, credential-shaped content, or a RequestId that violates safety constraints
- **THEN** the plugin displays product-owned localized error copy and ignores unsafe diagnostic fields
- **THEN** the page neither directly renders nor logs raw third-party error contents

### Requirement: Failures MUST have bounded deadlines and explicit retry

Every actual translation request MUST use a 15-second total deadline covering plugin signing, SDK round trips, native network requests, and response reading and processing; HTTP timeout MUST use the remaining deadline, and cancellation MUST propagate to the Host provider; after the deadline, local waiting MUST end with timeout feedback. The plugin MUST provide safe localized classifications or fallbacks for network unavailability, timeout, authentication or signing failure, service activation or account status, rate limits or quotas, unsupported parameters or language direction, invalid responses, and unknown service errors. Host transport failures MUST produce network, timeout, limit, or unavailable feedback based on safe errors, and MUST NOT be described as browser CORS failures.

Request failures MUST NOT trigger automatic retries, service switches, or language switches. Users MUST be able to explicitly retry still-valid current input; repeated retry activation MUST NOT create concurrent duplicate requests. Waiting, in-flight, successful, configuration-blocked, input-blocked, and failed states MUST be distinguishable, and failure MUST preserve source text for editing.

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

### Requirement: Locale theme and keyboard behavior MUST remain consistent

All visible copy, settings explanations, states, errors, language option names, and accessible names MUST support English and Simplified Chinese and follow the current Host Context; the interface MUST support light and dark themes. Host locale or theme updates MUST NOT change translation conditions, resend translation requests, or overwrite user text or selected languages.

Input, language selection, settings, save, cancel, and retry MUST be operable using only the keyboard with visible focus. Opening settings MUST move focus to an appropriate actionable position inside the panel, and closing or cancelling MUST return focus to the trigger control if it still exists. Escape within the settings panel MUST close the panel first, while keys currently used by an input method MUST retain their default handling. Loading and errors MUST be conveyed through text and accessible semantics and MUST NOT rely only on colors or icons; shortcuts or panel interactions MUST NOT mistakenly submit input-method composition as a translation.

#### Scenario: User changes Host locale and theme
- **WHEN** the current page receives a new interface-language or theme Context
- **THEN** control copy, accessible names, and theme update together
- **THEN** current source text, translated text, language values, and request conditions remain unchanged without additional service calls

#### Scenario: Keyboard user configures the service
- **WHEN** the user opens settings, edits fields, and saves or cancels using only the keyboard
- **THEN** each operation is reachable and focus is visible
- **THEN** closing the panel returns focus to the settings trigger if it still exists, and source text remains unchanged

#### Scenario: A loading or failure state is presented
- **WHEN** the plugin is waiting, requesting, or displaying a configuration error, input error, or request failure
- **THEN** users and assistive technology can distinguish the states through labels, text, and state semantics
- **THEN** state meanings do not depend solely on colors or icons

### Requirement: Runtime lifecycle MUST bound all translation work and page memory

When the Launcher is temporarily hidden and the same current Runtime is restored, the plugin MUST retain current text, languages, settings drafts, and request state, following existing Host continuity behavior; hiding itself MUST NOT be treated as closing or reopening, and restoration MUST NOT repeat a request merely to display the page again.

On page close, navigation away, disablement, uninstall, replacement, development reload, Runtime termination, or SDK recreation, the plugin MUST cancel debounce work, requests, deadline timers, and subscriptions, and invalidate all old callbacks. A new Runtime attempt MUST reload persistent configuration using fresh context and begin with empty source and translated text, and MUST NOT restore the preceding attempt's contents, errors, or requests. Translation MUST NOT continue in the background after the page is left.

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

### Requirement: Delivery MUST use deterministic validation and self-contained plugin artifacts

Plugin delivery MUST include deterministic evidence covering text and language behavior, configuration and credential persistence semantics, request signing, service success and failure, cancellation and late results, timing boundaries, bilingual themes, keyboard focus, and Runtime termination. Service and storage error paths MUST be verifiable without real credentials or real translation requests; signing correctness MUST be verified with reproducible fixed inputs and expected results.

Build artifacts MUST be self-contained, satisfy the current public plugin-package contract, support pure CLI validation, packaging, and inspection, and participate in existing direct-plugin lifecycles and CI. Maintained acceptance MUST NOT launch a browser, real WebView, GUI, or native interaction harness, and MUST NOT use screenshots, pixel baselines, real paid services, or target-environment performance results as Gates. Passing deterministic validation MUST NOT be described as verification of real-account translation, actual WebView networking, or operating-system copy behavior.

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
