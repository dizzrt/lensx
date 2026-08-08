# Plugin Iframe Runtime Specification

## Purpose

Define the Host-owned, isolated-origin iframe container that displays one
current external Plugin Page inside the existing lensX Page surface while
preserving trusted target derivation, fixed browser capabilities, bounded
lifecycle state, accessible feedback, and the separation from later Runtime
Session and Host API capabilities.

## Requirements

### Requirement: Runtime delivery MUST consume completed navigation and isolated-origin prerequisites

Before creating a production plugin iframe, the system MUST confirm that the
dedicated gates for `add-frame-aware-webview-navigation-policy` and
`add-isolated-plugin-runtime-origin` have passed. The Runtime MUST accept only a
current Resource Service `entry_url` that conforms to the verified
isolated-origin contract. The shared `lensx-plugin://localhost` form, an
equivalent shared translated origin, an unknown origin shape, or missing or
drifted evidence MUST fail closed. The system MUST NOT bypass a prerequisite by
using wildcard or null CORS, a classic-only bundle, removing a negative case,
or enabling `allow-same-origin` on a shared origin.

#### Scenario: Both prerequisites are current

- **WHEN** the frame-aware navigation and isolated Runtime origin gates pass and
  the current Resource Service returns a conforming isolated-origin entry
- **THEN** the Runtime resolver can construct the current descriptor and exact
  navigation lease
- **THEN** prerequisite completion by itself neither creates an iframe nor
  executes a plugin or declares Task 4.2 complete

#### Scenario: Origin prerequisite is missing or drifted

- **WHEN** the dedicated gate has not passed, evidence differs from the
  dependency revision, the entry URL uses a shared host, or origin and path
  scope binding cannot be verified
- **THEN** the Host returns a bounded Runtime failure and does not mount an
  iframe
- **THEN** the system does not fall back to an old URL, Manifest path,
  opaque-origin classic bundle, or relaxed CORS

### Requirement: Host MUST derive each iframe Runtime target from current trusted facts

Only after the unified Page Registry resolves a currently available external
Plugin Page, a Host-private resolver MUST find the eligible entry with the same
owner in the current Registration snapshot and call the Plugin Resource Service
with that `entry_id` and snapshot revision. The resolver MUST validate the
returned entry ID, revision, plugin ID, isolated origin, and scope or generation
binding and MUST derive an immutable Runtime descriptor only from the verified
`entry_url` and current Page internal route. A plugin, Manifest, Launcher
snapshot, `ActivePage`, Page descriptor, or presentation prop MUST NOT submit or
receive an installation path, scope, digest, entry ID, Registration revision,
complete URL, origin token, Tauri object, or Host executor.

#### Scenario: Resolve an eligible Plugin Page Runtime

- **WHEN** a user opens a currently available external Plugin Page and the
  Registration and Resource Service facts converge on a current isolated-origin
  entry
- **THEN** the Host creates an immutable Runtime descriptor bound to the owner,
  Page, entry, revision, entry URL, and retry attempt
- **THEN** the iframe target derives only from that descriptor and the validated
  Registry route, without adding Runtime fields to public Page or Action
  contracts

#### Scenario: Current Host facts do not converge

- **WHEN** the snapshot is unavailable or degraded, the entry is missing,
  disabled, or incompatible, the revision is stale, identities differ, the
  Resource Service rejects the request, the URL contract is invalid, or the
  origin and path scopes differ
- **THEN** resolution fails completely without creating an iframe or trying an
  author path or old URL
- **THEN** the bounded error reveals no scope, origin token, path, digest, raw
  payload, or Host error

#### Scenario: Plugin supplies Runtime policy input

- **WHEN** a Manifest, plugin, or UI input supplies a URL, origin, scope,
  sandbox token, allow policy, entry ID, revision, or installation path
- **THEN** the Host ignores or rejects that value and uses only trusted
  Registration, Page Registry, and Resource Service facts
- **THEN** author input cannot change the target, origin, security attributes,
  or Runtime identity

### Requirement: Isolated iframe MUST use the exact Host-fixed capability policy

The plugin page MUST continue to run in a Host-created iframe with an exact sandbox, referrer policy, Permissions Policy, and isolated origin that cannot be selected through the Manifest or a plugin message. The sandbox MUST allow the current package document to execute scripts and use its real independent origin while continuing to block top-level navigation, popups, unauthorized auxiliary contexts, Host-document replacement, and cross-plugin DOM or storage access.

The iframe MUST use exactly `sandbox="allow-scripts allow-same-origin"`, with `allow-same-origin` effective only after the isolated-origin prerequisite proves that the current entry origin differs from the Host, other plugins, and old generations. It MUST use `no-referrer`; the Host MUST NOT add forms, downloads, modals, pointer lock, presentation, storage-access, or top-navigation tokens, and MUST NOT inject a Tauri invoke key, `__TAURI_INTERNALS__`, React internals, a Resource or Registration adapter, or a native object.

The iframe policy MUST NOT express lensX permission requests, grants, or Publisher or source privilege, and MUST NOT block ordinary Worker, network, remote-resource, Blob, Data, WASM, or origin-storage capabilities declared supported by `open-isolated-plugin-runtime`. Browser or OS device APIs outside the supported baseline MAY remain unavailable, but that unavailability MUST NOT be described as a lensX grant decision.

#### Scenario: Open Web plugin loads
- **WHEN** the current plugin iframe loads and uses supported open Web capabilities
- **THEN** the iframe runs within the Host-fixed sandbox and independent origin without reading a lensX grant
- **THEN** the plugin cannot remove the parent document sandbox, access Host DOM or Tauri, or share another plugin origin

#### Scenario: Plugin declares sandbox or permission policy
- **WHEN** a Manifest or plugin message attempts to add a sandbox token, Host bridge, top navigation, popup, shared origin, or device permission
- **THEN** the Host ignores or rejects the input and continues using the fixed iframe isolation policy
- **THEN** official, external, and development sources receive the same result

#### Scenario: Plugin attempts to reach parent or Host storage

- **WHEN** a plugin attempts to read or modify `window.parent` DOM, `frameElement`, Host React state, Host storage, a Tauri surface, or a native object
- **THEN** the browser, origin, and bootstrap boundary rejects the attempt before privileged Host behavior
- **THEN** representative Tauri handler-hit count remains zero and Host state is unchanged

#### Scenario: Shared origin is presented to the container

- **WHEN** the resolver receives a shared `lensx-plugin://localhost` form, an equivalent translated host, or a URL whose exclusivity cannot be proved
- **THEN** the iframe policy validator rejects container creation
- **THEN** the Host neither degrades by removing `allow-same-origin` nor adds wildcard or null CORS to a response

### Requirement: Document navigation and package resources MUST remain current-target scoped

Before mounting the iframe, the Host MUST activate a frame-aware epoch lease
bound to the current isolated-origin entry document and Host-derived fragment,
and MUST use compare-current disposal on close, retry, invalidation, or
replacement. Descendant document navigation MUST allow only the exact current
target. Ordinary package subresources MUST continue to be validated by the
Plugin Resource Service for current origin and scope, generation, identity,
path, MIME type, and lifecycle. Host, external, other-plugin, old-generation,
dangerous-scheme, popup, new-window, download, form, top-navigation, and encoded
escape attempts MUST fail closed.

#### Scenario: Load resources for the current Page

- **WHEN** the current iframe loads modules, CSS, an image, font, JSON, or Wasm
  from its entry using the same origin and scope and an allowed path and MIME
  type
- **THEN** the Resource Service returns the resource only after revalidating
  authorization, and module dependencies remain in the current isolated origin
- **THEN** the route fragment does not enter a protocol request or permit reads
  from an adjacent plugin or Host file

#### Scenario: Navigate to another origin or generation

- **WHEN** a plugin attempts to navigate itself, its parent, the top-level
  window, or a new browsing context to another plugin, old generation, Host,
  external, or dangerous target
- **THEN** the native or browser policy rejects the attempt before the target
  receives an execution opportunity
- **THEN** the external page is not displayed as trusted plugin content and
  current or bounded failure state does not reveal the raw target

#### Scenario: Stale cleanup races with replacement

- **WHEN** a new Runtime epoch is active and an old resolution, Page, or late
  cleanup subsequently releases its lease
- **THEN** compare-current disposal preserves the new target while the old
  target remains unauthorized
- **THEN** only the document for the latest descriptor can pass policy at any
  time

### Requirement: Runtime origins and storage MUST be isolated across identities and generations

Even with `allow-same-origin`, the current plugin document MUST use a browser
origin distinct from the Host, other plugins, old resource generations, and
other active scopes. A plugin MAY use ordinary storage semantics for its own
current origin, but MUST NOT read, overwrite, or continue another identity or
generation's storage. Old URLs MUST become invalid after disable and re-enable,
replacement, uninstall, quarantine, incompatible recovery, or process restart.
An unrelated plugin change MUST NOT incorrectly revoke the current origin.

#### Scenario: Two plugins use browser storage

- **WHEN** plugin A and plugin B write the same storage key in their respective
  Runtimes
- **THEN** each observes only its own value and neither observes Host storage
- **THEN** origin isolation does not depend on author-provided key prefixes

#### Scenario: A plugin generation is replaced

- **WHEN** replacement or disable and re-enable gives a plugin a new resource
  generation and origin
- **THEN** the old iframe, URL, lease, and browser-storage partition do not
  become current authority for the new Runtime
- **THEN** a failed or cancelled replacement that preserves the original
  registration does not incorrectly revoke the original current generation

### Requirement: Container lifecycle MUST distinguish loaded presentation from trusted Runtime readiness

The Runtime container MUST retain the presentation states `resolving`,
`loading`, `loaded`, `failed`, and `disposed`. `loaded` MUST mean only that the
current iframe reported one load completion; it MUST NOT mean that all resources
succeeded, JavaScript is healthy, the Session or SDK is ready, or the Host API
is available. The Host-private lifecycle MUST additionally distinguish
`awaiting_handshake`, Session `ready`, `terminating`, and terminal disposal
without exposing those internals as a public contract. A 10,000 millisecond
load deadline MUST begin only after the current navigation lease is active and
the iframe source is committed. Host-known resolution, resource, origin,
navigation, timeout, Session disconnect, currentness and container failures
MUST enter bounded failure and the unified terminal cleanup. No failure MUST
automatically retry or reuse an old iframe, descriptor, attempt or lease.

#### Scenario: Browser reports iframe load completion

- **WHEN** the current iframe in `loading` reports load completion before its
  deadline
- **THEN** the container enters `loaded`, clears only that attempt's load timer,
  removes Host loading feedback, and may begin the private Session handshake
- **THEN** UI, logs, state, and documentation do not call that signal Session
  ready, SDK ready, or Host API available

#### Scenario: Current iframe does not load before its deadline

- **WHEN** the current iframe does not report load completion within 10,000
  milliseconds after its source is committed
- **THEN** the container exposes bounded `runtime_load_timeout` failure and the
  Host terminates the attempt, iframe and navigation lease
- **THEN** a late load event cannot start a Session, change presentation state,
  or affect a later attempt

#### Scenario: User explicitly retries a failure

- **WHEN** the user activates the Host-owned retry action outside an active
  circuit-breaker cooldown
- **THEN** the system resolves the entry, origin and lease again from current
  facts and creates a new attempt and iframe
- **THEN** the old promise, timer, URL, origin lease, iframe and Session are not
  reused, and the system neither loops automatically nor creates concurrent
  iframes

#### Scenario: Runtime failure opens cooldown

- **WHEN** the current entry and resource generation reaches the configured
  third qualifying failure within 60 seconds
- **THEN** the container presents bounded `runtime_crash_loop` feedback and
  constructs no new iframe during the 30 second cooldown
- **THEN** cooldown expiry does not automatically start a Runtime

### Requirement: Runtime feedback MUST be accessible, localized, and theme-compatible

Host-owned resolving, loading, timeout, Session-disconnect, security-policy,
cooldown, generic failure, and retry UI MUST use the application i18n layer,
Semi Design, and the existing light and dark themes. English MUST be canonical
and Simplified Chinese MUST remain semantically aligned. Loading MUST expose
busy and polite status semantics, failure MUST expose error and alert semantics,
cooldown MUST remain perceivable without creating an automatic countdown
restart, and retry MUST support keyboard operation and visible focus. The
iframe MUST have a non-empty accessible title derived from the localized Page
title and MUST fill the existing Page content slot. Shared Page context, the
close control, and focus restoration MUST remain available. Feedback MUST use
stable bounded codes/copy and MUST NOT reveal author HTML, a complete URL,
blocked URI, origin/scope, path, nonce, Port content, legacy grant facts, raw browser/Rust/
Tauri error, or stack.

#### Scenario: Display loading feedback in either locale and theme

- **WHEN** the Runtime is resolving or loading and the locale or theme changes
- **THEN** Host feedback, title, status semantics and appearance use the current
  locale and theme
- **THEN** Page context, the close control, and keyboard focus remain available

#### Scenario: Display a retryable bounded failure accessibly

- **WHEN** the Runtime enters load timeout, handshake timeout, disconnect,
  security-policy or ordinary bounded failure outside cooldown
- **THEN** assistive technology can perceive the safe localized error and the
  retry action has a stable accessible name and visible focus
- **THEN** feedback displays no raw target, private state, author content or
  underlying exception

#### Scenario: Display circuit-breaker cooldown

- **WHEN** repeated qualifying failures open the 30 second cooldown
- **THEN** the Host announces a localized temporary-unavailability state,
  retains an accessible close path, and does not create or schedule an automatic
  Runtime restart
- **THEN** switching locale or theme changes only presentation and cannot reset
  or extend the breaker

### Requirement: Exactly one active Plugin Page iframe MUST exist only for the current Page lifetime

The system MUST continue to use the existing single-window Page surface and
MUST create at most one current external Plugin Page iframe at a time. Host
Pages MUST continue to render as trusted React modules. The iframe MUST exist
only while `presentationState === "page"`, the current target still resolves as
an available Plugin Page, the descriptor remains current, and the corresponding
attempt is not failed, terminating, disposed, or in breaker cooldown. Manual
close, provider quiescence, disable, uninstall, replacement, a relevant change
to the current entry, Page, version, resource generation, origin URL, Runtime
attempt, load/handshake failure, unexpected Session disconnect, Home
or Search navigation, Host Page navigation, retry, Host reload, App unmount or
graceful application exit MUST route through the same idempotent terminal
cleanup and remove the old iframe before another is constructed. Registration
invalidation MUST trigger a refresh and comparison of current plugin facts, but
a process-local global revision change caused only by another plugin MUST NOT
remove or recreate the current iframe, navigation lease or Runtime Session. If
the Host cannot prove that the current plugin facts remain unchanged, it MUST
fail closed. The system MUST NOT retain a hidden iframe, background Runtime,
second Page state, Router, history, tab, iframe pool, preload or cross-Page
reuse.

#### Scenario: Open and close one Plugin Page

- **WHEN** a user opens an available external Plugin Page from a unified
  Launcher Action
- **THEN** the existing surface creates exactly one current iframe and one
  Runtime attempt
- **WHEN** the user activates the shared close control
- **THEN** the terminal cleanup removes the iframe, Session, listener, timer and
  lease, the App returns Home, query and selection are cleared, and focus
  returns to the Launcher input

#### Scenario: Switch between external Plugin Pages

- **WHEN** the user selects another available external Plugin Page
- **THEN** the Host terminates the old Runtime before constructing the new
  iframe and never exposes two current external Runtime bindings
- **THEN** a late event from the first Page cannot load, fail, authenticate or
  dispose the second Page

#### Scenario: Active plugin facts change

- **WHEN** Page invalidation, provider quiescence, disable, uninstall,
  replacement, or a relevant entry, Page, version, resource generation, origin
  URL, Runtime attempt, or availability change occurs
- **THEN** the old iframe, timers, listeners, navigation lease and bound Runtime
  Session are revoked without retaining a second active Runtime
- **THEN** Home, Search and a `lensx.core` Host Page still create no external
  plugin iframe

#### Scenario: Unrelated registration facts change

- **WHEN** another plugin changes the global Registration revision while the
  current Plugin Page's entry, Page, version, resource generation, origin URL,
  Runtime attempt and availability remain unchanged
- **THEN** the current iframe, navigation lease and bound Runtime Session remain
  active and are not recreated solely because the global revision changed
- **THEN** the Host still refreshes and compares relevant current facts rather
  than ignoring the invalidation event

#### Scenario: App teardown races with late Runtime work

- **WHEN** Host reload, App unmount or graceful application exit terminates the
  current attempt and an old resolve, load, timer or Port event arrives later
- **THEN** cleanup remains idempotent, no iframe or Session is restored, and no
  late callback changes a current or future attempt
- **THEN** the next process begins without a persisted iframe, attempt or
  breaker record

### Requirement: Delivery MUST prove the Runtime boundary on real package and WebView paths

Delivery MUST use canonical normal and malicious `.lxp` fixtures and the target
macOS WKWebView to verify the isolated browser origin, HTML, CSS, images,
classic scripts, and ES Module graph, current same-origin storage, isolation
from Host, other-plugin, and old-generation storage, absence of parent,
`frameElement`, and Tauri access, the Host-derived route, exact navigation
lease, cross-scope and cross-origin navigation, popup, top-navigation, download,
form, and browser-feature denial, and close or invalidation cleanup. Simulated
DOM, Rust unit tests, and source inspection MUST NOT replace real WebView
evidence. This change MUST NOT claim Windows or Linux Runtime support.

#### Scenario: macOS WKWebView security matrix passes

- **WHEN** the dedicated gate installs and opens the normal and malicious
  `.lxp` fixtures
- **THEN** the normal fixture loads its complete module and resource graph in
  the current isolated origin, while every Host, Tauri, cross-plugin or
  cross-generation storage, resource, navigation, and browser-capability attempt
  from the malicious fixture fails consistently
- **THEN** evidence records bounded platform, dependency, and bundle facts and
  contains no capability URL, origin token, invoke key, raw payload, or local
  path

#### Scenario: Target WebView cannot enforce the design

- **WHEN** any isolated-origin, ES Module graph, parent or Tauri absence,
  storage isolation, or current-lease property cannot be proved
- **THEN** the change cannot declare Task 4.2 complete or check its roadmap box
- **THEN** the team must update the relevant prerequisite or this change rather
  than relaxing origin, sandbox, or CORS policy or removing a negative case

### Requirement: Task 4.2 MUST leave later Runtime and Host API capabilities unimplemented

This capability MUST deliver only Host-private target resolution, the
isolated-origin iframe container, fixed sandbox, Permissions Policy, and
navigation boundary, container state, retry, one-active-Page lifecycle, tests,
and maintained documentation. It MUST NOT define a Runtime Session, message
source, identity, nonce, or MessagePort, SDK iframe transport, JSON-RPC, Host
API, native-authority dispatch, pending calls, a complete CSP, general timeout or
crash recovery, external opener, background Runtime, sidecar, formal template,
or management UI.

#### Scenario: Task 4.2 completes before later tasks

- **WHEN** all validation for this change passes while Tasks 4.3 and 4.4 and
  Milestone 5 remain undelivered
- **THEN** the user can open, view, retry, and close an isolated local plugin UI
  in the existing Page surface
- **THEN** the plugin still cannot establish trusted Host communication, call a
  Host API, obtain native authority, run background work, or claim that a
  complete CSP or lifecycle has shipped

### Requirement: Iframe lifetime MUST own every supported child execution context

The current iframe MUST be the sole page-execution owner of its Dedicated Workers, network activity, Blob URLs, and browser-origin state. The Host MUST revoke the Session, Port, and navigation lease before the iframe attempt ends and MUST prove that an old child context cannot affect the next attempt, another plugin, or the Host.

#### Scenario: Plugin switch occurs while Worker is active
- **WHEN** the user switches to another plugin Page while the current plugin still has an active Worker
- **THEN** the Host makes the old attempt terminal and removes the old iframe before creating the new iframe
- **THEN** at most one plugin Page attempt owns the current Session and navigation lease at any observable time
