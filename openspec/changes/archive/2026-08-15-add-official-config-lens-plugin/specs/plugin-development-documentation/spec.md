## ADDED Requirements

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

## MODIFIED Requirements

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
