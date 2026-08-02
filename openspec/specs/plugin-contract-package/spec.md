# Plugin Contract Package Specification

## Purpose

Define the bounded public package that exposes the lensX plugin Manifest
Schema, generated author-input types, deterministic validation and
normalization APIs, independent version dimensions, and publish-artifact drift
gates without exposing Host-private implementation.

## Requirements

### Requirement: Public Plugin Contract package must expose a bounded author contract

The system MUST provide the independently buildable public workspace package
`@lensx/plugin-contract`. Its root entry MUST expose Manifest and Host API
version constants, Schema-generated author-input types, normalized Manifest
types, compatibility results, stable diagnostics, and pure TypeScript
validation and normalization functions. The package MUST also expose an
importable Schema module and the raw Draft 2020-12 JSON Schema. Paths not
declared in package `exports` MUST NOT be public API.

#### Scenario: Consumer imports supported public entries

- **WHEN** a Host, plugin tool, or external consumer imports only the package
  root or a declared Schema subpath
- **THEN** TypeScript and ESM resolution succeed without access to the private
  root package or `src/app/**`

#### Scenario: Consumer attempts a deep internal import

- **WHEN** a consumer imports an undeclared source, generated, or internal path
- **THEN** package resolution rejects the import
- **THEN** an internal directory does not become public API merely because it
  appears in the packed artifact

### Requirement: Public validation and normalization must form one safe deterministic boundary

`validatePluginManifest` MUST accept unknown author input and return either a
successful validation result or deterministic invalid diagnostics.
`normalizePluginManifest` MUST accept only a successful validation result and
the current LensX and Host API versions, and MUST return a compatible or
incompatible normalized Manifest. The functions MUST NOT mutate input or
depend on React, Semi Design, Tauri, DOM APIs, Node filesystem APIs,
environment variables, or Host-private state.

#### Scenario: Validate and normalize a valid Manifest

- **WHEN** unknown input passes validation and its successful result is
  normalized against current versions
- **THEN** the API applies deterministic trimming and defaults, returns the
  correct compatibility status, and leaves the original input unchanged

#### Scenario: Validation rejects invalid unknown input

- **WHEN** unknown input violates Schema or Manifest semantics
- **THEN** validation returns stable `{code, path, message}` diagnostics sorted
  by JSON Pointer path and code
- **THEN** the caller cannot pass the failed result through the supported
  normalization path

#### Scenario: Normalization rejects an unvalidated value

- **WHEN** a caller passes an ordinary object or forged failure result to
  normalization
- **THEN** the runtime rejects it and the type declaration does not accept raw
  `PluginManifestInput`

#### Scenario: Valid input is outside a compatibility range

- **WHEN** valid input excludes the current LensX or Host API `0.1.0` from a
  declared half-open range
- **THEN** normalization returns `incompatible`, not `invalid`, while retaining
  normalized author data and per-dimension compatibility

### Requirement: Schema and shared fixtures must prevent cross-consumer contract drift

The package-owned Draft 2020-12 JSON Schema MUST be the sole structural source
of truth for author input. The committed TypeScript input type MUST be
deterministically reproducible from it. Package TypeScript, Host consumers,
examples, and Rust MUST use the same package-owned Schema and valid, invalid,
normalized, and incompatible fixtures.

#### Scenario: Generated types match the Schema

- **WHEN** the Schema and committed generated type agree
- **THEN** repeated generation is byte-identical and the drift check succeeds

#### Scenario: Schema changes without regenerated types

- **WHEN** the Schema changes while generated output is missing or stale
- **THEN** the Contract gate exits non-zero
- **THEN** CI does not accept or publish the drifted package

#### Scenario: TypeScript and Rust consume a shared fixture

- **WHEN** both implementations read the same fixture and current versions
- **THEN** validity, compatibility, normalized output, and diagnostic code/path
  agree

### Requirement: Plugin platform versions must begin at 0.1.0 and evolve independently

The initial package version, `PLUGIN_MANIFEST_VERSION`,
`PLUGIN_HOST_API_VERSION`, and private root `lensx` package version MUST each
be `0.1.0`. Package implementation, Manifest wire format, Host API protocol,
and application versions MUST evolve independently. The current contract MUST
NOT expose an earlier experimental Schema, symbol alias, deprecated export,
converter, or compatibility branch.

#### Scenario: Package implementation receives a patch release

- **WHEN** implementation changes without changing public API or either wire
  protocol
- **THEN** the package patch may increase while Manifest and Host API versions
  remain unchanged

#### Scenario: A public breaking change occurs before 1.0

- **WHEN** a public export, diagnostic code/path, normalized output, Manifest
  wire format, or Host API protocol changes incompatibly
- **THEN** the corresponding version dimension increases according to the
  documented pre-1.0 SemVer policy

#### Scenario: Consumer looks for an earlier compatibility surface

- **WHEN** a consumer imports an earlier symbol or Schema subpath, or calls a
  migration alias
- **THEN** the package does not provide that entry
- **THEN** current maintained documentation describes only the contract that
  begins at `0.1.0`

### Requirement: Packed artifact must be consumable outside the workspace

The repository MUST verify a real `@lensx/plugin-contract` tarball in an
isolated external consumer. The consumer MUST typecheck and load version
constants, Schema, validation, and normalization through public exports only.
The tarball MUST include runtime JavaScript, declarations, Schema entries, and
necessary metadata, and MUST exclude Host-private source, tests, fixtures, and
generation scripts.

#### Scenario: External consumer uses the packed package

- **WHEN** the isolated consumer installs the real tarball
- **THEN** public imports typecheck and a minimal validation and normalization
  runtime call succeeds

#### Scenario: Required artifact is missing from the tarball

- **WHEN** a declaration, runtime entry, or public Schema target is absent
- **THEN** the pack smoke test exits non-zero
- **THEN** the package is not considered publishable

#### Scenario: Private material leaks into the tarball

- **WHEN** the packed file list contains Host source, tests, or fixtures
- **THEN** package contents validation exits non-zero
- **THEN** CI blocks that publish artifact

### Requirement: Contract package must participate in complete workspace validation

The Contract package MUST declare meaningful `build`, `typecheck`, `test`, and
`check` scripts. Root lifecycle commands MUST run the corresponding package
script and propagate failures. The canonical Contract gate MUST compose
generated-type drift, package tests, Host boundaries, the tarball consumer,
and Rust shared fixtures without retaining a second Host-owned public
implementation.

#### Scenario: Repository-wide validation includes the Contract package

- **WHEN** a developer runs a standard root lifecycle command
- **THEN** the corresponding Contract package script runs and any failure is
  propagated

#### Scenario: Host consumes the public contract

- **WHEN** Host build, typecheck, or Manifest boundary tests run
- **THEN** Host code imports only `@lensx/plugin-contract` public exports and
  does not retain a duplicate public implementation
