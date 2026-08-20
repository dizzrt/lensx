## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Plugin CSP MUST be delivered by the current scoped resource response and proven on the target WebView

**Reason**: The requirement name and scenarios make target-WebView positive and negative evidence a CSP completion condition. Real browser and WebView proof is explicitly retired.

**Migration**: Retain current scoped-response, GET and HEAD, ancestor, scope, generation, path, MIME, `nosniff`, `no-store`, no-Host-CORS, and open and negative capability product semantics. Verify them through Rust response, fixture, header, resource, Session, and boundary tests.

### Requirement: Delivery MUST prove CSP and terminal lifecycle on focused and real WebView paths

**Reason**: This requirement specifically demands real WebView CSP and teardown evidence and forbids deterministic substitutes, which is incompatible with the new validation scope.

**Migration**: Retain Rust response, TypeScript race and state, React accessibility, localization and theme, normal and malicious package, deadline, breaker, single-instance, cleanup, late-event, and zero-handler-hit checks. Remove the WebView harness, evidence, Gate, and environment-specific completion claims.

## ADDED Requirements

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
