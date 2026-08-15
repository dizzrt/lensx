## ADDED Requirements

### Requirement: The release pipeline MUST exercise ConfigLens as its first real product member

Once `plugins/official/config-lens` exists, the system MUST discover it as a real independent release unit and MUST include it in path selection, Changeset planning, package lifecycle, canonical repeated packing, TypeScript and Rust inspection, ordinary installation preparation, isolated Runtime and plugin E2E validation. The real member path MUST supplement rather than replace zero-member and temporary two-member fixture coverage. Candidate and release processing MUST use the same external-plugin protocol and MUST NOT infer Host trust, permission, signing or native authority from the ConfigLens identity, repository path or audit sidecar.

#### Scenario: ConfigLens-only change selects the real member
- **WHEN** a release-relevant diff changes only `plugins/official/config-lens/**` and contains a valid Changeset for `@lensx/official-config-lens`
- **THEN** the PR plan selects ConfigLens for member-local validation and version intent without versioning the desktop application or an unrelated plugin
- **THEN** its candidate runs every declared lifecycle including `test:e2e` before any write-authorized release job is reachable

#### Scenario: Shared plugin boundary changes after ConfigLens exists
- **WHEN** a public Contract, SDK, UI, Testkit, CLI, package, installation, Runtime, workspace or official release infrastructure path changes without a ConfigLens Changeset
- **THEN** ConfigLens is selected as a current real consumer for validation but receives no implicit version bump or release intent
- **THEN** zero-member and two-member fixtures continue to prove no-op and independent multi-member behavior

#### Scenario: Real candidate reaches ordinary installation and Runtime
- **WHEN** two ConfigLens packs are byte-identical and both inspectors agree on identity, version, files and digest
- **THEN** the same immutable `.lxp` passes ordinary local-install preparation, Action/Page projection, isolated iframe open, SDK ready, plugin E2E and deterministic close
- **THEN** neither the installer nor Runtime consumes repository location, Changeset metadata or the release sidecar as authority

#### Scenario: Real member or candidate drifts
- **WHEN** ConfigLens metadata, ownership, dependency boundary, Worker resource closure, lifecycle, candidate bytes, inspector facts, install result or Runtime E2E drifts or fails
- **THEN** the release gate fails before a tag or public release is created and does not fall back to fixture-only success
- **THEN** correction requires a fresh candidate and a rerun of the complete real-member gate
