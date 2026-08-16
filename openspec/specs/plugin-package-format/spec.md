# Plugin Package Format Specification

## Purpose

Define the independently versioned `.lxp` delivery protocol, canonical
Zstandard and TAR profile, integrity and resource-validation rules, hard
limits, deterministic diagnostics, cross-language reproducibility, and the
boundary between author-controlled package bytes and Host-owned facts.
## Requirements
### Requirement: Plugin packages must use an independently versioned `.lxp` content protocol

The system MUST define `.lxp` as the user-visible extension for lensX plugin
packages and MUST identify its contents as the restricted canonical TAR over
Zstandard profile for package protocol `0.1.0`. The package protocol MUST be
versioned independently from npm package versions, the Manifest protocol, the
Host API, the Registration Contract, the Plugin Manager Store, and the lensX
application version. The system MUST determine the format from the contents,
required records, and the package protocol version in `checksums.json`; it MUST
NOT accept an input solely from its filename or extension and MUST NOT provide
an implicit alias, fallback, or migration path for legacy ZIP or
`.lensx-plugin` inputs.

#### Scenario: Accept the current `.lxp` package protocol

- **WHEN** an input has an `.lxp` name, one valid Zstandard frame, a canonical
  TAR payload, and `package_format_version: "0.1.0"`
- **THEN** the system continues package-content and Manifest validation
- **THEN** the package version does not change or replace the Manifest, Host
  API, or application version

#### Scenario: The suffix is correct but the contents are not `.lxp`

- **WHEN** an input named `example.lxp` does not use the supported
  Zstandard/TAR package profile
- **THEN** the system rejects it with a stable package-format diagnostic
- **THEN** the system does not try to interpret it as ZIP, plain TAR, a
  directory, or another compression format

#### Scenario: The package protocol version is unsupported

- **WHEN** `checksums.json` omits `package_format_version` or declares any value
  other than `0.1.0`
- **THEN** both the TypeScript and Rust inspectors classify the package as
  `invalid`
- **THEN** neither inspector continues by applying a compatibility alias or
  guessing another package version

### Requirement: `.lxp` must contain a restricted and deterministic canonical TAR payload

The Zstandard output MUST be a canonical TAR stream expressible as ustar. The
TAR MUST contain regular files only and MUST NOT contain explicit directories,
symbolic links, hard links, devices, FIFOs, sparse files, PAX or GNU extensions,
xattrs, ACLs, or any other special entry. The first entry MUST be root
`manifest.json`, the second MUST be root `checksums.json`, and all remaining
entries MUST be in strict ascending UTF-8 path-byte order with each path
appearing exactly once. Every regular-file header MUST use `uid=0`, `gid=0`, an
empty owner and group name, `mtime=0`, and mode `0644`, and MUST NOT preserve
source-filesystem metadata.

Each entry path MUST be an NFC UTF-8 relative path that uses `/` separators,
is at most 100 UTF-8 bytes long, and has at most 16 segments. Each segment MUST
contain only ASCII letters, digits, periods, underscores, or hyphens; MUST
start and end with a letter or digit; and MUST NOT be empty, `.`, `..`, a
Windows reserved basename, or a name that creates an ASCII case-insensitive
collision.

#### Scenario: Accept canonical TAR entries

- **WHEN** a TAR starts with `manifest.json` and `checksums.json`, contains all
  other regular files in path-byte order, and every header and path satisfies
  the canonical profile
- **THEN** both inspectors read the same entry identities in the same order
- **THEN** source-filesystem time, owner, group, permissions, and enumeration
  order do not affect the package contents

#### Scenario: Reject a special or duplicate entry

- **WHEN** a TAR contains a symbolic link, directory, device, extended header,
  duplicate path, or case-insensitive path collision
- **THEN** the inspector classifies the entire package as `invalid` before
  writing an installation directory or parsing a Runtime entry
- **THEN** diagnostics do not expose Host absolute paths or raw parser errors

#### Scenario: Reject non-canonical order or metadata

- **WHEN** the required records are not the first two entries, payload entries
  are unsorted, or any header contains non-canonical uid, gid, mtime, mode,
  owner, or group metadata
- **THEN** the system rejects the package instead of silently reordering or
  normalizing the input
- **THEN** partially read content does not become an installation or
  registration fact

### Requirement: `.lxp` must use one restricted Zstandard frame

An `.lxp` file MUST contain exactly one standard Zstandard frame. The frame
MUST declare its decompressed content size, MUST enable the frame checksum,
MUST NOT use a dictionary, skippable frame, concatenated frame, or trailing
bytes, and MUST declare a window no larger than 64 MiB. Inspectors MUST decode
incrementally and enforce their own authorized memory and output limits; they
MUST NOT preallocate the entire declared output from an untrusted frame header.

#### Scenario: Accept a restricted single-frame input

- **WHEN** an input contains one standard frame with a declared content size,
  checksum, window no larger than 64 MiB, and no trailing bytes
- **THEN** the inspector streams the TAR bytes and continues canonical payload
  validation
- **THEN** the Zstandard frame checksum acts only as a transport-corruption
  check and does not replace SHA-256 package checks

#### Scenario: Reject multiple frames, a dictionary, or an oversized window

- **WHEN** an input uses a dictionary, a skippable or concatenated frame, a
  window larger than 64 MiB, or trailing bytes after the frame
- **THEN** both inspectors classify the package as `invalid` with a stable
  diagnostic
- **THEN** neither inspector falls back to a more permissive Zstandard mode

#### Scenario: The declared decompressed size is untrusted

- **WHEN** the frame declares a content size above the limit, actual output
  exceeds the limit, or the checksum fails
- **THEN** the inspector stops decoding immediately and rejects the package
- **THEN** the failure does not create a Plugin Manager record, installation
  directory, or Runtime state

### Requirement: `checksums.json` must completely describe package regular files

Root `checksums.json` MUST be canonical UTF-8 JSON without a BOM, use LF line
endings, and end with exactly one newline. It MUST contain only the fixed-order
`package_format_version`, `algorithm`, and `files` fields, MUST declare
`package_format_version: "0.1.0"` and `algorithm: "sha256"`, and MUST reject
unknown, missing, duplicate, or incorrectly typed fields.

`files` MUST be in strict ascending path-byte order and MUST contain exactly
one `{ path, size, sha256 }` record for every TAR regular file other than
`checksums.json` itself. `size` MUST equal the actual decompressed byte count,
and `sha256` MUST be the lowercase 64-character hexadecimal SHA-256 of those
bytes. An extra, missing, duplicate, or mismatched checksum record MUST make
the entire package invalid.

#### Scenario: Checksums match every file

- **WHEN** `files` exactly covers `manifest.json` and every payload file, and
  every size and SHA-256 matches the actual bytes
- **THEN** the inspector accepts the per-file integrity relationship and
  continues Manifest and resource validation
- **THEN** `checksums.json` does not recursively contain a checksum record for
  itself

#### Scenario: A file or checksum changes

- **WHEN** a file's content, path, or size differs from its checksum record, or
  `files` contains an extra, missing, or duplicate record
- **THEN** the inspector classifies the package as `invalid`
- **THEN** the inspector does not publish a partially successful file map or
  normalized Manifest

#### Scenario: Distinguish checksums, the frame checksum, and the package digest

- **WHEN** a tool or Host calculates the identity of a valid `.lxp`
- **THEN** the package digest is an algorithm-labelled SHA-256 over the complete
  `.lxp` bytes, while per-file checksums describe only TAR regular files
- **THEN** the Zstandard frame checksum, per-file SHA-256 values, and package
  digest do not replace one another or enter the author Manifest

### Requirement: Package inspection must enforce consistent resource limits

The system MUST enforce the same first-version hard limits in TypeScript and
Rust: a compressed `.lxp` no larger than 64 MiB, a Zstandard window no larger
than 64 MiB, a canonical decompressed TAR stream no larger than 256 MiB, no
more than 4096 regular files, no single file larger than 64 MiB,
`manifest.json` no larger than 1 MiB, `checksums.json` no larger than 4 MiB,
and an entry path no longer than 100 UTF-8 bytes or 16 segments. When a limit
would be violated, the inspector MUST fail closed before allocating, hashing,
or reading additional payload beyond the authorized bound.

#### Scenario: A package is within every limit

- **WHEN** the compressed size, window, decompressed stream, file count,
  individual files, metadata records, and paths are all within the first
  version limits
- **THEN** limit checks allow package and Manifest validation to continue
- **THEN** both implementations report the same observable counts and sizes

#### Scenario: Any limit is exceeded

- **WHEN** a package exceeds any compressed, decompressed, window, file-count,
  individual-file, metadata, or path limit
- **THEN** the inspector classifies the package as `invalid` with the
  corresponding stable code
- **THEN** acceptance does not depend on remaining disk space, system memory,
  or a platform default

#### Scenario: An empty or metadata-only package

- **WHEN** the payload lacks `manifest.json`, `checksums.json`, or a Runtime
  entry or Page resource required by the Manifest
- **THEN** the package is classified as `invalid`
- **THEN** the system does not create an empty plugin, placeholder plugin, or
  default Runtime file

### Requirement: Package inspection must reuse the Manifest Contract and resolve every resource reference

The package inspector MUST pass `manifest.json` bytes as unknown author input
to the existing Manifest validation and normalization API or its Rust
counterpart, and MUST NOT duplicate or relax the Manifest Schema, semantics,
defaults, compatibility algorithm, or diagnostics. Only a Manifest whose
checksums have been verified may enter Manifest validation.

The Manifest `runtime.entry` and every display, Page, and Action asset path
MUST resolve as an exact package path to a checksummed regular payload file.
Path matching MUST NOT guess through case folding, URL decoding, platform
separator replacement, or filesystem canonicalization. A reference to a
metadata record, unknown path, directory, or bytes not covered by checksums
MUST make the package invalid.

#### Scenario: Every Manifest resource exists

- **WHEN** a Manifest passes the existing Contract and its Runtime entry and
  every asset resolve exactly to checksummed regular files
- **THEN** package inspection returns the validated normalized Manifest and
  package file facts
- **THEN** inspection does not load HTML, create an iframe, or execute plugin
  code

#### Scenario: The Runtime entry or an asset is missing

- **WHEN** a Manifest Runtime entry or asset path is absent from the canonical
  file map, differs only by case, or targets a metadata record
- **THEN** both inspectors classify the package as `invalid` with the same
  logical-path diagnostic
- **THEN** a Manifest string passing the static Contract does not override the
  package-level failure

#### Scenario: The Manifest is valid but incompatible

- **WHEN** package structure, checksums, and resources are valid, but the
  normalized Manifest lensX or Host API compatibility range excludes the
  current version
- **THEN** package inspection returns `incompatible` rather than `invalid`
- **THEN** this capability does not install, enable, authorize, or execute the
  package

### Requirement: Reference packing and package inspection must be reproducible and consistent across languages

The repository reference packer MUST produce byte-for-byte identical `.lxp`
output from the same canonical file map, package protocol and tool revision,
and fixed dependencies and parameters. It MUST use a fixed high-compression
Zstandard profile whose initial compression level is 19. A change to a
parameter, codec dependency, or output byte MUST be reviewed explicitly as
fixture digest drift and MUST NOT silently update a baseline.

The system MUST provide shared valid, invalid, incompatible, and reproducible
package fixtures consumed by TypeScript and Rust. For each case, both
implementations MUST agree on status, normalized Manifest, file and checksum
facts, safe diagnostics, and reference package digest.

#### Scenario: Pack the same input repeatedly

- **WHEN** the reference packer in one tool revision reads canonical input file
  maps with identical bytes but different source metadata or enumeration order
- **THEN** both runs produce identical `.lxp` bytes and package SHA-256 values
- **THEN** source mtime, uid, gid, permissions, and directory enumeration order
  do not enter the output

#### Scenario: Rust and TypeScript inspect the same fixture

- **WHEN** both implementations inspect any committed `.lxp` case in the shared
  corpus
- **THEN** they return the same status, facts, and sorted diagnostics
- **THEN** drift in either implementation, the fixtures, or a format constant
  fails the dedicated package-format gate

#### Scenario: Different compliant encodings contain the same payload

- **WHEN** a non-reference producer creates an `.lxp` that satisfies the
  single-frame profile and decompresses to the same canonical TAR and checksum
  file map
- **THEN** the inspector may accept it as the same package payload
- **THEN** the file still has its own package digest over its complete `.lxp`
  bytes and does not impersonate the reference output digest

### Requirement: Package diagnostics must be stable, safe, and deterministic

A failure result MUST contain only stable `{ code, path, message }`
diagnostics. `code` MUST belong to the finite set defined by the package
protocol, `path` MUST use a package logical path or reserved frame/archive
location, and `message` MUST be stable, safe English text. Diagnostics MUST be
sorted by `path` and `code` and MUST NOT contain a Host absolute path,
temporary directory, raw exception, stack, environment text, Manifest or file
contents, or another sensitive value. For an invalid package, the inspector
MUST NOT return a partial Manifest, file map, trusted package fact, or Host
state.

#### Scenario: Several independent problems coexist

- **WHEN** a package contains multiple checksum, path, or resource-reference
  problems that can be inspected safely
- **THEN** the inspector returns deduplicated, deterministically sorted stable
  diagnostics
- **THEN** TypeScript and Rust agree on the observable diagnostic set

#### Scenario: A low-level codec or I/O error contains private information

- **WHEN** TAR, Zstandard, hashing, or input handling produces a failure that
  includes a path or low-level error text
- **THEN** the boundary maps it to a stable package-protocol code, logical
  path, and canonical message
- **THEN** private text does not enter fixtures, serialized results, or
  application-log assertions

### Requirement: The package format must not declare Host source, signature, permission, or lifecycle facts

An `.lxp` Manifest, checksums, and payload MUST NOT declare Host-owned source,
installed path, package digest, enabled state, legacy permission or grant fields, signature
status, verified or official provenance, lifecycle, or Runtime session.
Development sources and unsigned local sources MUST use the same canonical
package payload, and the Host MUST inject source facts outside the package.
First-version package validation MUST NOT skip any structure, checksum,
Manifest, resource, or limit check because of publisher text, the filename, or
an expected official source.

A future signing capability MUST cover the entire canonical `.lxp` package
digest or use a separate outer or sidecar envelope for the signature and
provenance. It MUST NOT write signature facts into the author Manifest or
change this capability's local validation or Host authority result.

#### Scenario: A Publisher claims an official source

- **WHEN** Manifest publisher text claims that lensX officially publishes the
  package
- **THEN** the package receives the same complete inspection as third-party
  input
- **THEN** package inspection does not create official, verified, signed,
  trusted, or automatically authorized facts

#### Scenario: Development and unsigned sources have identical contents

- **WHEN** the Host later receives byte-identical valid `.lxp` files through a
  development workflow and an unsigned local workflow
- **THEN** they share the same package payload facts and digest
- **THEN** their different sources exist only as separate Host facts and do not
  change the Manifest or checksums

#### Scenario: Inspecting a valid package creates no downstream capability

- **WHEN** an `.lxp` passes package-format inspection
- **THEN** this capability does not create an installation directory, Plugin
  Manager record, Tauri command, Action or Page, iframe, Runtime session, Host
  API, native authority, or signing conclusion
- **THEN** later installation, execution, Host API, and signing tasks must
  consume and constrain these package facts explicitly

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

