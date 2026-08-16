## MODIFIED Requirements

### Requirement: Child WebView lifecycle MUST preserve only semantic-equivalent activation
Launcher hide and restore, same-Page shortcut activation, and Registration revisions affecting only other plugins MUST reuse the same Child WebView and Session while the current identity, entry, route, origin, resource generation, and attempt remain unchanged. Same-attempt restore MUST NOT resolve, create, navigate, read document resources, bootstrap the SDK, recreate a model or Worker, or show a fresh plugin-page loading cycle, and target macOS p95 activation-to-visible-and-focused latency MUST be at most 100 milliseconds over at least forty samples. Close, Page replacement, disable, uninstall, replacement, upgrade, development reload, explicit retry, Session disconnect, bridge fatal failure, breaker, Host reload, App unmount, and process exit MUST make the old attempt terminal and destroy the Child WebView, without retaining a hidden Runtime, pool, or background execution.

#### Scenario: Launcher hides and restores current plugin
- **WHEN** the Launcher is temporarily hidden and restored while the current plugin facts remain semantically equivalent
- **THEN** the Host shows and focuses the same Child WebView and preserves its Page memory, Worker, and Session
- **THEN** restore performs no resolve, create, navigation, resource read, SDK bootstrap, model creation, or Worker creation and its target macOS p95 latency is at most 100 milliseconds

#### Scenario: Current plugin is replaced
- **WHEN** replacement commits a new resource generation
- **THEN** the Host first revokes the old bridge, Session, resource authority and cache eligibility and destroys the old Child WebView, then creates a new attempt
- **THEN** the old WebView, Worker, cached lookup, network callback, and late native event cannot affect the new generation

### Requirement: Child WebView delivery MUST prove security, interaction and performance on target macOS
Delivery MUST combine Rust unit and integration tests, TypeScript controller tests, React accessibility, internationalization and theme tests, canonical normal and malicious packages, and real target macOS WKWebView evidence covering create, navigation, load, bridge ready, SDK ready, bounds, focus, hide and restore, close, replacement, disable, uninstall, crash or failure, destroy and first interactive. The performance producer MUST execute the current production Child WebView presentation, Resource Service, bridge, RPC and SDK path with the canonical ConfigLens candidate rather than merely validate a committed summary or a synthetic DOM/controller fixture.

Evidence MUST contain at least twenty fresh release-like opens, twenty fresh Plugin Development Mode snapshot opens and forty same-attempt restores. It MUST separately summarize resolve, create, navigation, load, bridge, SDK, UI bundle, editor, editor Worker, Host loading, first-interactive and restore durations with p50, nearest-rank p95 and max. Release-like Host loading-to-bridge-ready p95 MUST be at most 250 milliseconds, release-like first-interactive p95 MUST be at most 500 milliseconds, Plugin Development Mode first-interactive p95 MUST be at most 1000 milliseconds, same-attempt restore p95 MUST be at most 100 milliseconds, and Host heartbeat p95 gap MUST remain at most 50 milliseconds. Each fresh sample MUST begin without a current Child WebView and end with proven terminal cleanup.

Evidence MUST NOT record user content, a complete URL, origin token, path, label, nonce, payload, raw error, stack, data-store identifier, Host-private token or per-sample identity. It MUST NOT describe a Child WebView as guaranteeing an independent operating-system process. A check that only validates a historical JSON file, source composition, mock timings or positive booleans MUST NOT substitute for rerunning the target macOS performance producer.

#### Scenario: Focused Child WebView gate passes
- **WHEN** the complete normal, malicious, lifecycle, release-like performance, development performance and workspace-boundary matrix runs from current source and candidate bytes
- **THEN** ordinary Web behavior succeeds, Host, cross-plugin and native escapes fail, all latency and heartbeat budgets pass, and every terminal generation becomes completely invalid
- **THEN** official, external and development plugins receive the same Runtime security conclusion from the same product path

#### Scenario: Current product cold open exceeds a budget
- **WHEN** Host loading, release-like first-interactive, development first-interactive, restore or heartbeat p95 exceeds its maintained budget
- **THEN** evidence identifies the responsible bounded stage without exposing content or Host-private identity
- **THEN** the change remains incomplete until the stage is fixed or proposal, design and requirements explicitly revise the accepted budget

#### Scenario: Evidence cannot be replayed
- **WHEN** the target macOS command only reads committed timing summaries or bypasses the current production Child WebView, Resource Service, bridge, SDK or ConfigLens candidate
- **THEN** performance evidence is incomplete even if its schema, unit tests and committed values pass

#### Scenario: Isolation or teardown cannot be proven
- **WHEN** actual WebView source binding, navigation, generic Tauri denial, bounds, focus, bridge cleanup, cache revocation or old-context inertness cannot be proven
- **THEN** the change remains incomplete and its design or specification is revised
- **THEN** process assumptions, source-only tests, a hidden WebView, relaxed Host authority or a stale performance fixture cannot substitute for evidence
