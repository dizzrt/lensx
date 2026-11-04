# Plugin Runtime Security Lifecycle Specification

## Purpose


Define the Host-owned Content Security Policy and process-local lifecycle
boundary for plugin Page instances, including bounded deadlines, generation-aware
termination, aggregate circuit breaking, one instance per owning window, safe
retained recovery, diagnostics, and deterministic security validation.

## Requirements

### Requirement: Host and plugin documents MUST run under distinct Host-owned Content Security Policies

The production Host main document and every eligible plugin Runtime document MUST use non-empty, mutually independent Content Security Policies controlled by lensX.

#### Scenario: Host and plugin documents apply separate content policies

- **WHEN** production Host and plugin Runtime documents load content
- **THEN** The Host policy MUST continue to allow only the validated Host bundle, Tauri IPC, and current plugin document class.
- **THEN** The plugin policy MUST enforce only trusted Host ancestry, Host and cross-plugin isolation, and Runtime boundaries that an author cannot relax.
- **THEN** It MUST NOT treat Worker, network, remote HTTPS or WSS resources, `blob:`, `data:`, WASM, or browser origin storage as lensX permission-gated content categories.
- **THEN** A plugin's own policy MAY narrow its content sources further, but Manifest, HTML, or remote content MUST NOT relax isolation policy in the Host header.

#### Scenario: An open plugin Runtime retains Host isolation

- **WHEN** ordinary plugin Web capabilities are available under the Host-owned policies
- **THEN** The Host main policy MUST NOT change because the plugin Web Runtime is open.
- **THEN** Both policies MUST prevent a plugin from obtaining Host Tauri authority, using the plugin document as the Host main document, reusing an origin across plugins, or embedding through a wildcard ancestor.

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
Every new instance creation, explicit retry, or committed development reload MUST establish a fresh process-local attempt; detachment MUST preserve the original attempt. Each instance MUST execute idempotent termination independently, plugin-wide invalidation MUST terminate all matching instances, and application exit MUST clean up every instance.

#### Scenario: A Runtime attempt reaches terminal cleanup

- **WHEN** a terminal trigger or late callback occurs for a Runtime attempt
- **THEN** Actual close, navigation away within that instance, disable, uninstall, replacement, reload, disconnect, failure, trusted Host coordinator reload, or application exit MUST execute one idempotent cleanup for affected instances: reject new ingress, cancel that instance's operations, revoke its bridge/Session/resource-source/navigation leases, and destroy its WebView, focus state, listeners, and timers; shared generation resources follow the independent-source-lease and final-holder-release rules.
- **THEN** Every late callback MUST validate its owning instance's valid attempt, actual native source, and source lease before publishing state; the globally current Page or another valid instance cannot substitute for them.

#### Scenario: User closes a ready plugin Page
- **WHEN** a valid external Page instance actually closes
- **THEN** that instance's Child WebView and every owned execution/authority binding MUST terminate exactly once
- **THEN** that instance MUST leave no hidden Runtime, Worker, connection, or reusable attempt, and other valid instances MUST continue running

#### Scenario: Lifecycle events race with a new attempt
- **WHEN** close, retry, invalidation, replacement, development reload, or removal races with old asynchronous completions while that surface already has a replacement attempt or other windows retain valid instances
- **THEN** old cleanup and late events MUST affect only their own attempt and cannot release, fail, load, authenticate, or revive a replacement attempt or affect another concurrent instance
- **THEN** repeated cleanup MUST complete idempotently without duplicate closure or retained resources belonging to a terminated instance

#### Scenario: Application process terminates unexpectedly
- **WHEN** the process exits or crashes before JavaScript can finish best-effort cleanup and later restarts
- **THEN** operating-system process teardown removes process resources, and the new process restores no resource scope, Runtime attempt, breaker record, Session, bridge, Child WebView, listener, timer or pending work
- **THEN** persistent installed Registration continues to recover with Runtime `inactive`, while development Registration does not recover

#### Scenario: Development reload commits a new generation
- **WHEN** a manual reload of a development plugin successfully commits a new resource generation
- **THEN** Host MUST first terminate every affected attempt of the old generation and revoke its authority, then establish new attempts, Child WebViews, source leases, bridge freshness, and Sessions for Pages that Host still retains and permits to reopen
- **THEN** development provenance MUST NOT relax navigation, origin, bridge ACL, deadline, breaker, one-instance-per-window, Host API, or Host-authority boundaries

#### Scenario: Development reload fails before commit
- **WHEN** a new development snapshot is invalid, incompatible, unsafe, or unreadable, or loses a revision race before Manager commit
- **THEN** Host MUST preserve all still-valid instances of the old generation rather than terminating them or changing generation because of uncommitted input
- **THEN** failed staging, late callbacks, and diagnostics MUST gain no Resource, Session, or handler authority

#### Scenario: Main-window presentation returns Home after detachment commits

- **WHEN** the original instance has successfully moved to a detached window, the main window returns Home and hides, and the old presentation component in main is removed
- **THEN** Host MUST preserve the original instance, Session, Worker, requests, activation channel, and resource source lease; removal of main-window presentation MUST NOT trigger that instance's termination
- **THEN** trusted Host coordination MUST continue serving all valid instances while the main window is hidden; reopening a plugin in main cannot overwrite detached instances

#### Scenario: One window of the same plugin closes or fails

- **WHEN** A and B belong to the same plugin/Page/generation and only A actually closes or reaches terminal instance failure
- **THEN** Host MUST revoke only A's source and operations, while B's Window, Runtime, Worker, Session, HTTP, and storage access MUST remain valid
- **THEN** A's late responses, rollback, and repeated termination MUST NOT affect B or subsequently created instances

#### Scenario: Plugin lifecycle invalidation covers every owning window

- **WHEN** disable, uninstall, replacement, or development reload has committed and invalidated generation or eligibility
- **THEN** Host MUST revoke the authority of every matching old instance, then individually close or update its trusted failure presentation; processing only the currently focused window is insufficient
- **THEN** unrelated plugin instances MUST continue running; failed or cancelled operations before commit MUST preserve old instances

#### Scenario: Application exit cleans up main and detached windows

- **WHEN** the user executes Cmd+Q or the application enters full exit
- **THEN** Host MUST terminate all instances and creation/migration reservations and clean up all windows, Sessions, Workers, requests, and source leases
- **THEN** restarting MUST NOT restore detached windows, old attempts, or temporary business state

#### Scenario: Native compensation failure is not implicit instance termination
- **WHEN** detachment compensation itself cannot be confirmed but the original WebView, Session, and trusted instance have not been invalidated by an actual terminal event
- **THEN** Host MUST enter `recovery_required`, retaining the original attempt, recovery token, original snapshot, and necessary windows; compensation failure must not be treated as Runtime Retry, automatic destruction, or successful detachment
- **THEN** recovery state MUST freeze affected ownership changes and retain trusted main repair/quit entries; existing source, Session, generation, and resource-lease checks continue to apply independently
- **THEN** explicit close, plugin disable/uninstall/replace/upgrade/committed reload, and Quit MUST execute idempotent termination for the corresponding instance/generation/process scope, including recovery context; unrelated instances continue running

### Requirement: Repeated Runtime failures MUST open a bounded process-local circuit breaker without automatic restart

Host MUST aggregate qualifying failures across all instances of the same plugin by trusted entry and current resource generation, counting each instance failure only once. Three failures within 60,000ms trigger a 30,000ms cooldown; the cooldown blocks only new Runtime creation or retry and neither destroys healthy sibling instances nor changes their existing authority.

#### Scenario: Runtime events are classified for circuit breaking

- **WHEN** a Runtime lifecycle event is evaluated for failure accounting or cooldown
- **THEN** Load timeout, handshake timeout, an unexpected ready-Session/WebView disconnect, or a supported WebView process-failure signal MUST qualify; user close, navigation, relevant Registration invalidation, replacement and graceful Host exit MUST NOT.
- **THEN** The third qualifying failure within a rolling 60,000ms MUST open a 30,000ms cooldown and reject new creation before allocating any new Runtime WebView, resource or source lease, bridge-readiness handshake freshness, or Session.
- **THEN** Cooldown expiry MUST NOT launch automatically.

#### Scenario: Breaker history becomes obsolete

- **WHEN** resource generation changes, readiness remains continuous, or the process exits
- **THEN** A new resource generation MUST clear the corresponding history; within the same generation, history MUST be cleared only after at least one instance has remained continuously ready and that key has had no qualifying failure for 30,000ms. Ready events from other healthy instances cannot erase failures still accumulating; process exit MUST clear all breaker state.

#### Scenario: Plugin fails three times quickly

- **WHEN** the same current entry and resource generation has three qualifying failures within 60 seconds
- **THEN** the Host enters cooldown, exposes `runtime_crash_loop`, and refuses to construct another Runtime for 30 seconds
- **THEN** during cooldown, hidden or automatic retry MUST NOT create resource-resolution requests, source leases, Child WebViews, bridge freshness, native bridge bindings, or Sessions

#### Scenario: Cooldown expires

- **WHEN** 30 seconds pass after the breaker opens
- **THEN** Host MUST wait for an explicit user retry or open before rereading current facts and creating a new attempt, rather than automatically restarting a failed instance; existing healthy instances continue running
- **THEN** a stale retry event from before cooldown cannot create a Runtime

#### Scenario: Current generation changes or remains healthy

- **WHEN** replacement establishes a new generation, or at least one instance of the current generation remains continuously Session-ready and that key has no qualifying failure for 30 consecutive seconds
- **THEN** the corresponding failure history is cleared without mutating Plugin Manager, quarantine, source, or enabled intent
- **THEN** unrelated plugin failures do not open or reset this entry's breaker

#### Scenario: Failures across multiple instances trigger a shared cooldown

- **WHEN** multiple instances of the same entry/generation collectively reach a third qualifying failure within 60 seconds while other siblings remain healthy
- **THEN** Host MUST open a 30-second cooldown for that key and reject new Runtime creation or explicit retry; switching windows or changing instance identifiers cannot bypass it
- **THEN** healthy siblings MUST retain their current windows, Sessions, input, and ongoing operations, while failed instances follow their own terminal cleanup paths

#### Scenario: A healthy instance does not conceal continuing failures

- **WHEN** B remains ready while A of the same generation continues producing qualifying failures
- **THEN** B's ready state alone MUST NOT clear that key's rolling failure history or end its cooldown early
- **THEN** clearing MUST wait for the required continuous 30-second period without failures and with a ready instance, or an actual generation change

#### Scenario: Detach an existing healthy instance during cooldown

- **WHEN** the user detaches a ready, still-valid healthy instance while that generation is in a cooldown blocking new Runtime creation
- **THEN** transfer of the original instance without creating a new Runtime MAY complete, but MUST preserve the same attempt, existing cooldown history, and remaining cooldown duration
- **THEN** opening the plugin again in the main window after detachment MUST remain subject to the same creation restriction; a failed migration cannot trigger implicit reconstruction or automatic retry

### Requirement: Runtime security failures MUST remain bounded, accessible, localized and non-oracular

The Host MUST map Runtime security and lifecycle failures to stable Host-private codes including at least `runtime_load_timeout`, `runtime_handshake_timeout`, `runtime_session_disconnected`, `runtime_security_policy_failure`, `runtime_crash_loop`, and `runtime_unavailable`.

#### Scenario: A Runtime failure is presented and recorded

- **WHEN** security or lifecycle failure feedback reaches users, logs, plugin responses, or validation evidence
- **THEN** User feedback MUST use the application i18n layer with canonical English and semantically aligned Simplified Chinese, preserve alert/status semantics, keyboard interaction, focus restoration and the supported light/dark themes, and MUST NOT display author HTML or raw browser/native errors.
- **THEN** Logs, plugin responses and evidence MUST NOT expose complete URLs, blocked URIs, origin/scope tokens, nonce, Port contents, installation paths, grant lists, payloads, raw exceptions or stacks.
- **THEN** No remote CSP reporting channel is introduced.

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
Every Dedicated Worker, connection, Blob URL, and other supported Page context MUST belong to one independent Runtime attempt and generation. Detaching the original instance MUST preserve those contexts; actual termination MUST end that instance's contexts or leave them uncontrollable and without Host authority. A shared generation scope is not a shared execution context; SharedWorker, ServiceWorker, and background contexts that can outlive the Page remain unsupported.

#### Scenario: Page closes while Worker and connection are active
- **WHEN** the Host destroys a Child WebView whose plugin Page still has a Dedicated Worker and active network work
- **THEN** teardown terminates its page-owned execution contexts or leaves them uncontrollable and without Host authority
- **THEN** a new Page MUST NOT reuse old Workers, connections, Blob URLs, Sessions, bridges, or revoked source leases; a valid scope for the same generation may be shared only under the independent-source-lease rules

#### Scenario: Persistent worker is requested
- **WHEN** a plugin attempts to register a SharedWorker, ServiceWorker or background context that could outlive the current Page or generation
- **THEN** the current supported baseline rejects or does not claim support for that capability
- **THEN** the context retains no plugin authority after Page close, replacement or Host restart

#### Scenario: Detached-window blur remains within the valid Page lifecycle

- **WHEN** a valid detached window loses focus while its Page has not closed or become invalid and the application has not exited
- **THEN** that instance's Worker, connections, and ongoing operations MUST retain the original Page lifecycle rather than being cleaned up as a hidden Runtime pool because of blur
- **THEN** its continued background existence cannot cross actual closure, generation invalidation, or application exit boundaries, nor affect input focus in other windows

### Requirement: Child WebView load and bridge readiness MUST have bounded deadlines
Each attempt MUST have a deterministic 10,000 millisecond initial-load deadline and a 5,000 millisecond bridge-ready deadline. The matching current event clears only its own timer. Expiry MUST produce stable `runtime_load_timeout` or `runtime_handshake_timeout`, run terminal cleanup and never retry automatically.

#### Scenario: Child WebView misses load deadline
- **WHEN** current exact document does not finish loading within 10 seconds
- **THEN** Host destroys the attempt and a late load event is inert

#### Scenario: Bridge misses ready deadline
- **WHEN** a loaded WebView does not complete current bridge ready within 5 seconds
- **THEN** Host destroys WebView, bridge and Session state without automatic restart

### Requirement: Host MUST keep one current Plugin Page instance per owning window
The main Launcher window MUST host at most one current plugin instance, and each detached window MUST own exactly one independent instance; multiple instances of the same plugin MAY coexist. A single instance MUST belong to at most one window, and migration cannot create an operable copy. Switching Pages within a window MUST terminate only that window's original attempt; preload pools and hidden background Runtimes without an owning Page MUST remain absent.

#### Scenario: User switches plugin Pages
- **WHEN** navigation within an owning window selects another external Page
- **THEN** termination of that window's old Child WebView MUST finish before the new instance is created, and instances in other windows MUST remain unaffected

#### Scenario: Main reopens the same plugin after detachment

- **WHEN** A already occupies a detached window and the user opens the same plugin/Page again from Launcher
- **THEN** Host MUST create a new instance B in the main window instead of focusing, reusing, moving, or closing A
- **THEN** after B also detaches, it MUST be able to run alongside A, with both windows retaining their own business state and source leases

#### Scenario: Main continues opening other plugins

- **WHEN** one or more detached plugin windows remain open and the user opens another plugin from Launcher
- **THEN** the new main-window instance MUST run alongside all valid detached instances, each occupying only its own window
- **THEN** main-window Home, Search, and Host Pages MUST continue using trusted Host presentation and gain no Runtime authority from detached instances

### Requirement: Plugin CSP MUST be delivered by current scoped resource responses and deterministically validated

The Host MUST attach the current plugin isolation CSP as a response header to every successful current scoped HTML response and preserve matching security headers for GET and HEAD.

#### Scenario: Scoped response delivery and validation preserve isolation

- **WHEN** the Host serves or deterministically validates current scoped HTML responses and their resource graph
- **THEN** The policy MUST use the exact trusted Host ancestor and operate with scope, generation, path, MIME, `nosniff`, `no-store`, and no-Host-CORS guarantees.
- **THEN** It MUST NOT rely on author meta, HTML rewriting, reflected Host origin, shared plugin origin, or removal of negative cases.
- **THEN** Deterministic response, resource-graph, header, CSP parsing, Session, and boundary tests MUST cover supported content categories and Host/Tauri, cross-plugin, stale-generation, popup, top-navigation, and persistent-background denial.

#### Scenario: Current open resource graph is validated

- **WHEN** canonical package and remote resource fixtures traverse current resource-response and policy tests
- **THEN** supported categories remain within the current plugin origin and policy while Host-owned responses preserve scope, generation, MIME, `nosniff`, `no-store`, and safe diagnostics
- **THEN** validation does not claim that a target WebView executed the graph

#### Scenario: Open content attempts to obtain Host or old authority

- **WHEN** malicious fixtures model attempts to access Host/Tauri, another plugin, an old generation, popup, top navigation, or persistent background authority
- **THEN** origin, navigation, Session, Resource, and lifecycle boundaries reject them
- **THEN** diagnostics disclose no target URI, origin token, scope, path, payload, or private error

### Requirement: Delivery MUST deterministically prove CSP and terminal lifecycle

Delivery MUST combine Rust response tests, deterministic TypeScript state/race tests, React accessibility/i18n/theme tests, canonical normal and malicious packages, package-boundary checks, and production configuration drift tests.

#### Scenario: Security lifecycle validation evaluates delivery evidence

- **WHEN** the deterministic CSP and terminal-lifecycle suite runs
- **THEN** Deterministic validation MUST cover content classes, Host/Tauri denial, load/bridge deadlines, the aggregated circuit breaker, one instance per window and multi-window concurrency, detachment continuity, instance-level termination, plugin-level invalidation, cleanup, inert late events, and zero unauthorized handler hits.
- **THEN** It MUST NOT require browser, real WebView, GUI, native harness, or environment evidence.

#### Scenario: Complete deterministic security lifecycle gate passes

- **WHEN** maintained normal, malicious, slow, never-ready, repeated-failure, reload, and replacement matrices run with prerequisite deterministic Gates
- **THEN** CSP, deadline, breaker, instance, cleanup, and boundary assertions pass
- **THEN** public package checks confirm policy, controller, scheduler, breaker, Session, and native response internals remain Host-private

#### Scenario: A security or cleanup invariant cannot be established

- **WHEN** an assertion fails for a required CSP class, deadline, terminal trigger, late-event isolation, window ownership or instance isolation, cleanup call, or zero unauthorized handler hits
- **THEN** the capability remains incomplete and design or implementation is corrected
- **THEN** validation does not relax CSP, remove negative cases, hide Runtime state, or restore real WebView evidence as an optional path

#### Scenario: Same-plugin multi-window security and lifecycle matrix

- **WHEN** controlled tests establish multiple instances of the same plugin/Page concurrently and interleave detachment, close, failure, retry, disable, generation replacement, and exit
- **THEN** validation MUST assert each source/attempt's actual state, cleanup counts, request cancellation, event targets, shared-scope survival, and final release rather than only checking that functions were called
- **THEN** the matrix MUST cover rollback after forward failure with successful compensation, repeated compensation failure entering `recovery_required`, original-context retention and explicit recovery/close/Quit, main presentation unmount preserving a detached instance, closing A without affecting B, invalidation fanout, aggregate cooldown, and no revival of old sources
- **THEN** tests MUST remain deterministic and launch no real WebView, GUI, native interaction harness, or target-environment performance sampling
