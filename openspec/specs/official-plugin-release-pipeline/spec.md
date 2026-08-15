# Official Plugin Release Pipeline Specification

## Purpose

Define the independent, least-privilege pipeline for validating, versioning,
building, auditing, and publishing official plugin `.lxp` releases without
coupling them to the desktop application release or creating Host trust,
permission, or signing authority.

## Requirements

### Requirement: Each official plugin must be an independent, constrained release unit
The system MUST treat each direct workspace member under `plugins/official/` as an independent release unit. Each unit MUST have a unique package name, `private: true`, an independent SemVer, a source Manifest at its root, a `CHANGELOG.md`, real automated tests, `build`, `typecheck`, `test`, `check`, and `test:e2e` scripts, and an explicit CODEOWNERS entry that covers the whole directory. The source Manifest, built Manifest, package metadata, and inspected `.lxp` MUST have matching plugin identity and version. Official plugins MUST obey the same public dependency and import boundaries as external plugins and MUST NOT import Host or Tauri private source or another plugin's source merely because they reside in the official directory.

#### Scenario: A valid official plugin enters release validation
- **WHEN** a direct child directory satisfies the package, Manifest, SemVer, CHANGELOG, test, script, CODEOWNERS, and public dependency constraints
- **THEN** the system recognizes it as an independent candidate and derives release identity from the validated Manifest identity and version
- **THEN** other official plugins and the lensX desktop application version are not part of that candidate's version

#### Scenario: The official directory cannot bypass external plugin boundaries
- **WHEN** an official plugin depends on the Host root package, a Tauri API, a Host-private module, a workspace-only deep import, or another plugin's source
- **THEN** the release contract gate MUST reject the candidate with a stable diagnostic
- **THEN** the system MUST NOT add an import exception for the official directory or directly import the plugin from the Host

#### Scenario: Version or ownership metadata drifts
- **WHEN** package, source Manifest, built Manifest, or inspected `.lxp` identity or version differs, or the CHANGELOG, real test, required script, or CODEOWNERS entry is missing
- **THEN** the candidate MUST fail before a tag or public release is created
- **THEN** the diagnostic MUST identify the plugin-relative path and drift category and MUST NOT disclose an absolute path or secret

### Requirement: Path impact and Changesets must control validation scope and release intent separately
The system MUST compute a sorted, deduplicated, schema-validated official-plugin validation set from explicit base and head commits. A plugin-directory change MUST select that plugin. A shared trigger change in the public Contract, SDK, UI, Testkit, CLI, workspace, lockfile, package format, installation, permission, Runtime, or release infrastructure MUST select every existing official plugin. Unrelated paths MUST produce an explicit no-op. A release-relevant official-plugin change MUST have a valid Changeset that targets that plugin, while a shared-path change MUST NOT create an automatic version or release intent.

#### Scenario: A single-plugin change selects one release unit
- **WHEN** a diff changes only one official plugin's release-relevant path and includes a valid Changeset for that plugin
- **THEN** the PR gate MUST add only that plugin to plugin-local validation and the version plan
- **THEN** other official plugins and the desktop application MUST NOT be versioned or added to the release plan

#### Scenario: A shared-boundary change expands validation but not release intent
- **WHEN** a diff changes the public SDK, CLI, package format, permissions, Runtime, or release infrastructure without changing an official-plugin Changeset
- **THEN** the system MUST validate every existing official plugin and release fixture
- **THEN** the system MUST NOT create an implicit bump, tag, or release for any plugin

#### Scenario: A plugin change has a missing or mismatched Changeset
- **WHEN** a release-relevant official-plugin change has no Changeset, targets the wrong plugin, uses an invalid bump, or references an unknown official plugin
- **THEN** the PR gate MUST fail closed with a deterministic diagnostic
- **THEN** the version and publish workflows MUST NOT infer SemVer or continue publishing

#### Scenario: The repository has no product official plugins
- **WHEN** `plugins/official/` has no real member and there is no candidate Changeset
- **THEN** member selection MUST return a stable successful no-op
- **THEN** release-infrastructure changes MUST still validate committed fixtures and the dry-run but MUST NOT create a product release

### Requirement: Changesets must produce reviewable, consistent, independent version history
The system MUST use Changesets to express each official plugin's SemVer bump and MUST use a controlled version command to create or update version-PR metadata, package versions, and independent CHANGELOGs. The version command MUST only copy a Changesets-decided version into the same plugin's source Manifest and MUST validate package, Manifest, and CHANGELOG consistency afterward. The publish phase MUST only consume committed versions and MUST NOT modify source, select a new bump, or rewrite historical versions.

#### Scenario: One plugin produces an independent version-PR change
- **WHEN** a valid Changeset declares a patch, minor, or major bump for only one official plugin
- **THEN** the version plan MUST update only that plugin's package version, source Manifest version, and CHANGELOG
- **THEN** other plugins' packages, Manifests, and CHANGELOGs and the root application version MUST remain unchanged

#### Scenario: Version synchronization fails partway
- **WHEN** the Changesets version step succeeds but Manifest synchronization, CHANGELOG validation, or the final contract gate fails
- **THEN** the version workflow MUST NOT publish a release or produce a partially merged state
- **THEN** after the defect is fixed, the version PR MUST regenerate from the committed Changeset and produce the same deterministic version plan

### Requirement: Every release candidate must pass platform and plugin automation gates

Every selected official plugin candidate MUST pass, within build authority, the Contract `0.2.0`, SDK, package format, open isolated Runtime, Host and cross-plugin isolation, plugin unit, integration, and E2E tests, type checking, build, and official-boundary gates in sequence. The candidate MUST pass public CLI inspection, ordinary local-install preparation, and Runtime execution as a canonical `.lxp`. The release pipeline MUST NOT depend on the removed permission-prompt or permission-management gate and MUST NOT add Host authority because a source is official.

The releasable `.lxp` MUST be the same immutable bytes that passed every gate, MUST use the external-plugin package protocol, and MUST NOT be rebuilt, repacked as a custom workflow archive, or depend on Host source imports after validation.

#### Scenario: Official candidate uses Worker or network
- **WHEN** a candidate E2E uses a supported Dedicated Worker, remote resource, or network connection
- **THEN** both the open Runtime success path and Host and cross-plugin negative paths pass
- **THEN** the release job creates no grant, permission exception, or official-only CSP

#### Scenario: Candidate or platform gate fails
- **WHEN** any Contract, package, Runtime, isolation, plugin test, type, build, or candidate-agreement gate fails
- **THEN** the candidate does not enter the write-authorized publish job
- **THEN** after correction, the failed gate and complete candidate gate MUST be rerun without reusing the old artifact

#### Scenario: Candidate passes the complete release gate

- **WHEN** a candidate passes the global platform gate, plugin lifecycle, two byte-identical packs, both inspectors, ordinary installation preparation, Runtime open, Session, and close smoke, and plugin E2E
- **THEN** the system pins the complete SHA-256 of the candidate `.lxp` and may place it in a read-only artifact handoff
- **THEN** later publish steps consume that exact file instead of rebuilding or repacking it

#### Scenario: Ordinary installer validates an official candidate

- **WHEN** a gated candidate `.lxp` is submitted to the ordinary local-install preparation boundary
- **THEN** the Host accepts or rejects its content using the existing package, Manifest, compatibility, and installation rules
- **THEN** the result does not depend on a GitHub Release, Changeset, repository path, or official sidecar

### Requirement: CI must isolate executable plugin code from release authority
Jobs that install dependencies or execute plugin build, test, or E2E code MUST have read-only permissions and MUST NOT receive a release secret. A job with version-PR or GitHub Release write permission MUST NOT execute plugin source, plugin lifecycle commands, dependency lifecycle scripts, or `.lxp` content. Such a job MUST only process controlled version metadata or download and revalidate a digest-pinned candidate artifact. Pull-request and fork events MUST NOT receive release authority. Every third-party action MUST be pinned to an immutable revision, and publishing MUST be constrained by a protected branch or environment and concurrency controls.

#### Scenario: A candidate build executes repository plugin code
- **WHEN** CI installs dependencies and runs an official plugin's build, test, or E2E
- **THEN** the job MUST have no release write permission, environment secret, or persistent publish credential
- **THEN** successful output may only include a digest-pinned candidate artifact and machine-verifiable manifest

#### Scenario: A publish job receives a candidate artifact
- **WHEN** a write-authorized job downloads the candidate `.lxp`, checksum, and build manifest
- **THEN** the job MUST revalidate the complete asset set, identity, version, size, and SHA-256 before calling the release API
- **THEN** the job MUST NOT reinstall dependencies, execute plugin code, or recreate the `.lxp`

#### Scenario: A pull request attempts to trigger publishing
- **WHEN** a workflow is triggered by a pull request, fork, or unprotected ref
- **THEN** every executable job MUST remain read-only and the release job MUST be unreachable
- **THEN** plugin output MUST NOT obtain GitHub Release or version-PR write authority

### Requirement: Each plugin version must be published as a complete, idempotent, independent GitHub Release
For each official plugin version, the system MUST use a stable tag `official/<plugin-id>/v<version>` and an independent draft GitHub Release. Before publication, the asset set MUST contain the precisely named `.lxp`, its SHA-256 file, and a release audit JSON, and upload readback MUST preserve identity, version, and digest. A plugin version MUST become public only when every asset is complete. Retries MUST be idempotent. A conflicting existing tag, record, or asset MUST fail closed, and a published asset or tag MUST NOT be overwritten or moved.

#### Scenario: A single-plugin release becomes public atomically
- **WHEN** a candidate is validated and the target tag and release do not exist
- **THEN** the workflow MUST create a draft, upload and read back the complete assets, and only then publish the plugin version
- **THEN** the operation MUST NOT create a desktop-application release, alter another plugin release, or publish an npm package

#### Scenario: The same release is retried
- **WHEN** the same plugin identity, version, and tag exist and every published asset exactly matches the candidate digest and audit record
- **THEN** the workflow MUST treat the retry as an idempotent success and MUST NOT rewrite an asset or move the tag

#### Scenario: A release conflicts or upload fails
- **WHEN** the existing tag points to another commit, an existing asset digest or record differs, or draft upload or readback fails
- **THEN** the workflow MUST retain or clean up only the non-public draft and refuse to publish the plugin version
- **THEN** the workflow MUST NOT overwrite a public asset, delete published history, or roll SemVer backward

### Requirement: The release audit record must be verifiable and must never create Host trust or permission

Every `.lxp` MUST continue to produce a schema-version `1`, locale-neutral, field-restricted, deterministic external audit record containing plugin identity and version, artifact name, size, and SHA-256, source repository, commit and ref, workflow run URL, and release tag. The record MUST remain outside the `.lxp` and author Manifest and MUST NOT declare a signature, trusted publisher, Host source, permission, grant, or authorization. The ordinary Host installer and Runtime MUST ignore this sidecar. An official release source MUST NOT change conclusions about open Web behavior, Host isolation, Session authority, or native Host APIs.

#### Scenario: Audit record matches candidate
- **WHEN** sidecar facts exactly match the candidate bytes and CI context
- **THEN** the checker accepts the operational audit relationship
- **THEN** acceptance does not constitute a signature, Host trust, permission, or Runtime capability

#### Scenario: User installs official release asset
- **WHEN** the user selects a release `.lxp` through the ordinary local-install entry point
- **THEN** the Host still injects the normal external installation source and uses the installation-as-trust flow
- **THEN** the release URL, sidecar, repository ownership, and Publisher do not relax Host or cross-plugin isolation

#### Scenario: Audit record is tampered with or injects authority

- **WHEN** the sidecar differs from the `.lxp` facts, bytes, or CI context, contains an unknown field, or claims official, verified, signature, permission, or grant status
- **THEN** the release fails before publication with a safe, stable diagnostic
- **THEN** the Host does not recover or infer authority from the sidecar

### Requirement: The official release process must have bilingual maintenance documentation and automated drift validation

Canonical English and path-matched Chinese release documentation MUST remain aligned on Changesets, PR, version, candidate and release flow, CODEOWNERS, least privilege, audit, open Runtime, and Host-isolation boundaries. The documentation MUST NOT describe removed permission gates or grants and MUST NOT interpret an official source as Host trust. Automated drift gates MUST cover the actual scripts, workflows, Contract versions, JSON, tags, assets, and capability status.

Commands, JSON fields, tags, asset names, and diagnostic codes MUST remain locale-neutral. The documentation MUST NOT describe signing, Marketplace distribution, automatic updates, or Host official trust as delivered capabilities.

#### Scenario: Permission model or Runtime docs drift
- **WHEN** a workflow, script, Contract, Runtime, audit record, or document still depends on a legacy permission gate or claims official sources receive additional authority
- **THEN** the release documentation gate fails with a stable repository-relative reason
- **THEN** pipeline-completion status cannot conceal current platform drift

#### Scenario: Maintainer follows either language to release one plugin

- **WHEN** a maintainer enters the official-plugin release document from the English or Simplified Chinese index
- **THEN** that language describes the complete corresponding sequence from Changeset and PR gate through version PR, candidate, release, and retry, including safety boundaries
- **THEN** both languages use the same machine interfaces, relative paths, and capability status

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

### Requirement: Task 7.1 completion must depend on repeatable independent-release evidence
The system MUST use committed valid and invalid fixtures and a temporary two-plugin dry-run to prove single-plugin path selection, independent version bumps, canonical packing, ordinary install preparation, Runtime E2E, audit records, idempotency, and failure recovery. Fixtures MUST NOT reside in product `plugins/official/*`, be registered by the Host, or produce a public release. Task 7.1 may be marked complete only after the focused gate, frontend tests, formatting, static analysis, type checking and build, Rust formatting, tests and checks, and strict OpenSpec validation all succeed.

#### Scenario: The dry-run releases only one simulated plugin
- **WHEN** only one plugin path and Changeset change in a two-plugin fixture
- **THEN** the dry-run MUST generate a bump, CHANGELOG, `.lxp`, checksum, audit record, and release plan only for that plugin
- **THEN** the other plugin and root application versions, CHANGELOGs, and release plan MUST remain unchanged, and no public release API may be called

#### Scenario: Final validation fails or an assumption remains unverified
- **WHEN** the focused gate, complete frontend or Rust validation, strict OpenSpec validation, or any required fixture scenario fails
- **THEN** Task 7.1 MUST remain incomplete and the Roadmap MUST NOT claim that the official release pipeline is delivered
- **THEN** after a fix, the failed command and the complete final validation set MUST run again
