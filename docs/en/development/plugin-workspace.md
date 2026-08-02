# Plugin Workspace

## Scope

The repository is a pnpm workspace that keeps the `lensx` React/Tauri Host as
the private root package. The workspace establishes development topology,
lifecycle aggregation, and dependency checks for future public packages and
plugins. It does not publish a Plugin Contract, SDK, UI library, Testkit, or
CLI, and it does not discover, install, register, or execute plugins.

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
workspace member. The static example at `examples/plugin-manifest-v0` remains
ordinary project data and is not a package.

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
