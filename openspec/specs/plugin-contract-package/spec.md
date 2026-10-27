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

`validatePluginManifest` MUST accept unknown author input and return either a successful validation result or deterministic invalid diagnostics. `normalizePluginManifest` MUST accept only a successful validation result and the current LensX and Host API versions, and return a compatible or incompatible normalized Manifest. The functions MUST NOT mutate input or depend on React, Semi Design, Tauri, DOM, Node filesystem, environment variables, or Host-private state.

#### Scenario: Validate and normalize a valid Manifest
- **WHEN** unknown input passes validation and is normalized against current versions
- **THEN** the API applies deterministic trimming and defaults, returns the correct compatibility status, and leaves the original input unchanged

#### Scenario: Validation rejects invalid unknown input
- **WHEN** unknown input violates Schema or Manifest semantics
- **THEN** validation returns stable `{code, path, message}` diagnostics sorted by JSON Pointer path and code
- **THEN** callers cannot normalize a failed result through the supported path

#### Scenario: Normalization rejects an unvalidated value
- **WHEN** a caller passes an ordinary object or forged failure result to the normalizer
- **THEN** the runtime rejects it and the type declaration does not accept raw `PluginManifestInput`

#### Scenario: Valid input is outside a compatibility range
- **WHEN** valid input's half-open range excludes current LensX `0.1.0` or Host API `0.3.0`
- **THEN** the normalizer returns `incompatible` rather than `invalid`, retaining normalized author data and per-dimension compatibility information

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

The package version, `PLUGIN_MANIFEST_VERSION`, `PLUGIN_HOST_API_VERSION`, and private root `lensx` version MUST each begin at `0.1.0` and evolve independently.

#### Scenario: Package implementation receives a patch release
- **WHEN** implementation changes without changing the public API or either wire protocol
- **THEN** the package patch may increase while the Manifest and Host API versions remain unchanged

#### Scenario: A public breaking change occurs before 1.0
- **WHEN** public exports, diagnostic codes or paths, normalized output, Manifest wire format, or the Host API protocol change incompatibly
- **THEN** the corresponding version dimension increases according to the maintained pre-1.0 SemVer policy

#### Scenario: Consumer looks for an earlier compatibility surface
- **WHEN** a consumer imports an old symbol or Schema subpath or calls a migration alias
- **THEN** the package provides no such entry
- **THEN** current maintained documentation describes the current independently evolving contracts that each began at `0.1.0` and explicit migration boundaries

#### Scenario: Inspect current independent version dimensions

- **WHEN** a consumer checks current Contract, Manifest, Host API, application, package-format, or bridge versions
- **THEN** The current Contract package MUST be `0.3.0`, the Manifest protocol MUST remain `0.4.0`, the Host API MUST be `0.3.0`, and the private root application MUST remain `0.1.0`.
- **THEN** Adding generic HTTP MUST NOT change the `.lxp` package format or private WebView bridge carrier `0.2.0`.

#### Scenario: Inspect compatibility exports on the current Contract

- **WHEN** the current Contract public exports or compatibility behavior are inspected or consumed
- **THEN** The current Contract MUST NOT expose earlier experimental Schemas, symbol aliases, deprecated exports, converters, or implicit compatibility branches.

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

### Requirement: Public Contract package MUST expose the bounded Host API semantic contract

The `@lensx/plugin-contract` root entry MUST expose Host API `0.3.0` method, event, and error literal unions; Schema-generated params, result, and payload input types; normalized readonly output types; pure unknown-input validators; and an immutable method catalog, including generic `http.request`.

#### Scenario: External consumer imports the Host API contract
- **WHEN** a no-DOM consumer installs the real Contract tarball and imports only the root and declared Host API Schema subpath
- **THEN** TypeScript compilation and ESM runtime validation of every public Host API semantic kind succeed
- **THEN** the consumer does not need lensX source, SDK internals, React, DOM, Tauri, or Rust

#### Scenario: Consumer attempts a private wire import
- **WHEN** a consumer deep-imports an internal generated file, fixture, RPC envelope, or Host Runtime module
- **THEN** package resolution rejects the undeclared path
- **THEN** owning Host API Schema does not make private transport facts public

#### Scenario: Consume public Host API exports

- **WHEN** an external consumer imports Contract Host API declarations or the raw Schema
- **THEN** The declared Host API Schema subpath MUST expose the raw Draft 2020-12 Schema.
- **THEN** Exports MUST reuse `PLUGIN_HOST_API_VERSION` and MUST NOT expose permission unions or catalogs, removed clipboard methods, private RPC envelopes, request IDs, Runtime Session identity, `Window`, `MessagePort`, Host executors, React, Tauri, or Rust implementation values.

### Requirement: Host API Schema, generated types, catalog and shared fixtures MUST remain one fact chain

The package-owned Host API Draft 2020-12 Schemas MUST be the sole structural
source of truth for semantic params, results, events, and errors.

#### Scenario: Host API generated types match their Schemas

- **WHEN** Host API Schemas and committed generated types agree
- **THEN** repeated generation is byte-identical and the Contract drift gate
  succeeds

#### Scenario: Catalog or consumer adds an unrepresented semantic fact

- **WHEN** a method, event, or error appears in a catalog,
  TypeScript or Rust branch, or fixture without the matching Schema fact
- **THEN** generation, exhaustiveness, shared-fixture, or boundary validation
  exits non-zero
- **THEN** the package cannot be published with the split fact

#### Scenario: TypeScript and Rust validate the same Host API fixture

- **WHEN** both consumers read any package-owned valid or invalid Host API
  fixture
- **THEN** method and payload pairing, validity, normalized output, and
  diagnostic code and path agree
- **THEN** Rust validation does not register or invoke a Tauri command

#### Scenario: Generate and consume shared Host API facts

- **WHEN** types, validators, catalogs, or TypeScript and Rust consumers use the package-owned Host API facts
- **THEN** Committed TypeScript input types MUST be generated deterministically from those Schemas; normalized output types, validators, and the catalog MUST agree with the same closed method, event, and error sets.
- **THEN** Package TypeScript, SDK boundary tests, Host consumers, and Rust MUST consume the same package-owned valid and invalid fixtures and MUST agree on validity plus stable diagnostic code and path.
- **THEN** Permission and clipboard facts MUST NOT belong to this current fact chain.

### Requirement: Contract release gates MUST cover Host API exports without weakening Manifest validation

The existing Contract `build`, `typecheck`, `test`, `check`, tarball consumer,
and root lifecycle gates MUST cover Host API generation, Runtime validators,
the catalog, declarations, package contents, and shared Rust fixtures in
addition to all existing Manifest validation and normalization coverage. The
tarball MUST include only declared Runtime JavaScript, declarations, public
Schema entries, and metadata; it MUST exclude tests, fixtures, generation
scripts, and Host-private source.

#### Scenario: Complete Contract gate covers both protocols

- **WHEN** the canonical Contract check runs
- **THEN** Manifest and Host API protocol gates both execute and any failure
  propagates
- **THEN** adding Host API coverage does not remove or weaken existing
  Manifest fixtures, normalization, compatibility, or tarball checks

#### Scenario: Host API release file is missing or private material leaks

- **WHEN** a required declaration, Schema, or Runtime entry is absent, or
  tests, fixtures, generation scripts, or Host source appear in the tarball
- **THEN** package contents or isolated-consumer validation exits non-zero
- **THEN** the artifact is not considered publishable

### Requirement: Contract package MUST publish the WebView Manifest boundary as one fact chain

`@lensx/plugin-contract` MUST continue publishing the Manifest `0.4.0` Schema, generated types, normal and malicious fixtures, validator, and normalizer, preserving the WebView Runtime and existing Page presentation contracts.

#### Scenario: An external consumer installs the packed Contract
- **WHEN** a temporary consumer uses the packed Contract to validate canonical WebView and legacy iframe fixtures
- **THEN** the WebView fixture succeeds and the iframe fixture receives the same stable incompatible result as the Host
- **THEN** no workspace source import or private Runtime declaration is required

#### Scenario: Contract artifacts drift
- **WHEN** Schema, generated types, fixtures, validator, normalizer, or Rust consumers disagree on Runtime kind or protocol version
- **THEN** the contract drift gate fails before publication

#### Scenario: Inspect public WebView Manifest artifacts

- **WHEN** a consumer checks Manifest declarations or packed Contract files after the HTTP extension
- **THEN** Public declarations and packed files MUST NOT retain iframe Runtime authoring types or expose Child WebView, Tauri, bridge, label, origin token, or Host-private Session facts.
- **THEN** The Host HTTP extension MUST NOT add Manifest network permissions, private transport configuration, or direct native entries.
