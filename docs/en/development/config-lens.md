# ConfigLens Official Plugin

## Product And Boundary

`plugins/config-lens` is the first product member of the official
plugin workspace. Its package is `@lensx/official-config-lens`, its plugin ID is
`dev.lensx.config-lens`, and its localized product name remains `ConfigLens`.
It contributes one `main` Page and one `open` Action, using the same public
Contract, SDK, UI, Testkit, CLI, local installation, isolated Runtime, and Host
API boundaries as an external plugin. Repository ownership and CI evidence
confer no trust, permission, persistence, clipboard, or native authority.

The Launcher Action title is `ConfigLens` in both `en-US` and `zh-CN`, following
the shared [Action naming guide](../plugin-development/public-packages.md#action-display-names).
Its identity remains `dev.lensx.config-lens.open`, with `main` as its Page
target and `open` as the default local Action. Existing Recent/Pinned IDs and
the opening Action's page context resolve the current title. Existing
functional keywords, including `JSON`, `format`, and `格式化`, remain unchanged;
neither `Open ConfigLens` / `打开 ConfigLens` nor opening-prefix compatibility
keywords are added. Installed copies receive the new Manifest through the
ordinary plugin update or development reload path; the Host does not rewrite
older titles.

ConfigLens is an ephemeral configuration workbench for JSON, YAML 1.2, TOML
1.0, and XML 1.0. The Page has one editable Monaco model. Format replaces its
content directly for all four languages; Compact is available only for the
current input version after strict JSON validation succeeds. Each successful
operation is one undoable edit. Failure or a stale result preserves the current
content, and recognition never rewrites or automatically formats it.

The Host Page chrome supplies the visible ConfigLens identity, so the plugin
document repeats neither a main title nor a subtitle. The ready document has
exactly two top-level regions: one flexible content region and one semantic
footer. Monaco fills the complete content region without page padding, a
content/footer gap, or its own card border or radius. The footer remains at the
bottom of the viewport, meeting Monaco at one separating edge. It is exactly
40 logical pixels high in the normal layout and contains only the language
selector, Format, and Compact. At no more than 520
logical pixels wide or 260 logical pixels high, these controls use two rows in
a fixed 72-logical-pixel footer; outer padding and the content/footer gap remain
zero. Editor content and validation state cannot move the footer.

There is no footer status node, reserved status space, empty-input hint, valid
message, progress summary, diagnostic count, or additional status region.
Buttons retain loading/disabled behavior and the operation group exposes
`aria-busy`. Errors appear as Monaco markers and an accessible live diagnostic
message inside the editor region. Worker failure and input-limit errors without
a precise location map to a safe starting range; correcting the input can
recover. Unrecognized ordinary text does not become a syntax error.

## Language Selection And Highlighting

A fresh document starts in Auto with no recognized language and a plaintext
model. The compact selector always displays `Auto` in English or `自动` in
Simplified Chinese while automatic mode is selected, including before, during,
and after analysis. Its manual options display only `JSON`, `YAML`, `TOML`,
and `XML`; the supported syntax versions remain JSON, YAML 1.2, TOML 1.0, and
XML 1.0. Automatic detection continues to drive highlighting, validation, and
operations internally without adding a detected-language or unresolved suffix.
The selector prefers 120 logical pixels and can shrink to 72 logical pixels in
constrained layouts, with a 120-pixel maximum and `flex: 0 1 120px`; it does not
expand to fill the row. The 40/72-pixel Footer heights stay unchanged.
Manual selection locks that language across editing, pasting, and clearing;
selecting Auto again clears the manual choice and analyzes the current input. Clearing
Auto returns to unrecognized plaintext and removes diagnostics, while clearing
a manual selection retains that selected language. Empty input cannot be
formatted or compacted.

Recognition combines structural candidates with the existing parsers in one
Worker request. Explicit XML structure selects XML, strict JSON objects and
arrays take priority over YAML, and TOML assignments or table headers such as
`port = 8080` and `[server]` select TOML. Clear but incomplete JSON or XML keeps
that language and can produce syntax diagnostics. YAML block/flow collections
remain eligible without making every scalar, ordinary string, or comment YAML.
If nonempty editing temporarily has no reliable new structure, Auto retains
its most recent automatically recognized language; a clear new structure can
switch it. The initial ambiguous case stays unrecognized. Manual selection is
the visible way to resolve intent; recognition is not a guarantee of intent or
valid syntax. XML external constructs retain the existing rejection rules.

Input and selection versions, operation generation, and Runtime locale/theme
context guard asynchronous results. Editing or changing any of those contexts
invalidates earlier work and schedules analysis for the current input. The
180ms debounce may retain previous coloring, but pending or unresolved analysis
cannot trigger a transform. The Format button and `Cmd/Ctrl+Enter` use the same
execution condition. Compact additionally requires the current input and
selection versions to have a valid strict JSON result.

Highlighting follows the effective language on the same model, with plaintext
for an unrecognized document. JSON uses the package tokenization module; YAML
and XML use its language definitions and configuration. A small project-owned
TOML Monarch definition covers tables and array tables, bare and quoted keys,
single-line and multiline strings, escapes, comments, booleans, numbers, and
date/time literals. These resources color incomplete text as well as valid
text. Coloring is independent of diagnostics and does not replace strict
Worker parsing or fidelity checks, particularly TOML 1.0 validation. Language
and light/dark theme changes preserve content and undo history. No second JSON
validation/formatting provider, remote schema resolver, LSP, completion service,
or additional language-service Worker is loaded.

## Native Find And Interface Language

`Cmd/Ctrl+F` invokes the native Monaco Find widget through `actions.find`,
including when the document is empty or its
language is unrecognized. Find provides previous/next match navigation,
no-result feedback, and case, whole-word, and regular-expression options.
Opening it repeatedly reuses the widget. Escape or its close control returns
focus to the editor without closing the plugin Page. Find itself does not edit
the document; if the native widget's explicit Replace operation is used, it
follows ordinary model changes, undo, and in-flight analysis invalidation.

ConfigLens-local styles keep native Find buttons vertically aligned and align
the widget with Monaco's existing reserved top space. With Find or expanded
Replace open and the editor scrolled to the top, the first content line remains
unobscured. Closing the widget releases that native space. This uses Monaco's
existing `find.addExtraSpaceOnTop` behavior without adding editor padding or
changing the shared Plugin UI reset.

Monaco's packaged Codicon TrueType font supplies the native Find icons. Its
emitted CSS URL must resolve relative to the stylesheet to the font within the
plugin package, and the emitted font bytes must match the locked dependency.
The Host resource service serves `.ttf` as `font/ttf` under its existing scoped
resource rules. No remote loading, new permission, or CSP change is required.

`Cmd/Ctrl+A` in the editor and the visible Select All context-menu item select
the whole model. While the Find input has focus, select all applies to its
query only. No document-wide selection handler takes focus from the language
Select, Host inputs, or another native view. The
[shared Child Runtime](../architecture/plugin-child-webview-runtime.md#native-editing-shortcuts)
owns native macOS delivery; that fix ships with the Host and is independent of
the plugin update. The shared native parent now preserves normal responder
command propagation for the valid focused descendant, covering Host input and
ordinary or Monaco-based Child documents. Existing compliant external plugins
need no source change, repackaging, SDK update, or added clipboard permission to
use the corrected Host. ConfigLens still owns Find and formatting commands;
the Host does not implement those business operations on its behalf.

On macOS, `Option+Shift+Left` and `Option+Shift+Right` extend the focused
editor body's selection using Monaco's default word boundaries. Repeating or
reversing direction extends or shrinks the range while preserving its selection
anchor. Empty documents, document boundaries, and read-only content retain
ordinary selection behavior. Selection creates no content edit or content-change
notification and does not clear or discard existing undo/redo entries. It follows
Monaco's grouping boundaries and may close the current typing group. When Find,
another input, or the Host owns focus, the body does not handle the gesture, change its selection,
or reclaim focus. Find's ordinary textarea word-selection defaults are outside
this correction.

ConfigLens loads Monaco's official `wordOperations` contribution through the
existing initialization chain after document NLS is ready and before the first
editor is created. Delivery requires an updated ConfigLens build. The shared
Host native boundary remains unchanged, with no custom keybinding table,
global handler, SDK or Manifest migration, or added permission.

The first valid Runtime Context fixes the document's Monaco interface language.
Package-owned NLS is initialized before the Monaco API, Find, word operations,
context menu, and diagnostic contributions are first imported, using one shared
loader for bootstrap preloading and editor initialization. English and Simplified Chinese
are supported. A later application locale change updates ConfigLens controls
and the diagnostic messages supplied by ConfigLens immediately. Monaco's native
Find, menu, and diagnostic-interaction framework text retains the opening
language until ConfigLens is actually closed and reopened. Recreating an
editor or retrying the SDK in the same document does not refresh evaluated
module messages. Theme changes apply immediately without reopening.

## Temporary State And Cleanup

Input, language mode, the effective language, Find query/options, selection,
and undo history remain in memory in the current Page generation. Hiding and
restoring Launcher preserves the same Child WebView, Runtime Session, model,
and Workers while execution identity remains current. This is not a close or
a new document. A real close/reopen starts empty in Auto with no recognized
language and uses the new opening interface locale. Disable, replacement,
development reload, uninstall, teardown, or an SDK failure/retry discards the
old editor and its temporary content/query state. A same-document retry keeps
only the module/NLS initialization described above.

Teardown disposes the model, editor and Find widget, content/layout
subscriptions, markers, language work, and editor Workers; late async work
cannot restore the previous surface. Find's global clipboard is disabled;
standalone clipboard/storage services use document memory only, and
query/replace history is not persisted. The package service adapter is isolated
to the fixed Monaco version and must be revalidated when that version is
reviewed. ConfigLens adds no programmatic system
clipboard access, Host clipboard request, private bridge, browser storage,
Host persistence, network recognition,
content logging, Fetch, or WebSocket path. Ordinary native Web editing retains
its existing clipboard behavior without a new Host permission.

## Reviewed Runtime Dependencies

Runtime versions are exact and changes require a new review.

| Dependency | Version | License | Role and review result |
| --- | --- | --- | --- |
| `monaco-editor` | `0.56.0` | MIT | Browser ESM editor with package-owned tokenizers, NLS, Find, module Workers, and chunks. Resources are emitted without CDN, runtime resolution, source maps, or `eval`. |
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
dispatch. Recognition and validation share one replaceable module Worker request with
a five-second total deadline and at most 200 safe diagnostics. Candidates do
not each receive a fresh timeout; input over the limits is not dispatched. Monaco uses a separate package-owned
editor Worker. Every emitted resource remains in self-contained `dist/` and
the canonical `.lxp`.

The production artifact check enforces at most 256 KiB of directly referenced
JavaScript and 64 KiB of directly referenced CSS. The initial module inventory
must contain no React, React DOM, Semi Design, Plugin UI, Monaco, or language
adapter module. Broader budgets remain 24 MiB for complete uncompressed
`dist/`, 8 MiB for all JavaScript and the compressed `.lxp` independently,
4 MiB per Monaco or language chunk, and 2 MiB per Worker entry.

Deterministic validation covers automatic/manual language state, structural and
incomplete fixtures, version races, shared budgets, cancellation and recovery,
real tokenizer output, native Find registration and supported DOM behavior,
ConfigLens-local Find alignment and native reserved-space lifecycle,
packaged Codicon font bytes and stylesheet-relative resource resolution,
first-import NLS, both locales/themes, single-model edits/undo, and resource
cleanup. Source and compiled-CSS contracts cover the continuous two-region
workbench, the 40/72-pixel footer, absence of a status region, button busy
semantics, and editor-owned accessible diagnostics. Rust and lifecycle tests
cover shared native shortcut policy, same-attempt hide/restore, close/reopen,
replacement, cleanup, and resource revocation. Built-output module inventory
must place Find, NLS, and the four tokenizers in the delayed graph while keeping
the initial graph free of heavy modules and extra language services. These are
validation responsibilities, not a substitute for the actual command results.
The checks do not sample target-environment latency, launch a browser or real
WebView, or maintain rendering output.

Language-selection cases use the real Semi Select. A shared helper follows the
combobox's `aria-controls` to its current listbox and owning dialog, selects by
the complete accessible option name, and sends `animationend` only when that
same dialog is still exiting. Completion requires the selected label, removal
of the popup, and exactly one new analysis request with the current source and
input version, intended selection, and incremented selection version. Empty
input invalidates prior work without dispatching an analysis request.

Focused regressions cover selection before and after popup positioning in both
locales and themes. Test-local fake timers advance the reviewed Semi 50ms
positioning fallback and confirm the animation state. The positioned branch
proves that the old label, request count, and selection version remain unchanged
until the target exit finishes. Cleanup unmounts the Page, drains only pending
timer work, checks that timers and popup portals are gone, and restores real
timers even after a failure. These explicit Happy DOM events model the Select
lifecycle and Page callbacks; they do not establish browser animation rendering
or operating-system input delivery.

The editing cases mount the actual Monaco editor in both locales and themes.
Body copy/cut/paste events reach Monaco's real listeners with test
`DataTransfer` objects; paste data is independent of `localClipboard` memory.
Assertions cover selected output, deletion/insertion, caret position,
`onInput` counts, and the editor's actual keyboard Undo/Redo commands. Empty
selection retains Monaco's configured whole-line clipboard behavior. Find
query edits remain separate from the body's model and undo history.

Word-selection cases send keyboard events through the actual Monaco commands
loaded by production initialization. They assert range, anchor, selected text,
repeated expansion and reverse contraction, empty/boundary/read-only behavior,
and non-body focus isolation in both locales and themes, while checking that
selection creates no content edit or `onInput` notification and preserves existing
undo/redo entries. A typing → word selection → typing sequence checks Monaco's
group boundary through actual Undo/Redo. The built-module inventory also checks
that `wordOperations` remains in the delayed editor graph. These
deterministic checks do not launch a GUI or establish operating-system delivery
of the Option+Shift gesture.

Find is an ordinary textarea: Happy DOM's missing clipboard defaults and
`document.execCommand` selection/history primitives are explicitly modeled for
that input. The tests still use the actual Find widget, focus transitions,
command selection, and query handlers. Across the body and query cases,
coverage includes cancellation, read-only or disabled targets, empty
clipboard/history, composition recovery, and return of focus through Escape.
Host and ordinary external-control tests use the same
explicit distinction between handlers and modeled browser primitives. No
synthetic `ClipboardEvent`, modeled history, or passing DOM assertion proves
AppKit delivery or a cross-application system clipboard round trip. Runtime
recovery reports are recorded separately and do not establish every platform,
key combination, or target-environment latency.

Run:

```bash
pnpm run gate -- ci-plugins
```

Plugins CI builds required public dependencies and runs the ConfigLens package
lifecycle once, followed by its pure Node built-output check.
