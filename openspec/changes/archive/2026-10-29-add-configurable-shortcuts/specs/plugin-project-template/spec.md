# Spec Delta

## MODIFIED Requirements

### Requirement: Each template MUST contain a complete, minimal, permissionless runnable plugin

Each template MUST contain a Manifest accepted by the real Contract, one Page,
one Action targeting that Page, one package-local WebView Runtime entry, and all
build resources referenced by the Manifest.

#### Scenario: Minimal Manifest and resource graph are valid

- **WHEN** a template's actual Manifest passes through the public validator,
  normalizer, and package resource resolution
- **THEN** the Manifest, Page, Action target, Runtime entry, and all resources
  are valid and compatible with the current lensX and Host API ranges
- **THEN** the Action can open the Page contributed by the template through the
  current Host projection

#### Scenario: Example uses the open isolated Runtime

- **WHEN** the template plugin is installed and initializes its Runtime
- **THEN** installation creates no permission or grant workflow, and the
  example may use supported ordinary Web capabilities inside its isolated page
- **THEN** the Page, SDK initialization, Runtime context display, and local
  frontend interaction remain separated from native Host authority

#### Scenario: Manifest or resource is invalid

- **WHEN** a test invalidates a Page or Action reference, Runtime entry,
  resource path, or Manifest contract
- **THEN** Contract or package inspection rejects the template output with a
  stable diagnostic
- **THEN** the invalid output does not enter the production Runtime smoke test

#### Scenario: Validate minimal template resources and authority

- **WHEN** the minimal template Manifest and built Runtime payload are inspected
- **THEN** Examples MUST use the current Manifest `0.4.0` without legacy permission fields, MUST NOT call unpublished native Host APIs, and MUST NOT claim trusted authority through Publisher text or an official repository location.
- **THEN** The build output MUST be a self-contained package payload that does not depend on remote scripts, inline scripts, `eval`, an external network, a Host bundle, or repository source code.

### Requirement: Maintained templates MUST author and execute only the WebView Runtime

Framework-neutral and React/Semi templates MUST use Contract `0.4.0` and SDK `0.5.0`, producing Manifest `0.4.0`, `runtime.kind: "webview"`, and the Host API compatibility range `>=0.4.0 <0.5.0`. Each Page MUST initialize one SDK client through the public WebView transport and dispose it with the Page lifecycle.

#### Scenario: Either template is generated and packed
- **WHEN** an external consumer builds, tests, validates and packs a fresh template
- **THEN** the canonical `.lxp` uses Manifest `0.4.0`, is accepted by the current Host and opens through the Child WebView path at the fixed default presentation

#### Scenario: Author opts one Page into user resize
- **WHEN** the author adds a Contract-valid Page presentation following maintained guidance
- **THEN** template tests and package inspection agree on the bounded initial size and boolean opt-in
- **THEN** the generated Runtime still has no Tauri/native resize API and observes user changes only through normal Web viewport behavior

#### Scenario: Generated project is run outside lensX
- **WHEN** its page is loaded without the Host bridge
- **THEN** SDK initialization fails safely without probing legacy, presentation, or native fallbacks

#### Scenario: Apply default or opted-in Page presentation

- **WHEN** a maintained template emits a default Page or demonstrates explicit bounded presentation
- **THEN** Default generated Pages MUST omit presentation and therefore normalize to fixed `650×600`; maintained guidance or fixtures MAY demonstrate an explicit bounded initial size and `resizable` opt-in.
- **THEN** Templates MUST contain no iframe bootstrap, parent messaging, MessagePort, Tauri, Host source import, native Window configuration, runtime resize setter, or user-size persistence.

## ADDED Requirements

### Requirement: Maintained templates MUST demonstrate optional shortcut activation without native authority

Both templates and their CLI snapshots MUST preserve the same public contract and demonstrate the optional `onShortcutActivated` SDK creation option in documentation and testable examples. Omitting the callback MUST still allow normal opening; examples MUST use only the semantic source from independent Activation and MUST NOT add Runtime Context fields or native input permissions.

#### Scenario: Author provides the optional callback
- **WHEN** an author provides onShortcutActivated in createPluginSdk options and initializes the client
- **THEN** the first and subsequent dedicated shortcut activations invoke the callback, while normal entry does not
- **THEN** the callback can read this plugin's Action ID without receiving actual keys; SDK disposal stops subsequent delivery when the Page is destroyed

#### Scenario: Author omits the callback or activation capability is absent
- **WHEN** the template omits the callback or valid Context does not advertise the activation subscription method
- **THEN** the template still reaches ready through its existing lifecycle, and an empty capability snapshot remains valid
- **THEN** when the capability is absent, activation is null and no callback occurs; the template does not attempt private bridging or native input access

#### Scenario: Template snapshots and old package evidence
- **WHEN** the CLI generates a new project or a pure CLI consumer checks it
- **THEN** generated output matches the canonical template's versions, compatibility ranges, and optional callback examples
- **THEN** historical incompatible package fixtures are preserved; rewriting old packages does not establish new-protocol compatibility
