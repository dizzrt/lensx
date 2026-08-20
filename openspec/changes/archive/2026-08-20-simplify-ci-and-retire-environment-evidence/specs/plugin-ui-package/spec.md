## REMOVED Requirements

### Requirement: The package MUST participate in complete automated, visual, release, and documentation validation

**Reason**: This requirement demands an independent browser consumer, fixed-viewport visual fixtures, computed styles, and manual screenshot acceptance. All of those browser and visual paths are retired.

**Migration**: Retain build, typecheck, test, check, test:pack, root aggregation, public exports and types, real tarball, dependency direction, single React, locale, theme, keyboard, focus, state, and bilingual documentation checks. Replace the browser consumer with a temporary package consumer that launches no browser, and remove visual assets, scripts, and Gate.

## ADDED Requirements

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
