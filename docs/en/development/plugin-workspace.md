# Plugin Workspace

## Scope

The repository is a pnpm workspace that keeps the `lensx` React/Tauri Host as
the private root package. The workspace establishes development topology,
lifecycle aggregation, and dependency checks for public packages and plugins.
It contains the publishable `@lensx/plugin-contract` and `@lensx/plugin-sdk`
packages, but repository validation does not perform a registry publish. The
workspace does not yet provide a UI library, public Testkit, or CLI, and it does
not discover, install, register, or execute plugins. The SDK package is a
client/transport foundation, not a working iframe Runtime or Host API.

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
`examples/plugin-contract-consumer` and `examples/plugin-sdk-consumer` remain
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

The deterministic boundary checker parses package manifests and TypeScript
module references, including static imports, exports, dynamic imports,
relative paths, and repository aliases. A violation exits non-zero and reports
the rule identifier, file, and offending reference.
