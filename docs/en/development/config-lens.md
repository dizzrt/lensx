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
content. Language choice remains explicit. The Host Page chrome supplies the
visible ConfigLens identity, so the plugin document repeats neither a main
title nor a subtitle. The ready document has exactly two top-level regions:
one flexible content region and a semantic footer. The Monaco surface fills
the complete content region without
page padding, a content/footer gap, or its own card border or radius. The
footer remains pinned to the bottom of the plugin viewport and meets Monaco at
one separating edge. It is exactly 40 logical pixels high in the normal layout
and vertically centers the explicit language selector, non-diagnostic status,
Format, and Compact controls. Validation diagnostics remain Monaco markers;
the footer presents no diagnostic count, summary, list, or additional row. At
no more than 520 logical pixels wide or 260 logical pixels high, the controls
may use two rows inside a fixed 72-logical-pixel footer, while outer padding and
the content/footer gap remain zero. Editor content and validation state cannot
move the footer away from the viewport bottom. The plugin performs no fetch,
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

## Limits, Chunks, And Deterministic Checks

The HTML entry is a minimal bootstrap. It creates the single public WebView
transport and SDK client before React, React DOM, Semi Design, Plugin UI,
Monaco, or language adapters are loaded. Before Runtime Context exists, normal
startup exposes only accessible busy semantics; a focusable retry control
appears only after failure. After Context arrives, the mount bundle and
single-flight Monaco loader start in parallel. Retry disposes the old attempt
before starting a fresh client.

The main thread enforces 2 MiB UTF-8 and 100,000-line input limits before
dispatch. Language work runs in a replaceable module Worker with a five-second
deadline and at most 200 safe diagnostics. Monaco uses a separate package-owned
editor Worker. Every emitted resource remains in self-contained `dist/` and
the canonical `.lxp`.

The production artifact check enforces at most 256 KiB of directly referenced
JavaScript and 64 KiB of directly referenced CSS. The initial module inventory
must contain no React, React DOM, Semi Design, Plugin UI, Monaco, or language
adapter module. Broader budgets remain 24 MiB for complete uncompressed
`dist/`, 8 MiB for all JavaScript and the compressed `.lxp` independently,
4 MiB per Monaco or language chunk, and 2 MiB per Worker entry.

Rstest covers both locales, light and dark semantic tokens, empty, valid,
invalid, limit, long-copy, keyboard, focus, recovery, single-editor replacement,
one-operation undo, and content-plus-footer state. Source and compiled-CSS
contracts cover the continuous workbench, fixed-bottom 40-pixel footer, absence
of footer diagnostics, Monaco diagnostic markers, and fixed 72-pixel constrained
fallback. Rust and lifecycle tests
cover same-attempt hide and restore, close and reopen, replacement, cleanup, and
resource revocation. These deterministic checks do not sample target-environment
latency, launch a browser or real WebView, or maintain rendering output.

Run:

```bash
pnpm run gate -- ci-plugins
```

Plugins CI builds required public dependencies and runs the ConfigLens package
lifecycle once, followed by its pure Node built-output check.
