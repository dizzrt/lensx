## MODIFIED Requirements

### Requirement: Package inspection MUST enforce the current WebView Manifest protocol
The canonical `.lxp` TAR/Zstandard/checksum profile MUST remain unchanged, but inspection and packing MUST consume Manifest Contract `0.4.0`, including deterministic Page presentation defaults and validation. A package containing an iframe, Manifest `0.3.x` or older, or invalid/native presentation fields MUST be classified as incompatible or invalid before installation or execution, while an otherwise identical WebView package MUST retain reproducible bytes and cross-language classification. Package facts MUST NOT contain current monitor data, effective runtime clamp, user-adjusted size, native handles, or persisted presentation state.

#### Scenario: Canonical WebView package is inspected
- **WHEN** a package contains a valid `0.4.0` WebView Manifest, optional bounded Page presentations, and all referenced files
- **THEN** TypeScript and Rust inspection produce the same safe normalized package facts
- **THEN** no native Runtime, bridge authority, monitor fact, current user size or executable Window setter is encoded in the archive

#### Scenario: Default presentation package is packed twice
- **WHEN** a valid Page omits presentation and otherwise unchanged sources are packed twice
- **THEN** both archives remain byte-identical and inspection reports the same fixed `650×600` normalized default
- **THEN** normalization does not rewrite the author Manifest bytes inside the canonical archive

#### Scenario: Legacy or native-authority package is inspected
- **WHEN** a structurally canonical archive contains an iframe, Manifest `0.3.x` or older, or presentation fields for position, monitor, constraints, native label, maximize or fullscreen
- **THEN** inspection returns a stable incompatible/invalid result before payload commit
- **THEN** the archive is not rewritten or executed through a fallback

