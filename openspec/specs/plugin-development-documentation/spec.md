# Plugin Development Documentation Specification

## Purpose

Define the external-developer-first bilingual documentation, complete tutorial
paths, public reference boundaries, executable examples, and isolated consumer
validation required for the lensX Plugin Developer Preview.
## Requirements
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
- **THEN** the documentation directs them respectively to explicit, process-local, manual-reload Development Mode or canonical local `.lxp` installation, and explains how source, persistence, trust disclosure, and restart semantics differ

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

The bilingual Host API reference MUST document the request, result, stable errors, version, provider condition, Session capability, and recovery for every Host API `0.2.0` method. It MUST make clear that the public catalog is not the current provider and that a provider is not arbitrary Host authority. The complete current `PluginRuntimeContext.capabilities` describes only the non-privileged methods actually available to the Session. The documentation MUST no longer describe Manifest permissions, grants, a clipboard provider, or permission-denied flows, and MUST distinguish Host API methods from ordinary Web capabilities that require no Context enumeration.

#### Scenario: Developer looks up current Host methods
- **WHEN** a developer looks up a context, navigation, storage, or close method
- **THEN** the reference provides exact contract, provider, Session, and recovery facts
- **THEN** it does not imply that Worker or network use requires a Host API and does not expose a clipboard or permission method

#### Scenario: Contract or provider drifts
- **WHEN** a method, error, version, provider, or Context mapping differs from the real package or production composition
- **THEN** the coverage gate fails and identifies missing, extra, or misclassified facts
- **THEN** documentation cannot conceal drift by retaining a legacy permission section

#### Scenario: Current Session lacks an optional capability

- **WHEN** Runtime Context capabilities are empty or omit a method the plugin wants to call
- **THEN** the documentation requires the plugin to present an unavailable or degraded state or skip the call instead of manually constructing requests or assuming that the public catalog equals current Session capability

### Requirement: Runtime, permission, and security guidance MUST cover success, error, and recovery lifecycles

Runtime and security guidance MUST explain the complete lifecycle from isolated iframe, Session and Port, SDK initialization, Context, ready, request and cancel through close, reload, replacement, and destroy. It MUST cover successful open Worker, network, remote, Blob, and Data behavior; unsupported browser APIs; transport, deadline, and breaker behavior; Host and cross-plugin isolation; and old-generation inertness. The documentation MUST describe installation as the current trust decision for plugin behavior and explain that lensX does not individually authorize or review ordinary Web behavior, without describing the open Web as Tauri or native authority.

#### Scenario: Developer builds an open Web plugin
- **WHEN** a tutorial plugin uses a Dedicated Worker, network connection, or remote resource
- **THEN** the documentation explains its support, teardown, errors, and platform differences inside the isolated Runtime
- **THEN** the example creates no permission request or grant UI and uses no private Host bypass

#### Scenario: Developer handles unavailable native capability
- **WHEN** a plugin needs an unpublished file, Shell, process, camera, microphone, or clipboard Host capability
- **THEN** the documentation marks it undelivered or unsupported instead of recommending Tauri, a private import, or automatic authorization
- **THEN** the plugin provides a degraded state or changes its feature scope

#### Scenario: Development source follows formal boundary
- **WHEN** documentation describes Development Mode
- **THEN** it requires the same open Runtime, Host isolation, manual reload, and teardown
- **THEN** it describes no permission or grant difference and no development-only CSP bypass

#### Scenario: SDK initialization succeeds and Context is replaced

- **WHEN** a plugin completes the real Session and SDK handshake and later receives a locale, theme, or capabilities change event
- **THEN** the documentation requires the plugin to atomically replace the complete Context, update `en-US` or `zh-CN`, light or dark theme, and feature availability, and clean up listeners and pending work from the replaced attempt

#### Scenario: Recovery follows initialization or invocation failure

- **WHEN** initialization, transport, a Host method, timeout, cancellation, disconnect, or reload fails or invalidates the current attempt
- **THEN** the documentation provides stable error classification, understandable error or empty feedback, explicit retry conditions, and one idempotent teardown path, while late callbacks and an old Port cannot restore old authority

#### Scenario: React and Semi plugin adapts accessibility, language, and theme

- **WHEN** the React and Semi tutorial renders a loading, empty, error, ready, or recovery state
- **THEN** the example uses `PluginUiProvider` and public tokens with the current locale and theme, preserves keyboard operation, focus restoration, semantic feedback, and support for both languages and both themes

#### Scenario: Development source attempts to bypass formal boundaries

- **WHEN** documentation or examples recommend bypassing CSP, Session source validation, deadline or breaker behavior, teardown, or the canonical Host API for Development Mode
- **THEN** the security coverage gate fails and requires the development source to use the formal Runtime path

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

### Requirement: Developer documentation MUST present ConfigLens as public-boundary dogfood

The canonical English plugin developer hub and its path-matched Simplified Chinese mirror MUST identify `ConfigLens` as the first product official plugin after Task 7.2 validation completes. The documentation MUST describe its JSON, YAML, TOML and XML scope, Monaco and package-owned Worker use, ordinary `.lxp` installation, open isolated Web Runtime and closed Host boundary. It MUST NOT describe ConfigLens as built into the Host, pre-trusted, signed, automatically updated, Marketplace-delivered, permission-granted or allowed to import private source.

#### Scenario: Developer inspects the official example
- **WHEN** a reader follows the official-plugin reference from either language's developer hub
- **THEN** that language identifies ConfigLens by the same brand, public packages and ordinary installation/runtime path and lists the four supported configuration languages
- **THEN** the corresponding language contains the same relative path, machine identifiers, capability status and non-authoritative official-source boundary

#### Scenario: Documentation implies official authority
- **WHEN** English or Chinese documentation claims ConfigLens receives Host trust, a native API, a permission exception, a separate Runtime, direct Host import, signing, Marketplace delivery or automatic update because it is official
- **THEN** the documentation drift gate fails with a stable repository-relative diagnostic
- **THEN** Task 7.2 status cannot conceal or override that failure

### Requirement: Task 6.6 completion MUST depend on complete validation evidence

`check:plugin-development-documentation` MUST cover bilingual structure and links, runnable blocks, external consumers, public packages, CLI and templates, Development Mode, the open isolated Runtime, Host API `0.2.0`, canonical installation and every currently delivered product official plugin. Historical Task 6.6 status MAY remain complete only while documentation agrees with current source and specs. Legacy permission or clipboard claims and stale official-plugin capability status MUST fail the gate.

#### Scenario: Updated documentation gate passes
- **WHEN** the focused documentation gate, complete frontend and Rust validation, and strict OpenSpec validation all succeed after ConfigLens delivery
- **THEN** the developer hub can claim that the current open Web and closed Host boundary and ConfigLens public-boundary dogfood are delivered
- **THEN** it does not describe Task 7.3, Marketplace, signatures, automatic updates or native permissions as complete

#### Scenario: Legacy permission guidance remains
- **WHEN** English or Chinese documentation still instructs developers to use requested permissions, grant or revoke, the clipboard Host API, or a restrictive Host Worker or network CSP
- **THEN** the gate fails with a deterministic repository-relative diagnostic
- **THEN** the capability status cannot be marked converged

#### Scenario: Official plugin status is stale
- **WHEN** documentation says no product official plugin exists after the validated ConfigLens member is present, or describes ConfigLens before its complete evidence passes
- **THEN** the documentation gate fails and identifies the status mismatch without presenting planned behavior as shipped
- **THEN** the Roadmap and release documentation MUST remain aligned with the verified repository state

#### Scenario: Required evidence fails

- **WHEN** bilingual documentation, an example, an external consumer, API coverage, an existing security boundary, an official product plugin or final validation has a failure, warning, or unverified assumption
- **THEN** Task 6.6 does not remain complete, the Roadmap does not claim an unsupported Plugin Developer Preview state, and the failed command and complete final validation set are rerun after correction

### Requirement: Bilingual developer documentation MUST describe the Child WebView public boundary
Canonical English documentation and identical-path Simplified Chinese mirrors MUST teach Manifest `0.4.0`, SDK `/webview`, bounded per-Page presentation, top-level Web semantics, Host-controlled slot/navigation, current bridge lifecycle, safe recovery and public package flow. They MUST explain logical initial size, the fixed `650×600` default, `resizable` user opt-in, Contract/work-area bounds, same-attempt hide/restore retention, actual-close reset, first-version non-persistence, and the distinction between normal Web viewport observation and forbidden plugin native setters. They MUST explain that ordinary Web capabilities are open, native Host authority is closed, official/development provenance grants no extra power, and OS process isolation is not guaranteed. Current guides and runnable examples MUST NOT instruct iframe, MessagePort, Tauri Window, runtime resize, position, monitor, maximize or fullscreen usage except in explicit migration/security notes.

#### Scenario: External developer follows either tutorial
- **WHEN** the developer uses only published package references, Manifest `0.4.0`, and documented commands
- **THEN** the resulting plugin builds, packs, installs and reaches SDK ready through Child WebView
- **THEN** absent presentation is fixed `650×600`, while an explicit valid presentation changes only initial Host surface and user resizability

#### Scenario: Developer looks for remembered user size
- **WHEN** documentation describes resize lifecycle or a Page is closed and reopened
- **THEN** both languages state that first-version user size exists only for the current Page attempt and is reset on real close/reopen
- **THEN** they do not promise Host preferences, plugin/browser storage, or runtime size restoration

#### Scenario: Documentation drift gate runs
- **WHEN** examples, exports, Manifest Schema, CLI output, Runtime terminology, Page presentation defaults, or authority boundaries diverge
- **THEN** automated documentation validation fails in both languages
