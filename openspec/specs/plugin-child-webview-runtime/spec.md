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
Launcher hide and restore, same-Page shortcut activation, and Registration revisions affecting only other plugins MUST reuse the same Child WebView and Session while the current identity, entry, route, origin, resource generation, and attempt remain unchanged. Close, Page replacement, disable, uninstall, replacement, upgrade, development reload, explicit retry, Session disconnect, bridge fatal failure, breaker, Host reload, App unmount, and process exit MUST make the old attempt terminal and destroy the Child WebView, without retaining a hidden Runtime, pool, or background execution.

#### Scenario: Launcher hides and restores current plugin
- **WHEN** the Launcher is temporarily hidden and restored while the current plugin facts remain semantically equivalent
- **THEN** the Host shows the same Child WebView and preserves its Page memory, Worker, and Session
- **THEN** restore does not resolve, create, load, or bootstrap the plugin document again

#### Scenario: Current plugin is replaced
- **WHEN** replacement commits a new resource generation
- **THEN** the Host first revokes the old bridge, Session, and resource authority and destroys the old Child WebView, then creates a new attempt
- **THEN** the old WebView, Worker, network callback, and late native event cannot affect the new generation

### Requirement: Child WebView delivery MUST prove security, interaction and performance on target macOS
Delivery MUST combine Rust unit and integration tests, TypeScript controller tests, React accessibility, internationalization, and theme tests, canonical normal and malicious packages, and real macOS WKWebView evidence covering create, load, bridge ready, SDK ready, bounds, focus, hide and restore, close, replacement, disable, uninstall, crash or failure, and destroy. Evidence MUST record bounded stage durations, Host heartbeat, and resource-release facts, and MUST NOT record user content, a complete URL, origin token, path, label, nonce, payload, raw error, or stack. It MUST NOT describe a Child WebView as guaranteeing an independent operating-system process.

#### Scenario: Focused Child WebView gate passes
- **WHEN** the complete normal, malicious, lifecycle, performance, and workspace-boundary matrix runs
- **THEN** ordinary Web behavior succeeds, Host, cross-plugin, and native escapes fail, the Host UI remains responsive, and the terminal generation becomes completely invalid
- **THEN** official, external, and development plugins receive the same conclusion from the same Runtime

#### Scenario: Isolation or teardown cannot be proven
- **WHEN** actual WebView source binding, navigation, generic Tauri denial, bounds, focus, bridge cleanup, or old-context inertness cannot be proven
- **THEN** the change remains incomplete and its design or specification is revised
- **THEN** process assumptions, source-only tests, a hidden WebView, or relaxed Host authority cannot substitute for evidence

