# Official ConfigLens Plugin Specification

## Purpose

Define ConfigLens product behavior, language-processing invariants, public
plugin boundaries, Runtime lifecycle, and the evidence required for Task 7.2.
## Requirements

### Requirement: ConfigLens MUST be a normal public-boundary official plugin

The system MUST provide the product named `ConfigLens` in both `en-US` and `zh-CN` as the independent package `@lensx/official-config-lens` under the canonical source location `plugins/config-lens`, with plugin identity `dev.lensx.config-lens`. Its Manifest MUST use Contract `0.4.0`, contribute exactly one WebView Page and one Launcher Action targeting that Page, and declare that Page with `initial_size: 800×600` logical pixels and `resizable: true`. The declaration MUST use the same public Page presentation contract as external plugins and MUST request no Host permission, Runtime native setter, or unpublished capability. The plugin MUST consume only public plugin package exports and ordinary browser dependencies, and the Host MUST NOT import its source or grant authority based on its official repository location.

#### Scenario: User opens ConfigLens from the Launcher
- **WHEN** the installed ConfigLens Action is found and activated on a work area that can contain its requested size
- **THEN** the Host opens its contributed Page through the ordinary Registration, Resource, isolated Child WebView Runtime and Session path in an `800×600` logical resizable Window
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

### Requirement: ConfigLens MUST provide direct and reversible editor operations

The Page MUST provide exactly one editable Monaco model for viewing and editing the selected configuration language. It MUST NOT provide a formatting preview model, Diff Editor, `Apply result` action, fresh or stale result state, or another change-comparison or change-application workflow. A successful Format or JSON-only Compact operation MUST replace the current model through one undoable edit only when the original input, selected language and current generation still match the request. Invalid, unsupported, limited, timed-out, malformed or superseded results MUST preserve the current model.

#### Scenario: User formats valid content
- **WHEN** the user selects a supported language, enters valid input and invokes Format
- **THEN** ConfigLens replaces the editor content directly with the current generation's fidelity-checked result through one undoable edit
- **THEN** one editor undo restores the complete content that existed before the operation without requiring an Apply action

#### Scenario: Input changes while an operation is pending
- **WHEN** a format or compact request is pending and the user edits the input, changes the selected language or enters a new Runtime generation
- **THEN** ConfigLens preserves the newer editor content and rejects the superseded result
- **THEN** a late Worker response cannot replace content in the current or a later generation

#### Scenario: Input is empty
- **WHEN** the input is empty or contains no non-whitespace character
- **THEN** ConfigLens does not start a language operation, disables Format and Compact, and shows a localized empty-state hint
- **THEN** no error marker or automatic replacement is produced

### Requirement: Language choice MUST remain explicit across ambiguous configuration syntaxes

ConfigLens MUST expose JSON, YAML 1.2, TOML 1.0 and XML 1.0 in an explicit language selector, with JSON as the initial selection for a new Page. The editable Monaco surface MUST precede the language selector and its adjacent visible Format and Compact controls in document and visual order. It MUST NOT detect, suggest or silently change the selected language, mutate input or start formatting based on content inspection.

#### Scenario: User explicitly selects a language
- **WHEN** the user changes the visible language selection
- **THEN** the selector and Format/Compact controls appear after the editable Monaco surface
- **THEN** ConfigLens updates syntax highlighting and subsequent validation or formatting to that selected language
- **THEN** the selection change does not format or otherwise replace the current editor content

#### Scenario: Syntax is valid in more than one language
- **WHEN** the current text is ambiguous between supported languages
- **THEN** ConfigLens retains the visible user-selected language and does not auto-switch
- **THEN** validation and formatting use only that selected language's contract

### Requirement: Language operations MUST use bounded Worker execution and safe diagnostics

Validation, formatting and compaction MUST run through a package-owned page-lifetime Dedicated Worker and a typed per-language adapter. Input MUST be rejected before Worker dispatch when its UTF-8 representation exceeds 2 MiB or it exceeds 100,000 lines. Each explicit operation MUST have a five-second deadline, results MUST be generation-bound, and at most 200 diagnostics may be returned. Diagnostics MUST contain stable codes, severity, bounded source locations, message keys and restricted arguments; they MUST NOT contain the complete input, absolute paths, raw exceptions, stacks, secrets or dependency-internal objects.

#### Scenario: Valid operation completes within bounds
- **WHEN** a selected-language operation receives input within the byte and line limits and finishes before its deadline
- **THEN** the current generation accepts the validated result and maps its diagnostics to Monaco markers and an accessible summary
- **THEN** parsing and formatting do not block the Page's main interaction thread

#### Scenario: Input exceeds a resource limit
- **WHEN** input exceeds either the 2 MiB UTF-8 limit or the 100,000-line limit
- **THEN** ConfigLens sends no input to the language Worker and produces no partial output
- **THEN** it displays a localized recoverable limit state and continues accepting edits that can bring the input back within bounds

#### Scenario: Worker times out, crashes or returns malformed data
- **WHEN** an operation exceeds five seconds, the Worker terminates, or its response fails boundary validation
- **THEN** ConfigLens terminates that Worker, rejects its generation, preserves the editor content and displays a bounded recoverable error
- **THEN** an explicit later operation creates fresh Worker state and cannot consume the failed generation's result

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

ConfigLens MUST keep input and output in the current Page memory only and MUST NOT send them over network APIs, write them to browser storage, log them, or invoke a Host persistence or clipboard API. Temporarily hiding and restoring the Launcher window MUST NOT count as closing the current Page: while the current plugin's entry, Page, version, origin, resource generation and Runtime attempt remain unchanged, a launcher activation refresh MUST preserve the current Child WebView, Runtime Session, Monaco models, Workers and in-memory input. A global Registration revision MUST remain only a revalidation hint and MUST NOT revoke the current Page when only another plugin changed. Close, navigation, disable, replacement, upgrade, uninstall, development reload, SDK retry, React unmount and document teardown MUST idempotently dispose the SDK client, Monaco instances and models, marker ownership, observers, listeners, timers and all Workers. A later open after one of those actual teardown events MUST create a fresh Child WebView attempt, models, Worker and Session state without restoring old content; Host reuse of immutable current-generation package bytes MUST NOT retain executable or user state.

#### Scenario: Hidden Launcher restores the current ConfigLens Page
- **WHEN** ConfigLens is ready with user input and the Launcher window is hidden and restored through the global shortcut while its relevant entry, Page, version, origin, resource generation and Runtime attempt remain current
- **THEN** the Host keeps the same Child WebView, Runtime attempt, Session, Monaco models and Workers instead of showing a fresh plugin-page loading cycle
- **THEN** ConfigLens retains the current input, selected language, operation state and diagnostics without writing them to persistent storage

#### Scenario: Current Page closes or plugin is disabled
- **WHEN** the Host closes the Page or disables ConfigLens while a Worker operation is active
- **THEN** the Child WebView, operation, Worker, SDK Session and every editor resource become inert
- **THEN** no late result updates the Host, another plugin or a later ConfigLens generation

#### Scenario: Plugin is upgraded or uninstalled
- **WHEN** ordinary replacement installs a new ConfigLens version or ordinary uninstall removes it
- **THEN** the old generation and its in-memory content cannot be recovered by the new or removed registration
- **THEN** upgrade uses the new package's public Runtime resources and uninstall leaves no ConfigLens browser-storage migration to perform

### Requirement: ConfigLens UI MUST be bilingual, theme-aware, keyboard-operable and automatically verifiable

All user-visible product copy except the unchanged `ConfigLens` brand MUST use an English-default catalog with a semantically aligned Simplified Chinese catalog. Because Host Page chrome already identifies the contributed Page, the Child WebView work area MUST NOT repeat a visible page-level main title or subtitle and MUST retain an accessible main or region name. Its ready layout MUST contain exactly a flexible `content` region followed by a semantic `footer`: the single editable Monaco surface MUST fill the complete content region, while the footer MUST contain the explicit language selector, non-color-only status, visible Format and Compact controls, and a bounded conditional diagnostics region. Diagnostics MUST remain accessible and scrollable without creating a third top-level layout region.

The Page and lightweight startup feedback MUST respond to complete light/dark and locale context replacement through supported Plugin UI and Semi Design theming, preserve predictable keyboard/focus behavior, expose visible controls for every shortcut, and keep diagnostics in an appropriately bounded live region. Before Runtime Context is available, normal startup MUST remain visually empty while exposing accessible busy semantics and MUST NOT render a visible brand, progress indicator, or locale/theme-dependent message. A startup failure MAY reveal a focusable recovery control. Deterministic component and state tests MUST cover startup, absent repeated heading, content/footer order, initial and bounded resized dimensions, both locales, both themes, long text, focus, empty, valid, invalid, limit, and recovery states without screenshots, pixel comparison, browser rendering, or native visual validation.

#### Scenario: Ready ConfigLens fills the available Page body

- **WHEN** ConfigLens is ready at its initial or a user-resized modeled viewport
- **THEN** Monaco fills all space above the footer and relayouts without a second editor, clipped control, duplicated title, or document reload
- **THEN** language, status, Format, Compact and any bounded diagnostics remain inside the footer in document and visual order

#### Scenario: Locale and theme are replaced while editing

- **WHEN** a ready Page receives a complete `zh-CN` dark context after an `en-US` light context
- **THEN** footer controls, hints and diagnostics change to aligned Simplified Chinese and dark semantic tokens while the brand remains `ConfigLens`
- **THEN** input, selected language, current generation, presentation attempt and current user size remain consistent

#### Scenario: Bootstrap waits for Runtime Context

- **WHEN** the Child WebView document is loaded before locale and theme Context is available
- **THEN** normal startup remains visually empty while exposing accessible busy semantics without a visible brand, progress indicator, hard-coded locale-dependent copy or incorrect theme claim
- **THEN** the complete Plugin UI adopts the validated locale/theme and content/footer layout when Context arrives

#### Scenario: Keyboard user formats and recovers from an error

- **WHEN** a user reaches the Page by keyboard, invokes Format through the footer button or `Ctrl/Cmd+Enter`, encounters a diagnostic and corrects the input
- **THEN** focus remains visible and predictable, the bounded footer diagnostic is available without color alone, and the next operation can succeed
- **THEN** the shortcut does not replace the visible button or trap focus inside Monaco

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
