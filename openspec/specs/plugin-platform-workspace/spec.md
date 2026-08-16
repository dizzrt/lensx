# Plugin Platform Workspace Specification

## Purpose

Define the repository workspace topology, dependency boundaries, aggregate lifecycle commands, and enforceable checks that prepare lensX for public packages and plugins without changing shipped product behavior or granting plugin Runtime capabilities.

## Requirements

### Requirement: The repository must provide an explicit plugin-platform workspace topology

The repository MUST keep the root lensX application as the private workspace root and MUST recognize direct child directories containing package manifests under `packages/*`, `plugins/*`, and `examples/plugins/*` as supported workspace members. Every direct `plugins/*` member MUST be a product official plugin; non-official examples MUST remain under `examples/plugins/*`, and release fixtures MUST NOT enter product `plugins/*`. This topology MUST NOT require moving the root application to `apps/desktop`, and it MUST NOT implicitly include packages in other locations or at deeper nesting levels.

#### Scenario: Recognize a member in a supported location

- **WHEN** a package with a valid package manifest is a direct child of one of the three supported member patterns
- **THEN** pnpm recognizes that package as a workspace member
- **THEN** the root lensX application continues to operate as the private workspace root

#### Scenario: Recognize a direct official plugin member

- **WHEN** a product plugin package is located at `plugins/<slug>`
- **THEN** workspace lifecycle and boundary checks classify it as an official plugin member
- **THEN** that classification grants no Host import, Tauri, Runtime, permission, signature or trust exception

#### Scenario: Empty member areas do not affect the root application

- **WHEN** one or more supported member areas do not yet contain a package
- **THEN** workspace installation and root application commands continue to succeed
- **THEN** the system does not create or publish public packages merely to populate those areas

#### Scenario: Do not include an undeclared location

- **WHEN** a package is outside the supported member patterns or nested more deeply within them
- **THEN** the pnpm workspace does not include it merely because it is inside the repository

#### Scenario: Nested official directory is no longer a member area

- **WHEN** a package is located under the legacy `plugins/official/<slug>` hierarchy
- **THEN** the new workspace topology does not recognize it as a direct official plugin member
- **THEN** maintainers MUST migrate the product plugin to `plugins/<slug>` instead of retaining both discovery rules

### Requirement: Workspace members must obey one-way public dependency boundaries

The root Host application MUST be able to consume public workspace packages through declared package dependencies. Public packages, official plugins, and example plugins MUST NOT depend on the private root package, `src/app/**`, Host Tauri adapters, or internal root style entry points. Plugin source MUST NOT depend on `@tauri-apps/*`. A workspace member consuming another member MUST use the dependency's declared package name and public exports and MUST NOT import its source through a cross-member relative path. Official plugins MUST obey the same boundaries as example plugins.

#### Scenario: Establish an allowed dependency through a public package export

- **WHEN** the root Host, an official plugin, or an example plugin declares a package dependency and imports a module through a public package export
- **THEN** the workspace dependency check accepts the dependency

#### Scenario: A plugin attempts to import a private Host module

- **WHEN** an official plugin or example plugin references a private root application module through a relative path, repository alias, or package declaration
- **THEN** the workspace dependency check rejects the reference
- **THEN** an official plugin receives no exception merely because it resides in the same repository

#### Scenario: A plugin attempts to import a Tauri capability

- **WHEN** an official plugin or example plugin imports `@tauri-apps/*` or a Host Tauri adapter
- **THEN** the workspace dependency check rejects the import

#### Scenario: A member bypasses another member's public entry point

- **WHEN** a workspace member imports another member's source through a relative path
- **THEN** the workspace dependency check rejects the import
- **THEN** the consumer must use the dependency's declared package name and public export

### Requirement: Dependency boundaries must be enforced by a deterministic repository check

The repository MUST provide a dependency-boundary check runnable from the root and MUST include it in the standard root `check` command. The check MUST cover workspace member locations, required lifecycle scripts, package dependencies, and source module references. A violation MUST cause a non-zero exit status and MUST produce deterministic diagnostics sufficient to identify the violating file, reference, and rule. The repository MUST use valid and invalid fixtures to test allowed and prohibited boundaries automatically.

#### Scenario: A valid dependency graph passes the check

- **WHEN** workspace manifests, source references, and lifecycle scripts all satisfy the boundary rules
- **THEN** the root dependency-boundary check succeeds
- **THEN** the standard root `check` command can continue with its remaining checks

#### Scenario: An invalid dependency causes the check to fail

- **WHEN** a fixture or actual workspace member contains a prohibited package dependency or source reference
- **THEN** the boundary check returns a non-zero status
- **THEN** the diagnostics identify the violating file, reference, and stable rule identifier

#### Scenario: Every boundary category has regression coverage

- **WHEN** the boundary-check tests run
- **THEN** a fixture using a valid public import is accepted
- **THEN** negative fixtures for a private Host import, a Tauri import, and a cross-member relative source import are each rejected

### Requirement: Standard root commands must fully validate all workspace members

The root `build`, `typecheck`, `test`, and `check` commands MUST each execute the corresponding lifecycle script for the root application and every actual workspace member. Every member MUST declare all four scripts, and aggregate commands MUST NOT silently skip a member with a missing script. A root application or member command failure MUST cause the aggregate command to return a non-zero status. The root application's `dev`, `preview`, and Tauri/Rust-specific commands MUST retain their existing purposes.

#### Scenario: An aggregate command covers the root application and members

- **WHEN** a developer runs any standard lifecycle command from the repository root
- **THEN** the corresponding validation runs for the root application and every workspace member
- **THEN** members execute in a valid workspace dependency order

#### Scenario: A member lacks a lifecycle script

- **WHEN** an actual workspace member omits any required `build`, `typecheck`, `test`, or `check` script
- **THEN** workspace validation returns a non-zero status
- **THEN** the diagnostics identify the member and missing script

#### Scenario: Member validation fails

- **WHEN** the root application or any workspace member's lifecycle script fails
- **THEN** the corresponding standard root command returns a non-zero status
- **THEN** CI does not report partial validation as a complete success

#### Scenario: Validate the root application when no leaf members exist

- **WHEN** none of the three member areas contains an actual package
- **THEN** standard root commands still execute and validate the root application
- **THEN** aggregation does not recursively invoke the root command itself

### Requirement: The workspace foundation must not change delivered product behavior or contracts

After the workspace is introduced, the system MUST preserve the existing React/Rsbuild application entry point, frontend build output, Manifest Schema and validation results, Launcher behavior, and Tauri/Rust commands and Runtime behavior. The foundation MUST NOT declare or publish a public plugin package and MUST NOT give the static Manifest installation, registration, or execution capabilities.

#### Scenario: The root application continues to pass complete validation

- **WHEN** the workspace migration is complete and the existing frontend and Rust validation suites run
- **THEN** root application tests, type checking, formatting and static checks, frontend build, Rust formatting check, Rust tests, and Rust static checks all pass

#### Scenario: The static Manifest does not gain Runtime capabilities

- **WHEN** the workspace foundation has been established
- **THEN** Manifest validation continues to perform only the existing structure, semantic, normalization, and compatibility processing
- **THEN** the system does not thereby discover, install, register, or execute plugins

### Requirement: Workspace conventions must have bilingual engineering documentation

The repository MUST document the workspace layout, standard root commands, member onboarding requirements, and dependency direction in the appropriate canonical English engineering documentation and MUST provide a semantically aligned Simplified Chinese mirror at the same relative path under `docs/zh/`. The documentation MUST clearly distinguish the workspace foundation from plugin Runtime capabilities that have not been implemented.

#### Scenario: A developer consults the workspace conventions

- **WHEN** a developer looks up plugin-workspace onboarding in the English or Simplified Chinese engineering documentation
- **THEN** the documentation describes supported member locations, the four required lifecycle scripts, allowed dependency directions, and prohibited Host and Tauri imports
- **THEN** neither language describes workspace configuration as delivered plugin Runtime capability
