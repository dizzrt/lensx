# Plugin Project Templates

## Purpose And Template Choice

The repository maintains two runnable plugin starters as direct pnpm workspace
members. They are the canonical project-owned sources for the matching
`lensx-plugin create` templates packaged with `@lensx/plugin-cli`:

- `examples/plugins/framework-neutral` uses TypeScript and browser DOM APIs. It
  is the smallest choice when a plugin does not need React or Semi Design.
- `examples/plugins/react-semi` owns React, React DOM, Semi Design, and
  `@lensx/plugin-ui` in its Child WebView document. Choose it for component-based UI,
  shared plugin semantic tokens, and Semi controls.

Both templates use the same public Contract and SDK boundaries as an external
plugin. Their workspace location changes local dependency linking only; it does
not grant an official source identity, Host trust, Tauri access, permissions,
or private imports.

## Project Structure

Each template contains `package.json`, `manifest.json`, `index.html`, Rsbuild
and Rstest configuration, `src/`, `tests/`, and a package-local metadata check.
A normal build emits a self-contained plugin document under `dist/`:

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
@lensx/plugin-sdk/webview
@lensx/plugin-testkit        # tests only
@lensx/plugin-ui             # React template only
@lensx/plugin-ui/styles.css  # React template only
```

Plugins must not import `src/app/**`, `src-tauri/**`, `tools/**`, Tauri APIs,
package source directories, or undeclared deep paths. The CLI's package-format
modules are also internal and are not a plugin Runtime API. A project may call
the `lensx-plugin` bin from authoring workflows but must not import
`@lensx/plugin-cli` from `src/**`.

## Manifest, Page, And Action

Each template has a distinct plugin ID and a Contract-valid Manifest `0.4.0` with one
WebView Runtime entry, one Page, and one Action targeting that Page. Both
request no permissions. The Action is projected by the Host into the shared
Launcher Action Registry; activating it opens the projected Page. The Host
then resolves the current registered entry and resource generation. React only
requests one native Child WebView presentation using that safe identity; native
code independently resolves the current document target.

Template Pages omit `presentation`, so normalization produces a fixed
`650×600` Page. Authors may opt a Page into a bounded initial logical size and
user resizing:

```json
"presentation": {
  "initial_size": { "width": 800, "height": 600 },
  "resizable": true
}
```

This is declarative metadata, not a Runtime resize API. The Host fits it to the
current work area; hide/restore retains the current same-attempt size, while a
real close/reopen resets to the declared initial size. The first version never
persists user size.

When adapting a template, keep Page and Action IDs consistent, keep the Action
target valid, and include every Manifest resource in `dist/`. Adding a
permission is a separate product and security decision; these starters are not
permission tutorials.

## Runtime Lifecycle

The plugin creates an explicit SDK client with
`createPluginWebviewTransport()`. Initialization begins in a loading state and
becomes ready only after the Host-installed closed bridge handshake and
`runtime.get_context` response complete. A context-change event replaces the
complete locale/theme/capability snapshot.

Initialization failure or disconnect produces a bounded error. Retry is
explicit and creates a fresh transport and SDK client; late callbacks from a
replaced attempt are ignored. Close, retry, unmount, and document teardown use
one idempotent cleanup path. The React template passes the current context to
`PluginUiProvider`; the framework-neutral template applies locale and theme
directly to its document.

## Commands

Create a standalone project without network access, dependency installation,
Git initialization, or project-code execution:

```bash
lensx-plugin create ./my-plugin \
  --template framework-neutral \
  --plugin-id com.example.my-plugin \
  --name "My Plugin"
```

Select `react-semi` for the React/Semi starter. The generated project declares
`pnpm@11`, ordinary public dependency ranges, and the same lifecycle scripts
as its canonical example. See [Plugin Developer CLI](plugin-developer-cli.md)
for build, validation, packing, and inspection.

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
pnpm run gate -- plugin-project-template
```

## Isolation And Packaging Validation

The aggregate gate runs member checks, then copies both templates into system
temporary consumers. It packs the real Contract, SDK, Testkit, and UI packages,
uses consumer-owned overrides, installs offline from the machine-configured
global pnpm store without lifecycle scripts, and audits resolved links, source
imports, bundle module graphs, and output files.

The package gate packs each `dist/` twice with the CLI-internal canonical
packer. It verifies byte reproducibility, checksum coverage, and
matching TypeScript/Rust inspection facts, then passes the same temporary
`.lxp` bytes through the controlled Rust installer preparation boundary.
Negative cases stop missing resources, invalid targets, non-canonical bytes,
permissions, and Host-owned facts before Runtime startup.

The production-component smoke uses the packed Manifest through current
Registration, Page/Action projection, resource resolution, Runtime resolver,
public WebView transport, closed Child WebView bridge, and Host dispatcher. It is not a
complete desktop GUI E2E. Rstest separately checks English and Simplified
Chinese, light and dark semantic tokens, long text, focus, loading, error,
ready, retry, keyboard, and accessibility behavior.

## Current Limits

The public CLI and `create` command are available from workspace builds and real
package tarballs, but this repository does not yet publish them to npm.
Development Mode, watch/reload, plugin installation, permission grants,
signing/provenance, and remote publishing remain separate capabilities.
Generated templates and CLI validation do not replace the Host's independent
native package and source checks.
