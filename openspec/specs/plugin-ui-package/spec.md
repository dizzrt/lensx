# Plugin UI Package Specification

## Purpose

Define the stable public contract for the optional `@lensx/plugin-ui` package, including its constrained exports, Runtime context adaptation, semantic theme tokens, accessible page and feedback components, plugin-owned Runtime dependencies, and complete release validation, without claiming delivery of a Host plugin Runtime.
## Requirements

### Requirement: The system MUST provide an optional constrained public Plugin UI package

The system MUST provide the public `@lensx/plugin-ui@0.1.0` workspace package, which MUST be independently buildable, testable, and packable. The package MUST expose only one JavaScript root entry and one `@lensx/plugin-ui/styles.css` style entry; package resolution MUST reject undeclared deep imports. The public JavaScript entry MUST provide only `PluginUiProvider`, `PluginPage`, `PluginFeedback`, and their public types, and MUST NOT re-export the complete Semi Design API, Host React Context, Host-private components, `src/app/**`, Tauri adapters, or Host-private styles.

#### Scenario: A React plugin consumes the public entries from real tarballs

- **WHEN** a React consumer outside the workspace installs real Plugin Contract, SDK, and UI tarballs and imports only the declared JavaScript and style entries
- **THEN** the consumer's TypeScript typecheck, browser build, and Runtime smoke test succeed
- **THEN** the consumer does not need to access the lensX private root, Host React Context, Tauri, or Host-private styles

#### Scenario: A consumer attempts a deep import

- **WHEN** a consumer imports an undeclared UI package source, test, fixture, script, internal component, or internal style path
- **THEN** package resolution rejects the import

#### Scenario: A non-React plugin ignores the UI package

- **WHEN** a framework-neutral consumer installs and uses only the Plugin Contract and Plugin SDK
- **THEN** the consumer continues to typecheck and run without installing React, React DOM, Semi Design, or the Plugin UI package
- **THEN** the Plugin SDK's published dependencies and public declarations do not contain the Plugin UI package, React, or Semi Design

### Requirement: PluginUiProvider MUST adapt the validated Runtime context within the plugin document

`PluginUiProvider` MUST accept a read-only `PluginRuntimeContext` and use its `locale` and `theme` to drive the plugin's own React subtree and document. The provider MUST map `en-US` and `zh-CN` to the corresponding official Semi Design locale packs, MUST synchronize the document language, CSS `color-scheme`, and Semi Design-supported light/dark body theme attribute, and MUST restore the document values that existed before mount when it unmounts. The provider MUST NOT read Host AppProviders, Host preferences, Tauri, or transport, and MUST NOT claim to provide a Runtime context update protocol.

#### Scenario: The provider initializes with an English light context

- **WHEN** the provider receives a validated Runtime context whose locale is `en-US` and theme is `light`
- **THEN** children render under the English Semi locale, the document language is `en-US`, the color scheme is light, and the dark body theme attribute is absent

#### Scenario: The provider initializes with a Chinese dark context

- **WHEN** the provider receives a validated Runtime context whose locale is `zh-CN` and theme is `dark`
- **THEN** children render under the Chinese Semi locale, the document language is `zh-CN`, the color scheme is dark, and the body uses the Semi Design-supported dark theme attribute

#### Scenario: The caller supplies a new context snapshot

- **WHEN** the mounted provider's context prop changes from one supported locale and theme snapshot to another supported snapshot
- **THEN** the locale, document language, color scheme, body theme, and package-owned feedback copy update consistently
- **THEN** the provider does not independently subscribe to SDK transport, poll the Host, or invent a context event

#### Scenario: The provider unmounts

- **WHEN** the provider unmounts from its exclusive plugin document environment
- **THEN** the document language, color scheme, and body theme attribute that existed before mount are restored
- **THEN** no package listener or global state remains

### Requirement: The package MUST expose a small versioned semantic theme contract

The system MUST provide lensX plugin semantic styles through the public style entry and MUST define the following CSS custom properties as part of the `0.1.0` public contract: `--lensx-plugin-color-background`, `--lensx-plugin-color-surface`, `--lensx-plugin-color-text`, `--lensx-plugin-color-text-secondary`, `--lensx-plugin-color-border`, `--lensx-plugin-color-accent`, `--lensx-plugin-color-danger`, `--lensx-plugin-color-focus`, `--lensx-plugin-radius-page`, and `--lensx-plugin-space-page`. Color tokens MUST be based on the package-supported Semi Design tokens and theme mechanism. Published styles MUST NOT import Host `src/styles/**`, depend on Host UnoCSS scanning, or expose Launcher-specific selectors.

#### Scenario: A consumer imports the public styles

- **WHEN** a consumer imports only `@lensx/plugin-ui/styles.css`
- **THEN** Plugin UI components and supported Semi components used directly by the consumer receive the required base styles
- **THEN** all ten `--lensx-plugin-*` tokens exist without requiring Host global styles

#### Scenario: The theme switches between light and dark

- **WHEN** the provider context theme changes between light and dark
- **THEN** the page, feedback, text, border, accent, danger, and focus presentation uses the corresponding theme token values
- **THEN** components do not express state with hard-coded colors that are suitable for only one theme

#### Scenario: A plugin extends its own UI with public tokens

- **WHEN** plugin CSS uses the declared `--lensx-plugin-*` tokens to build a custom region
- **THEN** the custom region can share stable light and dark theme semantics with package components
- **THEN** Semi tokens that are not in the public list are not described as long-term lensX compatibility commitments

### Requirement: PluginPage MUST provide an accessible lensX page frame without Host behavior

`PluginPage` MUST provide a single semantic main/page region, an accessible page heading, an optional description, optional actions, and a content region, and MUST use the public lensX tokens to provide stable page spacing, typography, surface, and focus semantics. The component MUST accept the plugin's own localized React content and MUST NOT contain a Host router, Launcher page context, window drag or close behavior, Action Dispatcher, Tauri calls, or Host navigation state.

#### Scenario: A plugin renders normal page content

- **WHEN** a plugin provides `PluginPage` with a title, description, actions, and children
- **THEN** the page renders with main, heading, and content structure, and the actions are keyboard reachable and retain visible focus
- **THEN** the page layout remains readable in `en-US` and `zh-CN` and in light and dark themes

#### Scenario: A plugin provides only required content

- **WHEN** a plugin provides only a title and children
- **THEN** the page still has complete heading and content structure
- **THEN** the absence of an optional description or actions does not create empty interactive elements

#### Scenario: A plugin attempts to use Host page capabilities

- **WHEN** a consumer inspects the public props and declarations of `PluginPage`
- **THEN** the API does not contain a Host navigation service, React setter, Tauri window, Launcher Action executor, or private page context

### Requirement: PluginFeedback MUST provide localized and accessible page states

`PluginFeedback` MUST provide the three discriminated states `loading`, `empty`, and `error`; MUST provide package-owned default title, description, and retry copy for `en-US` and `zh-CN`; and MUST allow a plugin to override that copy with its own localized React content. Loading MUST expose busy and polite status semantics, empty MUST use non-error status semantics, and error MUST use error semantics that assistive technology can perceive promptly. An optional recovery action MUST be keyboard operable and MUST NOT automatically call a Host API.

#### Scenario: Loading state

- **WHEN** a plugin renders loading feedback without overriding the copy
- **THEN** the default loading copy for the current provider locale is visible
- **THEN** the feedback exposes busy and polite live-status semantics and does not steal keyboard focus

#### Scenario: Empty state

- **WHEN** a plugin renders empty feedback
- **THEN** the default or plugin-overridden empty copy for the current locale is visible
- **THEN** the state is not expressed through color alone and is not marked as an error alert

#### Scenario: Error and recovery action

- **WHEN** a plugin renders error feedback and provides a recovery action
- **THEN** the default or overridden error copy for the current locale is presented with error semantics
- **THEN** the user can trigger the recovery action with the keyboard, and the package calls only the handler supplied by the plugin

#### Scenario: The provider locale changes while feedback is displayed

- **WHEN** mounted feedback that uses package-owned default copy updates from an `en-US` context to a `zh-CN` context
- **THEN** the title, description, and retry copy update together to semantically equivalent Chinese
- **THEN** content overridden by the plugin remains under the plugin's control

### Requirement: Plugin Runtime dependencies MUST remain plugin-owned and Host-independent

`@lensx/plugin-ui` MUST declare React, React DOM, and the Plugin SDK as compatible peer dependencies and MUST declare every Semi Design package it actually imports as a direct Runtime dependency. The published UI library MUST NOT inline a second copy of React. The final React plugin browser artifact MUST be produced by the plugin project and contain its own React, React DOM, Semi Design, Plugin UI JavaScript, and styles, and MUST NOT depend on Host externals, import maps, window globals, or shared Host React or Semi Design instances.

#### Scenario: A React consumer installs and builds its own Runtime

- **WHEN** an external React consumer directly installs the UI package's peer dependencies and builds a browser artifact
- **THEN** the consumer and Plugin UI components use the consumer's own single React instance
- **THEN** the final artifact contains no unresolved React, React DOM, Semi Design, or Host-private bare external

#### Scenario: The Host provides no UI Runtime globals

- **WHEN** the consumer starts in an independent browser document without Host React, Semi Design, Host CSS, Tauri, or lensX private globals
- **THEN** the provider, page, and feedback still render correctly through public dependencies and styles

#### Scenario: Package metadata is checked

- **WHEN** the release gate checks a real UI tarball's dependencies, peer dependencies, exports, `sideEffects`, and file list
- **THEN** metadata explicitly preserves style side effects and assigns every Runtime import to a declared dependency or peer dependency
- **THEN** the tarball does not contain tests, fixtures, build scripts, Host source code, or workspace version ranges

### Requirement: Plugin UI MUST remain document-local inside the Child WebView
`@lensx/plugin-ui` MUST continue to consume only validated public Runtime Context and plugin-owned React/Semi dependencies inside the plugin document. It MUST NOT access Host DOM, native slot/bounds, Child WebView handles, bridge frames, Tauri APIs or Host navigation. Its theme, locale, accessibility and feedback behavior MUST work when rendered as the top-level Child WebView document.

#### Scenario: Plugin UI renders in current Child WebView
- **WHEN** a plugin supplies validated Runtime Context to `PluginUiProvider`
- **THEN** components adapt locale/theme within the plugin document without native or Host authority

#### Scenario: Package declarations are inspected
- **WHEN** public tarball boundaries are checked
- **THEN** no Runtime container, bridge or Host-private type leaks through Plugin UI exports

### Requirement: The package MUST participate in complete deterministic package, component, release, and documentation validation

The UI package MUST declare meaningful non-overlapping `build`, `typecheck`, `test`, `check`, and deterministic `test:pack` scripts, and root workspace aggregate commands MUST cover them once in dependency order. Validation MUST cover public types/exports, a real tarball in an isolated command-line consumer, dependency direction, a single React instance, normal/empty/error/recovery states, keyboard/focus behavior, both supported languages, light/dark semantic themes, and bilingual documentation. It MUST NOT launch a browser, capture computed styles or screenshots, compare pixels, or retain a visual fixture.

#### Scenario: Root workspace validation covers the package

- **WHEN** a developer runs the root `build`, `typecheck`, `test`, or `check` command
- **THEN** the corresponding UI package lifecycle stage runs once in workspace dependency order and failures propagate
- **THEN** boundary checks reject SDK-to-UI, UI-to-Host-private, and plugin-to-Host-Runtime dependencies

#### Scenario: Deterministic behavior matrix runs

- **WHEN** package tests run provider, page, and feedback component/state cases
- **THEN** assertions for `en-US`/`zh-CN`, light/dark semantic state, normal/loading/empty/error/recovery, cleanup, keyboard, and focus pass
- **THEN** the test does not require a browser or pixel output

#### Scenario: Tarball consumer runs in isolation

- **WHEN** `test:pack` installs the current UI and required public package tarballs into a temporary consumer
- **THEN** public entry points, declarations, styles, dependency metadata, and React peer ownership are consumable without repository source access
- **THEN** the consumer starts no browser, WebView, GUI application, or native harness

#### Scenario: A developer reads bilingual documentation

- **WHEN** a developer reads English or Simplified Chinese plugin architecture and workspace documentation
- **THEN** both languages describe React/non-React consumption, public components/tokens, style import, plugin-owned dependencies, and deterministic validation with equivalent semantics
- **THEN** neither language describes the UI package as a native Runtime, Host API, installer, Testkit, or plugin execution capability
