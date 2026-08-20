# Validation Gate Governance Specification

## Purpose

Define the governed root command surface, the separation between Rstest and cross-layer capability Gates, deterministic validation orchestration, explicit write authority, and migration rules that preserve validation coverage without retaining legacy entry points.

## Requirements

### Requirement: Root package scripts must be a governed stable interface

The repository MUST restrict root package.json scripts to standard lifecycle commands, required internal lifecycle commands, development, formatting, desktop operations, and the unified validation dispatchers, each with a documented long-term repository purpose. The repository MUST NOT add root test, check, run, refresh, or equivalent aliases for an individual test, a test subset, a temporary acceptance step, or an active or archived OpenSpec Change. A new root entry MUST be impossible to express through an existing stable entry or dispatcher and MUST update the semantic policy, automated tests, and canonical documentation together.

#### Scenario: A standard root entry is allowed

- **WHEN** the root manifest declares a standard workspace lifecycle, supported application lifecycle, stable development, formatting, Tauri operation, or the unified Gate, Generate, or Evidence dispatcher
- **THEN** root-script policy accepts the entry
- **THEN** canonical documentation explains its purpose and invocation boundary

#### Scenario: A Change-specific script is rejected

- **WHEN** the root manifest adds a script named after an active or archived OpenSpec Change
- **THEN** standard validation fails and identifies the script and Change
- **THEN** maintainers must reuse a stable capability Gate or revise the governance design

#### Scenario: A test-subset alias is rejected

- **WHEN** a root script only selects one or more Rstest files or forwards to another validation script
- **THEN** root-script policy rejects the entry
- **THEN** normal tests use Rstest discovery and focused selection exists only in the Gate registry

### Requirement: Rstest and cross-layer Gates must have separate responsibilities without reducing coverage

Every side-effect-free TypeScript or TSX unit, component, contract, documentation, source-policy, and drift assertion MUST be in the Rstest discovery range and MUST run through the standard root test lifecycle. Capability acceptance that needs Cargo, builds, packaging, temporary consumers, browsers, visual checks, or real macOS services MUST be orchestrated by the Gate registry and MUST NOT be forced into Rstest. A focused Gate MUST supplement rather than replace the complete frontend, workspace, Rust, documentation, and OpenSpec validation applicable to a Change.

#### Scenario: Repository policy assertions run automatically

- **WHEN** a check only reads repository state and produces deterministic assertions
- **THEN** Rstest discovers it without a dedicated root script
- **THEN** the standard root test runs it

#### Scenario: Cross-layer acceptance runs through a Gate

- **WHEN** focused validation combines Rstest, Cargo, build, real tarball consumer, visual, or macOS evidence phases
- **THEN** one stable capability Gate orchestrates the required phases and preserves native tool failures
- **THEN** Rstest does not manage the non-test phases

#### Scenario: A focused Gate does not replace complete validation

- **WHEN** a capability Gate succeeds
- **THEN** Change completion still requires all applicable standard frontend, workspace, Rust, documentation, build, and OpenSpec validation
- **THEN** Gate success is not reported as complete repository validation

### Requirement: The Gate registry must be declarative, deterministic, and de-duplicated

The repository MUST provide one private typed Gate registry and one unified read-only Gate CLI. Every Gate MUST have a unique stable capability ID that is not a Change ID and MUST declare a description, Gate dependencies, and structured executable steps with stable step IDs. Each step MUST declare executable, argument vector, working directory, environment, platform, and read-only, browser, native-application, and committed-write safety metadata. Before starting any command, the runner MUST reject unknown or duplicate IDs, missing dependencies or steps, and cycles. It MUST expand the complete DAG in deterministic topological order, execute a shared step ID once per invocation, run serially by default, and propagate a locatable non-zero failure.

#### Scenario: Shared dependencies execute once

- **WHEN** multiple branches of a requested Gate DAG depend on the same Gate or step ID
- **THEN** the runner executes the shared dependency and step once in deterministic order
- **THEN** the plan shows the de-duplicated sequence

#### Scenario: An invalid graph fails closed

- **WHEN** the registry contains an unknown dependency, duplicate Gate or step definition, missing step, or cycle
- **THEN** the runner returns non-zero before launching a validation command
- **THEN** diagnostics identify the invalid stable IDs and relationship

#### Scenario: A step failure is locatable

- **WHEN** a Gate step cannot launch or returns non-zero
- **THEN** the runner stops and returns non-zero
- **THEN** output identifies the requested Gate, failed step, status, and completed prefix

### Requirement: Gate, Generate, and Evidence must isolate write authority

The Gate CLI MUST be read-only with respect to committed fixtures, baselines, and evidence. Generated artifacts and real evidence updates MUST use the governed Generate or Evidence dispatcher with one listed target and an explicit write flag. The corresponding read-only Gate MUST detect missing, stale, schema, privacy, or generated-output drift after an update. Browser and macOS steps MUST preserve headless or windowless execution, fresh temporary state, the approved execution context, bounded timeouts, graceful cleanup, and sandbox-only environment-failure classification.

#### Scenario: A read-only Gate observes drift

- **WHEN** a committed fixture, generated output, or evidence record differs from current source
- **THEN** the Gate returns non-zero with a bounded diagnostic and the relevant refresh target
- **THEN** the Gate does not overwrite the committed artifact

#### Scenario: Evidence update lacks explicit authorization

- **WHEN** the Evidence dispatcher is requested without the required write flag
- **THEN** it starts no command and modifies no committed evidence
- **THEN** output explains the available target and explicit update syntax

### Requirement: Agent, OpenSpec, documentation, and automated policy must jointly enforce governance

Root AGENTS.md MUST prohibit unplanned root-script expansion and MUST link the canonical English validation documentation. openspec/config.yaml MUST require planning artifacts to reuse or design stable capability Gates, prohibit Change-specific root scripts, record complete validation, and scan stale entries before synchronization or archive. Every relevant English engineering document MUST have a semantically aligned Simplified Chinese mirror. Standard Rstest validation MUST automatically check root-script policy, the Gate graph, Change-name conflicts, no-dual-entry rules, and documentation Gate references without a dedicated root policy script.

#### Scenario: An Agent plans focused validation

- **WHEN** an Agent creates or updates OpenSpec planning artifacts
- **THEN** Agent and OpenSpec rules require reuse of an existing Gate or design of a stable capability Gate
- **THEN** artifacts do not define a Change ID or test-file list as a root package script

#### Scenario: Documentation references an unknown Gate

- **WHEN** maintained English or Chinese documentation references a Gate ID absent from the registry
- **THEN** standard policy validation fails and identifies the document and unknown ID
- **THEN** inconsistent or stale commands cannot pass final validation

#### Scenario: A Change-specific entry remains before archive

- **WHEN** a Change is ready to archive but the root manifest, CI, or maintained documentation still references its temporary entry
- **THEN** archive validation fails
- **THEN** the entry must be removed or migrated to a designed stable capability Gate

### Requirement: Legacy validation entries must migrate atomically without dual paths

The repository MUST maintain a complete machine-readable mapping of legacy root validation, generation, evidence, recursive calls, CI, documentation, and specification references. Change-specific, test-subset, forwarding, and shell-chain scripts replaced by the dispatcher MUST be removed, and all maintained callers MUST migrate in the same Change. The migration MUST preserve or strengthen every existing Rstest, Cargo, build, pack, consumer, visual, and macOS evidence phase and MUST use automated coverage and stale-entry comparison.

#### Scenario: A legacy entry is fully migrated

- **WHEN** maintained focused validation has a stable registry Gate
- **THEN** CI, documentation, specs, and internal callers use only the dispatcher and stable ID
- **THEN** the root manifest contains no legacy alias

#### Scenario: A compatibility alias remains

- **WHEN** a new Gate and a legacy root script can start the same maintained validation
- **THEN** no-dual-entry policy fails
- **THEN** maintainers remove the alias rather than labeling it compatible

#### Scenario: Migration reduces validation coverage

- **WHEN** a new Gate plan omits a legacy Rstest, Cargo, build, pack, visual, evidence, or boundary phase
- **THEN** migration regression fails and identifies the missing phase
- **THEN** reducing script count is not accepted as a reason to weaken validation
