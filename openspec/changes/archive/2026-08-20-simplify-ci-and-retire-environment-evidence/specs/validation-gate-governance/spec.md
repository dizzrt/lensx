## MODIFIED Requirements

### Requirement: Root package scripts must be a governed stable interface

The repository MUST restrict root `package.json` scripts to standard lifecycle commands, required internal lifecycle commands, development, formatting, desktop operations, and the unified read-only Gate and governed Generate dispatchers, each with a documented long-term repository purpose. The repository MUST NOT expose an Evidence dispatcher or add root test, check, run, refresh, visual, browser, native-harness, or equivalent aliases for an individual test, a test subset, a temporary acceptance step, an environment proof, or an active or archived OpenSpec Change. A new root entry MUST be impossible to express through an existing stable entry or dispatcher and MUST update semantic policy, automated tests, and canonical documentation together.

#### Scenario: A standard root entry is allowed

- **WHEN** the root manifest declares a standard workspace lifecycle, supported application lifecycle, stable development, formatting, Tauri operation, or the unified Gate or Generate dispatcher
- **THEN** root-script policy accepts the entry
- **THEN** canonical documentation explains its purpose and invocation boundary

#### Scenario: An Evidence or environment entry is rejected

- **WHEN** the root manifest declares an Evidence dispatcher, visual refresh, browser runner, native harness, or environment-proof alias
- **THEN** root-script policy rejects the entry
- **THEN** maintainers remove the entry rather than hiding it behind compatibility or manual invocation

#### Scenario: A Change-specific script is rejected

- **WHEN** the root manifest adds a script named after an active or archived OpenSpec Change
- **THEN** standard validation fails and identifies the script and Change
- **THEN** maintainers must reuse a stable capability Gate or revise the governance design

#### Scenario: A test-subset alias is rejected

- **WHEN** a root script only selects one or more Rstest files or forwards to another validation script
- **THEN** root-script policy rejects the entry
- **THEN** normal tests use Rstest discovery and focused selection exists only in the Gate registry

### Requirement: Rstest and cross-layer Gates must have separate responsibilities without reducing coverage

Every side-effect-free TypeScript or TSX unit, component, contract, documentation, source-policy, and drift assertion MUST be in the Rstest discovery range and MUST run through the standard root test lifecycle. Capability acceptance that needs Cargo, builds, packaging, temporary consumers, or other deterministic multi-stage command-line work MUST be orchestrated by the Gate registry and MUST NOT be forced into Rstest. Maintained validation MUST NOT require browsers, visual comparison, real WebViews, GUI applications, native interaction harnesses, or target-environment evidence. A focused Gate MUST supplement rather than replace the complete frontend, workspace, Rust, documentation, and OpenSpec validation applicable to a Change.

#### Scenario: Repository policy assertions run automatically

- **WHEN** a check only reads repository state and produces deterministic assertions
- **THEN** Rstest discovers it without a dedicated root script
- **THEN** the standard root test runs it

#### Scenario: Cross-layer acceptance runs through a Gate

- **WHEN** focused validation combines Rstest, Cargo, build, real tarball consumer, or another deterministic command-line phase
- **THEN** one stable capability Gate orchestrates the required phases and preserves native tool failures
- **THEN** Rstest does not manage the non-test phases

#### Scenario: An environment phase is proposed for a Gate

- **WHEN** a Gate step would launch a browser, WebView, GUI application, native interaction harness, visual comparison, or environment evidence producer
- **THEN** registry policy rejects the step
- **THEN** no optional or compatibility Gate is retained

#### Scenario: A focused Gate does not replace complete validation

- **WHEN** a capability Gate succeeds
- **THEN** Change completion still requires all applicable standard frontend, workspace, Rust, documentation, build, and OpenSpec validation
- **THEN** Gate success is not reported as complete repository validation

### Requirement: The Gate registry must be declarative, deterministic, and de-duplicated

The repository MUST provide one private typed Gate registry and one unified read-only Gate CLI. Every Gate MUST have a unique stable capability ID that is not a Change ID and MUST declare a description, Gate dependencies, and structured executable steps with stable step IDs. Each step MUST declare executable, argument vector, working directory, environment, platform, and read-only and committed-write safety metadata. Browser, native-application, visual, environment-evidence, and committed-write steps MUST be rejected. Before starting any command, the runner MUST reject unknown or duplicate IDs, missing dependencies or steps, and cycles. It MUST expand the complete DAG in deterministic topological order, execute a shared step ID once per invocation, run serially by default, and propagate a locatable non-zero failure.

#### Scenario: Shared dependencies execute once

- **WHEN** multiple branches of a requested Gate DAG depend on the same Gate or step ID
- **THEN** the runner executes the shared dependency and step once in deterministic order
- **THEN** the plan shows the de-duplicated sequence

#### Scenario: An invalid graph fails closed

- **WHEN** the registry contains an unknown dependency, duplicate Gate or step definition, missing step, cycle, or prohibited environment step
- **THEN** the runner returns non-zero before launching a validation command
- **THEN** diagnostics identify the invalid stable IDs and relationship

#### Scenario: A step failure is locatable

- **WHEN** a Gate step cannot launch or returns non-zero
- **THEN** the runner stops and returns non-zero
- **THEN** output identifies the requested Gate, failed step, status, and completed prefix

### Requirement: Legacy validation entries must migrate atomically without dual paths

The repository MUST maintain a complete machine-readable mapping of legacy root validation, generation, evidence, recursive calls, CI, documentation, and specification references. Change-specific, test-subset, forwarding, shell-chain, visual, browser, native-harness, and Evidence entries retired by the governed migration MUST be removed, and all maintained callers MUST migrate in the same Change. The migration MUST preserve every supported Rstest, Cargo, static, build, pack, deterministic consumer, and boundary phase, while intentionally deleting environment-only phases and their assets. Automated coverage and stale-entry comparison MUST distinguish those two outcomes.

#### Scenario: A legacy entry is fully migrated

- **WHEN** maintained focused deterministic validation has a stable registry Gate or standard lifecycle destination
- **THEN** CI, documentation, specs, and internal callers use only that supported entry
- **THEN** the root manifest contains no legacy alias

#### Scenario: A compatibility alias remains

- **WHEN** a supported entry and a legacy root script can start the same maintained validation
- **THEN** no-dual-entry policy fails
- **THEN** maintainers remove the alias rather than labeling it compatible

#### Scenario: Migration drops a supported phase

- **WHEN** a new lifecycle or Gate plan omits a prior Rstest, Cargo, static, build, pack, deterministic consumer, or boundary phase without a mapped destination
- **THEN** migration regression fails and identifies the missing phase
- **THEN** reducing script count is not accepted as a reason to weaken supported deterministic validation

#### Scenario: Migration retains an environment-only phase

- **WHEN** a legacy visual, screenshot, pixel, browser, WebView, GUI, native-harness, or Evidence entry remains callable after migration
- **THEN** no-dual-entry and stale-environment policy fail
- **THEN** maintainers delete the entry and its maintained assets

## REMOVED Requirements

### Requirement: Gate, Generate, and Evidence must isolate write authority

**Reason**: The repository no longer maintains a real-environment Evidence dispatcher, evidence records, or browser and macOS write paths. This requirement's three-dispatcher model conflicts with the new deterministic validation boundary.

**Migration**: Remove the root `evidence` entry, registry `evidenceTargets`, runner, types, tests, and all callers. Retain valuable deterministic generated artifacts in the Generate dispatcher, which requires an explicit target and `--write`, and check drift through read-only tests or Gates.

## ADDED Requirements

### Requirement: Gate and Generate MUST keep deterministic read and write authority separate

Gate CLI MUST remain read-only with respect to committed source, fixtures, generated outputs, and package artifacts. Deterministic generated artifacts MUST use the governed Generate dispatcher with one listed target and an explicit write flag; a corresponding read-only test or Gate MUST detect missing or stale output. Generate MUST NOT expose visual baselines, screenshots, browser output, native harness output, target-environment evidence, or a compatibility alias for the removed Evidence dispatcher.

#### Scenario: A read-only Gate observes generated drift

- **WHEN** a maintained deterministic generated output differs from current source
- **THEN** the Gate returns non-zero with a bounded diagnostic and relevant Generate target
- **THEN** the Gate does not overwrite the committed artifact

#### Scenario: Generate lacks explicit authorization

- **WHEN** the Generate dispatcher is requested without the required write flag
- **THEN** it starts no generator and modifies no committed output
- **THEN** output explains the listed target and explicit update syntax

#### Scenario: An environment output is registered

- **WHEN** a Generate target attempts to write a screenshot, visual baseline, browser result, native harness result, or target-environment evidence
- **THEN** registry policy rejects that target
- **THEN** the removed Evidence model is not recreated under another name
