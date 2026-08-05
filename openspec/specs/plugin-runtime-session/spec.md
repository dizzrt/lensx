# Plugin Runtime Session Specification

## Purpose

Define the Host-private, process-local Runtime Session that binds one current
external Plugin Page iframe to trusted identity and authorization facts through
an exact-origin, single-use MessagePort handshake, while leaving public SDK
transport, Host APIs, permission decisions, and complete Runtime lifecycle to
later capabilities.

## Requirements

### Requirement: Host MUST derive every Runtime Session identity from current trusted facts

The system MUST establish a Host-private Runtime Session only for the current,
available, enabled, and compatible external Plugin Page iframe. Session identity
MUST derive from the current Page resolution, Registration summary and detail,
Resource and Runtime descriptor, and actual iframe browsing context. It MUST
bind at least the opaque entry, plugin ID, version, Page ID, current resource
generation and origin, Runtime attempt, actual granted-permission ID snapshot,
and real `contentWindow`. A Session MUST NOT accept identity, source, version,
Page, entry, generation, grant, or Host lifecycle facts self-reported by a
Manifest, plugin message, or public UI payload.

#### Scenario: Current iframe establishes a trusted identity

- **WHEN** the current Page, Registration detail, Resource descriptor, Runtime
  attempt, and iframe browsing context converge on the same enabled compatible
  plugin
- **THEN** the Host creates a read-only Session identity and binds the real
  window and origin to the current entry, plugin, version, Page, generation,
  attempt, and grants
- **THEN** the identity contains no installation path, package digest, resource
  scope token, Tauri object, Host executor, or author-controlled trust fact

#### Scenario: Plugin self-reports another identity

- **WHEN** an iframe bootstrap acknowledgement or later message contains a
  `plugin_id`, entry, version, Page, grant, or another self-reported identity
  field
- **THEN** the Host does not use those fields to establish or replace Session
  identity and rejects fields outside the exact private contract
- **THEN** copying another plugin's textual identity cannot obtain that
  plugin's Session, resources, or permissions

#### Scenario: Manifest only requests permissions

- **WHEN** a Manifest declares requested permissions while the Registration
  detail grant snapshot is empty or contains only a subset
- **THEN** the Session binds only the sorted and deduplicated actual
  `granted_permission_ids`
- **THEN** requested, enabled, external, or publisher text creates no grant

### Requirement: Host MUST bootstrap one authenticated MessagePort with exact target and single-use nonce

After the iframe reports load completion, the Host MUST use cryptographically
secure randomness to create an at-least-128-bit single-use nonce and a new
`MessageChannel` for that Runtime attempt. The Host MUST send a versioned
bootstrap and transfer the child Port only to the recorded `contentWindow`,
using the exact `targetOrigin` derived from the current isolated `entry_url`.
The Session MUST enter `ready` only after the Host Port receives the first exact
ready acknowledgement for a supported version carrying the same nonce.
Authenticated Session communication MUST use the dedicated Port and MUST NOT
fall back to a long-lived shared window message bus.

#### Scenario: Normal bootstrap succeeds

- **WHEN** the current iframe loads at the exact isolated origin, receives this
  bootstrap and transferred Port, and returns a valid single-use nonce
  acknowledgement on that Port
- **THEN** the Host changes the Session to `ready`, clears the reusable nonce
  representation, and retains the only authenticated Host Port lease
- **THEN** the bootstrap and acknowledgement expose no trusted identity, entry
  ID, grants, Registration revision, resource token, or Host object

#### Scenario: Wrong window or origin attempts to establish a Session

- **WHEN** another window, Host frame, plugin, old generation, or mismatched
  origin sends a window message with the same shape or attempts to receive the
  bootstrap
- **THEN** the Host transfers no current Port and creates, replaces, or promotes
  no Session
- **THEN** rejection echoes no expected window, origin, nonce, identity, or
  private error

#### Scenario: Nonce is replayed or acknowledgement is malformed

- **WHEN** an acknowledgement omits fields, adds fields, uses an unsupported
  version, has a wrong, expired, or repeated nonce, or does not arrive from the
  transferred Port for this attempt
- **THEN** the Session fails closed, the Host closes its controllable Ports, and
  the Session does not enter `ready`
- **THEN** a late acknowledgement cannot revive a disconnected or disposed
  Session

### Requirement: Session lifecycle MUST distinguish loaded, Session ready, SDK ready, disconnect, and disposal

Iframe `loaded` MUST continue to mean only browser load completion and MUST NOT
mean that the Session or SDK is ready. A Host-private Session MUST use at least
`awaiting_handshake`, `ready`, `disconnected`, and `disposed`: only the first
valid acknowledgement can transition `awaiting_handshake` to `ready`; an
invalid acknowledgement, `messageerror`, Host reload, handshake deadline,
unexpected Port failure, or loss of trusted identity MUST terminate the current
Session; and disposal MUST be idempotent and clean up the Session's nonce,
Ports, message handlers, subscribers, deadline and window/Port leases.
`disconnected` and `disposed` MUST be terminal, and the system MUST NOT
automatically reauthenticate or reuse an old Port. A 5,000 millisecond
handshake deadline MUST start only after the bootstrap is successfully posted,
and a matching first acknowledgement or terminal cleanup MUST clear only that
Session's deadline. The Session MUST participate in the owning Runtime
attempt's unified terminal cleanup, and every late acknowledgement, timer or
Port event MUST compare the owning attempt before publishing state.

#### Scenario: Iframe loaded without a valid acknowledgement

- **WHEN** the iframe has fired its load event but has not passed this attempt's
  nonce and Port acknowledgement
- **THEN** the existing container still reports only `loaded`, and the Session
  remains `awaiting_handshake` until acknowledgement, failure or its 5 second
  deadline
- **THEN** UI, logs, state, and documentation do not call it Session ready, SDK
  ready, or Host API available

#### Scenario: Session authentication completes before deadline

- **WHEN** an awaiting Session receives its only valid acknowledgement before
  the 5,000 millisecond deadline
- **THEN** the Session clears its deadline and enters `ready` without creating
  an SDK Runtime context, RPC method, or Host API capability
- **THEN** that cleared timer cannot later disconnect or fail the Session

#### Scenario: Session handshake expires

- **WHEN** the current Session does not receive its exact acknowledgement within
  5,000 milliseconds after bootstrap
- **THEN** it reports bounded `runtime_handshake_timeout`, closes both
  controllable Ports, clears nonce/listeners/deadline, and requests the owning
  Runtime's terminal cleanup
- **THEN** a late or replayed acknowledgement cannot enter `ready`, publish a
  lease, or affect a later Runtime attempt

#### Scenario: Host reload or Port error

- **WHEN** the Host JavaScript realm reloads, the Port emits `messageerror`, an
  unexpected ready Port disconnects, or the current Session can no longer prove
  its identity
- **THEN** the old Session reaches terminal disconnect or disposal and the
  owning Runtime terminates without automatically reconnecting
- **THEN** a new realm cannot restore the old nonce, Port, deadline or listener,
  and a new document must establish a new Session from current facts

#### Scenario: Repeated cleanup or late event

- **WHEN** close, retry, invalidation, timeout, Host teardown and App teardown
  race to dispose, then an old acknowledgement, timer or Port event arrives
- **THEN** resources are safely cleaned up once and the Session remains
  terminal
- **THEN** the late event changes no current iframe, Session, Runtime attempt or
  Registration state

### Requirement: Relevant current-fact changes MUST revoke only the affected Session

The Host MUST refresh and compare facts for the current plugin after
Registration invalidation. A missing entry, disabled, quarantined, or
incompatible state, identity or Page mismatch, resource origin or generation
change, Runtime attempt, retry, or replacement change, or grant snapshot change
MUST revoke the affected Session. A global Registration revision is only a race
detector and invalidation hint. If a change belongs only to another plugin and
the current Session's entry, Page, version, origin, generation, attempt, and
grants remain the same, the Host MUST retain the current iframe and Session. If
the Host cannot prove that the relevant facts remain current, it MUST fail
closed.

#### Scenario: Same-version plugin is replaced

- **WHEN** the current plugin is replaced with the same plugin ID and version
  but its resource generation, entry facts, or Runtime attempt changes
- **THEN** the old Session and Port become invalid immediately, and the new
  Runtime inherits no old nonce, Port, or Session identity
- **THEN** matching version text cannot keep the old Session current

#### Scenario: Plugin is disabled or grants change

- **WHEN** the current plugin becomes disabled, incompatible, quarantined, or
  removed, or its actual grant snapshot changes
- **THEN** the Host revokes the current Session and rejects later messages from
  the old Port
- **THEN** requested permissions or an old grant snapshot cannot override
  current Host facts

#### Scenario: Unrelated plugin changes Registration

- **WHEN** another plugin is installed, disabled, replaced, or has its grants
  changed, increasing the global Registration revision while every fact
  relevant to the current Session remains unchanged
- **THEN** the Host retains the current iframe, navigation lease, and Session
  without creating a new nonce or Port
- **THEN** the global revision value is not treated as the current plugin's
  generation or Session identity

#### Scenario: Reading current facts races

- **WHEN** summary, detail, Page, and Resource descriptor revisions or related
  identities do not converge while creating or refreshing a Session
- **THEN** the Host does not establish or continue that Session and returns a
  bounded Host-private failure
- **THEN** the system does not fall back to cached detail, an old descriptor,
  author identity, or a relaxed origin

### Requirement: Runtime Session MUST remain Host-private and process-local

The Runtime Session contract, parser, window and Port adapters, identity, and
state MUST remain inside the trusted lensX Host frontend. They MUST NOT become
Manifest input, Plugin Registration payload, or public API from
`@lensx/plugin-contract`, `@lensx/plugin-sdk`, `@lensx/plugin-ui`,
`@lensx/plugin-testkit`, or a plugin workspace. A Session, nonce, Port, window
reference, and call state MUST NOT be persisted. After application recovery,
the Plugin Manager and Registration Contract MUST continue to begin at
`inactive` and MUST NOT infer or restore a Session from the prior process.

#### Scenario: Application restarts after a ready Session

- **WHEN** the application exits, crashes, or restarts while a ready Session
  exists
- **THEN** the next process restores only persistent Manifest, registration,
  and grant facts and reports the existing Registration Contract's `inactive`
  state
- **THEN** it does not deserialize or reuse the old Session identity, nonce,
  Port, window, Page, or message state

#### Scenario: Plugin attempts to import Session internals

- **WHEN** an official, example, or external plugin tries to import private
  Session types, wire constants, window adapters, or a Host Port lease through
  workspace or package exports
- **THEN** the workspace and package boundary gate rejects the dependency, and
  real public tarballs contain no such entry
- **THEN** the public SDK transport interface still exposes no nonce, identity,
  origin, Window, MessagePort, or private envelope

### Requirement: Invalid Session input and diagnostics MUST fail closed without becoming an oracle

Every cross-iframe Session payload MUST be validated from `unknown` against an
exact versioned shape, field types, length limits, and allowed values. An
unrelated window message from the wrong source MUST be ignored; malformed or
unknown-version input on the current transferred Port MUST disconnect that
Session. User UI, plugin responses, log fixtures, and test evidence MUST NOT
expose a nonce, Port content, expected origin token, complete capability URL,
entry ID, grants, raw plugin payload, private exception, stack, Tauri object, or
Rust object.

#### Scenario: Cross-plugin forged message

- **WHEN** plugin B or an old iframe sends an acknowledgement shaped like
  plugin A's, or guesses plugin, version, or Page text
- **THEN** plugin A's Session and state do not change, and the sender receives
  no expected nonce, origin, or identity feedback
- **THEN** the Host executes no Host API, Registration mutation, or privileged
  Tauri command

#### Scenario: Current Port receives unknown version or invalid value

- **WHEN** the current transferred Port receives an unknown contract version,
  extra field, oversized string, non-plain structured-clone data, or another
  invalid acknowledgement
- **THEN** the Host produces a stable, bounded private failure and closes the
  Session
- **THEN** underlying exceptions and untrusted content reach neither
  user-visible feedback nor a later Session

### Requirement: Delivery MUST prove source binding on focused and real WebView paths

Delivery MUST use pure TypeScript state and parser tests, React iframe
lifecycle tests, canonical normal and malicious `.lxp` fixtures, and the target
macOS WKWebView to verify exact source and origin, a cryptographic single-use
nonce, MessagePort transfer, ready, disconnect, disposal, cross-plugin forgery,
replay, retry and replacement, old-Port invalidation, grant and current-fact
invalidation, unrelated Registration change stability, and zero privileged
Tauri hits. Simulated DOM, source inspection, and Rust unit tests MUST NOT
replace real WebView evidence. This capability MUST NOT claim Windows or Linux
support.

#### Scenario: macOS Session security matrix passes

- **WHEN** the focused gate runs normal and malicious plugin fixtures in the
  target macOS WKWebView
- **THEN** only the current isolated-origin iframe establishes a ready Session
  using this attempt's nonce and Port, and wrong-source, wrong-origin,
  cross-plugin, replay, and old-Port attempts fail consistently
- **THEN** evidence records only bounded boolean, version, and platform facts,
  without URL, token, nonce, Port content, path, plugin payload, or private
  error

#### Scenario: Target WebView cannot prove the design

- **WHEN** the target WebView cannot reliably prove the exact window and
  origin, MessagePort transfer, nonce acknowledgement, or old-Port invalidation
  after teardown
- **THEN** the change cannot declare completion or check Task 4.3
- **THEN** the system does not degrade to a wildcard origin, long-lived shared
  window message bus, bearer identity alone, or removal of a negative case

### Requirement: Task 4.3 MUST leave SDK transport, Host API, permission decisions, and complete lifecycle unimplemented

This capability MUST deliver only Host-private Session identity and
currentness, single-use bootstrap and ready acknowledgement, an authenticated
Port lease, Session-owned disconnect and disposal, security tests, real WebView
evidence, and maintained documentation. It MUST NOT define public SDK iframe
transport, JSON-RPC or request IDs, Host API method, result, event, or error
Schemas, permission grant decisions or UI, privileged dispatch, plugin storage,
complete CSP, general handshake timeout, crash loop or automatic recovery,
background Runtime, sidecar, management UI, or Windows or Linux Runtime.

#### Scenario: Task 4.3 completes independently

- **WHEN** the focused gate, documentation, and complete validation for this
  change pass while Task 4.4 and Milestone 5 remain undelivered
- **THEN** the current external Plugin Page iframe can establish a trusted
  Host-private Session, and the Host consistently rejects forged or stale
  sources
- **THEN** the plugin still cannot call a real Host API through the public SDK,
  obtain a new permission decision, run background work, or claim complete CSP
  or lifecycle delivery

#### Scenario: Locale or theme changes during the Session lifecycle

- **WHEN** the current application locale or light or dark theme changes while
  the Session is awaiting, ready, or disconnected
- **THEN** the existing Host Page and iframe presentation retains its current
  localization and theme behavior, and the Session injects or duplicates no
  new user-visible copy or styles
- **THEN** the locale or theme change itself grants no capability, changes no
  trusted identity, and does not rename iframe `loaded` as ready
