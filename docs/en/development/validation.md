# Validation

## Principle

Validation is part of implementation, not a follow-up. Every OpenSpec task list
must end with explicit final validation tasks, and every completed change must
have reproducible evidence for the affected frontend and Rust layers.

Fix warnings and errors introduced by the change. After a fix, rerun the failed
command and then rerun the complete final validation set.

## Local Browser Automation

Browser-backed validation must be automated without disturbing the user's
normal desktop or browser session. This policy applies both to commands that
launch a browser directly and to aggregate gates that launch one transitively.

- Inspect the selected gate before execution and identify whether it launches
  Chrome, Chromium, or another macOS `.app` process.
- On macOS, make the first browser launch in an approved execution context that
  can access the required application services. Do not first probe the same
  executable inside a restricted sandbox: even headless Chrome may register
  with LaunchServices and WindowServer, abort, and trigger a system crash
  dialog.
- Prefer automatic approval or review with the narrowest command scope. A
  user-facing approval is the fallback only when automatic handling cannot
  authorize the required execution.
- Keep the browser headless and windowless. Use a fresh temporary
  `--user-data-dir` for every isolated run, and never use the default profile,
  attach to an existing user browser, or reuse its remote-debugging endpoint.
- Preserve deterministic viewport, locale, theme, font, browser version, and
  screenshot inputs required by the maintained baseline. Do not silently swap
  browser engines to work around an execution restriction.
- Request graceful browser shutdown and delete the temporary profile after the
  process exits. Use forced termination only as a bounded fallback after a
  graceful-close timeout.
- If a browser launch fails only in a restricted sandbox, classify it as an
  environment failure and rerun the unchanged gate in the approved headless
  context. Do not modify product code, weaken assertions, or skip visual
  evidence to make the sandboxed attempt pass.

Headless describes rendering and window behavior; it does not remove the
browser process's operating-system permissions. Approved execution broadens
only the process context needed by the named validation command and does not
authorize use of the user's normal browser profile.

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

## Plugin Developer CLI Validation

Changes to `@lensx/plugin-cli`, its packaged templates, command/output contract,
project validator, canonical package core, or CLI documentation must run:

```bash
pnpm run check:plugin-developer-cli
```

The gate checks the executable tarball, bounded exports and dependency closure,
workspace and documentation boundaries, template drift, package-format corpus,
and the CLI package tests. It then installs real Contract, SDK, UI, Testkit, and
CLI tarballs in system temporary consumers using the machine-configured global
pnpm store. Both templates must complete create, install, test, typecheck,
build, read-only validate, reproducible pack, read-only inspect, and Rust
inspector/installer preparation without linking back to the checkout or root
`node_modules`.

The CLI `build` command and default `pack` execute project code; `validate`,
`inspect`, and `pack --no-build` do not. CLI compatibility never replaces Host
revalidation of untrusted package bytes. This gate does not establish
Development Mode/watch/reload or signing/provenance delivery, which remain
roadmap Tasks 6.5 and 8.1.

## Official Plugin Release Pipeline Validation

Changes to `plugins/*`, Changesets, CODEOWNERS, release planning,
candidate/audit schemas, official release workflows, installer/Runtime gates,
or the bilingual release documentation must run:

```bash
pnpm run check:official-plugin-release-pipeline
```

The gate validates zero/one/two-member and invalid contract fixtures,
workspace/Host import boundaries, deterministic base/head planning, explicit
Changeset policy, metadata-only versioning, canonical candidate records, mock
GitHub draft/idempotency/conflict behavior, pinned least-privilege workflows,
and documentation drift. Its temporary two-plugin consumer uses the global
pnpm store, versions only one plugin, builds and repeat-packs with the public
CLI, compares TypeScript and Rust facts, runs ordinary install preparation and
the Runtime E2E harness, and proves the other plugin and root app stay
unchanged. It never creates a public release.

This focused command composes the public CLI/package-format, local installation,
open isolated Runtime and workspace gates. Final completion
still requires the complete frontend/shared and Rust commands below.

## Plugin Development Mode Validation

Changes to the feature/capability handshake, directory inspector, snapshot
store, process-local Manager state, Resource/Runtime invalidation, development
adapter/service/UI, messages, docs, or visual evidence must run:

```bash
pnpm run check:plugin-development-mode
```

The gate combines strict boundary parsing, the shared CLI/Host payload corpus,
feature-enabled Rust transaction tests, production artifact exclusion, frontend
Child WebView convergence and accessibility, bilingual schema/docs drift, and
the 650×600 visual matrix. Global workspace boundaries remain in the complete
workspace and final change gates so unrelated official-plugin migrations do not
block this focused workflow. Run it sequentially with the existing management,
Runtime, Resource, Registration, CLI, and complete frontend/Rust gates. A real final
smoke uses `pnpm run dev:plugin-development-mode`; ordinary builds must remain
free of development commands and UI.

The focused gate also consumes bounded composed evidence for normal and
malicious development registrations. It pins the maintained macOS Child WebView
ACL, native slot, and open-Web capability evidence, then combines those facts
with source-neutral production resolver checks and Development Mode transaction
tests. The transaction matrix covers register, committed reload to a fresh
attempt, old-attempt teardown before new projection, rejected staging with the
current attempt unchanged, and removal. Task 8 maintains the separate full real
macOS end-to-end matrix. Refresh this composed evidence after reviewing any of
those production boundaries or Development Mode transactions:

```bash
pnpm run refresh:plugin-development-runtime-evidence:normal
pnpm run refresh:plugin-development-runtime-evidence:malicious
pnpm run check:plugin-development-runtime-evidence
```

Evidence files contain only bounded protocol/platform labels, relative fixture
references, digests, and booleans. They must never record source directories,
scoped URLs, origins, freshness values, tokens, payload values, or raw errors.

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

## Isolated Plugin Child WebView Runtime Validation

Changes to the Runtime resolver, native container, slot presentation, resource
binding, navigation policy, or lifecycle cleanup must run:

```bash
pnpm run check:plugin-child-webview-runtime
```

The gate combines React slot and state tests, physical-bounds revisions,
compare-current native lifecycle, generation-bound resources, open-Web positive
paths, top-level navigation denial, terminal cleanup, current `.lxp` fixtures,
bounded macOS WKWebView evidence, ACL negatives, and workspace-private imports.
Native load, bridge ready, and SDK ready remain separate evidence facts.

## Plugin Child WebView Session Validation

Changes to the private bridge bootstrap, source identity, readiness state,
strict RPC frames, Host dispatcher, cancellation, or cleanup must run:

```bash
pnpm run check:plugin-child-webview-session
```

The gate proves source-bound ready admission, current attempt/generation/nonce
validation, bounded requests, out-of-order settlement, event delivery,
disconnect/dispose, stale replacement rejection, and zero general Tauri
authority. Committed evidence is bounded and must not contain complete URLs,
resource tokens, nonces, payloads, identities, local paths, or private errors.
The focused macOS gate supplements rather than replaces the complete frontend
and Rust validation sets.

## Plugin SDK Transport Validation

Changes to the typed SDK request/event API, private transport codec, WebView
entry, Host bridge adapter, Runtime Session handoff, transport fixtures,
package exports, or target WebView evidence must run:

```bash
pnpm run check:plugin-sdk-transport
```

The gate checks deterministic plugin/Host codec drift, strict unknown parsing,
request/result pairing, safe errors, concurrent out-of-order responses,
cancellation, timeout, events, disconnect/disposal, stale Page and source-WebView
isolation, and the production Session-binding boundary. It packs real Contract and SDK
tarballs, retains the no-DOM ES2022 root consumer, builds and runs the declared
WebView entry in an isolated browser consumer, rejects private deep imports,
and runs a source-bound SDK/Host bridge fixture.

Bounded macOS WKWebView evidence additionally covers exact source WebView,
single-use nonce, transport result/error/event round-trip, out-of-order
responses, cancellation, replacement/close cleanup, pending termination, and
zero privileged handler hits. Evidence contains no URL, nonce, bridge content,
payload, token, identity, path, or private error. The gate proves the
public transport and its Host adapter; the separate Dispatcher and scoped-storage
gates prove the current production providers. Neither
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
closed-catalog and storage regressions, Runtime Session cleanup, public Contract
and SDK tarballs, workspace/private-import boundaries, and bounded target
macOS WKWebView evidence.

The committed WKWebView evidence must prove one over-depth request is rejected
with zero Handler hits and that a later legal request on the same healthy
Session still completes. Evidence stores only bounded boolean facts and must
not contain a payload, URL, origin, identity, request ID, diagnostic or
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
five `storage.*` methods while the current namespace is available. Removed
clipboard and unknown methods fail through the closed `0.2.0` catalog.

The existing target macOS WKWebView transport evidence remains required for
the authenticated Port, cancellation, replacement, and terminal cleanup. The
production-style MessageChannel fixture adds Dispatcher Context, Action,
storage, and response-before-close evidence without treating its fake native
boundary as Rust persistence or general RPC delivery. This focused gate
supplements rather than replaces the complete frontend and Rust validation
sets.

## Open Isolated Plugin Runtime Validation

Changes to Manifest/Host API `0.2.0`, permission-authority removal, plugin
response CSP, Worker/network/Blob/Data/WASM support, Runtime teardown, or trust
copy must run:

```bash
pnpm run check:open-isolated-plugin-runtime
```

The gate composes generated Contract drift, real public tarballs, closed
Dispatcher behavior, canonical open-Web fixtures, scoped Resource Service,
iframe/origin/navigation isolation, Runtime Session, and security lifecycle
checks. Its negative scan fails if removed native clipboard commands,
permission modules, grant fields, prompt/mutation imports, or restrictive
Worker/network policy returns. The canonical WKWebView harness provides
positive package/Blob/Data Worker, message, fetch, WebSocket construction,
WASM, origin-storage, and author-owned stricter-CSP evidence plus bounded
unsupported results for capabilities outside the current platform baseline.

## ConfigLens Official Plugin Validation

Changes to `plugins/config-lens`, its reviewed language dependencies,
release selection, package chunks, Runtime lifecycle, visual evidence, or
product documentation must run:

```bash
pnpm run check:official-config-lens-plugin
```

The gate runs the member lifecycle and four-language malicious/golden corpora,
checks dependency licenses and exact versions, builds the Monaco and language
module Workers, verifies all package-owned chunks and budgets, compares the
fixed 28-case bilingual light/dark visual matrix, and consumes bounded real
macOS WKWebView evidence for one editable model, direct replacement, and undo.
It then uses the public CLI to build, validate, inspect,
and pack twice, agrees with the Rust inspector and ordinary installation
preparation, and sends the same digest-fixed `.lxp` into the Host Runtime E2E.
Evidence and diagnostics must not include configuration content, URL, origin,
path, nonce, Port, payload, stack, or raw errors.

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

## Plugin Management Settings Validation

Changes to the root-private management facade, data-clear contract or Rust
coordinator, Settings Plugins surface, management messages/styles, or App
composition must run:

```bash
pnpm run check:plugin-management-settings
```

The gate checks strict shared data-management fixtures, desktop and private
boundaries, Registration-revision and selection behavior, mutation
serialization, replacement confirmation, lifecycle/storage
regressions, Host component behavior, message-schema parity, workspace/public
tarball boundaries, root `StrictMode` composition recreation, and Rust atomic
clear behavior. It also builds an isolated
fixture and captures all maintained empty, healthy, quarantined, degraded,
replacement, uninstall, and clear-data states at `650×600` for `en-US` and
`zh-CN` in light and dark mode. Each screenshot is paired with computed-style
checks for the continuous split surface, border, locale, theme, and modal.

This focused gate supplements the complete frontend/Rust suites and the
upstream installation, Registration, lifecycle, replacement, open Runtime, and
scoped-storage gates. Its Chrome-backed subprocesses must follow the local
browser-automation policy above; a sandbox-only launch failure is not a product
failure until the unchanged script passes or fails in the approved headless
context.

## Open-Web Trust Confirmation Validation

Installation and replacement tests must prove that the trusted main-window UI
shows the bilingual open-Web trust notice, commits only the exact prepared
candidate, and has no permission checklist or post-commit grant phase. The
fixed `650×600` visual matrix covers English and Simplified Chinese in light
and dark mode with screenshots and computed styles. Plugin-originated messages,
Publisher/source claims, SDK payloads, or claimed user activation cannot open
Host-private management UI or native authority.

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
