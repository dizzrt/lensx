# Plugin Workspace

## Scope

The repository is a pnpm workspace that keeps the `lensx` React/Tauri Host as
the private root package. The workspace establishes development topology,
lifecycle aggregation, and dependency checks for public packages and plugins.
It contains the publishable `@lensx/plugin-contract`, `@lensx/plugin-sdk`, and
optional `@lensx/plugin-ui` packages, but repository validation does not
perform a registry publish. The workspace does not yet provide a public
Testkit or CLI, and it does not discover, install, register, or execute
plugins. The SDK and UI packages are development foundations, not a working
iframe Runtime or Host API.

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
`examples/plugin-contract-consumer`, `examples/plugin-sdk-consumer`, and
`examples/plugin-ui-consumer` remain ordinary project data and are not
workspace packages.

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

`packages/plugin-contract` owns the public Manifest Schema, generated
`PluginManifestInput`, normalized types, protocol constants, diagnostics, and
the pure two-stage validation API. Supported imports are limited to:

```text
@lensx/plugin-contract
@lensx/plugin-contract/schema
@lensx/plugin-contract/manifest.schema.json
```

The package owns `ajv` as a direct runtime dependency and uses the existing
TypeScript and Rstest toolchain without React, Semi Design, Tauri, a DOM, Node
filesystem access, or a package bundler in its runtime surface. Generate and
validate the Contract with:

```bash
pnpm run generate:plugin-manifest-types
pnpm run check:plugin-contract
```

The complete check rebuilds generated types, runs package and Host boundary
tests, checks TypeScript/Rust shared fixtures, packs a real tarball, verifies
its file list and exports, and installs it into an isolated consumer for
typecheck and runtime smoke testing.

## Plugin SDK Package

`packages/plugin-sdk` owns the framework-neutral SDK client lifecycle, validated
Runtime context, version compatibility, stable SDK errors, cancellation and
timeout behavior, and the semantic transport interface. Its only supported
import is:

```text
@lensx/plugin-sdk
```

The package has one direct Runtime dependency,
`@lensx/plugin-contract`, and imports `PLUGIN_HOST_API_VERSION` from that
package as the current Host API fact. It exposes its independent
`PLUGIN_SDK_VERSION` and `PLUGIN_SDK_SUPPORTED_HOST_API_RANGE`; it does not
re-export or duplicate the current Host API version.

Use an explicit instance and injected transport:

```ts
import { createPluginSdk, type PluginSdkTransport } from '@lensx/plugin-sdk';

declare const transport: PluginSdkTransport;
const client = createPluginSdk({ transport });
const context = await client.initialize();
await client.dispose();
```

The client has no arbitrary raw Host method call. The transport interface is
for future trusted adapters and tests; it is not an iframe implementation or a
public wire protocol. Package-internal tests use a private fake, while the
public Testkit remains future work.

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
root-only exports, declarations, and Runtime dependency metadata, and installs
both tarballs into an isolated external consumer. That consumer typechecks with
`lib: ["ES2022"]` and no DOM types, runs an ESM lifecycle smoke test, and proves
that an undeclared SDK deep import is rejected. Tests, fixtures, scripts, and
Host-private source are excluded from the tarball.

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
private root `lensx` package or import Host-private paths such as `src/app/**`,
Host Tauri adapters, or internal Host styles. Plugin source and manifests must
not depend on or import `@tauri-apps/*`. Official plugins receive no exception
to these rules.

The package-level direction is Contract -> SDK -> optional UI. The UI package
may consume the SDK public context type, while the framework-neutral SDK must
never depend on or import UI, React, or Semi Design.

The deterministic boundary checker parses package manifests and TypeScript
module references, including static imports, exports, dynamic imports,
relative paths, and repository aliases. A violation exits non-zero and reports
the rule identifier, file, and offending reference.
