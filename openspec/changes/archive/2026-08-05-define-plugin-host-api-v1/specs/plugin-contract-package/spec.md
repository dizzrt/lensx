## ADDED Requirements

### Requirement: Public Contract package MUST expose the bounded Host API semantic contract

`@lensx/plugin-contract` root entry MUST expose the Host API method, permission, event and error literal unions; Schema-generated params/result/payload input types; normalized read-only output types; pure unknown-input validators; and an immutable method/permission catalog. A declared Host API Schema subpath MUST expose the raw Draft 2020-12 Schemas. These exports MUST reuse `PLUGIN_HOST_API_VERSION` and MUST NOT expose private RPC envelopes, request IDs, Runtime Session identity, Window/MessagePort, Host executor, React, Tauri or Rust implementation values.

#### Scenario: External consumer imports the Host API contract

- **WHEN** a no-DOM consumer installs the real Contract tarball and imports only the root and declared Host API Schema subpath
- **THEN** TypeScript compilation and ESM Runtime validation of every public Host API semantic kind succeed
- **THEN** the consumer does not need lensX source code, SDK internals, React, DOM, Tauri or Rust

#### Scenario: Consumer attempts a private wire import

- **WHEN** a consumer deep-imports an internal generated file, fixture, RPC envelope or Host Runtime module
- **THEN** package resolution rejects the undeclared path
- **THEN** private transport facts do not become public because the package also owns semantic Host API Schemas

### Requirement: Host API Schema, generated types, catalog and shared fixtures MUST remain one fact chain

The package-owned Host API Draft 2020-12 Schemas MUST be the sole structural source of truth for semantic params, results, events and errors. Committed TypeScript input types MUST be generated deterministically from those Schemas; normalized output types, validators and catalog MUST agree with the same closed method/permission/event/error sets. Package TypeScript, SDK boundary tests, Host consumers and Rust MUST consume the same package-owned valid and invalid fixtures and MUST agree on validity plus stable diagnostic code/path.

#### Scenario: Host API generated types match their Schemas

- **WHEN** Host API Schemas and committed generated types agree
- **THEN** repeated generation is byte-identical and the Contract drift gate succeeds

#### Scenario: Catalog or consumer adds an unrepresented method

- **WHEN** a method, permission, event or error appears in a catalog, TypeScript/Rust branch or fixture without the matching Schema fact
- **THEN** generation, exhaustiveness, shared-fixture or boundary validation exits non-zero
- **THEN** the package cannot be published with the split fact

#### Scenario: TypeScript and Rust validate the same Host API fixture

- **WHEN** both consumers read any package-owned valid or invalid Host API fixture
- **THEN** method/payload pairing, validity, normalized output and diagnostic code/path agree
- **THEN** Rust validation does not register or invoke a Tauri command

### Requirement: Contract release gates MUST cover Host API exports without weakening Manifest validation

The existing Contract `build`, `typecheck`, `test`, `check`, tarball consumer and root lifecycle gates MUST cover Host API generation, runtime validators, catalog, declarations, package contents and shared Rust fixtures in addition to all existing Manifest validation and normalization coverage. The tarball MUST include only declared Runtime JavaScript, declarations, public Schema entries and metadata; it MUST exclude tests, fixtures, generation scripts and Host-private source.

#### Scenario: Complete Contract gate covers both protocols

- **WHEN** the canonical Contract check runs
- **THEN** Manifest and Host API protocol gates both execute and any failure propagates
- **THEN** adding Host API coverage does not remove or weaken existing Manifest fixtures, normalization, compatibility or tarball checks

#### Scenario: Host API release file is missing or private material leaks

- **WHEN** a required declaration/Schema/Runtime entry is absent, or tests, fixtures, generation scripts or Host source appear in the tarball
- **THEN** package contents or isolated-consumer validation exits non-zero
- **THEN** the artifact is not considered publishable
