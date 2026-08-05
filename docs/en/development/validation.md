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
isolation, and production `unavailable`. It packs real Contract and SDK
tarballs, retains the no-DOM ES2022 root consumer, builds and runs the declared
iframe entry in an isolated browser consumer, rejects private deep imports,
and runs a real MessageChannel SDK/Host-adapter fixture.

Bounded macOS WKWebView evidence additionally covers exact parent/origin/Port,
single-use nonce, transport result/error/event round-trip, out-of-order
responses, cancellation, replacement/close cleanup, pending termination, and
zero privileged handler hits. Evidence contains no URL, nonce, Port content,
payload, token, identity, path, grant, or private error. The gate proves
transport delivery only: production still performs no Host API dispatch,
permission decision, application/native side effect, or Windows/Linux Runtime
transport.

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
