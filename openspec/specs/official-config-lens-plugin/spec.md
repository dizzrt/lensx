# Official ConfigLens Plugin Specification

## Purpose

Define ConfigLens product behavior, language-processing invariants, public
plugin boundaries, Runtime lifecycle, and the evidence required for Task 7.2.
## Requirements

### Requirement: ConfigLens MUST be a normal public-boundary official plugin

The system MUST provide the product named `ConfigLens` in both `en-US` and `zh-CN` as the independent package `@lensx/official-config-lens` under the canonical source location `plugins/config-lens`, with plugin identity `dev.lensx.config-lens`. Its Manifest MUST use Contract `0.4.0`, contribute exactly one WebView Page and one Launcher Action targeting that Page, and declare that Page with `initial_size: 800×600` logical pixels and `resizable: true`. The declaration MUST use the same public Page presentation contract as external plugins and MUST request no Host permission, Runtime native setter, or unpublished capability. The plugin MUST consume only public plugin package exports and ordinary browser dependencies, and the Host MUST NOT import its source or grant authority based on its official repository location.

The Action's `title.en-US` and `title.zh-CN` MUST both be `ConfigLens`. The title change MUST preserve the `dev.lensx.config-lens.open` execution identity, the `main` Page target, and existing functional keywords. It MUST NOT append `Open ConfigLens`, `打开 ConfigLens`, or compatibility opening prefixes as search keywords.

#### Scenario: User opens ConfigLens from the Launcher
- **WHEN** the installed ConfigLens Action is found and activated on a work area that can contain its requested size
- **THEN** its Launcher entry title is `ConfigLens` in both languages, and the Host opens its contributed Page through the ordinary Registration, Resource, isolated Child WebView Runtime and Session path in an `800×600` logical resizable Window
- **THEN** the Host Page chrome presents the brand `ConfigLens` while the plugin work area repeats no visible main title or subtitle
- **THEN** the Child WebView retains an accessible work-area name without receiving Tauri, native Window setters, Host DOM, filesystem, native clipboard or another plugin's state

#### Scenario: User resizes, hides, closes, and reopens ConfigLens
- **WHEN** the user resizes the current ConfigLens Page, hides/restores it, closes it to Home, and later opens it again
- **THEN** hide/restore preserves the current attempt and user size, close restores non-resizable `650×320` Home, and reopen starts from effective `800×600`
- **THEN** no user-adjusted size is written to ConfigLens, Host preferences, browser storage, plugin storage, package metadata, or evidence

#### Scenario: Official source attempts to bypass the public boundary
- **WHEN** `plugins/config-lens` declares or imports Host-private source, Tauri, an unpublished Host API, a workspace-only deep path, another plugin's source, or a runtime Window method
- **THEN** workspace and official release boundary validation MUST reject the member
- **THEN** no official-only import, Runtime, CSP, permission, installation, presentation, or resize exception may be added

#### Scenario: Legacy nested path remains
- **WHEN** ConfigLens source remains under the legacy `plugins/official/config-lens` path
- **THEN** workspace, official release and focused ConfigLens gates MUST report path drift
- **THEN** the system MUST NOT accept both the legacy path and `plugins/config-lens` as product members

#### Scenario: Discover ConfigLens after the title change
- **WHEN** a user searches for an available entry by `ConfigLens` or existing keywords such as `JSON`, `format`, or `格式化` in either interface language
- **THEN** search returns the Action with identity `dev.lensx.config-lens.open` and display name `ConfigLens` under the same rules
- **THEN** its keyword set remains the existing functional keywords without compatibility aliases added for this title change

### Requirement: ConfigLens MUST provide direct and reversible editor operations

The Page MUST provide exactly one editable Monaco model. It MUST NOT add a formatting preview model, Diff Editor, `Apply result` action, old/new result comparison, or a separate result-application workflow. Format and JSON-only Compact MUST use the effective language and replace the content through one undoable edit only while the original input, automatic/manual selection mode, effective language, input version, and current operation generation still match. Invalid, unsupported, limited, timed-out, malformed, or superseded results MUST preserve the existing content.

Format and Compact MUST NOT transform content while the input is empty, a current operation is processing, automatic analysis for the current input is unsettled, or automatic mode has no effective language. Compact MUST be available only when the current input has passed strict JSON validation and the effective language is JSON. The same disabled conditions MUST govern buttons and keyboard shortcuts.

#### Scenario: User formats valid content

- **WHEN** automatic detection or manual selection establishes a supported language and the user invokes Format on valid input
- **THEN** the current generation's fidelity-checked result directly replaces the content through one undoable edit
- **THEN** one undo restores the complete pre-operation content without an additional Apply action

#### Scenario: Input changes while an operation is pending

- **WHEN** Format or Compact is pending and the user edits the input, switches automatic/manual mode, changes the effective language, or enters a new Runtime generation
- **THEN** the old result cannot replace content or overwrite the newer mode, language, or diagnostics
- **THEN** a new eligible operation can complete normally

#### Scenario: Input is empty

- **WHEN** the input is empty or contains only whitespace
- **THEN** no language processing starts, Format and Compact are disabled, and no error marker or automatic content replacement is produced
- **THEN** the Footer displays no empty-content hint and the editor retains its localized accessible name

#### Scenario: Automatic language is unresolved

- **WHEN** nonempty input in automatic mode has no detected language or analysis for that input version is still pending
- **THEN** Format and Compact do not transform content, and the language selector retains the localized `Auto` label without a detection-state suffix
- **THEN** the user can continue editing or select a language manually while search and text selection remain available

### Requirement: Language choice MUST remain explicit across ambiguous configuration syntaxes

A new Page MUST default to automatic mode. The compact visible language selector MUST display manual options as `JSON`, `YAML`, `TOML`, and `XML` without version suffixes; supported syntax versions MUST remain JSON, YAML 1.2, TOML 1.0, and XML 1.0. While automatic mode is selected, its label MUST remain `Auto` in English or `自动` in Simplified Chinese for empty, pending, detected, and unresolved input, without a detection-result or unresolved suffix. The editor MUST precede the selector and visible operation controls.

The selector MUST use a bounded compact width and permit shrinking in constrained layouts rather than expand to fill the row. This presentation MUST preserve keyboard and focus behavior and the existing 40/72-logical-pixel Footer heights.

Automatic detection MUST combine structural configuration evidence with bounded syntax analysis rather than select a language solely because a parser accepts the input. Input with clear XML, JSON, or TOML structure MUST NOT fall back to a YAML scalar because its syntax is incomplete or invalid. Strict JSON objects and arrays MUST take precedence over overlapping YAML syntax. Unstructured plain text, isolated scalars, and ordinary comments alone MUST NOT establish an initial reliable detection.

Without an initial reliable candidate, the editor MUST use an unrecognized plaintext state. If an effective language already exists in automatic mode and a later nonempty edit is temporarily ambiguous, the last automatically effective language MUST be retained; clear structure for another language MUST permit detection to change. Clearing automatic-mode content MUST clear the detection result. A manual choice MUST lock that language across content changes and clearing, and only an explicit return to automatic mode may resume detection.

Detection and selection changes MUST synchronize highlighting, subsequent validation, and the language used for explicit operations, but MUST NOT rewrite content, trigger automatic formatting, or change undo history. Late detection results MUST NOT overwrite newer input versions, manual choices, or Runtime context.

#### Scenario: User explicitly selects a language

- **WHEN** the user manually selects XML from automatic mode and then pastes another language or clears and re-enters content
- **THEN** the selector and effective language remain XML and the content is not rewritten
- **THEN** validation and formatting use XML until the user explicitly selects automatic mode again

#### Scenario: Selector labels remain compact as detection changes

- **WHEN** the user opens the language selector in either interface locale
- **THEN** manual options display `JSON`, `YAML`, `TOML`, and `XML` without syntax-version suffixes
- **WHEN** automatic input changes from empty to pending, recognized, or unresolved
- **THEN** the selected label remains localized `Auto`, while the effective language continues to govern highlighting, validation, and eligible operations

#### Scenario: Syntax is valid in more than one language

- **WHEN** automatic-mode input is `{"a":1}`, `port = 8080`, or `<xml></xml>` and YAML also accepts the text
- **THEN** clear structure selects JSON, TOML, or XML respectively rather than using YAML parser success as a fallback detection rule
- **THEN** manual mode continues to use the selected language without automatically correcting that choice

#### Scenario: Incomplete configuration retains its intended language

- **WHEN** automatic-mode input such as `<xml>` or `{"a": 1,}` has clear structure but has not passed syntax validation
- **THEN** XML or JSON highlighting and syntax diagnostics apply respectively
- **THEN** acceptance by YAML does not switch the language or automatically change the content

#### Scenario: Fresh ambiguous input stays unresolved

- **WHEN** a new Page receives `hello`, `true`, `123`, or an ordinary unstructured comment in automatic mode
- **THEN** the selector retains the localized `Auto` label, the editor remains plaintext, and Format and Compact do not transform content
- **THEN** manually selecting a supported language enables validation and eligible operations under that language's contract

#### Scenario: Automatic and manual clear have different semantics

- **WHEN** the user clears previously detected content in automatic mode
- **THEN** automatic mode remains selected, the result is cleared, and the editor returns to plaintext
- **WHEN** the user clears content in manual mode
- **THEN** the selected language remains locked and automatic mode is not restored

#### Scenario: Manual choice supersedes pending detection

- **WHEN** detection of old input is pending, the user selects TOML, and the old XML detection response later arrives
- **THEN** the late response cannot overwrite the TOML selection, highlighting, or diagnostics
- **THEN** after the user explicitly returns to automatic mode, only a new result for the current input can take effect

### Requirement: Language operations MUST use bounded Worker execution and safe diagnostics

Automatic detection, validation, formatting, and compaction MUST execute through a package-owned, page-lifetime Dedicated Worker and a typed language boundary. Input exceeding 2 MiB UTF-8 or 100,000 lines MUST be rejected before dispatch. One complete detection and its associated validation MUST share a deadline of at most five seconds rather than restart five seconds for each candidate; explicit operations MUST also have a five-second deadline. Results MUST contain at most 200 diagnostics.

Responses MUST bind to the request generation, input version, and automatic/manual selection version, and receipt MUST validate their shape, supported language, result state, and diagnostic bounds. Late or malformed results MUST become inert. Diagnostics MUST contain only stable codes, severity, bounded locations, localized message keys, and restricted arguments; they MUST NOT include complete input, absolute paths, raw exceptions, stacks, secrets, or dependency-internal objects.

Language resolution and input validity MUST be represented separately: identifying XML does not establish valid XML. Syntax errors, limits, unsupported constructs, timeouts, and Worker failures MUST appear through editor-local markers and accessible diagnostic feedback. Operation errors without precise locations MUST use a stable position within the editor. The Footer MUST NOT regain a diagnostic summary, status text, or error area. Processing MUST be expressed through operation controls' busy/disabled states and accessible semantics.

#### Scenario: Valid operation completes within bounds

- **WHEN** the current input and processing complete within the resource limits
- **THEN** the current generation accepts the validated language and result and maps diagnostics to editor markers and accessible diagnostic feedback
- **THEN** parsing and formatting do not block the Page's main interaction thread and require no separate diagnostic summary

#### Scenario: Input exceeds a resource limit

- **WHEN** the input exceeds the byte or line limit
- **THEN** no input is sent to the language Worker, no partial output is produced, and localized limit diagnostics appear inside the editor
- **THEN** the content remains editable and reducing the input permits detection or processing to resume

#### Scenario: Worker times out, crashes or returns malformed data

- **WHEN** the Worker times out, terminates, or returns a response that fails boundary validation
- **THEN** that Worker is terminated and its generation is invalidated while content and manual mode are preserved and a bounded localized error appears inside the editor
- **THEN** editing input, selecting a language again, or invoking an enabled explicit operation can create a new Worker; if initial detection failed without an effective language, the first two recovery paths remain available, and old responses cannot affect new state

#### Scenario: Detection and validation share the operation budget

- **WHEN** automatic mode needs to examine several possible languages
- **THEN** candidate analysis and associated validation share one request deadline and diagnostic limit
- **THEN** cancellation, manual selection, context changes, and Page close invalidate the entire request

### Requirement: JSON processing MUST preserve lexical data while formatting and compacting

JSON validation MUST enforce the selected strict JSON syntax without using `JSON.parse` and `JSON.stringify` as the sole transformation. Format and Compact MUST change only insignificant whitespace between JSON tokens and MUST preserve number lexemes, property order, duplicate property occurrences, string escape spelling and token order. Compact MUST be available only for valid JSON and MUST NOT be offered for YAML, TOML or XML.

#### Scenario: JSON contains large numbers, duplicate keys and escapes
- **WHEN** valid JSON includes an integer beyond JavaScript's safe range, duplicate object names, ordered properties or explicitly escaped string characters
- **THEN** Format and Compact preserve each original non-whitespace token exactly and only change permitted whitespace
- **THEN** direct replacement cannot round the number, remove or reorder a property, or rewrite the escape spelling

#### Scenario: JSON is invalid
- **WHEN** strict JSON scanning or parsing finds an invalid token, delimiter, string, number or trailing construct
- **THEN** ConfigLens produces bounded localized diagnostics at the relevant source locations and does not replace the editor content
- **THEN** the input remains editable and a later corrected operation can succeed in a fresh generation

### Requirement: YAML processing MUST preserve document structure and YAML-specific semantics

YAML validation and formatting MUST use YAML 1.2 behavior and MUST preserve document count, directives, comments, anchors, aliases, tags, mapping and sequence order, and scalar semantics. It MUST impose bounded alias, collection-depth and diagnostic limits, MUST NOT resolve remote tags or resources, and MUST NOT expose Compact.

#### Scenario: YAML includes comments, anchors, tags and multiple documents
- **WHEN** valid bounded YAML contains comments, anchors and aliases, explicit tags, block or quoted scalars, directives or multiple documents
- **THEN** Format produces output whose parsed semantic fingerprint and preserved comment/structure inventory match the input
- **THEN** direct replacement does not merge documents, expand aliases, drop comments or silently change scalar meaning

#### Scenario: YAML exceeds safe alias or depth bounds
- **WHEN** YAML contains excessive alias expansion, nesting or another configured parser resource violation
- **THEN** ConfigLens stops with a stable bounded diagnostic and does not replace the editor content
- **THEN** it does not resolve the graph, freeze the Page, upload content or weaken the limit for the current input

### Requirement: TOML processing MUST preserve TOML 1.0 types, comments and ordering

TOML validation and formatting MUST enforce TOML 1.0 syntax and MUST preserve comments, key and table order, strings, numbers, booleans, arrays and date/time value semantics. A formatter result MUST be parsed and compared through a TOML-specific semantic and comment/order fidelity check before it may replace the editor content. ConfigLens MUST NOT expose TOML Compact.

#### Scenario: TOML contains comments, tables and typed values
- **WHEN** valid TOML contains comments, dotted keys, tables or arrays of tables, multiline strings, non-decimal numbers or date/time values
- **THEN** Format preserves the comment and ordering inventory and produces an equivalent TOML 1.0 value model
- **THEN** output that loses or changes any protected fact is rejected instead of being offered to the user

#### Scenario: TOML contains a duplicate or invalid declaration
- **WHEN** TOML parsing finds an invalid key, duplicate declaration, type conflict or malformed typed value
- **THEN** ConfigLens reports safe source diagnostics and does not replace the editor content
- **THEN** correcting the input allows a new operation without recreating the Page

### Requirement: XML processing MUST preserve text whitespace and reject external expansion paths

XML validation and formatting MUST enforce XML 1.0 well-formedness while preserving declaration, namespace, element, attribute, text, CDATA, comment and processing-instruction order. Formatting MAY insert indentation only at element-only structural boundaries and MUST preserve text and mixed-content whitespace exactly. DOCTYPE, entity declarations, XInclude or any construct requiring external resolution MUST return an unsupported diagnostic without resolving or fetching it. ConfigLens MUST NOT expose XML Compact.

#### Scenario: XML contains namespaces and mixed content
- **WHEN** valid XML contains namespaces, attributes, comments, CDATA, processing instructions or mixed text and child elements
- **THEN** Format preserves all text and CDATA content including whitespace and only changes safe structural whitespace
- **THEN** a post-format XML fidelity check must pass before output may replace the editor content

#### Scenario: XML requests DTD, entity or include processing
- **WHEN** input contains a DOCTYPE, entity declaration, XInclude or external reference
- **THEN** ConfigLens preserves the input, performs no network or external resource access and does not replace the editor content
- **THEN** it shows a stable localized unsupported-feature diagnostic rather than expanding or partially formatting the document

### Requirement: ConfigLens MUST keep user content ephemeral and release all Runtime resources

ConfigLens MUST retain content, search queries, match state, automatic/manual language mode, and detection results only in the current Page's memory. It MUST NOT transmit them through network uploads, browser storage, logs, Host persistence, or Host clipboard APIs. Native text operations through ordinary editing shortcuts MUST NOT add programmatic clipboard permission for the plugin.

Hiding and restoring the Launcher MUST NOT count as closing the Page. While entry, Page, version, origin, resource generation, and Runtime attempt are unchanged, the same Child WebView, Session, Monaco model, Workers, content, undo history, language mode, and current search state MUST be preserved. Global Registration revisions MUST remain revalidation hints and changes to other plugins MUST NOT revoke the current Page.

Close, navigation, disable, replacement, upgrade, uninstall, development reload, SDK retry, React unmount, and document teardown MUST idempotently release the SDK, editor instances and model, diagnostic ownership, observers, subscriptions, timers, search resources, and all Workers. Reopening after an actual close MUST create a new Child WebView attempt, model, Worker, and Session with default automatic mode, no detected language, and an empty query. Host immutable-package-byte caches MUST NOT restore user state.

#### Scenario: Hidden Launcher restores the current ConfigLens Page

- **WHEN** a Page containing content, a manual language lock or automatic result, and a search query is hidden and restored while its execution identity remains valid
- **THEN** the same Runtime, model, Worker, content, undo history, language mode, and query remain without a new plugin loading cycle
- **THEN** none of this state is persisted through the browser or Host

#### Scenario: Current Page closes or plugin is disabled

- **WHEN** a Page that is detecting, formatting, or searching is closed or its plugin is disabled
- **THEN** its Child WebView, Worker, SDK Session, model, search resources, and subscriptions all become inert
- **THEN** late callbacks cannot update the Host, other plugins, or subsequent Page generations

#### Scenario: Plugin is upgraded or uninstalled

- **WHEN** ordinary upgrade commits a new package or ordinary uninstall removes ConfigLens
- **THEN** a new generation cannot restore old input, manual mode, or search queries
- **THEN** upgrade uses the new package's public Runtime resources and uninstall requires no browser-storage migration

### Requirement: ConfigLens UI MUST be bilingual, theme-aware, keyboard-operable and automatically verifiable

All product copy except the `ConfigLens` brand MUST provide English-default and semantically aligned Simplified Chinese localization, including the automatic-mode label, operation entries, editor search controls, and accessible names. ConfigLens-owned controls, diagnostic messages, and their accessible names MUST adopt the current locale immediately. Native Monaco UI copy for search, related menus, and the diagnostic interaction framework MUST use the locale from the current document's first valid Runtime Context and adopt a new locale after the user actually closes and reopens ConfigLens. Updating native copy MUST NOT automatically reload the Page or discard content. The Page MUST NOT repeat the Host's main title or subtitle and MUST retain an accessible work-area name. The ready layout MUST consist of exactly one flexible `content` region followed by a semantic `footer`; the single editor MUST fill the content region without outer padding, a content/Footer gap, card border, or radius.

The Footer MUST contain only the language selector, Format, and Compact; it MUST NOT include a Search button. It MUST NOT render empty, valid, or processing status text or a dedicated status placeholder. Language and operation controls MUST be vertically centered in the normal viewport, with the Footer fixed to the bottom at 40 logical pixels high. A viewport no wider than 520 or no taller than 260 logical pixels MAY use a fixed 72-logical-pixel two-row arrangement. State, long copy, diagnostics, and search MUST NOT change those heights or move the Footer.

Validation diagnostics MUST remain inside the editor and MUST NOT add a Footer count, summary, list, extra row, third top-level region, or external diagnostic overlay. The editor's own search widget is not a prohibited diagnostic overlay but MUST remain within the content region. Removing status text MUST preserve button busy/disabled behavior, diagnostic recovery, and accessible semantics.

The Page MUST respond to complete light/dark and locale replacements, subject to the native-copy lifecycle exception above, while preserving content, language mode, the current model, undo history, search state, Runtime attempt, user size, and the two-region layout. Theme changes MUST apply immediately to native search. The visible Select All editor-menu entry MUST provide an accessible alternative to its shortcut, and both MUST target the current text focus. Before Runtime Context is ready, normal startup MUST remain visually empty with accessible busy semantics; a startup failure MAY show a focusable recovery entry.

Deterministic component, state, style-contract, and built-output checks MUST cover absence of repeated headings, adjacency of the two regions, fixed Footer geometry, absence of status/diagnostic regions, both locales and themes, long copy, constrained dimensions, keyboard focus, empty/valid/invalid/unrecognized/limited/recovered states, search, and highlighting. Screenshots, pixel comparisons, browser acceptance, and native visual acceptance MUST NOT substitute for these checks.

#### Scenario: Ready ConfigLens fills the available Page body

- **WHEN** the Page is ready at an initial or larger modeled viewport
- **THEN** the editor fills the space above the Footer without extra whitespace, a second editor, repeated headings, or document reload
- **THEN** the 40-logical-pixel Footer vertically centers language and operation entries without the old status region or placeholder nodes

#### Scenario: Invalid input does not expand the Footer

- **WHEN** input is invalid or a processing error occurs
- **THEN** the editor updates its markers while the Footer has no status text, diagnostic count, summary, or extra row
- **THEN** Footer height remains unchanged and the user can continue editing and recover

#### Scenario: Constrained viewport remains operable

- **WHEN** the modeled viewport is no wider than 520 or no taller than 260 logical pixels
- **THEN** the fixed 72-logical-pixel two-row Footer provides complete access to language, Format, and Compact without a Search button
- **THEN** long copy, automatic detection, errors, and search do not increase its height or restore outer Page padding

#### Scenario: Locale and theme are replaced while editing

- **WHEN** an English light Page receives a complete Simplified Chinese dark context
- **THEN** ConfigLens-owned selection, operations, diagnostic messages, and accessible names update immediately and syntax colors and native search adopt the dark theme, while native Monaco UI copy remains English for this open document
- **THEN** content, model, undo history, mode, query, size, and Runtime attempt remain intact without clearing content for the locale change

#### Scenario: Bootstrap waits for Runtime Context

- **WHEN** the Child document has loaded but Runtime Context has not arrived
- **THEN** normal startup remains visually empty and exposes only accessible busy semantics without showing an incorrect language or theme
- **THEN** Context arrival applies complete localization and the two-region layout

#### Scenario: Keyboard user formats and recovers from an error

- **WHEN** the user invokes Format or `Ctrl/Cmd+Enter`, encounters diagnostics, and corrects the input
- **THEN** focus remains visible and predictable, errors can be read inside the editor, and no Footer hint appears
- **THEN** a later eligible operation can succeed and shortcuts use the same disabled conditions as buttons

#### Scenario: Reopen adopts the new native editor locale

- **WHEN** the user changes the application language to Simplified Chinese, actually closes ConfigLens, and reopens it
- **THEN** the new document's native Monaco search panel, menus, and diagnostic interaction framework use Simplified Chinese
- **THEN** the Page follows existing close semantics with empty content, default automatic mode, and an empty query rather than restoring the closed Page's content

### Requirement: Task 7.2 completion MUST use the immutable official candidate through the full product lifecycle

The same canonical ConfigLens `.lxp` bytes MUST pass plugin unit, integration, type, static, build, and supported deterministic built-artifact checks; two byte-identical packs; TypeScript and Rust inspection; and ordinary local-install preparation. Deterministic lifecycle tests MUST cover install projection, Action search, open state, SDK-ready state, package-owned Monaco and Worker resource resolution, four-language processing, Launcher hide/shortcut restore state, close, reopen, disable, upgrade, and uninstall without requiring browser, WebView, GUI, or target macOS execution. Task 7.2 completion MUST require focused deterministic ConfigLens and official release gates, complete frontend/shared and Rust validation, bilingual documentation drift checks, and strict OpenSpec validation.

#### Scenario: Complete candidate succeeds

- **WHEN** one immutable ConfigLens candidate passes every supported plugin, package, install-projection, lifecycle, documentation, and repository final gate
- **THEN** Roadmap Task 7.2 may be marked complete and the candidate may enter the existing digest-pinned official release handoff
- **THEN** completion does not claim real Runtime execution, publish the desktop application, grant Host authority, or make a release sidecar part of Runtime trust

#### Scenario: Any language or deterministic lifecycle check fails

- **WHEN** one supported language, fidelity invariant, Worker boundary, installation preparation, modeled lifecycle path, or final validation command fails
- **THEN** Task 7.2 remains incomplete and ConfigLens MUST NOT be described as fully validated under the maintained deterministic scope
- **THEN** after correction, the failed command and complete final validation set MUST run again without reusing an invalid candidate

### Requirement: ConfigLens MUST consume the same Child WebView Runtime as external plugins
ConfigLens Manifest, Page presentation, SDK initialization, package candidate, installation and Page execution MUST use the public `0.4.0` WebView contract, `@lensx/plugin-sdk/webview` and the production Child WebView service. Repository location, Publisher and official release metadata MUST NOT select a privileged bridge, direct Host import, alternate WebView configuration, native Window method or retained iframe path.

#### Scenario: Immutable ConfigLens candidate opens
- **WHEN** the released `.lxp` is installed and opened through the normal Launcher flow
- **THEN** its presentation is resolved through ordinary normalized Registration/Page metadata and it reaches SDK ready through the same source-bound bridge as an external plugin

#### Scenario: Official source requests native authority
- **WHEN** ConfigLens attempts an undeclared Tauri, Host, position, size, resizable, monitor, maximize or fullscreen command
- **THEN** the same Runtime boundary rejects it with zero privileged side effect

### Requirement: ConfigLens bootstrap and editor resources MUST remain deterministically bounded

ConfigLens MUST use a minimal HTML-referenced bootstrap graph that starts the public `@lensx/plugin-sdk/webview` transport before importing or mounting React, React DOM, Semi Design, Plugin UI, Monaco, or language adapters. Built HTML-referenced JavaScript MUST total at most 256 KiB and HTML-referenced CSS MUST total at most 64 KiB. After valid Runtime Context arrives, ConfigLens MUST load the complete React/Semi UI and Monaco without creating a second SDK client or Session. Monaco loading MUST remain single-flight, the package-owned editor Worker MUST resolve from the candidate, and the language Worker MAY remain demand-created. Deterministic bundle inspection, unit tests, and resource-resolution tests SHALL enforce these properties without target-environment timing claims.

#### Scenario: Minimal bootstrap bundle is inspected

- **WHEN** the canonical ConfigLens candidate is built and its HTML-referenced graph is inspected
- **THEN** JavaScript and CSS remain within the maintained limits and the bootstrap starts the public SDK transport before the UI/editor graph
- **THEN** the candidate contains the package-owned editor Worker and requires no second SDK client or Session

#### Scenario: Resource boundary drifts

- **WHEN** the bootstrap exceeds a maintained byte limit, eagerly imports the editor graph, duplicates SDK initialization, or omits a required Worker asset
- **THEN** deterministic build or package validation fails
- **THEN** completion does not substitute a historical timing record or real-environment sample

### Requirement: ConfigLens MUST provide editor-local search and focus-correct selection

When the current editor has text focus, `Cmd/Ctrl+A` MUST select the complete model content; when the search input has focus, the same shortcut MUST select only the query text. `Cmd/Ctrl+F` MUST open the editor-local search widget without moving to Host search or browser Page find. Search MUST support query entry, forward/backward match navigation, and localized no-result feedback. Opening, navigating, and closing search MUST NOT change content or undo history.

Native Find icons MUST use the package-owned font, with bytes matching the locked editor dependency. Emitted CSS resource references MUST resolve relative to their stylesheet within the plugin package. These resources MUST NOT require remote loading, additional Host permissions, or a relaxed CSP.

Within ConfigLens, native Find buttons MUST remain vertically aligned. When Find or expanded Replace is open and the editor is scrolled to the top, the widget MUST NOT obscure the first content line. Closing the widget MUST release its native reserved space. This layout correction MUST remain local to ConfigLens and preserve the shared Plugin UI reset, native editor padding, and Monaco's existing reserved-space behavior.

The search close control and Escape inside its widget MUST close search and restore focus to the original editor without closing the Page. Editor Select All MUST NOT steal focus from the external language selector, buttons, or Host input. Search state MUST belong to current-Page memory and follow the existing cleanup and language/theme contracts.

#### Scenario: Find and navigate inside the editor

- **WHEN** the user presses `Cmd/Ctrl+F`, enters a matching query, and navigates its results
- **THEN** the same widget displays and locates matches in the current model without changing content
- **THEN** an unmatched query produces localized feedback and changing the query permits recovery

#### Scenario: Find and Replace preserve the first content line

- **WHEN** the user opens Find or expands Replace in ConfigLens and scrolls the editor to the top
- **THEN** native buttons remain vertically aligned and the first content line is not covered by the widget
- **WHEN** the user closes the widget
- **THEN** Monaco releases the native top space without leaving additional editor padding or changing content

#### Scenario: Select all respects the focused input

- **WHEN** the user presses `Cmd/Ctrl+A` with content focus
- **THEN** the complete content is selected and remains editable
- **WHEN** the user presses the same shortcut with search-input focus
- **THEN** only the query is selected rather than editor content or the Host Page

#### Scenario: Closing search restores editor focus

- **WHEN** the user closes search with its close control or Escape inside the widget
- **THEN** search hides and focus returns to the original editor while the Page, content, and undo history remain intact
- **THEN** reopening search creates neither a second widget nor duplicate shortcut listeners

### Requirement: ConfigLens MUST highlight all supported configuration languages

When the effective language is JSON, YAML 1.2, TOML 1.0, or XML 1.0, the editor MUST distinguish that language's main lexical categories, including applicable keys, strings, numbers, booleans, comments, tags, attributes, and TOML tables/dates. Automatic detection, manual selection, and theme changes MUST update coloring on the current model without changing content or undo history. Unrecognized automatic mode MUST use plaintext presentation.

Highlighting MUST handle incomplete input during editing and MUST NOT determine input validity; strict validation, formatting, and fidelity requirements remain independently applicable. Language resources MUST ship in the plugin package without CDN use, remote services, or new Host permissions, and MUST respect existing resource budgets.

#### Scenario: Four-language content has meaningful token categories

- **WHEN** automatic detection or manual selection establishes any supported language and input contains examples of its main lexical categories
- **THEN** the editor produces corresponding syntax categories with suitable light- and dark-theme colors
- **THEN** the presence of coloring does not determine strict validation results

#### Scenario: Incomplete XML remains highlighted

- **WHEN** XML is effective and the content consists only of an unclosed `<xml>`
- **THEN** the tag remains XML-highlighted and independent XML syntax diagnostics appear
- **THEN** highlighting does not wait for a valid complete document, switch to YAML, or replace input

#### Scenario: Language and theme switch preserve the model

- **WHEN** manual selection changes JSON to TOML or detection establishes another language, followed by a theme change
- **THEN** the same model receives the new language and theme coloring without content or undo-history changes
- **THEN** an older asynchronous language load cannot overwrite the current selection
