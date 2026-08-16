## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Iframe load and Runtime Session handshake MUST have bounded deadlines
**Reason**: The container and handshake carrier have changed.
**Migration**: Use Child WebView load and bridge-ready deadlines above.

### Requirement: The Host MUST keep at most one active external Plugin Page iframe in the window
**Reason**: The active native container is now a Child WebView.
**Migration**: Enforce the single-Child-WebView requirement above.

### Requirement: Task 4.4 MUST leave SDK transport and later platform capabilities unimplemented
**Reason**: This architecture migration updates all already-shipped Runtime layers together.
**Migration**: Validate the complete new path without adding Host API methods.
