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

The system MUST enforce Tauri `for_main_frame_only` initialization semantics on
macOS WKWebView. The Host App main frame MUST retain its existing `isTauri`,
`__TAURI_INTERNALS__`, metadata, invoke initialization, and IPC bootstrap. All
descendant frames MUST lack those surfaces before the earliest author script
executes, and a representative descendant invoke MUST NOT reach the Rust
handler. A sandbox, an opaque origin, an author's choice not to import an API,
or a stored but unverified main-frame-only flag MUST NOT count as isolation.

#### Scenario: Host main frame retains its bootstrap

- **WHEN** the lensX App main frame starts in a real macOS WKWebView with the
  frame-aware policy enabled
- **THEN** the existing Tauri bootstrap, trusted invoke path, and App lifecycle
  continue to work
- **THEN** the implementation cannot obtain the descendant negative result by
  removing initialization scripts globally

#### Scenario: Descendant cannot observe Tauri internals

- **WHEN** a normal or malicious descendant document inspects Tauri surfaces at
  the earliest author-script stage
- **THEN** `isTauri`, `__TAURI_INTERNALS__`, metadata, the invoke key, and IPC
  bootstrap are absent or unavailable
- **THEN** the check does not depend on whether the descendant and parent are
  same-origin or on cooperation from the plugin author

#### Scenario: Descendant invoke is stopped before the Host handler

- **WHEN** a descendant document attempts to call the harness-only invoke
  command through a representative Tauri API or forged message
- **THEN** the attempt fails before reaching the Rust handler and the bounded
  handler-hit count remains zero
- **THEN** the evidence contains no invoke key, raw payload, bootstrap script,
  URL, or underlying system error

#### Scenario: macOS cannot enforce main-only initialization

- **WHEN** the target macOS WKWebView injects the Host bootstrap into a
  descendant, exposes it even briefly, or cannot prove that the invoke handler
  was not reached
- **THEN** the capability cannot be declared complete and the downstream iframe
  Runtime remains blocked
- **THEN** the team must update the native dependency patch or platform design
  rather than bypassing the gate through DOM cleanup, author scripts, or
  removal of a negative case

### Requirement: Active plugin target MUST be exact, Host-private, and lifecycle-bound

The system MUST retain at most one process-local immutable active plugin
navigation target and MUST atomically activate, replace, and dispose it through
a monotonic epoch lease. The target MUST be constructed from later trusted Host
facts and MUST NOT come from the Manifest, a plugin message, or an author URL.
Public Page or Action descriptors, Launcher snapshots, public plugin packages,
events, and diagnostics MUST NOT expose the target URL, scope, entry ID,
revision, digest, installation path, or a Host object.

#### Scenario: Activate the first trusted target

- **WHEN** the Host activates the exact target for a verified Runtime document
- **THEN** the policy atomically stores the target and returns a new opaque
  current lease
- **THEN** only a descendant document navigation that exactly matches that
  target can be allowed

#### Scenario: Replace the current target

- **WHEN** the Host replaces the active target for a new Page, entry, revision,
  resource URL, or retry attempt
- **THEN** the policy atomically invalidates the old lease and target and
  activates the new target
- **THEN** the old URL cannot regain navigation authorization after replacement

#### Scenario: Ignore a late disposal

- **WHEN** an old Page or attempt submits disposal after a replacement
- **THEN** the compare-current lease check preserves the new target
- **THEN** late cleanup cannot clear or modify current navigation authority

#### Scenario: Dispose the current target

- **WHEN** the current lease is explicitly disposed
- **THEN** the policy clears the active plugin target and returns to the
  descendant-deny idle state
- **THEN** the target is not persisted and is not recovered after process
  restart

### Requirement: Descendant navigation MUST match one canonical document target exactly

The policy MUST structurally normalize isolated-origin native custom-protocol
URLs and their supported platform-translated forms, then exactly compare the
scheme class, origin scope, path scope, plugin key, version, resource path, and
Host-derived fragment. The origin scope and path scope MUST match. A supported
translated form MUST preserve the same origin key rather than collapsing it to
a shared host. The policy MUST reject the old shared
`lensx-plugin://localhost` and `lensx-plugin.localhost` targets, queries,
userinfo, ports, different or extra fragments, root-relative or absolute
escapes, backslashes, percent- or double-encoding ambiguity, Unicode, punycode,
or uppercase scopes, a different origin, scope, plugin, version, or generation,
Host or external origins, and `file:`, `javascript:`, `data:`, `blob:`, or
external-application schemes. Normalization MUST NOT repair, rewrite, or fall
back from a rejected input to an allowed target.

If WKWebView prevents `file:`, no-op `javascript:`, or a same-document `blob:`
target from becoming a document navigation before `WKNavigationDelegate`, real
evidence MAY record the bounded result `blocked_by_webview`, but it MUST also
prove that the original document remains, no new-window, download, or external
handoff occurred, and the navigation callback count was not falsely increased.
That result MUST NOT be recorded as a policy `deny`; policy normalization MUST
still reject the target if a later platform version reports it.

#### Scenario: Allow the exact active plugin document

- **WHEN** a descendant frame requests the exact current isolated-origin entry
  document and exact Host-derived fragment from the active lease
- **THEN** the policy allows the document navigation
- **THEN** the decision grants no other document, origin, scope, generation,
  fragment, or browser capability

#### Scenario: Reject a cross-plugin or stale target

- **WHEN** a descendant requests another plugin, origin, scope, version, or
  generation, an old lease, or the entry document from before replacement
- **THEN** the policy rejects the navigation before commit
- **THEN** a Resource Service URL cannot become the current Page document merely
  because it was once valid or has a similar path

#### Scenario: Reject a shared-host target

- **WHEN** a descendant requests the old shared native or translated host, or a
  translated adapter loses the isolated origin key
- **THEN** normalization denies the target and does not fall back to path-only
  comparison
- **THEN** the downstream Runtime cannot activate `allow-same-origin` on a
  shared browser origin

#### Scenario: Reject an encoded navigation bypass

- **WHEN** a target uses a query, userinfo, default or explicit port,
  backslash, percent or double encoding, case collision, Unicode or punycode
  scope, extra fragment, or dangerous scheme to resemble the current entry
- **THEN** normalization denies rather than decoding, repairing, or joining the
  input into an allowed target
- **THEN** the bounded diagnostic does not echo the raw target, origin, or scope

#### Scenario: Load package subresources through the existing service

- **WHEN** an allowed plugin document requests CSS, JavaScript, an image, font,
  JSON, or Wasm from the current isolated origin and scope
- **THEN** the navigation policy does not treat that subresource as a new
  document authorization
- **THEN** the Plugin Resource Service independently validates the origin and
  scope, generation, path, MIME type, payload ownership, and lifecycle without
  this capability relaxing its contract or CORS behavior

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

### Requirement: Delivery MUST prove pre-commit enforcement on every supported desktop WebView

Delivery MUST verify, in a real macOS WKWebView application environment,
main-frame and descendant classification, the exact current target, idle,
replace, and dispose behavior, Host, external, and cross-plugin policy
rejection, dangerous-scheme policy rejection or an explicit WKWebView preflight
block, popup and download rejection, native custom-protocol behavior, retained
Host bootstrap, and absent descendant bootstrap and invoke access. Evidence MUST
record bounded macOS, WKWebView engine and version, Tauri and Wry revision,
bundle shape, and results, and MUST NOT record a capability URL, invoke key,
raw bootstrap or payload, local path, or sensitive identity. DOM simulation,
Rust unit tests, and dependency source inspection MUST NOT replace real
WKWebView results. Windows and Linux are outside this capability's delivery
scope.

#### Scenario: Target macOS WKWebView passes the matrix

- **WHEN** the dedicated gate runs normal and malicious navigation fixtures in
  the target macOS WKWebView
- **THEN** the main App and exact active plugin document are allowed, the Host
  bootstrap remains available, and every descendant Tauri surface or invoke
  and every other descendant or main escape, popup, and download fail before
  script execution, commit, context creation, or file writing
- **THEN** the structured evidence passes the drift gate with the fixed
  dependency revision

#### Scenario: macOS cannot enforce the policy

- **WHEN** the target macOS WKWebView cannot reliably classify descendant
  document navigations that reach the callback, cannot cancel before commit,
  injects the Host bootstrap into descendants, cannot prove zero invoke-handler
  hits, or provides neither policy rejection nor the constrained preflight
  block described above
- **THEN** the capability cannot be declared complete and the downstream iframe
  Runtime remains blocked
- **THEN** the team must first update the design, platform support boundary, or
  native dependency patch rather than bypassing the gate through a DOM hook,
  removal of a negative case, or a broader allowlist

### Requirement: The prerequisite MUST leave plugin Runtime and product presentation unchanged

This capability MUST deliver only the frame-aware native policy, main-frame-only
initialization enforcement, Host-private target lease, URL normalization,
new-window and download denial, dependency integration, tests, and maintained
documentation. The production policy MUST be installed with no active plugin
target and MUST remain idle. It MUST NOT create an iframe, execute plugin code,
change `App.tsx` plugin Page composition, replace the Runtime-unavailable
placeholder, alter Page close, focus, locale, or theme behavior, or deliver a
Session, Host API, permissions, complete CSP, or child WebView.

#### Scenario: Prerequisite completes before iframe Runtime

- **WHEN** this capability passes all validation before
  `add-isolated-plugin-iframe-runtime` is implemented
- **THEN** the user still sees the bilingual, theme-compatible Host-owned plugin
  Page placeholder
- **THEN** Home, Search, Host Pages, Page context, shared close, focus
  restoration, and product UI remain unchanged, with no plugin HTML or
  JavaScript execution
