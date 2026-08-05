## MODIFIED Requirements

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
blocked URI, origin/scope, path, nonce, Port content, grants, raw browser/Rust/
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
attempt or grants, load/handshake failure, unexpected Session disconnect, Home
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
  URL, Runtime attempt, availability or grant change occurs
- **THEN** the old iframe, timers, listeners, navigation lease and bound Runtime
  Session are revoked without retaining a second active Runtime
- **THEN** Home, Search and a `lensx.core` Host Page still create no external
  plugin iframe

#### Scenario: Unrelated registration facts change

- **WHEN** another plugin changes the global Registration revision while the
  current Plugin Page's entry, Page, version, resource generation, origin URL,
  Runtime attempt, availability and grants remain unchanged
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

