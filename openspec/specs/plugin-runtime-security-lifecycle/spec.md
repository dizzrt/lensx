# Plugin Runtime Security Lifecycle Specification

## Purpose

Define the Host-owned Content Security Policy and process-local lifecycle
boundary for external Plugin Page Runtimes, including bounded deadlines,
generation-aware terminal cleanup, circuit breaking, single-instance
enforcement, safe diagnostics, and real WebView evidence.

## Requirements

### Requirement: Host and plugin documents MUST run under distinct Host-owned Content Security Policies

The production Host main document and every eligible plugin Runtime document MUST use non-empty, mutually independent Content Security Policies controlled by lensX. The Host policy MUST continue to allow only the validated Host bundle, Tauri IPC, and the current plugin frame class. The plugin policy MUST enforce only trusted Host ancestry, Host and cross-plugin isolation, and Runtime boundaries that an author cannot relax. It MUST NOT treat Worker, network, remote HTTPS or WSS resources, `blob:`, `data:`, WASM, or browser origin storage as lensX permission-gated content categories. A plugin's own policy MAY narrow its content sources further, but the Manifest, HTML, or remote content MUST NOT relax isolation policy in the Host header.

The Host main policy MUST NOT change because the plugin Web Runtime is open. Both policies MUST prevent a plugin from obtaining Host Tauri authority, using the plugin document as the Host main document, reusing an origin across plugins, or embedding through a wildcard ancestor.

#### Scenario: Plugin uses open content capability
- **WHEN** the current plugin document creates a Dedicated Worker, loads package, remote, Blob, or Data content, or opens a network connection
- **THEN** the plugin policy requires no lensX grant and the target WebView follows the open Web baseline
- **THEN** the Host main CSP, trusted ancestor, Tauri initialization, and another plugin origin remain unreachable

#### Scenario: Plugin attempts to relax Host isolation
- **WHEN** a Manifest, HTML, remote script, or plugin message declares a wildcard ancestor, Host or Tauri source, shared plugin origin, or broader Host bridge
- **THEN** the Host-owned response policy and iframe and origin boundaries remain authoritative and prevent escalation
- **THEN** installation, official source, Publisher, and community labels create no exception

#### Scenario: Production Host starts with bounded policy

- **WHEN** the production Tauri application loads its bundled Host document
- **THEN** a non-empty Host CSP permits the verified lensX bundle, Tauri IPC, and current plugin frame class without enabling arbitrary remote or inline script execution
- **THEN** Host Settings, Launcher, locale, theme, Action dispatch, and trusted Tauri invocation retain their existing behavior

#### Scenario: Existing Host styling requires an exception

- **WHEN** the production Host bundle cannot render its verified Semi Design UI without a style-only inline mechanism
- **THEN** any accepted exception is restricted to `style-src`, is locked by production bundle and light and dark visual evidence, and does not expand script, connect, frame, object, base, or form policy
- **THEN** inability to justify that minimum exception prevents completion rather than enabling a general unsafe policy

### Requirement: Plugin CSP MUST be delivered by the current scoped resource response and proven on the target WebView

The Host MUST attach the current plugin isolation CSP as a response header to every successful current scoped HTML response and preserve matching security headers for GET and HEAD. The policy MUST use the exact trusted Host ancestor and operate together with scope, generation, path, MIME, `nosniff`, `no-store`, and no-Host-CORS guarantees. It MUST NOT rely on an author meta element, HTML rewriting, reflected Host origin, a shared plugin origin, or removal of frame and navigation negative cases.

The open package and remote module graph, Dedicated Worker, network, Blob, Data, and WASM MUST have positive evidence in the target WebView. Host and Tauri, cross-plugin, stale-generation, popup, top-navigation, and persistent-background execution MUST have negative evidence. A plugin author policy MAY intersect with the Host header to narrow its own behavior.

#### Scenario: Current open module graph loads
- **WHEN** a current isolated plugin loads package and remote script, style, image, and font content, creates a Dedicated Worker, and opens a browser connection
- **THEN** the supported graph executes inside the current plugin origin and sandbox
- **THEN** every Host-owned resource response preserves current scope, generation, MIME, `nosniff`, `no-store`, and safe diagnostic boundaries

#### Scenario: Open content attempts to obtain Host or old authority
- **WHEN** package, remote, Blob, Data, or Worker code attempts to access Host or Tauri, another plugin, an old generation, a popup, top navigation, or a persistent background context
- **THEN** the iframe, origin, navigation, Session, or Resource boundary blocks the attempt
- **THEN** negative evidence records only bounded content categories and platform facts without disclosing a target URI, origin token, scope, path, payload, or private error

#### Scenario: Target WebView cannot enforce open and isolated policy
- **WHEN** a supported platform cannot prove the open Web success path, exact Host ancestor, GET and HEAD header agreement, Host and cross-plugin negative paths, and teardown together
- **THEN** the capability remains incomplete
- **THEN** production does not fall back to a shared origin, Tauri exposure, no ancestor restriction, or an unverified residual Worker

### Requirement: Every Runtime attempt MUST have one idempotent generation-aware terminal cleanup

The Host MUST assign each explicit open, retry, or successful development
reload a fresh process-local Runtime attempt and MUST route manual close,
navigation away, retry, provider quiescence, disable, uninstall, replacement,
development reload, remove, or mode shutdown, relevant current-fact
change, resolution, load, or handshake failure, unexpected Session disconnect,
Host reload, App unmount, and graceful application exit through one terminal
operation. The operation MUST reject new Runtime-owned work, cancel cancellable
resolve, currentness, load, and handshake work, make non-cancellable stale
completions inert, clear timers, unsubscribe listeners, dispose the Session and
Ports, remove the iframe, compare-current release the navigation lease, and
discard window and descriptor references. Cleanup MUST be idempotent, and every
late callback MUST compare the attempt before changing current state.

#### Scenario: User closes a ready plugin Page

- **WHEN** the user closes the current ready external or development Plugin Page
- **THEN** the Host terminates the attempt exactly once, removes its iframe, Session, Ports, listeners, timers and navigation lease, and returns through the existing Home/focus behavior
- **THEN** no hidden Runtime, pending Runtime-owned work, window reference or reusable attempt remains

#### Scenario: Lifecycle events race with a new attempt

- **WHEN** close, retry, invalidation, replacement, development reload or remove,
  and old async completions race while a later attempt becomes current
- **THEN** old cleanup and late events can affect only their own attempt and cannot release, fail, load, authenticate or revive the current attempt
- **THEN** repeated cleanup succeeds safely without double-closing or retaining resources

#### Scenario: Application process terminates unexpectedly

- **WHEN** the process exits or crashes before JavaScript can finish best-effort cleanup and later restarts
- **THEN** operating-system process teardown removes process resources, and the new process restores no scope, Runtime attempt, breaker record, Session, nonce, Port, iframe, listener, timer or pending work
- **THEN** persistent installed Registration continues to recover with Runtime
  `inactive`, while development Registration does not recover

#### Scenario: Development reload commits a new generation

- **WHEN** a manual reload of the current development Plugin Page successfully
  commits a new resource generation
- **THEN** the Host makes the old attempt terminal and clears all of its
  authority before creating a fresh attempt, iframe, nonce, MessageChannel, and
  Session for the still-current page
- **THEN** development source relaxes none of CSP, sandbox, Permissions Policy,
  deadlines, breaker, single-iframe, Host API, or Host-authority boundaries

#### Scenario: Development reload fails before commit

- **WHEN** a new development snapshot becomes invalid, incompatible, unsafe, or
  unreadable, or loses a revision race before Manager commit
- **THEN** the current Runtime attempt is neither terminated nor switched to a
  new generation because of uncommitted input
- **THEN** failed staging, late callbacks, and diagnostics gain no Resource,
  Session, or handler authority

### Requirement: Iframe load and Runtime Session handshake MUST have bounded deadlines

The current attempt MUST have a 10,000 millisecond iframe load deadline starting after its navigation lease is active and iframe source is committed, and a 5,000 millisecond Session handshake deadline starting after the bootstrap is sent. The matching load or first exact ready acknowledgement MUST clear only its own deadline. Expiry MUST produce a stable bounded failure, execute terminal cleanup, and MUST NOT automatically retry. Deadlines MUST remain Host-private and deterministically testable; a user retry MUST resolve all current facts again and create a fresh attempt, iframe, nonce, MessageChannel and lease.

#### Scenario: Canonical plugin loads and authenticates before both deadlines

- **WHEN** the current iframe loads within 10 seconds and its Session returns the exact acknowledgement within 5 seconds of bootstrap
- **THEN** both timers are cleared, the presentation retains the `loaded` distinction, and the Host-private Session enters `ready`
- **THEN** no timeout timer can later fail that attempt

#### Scenario: Iframe never loads

- **WHEN** the current iframe does not deliver its matching load event within 10 seconds
- **THEN** the Host reports `runtime_load_timeout`, performs terminal cleanup, and creates no Session
- **THEN** a late load event cannot change the failed/disposed state or start a handshake

#### Scenario: Session never acknowledges

- **WHEN** a loaded iframe receives the bootstrap but does not return the matching ready acknowledgement within 5 seconds
- **THEN** the Host reports `runtime_handshake_timeout`, closes both controllable Ports, and performs terminal cleanup
- **THEN** a late or replayed acknowledgement cannot enter `ready` or create a Port lease

### Requirement: Repeated Runtime failures MUST open a bounded process-local circuit breaker without automatic restart

The Host MUST count qualifying failures by trusted entry identity and current resource generation. Load timeout, handshake timeout, an unexpected ready-Session/WebView disconnect, or a supported WebView process-failure signal MUST qualify; user close, navigation, relevant Registration invalidation, replacement and graceful Host exit MUST NOT. The third qualifying failure within a rolling 60,000 milliseconds MUST open a 30,000 millisecond cooldown before any new Runtime resource, lease, iframe or Session is created. Cooldown expiry MUST NOT launch automatically. A new resource generation or 30,000 milliseconds of continuous ready state MUST clear that key's failure history, and all breaker state MUST disappear at process exit.

#### Scenario: Plugin fails three times quickly

- **WHEN** the same current entry and resource generation has three qualifying failures within 60 seconds
- **THEN** the Host enters cooldown, exposes `runtime_crash_loop`, and refuses to construct another Runtime for 30 seconds
- **THEN** no hidden or automatic retry creates a resolver request, lease, iframe, nonce, MessageChannel or Session during cooldown

#### Scenario: Cooldown expires

- **WHEN** 30 seconds pass after the breaker opens
- **THEN** the Host still remains idle until the user explicitly retries, after which it rereads current facts and creates one new attempt
- **THEN** a stale retry event from before cooldown cannot create a Runtime

#### Scenario: Current generation changes or remains healthy

- **WHEN** replacement creates a new resource generation, or the current generation remains continuously Session-ready for 30 seconds
- **THEN** the corresponding failure history is cleared without mutating Plugin Manager, quarantine, source, or enabled intent
- **THEN** unrelated plugin failures do not open or reset this entry's breaker

### Requirement: The Host MUST keep at most one active external Plugin Page iframe in the window

The single-window Page surface MUST contain at most one active external plugin iframe globally and therefore at most one per plugin. Switching targets MUST terminate the current attempt before constructing the next. The Host MUST NOT preload, hide, pool, persist, background, share across Pages, or automatically restore a plugin iframe; Host Pages MUST remain trusted React surfaces without an external Runtime.

#### Scenario: User switches between external Plugin Pages

- **WHEN** navigation selects another available external Plugin Page
- **THEN** the Host completes terminal disposal of the current attempt before it mounts the next iframe
- **THEN** observation never finds two current external plugin iframes, Sessions or navigation leases

#### Scenario: User opens a Host Page or returns to Search

- **WHEN** navigation leaves the external Plugin Page for Home, Search or a `lensx.core` Host Page
- **THEN** the external Runtime is terminated and no hidden/background iframe remains
- **THEN** the Host Page uses the existing trusted React composition

### Requirement: Runtime security failures MUST remain bounded, accessible, localized and non-oracular

The Host MUST map Runtime security and lifecycle failures to stable Host-private codes including at least `runtime_load_timeout`, `runtime_handshake_timeout`, `runtime_session_disconnected`, `runtime_security_policy_failure`, `runtime_crash_loop`, and `runtime_unavailable`. User feedback MUST use the application i18n layer with canonical English and semantically aligned Simplified Chinese, preserve alert/status semantics, keyboard interaction, focus restoration and the supported light/dark themes, and MUST NOT display author HTML or raw browser/native errors. Logs, plugin responses and evidence MUST NOT expose complete URLs, blocked URIs, origin/scope tokens, nonce, Port contents, installation paths, grant lists, payloads, raw exceptions or stacks. No remote CSP reporting channel is introduced.

#### Scenario: Trustworthy CSP failure signal is available

- **WHEN** the supported Host boundary reports a CSP failure without exposing its blocked target
- **THEN** the UI may present the stable bounded security-policy failure while evidence records only the directive/content class and safe platform facts
- **THEN** the signal grants no identity, permission or retry exemption

#### Scenario: Browser blocks content without a trustworthy production callback

- **WHEN** CSP enforcement blocks plugin behavior but WKWebView exposes no safe Host callback
- **THEN** the browser still blocks the behavior and the Host converges through the appropriate bounded load/handshake/runtime failure without inventing an exact violation source
- **THEN** the real harness separately proves the blocked directive/content class without adding a reporting channel or recording sensitive target data

#### Scenario: Failure is shown in either locale and theme

- **WHEN** timeout, disconnect, security failure or cooldown feedback is visible and locale or theme changes
- **THEN** the current localized Host-owned message, accessible name, focus state and light/dark appearance update through existing application mechanisms
- **THEN** no translated copy or theme branch changes lifecycle authority or exposes private diagnostics

### Requirement: Delivery MUST prove CSP and terminal lifecycle on focused and real WebView paths

Delivery MUST combine Rust response tests, deterministic TypeScript state/race tests, React accessibility/i18n/theme tests, canonical normal and malicious packages, and target macOS WKWebView evidence. It MUST prove production and harness CSP drift protection, allowed module/resource loading, forbidden content classes, no Host/Tauri access, load and handshake deadlines, circuit breaking, exact single iframe, all terminal triggers, zero residual controllable listeners/timers/Ports/leases, late-event inertness, unrelated-plugin stability and zero privileged handler hits. Simulated DOM, source inspection or unit tests MUST NOT replace real WebView CSP and teardown evidence, and real evidence MUST NOT replace deterministic race tests.

#### Scenario: Complete focused gate passes

- **WHEN** `check:plugin-runtime-security-lifecycle` runs the normal, malicious, slow, never-acknowledge, repeated-failure, reload and replacement matrices together with all prerequisite gates
- **THEN** every CSP, deadline, breaker, instance and cleanup assertion passes with bounded evidence on the supported macOS WKWebView
- **THEN** public package and workspace boundary checks confirm that policy, controller, scheduler, breaker, Session and native response internals remain Host-private

#### Scenario: A security or cleanup invariant cannot be proven

- **WHEN** any required CSP source class, module graph, deadline, terminal trigger, late-event guard, single-instance rule or zero-residual assertion cannot be proven
- **THEN** Task 4.4 remains incomplete and the design/specification is revised
- **THEN** validation does not substitute CSP `null`, wildcard/remote sources, relaxed CORS, author-controlled policy, automatic retry, hidden Runtime, removed negative cases, or a source-only assertion

### Requirement: Task 4.4 MUST leave SDK transport and later platform capabilities unimplemented

This capability MUST deliver only Host/private document CSP, Runtime lifecycle coordination, Runtime-owned cancellation, deadlines, process-local failure breaking, bounded diagnostics, single-instance enforcement, tests and maintained documentation. It MUST NOT define public SDK iframe transport, JSON-RPC/request IDs, Host API methods or dispatch, native-authority decisions, plugin storage, RPC pending-call cancellation, management UI, development-mode relaxation, background/sidecar execution, remote reporting, general resource quotas, signing, Catalog, Marketplace, or Windows/Linux Runtime support.

#### Scenario: Task 4.4 completes before Task 5.2

- **WHEN** all Task 4.4 validation passes while SDK iframe transport and Host API work remain undelivered
- **THEN** an isolated local plugin Page can load, authenticate, fail and terminate under bounded CSP/lifecycle rules but still cannot issue a real Host API request
- **THEN** Runtime-owned cleanup does not create request IDs, RPC envelopes, method schemas, concurrency rules or public transport behavior

### Requirement: Open execution contexts MUST terminate completely with the Runtime attempt

Every Dedicated Worker, plugin-page-initiated long-lived connection, Blob URL, and other page-owned open Web context MUST be bound to the lifecycle of the current Runtime attempt and resource generation. Close, navigation away, disable, uninstall, replacement, development reload, Session disconnect, breaker activation, Host reload, application unmount, or process exit MUST prevent an old context from continuing to obtain Session, Host, or new-generation authority.

#### Scenario: Page closes while Worker and connection are active
- **WHEN** the user closes a plugin page that still has a Dedicated Worker and active network work
- **THEN** iframe teardown terminates its page-owned execution contexts or leaves them uncontrollable and without Host authority
- **THEN** a new page does not reuse the old Worker, connection, Blob URL, Session, Port, or origin scope

#### Scenario: Persistent worker is requested
- **WHEN** a plugin attempts to register a SharedWorker, ServiceWorker, or background context that could outlive the current page or generation
- **THEN** the current supported baseline rejects or does not claim support for that capability
- **THEN** the context retains no plugin authority after page close, replacement, or Host restart
