# Official Plugin Release Pipeline

## Scope And Current Status

The repository ships the maintenance pipeline that independently validates,
versions, builds, and publishes `plugins/official/*` members as canonical
`.lxp` assets. ConfigLens is the first product member, so the real matrix now
validates `plugins/official/config-lens` in addition to committed zero-, one-,
and two-member fixtures. Public Contract, SDK, UI, Testkit, and CLI packages
still are not published to npm.

An official repository location or GitHub Release is not Host authority. The
ordinary local installer still classifies downloaded bytes as `external`,
and applies the same open isolated Runtime, closed Host API, Runtime Session,
and package rules used by any external plugin. Signing,
Marketplace distribution, automatic updates, and Host `official` trust remain
undelivered.

## Directory And Ownership Contract

Each direct `plugins/official/<slug>` workspace member is one release unit and
must provide:

- a unique package name, `private: true`, independent SemVer,
  `packageManager: "pnpm@11.17.0"`, Node `>=24 <25`, and pnpm `>=11 <12`;
- a root `manifest.json` whose `plugin_id` is unique and whose version matches
  `package.json`, plus a matching `dist/manifest.json` after build;
- `CHANGELOG.md`, at least one executable test, and meaningful `build`,
  `typecheck`, `test`, `check`, and `test:e2e` scripts;
- one exact `/plugins/official/<slug>/ <owners...>` entry in
  `.github/CODEOWNERS`.

Wildcard, duplicate, empty, conflicting, or unknown official-plugin owner
entries fail closed. Official plugins may consume only public Contract, SDK,
UI, Testkit, CLI authoring commands, and ordinary frontend dependencies. They
cannot import the private Host, Tauri, workspace deep paths, another plugin's
source, or Host-side copies of their own source. The Host consumes installed
registrations instead of importing `plugins/official/*`.

## Changesets And Version Intent

A release-relevant plugin change includes a Changeset that targets the exact
package with an explicit `patch`, `minor`, or `major` bump:

```md
---
"@lensx/example-official-plugin": patch
---

Describe the user-visible or maintenance change.
```

Path analysis controls the validation set; the Changeset controls release
intent. A plugin-local path selects that plugin. Contract, SDK, UI, Testkit,
CLI, workspace, lockfile, package, installation, Runtime, or
release-infrastructure changes validate all existing official plugins without
inventing bumps. Unrelated changes are an explicit no-op.

The version PR runs `pnpm run version:official-plugins`. Changesets updates
only targeted package versions and CHANGELOGs; the controlled command then
synchronizes only the matching source Manifest and revalidates all metadata.
Official packages remain private and the workflow's publish command is an
explicit npm no-op.

`@changesets/cli@2.31.1` is an exact MIT-licensed development-only dependency.
It declares no Node engine restriction, is exercised here on Node 24 and pnpm
11, and is locked with its transitive dependency graph. It never enters the
frontend bundle, plugin Runtime dependency graph, or public npm output. Version
or transitive changes require another license, compatibility, and supply-chain
review.

## PR, Candidate, And E2E Gates

`official-plugin-pr.yml` runs only for relevant pull-request paths with
`contents: read`, no protected environment, no release secret, and checkout
credentials disabled. It computes an explicit base/head plan and runs:

```bash
pnpm run check:official-plugin-release-pipeline
```

The focused gate checks the contract, CODEOWNERS, Changeset policy, deterministic
planner, canonical candidate/audit schemas, workflow policy, bilingual docs,
workspace boundaries, public CLI/package format, ordinary TypeScript/Rust
installation preparation, open-isolated-Runtime gates, and a temporary two-plugin
dry-run.
Each selected real plugin also enters its own read-only candidate matrix so
shared boundary changes validate every current consumer without granting a
pull request any write path.

For each unreleased member on `main`, a read-only build job runs package
lifecycle scripts and public `lensx-plugin build`, `validate`, repeated
`pack --no-build`, and `inspect`. Both packs must be byte-identical. The same
immutable `.lxp` then passes the Rust inspector, ordinary local-install
preparation, sandbox iframe open, Runtime Session/SDK-ready, Page/Action open,
close/teardown, and the plugin's own `test:e2e`. A failure requires a new
candidate; old bytes are never reused.

ConfigLens additionally runs its four-language corpus, Monaco/package-owned
Worker closure, 28-case visual matrix, direct single-editor replacement and
undo evidence in bounded macOS WKWebView, and the privacy gate. See
[ConfigLens Official Plugin](config-lens.md) for the reviewed runtime
dependencies, budgets, and product boundary.

## Assets, Tags, And Audit Record

One plugin version uses tag `official/<plugin-id>/v<version>` and exactly these
public assets:

```text
<plugin-id>-<version>.lxp
<plugin-id>-<version>.lxp.sha256
<plugin-id>-<version>.release.json
```

The schema version `1` release record is canonical, locale-neutral JSON. It
contains only plugin identity/version, artifact name/size/SHA-256, HTTPS
repository, source commit/ref, workflow run URL, and release tag. It is outside
the `.lxp` and author Manifest. Unknown or authority-like fields such as
`signature`, `official`, `verified`, `permission`, `grant`, or `authorization`
are rejected.

The low-permission build uploads a digest-fixed handoff artifact. The protected
`official-plugin-release` publish job installs no dependencies and executes no
plugin code. It revalidates the complete handoff, creates a draft release,
uploads and reads back all three assets, and only then makes the release public.
It never publishes npm packages or triggers the desktop application release.

## Failure And Retry Rules

An exact existing tag, record, and asset set is an idempotent success. A tag
pointing to another commit, an asset/record mismatch, an unknown asset, a
higher already-published SemVer, or a failed upload/readback stops the plugin
release. Public assets are never overwritten, tags never move, and published
history is never deleted or rolled back. An incomplete draft remains invisible
and can be safely retried after the cause is fixed. Different plugin matrix
entries are independent failure domains.

The committed dry-run uses two temporary plugins outside
`plugins/official/*`; it bumps, builds, packs, inspects, prepares, exercises,
and plans only one while proving the other plugin and root application remain
unchanged. Fixtures are never registered with the product Host or sent to the
GitHub Release API.

## Maintainer Commands

Run from the repository root with the machine-configured global pnpm store:

```bash
pnpm run check:official-plugin-release-contract
pnpm run check:official-plugin-release-boundaries
pnpm run check:official-plugin-release-workflows
pnpm run check:official-plugin-release-docs
pnpm run check:official-plugin-release-dry-run
pnpm run check:official-plugin-release-pipeline
pnpm run version:official-plugins
```

Never pass `--store-dir` at the repository root. Temporary package-consumer and
dry-run installs own their temporary directories and cannot recreate root
`node_modules`.
