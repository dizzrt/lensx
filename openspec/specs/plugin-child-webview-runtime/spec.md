# plugin-child-webview-runtime Specification

## Purpose
TBD - created by archiving change replace-plugin-iframe-runtime-with-child-webview. Update Purpose after archive.
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
Launcher hide and restore, same-Page shortcut activation, and Registration revisions affecting only other plugins MUST reuse the same Child WebView and Session while the current identity, entry, route, origin, resource generation, and attempt remain unchanged. Same-attempt restore MUST NOT resolve, create, navigate, read document resources, bootstrap the SDK, recreate a model or Worker, or show a fresh plugin-page loading cycle, and target macOS p95 activation-to-visible-and-focused latency MUST be at most 100 milliseconds over at least forty samples. Close, Page replacement, disable, uninstall, replacement, upgrade, development reload, explicit retry, Session disconnect, bridge fatal failure, breaker, Host reload, App unmount, and process exit MUST make the old attempt terminal and destroy the Child WebView, without retaining a hidden Runtime, pool, or background execution.

#### Scenario: Launcher hides and restores current plugin
- **WHEN** the Launcher is temporarily hidden and restored while the current plugin facts remain semantically equivalent
- **THEN** the Host shows and focuses the same Child WebView and preserves its Page memory, Worker, and Session
- **THEN** restore performs no resolve, create, navigation, resource read, SDK bootstrap, model creation, or Worker creation and its target macOS p95 latency is at most 100 milliseconds

#### Scenario: Current plugin is replaced
- **WHEN** replacement commits a new resource generation
- **THEN** the Host first revokes the old bridge, Session, resource authority and cache eligibility and destroys the old Child WebView, then creates a new attempt
- **THEN** the old WebView, Worker, cached lookup, network callback, and late native event cannot affect the new generation

### Requirement: Child WebView delivery MUST prove security, interaction and performance on target macOS
Delivery MUST combine Rust unit and integration tests, TypeScript controller tests, React accessibility, internationalization and theme tests, canonical normal and malicious packages, and real target macOS WKWebView evidence covering create, navigation, load, bridge ready, SDK ready, bounds, focus, hide and restore, close, replacement, disable, uninstall, crash or failure, destroy and first interactive. The performance producer MUST execute the current production Child WebView presentation, Resource Service, bridge, RPC and SDK path with the canonical ConfigLens candidate rather than merely validate a committed summary or a synthetic DOM/controller fixture.

Evidence MUST contain at least twenty fresh release-like opens, twenty fresh Plugin Development Mode snapshot opens and forty same-attempt restores. It MUST separately summarize resolve, create, navigation, load, bridge, SDK, UI bundle, editor, editor Worker, Host loading, first-interactive and restore durations with p50, nearest-rank p95 and max. Release-like Host loading-to-bridge-ready p95 MUST be at most 250 milliseconds, release-like first-interactive p95 MUST be at most 500 milliseconds, Plugin Development Mode first-interactive p95 MUST be at most 1000 milliseconds, same-attempt restore p95 MUST be at most 100 milliseconds, and Host heartbeat p95 gap MUST remain at most 50 milliseconds. Each fresh sample MUST begin without a current Child WebView and end with proven terminal cleanup.

Evidence MUST NOT record user content, a complete URL, origin token, path, label, nonce, payload, raw error, stack, data-store identifier, Host-private token or per-sample identity. It MUST NOT describe a Child WebView as guaranteeing an independent operating-system process. A check that only validates a historical JSON file, source composition, mock timings or positive booleans MUST NOT substitute for rerunning the target macOS performance producer.

#### Scenario: Focused Child WebView gate passes
- **WHEN** the complete normal, malicious, lifecycle, release-like performance, development performance and workspace-boundary matrix runs from current source and candidate bytes
- **THEN** ordinary Web behavior succeeds, Host, cross-plugin and native escapes fail, all latency and heartbeat budgets pass, and every terminal generation becomes completely invalid
- **THEN** official, external and development plugins receive the same Runtime security conclusion from the same product path

#### Scenario: Current product cold open exceeds a budget
- **WHEN** Host loading, release-like first-interactive, development first-interactive, restore or heartbeat p95 exceeds its maintained budget
- **THEN** evidence identifies the responsible bounded stage without exposing content or Host-private identity
- **THEN** the change remains incomplete until the stage is fixed or proposal, design and requirements explicitly revise the accepted budget

#### Scenario: Evidence cannot be replayed
- **WHEN** the target macOS command only reads committed timing summaries or bypasses the current production Child WebView, Resource Service, bridge, SDK or ConfigLens candidate
- **THEN** performance evidence is incomplete even if its schema, unit tests and committed values pass

#### Scenario: Isolation or teardown cannot be proven
- **WHEN** actual WebView source binding, navigation, generic Tauri denial, bounds, focus, bridge cleanup, cache revocation or old-context inertness cannot be proven
- **THEN** the change remains incomplete and its design or specification is revised
- **THEN** process assumptions, source-only tests, a hidden WebView, relaxed Host authority or a stale performance fixture cannot substitute for evidence

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
