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
pnpm run gate -- ci-lensx-frontend
pnpm run gate -- ci-lensx-rust
```

Run both sequentially with:

```bash
pnpm run gate -- ci-lensx
```

These commands are LensX-only. The standard root `build`, `typecheck`, `test`,
and `check` commands retain their repository-wide lifecycle semantics.

## Plugins CI

Any matching plugin change validates every direct `plugins/*` member rather
than only the changed member. Reproduce the complete entry point with:

```bash
pnpm run gate -- ci-plugins
```

The entry point discovers direct plugins, computes their transitive public
`packages/*` dependencies, builds those packages in topological order, and only
then runs each plugin's `typecheck`, `test`, `check`, `build`, and `test:e2e`
scripts. `test:e2e` is optional and is accepted only for a deterministic,
post-build pure Node artifact check. Each lifecycle category runs once; a
recursive lifecycle or environment-oriented stage fails policy before execution.
If no direct plugins exist, the command reports a successful no-op.

Dependency preparation never trusts pre-existing `dist` directories and does
not add source aliases. Plugins continue to consume only declared public
package exports, never Host or Tauri private source.

Plugins CI does not launch browsers, real WebViews, GUI applications, Launch
Services, or native interaction harnesses, and it does not maintain screenshots,
pixel baselines, or target-environment performance output.

## Policy And Failure Recovery

Validate the workflow inventory, triggers, permissions, runner selection,
pinned actions, required entry points, and absence of publishing authority with:

```bash
pnpm run gate -- ci-workflows
```

When a stage fails, fix the cause, rerun that stage, and then rerun its complete
CI entry point. There is no optional environment-validation path to skip or
restore after deterministic CI succeeds.

The repository currently supports CI only on macOS. It intentionally provides
no automatic versioning or publishing workflow. If branch protection still
requires a removed check name, update the repository setting to the stable job
names from LensX CI and Plugins CI.
