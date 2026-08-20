# ConfigLens Official Plugin

## Product And Boundary

`plugins/config-lens` is the first product member of the official
plugin workspace. Its package is `@lensx/official-config-lens`, its plugin ID is
`dev.lensx.config-lens`, and its localized product name remains `ConfigLens`.
It contributes one `main` Page and one `open` Action, using the same public
Contract, SDK, UI, Testkit, CLI, local installation, isolated Runtime, and Host
API boundaries as an external plugin. Repository ownership and CI evidence
confer no trust, permission, persistence, clipboard, or native authority.

ConfigLens is an ephemeral configuration workbench for JSON, YAML 1.2, TOML
1.0, and XML 1.0. Input remains inside the current Page generation. Hiding and
restoring the Launcher does not close that Page: activation refreshes current
plugin facts and keeps the same Child WebView, Runtime Session, models, Workers, and
in-memory input while its relevant execution identity remains current. This
continuity uses no browser or Host persistence. Input is lost when the Page is
actually closed, disabled, replaced, reloaded, uninstalled, or otherwise torn
down. The Page has one editable Monaco model. Format replaces its content
directly for all four languages, while Compact is JSON-only; each successful
operation is one undoable editor edit, and failures preserve the current
content. Language choice remains explicit. The Host Page chrome supplies the visible ConfigLens identity, so the
plugin document repeats neither a main title nor a subtitle. The editable
Monaco surface comes first, followed by the explicit language selector and the
Format and Compact controls. The plugin performs no fetch,
WebSocket, browser storage, clipboard, Host persistence, or content logging.

## Reviewed Runtime Dependencies

Runtime versions are exact and changes require a new review.

| Dependency | Version | License | Role and review result |
| --- | --- | --- | --- |
| `monaco-editor` | `0.56.0` | MIT | Maintained browser ESM editor, tested on Node 24 tooling and WKWebView. Package-owned module Workers and chunks are emitted without CDN, runtime resolution, source maps, or `eval`. |
| `yaml` | `2.9.0` | ISC | Maintained browser export and YAML 1.2 document/CST support. Remote tags and resources are never resolved; aliases, depth, documents, and diagnostics remain bounded. |
| `toml-eslint-parser` | `1.0.3` | MIT | ESM parser with an explicit TOML 1.0 mode and Node 24 support. It contains no runtime fetch, `eval`, or WASM path and remains inside the language Worker. |
| `saxes` | `6.0.0` | ISC | Browser-compatible strict XML 1.0 streaming parser. ConfigLens rejects DOCTYPE, entity, XInclude, SYSTEM, and PUBLIC inputs before parsing, so no external entity resolution path exists. |

The review checked registry metadata and published tarballs for exact version,
license, maintenance timestamp, browser/ESM or compatible bundled entry, Node
24 authoring compatibility, CSP-sensitive dynamic code, network primitives,
embedded WASM, and unexpected install scripts. `@taplo/lib@0.5.0` was rejected
because its roughly 35 MiB embedded WASM/runtime path exceeded the product
budget and introduced fetch, WebAssembly, and dynamic-code complexity.
`smol-toml@1.7.1` was rejected because it targets TOML 1.1 and does not satisfy
the required TOML 1.0 numeric, date, and lexical-fidelity contract.

## Limits, Chunks, And Evidence

The HTML entry is a minimal bootstrap. It creates the single public WebView
transport and SDK client before React, React DOM, Semi Design, Plugin UI,
Monaco, or language adapters are loaded. Before Runtime Context exists, normal
startup stays visually empty and exposes only accessible busy semantics; a
focusable retry control appears only after failure. After Context arrives, the mount bundle and the single-flight
Monaco loader start in parallel; the connected client and validated Context are
injected into the mount, so no second client, Session, or bridge is created.
Retry disposes the old attempt before starting a fresh client.

The main thread enforces 2 MiB UTF-8 and 100,000-line input limits before
dispatch. Language work runs in a replaceable module Worker with a five-second
deadline and at most 200 safe diagnostics. Monaco uses a separate package-owned
editor Worker. JSON, YAML, TOML, and XML adapters are dynamically imported by
the language Worker, while every emitted resource remains in self-contained
`dist/` and the canonical `.lxp`.

The initial HTML graph has stricter budgets: directly referenced JavaScript is
at most 256 KiB and directly referenced CSS is at most 64 KiB, and its module
inventory must contain no React, React DOM, Semi Design, Plugin UI, Monaco, or
language adapter module. The broader drift budgets remain 24 MiB for complete
uncompressed `dist/`, 8 MiB for all JavaScript and the compressed `.lxp`
independently, 4 MiB per Monaco or language chunk, and 2 MiB per Worker entry.
The package gate records every
Monaco/language/CSS/Worker chunk and rejects remote loading, source maps,
private Host imports, unreviewed dependency versions, or budget drift. The
initial `800×600` resizable Page's 28-case primary visual matrix covers English and Simplified Chinese, light and
dark themes, empty, valid formatted content, invalid, limit, long-copy, focus,
and recovery states. The macOS WKWebView evidence also proves direct
single-editor replacement and one-operation undo.

Additional hard-minimum and larger user-resized cases verify the semantic
`content` plus `footer` layout. Monaco fills `content`; the language selector,
status, Format, JSON-only Compact, and bounded conditional diagnostics remain
inside `footer`. Same-attempt hide/restore preserves the current size, model,
Worker, input, and language. Real close/reopen resets to effective `800×600`;
user size is not persisted.

`first-interactive` is not a render marker. It requires the current Monaco
model, an explicit initial layout, a package-owned editor Worker handshake, and
native keyboard input that changes that model. A document-local event carries
no payload and grants no authority; the target harness independently checks the
current source, editor, input, and terminal cleanup. Release-like macOS evidence
requires p95 at most 500 ms; Development snapshot evidence allows 1000 ms.
Debug builds may be slower, but they use the same Runtime and cleanup path.
Actual close/reopen creates fresh SDK, model, editor, and Workers; only
same-attempt hide/restore retains them.

Run the plugin CI entry and focused product evidence from the repository root:

```bash
pnpm run gate -- ci-plugins
pnpm run gate -- official-config-lens-cold-open
pnpm run gate -- official-config-lens-warm-format
```

Plugins CI builds required public dependencies and runs package lifecycle,
built-output E2E, privacy/boundary checks, and the 28-case visual regression.
The focused cold-open and warm-format gates retain bounded macOS WKWebView and
product evidence. Evidence stores booleans and counts only; input, URL, origin,
path, nonce, Port, payload, and raw errors are forbidden.
