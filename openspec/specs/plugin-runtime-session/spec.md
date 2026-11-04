# Plugin Runtime Session Specification

## Purpose


Define Host-private, process-local Runtime Sessions bound to independent plugin
instances, trusted current resource facts, and actual native Child WebView
sources through single-use bridge readiness. Preserve Session continuity across
window transfer while keeping public SDK transport, Host APIs, and privileged
native authority within their existing capability boundaries.

## Requirements

### Requirement: Host MUST derive every Runtime Session identity from current trusted facts

Host MUST create private Sessions only for valid, enabled, compatible running instances. Trusted Page, Registration, generation, independent instance, attempt and actual native source MUST jointly determine identity; same-plugin/Page instances MUST have independent Sessions. Host-managed transferable window ownership MUST NOT be plugin-selected or replace identity with plugin ID, Page ID or focus.

#### Scenario: Current Child WebView establishes a Session
- **WHEN** current trusted facts and the actual native source converge on one Runtime attempt
- **THEN** Host creates a read-only Session identity without exposing path, digest, scope, label, handle, origin token or native object

#### Scenario: Plugin self-reports another identity
- **WHEN** a bridge frame contains identity, source, Page, generation or authority fields
- **THEN** exact validation rejects it and no Session authority changes

#### Scenario: Legacy permission facts are presented
- **WHEN** a legacy Manifest, Registration payload or plugin message contains permission requests or grant fields
- **THEN** the current Contract or Registration boundary rejects or isolates those facts before Session identity is created
- **THEN** enabled, external, official, development or Publisher text creates no native Host authority

#### Scenario: Two instances of the same plugin Page establish independent Sessions

- **WHEN** the main window and a detached window concurrently open the same plugin ID, Page ID, and resource generation
- **THEN** Host MUST retain distinct instances, Runtime attempts, Sessions, native sources, request state, and activation channels for them
- **THEN** matching business identity or request sequence numbers MUST NOT deliver responses, events, cancellation, or close effects to the other instance

#### Scenario: A plugin forges instance or window ownership

- **WHEN** a plugin submits instance, window, Session, attempt, or source-selection fields through public requests, bridge frames, a Manifest, or Page data
- **THEN** the strict boundary MUST reject that input without migrating, authenticating, or closing any instance
- **THEN** public Context, SDK, and Host API MUST NOT expose instance identifiers, window handles, or private leases

### Requirement: Session lifecycle MUST distinguish loaded, Session ready, SDK ready, disconnect, and disposal
Native finished-load MUST establish only `loaded`. A single-use current bridge-ready handshake MUST establish Session ready only after actual source, attempt, generation, private carrier version and freshness match. Successful validated `runtime.get_context` MUST establish SDK ready. Disconnect or disposal MUST terminate the Session and MUST NOT be reversed by a late native callback.

#### Scenario: Normal lifecycle reaches SDK ready
- **WHEN** the current Child WebView loads, completes bridge ready and obtains a valid Runtime Context
- **THEN** each state transition occurs once in order and only SDK ready enables public Host API operations

#### Scenario: Loaded WebView sends a stale ready
- **WHEN** ready belongs to an old attempt, wrong source or consumed freshness value
- **THEN** Session fails closed and cannot reach ready

### Requirement: Relevant current-fact changes MUST revoke only the affected Session

Host MUST validate/revoke by instance: close, retry, failure and instance navigation affect only it; disable, uninstall, incompatibility, quarantine and generation replacement revoke all affected plugin instances. Unrelated Registration revisions, other-window navigation and successful same-instance detachment MUST preserve valid Sessions. Unprovable validity MUST fail closed only for affected instances.

#### Scenario: Same-version plugin is replaced

- **WHEN** a plugin is replaced with the same plugin ID and version but an affected instance's resource generation, entry facts, or Runtime attempt has changed
- **THEN** Host MUST immediately revoke the affected old Session's native bridge binding and source lease; a new Runtime MUST NOT inherit old source leases, consumed bridge freshness, or Session identity
- **THEN** identical version text MUST NOT keep an old Session or its native source valid

#### Scenario: Plugin becomes ineligible

- **WHEN** a plugin is disabled, incompatible, quarantined, or removed, or an instance's Page, resource generation, or Runtime attempt has changed
- **THEN** Host MUST revoke all affected Sessions and reject late messages from their old WebView sources at native bridge ingress
- **THEN** old permission or grant fields MUST NOT override current Host facts

#### Scenario: Unrelated plugin changes Registration

- **WHEN** another plugin's installation, disable, replacement, or reload advances the global Registration revision while facts relevant to this instance's Session remain unchanged
- **THEN** Host MUST preserve this instance's native Child WebView, source and navigation leases, bridge binding, and Session without creating new bridge freshness or repeating the readiness handshake
- **THEN** global revision MUST NOT serve as this instance's generation or Session identity

#### Scenario: Reading current facts races

- **WHEN** summary, detail, Page, and Resource descriptor revisions or related
  identities do not converge while creating or refreshing a Session
- **THEN** the Host does not establish or continue that Session and returns a
  bounded Host-private failure
- **THEN** the system does not fall back to cached detail, an old descriptor,
  author identity, or a relaxed origin

#### Scenario: Reconcile the current Session after Registration invalidation
- **WHEN** Host receives Registration invalidation while plugin Sessions exist
- **THEN** Host MUST refresh and compare trusted facts per instance; a missing, disabled, quarantined, or incompatible entry, identity or Page mismatch, resource origin/generation change, or attempt, retry, or replacement change MUST revoke the native bridge bindings and source leases of all affected Sessions
- **THEN** global Registration revision serves only as a race-detection and invalidation hint; when an unrelated plugin changes and this instance's entry, Page, version, origin, generation, attempt, and actual native source remain equal, the original Child WebView, bridge binding, and Session MUST be preserved
- **THEN** valid detachment updates only Host-managed window ownership and MUST NOT be treated as the identity invalidation described above; when relevant facts cannot be proven still valid, Host MUST fail closed for affected instances

#### Scenario: One window of a plugin closes or retries

- **WHEN** instances A and B belong to the same plugin and generation and A closes, fails, or explicitly retries
- **THEN** only A's old Session, requests, and activation channel MUST terminate; B's input, Session, resource lease, and ongoing operations MUST remain valid
- **THEN** A's retry MUST establish a new attempt, and A's old responses or close effects MUST NOT affect B or A's new attempt

#### Scenario: Plugin invalidation affects multiple detached windows

- **WHEN** the same plugin has instances in the main window and multiple detached windows, and disable, uninstall, incompatibility, quarantine, or a new generation has committed
- **THEN** Host MUST immediately invalidate and individually clean up all affected old Sessions of that plugin, rather than revoking only the currently focused window
- **THEN** unrelated plugin Sessions MUST be preserved; failed or cancelled changes MUST NOT revoke old instances before commit

### Requirement: Runtime Session MUST remain Host-private and process-local

Runtime Session implementation and state MUST remain Host-private and process-local, never persisted or exported to plugin packages. Application recovery MUST start inactive without restoring an old Session; detachment of an existing instance is not process recovery.

#### Scenario: Application restarts after a ready Session
- **WHEN** the application exits, crashes or restarts with a ready Session
- **THEN** the new process MUST restore only persistent Manifest/Registration facts and use the existing Registration Contract's `inactive` state
- **THEN** it MUST NOT deserialize or reuse old Session identity, bridge freshness, source leases, windows, Pages or message state

#### Scenario: Plugin attempts to import Session internals
- **WHEN** an official, example or external plugin imports private Session types, wire constants, window adapters or source leases through workspace or package exports
- **THEN** workspace/package boundaries MUST reject the dependency, and real public tarballs MUST contain no such entry
- **THEN** public SDK transport MUST expose no freshness, private identity, origin, Window, MessagePort or private envelope

#### Scenario: Recover process state without exporting Session internals
- **WHEN** Session contracts or state are used, stored or exposed during execution or recovery
- **THEN** Session contracts, parsers, native bridges, source bindings and state MUST stay within trusted Host frontend/Rust boundaries, never entering Manifest, Registration payloads or public APIs of `@lensx/plugin-contract`, `@lensx/plugin-sdk`, `@lensx/plugin-ui`, `@lensx/plugin-testkit` or plugin workspaces
- **THEN** Sessions, freshness, source leases, window references and call state MUST NOT persist; recovered Manager/Registration state MUST start `inactive` without inferring or restoring a previous process's Session

### Requirement: Invalid Session input and diagnostics MUST fail closed without becoming an oracle

Session ingress MUST validate exact bounded versioned payloads, reject wrong actual sources, terminate bindings submitting invalid current Session input and suppress secrets/internal values in feedback and diagnostics. Transport MUST follow the native Child bridge contract without iframe or transferred-MessagePort fallback.

#### Scenario: Cross-plugin forged message
- **WHEN** plugin B or an old WebView imitates A's ready frame or guesses plugin, version or Page text
- **THEN** A's Session/state MUST remain unchanged, and the sender receives no expected freshness, origin or identity feedback
- **THEN** Host MUST execute no Host API, Registration mutation or privileged Tauri command

#### Scenario: Current Port receives unknown version or invalid value
- **WHEN** the current native source submits an unknown carrier version, extra field, oversized value, invalid structure or invalid ready frame
- **THEN** Host MUST return a stable bounded private failure and terminate that Session
- **THEN** underlying exceptions and untrusted content MUST reach neither user feedback nor a later Session

#### Scenario: Validate a window or transferred-Port Session payload
- **WHEN** Session ingress, diagnostics or test evidence are parsed, recorded or presented
- **THEN** Host MUST validate native bridge input from `unknown` for exact version, field types, lengths and allowed values; wrong actual sources cannot change another Session, while invalid or unknown-version current-source input terminates its Session
- **THEN** UI, plugin responses, log fixtures and test evidence MUST NOT expose freshness, message contents, expected origin tokens, complete capability URLs, entry IDs, grants, raw plugin payloads, private exceptions, stacks, Tauri or Rust objects

### Requirement: Host MUST bootstrap one source-authenticated native bridge Session
Before loading the plugin document, Host MUST install the minimal versioned bridge for that Child WebView and create at least 128 bits of unpredictable, single-use attempt freshness. Host MUST accept ready only from the native callback of the actual current WebView and exact freshness value. The bridge MUST NOT fall back to `window.parent`, `postMessage`, `MessageChannel`, a global event bus or a plugin-selected Tauri command.

#### Scenario: Exact current bridge becomes ready
- **WHEN** the actual current WebView returns the exact supported ready frame once
- **THEN** Host consumes freshness, marks the Session ready and retains only the current bridge binding

#### Scenario: Ready is replayed or forged
- **WHEN** any source repeats freshness or submits malformed, old or mismatched ready data
- **THEN** no Session is created, replaced or revived and rejection remains non-oracular

### Requirement: Delivery MUST deterministically validate Runtime Session source binding

Runtime Session delivery MUST use deterministic source-binding, parser, lifecycle, fixture, bridge and production-composition checks. Model results MUST NOT be described as observed real-WebView sources or MessagePort transfers.

#### Scenario: Deterministic Session security matrix passes
- **WHEN** normal and malicious fixtures run Session parsers, state machines, lifecycle controllers and bridge adapters
- **THEN** only the modeled current isolated-origin native source with the current attempt's single-use freshness can establish a ready Session
- **THEN** wrong-source, wrong-origin, cross-plugin, replay and old-bridge attempts MUST fail with bounded diagnostics

#### Scenario: Environment evidence is requested
- **WHEN** completion requires a target WebView, native harness or committed Session environment evidence
- **THEN** validation governance MUST reject the path
- **THEN** the system cannot weaken source binding or retain an environment compatibility Gate

#### Scenario: Run deterministic Session binding and lifecycle acceptance
- **WHEN** deterministic Session source-binding acceptance is planned, executed or reported
- **THEN** Cargo/TypeScript state and parser tests, React lifecycle tests, canonical normal/malicious `.lxp` fixtures, bridge adapters and production composition MUST cover actual-source/origin validation, unpredictable single-use freshness, native bridge binding, ready/disconnect/dispose, cross-plugin forgery, replay, retry/replacement, old-source revocation, current-fact invalidation, unrelated Registration stability and zero privileged Tauri hits
- **THEN** validation MUST NOT claim an observed real-WebView source or Port transfer

### Requirement: Detaching the original instance MUST preserve Session continuity

Successful detachment MUST transfer the original instance instead of establishing a replacement. Host MUST preserve that instance's Runtime attempt, document, Session, bridge handshake state, SDK state, request sequence, and activation channel while atomically updating trusted window ownership. Detachment and returning the main window to Home MUST NOT be interpreted as navigation away from that instance, closure, or Host coordinator unmount.

#### Scenario: Detach a ready instance with ongoing operations

- **WHEN** a ready instance successfully detaches with input, selection, undo history, a Worker, pending requests, and activation subscriptions
- **THEN** the original document, Session, Worker, business memory, and requests MUST remain continuous, without resource resolution, document reload, SDK initialization, Action replay, or Session recreation
- **THEN** subsequent responses and events MUST be delivered only to that same transferred instance and cannot be cancelled because the main window returns Home

#### Scenario: Detachment migration fails

- **WHEN** window creation, native ownership migration, or pre-commit validation fails and compensation can be confirmed to restore the original instance
- **THEN** Host MUST preserve or restore the original main-window ownership and Session without creating a replacement Session or retaining a second operable copy
- **THEN** late migration results MUST NOT rewrite the identity of a restored or terminated instance

#### Scenario: Termination or generation invalidation arrives during detachment

- **WHEN** detachment races with instance closure, plugin generation invalidation, or application exit
- **THEN** the single valid terminal outcome MUST make that instance nonrevivable, and migration callbacks cannot reauthorize its old Session
- **THEN** there MUST be no collateral effects on the Sessions, requests, or window ownership of other still-valid instances

#### Scenario: Compensation failure retains the original Session without relaxing source validation
- **WHEN** the original instance enters `recovery_required` because compensation itself cannot be confirmed
- **THEN** Host MUST retain the same document, Session, attempt, request space, activation channel, transaction token, and original snapshot, without creating a replacement Session or automatically destroying the original instance because of recovery state
- **THEN** still-valid calls and data results MUST continue passing actual native-source, Session, generation, and independent source-lease checks; a recovery snapshot, the same plugin/Page, or a guessed window location MUST NOT grant new authority or bypass invalidation
- **THEN** ownership-sensitive navigation MUST freeze, and explicit recovery retries only the original compensation; explicit close, actual source/plugin invalidation, or exit still revokes affected Sessions and cleans up, and late recovery must not reauthorize them
