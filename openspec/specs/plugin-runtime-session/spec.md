# Plugin Runtime Session Specification

## Purpose

Define the Host-private, process-local Runtime Session that binds one current
external Plugin Page iframe to trusted identity and current resource facts
through an exact-origin, single-use MessagePort handshake, while keeping public
SDK transport, Host APIs, native authority, and complete Runtime lifecycle in
their own capability boundaries.
## Requirements
### Requirement: Host MUST derive every Runtime Session identity from current trusted facts
The Host MUST establish a private Session only for the actual current, enabled and compatible Child WebView. Identity MUST derive from current Page, Registration, resource descriptor, plugin/version/Page/entry, isolated origin, generation, Runtime attempt and native WebView label/handle. No Manifest field, bridge payload, public UI value or plugin-provided identity MUST select or replace those facts.

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

### Requirement: Session lifecycle MUST distinguish loaded, Session ready, SDK ready, disconnect, and disposal
Native finished-load MUST establish only `loaded`. A single-use current bridge-ready handshake MUST establish Session ready only after actual source, attempt, generation, private carrier version and freshness match. Successful validated `runtime.get_context` MUST establish SDK ready. Disconnect or disposal MUST terminate the Session and MUST NOT be reversed by a late native callback.

#### Scenario: Normal lifecycle reaches SDK ready
- **WHEN** the current Child WebView loads, completes bridge ready and obtains a valid Runtime Context
- **THEN** each state transition occurs once in order and only SDK ready enables public Host API operations

#### Scenario: Loaded WebView sends a stale ready
- **WHEN** ready belongs to an old attempt, wrong source or consumed freshness value
- **THEN** Session fails closed and cannot reach ready

### Requirement: Relevant current-fact changes MUST revoke only the affected Session

The Host MUST refresh and compare facts for the current plugin after
Registration invalidation. A missing entry, disabled, quarantined, or
incompatible state, identity or Page mismatch, resource origin or generation
change, Runtime attempt, retry, or replacement change MUST revoke the affected
Session. A global Registration revision is only a race
detector and invalidation hint. If a change belongs only to another plugin and
the current Session's entry, Page, version, origin, generation, and attempt
remain the same, the Host MUST retain the current iframe and Session. If
the Host cannot prove that the relevant facts remain current, it MUST fail
closed.

#### Scenario: Same-version plugin is replaced

- **WHEN** the current plugin is replaced with the same plugin ID and version
  but its resource generation, entry facts, or Runtime attempt changes
- **THEN** the old Session and Port become invalid immediately, and the new
  Runtime inherits no old nonce, Port, or Session identity
- **THEN** matching version text cannot keep the old Session current

#### Scenario: Plugin becomes ineligible

- **WHEN** the current plugin becomes disabled, incompatible, quarantined, or
  removed, or its Page, resource generation, or Runtime attempt changes
- **THEN** the Host revokes the current Session and rejects later messages from
  the old Port
- **THEN** legacy permission or grant fields cannot override current Host facts

#### Scenario: Unrelated plugin changes Registration

- **WHEN** another plugin is installed, disabled, replaced, or reloaded,
  increasing the global Registration revision while every fact
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
- **THEN** the next process restores only persistent Manifest and Registration
  facts and reports the existing Registration Contract's `inactive`
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
replay, retry and replacement, old-Port invalidation, current-fact invalidation,
unrelated Registration change stability, and zero privileged
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

### Requirement: Host MUST bootstrap one source-authenticated native bridge Session
Before loading the plugin document, Host MUST install the minimal versioned bridge for that Child WebView and create at least 128 bits of unpredictable, single-use attempt freshness. Host MUST accept ready only from the native callback of the actual current WebView and exact freshness value. The bridge MUST NOT fall back to `window.parent`, `postMessage`, `MessageChannel`, a global event bus or a plugin-selected Tauri command.

#### Scenario: Exact current bridge becomes ready
- **WHEN** the actual current WebView returns the exact supported ready frame once
- **THEN** Host consumes freshness, marks the Session ready and retains only the current bridge binding

#### Scenario: Ready is replayed or forged
- **WHEN** any source repeats freshness or submits malformed, old or mismatched ready data
- **THEN** no Session is created, replaced or revived and rejection remains non-oracular

