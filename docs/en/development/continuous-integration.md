# Continuous Integration

## Supported Workflows

The repository has exactly two GitHub Actions workflows, both read-only and
macOS-only:

- `lensx-ci.yml` validates the LensX frontend and Rust desktop workspace.
- `plugins-ci.yml` validates every direct plugin under `plugins/*`.

Both workflows use `contents: read`, pin third-party actions to complete commit
SHAs, and cancel superseded runs for the same workflow and ref. They do not use
publishing environments or secrets and cannot create version pull requests,
release candidates, uploaded release artifacts, tags, or GitHub Releases.

## Trigger Matrix

| Pull request or `main` push | LensX CI | Plugins CI |
| --- | --- | --- |
| Only `plugins/**` changes | Skipped | Runs |
| A non-plugin path changes | Runs | Skipped |
| Plugin and non-plugin paths both change | Runs | Runs |
| `.github/workflows/plugins-ci.yml` changes | Runs | Runs |

LensX CI uses `paths-ignore: [plugins/**]`. Plugins CI uses `paths` for
`plugins/**` and its own workflow file. A `packages/*`-only change therefore
runs LensX CI but does not independently run Plugins CI.

## LensX CI

The frontend job runs formatting/static analysis, TypeScript checks, unit
tests, and the production build. The Rust job runs formatting, workspace tests,
static checks, and a workspace build. Reproduce them locally on macOS with:

```bash
pnpm run ci:lensx:frontend
pnpm run ci:lensx:rust
```

Run both sequentially with:

```bash
pnpm run ci:lensx
```

These commands are LensX-only. The standard root `build`, `typecheck`, `test`,
and `check` commands retain their repository-wide lifecycle semantics.

## Plugins CI

Any matching plugin change validates every direct `plugins/*` member rather
than only the changed member. Reproduce the complete entry point with:

```bash
pnpm run ci:plugins
```

The entry point discovers direct plugins, computes their transitive public
`packages/*` dependencies, builds those packages in topological order, and only
then runs each plugin's `typecheck`, `test`, `check`, `build`, and `test:e2e`
scripts. A declared `visual` script also runs as a blocking stage. If no direct
plugins exist, the command reports a successful no-op.

Dependency preparation never trusts pre-existing `dist` directories and does
not add source aliases. Plugins continue to consume only declared public
package exports, never Host or Tauri private source.

Visual validation is headless and windowless. Each browser attempt uses a fresh
temporary profile. The preview process receives a graceful termination request
first, uses forced termination only after a bounded timeout, and deletes the
temporary profile on success or failure.

## Policy And Failure Recovery

Validate the workflow inventory, triggers, permissions, runner selection,
pinned actions, required entry points, and absence of publishing authority with:

```bash
pnpm run check:ci-workflows
```

When a stage fails, fix the cause, rerun that stage, and then rerun its complete
CI entry point. Browser-backed stages must run in an approved macOS execution
context with a fresh profile; a sandbox-only browser failure is an environment
failure and must be retried unchanged rather than skipped or weakened.

The repository currently supports CI only on macOS. It intentionally provides
no automatic versioning or publishing workflow. If branch protection still
requires a removed check name, update the repository setting to the stable job
names from LensX CI and Plugins CI.
