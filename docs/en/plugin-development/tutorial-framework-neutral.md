# Framework-Neutral Plugin Tutorial

This path creates a permissionless browser DOM plugin. It is complete on its
own; the React tutorial is not required.

## Prerequisites

Use Node `>=24 <25`, pnpm `>=11 <12`, a supported macOS Host, and real
`@lensx/plugin-contract`, `@lensx/plugin-sdk`, `@lensx/plugin-testkit`, and
`@lensx/plugin-cli` tarballs produced by the lensX build you are testing. These
packages are not published to npm. Configure consumer-owned dependency
overrides to those tarballs; do not link the lensX workspace or root modules.

## Create and install

Run the real CLI outside the lensX repository, then install in the generated
project.

```sh verify=command id=framework-create
lensx-plugin create ./my-plugin --template framework-neutral --plugin-id com.example.my-plugin --name MyPlugin
pnpm install
```

`create` writes files only. It does not download dependencies, initialize Git,
install the plugin, start the Host, or create Host authority. The generated project
uses public package roots and ordinary version ranges.

## Manifest and resources

Open `manifest.json`. Keep `manifest_version` at `0.2.0`; use a namespaced
`plugin_id` and SemVer plugin version. Compatibility has separate half-open
ranges for lensX and Host API. Publisher fields are unverified author text.

The starter has no permission fields. It contributes one Page,
one Action targeting that Page, and a launcher default action. The WebView entry
and every icon or resource path must be package-relative and present in
`dist/`. Page and Action IDs are local to this plugin. Contract validation does
not install, register, authorize, or execute these declarations.

## Runtime lifecycle

`src/runtime.ts` creates one SDK client per attempt with
`createPluginWebviewTransport`, initializes it, publishes loading/ready/error,
and listens for complete `runtime.context_changed` replacements. Retry first
invalidates and disposes the old attempt, then creates a fresh client.

`src/view.ts` renders browser DOM from the current `en-US`/`zh-CN`, light/dark,
and capability snapshot. Empty capabilities are a valid degraded state. On
disconnect or failure, show bounded feedback and an explicit retry. Cleanup is
idempotent, and callbacks from an older attempt cannot restore it.

The Testkit supplies a semantic fake transport and context fixtures for these
states. It does not simulate the real Host security boundary.

## Test and build

Run every generated lifecycle, then use the CLI to classify the existing
self-contained payload.

```sh verify=command id=framework-validate
pnpm run test
pnpm run typecheck
pnpm run build
pnpm run check
lensx-plugin validate --project .
```

Tests cover successful initialization, full context replacement, missing
capability degradation, failed initialization, explicit retry with a fresh
attempt, late completion rejection, and repeated cleanup. A compatible result
is payload acceptance, not Host authority.

## Development Mode

Start the dedicated Host build from its checkout:

```sh verify=command id=framework-development-host
pnpm run dev:plugin-development-mode
```

In Settings, explicitly register this project's `dist/`. The Host copies a
verified immutable process-local generation. After changing code, run the
build again and choose manual reload. Development registration is not `.lxp`
installation, is not persisted across process restart, and does not change
Runtime isolation, deadlines, or session capability rules. There
is no watch/HMR or automatic reload.

## Pack and install

Create and inspect the canonical package. Repeating pack with unchanged input
must preserve the package digest and bytes.

```sh verify=command id=framework-package
lensx-plugin pack --project .
lensx-plugin inspect ./artifacts/com.example.my-plugin-0.1.0.lxp
lensx-plugin pack --project .
```

In Settings choose **Install from file**, select that `.lxp`, review the
unverified publisher and open-Web trust notice, and confirm. The Host reinspects
the exact candidate and commits through its controlled preparation boundary.
Open the contributed Action from the launcher and confirm loading, ready,
locale/theme replacement, and clean close. CLI acceptance did not grant any
Host authority; ordinary Web behavior remains inside the isolated Runtime.

## Negative paths

- Remove a referenced resource: build or validate must fail before packaging.
- Make a compatibility range exclude the current Host: the result is
  incompatible, not invalid.
- Remove a capability from the Testkit context: the view degrades and does not
  call it.
- Fail initialization, then retry: the second attempt is fresh and the first
  attempt's late work is inert.
- Dispose twice: listeners and pending operations stay released.
- Try an unavailable native/device API: handle the browser rejection; plugin
  code cannot open Host-private authority.
- Restart the Host: a Development Mode entry disappears; a formally installed
  entry remains manageable.

Use [Host API](host-api.md) before adding a protected feature and
[Compatibility and errors](compatibility-and-errors.md) when a gate fails.
