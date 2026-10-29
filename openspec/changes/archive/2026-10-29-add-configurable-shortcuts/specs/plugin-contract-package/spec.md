# Spec Delta

## MODIFIED Requirements

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
- **WHEN** valid input declares a half-open range that excludes the current lensX `0.1.0` or Host API `0.4.0`
- **THEN** the normalizer returns `incompatible` rather than `invalid`, retaining normalized author data and per-dimension compatibility information

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
- **THEN** The current Contract package MUST be `0.4.0`, the Manifest protocol MUST remain `0.4.0`, Host API MUST be `0.4.0`, and the private root application MUST remain `0.1.0`.
- **THEN** Adding Action activation MUST NOT change the `.lxp` package format or private WebView bridge carrier `0.2.0`.

#### Scenario: Inspect compatibility exports on the current Contract

- **WHEN** the current Contract public exports or compatibility behavior are inspected or consumed
- **THEN** The current Contract MUST NOT expose earlier experimental Schemas, symbol aliases, deprecated exports, converters, or implicit compatibility branches.

### Requirement: Public Contract package MUST expose the bounded Host API semantic contract

The `@lensx/plugin-contract` root entry MUST expose the Host API `0.4.0` method, event, and error unions, Schema-generated input types, normalized readonly types, pure unknown-input validators, and an immutable catalog, including the existing HTTP and new Action activation contracts.

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

#### Scenario: Consumer imports independent activation types
- **WHEN** an external no-DOM consumer imports activation request, result, event, or SDK callback parameter types
- **THEN** types and validation come from the same public Contract, and Activation contains only the local actionId, semantic invocationId, and normal/shortcut source
- **THEN** native input, shortcut configuration, RPC request IDs, Session identity, Tauri, and Host internal objects are not exposed
