# Compatibility And Errors

## Version dimensions

Track these dimensions independently:

| Dimension | Current baseline | Meaning |
| --- | --- | --- |
| Contract package | `0.4.0` | Public Manifest and Host API semantic contracts. |
| UI/Testkit/CLI packages | `0.2.1` | UI, test helpers, and authoring tools. |
| SDK package | `0.5.0` | Root semantic client plus the `/webview` production transport. |
| Manifest protocol | `0.4.0` | Author input and normalized WebView Manifest wire contract. |
| Host API protocol | `0.4.0` | Semantic methods, results, events, errors, and context. |
| Private bridge carrier | `0.2.0` | Closed Host/native-to-plugin transport frames; not a Host API. |
| lensX application | `0.1.0` | Host compatibility range checked by the Manifest. |
| `.lxp` package format | `0.1.0` | Canonical archive and checksums profile. |

A package patch does not automatically change a protocol. SDK `0.5.0` supports
Host API `>=0.4.0 <0.5.0` and rejects older or incompatible Context before
ready. Current templates, ConfigLens, and Translation declare this same range.
Existing SDK `0.3.0` and `0.4.0` bundles do not understand the current activation
catalog. Upgrade public dependencies, update the Manifest range, rebuild, and
repack; the Host does not negotiate an old catalog or rewrite installed packages.
The optional callback may remain omitted after migration. UI, Testkit, and CLI
patch versions carry updated dependency metadata and templates; Manifest, carrier,
application, and package-format versions remain unchanged.

Activation subscription begins during SDK initialization only when Context
advertises `actions.subscribe_activations`. A failure before opening this stream
can return to idle for explicit retry. Once subscription has been attempted,
initialization failure terminates the SDK/transport/Session attempt. Retry must
create a fresh Runtime attempt and SDK; old activations are not replayed.

## Validation outcomes

- **compatible**: structure, semantics, resources, package profile, and current
  version ranges are accepted by that checker.
- **incompatible**: input is structurally valid, but a current lensX or Host API
  version falls outside its range.
- **invalid**: Schema, semantic, path, resource, checksum, limit, or canonical
  package requirements fail.

CLI `validate` and `inspect` are read-only classifications. `pack` builds unless
`--no-build` is present, then validates, writes transactionally, and
self-inspects. The Host performs its own trusted inspection and preparation;
CLI compatibility does not promise installation or execution.

## Error taxonomy

Manifest and package diagnostics use stable machine-readable code/path pairs.
CLI envelopes distinguish usage error, operational failure, invalid,
incompatible, and success without printing arbitrary child output into JSON.
Host API method errors are listed in [Host API](host-api.md#stable-errors).
SDK lifecycle errors cover cancellation, timeout, transport failure,
disconnection, disposal, invalid context, and incompatible Host API.

Manifest `0.3.x` and older packages, including legacy iframe packages, are a
migration-only incompatibility case. The Host and CLI do not rewrite them and
there is no fallback Runtime; rebuild from a current template and migrate to
`@lensx/plugin-sdk/webview`.

Never branch on an English message. Use the stable code and bounded public
location, then show localized recovery text. Do not log package contents,
selected paths, stored values, or private failure details.

## Troubleshooting order

1. Confirm Node/pnpm ranges and that real package tarballs match the Host build.
2. Run project test and typecheck.
3. Build and confirm `dist/manifest.json` plus every referenced resource exists.
4. Run CLI validate; fix invalid before considering compatibility.
5. Pack twice and inspect; identical input must produce identical bytes.
6. For Development Mode, confirm the dedicated build, explicit opt-in, current
   registration, and manual reload result.
7. For a formal package, use Settings local installation and follow the Host's
   bounded preparation result and trust confirmation.
8. At Runtime, distinguish native load, bridge ready, SDK context, disconnect,
   and timeout. A loading surface with no bridge ready points to document or
   transport startup; a context failure points to Host API compatibility.
9. For presentation problems, run
   `pnpm run gate -- plugin-child-webview-runtime` and
   `pnpm run gate -- plugin-child-webview-session`; these diagnose deterministic
   contract and lifecycle boundaries and do not claim native rendering proof.

Fix the first failing boundary and rerun from canonical inputs; do not reuse a
generated cache from a previous failed attempt.

## Not delivered

The public packages are not published to npm. There is no public download URL,
watch/HMR, automatic Development Mode reload, signing, Marketplace, remote
distribution, automatic update, or user-selected rollback history. Do not
translate those absences into guessed commands or fallback imports.
