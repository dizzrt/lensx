# Plugin Package Format

## Shipped Scope

lensX defines and implements package protocol `0.1.0` for one-file plugin delivery. The visible extension is
`.lxp`; the bytes are exactly one restricted Zstandard frame containing a canonical ustar-compatible TAR stream.
The workspace-private TypeScript reference implementation and the Host-private Rust inspector consume the same
committed corpus and return the same `invalid | compatible | incompatible` result, inspection facts, safe
diagnostics, and whole-package digest.

This capability inspects bytes only. It does not provide a public CLI, accept a development directory, create an
installation directory, mutate the Plugin Manager, register Actions or Pages, load assets, create an iframe, execute
plugin code, grant permissions, verify signatures, or infer provenance.

## Canonical Layout

The decompressed TAR entries are ordered as follows:

1. `manifest.json`;
2. `checksums.json`;
3. every other file in ascending UTF-8 path-byte order.

Only regular files are allowed. Headers use mode `0644`, `uid=0`, `gid=0`, `mtime=0`, empty owner/group names, the
ustar magic/version, and no source filesystem metadata. The stream ends with exactly two zero blocks. Directories,
links, devices, FIFOs, sparse data, PAX/GNU extensions, xattrs, ACLs, duplicate paths, and ASCII case-insensitive
collisions are invalid.

Paths are NFC UTF-8 relative paths with `/` separators, at most 100 UTF-8 bytes and 16 segments. Segments use only
ASCII letters, digits, `.`, `_`, and `-`, begin and end with an alphanumeric character, and cannot use Windows
reserved basenames. These package portability rules are intentionally stricter than the Manifest string schema.

## Integrity And Identity

`checksums.json` is canonical UTF-8 JSON with no BOM, LF line endings, exactly one final newline, fixed field order,
and no unknown fields. It declares:

```json
{"package_format_version":"0.1.0","algorithm":"sha256","files":[]}
```

`files` contains every regular file except `checksums.json` itself, sorted by path bytes. Each record contains only
`path`, exact decompressed `size`, and a lower-case SHA-256. Missing, extra, duplicate, reordered, non-canonical, or
mismatched records invalidate the package.

Three integrity values have different roles:

- the Zstandard frame checksum catches transport corruption quickly;
- per-file SHA-256 records establish internal file/checksum consistency;
- the algorithm-labelled package digest is SHA-256 over every byte of the complete `.lxp` file and establishes the
  package identity consumed by later trusted Host workflows.

The author Manifest cannot declare the package digest, installation source/path, enabled state, grants, lifecycle,
Runtime state, signature status, or official/verified provenance. Publisher text remains untrusted author data.

## Zstandard Profile And Limits

An accepted `.lxp` has exactly one standard frame with content size and content checksum. Dictionaries, skippable or
concatenated frames, trailing bytes, and windows larger than 64 MiB are rejected before decompression. Both inspectors
decode incrementally, set their own limits, and map codec/TAR/I/O failures to stable diagnostics without returning raw
errors or Host paths.

| Limit | Protocol `0.1.0` value |
| --- | ---: |
| Compressed `.lxp` | 64 MiB |
| Zstandard window | 64 MiB |
| Decompressed TAR stream, including headers and padding | 256 MiB |
| Regular files, including metadata records | 4096 |
| One payload file | 64 MiB |
| `manifest.json` | 1 MiB |
| `checksums.json` | 4 MiB |
| Entry path | 100 UTF-8 bytes / 16 segments |

The reference packer uses compression level 19, enables content size and checksum, and never uses a dictionary. The
format accepts other encodings that satisfy the frame profile, but only the fixed reference dependency and parameters
define the committed byte-for-byte reproducibility baseline.

## Manifest And Resource Inspection

Checksums are verified before `manifest.json` enters the existing `@lensx/plugin-contract` validation and
normalization API or its Rust counterpart. Package inspection does not duplicate Manifest schema, semantics, defaults,
or compatibility logic. A structurally valid Manifest outside the current lensX or Host API range produces
`incompatible`; package, checksum, Manifest, or resource failures produce `invalid`.

The normalized `runtime.entry` plus every display, Page, and Action asset path must resolve exactly to a checksummed
regular payload file. Matching does not case-fold, URL-decode, replace separators, canonicalize a filesystem path, or
permit a metadata record target. Inspection reads metadata bytes but never loads HTML/assets or executes code.

Invalid results expose only sorted, deduplicated `{ code, path, message }` diagnostics. They contain no partial
Manifest, file map, trusted digest fact, Host state, absolute path, raw exception, stack, or file content.

## Reviewed Dependencies

The dependency versions are exact repository inputs, not wire-format facts:

| Layer | Dependency | License and platform/maintenance basis | Required capability |
| --- | --- | --- | --- |
| TypeScript | `@structured-world/structured-zstd@0.0.49` | Apache-2.0; pure Rust/WASM ESM; Node >=18; SIMD and scalar payloads run on Node 24 across macOS, Windows, and Linux; current package source and release metadata were reviewed when protocol `0.1.0` was implemented. | Level 19 one-shot encoding with content size/checksum plus checksum-verifying streaming decode; no Node experimental API, native addon, system executable, or dictionary. |
| TypeScript | Node `crypto` plus the repository canonical TAR implementation | Node 24 built-ins and project-owned restricted writer/parser. | Incremental SHA-256, exact ustar bytes, and fail-closed profile checks without accepting general archive extensions. |
| Rust | `zstd = 0.13.3` | MIT; maintained Rust bindings to zstd `1.5.7`, with streaming decoder and explicit maximum window parameter on supported desktop targets. | Single-frame checksum-verifying streaming decode. |
| Rust | `tar = 0.4.45` | MIT/Apache-2.0; maintained cross-platform Rust crate. | Header parsing only; project code still compares every byte with the restricted canonical header and rejects extensions. |
| Rust | `sha2 = 0.10.9` | MIT/Apache-2.0; RustCrypto implementation used across supported desktop targets. | Incremental SHA-256 for files and package identity. |

Any dependency, encoder parameter, constant, fixture byte, or digest change must be reviewed explicitly. The drift gate
does not rewrite baselines.

## Validation

Run the dedicated gate from the repository root:

```bash
pnpm run check:plugin-package-format
```

It checks pinned dependencies and duplicated cross-language constants, verifies committed fixture bytes without
rewriting them, runs focused TypeScript and reproducibility tests, and runs the Rust shared-fixture and boundary tests.
Only an intentional baseline update uses:

```bash
pnpm run generate:plugin-package-format-fixtures
```

The corpus owns `valid`, `invalid`, `incompatible`, and `reproducible` cases plus explicit expected normalized
Manifest, inspection facts, diagnostics, file/checksum facts, and reference `.lxp` digest.
