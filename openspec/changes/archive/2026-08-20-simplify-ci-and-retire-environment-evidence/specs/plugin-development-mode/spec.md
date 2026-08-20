## REMOVED Requirements

### Requirement: Delivery MUST prove safe directory handling, atomic reload, production exclusion, and real Runtime teardown

**Reason**: This requirement mixes real WebView teardown and target macOS evidence into the delivery threshold. The environment-specific portion is no longer maintained.

**Migration**: Retain safe-directory, immutable-snapshot, atomic-reload, production-exclusion, generation-revocation, UI, workspace, and release-boundary assertions in deterministic Rust, TypeScript, React, package, and source-policy validation. Remove the WebView harness, producer, records, and Gate.

## ADDED Requirements

### Requirement: Delivery MUST deterministically prove safe directory handling, atomic reload, production exclusion, and lifecycle revocation

Delivery MUST combine Rust directory, snapshot, Manager, Resource, and lifecycle tests; TypeScript contract/service/state tests; React accessibility, localization, and theme tests; the shared directory corpus; workspace and release boundary checks; and production-build source policy. Validation MUST cover valid, invalid, incompatible, cancelled, source-race, link, limit, collision, reload success/failure/conflict, unchanged reload, legacy-contract rejection, disable/remove, cleanup failure, process restart, production exclusion, and old-generation authority revocation without requiring real WebView teardown evidence.

#### Scenario: Focused deterministic Development Mode validation passes

- **WHEN** the supported Rust, TypeScript, React, corpus, package, and boundary checks run
- **THEN** CLI and Host conclusions agree for shared payload semantics and every development transaction and UI requirement passes
- **THEN** state and boundary tests show the old scope, Session, pending RPC, and privileged handler authority unavailable after reload while the new generation uses the production policy

#### Scenario: A deterministic invariant cannot be proven

- **WHEN** validation cannot establish directory currentness, snapshot atomicity, source distinction, Host-authority non-escalation, lifecycle revocation, production exclusion, or cross-layer contract consistency
- **THEN** the capability remains incomplete while specification, design, or implementation is corrected
- **THEN** validation does not relax Runtime policy, hide failures, remove negative cases, or reintroduce real WebView evidence as a compatibility Gate
