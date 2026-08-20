# Frame-Aware WebView Navigation Policy Specification

## Purpose

Define the macOS WKWebView Host boundary that classifies document navigation by
frame before commit, enforces disjoint Host and plugin-document allowlists,
keeps trusted Tauri initialization out of descendant frames, and fails closed
for popups, downloads, stale targets, and unsafe platform input.
## Requirements

### Requirement: Every document navigation MUST be classified by frame before commit

On macOS WKWebView, the system MUST classify every document-navigation attempt
as targeting the Host main frame or a descendant frame before commit and MUST
send the structured target to the single Host-owned navigation policy. If the
frame class is unavailable, the URL cannot be parsed, the callback fails, or
the WKWebView adapter cannot guarantee pre-commit cancellation, the system MUST
fail closed. Plugin scripts, DOM listeners, author-asserted identity, and URL
randomness MUST NOT be used to classify or reject navigation. This capability
MUST NOT claim Windows or Linux support.

#### Scenario: Classify a Host main-frame navigation

- **WHEN** the lensX WebView main frame navigates to the exact App target
  configured for the current build or run mode
- **THEN** the native adapter classifies the attempt as main frame and the
  policy allows that Host document
- **THEN** the descendant plugin allowlist does not participate in main-frame
  authorization

#### Scenario: Reject an unclassifiable navigation

- **WHEN** a platform callback lacks reliable frame context, the target URL is
  invalid, or the decision cannot be applied before commit
- **THEN** the policy rejects the navigation and returns a bounded Host
  diagnostic
- **THEN** the system does not represent that platform or attempt as safely
  handled

### Requirement: Host main frame and descendant frames MUST use disjoint allowlists

The Host main frame MUST allow only the lensX App target configured for the
current build or run mode. A descendant frame MUST NOT inherit the App origin,
development-server origin, Tauri scheme, Host route, or main-frame navigation
authority. When no current plugin target exists, every descendant document
navigation MUST be rejected. When a current target exists, a descendant frame
MUST match only that target's exact entry document and Host-derived fragment.

#### Scenario: Descendant attempts to load Host content

- **WHEN** a descendant frame attempts to navigate to the lensX App origin,
  development server, Tauri scheme, or any Host route
- **THEN** the native policy rejects the navigation before document commit
- **THEN** a Host page is neither displayed as plugin content nor given a
  descendant execution opportunity

#### Scenario: Descendant navigates while policy is idle

- **WHEN** no plugin target is active and any descendant frame requests a
  document navigation
- **THEN** the policy rejects the request
- **THEN** the production placeholder, Home, Search, and Host Pages do not
  create or retain a plugin execution context as a result

#### Scenario: External target attempts to replace the main document

- **WHEN** the main frame requests an unconfigured HTTP(S), custom-scheme,
  `file:`, `data:`, `blob:`, `javascript:`, or external-application target
- **THEN** the policy rejects the navigation
- **THEN** plugin target state and descendant allowlists cannot expand
  main-frame authority

### Requirement: Trusted Tauri initialization MUST execute only in the Host main frame

The system MUST enforce Tauri `for_main_frame_only` initialization semantics on macOS WKWebView. The Host App main frame MUST retain its existing `isTauri`, `__TAURI_INTERNALS__`, metadata, invoke initialization, and IPC bootstrap. All descendant frames MUST lack those surfaces before the earliest author script executes, and a representative descendant invoke MUST NOT reach the Rust handler. A sandbox, an opaque origin, an author's choice not to import an API, or a stored but unverified main-frame-only flag MUST NOT count as isolation. Maintained validation SHALL cover configuration, dependency behavior, policy classification, bridge denial, and zero-handler-hit semantics through deterministic source, unit, integration, and boundary tests without requiring a real WebView evidence run.

#### Scenario: Host main frame retains its bootstrap

- **WHEN** deterministic Host initialization and bridge tests exercise the frame-aware policy
- **THEN** the existing Tauri bootstrap, trusted invoke path, and App lifecycle remain configured for the Host main frame
- **THEN** the implementation cannot obtain the descendant negative result by removing initialization scripts globally

#### Scenario: Descendant cannot observe Tauri internals

- **WHEN** a normal or malicious descendant fixture inspects the modeled Tauri surfaces at the earliest author-script stage
- **THEN** `isTauri`, `__TAURI_INTERNALS__`, metadata, the invoke key, and IPC bootstrap are absent or unavailable
- **THEN** the check does not depend on whether the descendant and parent are same-origin or on cooperation from the plugin author

#### Scenario: Descendant invoke is stopped before the Host handler

- **WHEN** a descendant fixture attempts a representative invoke or forged bridge message
- **THEN** the policy and bridge boundaries reject it before the Rust handler and the bounded handler-hit count remains zero
- **THEN** diagnostics contain no invoke key, raw payload, bootstrap script, URL, or underlying system error

#### Scenario: Deterministic validation cannot establish the invariant

- **WHEN** dependency configuration, policy logic, or boundary tests cannot establish main-frame-only bootstrap and zero descendant handler hits
- **THEN** the capability remains incomplete
- **THEN** the team updates the native dependency patch or platform design rather than bypassing the invariant through DOM cleanup, author scripts, or removal of a negative case

### Requirement: New windows, popups, and downloads MUST fail closed independently

The Host WebView MUST install new-window and popup denial and download denial
independently from the document-navigation callback. `window.open`, targeted
browsing contexts, external window requests, and WebView downloads MUST be
rejected before a context is created, a download starts, or an external
application receives a handoff. This capability MUST NOT automatically route a
rejected request to the Tauri opener.

#### Scenario: Descendant requests a popup

- **WHEN** a descendant plugin document uses `window.open`, a link target, or
  another new-window mechanism
- **THEN** the Host-owned native hook rejects browsing-context creation
- **THEN** the target is not opened in the Host WebView, a separate window, or
  an external application

#### Scenario: Descendant requests a download

- **WHEN** a descendant plugin document or navigation response triggers a
  WebView download
- **THEN** the Host-owned download hook rejects the request before a file is
  written
- **THEN** the system selects no destination path, retains no partial file, and
  hands the request to neither the plugin nor the Tauri opener

### Requirement: Navigation decisions and diagnostics MUST remain Host-private and bounded

The decision, active lease, platform callback, target normalization, and
diagnostic MUST remain inside the Rust and Tauri Host-private boundary.
Diagnostics MUST use fixed bounded codes and operations and MUST NOT contain a
raw URL, scope, plugin identity, entry ID, revision, digest, installation or
system path, native error, stack, file content, or capability token. This
capability MUST NOT add a plugin-callable command, public TypeScript or package
export, Manifest field, Runtime Session, SDK transport, Host API, or permission
semantics.

#### Scenario: A navigation is denied safely

- **WHEN** the policy rejects navigation because of an external or cross-plugin
  target, invalid URL, missing active lease, or platform callback failure
- **THEN** the Host records only a bounded code, frame class, and operation
- **THEN** neither the plugin nor a public application contract receives the
  target, Host state, or underlying platform error

#### Scenario: Public package boundary is checked

- **WHEN** the workspace boundary gate checks Contract, SDK, UI, Testkit,
  official plugins, examples, and external plugins
- **THEN** those consumers cannot import the frame-aware policy, native adapter,
  active lease, Tauri or Wry patch, or test-harness internals
- **THEN** this capability adds no public Runtime, Session, or API export

### Requirement: Trusted Host navigation policy MUST contain no plugin document exception
The Host main WebView policy MUST classify and protect its own top-level and descendant navigations, but MUST NOT issue or honor a descendant plugin target lease. Plugin documents MUST be loaded only as the top-level document of the current Child WebView under `plugin-child-webview-runtime`; Tauri initialization MUST remain limited to the trusted Host main frame.

#### Scenario: Host descendant requests a plugin document
- **WHEN** any Host main-WebView descendant attempts to navigate to a plugin resource origin
- **THEN** the navigation is rejected before commit without consulting a current plugin lease
- **THEN** no iframe compatibility path or Tauri initialization is created

#### Scenario: Current Child WebView starts
- **WHEN** the Runtime controller creates a current Child WebView
- **THEN** its top-level policy is installed by the Child WebView Runtime rather than the Host descendant-frame policy

### Requirement: Delivery MUST deterministically validate frame-aware navigation boundaries

Delivery MUST combine Rust policy and integration tests, TypeScript contract and source-policy tests, fixed dependency revision checks, and canonical normal and malicious navigation fixtures. Validation MUST cover main-frame and descendant classification, current target and lifecycle state, Host, external and cross-plugin rejection, dangerous schemes, popup/download denial, retained Host bootstrap, absent descendant bootstrap, and zero privileged handler hits. It MUST NOT claim that these deterministic checks constitute a real target-WebView run.

#### Scenario: Deterministic navigation matrix passes

- **WHEN** the maintained policy, dependency, fixture, and bridge-boundary tests run
- **THEN** allowed Host/current-plugin cases and rejected descendant, external, cross-plugin, popup, download, and dangerous-scheme cases match the stable policy
- **THEN** validation records no capability URL, invoke key, raw bootstrap, payload, local path, or sensitive identity

#### Scenario: A target-environment prerequisite is reintroduced

- **WHEN** completion requires a browser, real WebView, GUI application, native harness, or committed environment evidence
- **THEN** validation governance rejects the prerequisite
- **THEN** the requirement must be redesigned through a future OpenSpec change rather than restored as an optional Gate
