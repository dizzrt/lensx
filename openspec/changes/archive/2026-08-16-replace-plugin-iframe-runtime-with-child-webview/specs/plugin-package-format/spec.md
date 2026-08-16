## ADDED Requirements

### Requirement: Package inspection MUST enforce the current WebView Manifest protocol
The canonical `.lxp` TAR/Zstandard/checksum profile MUST remain unchanged, but inspection and packing MUST consume Manifest Contract `0.3.0`. A package containing an iframe or legacy Manifest MUST be classified as incompatible before installation or execution, while an otherwise identical WebView package MUST retain reproducible bytes and cross-language classification.

#### Scenario: Canonical WebView package is inspected
- **WHEN** a package contains a valid `0.3.0` WebView Manifest and all referenced files
- **THEN** TypeScript and Rust inspection produce the same safe normalized package facts
- **THEN** no native Runtime or bridge authority is encoded in the archive

#### Scenario: Legacy package is inspected
- **WHEN** a structurally canonical archive contains an iframe or `0.2.x` Manifest
- **THEN** inspection returns an incompatible protocol result before payload commit
- **THEN** the archive is not rewritten or executed through a fallback
