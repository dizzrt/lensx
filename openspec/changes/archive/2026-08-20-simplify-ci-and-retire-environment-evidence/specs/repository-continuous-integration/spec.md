## MODIFIED Requirements

### Requirement: LensX CI shall validate the complete main project

LensX CI SHALL provide required macOS jobs that validate the LensX frontend and Rust desktop workspace without using plugin failures as a proxy for LensX validation. Frontend validation SHALL include formatting/static analysis, TypeScript type checking, unit tests, and a production build. Rust validation SHALL include formatting, static checking, tests, and a workspace build. These stages SHALL be deterministic repository checks and SHALL NOT launch a browser, WebView, GUI application, Launch Services, or an interactive native harness.

#### Scenario: All LensX validation stages pass

- **WHEN** every required frontend and Rust stage completes successfully
- **THEN** LensX CI SHALL succeed

#### Scenario: A frontend stage fails

- **WHEN** frontend formatting/static analysis, type checking, tests, or production build exits unsuccessfully
- **THEN** LensX CI SHALL fail

#### Scenario: A Rust stage fails

- **WHEN** Rust formatting, static checking, tests, or workspace build exits unsuccessfully
- **THEN** LensX CI SHALL fail

#### Scenario: LensX CI is reproduced locally

- **WHEN** a maintainer runs the documented LensX-only entry points on macOS
- **THEN** they SHALL exercise the same required deterministic validation categories as the GitHub workflow

### Requirement: Plugins CI shall prepare public workspace dependencies from a clean checkout

Plugins CI SHALL install dependencies in a clean runner and SHALL build every public workspace package required by the discovered plugins in transitive dependency order before executing plugin consumers. It SHALL derive that order from the workspace dependency graph, de-duplicate shared dependency builds, and SHALL NOT require pre-existing `dist` directories, source aliases, or imports from Host/Tauri private source.

#### Scenario: Public package dist directories are absent

- **WHEN** Plugins CI starts from a clean checkout with no prebuilt workspace output
- **THEN** it SHALL build the required public package exports before any plugin consumes them

#### Scenario: Public packages have transitive build dependencies

- **WHEN** a plugin dependency requires another buildable workspace package
- **THEN** Plugins CI SHALL build the dependency before the dependent package and SHALL build the package before the plugin

#### Scenario: Shared public dependency is required more than once

- **WHEN** multiple discovered plugins or packages depend on the same public workspace package
- **THEN** one CI plan SHALL prepare that package once before all consumers

#### Scenario: A required public package build fails

- **WHEN** any required public workspace package fails to build
- **THEN** Plugins CI SHALL fail before reporting plugin validation success

#### Scenario: A plugin resolves project code

- **WHEN** a plugin typechecks, tests, or builds in CI
- **THEN** it SHALL consume project functionality only through declared public package exports

### Requirement: Plugins CI shall execute every required plugin validation stage

For every discovered direct plugin, Plugins CI SHALL run its declared `typecheck`, `test`, `check`, and `build` lifecycle stages exactly once. It MAY run `test:e2e` only when that stage performs a deterministic, non-browser, non-native built-artifact check. All declared supported stages SHALL be blocking. Plugins CI SHALL NOT discover or run `visual`, screenshot, pixel-drift, browser-rendering, WebView, GUI application, native harness, or environment-evidence stages.

#### Scenario: A plugin passes its complete supported validation set

- **WHEN** the plugin passes each declared supported lifecycle and deterministic built-artifact stage
- **THEN** that plugin SHALL be counted as successfully validated

#### Scenario: A supported plugin stage fails

- **WHEN** any plugin `typecheck`, `test`, `check`, `build`, or supported `test:e2e` stage exits unsuccessfully
- **THEN** Plugins CI SHALL fail

#### Scenario: A lifecycle stage delegates to another lifecycle category

- **WHEN** a plugin `check` invokes its `typecheck` or `test`, or another declared lifecycle stage recursively duplicates a category
- **THEN** CI policy SHALL fail and require non-overlapping lifecycle semantics

#### Scenario: An environment validation entry is declared

- **WHEN** a direct plugin declares `visual` or another stage that launches a browser, WebView, GUI application, native harness, or writes environment evidence
- **THEN** repository policy SHALL fail rather than retaining or invoking that stage

### Requirement: CI policy and documentation shall prevent workflow drift

Repository-owned automated policy checks SHALL verify the two-workflow inventory, macOS runners, event path rules, minimum permissions, pinned third-party action revisions, required deterministic validation entry points, non-overlapping plugin lifecycle stages, and absence of automatic publishing or environment-validation behavior. Canonical English CI documentation and its Simplified Chinese mirror SHALL describe the trigger matrix, local reproduction commands, failure recovery, supported validation categories, and intentionally unsupported publishing and environment-evidence behavior.

#### Scenario: A third workflow or release mutation is introduced

- **WHEN** a repository change adds another workflow or adds automatic version/release mutation to an active workflow
- **THEN** the repository-owned CI policy check SHALL fail

#### Scenario: Workflow scope drifts from documented behavior

- **WHEN** a workflow changes its runner, path filters, permissions, or required validation commands without the corresponding accepted contract update
- **THEN** the repository-owned CI policy check SHALL fail

#### Scenario: Environment validation re-enters CI

- **WHEN** a workflow, CI dispatcher, or plugin lifecycle introduces screenshots, pixel comparison, browser rendering, a real WebView, a GUI application, a native harness, or environment evidence
- **THEN** repository-owned CI policy SHALL fail

#### Scenario: A CI failure is corrected

- **WHEN** a maintainer fixes a failing required stage
- **THEN** the failed stage and the complete affected CI entry point SHALL be rerun before the change is considered validated

#### Scenario: CI documentation is maintained

- **WHEN** workflow behavior or local entry points change
- **THEN** the English document, matching Simplified Chinese mirror, and both documentation indexes SHALL remain semantically aligned
