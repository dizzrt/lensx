# Plugin Developer CLI

## Scope

`@lensx/plugin-cli` is the public Node 24 authoring package for lensX plugins.
Its `lensx-plugin` bin supports `create`, `build`, `validate`, `pack`, and
`inspect` in local terminals and CI. The package is validated as a real
tarball, but this repository does not publish it to npm yet.

The CLI does not require a running Host, Tauri, Rust, a lensX checkout, or root
`node_modules`. It is not a plugin Runtime dependency, and its package-format
modules are internal rather than public JavaScript APIs.

## Command Surface

```bash
lensx-plugin create <target> --template <framework-neutral|react-semi> --plugin-id <id> --name <name>
lensx-plugin build [--project <dir>]
lensx-plugin validate [--project <dir>]
lensx-plugin pack [--project <dir>] [--output <file>] [--no-build]
lensx-plugin inspect <file>
```

Every command also accepts `--json` and `--locale <en-US|zh-CN>`. `--help` and
`--version` return success. Project commands use the current directory unless
`--project` is explicit; they never search parent directories.

## Side Effects And Project Contract

`create` writes one new project transactionally. `build` executes the
project's explicit `pnpm run build`. Default `pack` executes that build and
writes one `.lxp`; `pack --no-build` writes the package without executing
project code. `validate` and `inspect` are read-only.

Projects must declare `pnpm@11`, ordinary SemVer dependencies, and meaningful
`build`, `typecheck`, `test`, and `check` scripts. The build must produce a
self-contained `dist/manifest.json` and all referenced resources. The CLI
rejects recursive CLI build scripts, Host-private imports, Tauri imports,
undeclared public imports, symlinks, special files, non-portable/colliding
paths, and protocol size/count violations.

## Create

`create` packages byte-checked snapshots of the two canonical
`examples/plugins/*` projects. It replaces only the validated project name,
package name, plugin ID, and matching display/test placeholders, then reruns
the Manifest Contract. It does not access the network, install dependencies,
initialize Git, run project code, or overwrite a non-empty target.

Files are written to a unique sibling staging directory and committed with an
atomic rename only after complete validation. Failure and interruption remove
staging data. The generated project requests no permissions.

## Build And Validate

`build` validates package metadata before spawning `pnpm` with an argument
array and no shell command composition. Human mode streams author-owned build
logs. JSON mode captures a bounded summary so child output cannot corrupt the
single JSON document. A non-zero exit, signal, or missing/empty
`dist/manifest.json` is an operational failure.

`validate` never runs build. It validates metadata/imports, walks the existing
`dist/` without following links, validates the Manifest and resources, and
performs canonical pack plus self-inspection entirely in memory. It keeps
`compatible`, `incompatible`, and `invalid` distinct and does not modify the
project or artifact directory.

## Pack And Inspect

Default `pack` runs `build -> validate -> canonical pack -> self-inspect`.
`--no-build` skips only the first stage. The default output is
`artifacts/<plugin-id>-<version>.lxp`; explicit output cannot be inside
`dist/`. Bytes are written to a unique same-directory temporary file, flushed,
and atomically renamed only after every stage succeeds. Repacking identical
payload bytes produces the same checksums, package bytes, and SHA-256 digest.

The versioned build summary reports Manifest identity, package protocol,
compatibility, file/size facts, whole-package digest, and the caller-form output
path. It does not claim signing, provenance, trust, permission, installation,
or authorization.

`inspect` performs a bounded read-only classification of one `.lxp`. It does
not extract to disk, install, execute payload code, change Plugin Manager,
grant permissions, or create a Runtime Session. Invalid results suppress
partial Manifest, file, and digest facts.

## Output And Exit Codes

Human output defaults to `en-US` and supports `zh-CN` through package-local
message catalogs. JSON output is locale-independent and exactly one schema
version `1` document:

```json
{"schema_version":"1","command":"validate","status":"compatible","result":{},"diagnostics":[]}
```

Diagnostics use stable code, bounded path, message key, and structured
arguments. They exclude absolute Host paths, file contents, raw errors, stacks,
environment secrets, nonces, and grants. Exit codes are `0` for success or
compatible, `1` for invalid/incompatible, `2` for usage or unsupported project
configuration, and `3` for controlled build/I/O failures.

## Host Authority And Current Limits

CLI acceptance means package content is compatible with current public
contracts. The Host independently re-reads and revalidates untrusted bytes and
may still reject source identity races, storage failures, conflicts, Manager
state, or lifecycle conditions without changing content classification.

Development Mode, watch/reload, installation, enable/disable, permissions,
signing, provenance, remote publishing, registry release automation, and
automatic updates are outside this CLI version.

## Validation

Run the focused package and complete external-consumer gates:

```bash
pnpm --dir packages/plugin-cli run check
pnpm --dir packages/plugin-cli run test:pack
pnpm run check:plugin-developer-cli
```

The root gate packs Contract, SDK, UI, Testkit, and CLI tarballs; installs them
in system temporary consumers with the machine-configured global pnpm store;
generates both templates; runs install, test, typecheck, build, validate,
repeat pack, and inspect; audits lockfiles and module realpaths; and passes both
packages to the Rust inspector and installer preparation boundary.
