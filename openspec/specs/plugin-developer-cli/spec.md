# Plugin Developer CLI Specification

## Purpose

Define the public plugin developer CLI command surface, project lifecycle,
canonical packaging and inspection behavior, deterministic diagnostics, Host
content-classification agreement, and isolated external-consumer validation.

## Requirements

### Requirement: Public Plugin Developer CLI MUST expose a bounded and portable command surface

The system MUST provide an independently packageable public
`@lensx/plugin-cli` package and `lensx-plugin` executable that expose `create`,
`build`, `validate`, `pack`, `inspect`, `--help`, and `--version`. The CLI MUST
run across supported desktop platforms within its declared Node and pnpm
version ranges, MUST NOT require a lensX checkout, root `node_modules`, Tauri,
the Rust toolchain, or a running Host, and MUST NOT expose undeclared codec deep
paths as public APIs.

#### Scenario: External consumer invokes every supported command

- **WHEN** a temporary consumer outside the repository installs only the CLI
  and its declared dependencies from real package tarballs
- **THEN** `--help` and `--version` succeed, and all five commands can be parsed
  and executed
- **THEN** module resolution, the bin entry, and runtime files do not link back
  to the lensX checkout or root `node_modules`

#### Scenario: Consumer imports an internal codec path

- **WHEN** an external project attempts to import an internal package-format
  module that is not declared in the `@lensx/plugin-cli` exports
- **THEN** module resolution fails
- **THEN** a plugin cannot treat the CLI's internal codec as a plugin Runtime
  API

### Requirement: Create MUST generate one of the maintained project templates without external side effects

`create` MUST require an explicit target directory, a
`framework-neutral | react-semi` template, a valid plugin ID, and a project
name, and MUST generate the project from validated assets packaged in the CLI
tarball and kept aligned with the Task 6.3 canonical examples. The generated
project MUST use only public lensX packages and ordinary publishable
dependencies, MUST pass Contract validation, and the command MUST NOT download
dependencies, initialize Git, install the plugin, or run the plugin.

#### Scenario: Create a framework-neutral project

- **WHEN** a developer runs `create` for a nonexistent target directory and
  selects `framework-neutral`
- **THEN** the CLI generates a complete project with a Manifest, Page, Action,
  build/typecheck/test/check lifecycles, and a permissionless Runtime example
- **THEN** the project contains no React, Semi Design, Plugin UI, Host-private
  import, or workspace/file/link dependency

#### Scenario: Create a React/Semi project

- **WHEN** a developer runs `create` and selects `react-semi`
- **THEN** the CLI generates a complete project whose plugin package directly
  owns React, React DOM, Semi Design, and Plugin UI
- **THEN** the generated project uses the same public Runtime, locale, theme,
  and testing boundaries as the canonical React/Semi example

#### Scenario: Target or substitution is unsafe

- **WHEN** the target directory is nonempty, the plugin ID is invalid, the name
  cannot be substituted safely, or the generated result fails the Contract
- **THEN** the CLI fails with deterministic diagnostics and does not overwrite
  any existing file
- **THEN** staging content is removed without leaving an apparently successful
  partially generated project

### Requirement: Build MUST execute only the explicit supported project lifecycle

`build` MUST resolve one plugin project from an explicit `--project` or the
current working directory, MUST validate package metadata, a supported pnpm
package manager, and a nonrecursive `build` script, and MUST then execute that
script from the project root using an argument array without shell command
composition. A successful result MUST contain a self-contained
`dist/manifest.json` and all referenced resources. The CLI MUST classify a
missing script, failed process, or missing output as a controlled failure.

#### Scenario: Build a generated project

- **WHEN** a generated project's dependencies are installed and a developer
  runs `build`
- **THEN** the CLI executes the project's declared build lifecycle and
  successfully produces a self-contained `dist/`
- **THEN** the build summary does not misrepresent script execution as
  validation or Host installation

#### Scenario: Build configuration is absent or recursive

- **WHEN** package metadata lacks a build script, declares an unsupported
  package manager, or the build script directly recurses into the same CLI
  build command
- **THEN** the CLI fails with usage or configuration diagnostics before
  executing project code
- **THEN** no `.lxp` is created or modified

#### Scenario: Project build fails

- **WHEN** the project build process exits nonzero or does not produce the
  required `dist/`
- **THEN** the CLI returns a controlled operational failure and a bounded log
  summary
- **THEN** JSON output is not contaminated by arbitrary child-process stdout,
  a stack trace, or a raw error

### Requirement: Validate MUST provide a read-only project and payload gate

Without executing a build script, writing an `.lxp`, or modifying the project,
`validate` MUST check project metadata, public dependency and import
boundaries, the Manifest Contract, ordinary files and portable paths in the
existing `dist/`, resource completeness, and compatibility with the current
versions. It MUST use canonical pack and inspect rules in memory to prove that
the payload can be packaged and MUST clearly distinguish `valid compatible`,
`invalid`, and `incompatible`.

#### Scenario: Validate a complete compatible build

- **WHEN** the project and existing `dist/` satisfy public boundaries,
  Manifest, resource, path, limit, and current Host compatibility requirements
- **THEN** `validate` succeeds and reports `compatible`
- **THEN** project files, `dist/`, and the artifact directory remain
  byte-for-byte unchanged

#### Scenario: Build output is missing or empty

- **WHEN** the project has no `dist/`, `dist/` is empty, or
  `dist/manifest.json` is missing
- **THEN** `validate` fails with deterministic diagnostics
- **THEN** the CLI does not implicitly run build, guess another output
  directory, or generate an empty package

#### Scenario: Payload contains an unsafe file or unresolved resource

- **WHEN** `dist/` contains a symlink, special file, invalid or colliding path,
  oversized file, or a resource that is referenced by the Manifest but absent
- **THEN** `validate` fails before reading or following the unauthorized target
- **THEN** diagnostics do not expose an absolute path, file contents, or
  partially trusted Manifest facts

#### Scenario: Manifest is valid but incompatible

- **WHEN** the Manifest structure and resources are valid but the lensX or Host
  API range does not include the current version
- **THEN** `validate` returns `incompatible` rather than `invalid`
- **THEN** CI receives a deterministic nonzero exit status and the project is
  not modified

### Requirement: Pack MUST create a canonical reproducible package transactionally

By default, `pack` MUST compose build, validate, canonical pack, and
self-inspect; `--no-build` MUST skip build and no other stage. The command MUST
generate the canonical checksums and `.lxp` required by package protocol
`0.1.0` from a validated `dist/`, MUST reject an output location inside the
payload, and MUST prevent partial output through a temporary file in the target
directory, flush, and atomic commit. Repeatedly packing the same payload MUST
produce byte-for-byte identical `.lxp` files and whole-package SHA-256 digests.

#### Scenario: Pack a generated project with one command

- **WHEN** a new project with installed dependencies runs default `pack`
- **THEN** the CLI completes build, validate, pack, and self-inspect in order
  and writes the `.lxp` only after all stages succeed
- **THEN** the result contains a versioned build summary with the plugin ID,
  Manifest version, package protocol, compatibility, file count, sizes,
  digest, and output location

#### Scenario: Pack an existing build without executing code

- **WHEN** CI has completed the build in isolation and runs `pack --no-build`
- **THEN** the CLI runs only read-only validation, canonical pack, and
  self-inspect
- **THEN** the project lifecycle is not executed again

#### Scenario: Packing fails before commit

- **WHEN** validation, encoding, self-inspection, flush, or output commit fails
- **THEN** the CLI returns a failure and does not expose temporary bytes as a
  successful `.lxp`
- **THEN** an existing target is replaced only if every stage of this command
  succeeds, and no other artifact is deleted

#### Scenario: Same payload is packed twice

- **WHEN** file paths and bytes are identical but source filesystem enumeration
  order, mtimes, owners, or modes differ
- **THEN** both `.lxp` byte sequences, checksums, build-summary content facts,
  and digests are identical
- **THEN** source metadata does not enter the canonical package

### Requirement: Inspect MUST classify an existing package without installation or execution

`inspect` MUST perform read-only inspection of an `.lxp` within package-format
size limits, MUST return `compatible | incompatible | invalid`, a safe
normalized Manifest `0.2.0` and compatibility result, and permitted package
facts, and MUST NOT extract to the filesystem, invoke the Host installer,
change Plugin Manager, create a permission or grant, create Host authority,
create a Runtime Session, or execute the payload.

#### Scenario: Inspect a compatible package

- **WHEN** a developer inspects a canonical and currently compatible `.lxp`
- **THEN** the CLI returns `compatible`, the whole-package digest, protocol
  version, file and size facts, and a safe Manifest summary
- **THEN** no installation directory, registration record, or Runtime state is
  created

#### Scenario: Inspect an invalid or incompatible package

- **WHEN** package bytes are noncanonical, checksums are incorrect, a resource
  is missing, or the package is only outside the current compatibility range
- **THEN** the CLI returns `invalid` or `incompatible`, respectively, without
  merging the two states
- **THEN** an invalid result returns no partial Manifest, file map, or trusted
  digest fact

#### Scenario: Package read exceeds the authorized bound

- **WHEN** the input file size, streamed decompression output, or any internal
  resource exceeds a package-protocol limit
- **THEN** `inspect` stops early and returns a safe diagnostic
- **THEN** it does not preallocate unbounded memory based on an untrusted claim

### Requirement: Human and machine output MUST be deterministic, safe, and automation-ready

Every command MUST support human output and `--json`. Human output MUST default
to `en-US` and support explicit `zh-CN`, and CLI-owned copy MUST come from
semantically aligned message catalogs. JSON MUST be independent of locale and
MUST emit exactly one document containing `schema_version`, `command`,
`status`, `result`, and sorted, deduplicated `diagnostics`. A diagnostic MUST
use a stable code, bounded path, message key, and structured arguments, and
MUST NOT contain an absolute Host path, file contents, stack trace, nonce,
grant, environment secret, or raw error.

#### Scenario: CI requests JSON for success and failure

- **WHEN** CI invokes any command with `--json` for a success, invalid result,
  incompatible result, usage error, or operational failure
- **THEN** stdout is one parseable schema-version-`1` JSON document without
  progress text or child-process output
- **THEN** identical input produces identical status, result facts, diagnostic
  ordering, and exit code

#### Scenario: Developer selects Simplified Chinese human output

- **WHEN** a developer runs a command with `--locale zh-CN` without requesting
  JSON
- **THEN** the CLI uses Simplified Chinese copy that is semantically aligned
  with the English message keys
- **THEN** diagnostic code, path, compatibility, and exit code do not change
  with locale

#### Scenario: Exit codes distinguish failure classes

- **WHEN** commands respectively succeed as compatible, return a deterministic
  invalid or incompatible result, encounter a usage or configuration error, or
  encounter a controlled build or I/O failure
- **THEN** the process respectively returns `0`, `1`, `2`, or `3`
- **THEN** `--help` and `--version` return `0`

### Requirement: CLI and Host MUST agree on package-content classification while preserving Host-private authority

For the same package bytes, current lensX and Host API versions, and committed
corpus, the CLI TypeScript inspector and Host Rust inspector MUST return the
same three-state status, normalized Manifest, compatibility, file facts,
whole-package digest, and sorted diagnostic codes and paths. The Host installer
MUST continue to revalidate untrusted bytes independently and MAY additionally
reject them because of Host-private conditions such as source file identity,
races, installation storage, Manager state, or lifecycle state. A CLI result
MUST NOT claim installation authorization, source trust, signature status, or
Host authority.

#### Scenario: Shared corpus is evaluated in both languages

- **WHEN** valid, invalid, incompatible, oversized, and reproducible fixtures
  are evaluated by both the CLI and Rust inspector
- **THEN** both agree exactly on content semantics and safe facts
- **THEN** localized message text is not treated as a cross-language wire
  contract

#### Scenario: CLI accepts content but Host source checks fail

- **WHEN** `.lxp` content is compatible but the Host detects source
  replacement, a file identity change, unavailable storage, or conflicting
  Manager state
- **THEN** the Host can reject installation without changing package-content
  classification
- **THEN** CLI success means only that content is compatible, not that it is
  trusted, authorized, or promised to be installable

### Requirement: Public tarball validation MUST prove isolated end-to-end consumption

The system MUST provide a CLI package gate and root aggregate gate that verify
metadata, license, bin and exports, template assets, the exact allowed-file
set, dependencies, and size limits. In system temporary directories, the gates
MUST use real public package tarballs to run create, dependency installation,
build, validate, two packs, inspect, and Rust preparation for both project
types. Validation MUST audit dependency resolution and artifacts to prevent
links from a consumer or tarball back to the checkout or root `node_modules`,
Host-private source, a fixture generator, or an absolute path.

#### Scenario: Both templates complete the external CLI workflow

- **WHEN** clean temporary consumers run the full CLI workflow with the
  framework-neutral and React/Semi templates, respectively
- **THEN** each independently passes tests, type checking, build, validation,
  reproducible packaging, CLI inspection, and the Rust content and preparation
  boundary
- **THEN** CI completes the author-side gate using only public tarballs and CLI
  commands

#### Scenario: Packaged CLI contains a private or undeclared file

- **WHEN** the CLI tarball contains root `tools/**`, `src-tauri/**`, another
  workspace member's source, a test generator, an undeclared deep entry, or an
  absolute path
- **THEN** the package gate fails
- **THEN** the tarball cannot be treated as a publishable Task 6.4 artifact
