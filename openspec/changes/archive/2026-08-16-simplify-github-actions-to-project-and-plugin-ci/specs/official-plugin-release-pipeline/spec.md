## REMOVED Requirements

### Requirement: Each official plugin must be an independent, constrained release unit

**Reason**: The repository no longer provides an official-plugin release pipeline; current automation is limited to validation CI.

**Migration**: Direct plugin discovery and public-boundary validation move to `repository-continuous-integration`; independent release-unit rules are not retained as a supported release contract.

### Requirement: Path impact and Changesets must control validation scope and release intent separately

**Reason**: Automatic Changesets-driven version and release scoping is being retired.

**Migration**: Plugins CI uses path filters only to decide whether validation runs and never changes versions.

### Requirement: Changesets must produce reviewable, consistent, independent version history

**Reason**: The two target CI workflows do not create or consume release Changesets.

**Migration**: Remove Changesets-specific release gates from active CI; future versioning policy requires a separate capability proposal.

### Requirement: Every release candidate must pass platform and plugin automation gates

**Reason**: CI will no longer build, upload, or hand off release candidates.

**Migration**: Plugins CI performs ordinary clean builds and tests without treating output as a publishable candidate.

### Requirement: CI must isolate executable plugin code from release authority

**Reason**: No active CI job retains release authority, publishing credentials, or release mutations, so the previous two-stage release-authority model no longer exists.

**Migration**: The new CI capability requires both workflows to remain read-only and forbids publishing environments and secrets.

### Requirement: Each plugin version must be published as a complete, idempotent, independent GitHub Release

**Reason**: Automatic tag and GitHub Release publication is being removed.

**Migration**: No replacement publication behavior is introduced; a future release mechanism must be specified independently.

### Requirement: The release audit record must be verifiable and must never create Host trust or permission

**Reason**: The repository will not create release records or attach release audit metadata from CI.

**Migration**: CI logs retain ordinary validation evidence only and are not release audit records.

### Requirement: The official release process must have bilingual maintenance documentation and automated drift validation

**Reason**: The documented automatic release process is no longer supported.

**Migration**: Replace active release-operation documentation with bilingual continuous-integration documentation covering the two supported CI workflows.

### Requirement: The release pipeline MUST exercise ConfigLens as its first real product member

**Reason**: ConfigLens is no longer a special release-pipeline fixture because the release pipeline is being retired.

**Migration**: ConfigLens remains a direct plugin and is validated with every other `plugins/*` member by Plugins CI.

### Requirement: Task 7.1 completion must depend on repeatable independent-release evidence

**Reason**: Roadmap completion tied to the removed release workflows is no longer an active CI requirement.

**Migration**: Remove or revise release-specific roadmap evidence so it does not claim the retired automation remains supported.

### Requirement: Official candidates MUST pass the production Child WebView lifecycle gate

**Reason**: CI no longer produces official release candidates or candidate handoff artifacts.

**Migration**: Preserve applicable plugin `test:e2e` and runtime validation as blocking Plugins CI evidence without candidate identity, upload, or publishing semantics.
