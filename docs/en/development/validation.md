# Validation

## Principle

Validation is part of implementation, not a follow-up. Every OpenSpec task list
must end with explicit final validation tasks, and every completed change must
have reproducible evidence for the affected frontend and Rust layers.

Fix warnings and errors introduced by the change. After a fix, rerun the failed
command and then rerun the complete final validation set.

## Frontend Validation

Run unit and component tests:

```bash
pnpm run test
```

Run TypeScript static checking for source and tests:

```bash
pnpm run typecheck
```

Run Biome formatting and lint checks:

```bash
pnpm run check
```

Build the production frontend:

```bash
pnpm run build
```

These four standard commands validate the root application and every actual
workspace member. A member that omits the corresponding lifecycle script or
returns a non-zero status fails the root command. Run workspace-specific
regressions directly when changing the aggregation or dependency rules:

```bash
pnpm run test:workspace-lifecycle
pnpm run test:workspace-boundaries
pnpm run check:workspace-boundaries
```

Use `pnpm run test:watch` only during development. Final evidence must use the
non-watch command.

## Plugin Contract Validation

Changes to `@lensx/plugin-contract`, its Schema, Host consumer, or Rust model
must run:

```bash
pnpm run check:plugin-contract
```

This gate verifies generated-type drift, package tests, Host boundaries,
TypeScript/Rust shared fixtures, the packed file list and exports, and an
isolated external consumer installed from the real tarball. The tarball smoke
test is required because workspace links can hide missing declarations,
Schema files, export targets, or runtime dependencies.

## Plugin Package Format Validation

Changes to `.lxp` constants, codec/archive/hash dependencies, the TypeScript
reference packer/inspector, the Rust inspector, fixtures, or package-format
documentation must run:

```bash
pnpm run check:plugin-package-format
```

The gate checks dependency and constant drift, compares all committed fixture
bytes and expectations without rewriting them, proves reference pack
repeatability, runs focused TypeScript tests, and makes Rust consume the same
valid, invalid, incompatible, and reproducible cases. An intentional fixture
or digest update uses `pnpm run generate:plugin-package-format-fixtures` only
after reviewing the dependency, parameter, format, and diagnostic change.

This dedicated gate supplements rather than replaces `check:plugin-contract`,
workspace boundary/lifecycle checks, and the complete frontend/shared and Rust
validation sets.

## Plugin Resource Service Validation

Changes to the Host-private Resource Contract, desktop adapter, Manager
generation, Installer ownership proof, custom protocol, path/MIME policy, or
resource lifecycle must run:

```bash
pnpm run check:plugin-resource-service
```

The gate consumes exact shared Rust/TypeScript contract fixtures, checks public
package and plugin boundaries, and runs Manager, Installer, protocol, path
attack, MIME/method, 64 MiB, lifecycle, race, error-oracle, and macOS/Windows/
Linux URL-shape regressions. Platform behavior that cannot execute natively on
the current host is kept in pure Rust URL/request fixtures and still requires
the normal desktop target CI/build coverage.

Resource scopes use the direct exact dependency `getrandom = 0.3.4`
(`MIT OR Apache-2.0`, maintained by the Rust Random project). It was already
present in `Cargo.lock` and is required only for at least 128 bits of operating-
system CSPRNG entropy; preparation-token hashes, time, process IDs, and counters
are not acceptable substitutes. No capability-filesystem dependency was added:
the implementation uses standard-library filesystem/platform metadata,
component link/reparse rejection, canonical containment, and opened-file
identity/size revalidation. Re-review exact version, license, maintenance, and
macOS/Windows/Linux semantics before changing either dependency decision.

This focused gate supplements rather than replaces the complete frontend and
Rust validation sets. The change has no visible UI, locale, theme, keyboard,
accessibility, or Semi Design surface, so those areas require regression
validation but no new product copy or component-specific acceptance.

## Isolated Plugin Runtime Origin Validation

Changes to the isolated Resource authority, host/path parser, translated URL
shape, origin evidence, or downstream origin prerequisite must run:

```bash
pnpm run check:isolated-plugin-runtime-origin
```

The gate combines canonical `.lxp` fixture validation, bounded committed real
macOS WKWebView evidence, Resource Contract and Service tests, frame-aware
navigation tests and evidence, workspace-private boundary checks, and the
Plugin Page composition regression. The real evidence must cover a non-opaque
serialized origin, the complete ES Module/resource graph, same-generation
storage roundtrip, Host/other-generation isolation, parent/frame/Tauri absence,
zero privileged hits, and normal/malicious/replacement packages through the
real Resource Service. It must not contain raw URLs, scopes, paths, storage
values, or invoke secrets.

This gate proves only the macOS prerequisite. It does not authorize a
production iframe by itself or establish Windows/Linux Runtime support. Any shared-host,
lost translated key, authority/path mismatch, wildcard/null CORS, or
opaque/classic-only fallback is a validation failure.

## macOS Frame-Aware WebView Navigation Validation

When changing the Host navigation policy, Tauri/Wry patch, main-only
initialization, WebView harness, evidence schema, or Plugin Page/Resource
regressions, run:

```bash
pnpm run check:frame-aware-webview-navigation-policy
```

The gate checks all 15 maintained documents, the bounded evidence schema, the
committed real WKWebView matrix, exact vendored dependency integrity and patch
surface, Rust policy/epoch/normalization/adapter tests, Resource Service
regressions, workspace-private boundaries, and the Plugin Page composition.
Evidence is macOS-only and must confirm the activate/replace/dispose/reactivate
lease preflight plus native `main`/`descendant` facts,
pre-commit outcomes, Host bootstrap availability, descendant bootstrap/invoke
absence, and popup/download hook counts. It must never contain a raw URL,
scope, identity, invoke key or payload, bootstrap source, or local path.

Use `pnpm run generate:frame-aware-webview-navigation-fixtures` only after
reviewing fixture changes. Real evidence must first be rerun on the target
macOS WKWebView, then intentionally promoted with
`pnpm run generate:frame-aware-webview-evidence-matrix`. Vendored dependency
changes require exact diff and license review before
`pnpm run generate:frame-aware-navigation-dependency-drift` updates the
integrity record. These generators do not replace the focused gate or the full
frontend and Rust validation sets.

## Isolated Plugin iframe Runtime Validation

Changes to the Runtime resolver, iframe policy/container, Host navigation
adapter, Plugin Page composition, or lifecycle cleanup must run:

```bash
pnpm run check:plugin-iframe-runtime
```

The gate combines resolver and React state/cancellation tests, exact
sandbox/Permissions Policy/referrer assertions, native lease activation and
compare-current disposal, Page/lifecycle/replacement/resource regressions,
workspace-private imports, canonical real `.lxp` fixtures, bounded macOS
WKWebView evidence, and both origin/navigation prerequisite gates. Evidence must
continue to prove the ES Module graph, route fragment, storage partition,
parent/frame/Tauri absence, zero privileged hits, and malicious navigation and
capability rejection.

This gate proves iframe `loaded`, never Runtime Session or SDK `ready`. It does
not validate a message bridge, Host API, permission dispatcher, complete CSP,
general timeout/crash recovery, or Windows/Linux Runtime. Run it before the
complete frontend and Rust validation sets; it does not replace them.

## Plugin Runtime Session Validation

Changes to the Host-private Session contract/parser/service, nonce or
MessageChannel adapters, Runtime descriptor/currentness, iframe ref/bootstrap,
canonical Session fixtures, evidence schema, or workspace/package boundaries
must run:

```bash
pnpm run check:plugin-runtime-session
```

The gate combines strict parser and state-machine tests, resolver/detail/grant
convergence, relevant versus unrelated invalidation, React iframe lifecycle,
Registration/Page/lifecycle/replacement/resource regressions, canonical real
`.lxp` drift checks, public tarball consumers, and the complete iframe/origin/
navigation prerequisites. Its dedicated macOS
`plugin_runtime_session_harness` uses the production Resource Service,
isolated-origin package path, sandbox, Permissions Policy, and frame-aware
navigation policy in WKWebView.

Committed bounded evidence must prove exact target window and origin,
MessagePort transfer, cryptographic single-use nonce, ready/disconnect/dispose,
retry and same-version replacement old-Port invalidation, stability across an
unrelated Registration change, and zero privileged Tauri handler hits for the
normal, malicious, and replacement fixtures. Evidence must not contain a URL,
origin/resource token, nonce, Port content, entry/plugin/Page identity, local
path, raw payload, or private error.

This is a macOS-only delivery gate and does not establish Windows or Linux
Runtime Session support. By itself it proves only the private authenticated
Session and Port lease; it does not by itself prove the SDK iframe transport,
Host API methods, permission decisions, complete CSP, general handshake
timeouts/crash recovery, or background Runtime. The focused gate supplements
and never replaces the complete frontend and Rust validation sets.

## Plugin SDK Transport Validation

Changes to the typed SDK request/event API, private transport codec, iframe
entry, Host Port adapter, Runtime Session lease handoff, transport fixtures,
package exports, or target WebView evidence must run:

```bash
pnpm run check:plugin-sdk-transport
```

The gate checks deterministic plugin/Host codec drift, strict unknown parsing,
request/result pairing, safe errors, concurrent out-of-order responses,
cancellation, timeout, events, disconnect/disposal, stale Page and Port
isolation, and the production Session-binding boundary. It packs real Contract and SDK
tarballs, retains the no-DOM ES2022 root consumer, builds and runs the declared
iframe entry in an isolated browser consumer, rejects private deep imports,
and runs a real MessageChannel SDK/Host-adapter fixture.

Bounded macOS WKWebView evidence additionally covers exact parent/origin/Port,
single-use nonce, transport result/error/event round-trip, out-of-order
responses, cancellation, replacement/close cleanup, pending termination, and
zero privileged handler hits. Evidence contains no URL, nonce, Port content,
payload, token, identity, path, grant, or private error. The gate proves the
public transport and its Host adapter; the separate Dispatcher and scoped-storage
gates prove the current production providers. The permission-management gate
adds clipboard authorization, provider, and real native-smoke evidence. Neither
gate independently proves the complete RPC v1 policy or Windows/Linux Runtime
transport.

## Plugin RPC Validation

Changes to the Host-private RPC policy/analyzer, Port admission, request
sequence state, concurrency/deadline settlement, result/event containment,
safe diagnostics, post-response effects, malicious fixtures, or resource-limit
evidence must run:

```bash
pnpm run check:plugin-rpc-validation
```

The gate checks the immutable 5 MiB/32-depth/36-frame-depth/16,384-node/
single-request/32-concurrency/10,000-ms policy; below, exact and over-limit
fixtures; UTF-8 and JSON escaping cost; cycles and non-JSON values; strictly
increasing request IDs; controlled-clock deadline/cancel races; safe errors,
events, diagnostics and effects; and zero Handler hits for rejected input. It
uses the real Contract and SDK through MessageChannel, the Dispatcher,
permission and storage regressions, Runtime Session cleanup, public Contract
and SDK tarballs, workspace/private-import boundaries, and bounded target
macOS WKWebView evidence.

The committed WKWebView evidence must prove one over-depth request is rejected
with zero Handler hits and that a later legal request on the same healthy
Session still completes. Evidence stores only bounded boolean facts and must
not contain a payload, URL, origin, identity, grant, request ID, diagnostic or
private error. This macOS evidence does not establish Windows/Linux transport.

The gate proves per-frame bytes/depth/nodes/single-request limits and
per-Session concurrency, replay and Host execution deadline. It does not prove
sustained frequency control, iframe/CPU/memory monitoring, plugin suspension,
isolation escalation, automatic recovery, public policy configuration or
persistent diagnostic history; those controls remain Task 7.5 or later changes.

## Plugin Host API Dispatcher Validation

Changes to the Host-private provider table, Runtime Context source, private
post-response outcome, matching Page close, plugin-local Action dispatch, App
composition, or Dispatcher documentation must run:

```bash
pnpm run check:plugin-host-api-dispatcher
```

The gate runs focused Dispatcher, transport, MessageChannel, React Runtime,
Navigation, Action projection, and workspace-boundary tests. It also packs the
real public Contract and SDK tarballs and verifies that Dispatcher bindings,
Session identity, private wire values, Host services, and post-response effects
remain absent from public exports and declarations. The Context capability
snapshot contains `actions.open`, `runtime.get_context`, `ui.close`, and all
five `storage.*` methods while the current namespace is available. Each
`clipboard.*` method is included independently only for a current matching
grant while the native provider is available.

The existing target macOS WKWebView transport evidence remains required for
the authenticated Port, cancellation, replacement, and terminal cleanup. The
production-style MessageChannel fixture adds Dispatcher Context, Action,
storage, and response-before-close evidence without treating its fake native
boundary as Rust persistence, native clipboard execution, or general RPC delivery. This focused gate
supplements rather than replaces the complete frontend and Rust validation
sets.

## Plugin Permission Management Validation

Changes to the Host-private permission catalog, effective view, Manager grant
mutation, clipboard command/provider, Dispatcher clipboard routing, Runtime
capabilities, shared fixtures, or permission documentation must run:

```bash
pnpm run check:plugin-permission-management
```

The gate verifies exact shared TypeScript/Rust contract fixtures, closed catalog
derivation, requested/reason/grant separation, revision-bound idempotent durable
grant mutation, restart recovery, fail-closed degraded and quarantined states,
residual revoke, event-delivery failure, unrelated-plugin stability, and
grant/native-effect linearization. It also covers independent Dispatcher
capabilities, immutable trusted Session identity, cancellation/currentness,
safe errors, a real SDK/MessageChannel loop, public package boundaries, and the
existing bounded macOS WKWebView transport evidence.

On target macOS, run the real plain-text pasteboard smoke serially:

```bash
pnpm run check:plugin-permission-management:native
```

The smoke restores the original plain-text clipboard after read/write/empty
checks. The WKWebView evidence proves the isolated authenticated Port and that
the iframe has no browser clipboard or Tauri fallback; the native smoke proves
the direct AppKit boundary. These complementary checks must not be described as
Windows/Linux provider support or as a prompt/settings/history UI test.

## Plugin Scoped Storage Validation

Changes to the Host-private storage contract, fixtures, Rust store or command,
Installer data coordinator, desktop provider, Dispatcher storage routing,
Runtime capability availability, public consumer evidence, or storage
documentation must run:

```bash
pnpm run check:plugin-scoped-storage
```

The gate verifies exact shared TypeScript/Rust valid and invalid fixtures,
strict boundary results and safe errors, deterministic quota and Unicode
ordering, revision-bound integrity-protected cursors, durable atomic mutation,
restart recovery, namespace corruption and symlink isolation, Installer
replacement/disable/retain/delete-data behavior, provider cancellation and
currentness, all five Dispatcher methods, Context degradation events, and the
real SDK/MessageChannel path.

It also packs the public Contract, SDK, and Testkit tarballs, runs an isolated
no-private-import consumer through all five semantic storage methods, checks
exports/dependencies/workspace boundaries, and retains the existing bounded
macOS WKWebView evidence for the authenticated Port and terminal lifecycle.
The gate must not expose key, value, path, plugin data, raw payload, exception,
or stack evidence. It supplements rather than replaces the complete frontend
and Rust validation sets. This change has no product UI, copy, theme,
accessibility, keyboard, or Semi Design surface, so visual acceptance is not
applicable; normal UI regressions remain covered by the full frontend suite.

## Rust Validation

Check Rust formatting:

```bash
pnpm run src-tauri:format:check
```

Run Rust tests:

```bash
pnpm run src-tauri:test
```

Run Rust static compilation checks:

```bash
pnpm run src-tauri:check
```

When a change introduces stricter Rust tooling such as Clippy, record and run
the exact command in the OpenSpec task list.

## Documentation Validation

For documentation changes:

- compare `docs/en/` and `docs/zh/` relative Markdown paths;
- verify both language indexes link to every maintained topic;
- verify relative Markdown links resolve;
- verify English and Simplified Chinese headings and semantics align;
- verify README files contain matching onboarding content;
- verify no formal artifact cites or depends on temporary material;
- verify planned features are not presented as implemented.

## Scope Rules

- A frontend-only change still runs the frontend test, typecheck, check, and
  build set.
- A Rust-only change still runs Rust format, test, and check.
- A cross-boundary or repository-wide change runs both complete sets.
- Every OpenSpec task list records both frontend and Rust validation. If one
  side is genuinely unaffected, record the reason rather than omitting it.
- Documentation-only changes must run documentation validation and any
  repository checks affected by formatted or generated files.

## Final Checklist

- [ ] Changed behavior has meaningful tests.
- [ ] Frontend validation passed or an unaffected reason is recorded.
- [ ] Rust validation passed or an unaffected reason is recorded.
- [ ] English documentation and Simplified Chinese mirrors are aligned.
- [ ] OpenSpec artifacts and stable specs are coherent.
- [ ] No introduced warning or error remains.
- [ ] Failed commands and the complete final validation set were rerun.
- [ ] Remaining limitations and unverified assumptions are reported.
