# Plugin Workspace

## Scope

The repository is a pnpm workspace that keeps the `lensx` React/Tauri Host as
the private root package. The workspace establishes development topology,
lifecycle aggregation, and dependency checks for public packages and plugins.
It contains the publishable `@lensx/plugin-contract`, `@lensx/plugin-sdk`,
`@lensx/plugin-testkit`, and optional `@lensx/plugin-ui` packages, but repository
validation does not perform a registry publish. The workspace does not yet
provide a plugin CLI. The Host can install/register and open a supported local
plugin, the SDK supplies the authenticated iframe transport, and the production
Host-private Dispatcher implements `runtime.get_context`, `ui.close`,
`actions.open`, and the five plugin-scoped `storage.*` methods. Clipboard
methods are exposed independently only for a current granted Session while the
native provider is available. The Contract
package ships the complete ten-method semantic catalog and validators
independently of provider availability.

The shipped static Manifest contract remains validation-only. A package being
inside this workspace does not grant it Host trust, Tauri access, permissions,
or Runtime capabilities.

## Supported Member Locations

`pnpm-workspace.yaml` recognizes only package manifests in direct children of:

```text
packages/*
plugins/official/*
examples/plugins/*
```

`packages/*` is reserved for public workspace packages. Official and example
plugins use separate member areas but follow the same external-plugin source
boundaries. A package outside these patterns, or nested more deeply, is not a
workspace member. The external Contract and SDK consumers at
`examples/plugin-contract-consumer`, `examples/plugin-sdk-consumer`,
`examples/plugin-testkit-consumer`, and `examples/plugin-ui-consumer` remain
ordinary project data and are not workspace packages.

Every actual member must declare all four lifecycle scripts:

```json
{
  "scripts": {
    "build": "...",
    "typecheck": "...",
    "test": "...",
    "check": "..."
  }
}
```

The scripts must perform meaningful package-local validation. Do not use a
placeholder or omit a script because the root runner rejects incomplete
members.

## Plugin Contract Package

`packages/plugin-contract` owns the public Manifest and Host API Schemas,
generated inputs, normalized types, protocol constants, diagnostics, immutable
catalogs, and pure validation APIs. Supported imports are limited to:

```text
@lensx/plugin-contract
@lensx/plugin-contract/schema
@lensx/plugin-contract/manifest.schema.json
@lensx/plugin-contract/host-api-schema
@lensx/plugin-contract/host-api.schema.json
```

The package owns `ajv` as a direct runtime dependency and uses the existing
TypeScript and Rstest toolchain without React, Semi Design, Tauri, a DOM, Node
filesystem access, or a package bundler in its runtime surface. Generate and
validate the Contract with:

```bash
pnpm run generate:plugin-manifest-types
pnpm run generate:plugin-host-api-types
pnpm run check:plugin-host-api-contract
pnpm run check:plugin-contract
```

The complete check rebuilds both generated type sets, runs package and Host
boundary tests, checks Manifest and Host API TypeScript/Rust shared fixtures,
packs real Contract/SDK/Testkit tarballs, verifies file lists and exports, and
installs them into isolated no-DOM consumers for typecheck and Runtime smoke
testing. It proves semantic validity without claiming dispatch or side effects.

## Host-Private Package-Format Tool

`tools/plugin-package-format` is part of the private root Host workspace, not a
`packages/*` member and not a plugin dependency. It owns protocol constants,
the canonical TAR/checksum implementation, the fixed Zstandard reference
packer, the TypeScript inspector, and fixture generation/check logic. The Rust
counterpart lives in `src-tauri` and remains outside Tauri commands.

Use the dedicated drift gate:

```bash
pnpm run check:plugin-package-format
```

The command checks exact codec/crate inputs and constants, verifies committed
fixtures without rewriting them, runs focused TypeScript/reproducibility tests,
and runs Rust against the same expectations. Baseline regeneration is an
explicit review action:

```bash
pnpm run generate:plugin-package-format-fixtures
```

Workspace boundaries reject imports from `tools/**` by public packages,
official plugins, and example plugins. Public plugin tarballs contain none of
the Host-private tool, Rust source, fixture generator, or codec dependency.
Future `@lensx/plugin-cli` work may wrap or relocate the core through its own
approved change; no public CLI or package-format import exists today.

## Plugin SDK Package

`packages/plugin-sdk` owns the framework-neutral SDK client lifecycle, validated
Runtime context, version compatibility, stable SDK errors, cancellation and
timeout behavior, the semantic transport interface, and the official iframe
transport. Its supported imports are:

```text
@lensx/plugin-sdk
@lensx/plugin-sdk/iframe
```

The package has one direct Runtime dependency, `@lensx/plugin-contract`, and
imports `PLUGIN_HOST_API_VERSION`, the shared `PluginRuntimeContext` shape, and
Context validation from that package as current Host API facts. It exposes its independent
`PLUGIN_SDK_VERSION` and `PLUGIN_SDK_SUPPORTED_HOST_API_RANGE`; it does not
re-export or duplicate the current Host API version.

Use an explicit instance and injected transport:

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginIframeTransport } from '@lensx/plugin-sdk/iframe';

const client = createPluginSdk({ transport: createPluginIframeTransport() });
const context = await client.initialize();
if (context.capabilities.includes('ui.close')) {
  await client.request({ method: 'ui.close', params: {} });
}
await client.dispose();
```

Context capabilities are sorted unique values from the closed Contract method
catalog; they are current-callability snapshots rather than grants. The client
has no arbitrary raw method call. Its typed request and event APIs use the
closed Contract and preserve Host API errors separately from SDK lifecycle
errors. The iframe factory exposes no identity, origin, nonce, Port, wire, or
Host configuration; those frames and the Host lease adapter remain private.
Package-internal white-box tests keep their private fake;
public black-box controls are provided by Plugin Testkit.

Validate the SDK with:

```bash
pnpm --dir packages/plugin-sdk run build
pnpm --dir packages/plugin-sdk run typecheck
pnpm --dir packages/plugin-sdk run test
pnpm --dir packages/plugin-sdk run check
pnpm --dir packages/plugin-sdk run test:pack
pnpm run check:plugin-sdk
```

The pack gate builds real Contract and SDK tarballs, verifies the SDK file list,
root/iframe exports, declarations, and Runtime dependency metadata, and installs
both tarballs into isolated external consumers. The root consumer typechecks with
`lib: ["ES2022"]` and no DOM types, runs an ESM lifecycle smoke test, and proves
that an undeclared SDK deep import is rejected. The browser consumer typechecks,
bundles, loads the iframe entry in a real browser, and rejects private transport
deep imports. Tests, fixtures, scripts, schemas, Host projections, and
Host-private source are excluded from the tarball. Run
`pnpm run check:plugin-sdk-transport` for the complete cross-boundary gate. Run
`pnpm run check:plugin-host-api-dispatcher` for the production Dispatcher,
response-before-close, Action/Navigation/storage, Context replacement,
MessageChannel, public tarball, and workspace-boundary gate. The Dispatcher is
private Host source; it adds no Contract or SDK export or dependency.
Run `pnpm run check:plugin-scoped-storage` for the Rust-backed scoped storage,
Installer lifecycle coordination, public Testkit consumer, and private storage
boundary gate.

## Plugin Testkit Package

`packages/plugin-testkit` owns framework-neutral fixtures and controls for the
public Contract and SDK lifecycle. Its only supported import is:

```text
@lensx/plugin-testkit
```

The package depends at Runtime only on the public Contract and SDK roots. It
provides fresh Manifest fixtures, explicit JSON Pointer mutations, frozen valid
Runtime Context fixtures, explicit invalid Context fixtures, a cancellation
controller, deferred promises, and a
semantic fake transport with immutable observations. The fake can configure
connect/request handlers, emit abstract events, disconnect, and dispose, but it
does not model a wire envelope, iframe, Host identity, permission decision, or
real Host API method.

Use it with the real SDK rather than replacing SDK validation or lifecycle:

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import {
  createPluginManifestFixture,
  FakePluginSdkTransport,
} from '@lensx/plugin-testkit';

const manifest = createPluginManifestFixture();
const transport = new FakePluginSdkTransport();
const client = createPluginSdk({ transport });
await client.initialize();
await client.dispose();
```

Capability IDs in a context fixture are shared Contract method IDs, not grants.
Unknown, duplicate, unsorted, and trusted-field invalid fixtures are available
for negative initialization tests. Invalid or incompatible context,
cancellation, timeout, transport failure, retry,
disconnect, state publication, and late completion are evaluated by the real
SDK. Validate Testkit with:

```bash
pnpm --dir packages/plugin-testkit run build
pnpm --dir packages/plugin-testkit run typecheck
pnpm --dir packages/plugin-testkit run test
pnpm --dir packages/plugin-testkit run check
pnpm --dir packages/plugin-testkit run test:pack
pnpm run check:plugin-testkit
```

The dedicated gate validates Contract, SDK, and Testkit tarballs plus workspace
dependency and lifecycle rules. Its no-DOM ES2022 external consumer covers
Manifest/context fixtures, SDK initialization, observations, and disposal. It
is a release fixture, not the formal plugin project template from roadmap Task
1.6, and it does not execute a plugin or desktop Host.

## Plugin UI Package

`packages/plugin-ui` owns the optional React/Semi Design UI foundation. Its
supported imports are limited to:

```text
@lensx/plugin-ui
@lensx/plugin-ui/styles.css
```

The root entry exports `PluginUiProvider`, `PluginPage`, `PluginFeedback`, and
their public types. It does not re-export general Semi controls; plugin code
imports controls such as `Button`, `Input`, `Table`, `Form`, and `Modal`
directly from Semi Design when needed. Undeclared package source, component,
test, visual-fixture, and style deep imports are not public APIs.

`PluginUiProvider` accepts a read-only `PluginRuntimeContext` snapshot from the
SDK. It maps `en-US` and `zh-CN` to Semi locale packs, supplies package-owned
feedback copy, and synchronizes the plugin document's `lang`, CSS
`color-scheme`, and `body[theme-mode="dark"]`. Passing a new context snapshot
updates presentation. The provider does not subscribe to transport, poll the
Host, or define a context event protocol, and it restores prior document state
on unmount.

Import the styles entry once in a React plugin document:

```tsx
import { PluginPage, PluginUiProvider } from '@lensx/plugin-ui';
import '@lensx/plugin-ui/styles.css';

<PluginUiProvider context={context}>
  <PluginPage title="Plugin page">Content</PluginPage>
</PluginUiProvider>;
```

The styles entry includes the required Semi base styles and these versioned
lensX semantic tokens:

```text
--lensx-plugin-color-background
--lensx-plugin-color-surface
--lensx-plugin-color-text
--lensx-plugin-color-text-secondary
--lensx-plugin-color-border
--lensx-plugin-color-accent
--lensx-plugin-color-danger
--lensx-plugin-color-focus
--lensx-plugin-radius-page
--lensx-plugin-space-page
```

React, React DOM, and `@lensx/plugin-sdk` are peer dependencies owned and
bundled by the plugin project. Semi Design is a direct UI package Runtime
dependency. A final React plugin browser bundle contains its own single React
Runtime, React DOM, Semi, Plugin UI JavaScript, and styles; the Host does not
provide externals, import maps, globals, private React context, or private CSS.
A framework-neutral plugin continues to install only Contract and SDK and does
not need UI, React, or Semi.

Validate the UI package with:

```bash
pnpm --dir packages/plugin-ui run build
pnpm --dir packages/plugin-ui run typecheck
pnpm --dir packages/plugin-ui run test
pnpm --dir packages/plugin-ui run check
pnpm --dir packages/plugin-ui run test:pack
pnpm --dir packages/plugin-ui run test:visual
pnpm run check:plugin-ui
```

The pack gate installs real Contract, SDK, and UI tarballs into an isolated
Rsbuild browser consumer, checks package metadata and the bundle module graph,
and runs a browser Runtime smoke test. The visual gate covers `en-US`/`zh-CN`
and light/dark at `650×600`, including semantic structure, live regions,
keyboard recovery, focus, computed tokens, long text, and screenshots. These
gates do not implement or simulate Host installation or iframe execution.

## Root Commands

The standard root commands are repository-wide entry points:

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run check
```

Each command validates the root application first and then runs the matching
script for every member in workspace dependency order. A root or member
failure is returned to the caller. Empty member areas do not skip root
validation, and the internal `app:*` scripts avoid recursive root invocation.

`dev`, `preview`, `tauri`, and `src-tauri:*` keep their Host-specific meanings.
Use these focused commands when changing workspace tooling:

```bash
pnpm run check:workspace-boundaries
pnpm run test:workspace-boundaries
pnpm run test:workspace-lifecycle
pnpm run check:plugin-sdk
pnpm run check:plugin-testkit
pnpm run check:plugin-ui
```

## Dependency Direction

The allowed repository dependency direction is:

```text
root Host              -> packages/* public exports
packages/*             -> lower-level packages/* public exports
plugins/official/*     -> packages/* public exports
examples/plugins/*     -> packages/* public exports
```

Consumers must declare workspace package dependencies in their own
`package.json` and import the dependency by its declared package name and
public export. They must not reach another member through a relative source
path.

Public packages, official plugins, and example plugins must not depend on the
private root `lensx` package or import Host-private paths such as `src/app/**`
or `tools/**`, Host Tauri adapters, or internal Host styles. Plugin source and
manifests must not depend on or import `@tauri-apps/*`. Official plugins receive
no exception to these rules.

The package-level directions are Contract -> SDK -> Testkit and Contract -> SDK
-> optional UI. Testkit consumes only Contract and SDK public roots; Contract
and SDK must not depend on or import Testkit. The UI package may consume the SDK
public context type, while the framework-neutral SDK must never depend on or
import UI, React, or Semi Design.

The deterministic boundary checker parses package manifests and TypeScript
module references, including static imports, exports, dynamic imports,
relative paths, and repository aliases. A violation exits non-zero and reports
the rule identifier, file, and offending reference.
