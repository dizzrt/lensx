# plugin-child-webview-runtime Specification

## Purpose

Define the Host-owned presentation of one current plugin as a native Child
WebView in the Launcher, including revisioned content-slot bounds, current-source
navigation policy, semantic-equivalent lifecycle reuse, compare-current teardown,
and deterministic validation of native authority and lifecycle boundaries.

## Requirements

### Requirement: Host MUST present one current plugin as a native Child WebView sibling

When the current Page belongs to an executable external plugin, the Host MUST create a Child WebView inside the Launcher native window and make it a native sibling of the trusted Host WebView.

#### Scenario: External Page enters ready presentation
- **WHEN** current Registration, Page, Resource, and Runtime facts converge and the Child WebView completes load and Session readiness
- **THEN** the Host displays that Child WebView inside the assigned plugin content slot and hides loading feedback
- **THEN** Host chrome continues to be rendered by the trusted Host WebView, and the plugin cannot cover or move outside the slot

#### Scenario: Host overlay must cover the plugin region
- **WHEN** the Host must present Settings, a confirmation dialog, or terminal failure feedback
- **THEN** the Host compare-current hides or destroys the Child WebView before presenting the trusted overlay
- **THEN** the native subview cannot obscure Host-owned interaction or intercept its focus

#### Scenario: Create the current native plugin view

- **WHEN** the Host creates, presents, updates, or destroys the current plugin Child WebView
- **THEN** React MUST only declare the Host-owned plugin content slot; Rust MUST exclusively own Child WebView creation, label, bounds, visibility, focus, navigation hooks, data store, and destroy authority.
- **THEN** The system MUST have at most one current plugin Child WebView at a time, and the plugin MUST NOT submit or receive a native handle, window, position, size, z-order, or WebView configuration.

### Requirement: Host MUST provide an edge-to-edge content slot below plugin Page chrome

When a current Page is provided by a plugin, the trusted Host MUST keep Page chrome outside the plugin content rectangle and MUST assign the Child WebView slot all remaining Launcher body space directly below that chrome.

#### Scenario: Ordinary plugin Page enters its content slot

- **WHEN** an external or Development Mode plugin Page becomes current below the trusted Host Page chrome
- **THEN** its Host-owned Runtime slot begins directly after the chrome and extends to the remaining inline and bottom edges without Host body inset, inter-region gap or inner card radius
- **THEN** the plugin remains confined to that slot and cannot cover, replace or measure Host chrome through privileged APIs

#### Scenario: Official ConfigLens uses the ordinary slot

- **WHEN** the official ConfigLens Page and an equivalent external plugin Page resolve through the same provider and Runtime path
- **THEN** the Host selects the same edge-to-edge body layout from provider kind rather than official provenance
- **THEN** ConfigLens receives no special Host import, Runtime branch, native authority or bounds input

#### Scenario: Non-plugin surfaces retain their layouts

- **WHEN** the Launcher presents Home, Search or a Host-owned Page
- **THEN** the plugin edge-to-edge body state is absent and those surfaces retain their maintained padding, gap and resizable behavior
- **THEN** no hidden or stale plugin slot affects their layout or focus

#### Scenario: Plugin Page geometry changes

- **WHEN** Window size, scale, locale, theme or Host Page chrome changes the edge-to-edge content rectangle
- **THEN** the trusted Host advances the current slot revision and converges the same modeled Child WebView attempt on the newest valid physical bounds
- **THEN** the change causes no document reload, Session replacement, plugin-supplied geometry, native setter exposure or stale-attempt mutation

#### Scenario: Assign the ordinary plugin content rectangle

- **WHEN** the trusted Host lays out a current plugin Page
- **THEN** The plugin Page body MUST add no Host-owned inline padding, bottom padding, inter-region gap, or inner card radius around the Runtime slot.
- **THEN** The outer Launcher surface MAY continue to clip the complete native Window shape.
- **THEN** This layout MUST be selected from the trusted Page provider kind and MUST apply identically to official, external, and Development Mode plugins; plugin identity, Publisher, repository location, release metadata, or Runtime content MUST NOT select a special layout path.

#### Scenario: Measure and publish slot changes

- **WHEN** Window, scale, locale, theme, or Page chrome changes the Host-owned slot
- **THEN** React MUST continue to declare and measure only the Host-owned slot.
- **THEN** Slot changes caused by Window resize, scale, locale, theme, or Page chrome MUST continue through the current revisioned physical-bounds path and Rust validation without a plugin-supplied bounds input, Runtime reload, Session replacement, new native setter, or public contract change.

#### Scenario: Render a non-plugin Host surface

- **WHEN** the Host presents Home, Search, or a Host-owned Page
- **THEN** Home, Search and Host Pages MUST retain their own Host layouts.

### Requirement: Child WebView navigation MUST be top-level, current and Host-derived

When creating a Child WebView, the Host MUST bind the exact entry, route, plugin, Page, origin, resource generation, and Runtime attempt.

#### Scenario: Current package document commits
- **WHEN** the current Child WebView navigates to the exact entry and route derived by the Host from the Resource Service
- **THEN** the native policy allows that main-document commit and continues to validate the current WebView and generation binding
- **THEN** the allow decision grants no general Tauri, Host DOM, or other-plugin authority

#### Scenario: Plugin attempts top-level escape
- **WHEN** the plugin attempts to navigate the Child WebView main document to a remote, old-generation, `file:`, `data:`, `blob:`, or other-plugin URL
- **THEN** the native policy rejects the navigation before commit and preserves the current document or terminates the attempt
- **THEN** the failure reveals no complete URL, scope, path, WebView label, or Host-private error

#### Scenario: Commit or reject Child navigation

- **WHEN** a current Child WebView attempts a package-document, route, or escaping navigation
- **THEN** The native navigation hook MUST allow only the current exact package-document commit and the Host-derived same-document route; plugin-initiated top-level remote navigation, package escape, `file:`, `javascript:`, `data:`, or `blob:` navigation, popup, new-window, and download MUST fail closed.

#### Scenario: Resolve ordinary Child subresources and connections

- **WHEN** a Child WebView loads a Web subresource or opens a connection
- **THEN** Ordinary Web subresource and connection behavior MUST continue to follow the open isolated Runtime baseline and MUST NOT change top-level document identity.

### Requirement: Native slot MUST remain revisioned, scale-correct and Host-controlled
The Host MUST coordinate React and Rust through a typed slot update containing the window, surface mode, scale factor, physical bounds, and presentation revision. Rust MUST reject stale, out-of-window, non-finite, negative, or out-of-bounds values; window resize, Retina scale changes, Page chrome changes, and locale or theme layout changes MUST converge on the current Child WebView. Plugin messages MUST NOT be a bounds input.

#### Scenario: Slot bounds change
- **WHEN** Host Page layout or window scale changes the current plugin content rectangle
- **THEN** the current revision updates the same Child WebView bounds in physical pixels without reloading the document or Session
- **THEN** a stale update cannot move a replacement or later attempt

#### Scenario: Invalid bounds arrive
- **WHEN** the adapter receives a stale revision, wrong window, out-of-range bounds, or invalid numeric bounds
- **THEN** the Host rejects the update and either fails the current presentation closed or retains the last verified bounds
- **THEN** the plugin cannot use layout messages to control the native surface

### Requirement: Child WebView lifecycle MUST preserve only semantic-equivalent activation

Launcher hide and restore, same-Page shortcut activation, and Registration revisions affecting only other plugins MUST reuse the same Child WebView and Session while the current identity, entry, route, origin, resource generation, and attempt remain unchanged.

#### Scenario: Launcher hides and restores current plugin

- **WHEN** the Launcher is temporarily hidden and restored while current plugin facts remain semantically equivalent
- **THEN** the Host reuses and focuses the same modeled Child WebView attempt and preserves its Page, Worker, and Session identity
- **THEN** restore performs no resolve, create, navigation, resource read, SDK bootstrap, model creation, or Worker creation

#### Scenario: Current plugin is replaced

- **WHEN** replacement commits a new resource generation
- **THEN** the Host first revokes the old bridge, Session, resource authority and cache eligibility and destroys the old Child WebView, then creates a new attempt
- **THEN** the old WebView, Worker, cached lookup, network callback, and late native event cannot affect the new generation

#### Scenario: Restore or terminate a Child attempt

- **WHEN** the Launcher restores the same valid Page or a lifecycle event terminates its attempt
- **THEN** Same-attempt restore MUST NOT resolve, create, navigate, read document resources, bootstrap the SDK, recreate a model or Worker, or show a fresh plugin-page loading cycle.
- **THEN** Close, Page replacement, disable, uninstall, replacement, upgrade, development reload, explicit retry, Session disconnect, bridge fatal failure, breaker, Host reload, App unmount, and process exit MUST make the old attempt terminal and destroy the Child WebView, without retaining a hidden Runtime, pool, or background execution.

#### Scenario: Validate Child activation and terminal cleanup

- **WHEN** deterministic tests evaluate same-attempt activation and terminal lifecycle behavior
- **THEN** Deterministic controller, state, call-count, and cleanup tests MUST cover these invariants without target macOS latency sampling.

### Requirement: User-resized plugin Pages MUST converge through the Host-owned slot

When native user resizing is enabled by the current validated Page presentation, Window resize bursts, monitor/work-area fitting, Retina scale changes, Page chrome changes, and locale/theme layout changes MUST be observed only by the trusted Host layout and MUST produce serialized, latest-wins presentation revisions for the current Child WebView.

#### Scenario: User drags a resizable plugin Window
- **WHEN** the user continuously resizes a current opted-in plugin Page
- **THEN** Host DOM/window observation advances bounded slot revisions and Rust applies the newest valid physical bounds to the same Child WebView
- **THEN** the Page remains interactive through the same attempt, document, Session, models, and Workers

#### Scenario: Scale or monitor work area changes during resize
- **WHEN** the current Window changes scale factor or monitor/work-area constraints while a plugin Page remains current
- **THEN** the Host recomputes effective logical constraints and scale-correct physical slot bounds
- **THEN** no plugin message, content, author DOM size, or old scale revision becomes a native bounds input

#### Scenario: Late resize targets a replaced Page
- **WHEN** a queued resize revision from Page A completes after Page B has become current
- **THEN** compare-current validation makes A's update inert
- **THEN** B follows only its own presentation and slot revision sequence

#### Scenario: Resized Page is hidden and restored
- **WHEN** an equivalent current plugin Page is user-resized, semantically hidden, and restored
- **THEN** the same Child WebView reappears in the preserved current slot without a fresh create or initial-size replay
- **THEN** actual Page close still destroys the attempt and a later open uses the Manifest initial size

#### Scenario: Converge current Child presentation bounds

- **WHEN** trusted Host layout publishes native resize or presentation revisions
- **THEN** The final accepted physical bounds MUST converge on the current Host-owned content slot without document reload, Session replacement, model/Worker recreation, or plugin-supplied bounds.
- **THEN** Intermediate revisions MAY be coalesced, but a stale attempt MUST never resize, reveal, focus, or destroy a replacement.

### Requirement: Child WebView delivery MUST pass deterministic security and lifecycle validation

Delivery MUST combine Rust unit and integration tests, TypeScript controller and state tests, React accessibility/localization/theme tests, canonical normal and malicious packages, public-package boundary checks, builds, and deterministic artifact checks.

#### Scenario: Deterministic Child WebView matrix passes

- **WHEN** the maintained Rust, TypeScript, React, package, and malicious-fixture checks run
- **THEN** lifecycle behavior, source authority, cleanup, shortcut focus policy, single-edit results, and public/private boundaries pass assertions at their respective layers
- **THEN** all plugins share the specified Runtime path, and results are explicitly limited to deterministic evidence without claims of actual native-key or clipboard delivery

#### Scenario: Environment-only validation remains

- **WHEN** a maintained Gate or script launches a real Child WebView, drives native interaction, measures target latency, or reads/writes environment acceptance artifacts
- **THEN** validation governance fails
- **THEN** the entry and assets are deleted without retaining an optional, manual, or compatibility validation path

#### Scenario: Keyboard policy is exercised without native interaction

- **WHEN** fake native responders exercise the production policy for focused, hidden, replaced, absent-target, and Host-reserved-command cases
- **THEN** decisions, dispatch order, invocation counts, handled/unhandled results, and fallback propagation are verifiable, and compilation and wiring checks confirm production use of the policy
- **THEN** modeled results are not described as real macOS key measurements, and a single handler returning success is not taken as proof that target text was edited

#### Scenario: DOM clipboard events verify actual editing logic

- **WHEN** deterministic fixtures provide explicit selections, copy/cut events, or external paste text to real control/editor event-handling paths
- **THEN** assertions verify actual output text, target content, input notifications, undo/redo, and current focus, rather than only event or service invocation
- **THEN** fixture memory data and any modeled default behavior are identified, and the results do not prove that the OS converted real keypresses into ClipboardEvent delivery

#### Scenario: An earlier handling stage must prevent duplicate editing

- **WHEN** the Web target has handled or cancelled default behavior, or a native editing branch has completed the command, while another candidate path can still observe the event
- **THEN** production dispatch-policy tests prove the later path does not repeat the command, with paste/cut/undo results changing only once
- **THEN** unhandled or invalid-target negative cases still prove continued propagation without incorrectly editing an old Page

#### Scenario: Asynchronous handling and native redispatch retain one gesture

- **WHEN** deterministic production-policy cases model native takeover remaining pending, final Web handling, finally confirmed unhandled reentry, and focus changes/target invalidation/Child replacement before reentry
- **THEN** pending handling does not trigger an early menu, legal reentry is not counted as another user gesture, and an applicable native command continues only after confirmed non-handling with a still-valid target
- **THEN** any repair-owned delayed compensation stays bound to the original event target and is cancelled after focus or generation changes instead of being redirected; cases cover edit counts and target state without presenting simulated completion as actual WebKit timing evidence

#### Scenario: Measure deterministic lifecycle coverage

- **WHEN** the Child WebView delivery matrix is evaluated
- **THEN** Coverage MUST include create intent, navigation policy, bridge/SDK readiness state, bounds, focus intent, hide/restore reuse, close, replacement, disable, uninstall, failure, destroy, late-event inertness, and zero generic Tauri authority hits.

#### Scenario: Validate native editing dispatch policy and wiring

- **WHEN** deterministic validation exercises production native editing dispatch
- **THEN** Editing-shortcut validation MUST separately cover the production native dispatch policy, the adapter wiring and dependency path used by the actual build, and real controls'/editors' DOM editing-event handling and content results.
- **THEN** Policy validation MUST verify native focus ownership, target validity, original events and modifiers, dispatch order, single handling, Web handling/default cancellation, pending handling and legal completion/reentry, confirmed unhandled propagation, native editing-command results, and Host-reserved commands.
- **THEN** A superclass fake's synchronous return value or invocation count MUST NOT substitute for validation of final Web handling, menu/responder-chain behavior, and editing results.
- **THEN** A few source-string matches MUST NOT substitute for behavioral tests of the production policy.

#### Scenario: Validate DOM editing results with explicit models

- **WHEN** deterministic DOM tests exercise Host inputs, external controls, Monaco, and Find
- **THEN** Deterministic DOM validation MUST cover Host ordinary inputs, external-plugin `input`/`textarea`/`contenteditable` controls, the Monaco body, and Find queries: current selections, copy/cut output, external-text paste input, content changes, Undo/Redo, focus transitions, read-only/disabled and empty states, and recovery after failure.
- **THEN** Explicitly labeled native-adapter fakes, models of DOM default editing primitives, and in-memory ClipboardEvent data are permitted, but tests MUST distinguish these boundaries from real control/editor logic.
- **THEN** A plugin-internal clipboard-service write/read round trip MUST NOT replace evidence of cross-application text-clipboard delivery.
- **THEN** Verifying only the absence of clipboard access MUST NOT be described as successful user copy/paste.

#### Scenario: Validate one standard command against current targets

- **WHEN** acceptance samples exercise standard commands and their production adapter path
- **THEN** `Cmd+A/C/X/V/Z` and `Cmd+Shift+Z` MUST be acceptance samples without requiring a production key-code allowlist.
- **THEN** Validation MUST cover a command executing once on the current valid target, not executing on old/hidden/unfocused/invalid targets, and no duplication between standard commands and Page-owned shortcuts.
- **THEN** Checks MUST verify that production adapters actually use the tested policy and the locked dependency path.
- **THEN** Compilation evidence and behavioral evidence MUST be recorded separately.

#### Scenario: Report the native evidence boundary

- **WHEN** deterministic Child WebView checks are executed and their results are reported
- **THEN** These checks MUST NOT launch a real WebView, GUI, native interaction harness, or browser, and MUST NOT claim real macOS key delivery, system-clipboard round trips, real teardown, or target-environment performance.
- **THEN** Deterministic samples' simulated events, fixture text, and local-state results MUST state their evidence boundaries rather than hide unverified native dispatch behind an end-to-end success claim.

### Requirement: Child WebView MUST deliver editing shortcuts according to native focus

On macOS, the current valid, visible plugin Child WebView with native text focus MUST receive ordinary Web editing shortcuts so that existing Page commands for Select All, Find, Cut, Copy, Paste, Undo, Redo, and editing operate under that Page's rules.

#### Scenario: Current focused plugin receives editing shortcuts

- **WHEN** text input in the current visible Child owns valid native focus and the user invokes an editing shortcut
- **THEN** the original event and modifiers are handled once under Page and native standard-editing semantics, producing the corresponding selection, clipboard, or content result for the current text target
- **THEN** external, Development Mode, and official plugins share the same rules without plugin-specific Host shortcut mappings or SDK-adaptation requirements

#### Scenario: Host or another native input owns focus

- **WHEN** Host search, another native view, or a target outside the Window owns focus
- **THEN** the unfocused Child neither consumes nor resends the event or reclaims focus
- **THEN** Host ordinary inputs receive standard commands through the unified native editing chain, other targets retain their own input behavior, and unrelated non-Child behavior is unchanged

#### Scenario: Hidden or replaced plugin cannot consume late input

- **WHEN** the Child is hidden, detached, destroyed, replaced, or cannot be confirmed as the native focus owner
- **THEN** late events cannot execute old Page editing commands, restore old focus, or reveal the old Child
- **THEN** the new Page or Host input state remains unaffected, and subsequent commands affect only the still-valid current target

#### Scenario: Native handled result is preserved

- **WHEN** the valid target's native handling path finally confirms handled or unhandled status
- **THEN** handled status ends later candidate paths for the corresponding edit, without the repair layer additionally synthesizing/resending the same event to the Page or menu or repeating the command
- **THEN** confirmed unhandled status preserves legal reentry and continues native-menu and current-responder-chain propagation; an applicable standard command executes at most once, and unhandled semantics remain when no handler is available

#### Scenario: Native handling remains pending before the Web result

- **WHEN** Child native handling has taken over an event while Web handling is incomplete and later produces legal completion or unhandled reentry
- **THEN** synchronous takeover does not trigger early menu/default editing, and final handling/default cancellation does not trigger a second command
- **THEN** only finally confirmed non-handling continues through the applicable native editing chain; any repair-owned delayed compensation is bound to the original Window/text target/Child generation and cancelled after focus or generation changes rather than redirected to a new first responder
- **THEN** WebKit's own legal reentry retains its existing mechanism and remains part of the original gesture; an invalidated old Child cannot regain editing authority or focus

#### Scenario: Application close and quit keep their reserved meaning

- **WHEN** lensX is foreground, the user is editing the current plugin, and presses `Cmd+W` or `Cmd+Q`
- **THEN** the existing Hide or Quit executes exactly once respectively and completes the corresponding Child lifecycle handling
- **THEN** lensX does not consume these combinations while another application is foreground

#### Scenario: Ordinary external controls use the same standard editing contract

- **WHEN** a compliant external plugin's `input`, `textarea`, and `contenteditable` controls become the current native text focus in turn
- **THEN** standard selection, copy, cut, paste, undo, and redo follow each control's capabilities and state without plugin-specific platform code
- **THEN** read-only, disabled, empty, and input-recovery states retain each control's semantics, and the plugin gains no background clipboard access, Host DOM access, or native authority

#### Scenario: Monaco body and Find query keep separate editing targets

- **WHEN** current focus moves between the Monaco body and Find query and the user invokes standard editing commands
- **THEN** selection and editing affect only the current text target; the body and query do not select all, paste, or undo each other's content
- **THEN** Find toggling, Page business commands, the existing model/undo lifecycle, and Host input retain their respective ownership

#### Scenario: Page-specific handling does not trigger a second standard command

- **WHEN** the current plugin handles an event under its own input rules or cancels its default behavior
- **THEN** the Host does not force the standard editing command for the same gesture or duplicate content/clipboard changes
- **THEN** other unhandled events can still enter the unified native editing chain without the plugin registering per-key handling results with the Host

#### Scenario: Deliver standard editing to the focused plugin

- **WHEN** the current visible and valid Child WebView owns native text focus
- **THEN** Standard editing commands MUST follow the unified Host/Child native-delivery contract in `launcher-window-lifecycle` and produce actual selection, clipboard, or content results supported by the current text target.
- **THEN** Find, formatting, and other Page business commands remain plugin-defined.
- **THEN** Official, external, and Development Mode plugins MUST share this behavior without exceptions based on plugin identity, Publisher, repository location, Monaco use, page index, or plugin-reported focus.

#### Scenario: Resolve handling for the original native event

- **WHEN** a native editing gesture enters, proceeds through, or leaves the Host/Child dispatch chain
- **THEN** Delivery MUST preserve the original native event, modifiers, and single-handling semantics.
- **THEN** The current valid target MUST be determined from native focus and existing Window/WebView ownership.
- **THEN** An unfocused, hidden, detached, destroyed, replaced, or unverified Child MUST NOT consume the event, reclaim focus, reveal itself, or affect Host input or another native view.
- **THEN** Web handling or default cancellation MUST NOT be followed by an additional standard editing command.
- **THEN** Finally confirmed unhandled events MUST continue native-menu and current-responder-chain semantics, execute an available command at most once, and continue propagating if still unhandled.
- **THEN** The unified standard editing chain can repair equivalent behavior in non-Child inputs such as the Host, but other non-Child behavior MUST remain unchanged.

#### Scenario: Complete pending native handling or compensation

- **WHEN** native handling remains pending or legal WebKit reentry or delayed compensation occurs
- **THEN** Native takeover and final Web handling MUST be distinguished.
- **THEN** Pending handling MUST preserve native completion and legal unhandled reentry, and MUST NOT immediately execute an extra menu command based on the synchronous takeover return value.
- **THEN** Legal WebKit reentry MUST NOT be treated as a new user gesture; the repair layer MUST NOT additionally synthesize or resend that keyboard event.
- **THEN** If the repair introduces delayed compensation, it MUST bind that compensation to the original gesture's initial Window, text target, and Child generation and revalidate them before execution.
- **THEN** A focus change, invalid target, or generation change during the wait MUST cancel that event's compensation instead of reading a new first responder and redirecting the old event to a new target.
- **THEN** WebKit's own legal reentry MUST retain its existing mechanism.

#### Scenario: Edit ordinary controls and separate editor targets

- **WHEN** a focused external control, editor body, or Find query receives a standard editing command
- **THEN** Existing compliant external plugins' `input`/`textarea`/`contenteditable` controls and editor inputs MUST support standard editing without Host-source special cases, SDK updates, or new permissions.
- **THEN** The body and Find query MUST handle selection, copy, cut, paste, undo, and redo separately according to current focus; an operation on one target MUST NOT affect the other.
- **THEN** Read-only, disabled, empty-selection, empty-clipboard, and empty-undo/redo states MUST retain each control's semantics without forcibly clearing the clipboard or synthesizing content changes.
- **THEN** Normal editing MUST resume when input, focus, and a valid generation are restored.

#### Scenario: Deliver foreground application-reserved commands

- **WHEN** the Host receives an application-reserved close or quit command
- **THEN** The Host-reserved application commands `Cmd+W/Q` MUST continue to follow `launcher-window-lifecycle`: only foreground lensX executes recoverable Hide and complete Quit respectively once per keypress.
- **THEN** They MUST NOT become global shortcuts or be overridden by a plugin.

#### Scenario: Inspect standard editing delivery authority

- **WHEN** standard editing delivery or its acceptance samples are integrated
- **THEN** Editing delivery MUST NOT add a Host API, SDK method, plugin permission, generic Tauri capability, controllable native handle, injected script, DOM/page-index targeting, `eval`, or synthetic-key channel, and MUST NOT implement standard editing through production per-plugin or per-key-code allowlists.
- **THEN** `Cmd+A/C/X/V/Z` and `Cmd+Shift+Z` are acceptance samples and do not change these boundaries.
