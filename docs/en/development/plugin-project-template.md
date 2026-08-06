# Plugin Project Templates

## Purpose And Template Choice

The repository maintains two runnable plugin starters as direct pnpm workspace
members. They are project-owned examples, not generated output and not a
published scaffolding command:

- `examples/plugins/framework-neutral` uses TypeScript and browser DOM APIs. It
  is the smallest choice when a plugin does not need React or Semi Design.
- `examples/plugins/react-semi` owns React, React DOM, Semi Design, and
  `@lensx/plugin-ui` in its iframe document. Choose it for component-based UI,
  shared plugin semantic tokens, and Semi controls.

Both templates use the same public Contract and SDK boundaries as an external
plugin. Their workspace location changes local dependency linking only; it does
not grant an official source identity, Host trust, Tauri access, permissions,
or private imports.

## Project Structure

Each template contains `package.json`, `manifest.json`, `index.html`, Rsbuild
and Rstest configuration, `src/`, `tests/`, and a package-local metadata check.
The React template additionally contains `visual/`, committed screenshot
baselines, and a visual verification script. A normal build emits a
self-contained plugin document under `dist/`:

```text
dist/
  manifest.json
  index.html
  static/css/*
  static/js/*
```

The framework-neutral bundle contains no React, React DOM, Semi Design, or
Plugin UI Runtime. The React bundle owns all four; the Host does not inject a
framework global, import map, React context, or private stylesheet.

## Public Dependencies

Template metadata uses ordinary `^0.1.0` ranges for lensX public packages,
never `workspace:`, `file:`, or `link:` protocols. The repository enables
matching-version workspace linking for local development. An external consumer
resolves the same ranges from packed public tarballs.

Supported plugin imports are limited to the declared public exports:

```text
@lensx/plugin-contract
@lensx/plugin-sdk
@lensx/plugin-sdk/iframe
@lensx/plugin-testkit        # tests only
@lensx/plugin-ui             # React template only
@lensx/plugin-ui/styles.css  # React template only
```

Plugins must not import `src/app/**`, `src-tauri/**`, `tools/**`, Tauri APIs,
package source directories, or undeclared deep paths. In particular,
`tools/plugin-package-format` is a Host-private validation tool and is not a
template dependency or public packaging API.

## Manifest, Page, And Action

Each template has a distinct plugin ID and a Contract-valid Manifest with one
iframe Runtime entry, one Page, and one Action targeting that Page. Both
request no permissions. The Action is projected by the Host into the shared
Launcher Action Registry; activating it opens the projected Page. The Host
then resolves the current registered entry and resource generation before
constructing an isolated custom-protocol iframe URL.

When adapting a template, keep Page and Action IDs consistent, keep the Action
target valid, and include every Manifest resource in `dist/`. Adding a
permission is a separate product and security decision; these starters are not
permission tutorials.

## Runtime Lifecycle

The plugin creates an explicit SDK client with
`createPluginIframeTransport()`. Initialization begins in a loading state and
becomes ready only after the private Host Session handshake and
`runtime.get_context` response complete. A context-change event replaces the
complete locale/theme/capability snapshot.

Initialization failure or disconnect produces a bounded error. Retry is
explicit and creates a fresh transport and SDK client; late callbacks from a
replaced attempt are ignored. Close, retry, unmount, and document teardown use
one idempotent cleanup path. The React template passes the current context to
`PluginUiProvider`; the framework-neutral template applies locale and theme
directly to its document.

## Commands

Run one template locally with its package scripts:

```bash
pnpm --dir examples/plugins/framework-neutral run test
pnpm --dir examples/plugins/framework-neutral run typecheck
pnpm --dir examples/plugins/framework-neutral run build
pnpm --dir examples/plugins/framework-neutral run check

pnpm --dir examples/plugins/react-semi run test
pnpm --dir examples/plugins/react-semi run typecheck
pnpm --dir examples/plugins/react-semi run build
pnpm --dir examples/plugins/react-semi run check
pnpm --dir examples/plugins/react-semi run visual
```

Run the maintained end-to-end validation of the template boundary with:

```bash
pnpm run check:plugin-project-template
```

## Isolation And Packaging Evidence

The aggregate gate runs member checks, then copies both templates into system
temporary consumers. It packs the real Contract, SDK, Testkit, and UI packages,
uses consumer-owned overrides, installs offline from the machine-configured
global pnpm store without lifecycle scripts, and audits resolved links, source
imports, bundle module graphs, and output files.

The root-only package gate packs each `dist/` twice with the Host-private
reference packer. It verifies byte reproducibility, checksum coverage, and
matching TypeScript/Rust inspection facts, then passes the same temporary
`.lxp` bytes through the controlled Rust installer preparation boundary.
Negative cases stop missing resources, invalid targets, non-canonical bytes,
permissions, and Host-owned facts before Runtime startup.

The production-component smoke uses the packed Manifest through current
Registration, Page/Action projection, resource resolution, Runtime resolver,
Session, public iframe transport, RPC adapter, and Dispatcher. It is not a
complete desktop GUI E2E. The React visual gate separately checks English and
Simplified Chinese, light and dark themes, long text, focus, semantic states,
computed public tokens, and fixed-viewport screenshots.

## Current Limits

There is currently no public plugin CLI, `create` command, or Development Mode.
Copying a maintained template is a repository workflow, not an installed lensX
feature. The templates do not publish packages, commit `.lxp` output, automate
installation, grant permissions, or replace native desktop acceptance. Future
CLI or Development Mode work must preserve the same public-package and Host
security boundaries.
