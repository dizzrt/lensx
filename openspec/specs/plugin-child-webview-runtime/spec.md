# plugin-child-webview-runtime Specification

## Purpose

Define the Host-owned presentation of one current plugin as a native Child
WebView in the Launcher, including revisioned content-slot bounds, current-source
navigation policy, semantic-equivalent lifecycle reuse, compare-current teardown,
and deterministic validation of native authority and lifecycle boundaries.

## Requirements

### Requirement: Host MUST present one current plugin as a native Child WebView sibling
When the current Page belongs to an executable external plugin, the Host MUST create a Child WebView inside the Launcher native window and make it a native sibling of the trusted Host WebView. React MUST only declare the Host-owned plugin content slot; Rust MUST exclusively own Child WebView creation, label, bounds, visibility, focus, navigation hooks, data store, and destroy authority. The system MUST have at most one current plugin Child WebView at a time, and the plugin MUST NOT submit or receive a native handle, window, position, size, z-order, or WebView configuration.

#### Scenario: External Page enters ready presentation
- **WHEN** current Registration, Page, Resource, and Runtime facts converge and the Child WebView completes load and Session readiness
- **THEN** the Host displays that Child WebView inside the assigned plugin content slot and hides loading feedback
- **THEN** Host chrome continues to be rendered by the trusted Host WebView, and the plugin cannot cover or move outside the slot

#### Scenario: Host overlay must cover the plugin region
- **WHEN** the Host must present Settings, a confirmation dialog, or terminal failure feedback
- **THEN** the Host compare-current hides or destroys the Child WebView before presenting the trusted overlay
- **THEN** the native subview cannot obscure Host-owned interaction or intercept its focus

### Requirement: Host MUST provide an edge-to-edge content slot below plugin Page chrome

When a current Page is provided by a plugin, the trusted Host MUST keep Page chrome outside the plugin content rectangle and MUST assign the Child WebView slot all remaining Launcher body space directly below that chrome. The plugin Page body MUST add no Host-owned inline padding, bottom padding, inter-region gap, or inner card radius around the Runtime slot. The outer Launcher surface MAY continue to clip the complete native Window shape. This layout MUST be selected from the trusted Page provider kind and MUST apply identically to official, external, and Development Mode plugins; plugin identity, Publisher, repository location, release metadata, or Runtime content MUST NOT select a special layout path.

React MUST continue to declare and measure only the Host-owned slot. Slot changes caused by Window resize, scale, locale, theme, or Page chrome MUST continue through the current revisioned physical-bounds path and Rust validation without a plugin-supplied bounds input, Runtime reload, Session replacement, new native setter, or public contract change. Home, Search and Host Pages MUST retain their own Host layouts.

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

### Requirement: Child WebView navigation MUST be top-level, current and Host-derived
When creating a Child WebView, the Host MUST bind the exact entry, route, plugin, Page, origin, resource generation, and Runtime attempt. The native navigation hook MUST allow only the current exact package-document commit and the Host-derived same-document route; plugin-initiated top-level remote navigation, package escape, `file:`, `javascript:`, `data:`, or `blob:` navigation, popup, new-window, and download MUST fail closed. Ordinary Web subresource and connection behavior MUST continue to follow the open isolated Runtime baseline and MUST NOT change top-level document identity.

#### Scenario: Current package document commits
- **WHEN** the current Child WebView navigates to the exact entry and route derived by the Host from the Resource Service
- **THEN** the native policy allows that main-document commit and continues to validate the current WebView and generation binding
- **THEN** the allow decision grants no general Tauri, Host DOM, or other-plugin authority

#### Scenario: Plugin attempts top-level escape
- **WHEN** the plugin attempts to navigate the Child WebView main document to a remote, old-generation, `file:`, `data:`, `blob:`, or other-plugin URL
- **THEN** the native policy rejects the navigation before commit and preserves the current document or terminates the attempt
- **THEN** the failure reveals no complete URL, scope, path, WebView label, or Host-private error

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

Launcher hide and restore, same-Page shortcut activation, and Registration revisions affecting only other plugins MUST reuse the same Child WebView and Session while the current identity, entry, route, origin, resource generation, and attempt remain unchanged. Same-attempt restore MUST NOT resolve, create, navigate, read document resources, bootstrap the SDK, recreate a model or Worker, or show a fresh plugin-page loading cycle. Close, Page replacement, disable, uninstall, replacement, upgrade, development reload, explicit retry, Session disconnect, bridge fatal failure, breaker, Host reload, App unmount, and process exit MUST make the old attempt terminal and destroy the Child WebView, without retaining a hidden Runtime, pool, or background execution. Deterministic controller, state, call-count, and cleanup tests MUST cover these invariants without target macOS latency sampling.

#### Scenario: Launcher hides and restores current plugin

- **WHEN** the Launcher is temporarily hidden and restored while current plugin facts remain semantically equivalent
- **THEN** the Host reuses and focuses the same modeled Child WebView attempt and preserves its Page, Worker, and Session identity
- **THEN** restore performs no resolve, create, navigation, resource read, SDK bootstrap, model creation, or Worker creation

#### Scenario: Current plugin is replaced

- **WHEN** replacement commits a new resource generation
- **THEN** the Host first revokes the old bridge, Session, resource authority and cache eligibility and destroys the old Child WebView, then creates a new attempt
- **THEN** the old WebView, Worker, cached lookup, network callback, and late native event cannot affect the new generation

### Requirement: User-resized plugin Pages MUST converge through the Host-owned slot

When native user resizing is enabled by the current validated Page presentation, Window resize bursts, monitor/work-area fitting, Retina scale changes, Page chrome changes, and locale/theme layout changes MUST be observed only by the trusted Host layout and MUST produce serialized, latest-wins presentation revisions for the current Child WebView. The final accepted physical bounds MUST converge on the current Host-owned content slot without document reload, Session replacement, model/Worker recreation, or plugin-supplied bounds. Intermediate revisions MAY be coalesced, but a stale attempt MUST never resize, reveal, focus, or destroy a replacement.

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

### Requirement: Child WebView delivery MUST pass deterministic security and lifecycle validation

Delivery MUST combine Rust unit and integration tests, TypeScript controller and state tests, React accessibility/localization/theme tests, canonical normal and malicious packages, public-package boundary checks, builds, and deterministic artifact checks. Coverage MUST include create intent, navigation policy, bridge/SDK readiness state, bounds, focus intent, hide/restore reuse, close, replacement, disable, uninstall, failure, destroy, late-event inertness, and zero generic Tauri authority hits.

Editing-shortcut validation MUST cover the production routing policy's native focus ownership, target validity, preservation of the original event and modifiers, delegation count, handled/unhandled results, and Host-reserved commands, and MUST verify production adapter wiring and the dependency path used by the actual build. Checking a few source strings MUST NOT substitute for behavioral tests of the production policy. Checks MUST NOT launch a real WebView, GUI, native interaction harness, or browser and MUST NOT claim real interaction, real teardown, or target-performance evidence.

#### Scenario: Deterministic Child WebView matrix passes

- **WHEN** the maintained Rust, TypeScript, React, package, and malicious-fixture checks run
- **THEN** lifecycle behavior, source authority, cleanup, shortcut focus policy, single delivery, and public/private boundaries pass
- **THEN** all plugins share the specified Runtime path and the results are explicitly limited to deterministic evidence

#### Scenario: Environment-only validation remains

- **WHEN** a maintained Gate or script launches a real Child WebView, drives native interaction, measures target latency, or reads/writes environment acceptance artifacts
- **THEN** validation governance fails
- **THEN** the entry and assets are deleted without retaining an optional, manual, or compatibility validation path

#### Scenario: Keyboard policy is exercised without native interaction

- **WHEN** fake native responders exercise the production routing policy for focused, hidden, replaced, absent-target, and Host-reserved-command cases
- **THEN** decisions, invocation counts, and result propagation are verifiable, and compilation and wiring checks confirm production use of the policy
- **THEN** modeled results are not described as measurements of real macOS key events

### Requirement: Child WebView MUST deliver editing shortcuts according to native focus

On macOS, the current valid, visible plugin Child WebView with native text focus MUST receive ordinary Web editing shortcuts so that existing Page commands for Select All, Find, Cut, Copy, Paste, Undo, Redo, and editing can operate under that Page's rules. Official, external, and Development Mode plugins MUST share this behavior without exceptions based on plugin identity, Publisher, repository location, Monaco use, or plugin-reported focus.

Delivery MUST preserve the original native event, modifiers, and single-handling semantics. An unfocused, hidden, detached, destroyed, or replaced Child MUST NOT consume the event, reclaim focus, reveal itself, or affect Host input or another native view. Unhandled events MUST retain native propagation semantics, and existing non-Child behavior MUST remain unchanged.

The Host-reserved application commands `Cmd+W/Q` MUST continue to follow `launcher-window-lifecycle`: only foreground lensX handles them, invoking recoverable Hide or complete Quit respectively once per keypress. They MUST NOT be global shortcuts or be overridden by a plugin. Editing-shortcut delivery MUST NOT introduce a Host API, SDK method, plugin permission, generic Tauri capability, controllable native handle, or script-driven synthetic-key channel.

#### Scenario: Current focused plugin receives editing shortcuts

- **WHEN** text input in the current visible Child has native focus and the user invokes an editing shortcut
- **THEN** the event and its modifiers are delivered once to that native Web editing target for the Page to handle
- **THEN** external, development, and official plugins share the same rules without a plugin-specific Host shortcut mapping

#### Scenario: Host or another native input owns focus

- **WHEN** Host search, another native view, or a target outside the window has focus
- **THEN** an unfocused Child neither consumes nor redispatches the event
- **THEN** the original focus and corresponding input behavior are preserved

#### Scenario: Hidden or replaced plugin cannot consume late input

- **WHEN** the Child is hidden, detached, destroyed, replaced, or cannot be confirmed as the native focus owner
- **THEN** late events cannot execute old Page editing commands, restore old focus, or reveal the old Child
- **THEN** the new Page or Host input state remains unaffected

#### Scenario: Native handled result is preserved

- **WHEN** the valid target's native handler returns handled or unhandled
- **THEN** that result is preserved without synthesizing the same event again for the Page or menu
- **THEN** unhandled events continue under native propagation rules

#### Scenario: Application close and quit keep their reserved meaning

- **WHEN** lensX is foreground, a current plugin is being edited, and the user presses `Cmd+W` or `Cmd+Q`
- **THEN** the existing Hide or Quit runs exactly once respectively and applies the corresponding Child lifecycle handling
- **THEN** lensX does not consume those key combinations while another application is foreground
