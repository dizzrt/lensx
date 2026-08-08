# React And Semi Plugin Tutorial

This path creates a complete permissionless React plugin that owns its UI
Runtime inside the iframe bundle. It does not depend on the framework-neutral
tutorial.

## Prerequisites

Use Node `>=24 <25`, pnpm `>=11 <12`, a supported macOS Host, and real
Contract, SDK, Plugin UI, Testkit, and CLI tarballs from the lensX build under
test. The packages are not published to npm. Consumer-owned overrides may point
to tarballs; workspace, source, and root-module links are forbidden.

The project owns `react`, `react-dom`, `@douyinfe/semi-ui`, and
`@lensx/plugin-ui`. It does not use React or Semi from the Host.

## Create and install

Create the maintained React/Semi project outside the lensX repository and
install its dependencies.

```sh verify=command id=react-create
lensx-plugin create ./my-plugin --template react-semi --plugin-id com.example.my-plugin --name MyPlugin
pnpm install
```

The CLI writes a complete project but performs no install, Host launch, plugin
installation, Host authority, or execution.

## Manifest and resources

The generated `manifest.json` uses Manifest `0.2.0`, separate lensX/Host API
compatibility ranges, unverified publisher text, no permission fields, one
Page, one Page-targeting Action, and `index.html` as the iframe entry. Every
Runtime and asset path must exist under the built `dist/`.

Worker/network behavior needs no Manifest declaration. Host policy fields,
native capabilities, sandbox, and CSP overrides remain invalid Manifest input.

## Runtime and UI lifecycle

`src/runtime.ts` creates one SDK client per attempt, publishes loading, ready,
or error, applies complete context replacements, creates a fresh client on
explicit retry, ignores older attempt completion, and disposes idempotently.

`src/App.tsx` wraps every state in `PluginUiProvider`. It renders
`PluginFeedback` for loading/error/recovery and `PluginPage` for ready content.
Import public Plugin UI styles from `@lensx/plugin-ui/styles.css`; use supported
components and public tokens instead of Host styles. Empty capabilities render
a meaningful unavailable state rather than triggering a guessed method.

## Locale theme and accessibility

Treat the latest context's `en-US`/`zh-CN` and light/dark values as one atomic
snapshot. `PluginUiProvider` applies the public locale/theme bridge and tokens.
Keep all visible copy localized, controls keyboard reachable, feedback exposed
semantically, and focus predictable. On error, move focus to the recovery
action; after recovery, restore a useful logical target. Do not encode theme by
hard-coded Host colors.

The maintained visual gate renders both locales in both themes. Component
tests cover loading, ready, error, recovery, keyboard activation, semantic
status, and focus behavior.

## Test and build

Run the complete generated lifecycle and classify the existing `dist/`.

```sh verify=command id=react-validate
pnpm run test
pnpm run typecheck
pnpm run build
pnpm run check
lensx-plugin validate --project .
```

These tests use the real public SDK and Testkit fake. They prove UI and client
lifecycle behavior, not real Host source authentication or authorization.

## Development Mode

Start the dedicated Host build from its checkout:

```sh verify=command id=react-development-host
pnpm run dev:plugin-development-mode
```

In Settings register the self-contained `dist/`. Rebuild after edits and use
manual reload to publish a fresh immutable process-local generation. Check
loading, both locales, both themes, error/recovery, and focus after reload.
Development source does not persist, install an `.lxp`, auto-reload, create
Host authority, or weaken the production Runtime/session/security boundary.

## Pack and install

Pack and inspect the production artifact twice.

```sh verify=command id=react-package
lensx-plugin pack --project .
lensx-plugin inspect ./artifacts/com.example.my-plugin-0.1.0.lxp
lensx-plugin pack --project .
```

Use Settings **Install from file**, review the publisher and open-Web trust notice, and
confirm the exact prepared candidate. Open its launcher Action. Verify loading,
ready, locale/theme replacement, keyboard controls, error/recovery, and close.
The Host reinspects and authorizes independently of the CLI.

## Negative paths

- Break an import or visual state: typecheck, test, build, or check fails.
- Remove a resource: validate fails before `.lxp` is accepted.
- Supply an incompatible context: the UI shows controlled recovery and does
  not render ready.
- Remove an optional capability: the UI degrades and issues no hidden call.
- Fail then retry: a fresh attempt owns fresh subscriptions; old callbacks are
  inert.
- Dispose repeatedly: cleanup remains idempotent.
- Try an unavailable native/device API: React, Semi, Plugin UI, CLI, and a
  plugin click cannot create Host-private authority.
- Compare sources after restart: development disappears; formal installation
  remains persisted and manageable.

Use [Public packages](public-packages.md) for dependency ownership,
[Host API](host-api.md) for methods, and
[Runtime and security](runtime-permissions-security.md) for
authority and teardown.
