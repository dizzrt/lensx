# Validation

## Principle

Maintained validation is deterministic and has four supported categories:

1. Rstest and Cargo unit, state, policy, and boundary tests.
2. Biome, TypeScript, Rust formatting, and static checks.
3. Rsbuild, Cargo, and workspace production builds.
4. Pack, inspect, tarball, temporary CLI consumer, and deterministic generated-artifact checks.

The repository does not maintain screenshot, pixel, visual-baseline, browser, real WebView, GUI application, native interaction, or target-environment performance validation. Those paths have no optional, manual, or compatibility Gate.

## Command Model And Stable Interface

Use the standard lifecycle for complete local validation:

```bash
pnpm run test
pnpm run typecheck
pnpm run check
pnpm run build
pnpm run src-tauri:format:check
pnpm run src-tauri:test
pnpm run src-tauri:check
pnpm run src-tauri:build
```

Package lifecycle meanings do not overlap: `typecheck` checks types, `test` runs tests, `check` runs formatting, lint, generated drift, and source policy, and `build` builds. A package may expose `test:e2e` only for a post-build pure Node artifact check.

`gate` is the read-only cross-layer dispatcher. `generate` is limited to deterministic source-derived artifacts and requires one target plus `--write`.

```bash
pnpm run gate -- --list
pnpm run generate -- --list
pnpm run generate -- plugin-manifest-types --write
```

Do not add root aliases for a Change, a test subset, or a forwarded Gate.

## Unified Development Launcher Validation

```bash
pnpm run gate -- development-launcher
```

The `development-launcher` Gate is read-only. Fake servers and children cover
preferred and incremented ports, mode isolation, in-memory Tauri config,
server-before-child ordering, spawn/exit/signal races, bounded diagnostics, and
idempotent cleanup. Rust tests cover strict dynamic App targets, navigation/CSP
agreement, owned Resource Service policy, and the unchanged production
`tauri://localhost` profile. The Gate never starts a real Rsbuild listener,
Tauri GUI, browser, WebView, native harness, screenshot, visual baseline, or
target-environment performance process.

## Local Browser Automation

Browser automation is not part of maintained validation. Do not add browser launch, preview-server, screenshot, pixel comparison, real WebView, native harness, or GUI application commands to package lifecycle scripts, Gates, Generate targets, or CI.

## macOS Accessory Launcher Validation

Launcher policy, menu routing, focus state, shortcut behavior, restoration, and Child WebView coordination are covered by deterministic Rust and frontend tests. There is no packaged-application or Launch Services validation entry.

## Launcher Input Focus Validation

```bash
pnpm run gate -- launcher-input-focus
```

The `launcher-input-focus` Gate covers committed queries, composition drafts,
IME keyboard priority, invalidated sessions, locale/theme behavior, and input
accessibility through real Semi components in Rstest. Cargo tests cover native
surface state, queued updates, rollback, and Host/Child window lifecycle. The
Gate reuses `frame-aware-navigation-dependency-drift` and
`plugin-child-webview-window-lifecycle`; the latter builds the public Contract
through the workspace build graph before UI consumers. Missing package build
output is prepared without source aliases or rebuilding root `node_modules`.

The dependency Gate compiles and runs the private Tao resizable, file-drop,
and command-responder policies with `rustc --test`, checks all reviewed Tao
Rust files with two-space formatting, and strictly compiles Tao on macOS.
The fake adapters establish state, ownership, and call boundaries without
AppKit interaction; they do not establish real input-method candidate-window
behavior or actual editing delivery.
Focused Gate success supplements the complete lifecycle and CI validation.

The Gate only reads the reviewed vendored integrity baseline. Source updates
require review before this explicit Generate command:

```bash
pnpm run generate -- frame-aware-navigation-dependency-drift --write
```

Registry validation rejects committed-write and prohibited environment steps
before execution. Gate preparation writes only ignored build output; it does
not regenerate the committed baseline or start native interaction.

## Vendored Tao Diagnostic Maintenance

```bash
pnpm run gate -- frame-aware-navigation-dependency-drift
```

The Gate compares pinned versions, reviewed patch paths, and every vendored
file hash against the committed integrity baseline. It also compares Tao's
resolved path, version, and feature set between the application graph and the
selected Tao package before running this Darwin-only strict compile:

```bash
cargo rustc --locked --manifest-path src-tauri/Cargo.toml -p tao --lib -- -D warnings
```

Only the selected Tao target receives `-D warnings`. Missing graph data or any
path, version, or feature mismatch fails the Gate. Normal Cargo check/build
still covers the complete application dependency graph. Hosts without macOS
cannot complete its required Darwin steps; portable policy tests and vendor
format checks do not establish compilation on Windows, Linux, or BSD.

All three production policy modules compile and execute in ignored build output,
with cleanup on success and failure. The formatting check covers every reviewed
Tao Rust file, including `resizable.rs`, `file_drop.rs`, `responder.rs`, and the
`view.rs` native adapter; the application workspace format check alone does not
cover this vendored crate.
Gates never update the baseline; review the source diff before explicitly
running the Generate command above. No additional root script is needed.

Tao remains pinned to `0.35.3`. Diagnostic maintenance removes unused macOS
implementation remnants and obsolete aliases while retaining public badge
extensions, the Windows/Linux/BSD `hit_test` consumers, and the resizable
responder policy. `PlatformIcon` still validates and stores its RGBA payload
and derives Debug/Clone. Its retained field has one documented
`allow(dead_code)` because macOS does not read the pixels. This is the only
new lint exception; unrelated upstream exceptions remain. Do not add broad
warning suppression or global Cargo lint flags.

macOS file dragging registers file URLs and reads NSURL objects with the
file-URLs-only option. Enter, Prepare, and Drop each read the current payload;
checked object conversion and `to_file_path` feed ordered optional paths into
the same private `file_drop.rs` policy. Failed candidates are skipped; zero
valid files rejects the operation without file events. Valid files emit one
Hover/Drop event each in order, Prepare emits none, and every Exit emits one
Cancel. `draggingEntered:` returns NSDragOperation; Prepare/Perform retain BOOL.

The pure Rust policy tests cover filtering, order, rejection, phase events,
and preservation of already resolved Chinese/space/percent paths. These tests
do not exercise NSURL decoding, Finder format matching, or AppKit callback
dispatch. Source wiring checks and macOS compilation supplement policy tests;
no native interaction validation entry is maintained.

## Vendored Wry Editing Shortcut Validation

The same `frame-aware-navigation-dependency-drift` Gate compiles and runs the
production Wry `key_equivalent.rs` policy and Tao `responder.rs` policy through
their private runners. Unique ignored output is cleaned after success, compiler
or test failure, launch failure, and signals. The Gate checks the reviewed Tao
files and the Wry class module, native adapter, and policy with two-space
rustfmt. Application Cargo formatting does not own vendored formatting. These
steps neither write the integrity baseline nor introduce a root script,
permission, dependency upgrade, or environment-validation entry.

Wry fake adapters cover original-event identity and modifiers, one superclass
call per native callback, both synchronous return values, non-Child delegation,
and attachment, visibility, key-window, and first-responder ownership guards.
The synchronous BOOL can indicate Web processing is pending; tests do not treat
it as final consumption. Tao fake adapters call the actual production policy
for original-selector propagation, all focus guards, repeated focus changes,
and preservation of Tao's own raw-input focus. Host Cargo tests cover the
foreground W/Q monitor and native lifecycle composition. Rstest verifies
Objective-C wiring, public boundaries, runner cleanup, and read-only registry
metadata; Cargo check/build compiles the actual adapters.

The `launcher-input-focus` Gate includes `tests/launcher-input-focus-ui.test.tsx`
and `tests/ordinary-plugin-editing-ui.test.ts` in its existing Rstest step.
Both remain in root `tests/**/*.test.{ts,tsx}` discovery. The external fixture
contains only test-owned `input`, `textarea`, and `contenteditable` controls;
it is not installed in the product Host and requires no SDK or Manifest change.
Explicit plain-text defaults model selection, clipboard data, editing, and
history after cancelable DOM events reach the real handlers. They cover
cancellation, read-only/disabled and empty states, composition, focus changes,
and English/Chinese with light/dark themes. They do not replace native focus
or Child-generation policy tests.

ConfigLens tests use actual Monaco body clipboard handlers and independently
seeded `DataTransfer` input, checking selected output, content, callbacks, and
Undo/Redo. Find remains a real query control; its missing Happy DOM text defaults
and history are explicitly modeled, and its undo ownership is checked separately
from the body. These tests run through the existing plugin/workspace lifecycle
and `ci-plugins`, with no additional root alias. See the
[ConfigLens guide](config-lens.md) for editor-specific coverage.

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Production Rust policies and Host composition | Native ownership guards, original event/selector, call counts, reserved commands, and retained raw-input behavior | Actual AppKit callback order or WebKit completion |
| Native wiring and Cargo checks/builds | Production adapters and the pinned dependency path compile together | Successful OS editing or system clipboard delivery |
| Host/external Rstest and Monaco handler tests | Real handlers plus declared DOM defaults, clipboard data, selection/content changes, focus and undo ownership | Browser-native defaults, real system clipboard access, or every platform scenario |
| Temporary macOS investigation and user feedback | The exercised build's unhandled-command propagation, WebKit reentry, single existing-menu action, and reported shortcut recovery after debugger removal | The complete key/control matrix, all input methods, or other platforms |

The correction restores Tao command propagation; it adds no menu dispatch,
`keyDown` fallback, pending state, queue, retained target, or WebKit completion
hook. Final Web cancellation and legal reentry remain WebKit responsibilities.
Keep runtime observations separate from deterministic results. The temporary
investigation is not a maintained command, Gate, GUI harness, or CI step.

Use the existing `plugin-child-webview-runtime`,
`plugin-child-webview-window-lifecycle`, `launcher-input-focus`, and
`frame-aware-webview-navigation-policy` Gates for lifecycle and routing
regressions. Review changed vendor sources against their pinned same-version
release (`tao 0.35.3`, `wry 0.55.1`) before explicitly generating the baseline.
Host native delivery and plugin business commands have separate release
responsibilities; existing compliant external plugins do not need repackaging
or added clipboard permissions to receive a Host correction.

## Frontend Validation

Use `pnpm run test`, `pnpm run typecheck`, `pnpm run check`, and `pnpm run build`. Root Rstest discovery owns repository-only assertions; the lifecycle aggregator covers the root application and every direct workspace member once in dependency order.

## Plugin Contract Validation

```bash
pnpm run gate -- plugin-contract
```

This Gate checks schemas, generated drift, types, tests, packaging, and workspace boundaries.

## Plugin Package Format Validation

```bash
pnpm run gate -- plugin-package-format
```

The Gate uses deterministic TypeScript and Rust format checks plus package fixtures.

## Plugin Developer CLI Validation

```bash
pnpm run gate -- plugin-developer-cli
```

The CLI consumer and compatibility fixtures cover the maintained 6.5 and 8.1 behavior without launching a product environment.

## Continuous Integration Validation

The repository has exactly two read-only macOS workflows:

- LensX CI calls the `ci-lensx-frontend` and `ci-lensx-rust` Gates; use
  `pnpm run gate -- ci-lensx` for the complete local entry.
- Plugins CI calls `pnpm run gate -- ci-plugins`.

Both workflows are reproduced locally with the same commands. They do not publish, upload, sign, notarize, or update generated artifacts.

`ci-lensx-frontend` owns clean-checkout workspace preparation: it derives the
transitive public package build closure, builds dependencies in topological
order before consumers, and de-duplicates identical steps across frontend
stages. In particular, Contract is built before CLI. Validation must not rely on
residual `dist`, workflow-only preparation, source aliases, or recursive package
builds; stage-specific environment semantics keep otherwise similar steps
distinct.

## Plugin Development Mode Validation

```bash
pnpm run gate -- plugin-development-mode
pnpm run gate -- plugin-development-smoke-reload
```

Deterministic Rust, TypeScript, React, package, and source-policy tests cover directory safety, immutable snapshots, atomic reload, production exclusion, generation revocation, UI states, and cleanup.

## Plugin Resource Service Validation

```bash
pnpm run gate -- plugin-resource-service
```

## Isolated Plugin Runtime Origin Validation

```bash
pnpm run gate -- isolated-plugin-runtime-origin
```

## macOS Frame-Aware WebView Navigation Validation

```bash
pnpm run gate -- frame-aware-webview-navigation-policy
```

The Gate validates classification, allowlists, pre-commit policy, popup and download denial, dependency pinning, and Host bootstrap isolation through deterministic tests.

## Isolated Plugin Child WebView Runtime Validation

```bash
pnpm run gate -- plugin-child-webview-runtime
```

This is deterministic contract and lifecycle validation. It must not be described as proof of native isolation or real WebView behavior.

## Plugin Child WebView Session Validation

```bash
pnpm run gate -- plugin-child-webview-session
```

## Plugin SDK Transport Validation

```bash
pnpm run gate -- plugin-sdk-transport
```

The Gate checks public exports, private codecs, adapter behavior, lifecycle, tarball consumption, and deep-import rejection without launching a browser.

## Plugin RPC Validation

```bash
pnpm run gate -- plugin-rpc-validation
```

## Plugin Host API Dispatcher Validation

```bash
pnpm run gate -- plugin-host-api-dispatcher
```

## Open Isolated Plugin Runtime Validation

```bash
pnpm run gate -- open-isolated-plugin-runtime
```

## ConfigLens Official Plugin Validation

Run the normal ConfigLens package lifecycle. Its post-build pure Node check enforces the initial 256 KiB JavaScript budget, 64 KiB CSS budget, bootstrap order, one SDK client, Monaco single-flight behavior, Worker closure, package boundaries, and self-contained output.

## Controlled Host HTTP Validation

Run `pnpm run gate -- plugin-host-http` for public Contract/SDK coverage,
native source-bound admission, fake DNS/transport policy, cancellation,
deadlines, limits, and Translation integration. The checks cover both success
and HTTP error results without contacting a real service. They do not start
a browser, WebView, GUI, or native interaction harness. See the
[Host API reference](../plugin-development/host-api.md#httprequest).

## Translation Official Plugin Validation

Translation uses the same plugin/workspace lifecycle and `ci-plugins` Gate.
Controlled SDK storage, clocks, HTTP responses, fixed signing vectors, and
real Semi controls cover configuration confirmation, text/IME scheduling,
stale results, errors, locale/theme, focus, and teardown. Its pure Node
post-build check uses the public CLI to validate, pack twice, and inspect
self-contained output. Private module inventories stay outside the package.
These checks do not call a real translation service or establish WebView
network access, native IME behavior, or OS clipboard delivery. See the
[Translation maintainer guide](translation.md) for commands and evidence bounds.

## Plugin Scoped Storage Validation

```bash
pnpm run gate -- plugin-scoped-storage
```

## Plugin Management Settings Validation

```bash
pnpm run gate -- plugin-management-settings
```

Component and service tests cover locale, theme, keyboard, focus recovery, loading and error states, destructive confirmation, revision races, and Host-private composition.

## Open-Web Trust Confirmation Validation

Use `pnpm run gate -- open-isolated-plugin-runtime`. Deterministic checks establish public capability and Host-boundary invariants, not real-environment execution.

## Rust Validation

```bash
pnpm run src-tauri:format:check
pnpm run src-tauri:test
pnpm run src-tauri:check
pnpm run src-tauri:build
```

## Documentation Validation

English documents under `docs/en` are canonical. Keep the matching `docs/zh` file semantically aligned and keep Gate and Generate identifiers resolvable.

## Scope Rules

- Use Rstest for deterministic repository assertions.
- Use stable capability Gates for cross-layer deterministic orchestration.
- Use Generate only for reproducible source-derived artifacts with explicit write authorization.
- Never restore removed environment validation through another script, workflow, hidden flag, or manual Gate.

## Final Checklist

1. Run both CI Gates from a clean-checkout-equivalent workspace.
2. Run frontend and workspace test, typecheck, check, and build.
3. Run Rust format check, test, check, and build.
4. Run retained pack, inspect, tarball, and CLI consumer Gates.
5. Validate active OpenSpec changes and all stable specs strictly.
6. Run active-source stale scans and `git diff --check`.

## Configurable Shortcut Validation

Run `pnpm run gate -- launcher-shortcuts`. The stable Gate composes shortcut
policy/typed adapter and real Semi settings tests, Rust transaction/registration,
recording and gesture tests, and the existing `launcher-input-focus`,
`plugin-action-projection`, `plugin-child-webview-session`,
`plugin-child-webview-continuity`, `plugin-sdk-transport`, and
`plugin-host-api-contract` Gates. Shared policy fixtures cover canonical aliases,
reserved keys and duplicates, including unavailable targets. Virtual time and
fake native/storage adapters cover complete double taps, multi-press cancellation,
partial failures, uncertain commits, compensation, recovery degradation and lease
expiry. Session/SDK tests cover 32-item initial admission, 64-item initialization
merge, retry/terminal boundaries and optional callback isolation.

These deterministic checks establish configured versus active state, independent
preferences persistence, native adapter wiring and bounded semantic delivery.
They do not prove macOS authorization dialogs, OS keyboard delivery, Secure Input
transitions on a real system, or conflicts with every external shortcut tool.
Double taps are passive and not exclusive. Use `plugin-host-api-types --write`
only through Generate for current Schema-derived files; preserve historical
WebView corpora. Focused Gates do not replace full workspace and Rust validation.

The shortcut matrix also covers v2 single-entry type switching, lossless v1
chord-only reads, unresolved dual-entry migration and explicit resolution,
permission-loss reveal for a sole double tap, and no hidden chord fallback.
Real Semi row tests cover Add drafts, atomic Action reassignment, saved/draft
deletion, inline editing, Escape, focus and stale responses in both locales and
themes. These remain deterministic tests without native input acceptance.
