## ADDED Requirements

### Requirement: Plugin development documentation MUST provide an external-developer-first bilingual information architecture

The system MUST provide the canonical English developer hub under `docs/en/plugin-development/` and a semantically equivalent Simplified Chinese mirror under the identical relative paths in `docs/zh/plugin-development/`. Both top-level documentation indexes MUST link to their language-specific hub. The hub MUST distinguish getting-started tutorials, public package reference, tooling and installation, Host API, Runtime/permissions/security, and compatibility/errors, and MUST identify capabilities as shipped, conditionally available, or not delivered. External documentation MUST NOT require readers to inspect, import, or understand Host-private source, Tauri payloads, private wire formats, internal tool entry points, or workspace-only deep imports.

#### Scenario: A new developer chooses a learning path from either language index
- **WHEN** a developer enters the plugin development documentation from the English or Simplified Chinese top-level index and chooses framework-neutral or React/Semi
- **THEN** that language's hub provides complete relative links from the tutorial to public references, tooling, installation, and troubleshooting, while the other language contains the same relative paths and semantically corresponding sections

#### Scenario: Documentation describes a planned capability as delivered
- **WHEN** the developer hub, a tutorial, or a reference describes an unimplemented, planned-only, public-contract-only, or session-conditional capability as currently and unconditionally available
- **THEN** the documentation coverage gate fails and identifies the drifted capability, document, and status classification

#### Scenario: Bilingual structure or links drift
- **WHEN** English/Chinese document paths, required headings, code, identifiers, relative links, or index entries are missing or inconsistent
- **THEN** the documentation gate fails with deterministic diagnostics that contain no absolute Host paths

### Requirement: Both tutorials MUST independently complete the development loop from create to an installable package

The system MUST provide independently executable framework-neutral and React/Semi tutorials. Each tutorial MUST state the supported Node/pnpm and public tarball prerequisites, use the real `lensx-plugin create` command to create a project outside the repository, and cover dependency installation, Manifest Page/Action/resource declarations, SDK initialization, Testkit tests, typecheck, build, validate, explicit Development Mode register/manual reload, pack, inspect, local installation through Settings, and controlled execution. The tutorials MUST explicitly state that the current public packages are not published to npm, Development Mode does not install an `.lxp`, and CLI acceptance does not grant Host authority. They MUST NOT use the repository root `node_modules`, workspace links, private imports, or automatic permission grants.

#### Scenario: An external developer completes the framework-neutral tutorial
- **WHEN** a developer executes every automatable step outside the lensX repository using the tutorial's real public tarballs and framework-neutral template
- **THEN** the project depends only on the public Contract and SDK entry points plus Testkit for tests, passes test, typecheck, build, validate, repeat pack, and inspect, and produces an `.lxp` accepted by the canonical Host installation preparation boundary

#### Scenario: An external developer completes the React/Semi tutorial
- **WHEN** a developer executes every automatable step outside the lensX repository using the tutorial's real public tarballs and React/Semi template
- **THEN** the project owns its React, React DOM, Semi Design, and optional Plugin UI Runtime dependencies, passes test, typecheck, build, validate, repeat pack, inspect, locale/theme/accessibility validation, and produces an `.lxp` accepted by the canonical Host installation preparation boundary

#### Scenario: A developer chooses fast feedback or formal installation
- **WHEN** a tutorial reader needs to test an already-built, self-contained `dist/` or install a package for persistent management
- **THEN** the documentation directs them respectively to explicit, process-local, manual-reload Development Mode or canonical local `.lxp` installation, and explains how source, persistence, permissions, and restart semantics differ

#### Scenario: The dependency acquisition channel is not publicly published
- **WHEN** the current Contract, SDK, UI, Testkit, or CLI version is not published to the npm registry
- **THEN** the tutorials declare prebuilt real tarballs as an explicit prerequisite and validation input, and MUST NOT invent registry commands, download URLs, publication promises, or private-source fallback paths

### Requirement: The public package reference MUST define stable entry points, responsibilities, and lifecycle boundaries

The system MUST document the public package/version, supported exports, authoring/runtime dependency role, framework dependencies, typical lifecycle, and explicit non-goals for Contract, SDK, optional UI, Testkit, and CLI. The reference MUST use real packed contents, public declarations, package metadata, and stable specifications as its sources of truth. It MUST NOT present a Testkit fake as the Host, the UI package as shared Host React, the CLI as Runtime authority, or Contract validation as installation or authorization.

#### Scenario: A developer chooses the minimum dependency set
- **WHEN** a framework-neutral or React/Semi developer consults the public package reference
- **THEN** the documentation identifies the minimum public dependencies, test-only dependencies, optional UI/style entry points, and CLI authoring boundary without undeclared deep imports or Host-private modules

#### Scenario: A public package export or packed content drifts
- **WHEN** a documented import, bin, version, or package role no longer matches the real tarball, public declaration, or package metadata
- **THEN** the aggregate documentation gate fails instead of letting an external consumer discover the drift late in the tutorial

### Requirement: The Host API reference MUST distinguish public contract, Host provider, and session capability

The system MUST document the method id, request parameters, result, associated permission, stable errors, version semantics, current Host provider condition, and recovery guidance for every method in the public Host API catalog. The documentation MUST make clear that presence in the public contract does not mean the current Host provides a method, and that a composed Host provider does not mean the current session is authorized or capable. A plugin MUST use the latest complete `PluginRuntimeContext.capabilities` as the authority for its current session. Method, permission, error, and version coverage MUST be validated from the existing public catalog/Schema and production composition evidence rather than a separate permission algorithm.

#### Scenario: A developer looks up a permission-free Host method
- **WHEN** a developer looks up `runtime.get_context`, `ui.close`, `actions.open`, or a storage method
- **THEN** the reference describes the exact request/result, provider conditions, possible errors, session capability check, and cancellation/invalidation behavior without exposing the private transport envelope

#### Scenario: A developer looks up a permission-protected method
- **WHEN** a developer looks up `clipboard.read` or `clipboard.write`
- **THEN** the reference explains the distinction among Manifest declaration, requested, granted, effective, and session capability, as well as the results of denial, revocation, reload permission deltas, and unavailable providers

#### Scenario: The current session lacks an optional capability
- **WHEN** Runtime context capabilities are empty or omit a method the plugin wants to call
- **THEN** the documentation requires the plugin to present an unavailable/degraded state or skip the call instead of manually constructing requests, automatically requesting permission, or assuming the public catalog equals effective authority

#### Scenario: The Contract or production provider set changes
- **WHEN** a method, permission, error, version, provider, or capability mapping differs from the published reference
- **THEN** the coverage gate fails and identifies missing, extra, or incorrectly classified entries

### Requirement: Runtime, permission, and security guidance MUST cover success, error, and recovery lifecycles

The system MUST explain the developer-visible lifecycle from iframe document to authenticated Port, SDK initialize, `runtime.get_context`, ready, complete context replacement, request/cancel, page close/reload/session replacement, and idempotent destroy. The guidance MUST cover loading, ready, empty capability, invalid/incompatible context, transport failure, timeout, cancellation, disconnect, permission denied, provider unavailable, explicit retry, and inert old generations. It MUST also explain iframe sandboxing, CSP, source validation, the single-iframe rule, deadline/breaker behavior, Host API permissions, and the identical security boundary used by production and Development sources.

#### Scenario: SDK initialization succeeds and context is replaced
- **WHEN** a plugin completes the real Session/SDK handshake and later receives a locale, theme, or capabilities change event
- **THEN** the documentation requires the plugin to atomically replace the complete context, update `en-US`/`zh-CN`, light/dark, and feature availability, and clean up listeners and pending work from the replaced attempt

#### Scenario: Recovery follows initialization or invocation failure
- **WHEN** initialization, transport, a Host method, timeout, cancellation, disconnect, or reload fails or invalidates the current attempt
- **THEN** the documentation provides stable error classification, user-understandable error/empty feedback, explicit retry conditions, and one idempotent teardown path, while late callbacks or an old Port cannot restore old authority

#### Scenario: A React/Semi plugin adapts accessibility, language, and theme
- **WHEN** the React/Semi tutorial renders loading, empty, error, ready, or recovery state
- **THEN** the example uses `PluginUiProvider` and public tokens with the current locale/theme, preserves keyboard operation, focus restoration, semantic feedback, and support for both languages and both themes

#### Scenario: A development source attempts to bypass formal boundaries
- **WHEN** documentation or examples recommend bypassing CSP, Session source validation, permission grants, deadline/breaker behavior, or the canonical Host API for Development Mode
- **THEN** the security coverage gate fails and requires the development source to use the formal Runtime and permission path

### Requirement: Every runnable documentation example MUST be automatically built or typechecked

The system MUST require every TypeScript, TSX, JSON, and shell code block described as copyable or runnable to carry machine-readable validation metadata. A source-bound block MUST remain consistent with maintained template or public package source. A compiled block MUST be extracted into the corresponding external tutorial consumer and pass typecheck or build. JSON MUST pass the relevant public Schema/validator. A command block MUST match real CLI help, package scripts, or a supported Host launch command. Non-executable explanatory pseudocode MUST be explicitly classified and MUST NOT carry a tutorial operation step.

#### Scenario: Runnable examples match maintained source
- **WHEN** the aggregate documentation gate parses runnable blocks in both tutorials and public references
- **THEN** every block resolves its source/verification target, enters its associated typecheck, build, Schema, or command check, and no runnable block remains unclassified

#### Scenario: An example, source target, or command becomes stale
- **WHEN** a code block differs from its bound source, a target/region is missing, compilation fails, a Schema rejects the block, a command is absent from real help/scripts, or the block references an absolute/private path
- **THEN** the gate fails with the document-relative path, block identifier, and stable reason, and cleans temporary output

#### Scenario: Documentation is corrected and validated again
- **WHEN** a maintainer corrects a failed block, metadata, or source binding and reruns the focused gate
- **THEN** the gate re-extracts and validates from canonical source without depending on generated files or cached results from the previous run

### Requirement: The external consumer gate MUST prove the tutorials do not depend on the private lensX workspace

The system MUST pack real Contract, SDK, UI, Testkit, and CLI tarballs in a system temporary directory, use the real CLI to create both templates, and install them in isolation with consumer-owned dependency overrides and the machine-configured global pnpm store. The gate MUST run the tutorial's test, typecheck, build, validate, repeat pack, and inspect commands; audit the lockfile, module realpaths, bundle, package bytes, and private imports; and pass each `.lxp` to the existing TypeScript/Rust inspection and local-installation preparation boundaries. The temporary consumer MUST be removed after success or failure, and repository-root commands MUST NOT use `--store-dir` to rewrite root workspace store metadata.

#### Scenario: Both temporary consumers complete the documented loop
- **WHEN** `check:plugin-development-documentation` runs in a supported environment with prebuilt tarballs and the machine global store
- **THEN** neither consumer resolves to repository root `node_modules`, both complete every automated tutorial step, repeat packing is byte-identical, and each package receives a Host-acceptable preparation result

#### Scenario: A tutorial hides a workspace or private dependency
- **WHEN** a consumer uses `workspace:`, a repository-backlinking `file:`/`link:`, a Host-private import, a Tauri import, the CLI internal codec, a root `node_modules` realpath, or an undeclared dependency
- **THEN** the external gate fails before the package is described as installable and leaves the root workspace and any existing `node_modules` unchanged

#### Scenario: Sandbox or store environment prevents consumer installation
- **WHEN** a consumer fails only because sandbox write permission or the machine store is unavailable
- **THEN** validation distinguishes the environment failure from a source/documentation failure and permits rerunning in an approved system temporary directory with the same machine global store, without creating a repository-local store

### Requirement: Task 6.6 completion MUST depend on complete validation evidence

The system MUST provide one `check:plugin-development-documentation` aggregate entry point covering bilingual structure/links, coverage, runnable blocks, both external consumers, public packages/CLI/templates, Development Mode, Runtime, permissions, and package installation boundaries. The Roadmap MAY check Task 6.6, link the current change, and update Plugin Developer Preview progress to match source, tests, and stable specifications only after the focused gate and final repository validation all pass. Failure or rollback MUST keep or restore the incomplete state.

#### Scenario: Documentation capability passes complete acceptance
- **WHEN** the focused documentation gate, frontend test/check/typecheck/build, Rust format/test/check, and strict OpenSpec validation all succeed
- **THEN** Task 6.6 may be marked complete, Plugin Developer Preview may state that Milestones 1–6 form a validated loop, and the stable spec uses English before sync/archive

#### Scenario: Any required evidence fails
- **WHEN** bilingual documentation, an example, an external consumer, API coverage, an existing security boundary, or final validation has a failure, warning, or unverified assumption
- **THEN** Task 6.6 remains incomplete, the Roadmap does not claim Plugin Developer Preview is reached, and the failed command and complete final validation set are rerun after correction
