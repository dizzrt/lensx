## MODIFIED Requirements

### Requirement: Child WebView lifecycle MUST preserve only semantic-equivalent activation

Launcher hide and restore, same-Page shortcut activation, and Registration revisions affecting only other plugins MUST reuse the same Child WebView and Session while the current identity, entry, route, origin, resource generation, and attempt remain unchanged. Same-attempt restore MUST NOT resolve, create, navigate, read document resources, bootstrap the SDK, recreate a model or Worker, or show a fresh plugin-page loading cycle. Close, Page replacement, disable, uninstall, replacement, upgrade, development reload, explicit retry, Session disconnect, bridge fatal failure, breaker, Host reload, App unmount, and process exit MUST make the old attempt terminal and destroy the Child WebView, without retaining a hidden Runtime, pool, or background execution. Deterministic controller, state, call-count, and cleanup tests MUST cover these invariants without target macOS latency sampling.

#### Scenario: Launcher hides and restores current plugin

- **WHEN** the Launcher is temporarily hidden and restored while current plugin facts remain semantically equivalent
- **THEN** the Host reuses and focuses the same modeled Child WebView attempt and preserves its Page, Worker, and Session identity
- **THEN** restore performs no resolve, create, navigation, resource read, SDK bootstrap, model creation, or Worker creation

#### Scenario: Current plugin is replaced

- **WHEN** replacement commits a new resource generation
- **THEN** the Host first revokes the old bridge, Session, resource authority and cache eligibility and destroys the old Child WebView, then creates a new attempt
- **THEN** the old WebView, Worker, cached lookup, network callback, and late native event cannot affect the new generation

## REMOVED Requirements

### Requirement: Child WebView delivery MUST prove security, interaction and performance on target macOS

**Reason**: This requirement is entirely about real target-macOS WKWebView behavior, secure interaction, cold-open, recovery and heartbeat p95 measurements, and an evidence producer. That environment validation capability is an explicitly accepted loss.

**Migration**: Retain Child WebView source binding, bounds, focus, lifecycle, Session, Resource, RPC, SDK, and termination semantics. Move Rust, TypeScript, React, package, and malicious-fixture checks into deterministic lifecycles and Gates, and remove performance thresholds, sampling, producers, records, and the target macOS Gate.

## ADDED Requirements

### Requirement: Child WebView delivery MUST pass deterministic security and lifecycle validation

Delivery MUST combine Rust unit and integration tests, TypeScript controller and state tests, React accessibility/localization/theme tests, canonical normal and malicious packages, public-package boundary checks, builds, and deterministic package inspection. Validation MUST cover create intent, navigation policy, bridge/SDK readiness state, bounds, focus intent, hide/restore reuse, close, replacement, disable, uninstall, failure, destroy, stale-event inertness, and zero generic Tauri authority hits. It MUST NOT report real interaction, real teardown, or performance evidence.

#### Scenario: Deterministic Child WebView matrix passes

- **WHEN** the maintained Rust, TypeScript, React, package, and malicious-fixture checks run
- **THEN** supported lifecycle transitions, current-source authority, cleanup calls, and public/private boundaries pass
- **THEN** official, external, and development plugins share the same specified Runtime path without a target-environment proof claim

#### Scenario: Environment-only validation remains

- **WHEN** a maintained Gate or script launches a real Child WebView, measures target latency, drives native interaction, or reads/writes environment evidence
- **THEN** validation governance fails
- **THEN** the entry and its assets are deleted rather than retained as optional validation
