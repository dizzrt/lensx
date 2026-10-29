# Spec Delta

## MODIFIED Requirements

### Requirement: Compatibility status must be separate from Manifest validity

The current lensX version MUST be `0.1.0` and the current Host API protocol MUST be `0.4.0`; structural validity and version compatibility MUST remain separate classifications.

#### Scenario: Compatibility ranges classify a valid Manifest

- **WHEN** the current LensX and Host API versions are checked against declared ranges
- **THEN** Both compatibility ranges MUST contain valid SemVer `min_version` and `max_version_exclusive` values, with the minimum strictly less than the exclusive maximum.
- **THEN** A dimension is compatible only when `min_version <= current_version < max_version_exclusive`.
- **THEN** A structurally and semantically valid Manifest whose ranges exclude either current version MUST return `incompatible` rather than `invalid`.

#### Scenario: Packages cross the controlled HTTP protocol boundary

- **WHEN** any plugin package or maintained authoring template is evaluated against the current LensX and Host API version boundaries
- **THEN** Compatibility MUST depend only on the declared ranges and current lensX `0.1.0` and Host API `0.4.0`; no old-protocol negotiation is provided.
- **THEN** The Host MUST NOT silently negotiate old protocol catalogs, convert old packages, rewrite ranges, or bypass ranges using source or official identity.
- **THEN** An old package with `max_version_exclusive` of `0.3.0` or `0.4.0` MUST be explicitly classified as incompatible; its author must upgrade the SDK, update declarations, and repack.
- **THEN** Maintained templates, ConfigLens, and Translation MUST use the upgraded public packages and declare Host API `>=0.4.0 <0.5.0`; omitting the optional shortcut callback does not bypass version compatibility checks.

#### Scenario: Initial current versions are within both ranges
- **WHEN** current lensX `0.1.0` and Host API `0.4.0` both fall within their respective declared half-open ranges
- **THEN** the system classifies the valid Manifest as `compatible`

#### Scenario: A current version is outside its range
- **WHEN** current lensX `0.1.0` or Host API `0.4.0` falls outside its declared range
- **THEN** the system classifies the valid Manifest as `incompatible`
- **THEN** no alias, migration rule, or implicit catalog negotiation is used to satisfy the range

#### Scenario: A current version equals its exclusive upper bound
- **WHEN** the current LensX or Host API version equals its corresponding `max_version_exclusive`
- **THEN** the system classifies the valid Manifest as `incompatible`
- **THEN** it does not misreport structural Manifest corruption

#### Scenario: A compatibility range is empty or inverted
- **WHEN** either range has `min_version >= max_version_exclusive`
- **THEN** the system classifies the Manifest as `invalid`
- **THEN** the diagnostic points to the invalid compatibility range
