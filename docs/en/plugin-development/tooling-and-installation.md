# Tooling And Installation

## Prerequisites

Use Node `>=24 <25`, pnpm `>=11 <12`, a lensX build that produced real public
package tarballs, and a supported macOS Host. The public packages are not
published to npm. Tarball overrides in the repository gate prove isolated
consumption; they are not a public download or registry promise.

Keep the plugin in its own project. Its lockfile and resolved modules must not
point to the lensX checkout, its root modules, a workspace protocol, or a local
source link.

## CLI workflow

`lensx-plugin create` writes one maintained template without installing
dependencies. `build` runs only the declared project build. `validate` reads
the existing project and `dist/` without building or writing an artifact.
`pack` composes build, validation, canonical packaging, and self-inspection;
`--no-build` skips only build. `inspect` classifies an existing `.lxp` without
installing it.

```sh verify=command id=cli-lifecycle
lensx-plugin --help
lensx-plugin create ./my-plugin --template framework-neutral --plugin-id com.example.my-plugin --name MyPlugin
pnpm install
pnpm run test
pnpm run typecheck
pnpm run build
lensx-plugin validate --project ./my-plugin
lensx-plugin pack --project ./my-plugin
lensx-plugin inspect ./my-plugin/artifacts/com.example.my-plugin-0.1.0.lxp
```

`valid`, `incompatible`, and `invalid` are different outcomes. A compatible CLI
result proves public payload acceptance only. The Host rechecks selected bytes
before installation and remains the authority for source, compatibility,
registration, grants, and Runtime state.

## Development Mode

Development Mode requires a dedicated build and explicit process opt-in. From
the lensX checkout used to build the Host:

```sh verify=command id=development-host
pnpm run dev:plugin-development-mode
```

Build the plugin, then use Settings to register its self-contained `dist/`.
The native folder selection does not expose the selected path to plugin code.
The Host verifies and copies an immutable process-local generation. After a
new build, choose manual reload. Reload always creates a fresh generation and
Runtime attempt, even when bytes are unchanged; a failed reload preserves the
previous current generation.

There is no watch, HMR, automatic reload, persistent development registration,
or looser permission mode. Removing a development registration does not
uninstall a formal package or clear plugin data.

## Local installation

Use `pack` to produce the canonical `.lxp`, inspect it, then choose **Install
from file** in Settings. The Host prepares the exact selected bytes, displays
the unverified publisher and requested permissions, accepts an explicit user
decision, and commits only that prepared candidate. Installation begins with
no grants; selected sensitive permissions are applied afterward through the
Host permission service.

Cancellation before commit creates no registration. A post-commit permission
failure can leave the package installed with a narrower actual grant set; the
UI reports that partial result rather than pretending to roll back or replay
the selection.

## Boundary comparison

| Property | Development Mode | Local `.lxp` installation |
| --- | --- | --- |
| Input | Self-contained `dist/` directory | Canonical package bytes |
| Source | `development` | `external` |
| Lifetime | Process-local | Persisted and manageable |
| Refresh | Explicit manual reload | Explicit replacement workflow |
| Package installed | No | Yes |
| Grants | Process-local current facts | Persisted Host grant snapshot |
| Runtime security | Same production boundaries | Same production boundaries |

For lifecycle and permission details, read
[Runtime, permissions, and security](runtime-permissions-security.md). For
classification failures, use [Compatibility and errors](compatibility-and-errors.md).

