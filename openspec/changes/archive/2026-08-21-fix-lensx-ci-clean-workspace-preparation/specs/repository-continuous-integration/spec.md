## ADDED Requirements

### Requirement: LensX frontend CI shall prepare public workspace dependencies from a clean checkout
LensX frontend CI MUST derive the transitive public workspace build dependencies required by its validation consumers and MUST build those dependencies in topological order before the first consumer executes. The maintained `ci-lensx-frontend` Gate MUST own this preparation for both GitHub Actions and local reproduction, MUST de-duplicate shared build steps within one invocation, and MUST NOT depend on pre-existing `dist` directories, source aliases, workflow-only preparation, or recursive dependency builds inside an individual package.

#### Scenario: Public package outputs are absent
- **WHEN** LensX frontend CI starts from a clean checkout with no prebuilt workspace `dist` directories
- **THEN** it builds every required transitive public workspace dependency before the first dependent build or type-check consumer
- **THEN** the complete `ci-lensx-frontend` Gate can proceed without relying on residual local artifacts

#### Scenario: A CLI build requires the Contract package
- **WHEN** the frontend validation plan includes a build of `@lensx/plugin-cli`
- **THEN** the plan builds `@lensx/plugin-contract` before `@lensx/plugin-cli`
- **THEN** the CLI resolves Contract types and runtime exports only through the declared public package exports

#### Scenario: Multiple frontend stages share build preparation
- **WHEN** type-check and test stages require the same public workspace package outputs in one `ci-lensx-frontend` invocation
- **THEN** the Gate plan executes each identical preparation step once before all dependent consumers
- **THEN** stage-specific build steps remain distinct when their environment or command semantics differ

#### Scenario: LensX frontend CI is reproduced locally
- **WHEN** a maintainer runs the documented `ci-lensx-frontend` Gate on macOS
- **THEN** the same Gate-owned dependency preparation used by GitHub Actions executes locally
- **THEN** the workflow does not require an additional hard-coded package build step

#### Scenario: Dependency preparation cannot produce a valid plan
- **WHEN** a required workspace target is missing, its dependency graph contains a cycle, or a required package build fails
- **THEN** LensX frontend CI fails before reporting dependent validation success
- **THEN** the diagnostic identifies the invalid target, cycle, or failed Gate step
