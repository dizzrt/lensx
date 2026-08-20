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

## Local Browser Automation

Browser automation is not part of maintained validation. Do not add browser launch, preview-server, screenshot, pixel comparison, real WebView, native harness, or GUI application commands to package lifecycle scripts, Gates, Generate targets, or CI.

## macOS Accessory Launcher Validation

Launcher policy, menu routing, focus state, shortcut behavior, restoration, and Child WebView coordination are covered by deterministic Rust and frontend tests. There is no packaged-application or Launch Services validation entry.

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
