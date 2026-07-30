# Frontend Foundation Specification

## Purpose

Define the accepted frontend foundation for the lensX application shell,
application-level providers, localization, theming, error isolation, styling,
and removal of unused scaffold behavior.

## Requirements

### Requirement: The application must provide a product-owned React root interface

The frontend application MUST render a product-owned, semantic, and accessible
minimal App Shell. It MUST NOT continue to display build-tool welcome copy,
example interactions, or presentation-layer mock features. The App Shell MUST
display the lensX product identity and description in the current locale and
MUST provide a locally controlled launcher input that accepts text without
producing search results. The App Shell MUST NOT imply that unimplemented
action search, execution, settings, or plugin capabilities are available.

#### Scenario: Start the application

- **WHEN** the React application completes its root render
- **THEN** the page contains an accessible main content region
- **THEN** the page displays the lensX product identity and product description
  in the current locale
- **THEN** the page displays a launcher input with an accessible name and
  localized placeholder
- **THEN** the page does not display Rsbuild welcome copy or example
  interactions

#### Scenario: Edit text in the minimal launcher input

- **WHEN** a user enters or deletes text in the launcher input
- **THEN** the input reflects the current text through local React state
- **THEN** the page does not generate simulated search results or actions

#### Scenario: Inspect unavailable features

- **WHEN** a user views the minimal App Shell
- **THEN** the page does not display a search result list, settings entry point,
  simulated action, or plugin entry point
- **THEN** the page does not describe planned capabilities as implemented

### Requirement: The application must provide a unified global provider foundation

The frontend application MUST provide application localization, theme, Semi
Design locale, and error isolation through a single root provider composition.
Subsequent pages MUST reuse the global context supplied by this composition and
MUST NOT create parallel sources of truth for the application locale or theme.

#### Scenario: Render the root application

- **WHEN** the frontend entry point renders the App
- **THEN** the App is inside the unified application localization, theme, and
  Semi Design locale contexts
- **THEN** the App subtree is inside the application error boundary

#### Scenario: A subsequent page consumes global context

- **WHEN** a child page of the App Shell reads the application locale or theme
- **THEN** the page receives the current value from the root provider
- **THEN** the page does not need to create an independent global provider

### Requirement: The application must support light and dark themes

The application MUST support `light` and `dark` theme modes and MUST use
`light` by default. It MUST use the global theming mechanism supported by Semi
Design so that application content and overlays use consistent theme tokens.
Application-owned styles MUST NOT hard-code background, text, or border colors
that only work in one theme.

#### Scenario: Use the default theme

- **WHEN** the application does not receive an explicit theme value
- **THEN** the application renders in `light` mode
- **THEN** the document color scheme is consistent with light mode

#### Scenario: Switch to the dark theme

- **WHEN** the application theme changes to `dark`
- **THEN** the App Shell and Semi Design components use dark theme tokens
- **THEN** Semi Design content mounted in the global overlay container also
  uses the dark theme
- **THEN** the document color scheme is consistent with dark mode

#### Scenario: Restore the light theme

- **WHEN** the application theme changes from `dark` to `light`
- **THEN** the App Shell and Semi Design components resume using light theme
  tokens
- **THEN** no attribute that places global content in dark mode remains

### Requirement: The application must support English and Simplified Chinese localization

The application MUST provide the `en-US` and `zh-CN` locales and MUST use
`en-US` by default. The application locale MUST drive product messages, Semi
Design built-in copy, and the HTML document language together. English messages
MUST be the canonical source, and the Simplified Chinese resource MUST contain
the same semantically aligned message keys.

#### Scenario: Use the default locale

- **WHEN** the application does not receive an explicit locale
- **THEN** product copy uses English messages
- **THEN** Semi Design uses its English locale
- **THEN** the HTML document language is `en-US`

#### Scenario: Switch to Simplified Chinese

- **WHEN** the application locale changes to `zh-CN`
- **THEN** product copy uses Simplified Chinese messages
- **THEN** Semi Design uses its Simplified Chinese locale
- **THEN** the HTML document language is `zh-CN`

#### Scenario: Switch back to English

- **WHEN** the application locale changes from `zh-CN` to `en-US`
- **THEN** product messages, Semi Design built-in copy, and the HTML document
  language all return to English

### Requirement: User-visible product copy must be managed by application localization

All user-visible product titles, descriptions, errors, and action copy MUST
come from the application message resources. React components MUST NOT add
untranslatable product copy. The Semi Design locale MUST only supply built-in
component copy and MUST NOT replace application product messages.

#### Scenario: Render product copy

- **WHEN** the App Shell displays a product description or action copy in
  addition to its title
- **THEN** the copy comes from the application messages for the current locale

#### Scenario: Render Semi Design built-in copy

- **WHEN** a Semi Design component needs to display built-in copy
- **THEN** the copy comes from the Semi Design locale pack corresponding to the
  application locale
- **THEN** application messages are not carried by modifications to a component
  library locale pack

#### Scenario: Validate locale resources

- **WHEN** the project runs frontend tests or static validation
- **THEN** the English and Simplified Chinese resources contain identical
  message-key sets

### Requirement: The root application must isolate rendering failures and provide recovery

The application MUST catch rendering failures in the App Shell subtree. It MUST
display an accessible failure fallback and recovery action in the current
locale, and MUST NOT directly expose error stacks or internal implementation
details to users.

#### Scenario: A child subtree fails to render

- **WHEN** the App Shell subtree throws an error during rendering
- **THEN** the application displays a localized error title, description, and
  recovery action
- **THEN** the fallback continues to use the current theme
- **THEN** the page does not display an error stack

#### Scenario: A user performs the recovery action

- **WHEN** a user activates the recovery action in the error fallback
- **THEN** the application requests a reload of the current window

### Requirement: Frontend styles must follow the UnoCSS and Less division of responsibility

The frontend MUST use UnoCSS for simple, local layout, spacing, sizing, and
alignment. It MUST use Less for global base rules, complex semantic styles,
state combinations, theme-token bridging, and reusable styles. The application
MUST import the Semi Design global styles exactly once at the application entry
point and MUST NOT retain a template CSS entry that conflicts with this
division.

#### Scenario: Implement App Shell layout

- **WHEN** the App Shell only needs flex, sizing, spacing, or alignment styles
- **THEN** the implementation uses UnoCSS utilities or a project shortcut

#### Scenario: Implement global or complex styles

- **WHEN** styles cover root-element resets, theme variables, complex states,
  or reusable semantics
- **THEN** the implementation uses the project Less entry point

#### Scenario: Load global component styles

- **WHEN** the frontend entry point starts
- **THEN** the Semi Design global styles and the project global Less styles are
  each loaded exactly once

### Requirement: The repository must remove unused scaffold behavior

The repository MUST remove the build-tool welcome page, example tests, example
Tauri command, and type declarations for build plugins that lensX does not use.
It MUST preserve the functioning React, Tauri, testing, and styling toolchain.

#### Scenario: Inspect the frontend scaffold

- **WHEN** a developer searches the current frontend source and tests
- **THEN** no Rsbuild welcome copy or template test for that copy exists
- **THEN** no `*.svg?react` declaration exists solely for an uninstalled SVG
  transformation plugin

#### Scenario: Inspect Tauri commands

- **WHEN** a developer inspects the Rust entry point and registered commands
- **THEN** no example `greet` command or handler registration exists
- **THEN** the Tauri application can still build and start through the existing
  run entry point
