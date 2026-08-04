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

An external plugin iframe MUST use exactly
`sandbox="allow-scripts allow-same-origin"`, and `allow-same-origin` MUST take
effect only after the isolated-origin prerequisite proves that the current
entry browser origin differs from the Host, other plugins, and old generations.
The Host MUST NOT add forms, popups, downloads, modals, pointer lock,
presentation, storage access, or any top-navigation token. The iframe MUST use
`no-referrer`, and a Host-fixed Permissions Policy MUST deny camera,
microphone, geolocation, fullscreen, clipboard read and write, and other
sensitive browser capabilities available on the supported platform. The
Manifest and plugin code MUST NOT override these attributes. The Host MUST NOT
inject the Tauri invoke key, `__TAURI_INTERNALS__`, React internals, a Resource
or Registration adapter, or a native object.

#### Scenario: A valid module plugin runs in its isolated origin

- **WHEN** the Host creates an iframe for the current descriptor
- **THEN** the iframe uses the exact sandbox, referrer, and Permissions Policy
  and loads package HTML, CSS, images, classic scripts, and the ES Module
  dependency graph
- **THEN** the document receives ordinary browser semantics only for its own
  isolated origin and gains no Host, other-plugin, old-generation, or additional
  sandbox capability

#### Scenario: Plugin attempts to reach the parent or Host storage

- **WHEN** a plugin attempts to read or modify the `window.parent` DOM,
  `frameElement`, Host React state, Host storage, a Tauri surface, or a native
  object
- **THEN** the browser, origin, and bootstrap boundary rejects the attempt
  before privileged Host behavior
- **THEN** the representative Tauri handler-hit count remains zero and Host
  state is unchanged

#### Scenario: Shared origin is presented to the container

- **WHEN** the resolver receives the shared `lensx-plugin://localhost` form, an
  equivalent translated host, or a URL whose exclusivity cannot be proved
- **THEN** the iframe policy validator rejects container creation
- **THEN** the Host neither degrades by removing `allow-same-origin` nor adds
  wildcard or null CORS to a response

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

The Task 4.2 container MUST use the states `resolving`, `loading`, `loaded`,
`failed`, and `disposed`. `loaded` MUST mean only that the iframe reported one
load completion; it MUST NOT mean that all resources succeeded, JavaScript is
healthy, the SDK initialized, an identity handshake or Session exists, or the
Host API is ready. The system MUST map only Host-known snapshot, resource, or
origin validation failures, boundary mismatches, navigation rejection, and Host
container errors to `failed`. Timeouts, crash loops, Host reload, Session
disconnect, and pending-call cleanup belong to a later capability.

#### Scenario: Browser reports iframe load completion

- **WHEN** an iframe in `loading` reports load completion
- **THEN** the container enters `loaded` and removes Host loading feedback
- **THEN** UI, logs, state, and documentation do not call that signal `ready`

#### Scenario: User explicitly retries a failure

- **WHEN** the user activates the Host-owned retry action
- **THEN** the system resolves the entry, origin, and lease again from the
  current snapshot and creates a new attempt and iframe
- **THEN** the old promise, URL, origin lease, and iframe are not reused, and
  the system neither loops automatically nor creates concurrent iframes

### Requirement: Runtime feedback MUST be accessible, localized, and theme-compatible

Host-owned resolving, loading, failure, and retry UI MUST use the application
i18n layer, Semi Design, and the existing light and dark themes. English MUST
be canonical and Simplified Chinese MUST remain semantically aligned. Loading
MUST expose busy and polite status semantics, failure MUST expose error and
alert semantics, and retry MUST support keyboard operation and visible focus.
The iframe MUST have a non-empty accessible title derived from the localized
Page title and MUST fill the existing Page content slot. Shared Page context,
the close control, and focus restoration MUST remain available.

#### Scenario: Display loading feedback in either locale and theme

- **WHEN** the Runtime is resolving or loading and the locale or theme changes
- **THEN** Host feedback, title, and status semantics use the current locale and
  theme
- **THEN** Page context, the close control, and keyboard focus remain available

#### Scenario: Display a retryable failure accessibly

- **WHEN** the Runtime enters a bounded failure
- **THEN** assistive technology can perceive the safe error and the retry action
  has a stable accessible name and visible focus
- **THEN** feedback displays no raw URL, origin, scope, path, Rust or Tauri
  error, or author HTML

### Requirement: Exactly one active Plugin Page iframe MUST exist only for the current Page lifetime

The system MUST continue to use the existing single-window Page surface and
MUST create at most one current external Plugin Page iframe at a time. Host
Pages MUST continue to render as trusted React modules. The iframe MUST exist
only while `presentationState === "page"`, the current target still resolves as
an available Plugin Page, and the descriptor remains current. Manual close,
Registry invalidation, provider quiescence, disable, uninstall, replacement, a
change to entry, revision, or origin URL, Home or Search navigation, or App
unmount MUST remove the old iframe. The system MUST NOT retain a hidden iframe,
background Runtime, second Page state, Router, history, tab, iframe pool, or
cross-Page reuse.

#### Scenario: Open and close one Plugin Page

- **WHEN** a user opens an available Plugin Page from a unified Launcher Action
- **THEN** the existing surface creates exactly one current iframe
- **WHEN** the user activates the shared close control
- **THEN** the iframe is removed, the App returns Home, query and selection are
  cleared, and focus returns to the Launcher input

#### Scenario: Active plugin facts change

- **WHEN** Page invalidation, provider quiescence, disable, uninstall,
  replacement, or an entry, revision, or origin URL change occurs
- **THEN** the old iframe and lease are revoked without retaining a second
  active Runtime
- **THEN** Home, Search, and a `lensx.core` Host Page still create no external
  plugin iframe

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
API, permission dispatch, pending calls, a complete CSP, general timeout or
crash recovery, external opener, background Runtime, sidecar, formal template,
or management UI.

#### Scenario: Task 4.2 completes before later tasks

- **WHEN** all validation for this change passes while Tasks 4.3 and 4.4 and
  Milestone 5 remain undelivered
- **THEN** the user can open, view, retry, and close an isolated local plugin UI
  in the existing Page surface
- **THEN** the plugin still cannot establish trusted Host communication, call a
  Host API, obtain a permission decision, run background work, or claim that a
  complete CSP or lifecycle has shipped
