# Plugin Runtime Security Lifecycle Specification

## Purpose

Define the Host-owned Content Security Policy and process-local lifecycle
boundary for external Plugin Page Runtimes, including bounded deadlines,
generation-aware terminal cleanup, circuit breaking, single-instance
enforcement, safe diagnostics, and deterministic security and lifecycle
validation.
## Requirements

### Requirement: Host and plugin documents MUST run under distinct Host-owned Content Security Policies

The production Host main document and every eligible plugin Runtime document MUST use non-empty, mutually independent Content Security Policies controlled by lensX. The Host policy MUST continue to allow only the validated Host bundle, Tauri IPC, and current plugin document class. The plugin policy MUST enforce only trusted Host ancestry, Host and cross-plugin isolation, and Runtime boundaries that an author cannot relax. It MUST NOT treat Worker, network, remote HTTPS or WSS resources, `blob:`, `data:`, WASM, or browser origin storage as lensX permission-gated content categories. A plugin's own policy MAY narrow its content sources further, but Manifest, HTML, or remote content MUST NOT relax isolation policy in the Host header.

The Host main policy MUST NOT change because the plugin Web Runtime is open. Both policies MUST prevent a plugin from obtaining Host Tauri authority, using the plugin document as the Host main document, reusing an origin across plugins, or embedding through a wildcard ancestor.

#### Scenario: Plugin uses open content capability

- **WHEN** the current plugin document creates a Dedicated Worker, loads package, remote, Blob, or Data content, or opens a network connection
- **THEN** the plugin policy requires no lensX grant and browser-standard behavior remains within the open Web baseline
- **THEN** the Host main CSP, trusted ancestor, Tauri initialization, and another plugin origin remain unreachable

#### Scenario: Plugin attempts to relax Host isolation

- **WHEN** a Manifest, HTML, remote script, or plugin message declares a wildcard ancestor, Host or Tauri source, shared plugin origin, or broader Host bridge
- **THEN** the Host-owned response policy and document and origin boundaries remain authoritative and prevent escalation
- **THEN** installation, official source, Publisher, and community labels create no exception

#### Scenario: Production Host starts with bounded policy

- **WHEN** the production Tauri application loads its bundled Host document
- **THEN** a non-empty Host CSP permits the verified lensX bundle, Tauri IPC, and current plugin document class without enabling arbitrary remote or inline script execution
- **THEN** Host Settings, Launcher, locale, theme, Action dispatch, and trusted Tauri invocation retain their existing behavior

#### Scenario: Existing Host styling requires an exception

- **WHEN** the production Host bundle cannot express its verified Semi Design UI without a style-only inline mechanism
- **THEN** any accepted exception is restricted to `style-src`, is locked by production bundle inspection and deterministic light/dark theme state tests, and does not expand script, connect, frame, object, base, or form policy
- **THEN** inability to justify that minimum exception prevents completion rather than enabling a general unsafe policy

### Requirement: Every Runtime attempt MUST have one idempotent generation-aware terminal cleanup
Every explicit open, retry or committed development reload MUST create a fresh process-local attempt. Close, navigation away, disable, uninstall, replacement, reload, disconnect, failure, breaker, Host reload, App unmount and process exit MUST converge on one idempotent coordinator that rejects new ingress, aborts work, removes bridge/Session/resource/navigation authority, hides and destroys the Child WebView, and clears bounds, focus, listeners, timers and caches. Every late callback MUST compare current attempt before publishing state.

#### Scenario: User closes a ready plugin Page
- **WHEN** the current external Page closes
- **THEN** its Child WebView and every owned execution/authority binding terminate exactly once
- **THEN** no hidden Runtime, Worker, connection or reusable attempt remains

#### Scenario: Lifecycle events race with a new attempt
- **WHEN** close, retry, invalidation, replacement, development reload or removal and old asynchronous completions race while a later attempt becomes current
- **THEN** old cleanup and late events can affect only their own attempt and cannot release, fail, load, authenticate or revive the current attempt
- **THEN** repeated cleanup succeeds safely without double-closing or retaining resources

#### Scenario: Application process terminates unexpectedly
- **WHEN** the process exits or crashes before JavaScript can finish best-effort cleanup and later restarts
- **THEN** operating-system process teardown removes process resources, and the new process restores no resource scope, Runtime attempt, breaker record, Session, bridge, Child WebView, listener, timer or pending work
- **THEN** persistent installed Registration continues to recover with Runtime `inactive`, while development Registration does not recover

#### Scenario: Development reload commits a new generation
- **WHEN** a manual reload of the current development Plugin Page successfully commits a new resource generation
- **THEN** the Host makes the old attempt terminal and clears all of its authority before creating a fresh attempt, Child WebView, bridge freshness value and Session for the still-current Page
- **THEN** development source relaxes none of navigation, origin, bridge ACL, deadlines, breaker, single-WebView, Host API or Host-authority boundaries

#### Scenario: Development reload fails before commit
- **WHEN** a new development snapshot becomes invalid, incompatible, unsafe or unreadable, or loses a revision race before Manager commit
- **THEN** the current Runtime attempt is neither terminated nor switched to a new generation because of uncommitted input
- **THEN** failed staging, late callbacks and diagnostics gain no Resource, Session or handler authority

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

### Requirement: Open execution contexts MUST terminate completely with the Runtime attempt
Every Dedicated Worker, connection, Blob URL and other supported page-owned context MUST be owned by the current Child WebView attempt and generation. Terminal destroy MUST make it terminated or uncontrollable and without Host authority. SharedWorker, ServiceWorker and background contexts that can outlive the Page remain unsupported.

#### Scenario: Page closes while Worker and connection are active
- **WHEN** the Host destroys a Child WebView whose plugin Page still has a Dedicated Worker and active network work
- **THEN** teardown terminates its page-owned execution contexts or leaves them uncontrollable and without Host authority
- **THEN** a new Page does not reuse the old Worker, connection, Blob URL, Session, bridge or origin scope

#### Scenario: Persistent worker is requested
- **WHEN** a plugin attempts to register a SharedWorker, ServiceWorker or background context that could outlive the current Page or generation
- **THEN** the current supported baseline rejects or does not claim support for that capability
- **THEN** the context retains no plugin authority after Page close, replacement or Host restart

### Requirement: Child WebView load and bridge readiness MUST have bounded deadlines
Each attempt MUST have a deterministic 10,000 millisecond initial-load deadline and a 5,000 millisecond bridge-ready deadline. The matching current event clears only its own timer. Expiry MUST produce stable `runtime_load_timeout` or `runtime_handshake_timeout`, run terminal cleanup and never retry automatically.

#### Scenario: Child WebView misses load deadline
- **WHEN** current exact document does not finish loading within 10 seconds
- **THEN** Host destroys the attempt and a late load event is inert

#### Scenario: Bridge misses ready deadline
- **WHEN** a loaded WebView does not complete current bridge ready within 5 seconds
- **THEN** Host destroys WebView, bridge and Session state without automatic restart

### Requirement: Host MUST keep at most one active external Plugin Page Child WebView
The Launcher MUST contain at most one external plugin Child WebView. Switching to another Page MUST terminally destroy the current attempt before creating the next. Host Pages MUST use the trusted Host WebView; preload, pool, hidden background Runtime and multi-plugin concurrency MUST remain absent.

#### Scenario: User switches plugin Pages
- **WHEN** navigation selects another external Page
- **THEN** old Child WebView teardown completes before the new one is created

### Requirement: Plugin CSP MUST be delivered by current scoped resource responses and deterministically validated

The Host MUST attach the current plugin isolation CSP as a response header to every successful current scoped HTML response and preserve matching security headers for GET and HEAD. The policy MUST use the exact trusted Host ancestor and operate with scope, generation, path, MIME, `nosniff`, `no-store`, and no-Host-CORS guarantees. It MUST NOT rely on author meta, HTML rewriting, reflected Host origin, shared plugin origin, or removal of negative cases. Deterministic response, resource-graph, header, CSP parsing, Session, and boundary tests MUST cover supported content categories and Host/Tauri, cross-plugin, stale-generation, popup, top-navigation, and persistent-background denial.

#### Scenario: Current open resource graph is validated

- **WHEN** canonical package and remote resource fixtures traverse current resource-response and policy tests
- **THEN** supported categories remain within the current plugin origin and policy while Host-owned responses preserve scope, generation, MIME, `nosniff`, `no-store`, and safe diagnostics
- **THEN** validation does not claim that a target WebView executed the graph

#### Scenario: Open content attempts to obtain Host or old authority

- **WHEN** malicious fixtures model attempts to access Host/Tauri, another plugin, an old generation, popup, top navigation, or persistent background authority
- **THEN** origin, navigation, Session, Resource, and lifecycle boundaries reject them
- **THEN** diagnostics disclose no target URI, origin token, scope, path, payload, or private error

### Requirement: Delivery MUST deterministically prove CSP and terminal lifecycle

Delivery MUST combine Rust response tests, deterministic TypeScript state/race tests, React accessibility/i18n/theme tests, canonical normal and malicious packages, package-boundary checks, and production configuration drift tests. It MUST cover allowed and forbidden content classes, no Host/Tauri access, load/bridge deadlines as state logic, circuit breaking, exactly one current Child WebView model, terminal triggers, cleanup calls, late-event inertness, unrelated-plugin stability, and zero privileged handler hits. It MUST NOT require browser, real WebView, GUI, native harness, or environment evidence.

#### Scenario: Complete deterministic security lifecycle gate passes

- **WHEN** maintained normal, malicious, slow, never-ready, repeated-failure, reload, and replacement matrices run with prerequisite deterministic Gates
- **THEN** CSP, deadline, breaker, instance, cleanup, and boundary assertions pass
- **THEN** public package checks confirm policy, controller, scheduler, breaker, Session, and native response internals remain Host-private

#### Scenario: A security or cleanup invariant cannot be established

- **WHEN** a required CSP source class, deadline, terminal trigger, late-event guard, single-instance rule, cleanup call, or zero-handler-hit assertion fails
- **THEN** the capability remains incomplete and design or implementation is corrected
- **THEN** validation does not relax CSP, remove negative cases, hide Runtime state, or restore real WebView evidence as an optional path
