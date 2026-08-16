# Plugin Project Template Specification

## Purpose

Define the two formal plugin project templates, their shared public platform
boundaries, runnable examples, validation gates, and production-boundary
evidence.
## Requirements
### Requirement: The system MUST provide two formal plugin project templates that share public platform boundaries

Within the supported example-plugin workspace, the system MUST provide one
framework-neutral TypeScript template and one React/Semi template. Both
templates MUST be direct workspace members that can be built, type-checked,
tested, and statically checked independently, MUST use distinct namespaced
plugin IDs, and MUST serve as common starting points for official and
third-party plugins. Official origin MUST NOT grant a template different SDK,
Runtime, CSP, permission, Host API, or workspace dependency rules.

#### Scenario: Developer selects the framework-neutral template

- **WHEN** a developer needs a non-React technology stack or direct browser DOM
  manipulation
- **THEN** the framework-neutral template can complete every lifecycle command
  independently
- **THEN** its Runtime and declaration boundaries do not depend on React, React
  DOM, Semi Design, or `@lensx/plugin-ui`

#### Scenario: Developer selects the React/Semi template

- **WHEN** a developer needs React and the public lensX UI language
- **THEN** the React/Semi template can complete every lifecycle command
  independently
- **THEN** it composes its Page through the public `@lensx/plugin-ui` entry
  point and plugin-owned React, React DOM, and Semi Design runtimes without
  consuming Host React Context, globals, or private components

#### Scenario: Root lifecycle covers both templates

- **WHEN** the repository runs the standard `build`, `typecheck`, `test`, or
  `check` command
- **THEN** the corresponding lifecycle covers both templates in workspace
  dependency order
- **THEN** a missing script or validation failure in either template causes the
  root command to fail

### Requirement: Each template MUST contain a complete, minimal, permissionless runnable plugin

Each template MUST contain a Manifest accepted by the real Contract, one Page,
one Action targeting that Page, one package-local WebView Runtime entry, and all
build resources referenced by the Manifest. The examples MUST use Manifest
`0.3.0` without legacy permission fields, MUST NOT call an unpublished native
Host API, and MUST NOT claim trusted origin through
publisher text or an official repository location. The build output MUST be a
self-contained package payload that does not depend on remote scripts, inline
scripts, `eval`, an external network, a Host bundle, or repository source code.

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

### Requirement: Template Runtime MUST demonstrate the real SDK lifecycle and Runtime context adaptation

Both templates MUST use the official `@lensx/plugin-sdk/webview` transport and
an instantiated SDK client, MUST wait for and validate the real Runtime context
before becoming ready, and MUST handle complete context replacement. The
templates MUST use `en-US` as the default copy and provide semantically aligned
`zh-CN` copy, MUST respond to the `light | dark` theme, MUST provide accessible
loading, ready, error, and retry states, and MUST use one idempotent termination
path to cancel subscriptions, unmount the view, and dispose the current client.

#### Scenario: English light context initializes successfully

- **WHEN** the Runtime returns a valid `en-US`, light, and empty or
  permissionless capability snapshot
- **THEN** the template becomes ready and displays English content with light
  presentation
- **THEN** the plugin observes only public context and does not receive plugin
  identity, Page identity, grants, source, path, Host objects, or private wire
  details

#### Scenario: Chinese dark context replacement arrives

- **WHEN** a ready Session receives a valid complete context replacement with
  `zh-CN` and dark
- **THEN** the current view updates to semantically aligned Simplified Chinese
  content with dark presentation
- **THEN** the template does not merge the old locale, theme, or capability
  snapshot into the replacement

#### Scenario: Explicit retry after initialization failure

- **WHEN** SDK initialization fails with a safe lifecycle or Host API error
- **THEN** the template shows a bounded, accessible error state and provides an
  explicit keyboard-operable retry
- **THEN** retry terminates the old attempt before creating a new transport and
  client and does not retry automatically without limit

#### Scenario: Page closes or component unmounts

- **WHEN** the current Page closes, the document lifecycle terminates, the React
  root unmounts, or retry replaces the current attempt
- **THEN** the template removes the context subscription, stops accepting old
  callbacks, and idempotently disposes the current SDK client
- **THEN** repeated or late cleanup does not restore the old view, reuse its
  transport, or affect the new attempt

### Requirement: Templates MUST consume only public packages and portable project dependencies

Template source code and package metadata MUST consume Plugin Contract, SDK,
optional UI, and Testkit only through declared public package exports. A
template MUST NOT depend on the private lensX root package, `src/app/**`,
`tools/**`, a Tauri package or adapter, Host styles, a cross-member source path,
or an unexported deep path. Template dependencies on lensX packages MUST use
publishable ordinary SemVer ranges; source templates MUST NOT contain
`workspace:`, `file:`, `link:`, absolute-path, or repository-relative
dependencies.

#### Scenario: Template is installed outside the repository

- **WHEN** a template is copied outside the workspace and resolves its ordinary
  SemVer dependencies through real public package tarballs
- **THEN** installation, tests, type-checking, build, and static checks do not
  read lensX source code, root `node_modules`, or repository-local paths
- **THEN** installation does not write store metadata in the lensX repository
  root or rebuild its root `node_modules`

#### Scenario: Template attempts to import private capabilities

- **WHEN** either template declares or imports the Host root, Tauri, Host styles,
  a private transport codec, a package-format tool, cross-member source, or an
  unexported subpath
- **THEN** the workspace boundary or external-project gate fails with a stable
  diagnostic
- **THEN** the template's status as an official example does not exempt the
  error

#### Scenario: Framework-neutral template accidentally acquires UI dependencies

- **WHEN** React, React DOM, Semi Design, or Plugin UI appears in the
  framework-neutral template's package graph, declarations, or bundle
- **THEN** the template gate fails and identifies the disallowed dependency
- **THEN** the React/Semi template's optional technology stack does not become a
  transitive requirement of the framework-neutral template

### Requirement: Template tests MUST use the real Contract and SDK while keeping Testkit as the author-side testing boundary

Each template MUST validate its own Manifest with the real Contract validator
and MUST use the real SDK client with the Testkit semantic transport to cover
initialization, context, error, retry, replacement, and disposal. Tests MUST
NOT duplicate Contract or SDK algorithms and MUST NOT represent
`FakePluginSdkTransport` as the real iframe wire, Runtime Session, Host API,
permission decision, or plugin execution.

#### Scenario: Author-side lifecycle test succeeds

- **WHEN** Testkit supplies a valid Runtime context and observes the real SDK
  client created by the template
- **THEN** the test proves that the template enters loading, ready, and terminal
  states in sequence and performs the expected subscription and idempotent
  disposal
- **THEN** observed values come from the public Testkit API rather than a private
  Host implementation

#### Scenario: Testkit transport fails or disconnects

- **WHEN** the semantic transport produces a failure, disconnection, or late
  result during initialization or after ready
- **THEN** the template enters a bounded error or terminal state and ignores
  late results
- **THEN** the test does not construct a private nonce, origin, request ID,
  MessagePort frame, or grant state

### Requirement: The template gate MUST prove canonical packaging and isolated external consumption

The system MUST provide a root-level template validation entry point that
validates both templates independently in a system temporary directory using
real tarballs of the current public packages. The gate MUST use the Host-private
reference packer to produce a canonical `.lxp` from each built, self-contained
payload, MUST inspect it again as compatible, and MUST prove that repeated
packing of identical input is byte-for-byte identical. A template MUST NOT
import that packer, expose a public package-format API, or claim to provide a
public `pack` CLI before Task 6.4.

#### Scenario: Both external templates pass the complete gate

- **WHEN** the root-level template gate runs in clean temporary consumers
  outside the repository
- **THEN** each template independently passes dependency installation, tests,
  type-checking, build, static checks, two deterministic pack operations, and
  compatible inspection
- **THEN** every `.lxp` Manifest, checksum, Runtime entry, Page and Action asset,
  and ordinary file satisfies the current package-format requirements

#### Scenario: External consumer links back to the repository

- **WHEN** a resolved dependency, symlink, bundled module, or build output links
  back to the lensX workspace, root `node_modules`, or private source code
- **THEN** the external-project gate fails
- **THEN** access to the current checkout cannot give the temporary consumer a
  false positive

#### Scenario: Template attempts to provide a public pack command prematurely

- **WHEN** a template's package scripts or source code directly expose the
  Host-private reference packer or declare that tool as an external plugin
  dependency
- **THEN** the template boundary gate fails
- **THEN** the public create, validate, inspect, build, and pack workflow remains
  owned by Task 6.4

### Requirement: The production-boundary smoke test MUST connect template output to the real Host main path

The template gate MUST use actual built and inspected template payloads to cover
the current Host's package acceptance, Registration, Page and Action projection,
resource and Runtime resolution, Runtime Session, public SDK WebView transport,
Host native bridge adapter, RPC validation, Dispatcher `runtime.get_context`, and
terminal cleanup. This smoke test MUST NOT inject `FakePluginSdkTransport` or
treat author-side Testkit as the production Host. Existing macOS WKWebView CSP,
custom-protocol, and isolation evidence MUST remain the target-browser security
prerequisites; this smoke test does not need to establish a second GUI runner.

#### Scenario: Framework-neutral template passes through the production main path

- **WHEN** the Host test boundary accepts a compatible framework-neutral
  template package and opens its contributed Action and Page
- **THEN** the current WebView transport and Runtime Session complete one
  authenticated connection, and the SDK obtains a Contract-valid Runtime
  context through the Dispatcher
- **THEN** after close, the current Session, bridge endpoints, pending requests,
  subscriptions, Runtime attempt, and Page resources all enter the existing
  terminal cleanup

#### Scenario: React/Semi template passes through the production main path

- **WHEN** the same Host test boundary accepts a compatible React/Semi template
  package and opens its contributed Action and Page
- **THEN** it uses the same Session, transport, Dispatcher, RPC, and cleanup
  paths and receives no privilege from React, Semi, official origin, or the UI
  package
- **THEN** the Host does not inject a React runtime, Host Context, private
  styles, or resources that bypass CSP for the template

#### Scenario: Author-side fake is used incorrectly in a production smoke test

- **WHEN** the production-boundary smoke test depends on Testkit,
  `FakePluginSdkTransport`, or a manually fabricated ready context in place of
  the production adapter and Dispatcher
- **THEN** the dedicated gate fails
- **THEN** a template cannot be declared runnable in the real Host solely
  because it compiles and passes author-side unit tests

### Requirement: React/Semi template MUST pass accessibility, locale, theme, and visual validation

The React/Semi template MUST use locale and theme mechanisms supported by
Plugin UI and Semi Design and MUST automate and visually validate `en-US` and
`zh-CN`, light and dark, loading, error and ready states, long text,
keyboard-operated retry, visible focus, and key semantic theme tokens in a
fixed plugin viewport. Template-owned user-visible copy MUST be available in
English and semantically aligned Simplified Chinese, and English MUST be the
default and fallback language.

#### Scenario: Four locale and theme combinations render

- **WHEN** the visual gate renders English/light, English/dark, Chinese/light,
  and Chinese/dark independently
- **THEN** Page content, feedback, Semi controls, and the document theme remain
  readable and do not overflow critical areas in the fixed viewport
- **THEN** computed styles use the public Plugin UI theme contract rather than
  private Host CSS

#### Scenario: User retries from the error state with a keyboard

- **WHEN** the React template is in an initialization error state and the user
  operates retry using only the keyboard
- **THEN** the retry control has visible focus and starts a new attempt
- **THEN** loading, error, and ready states are understandable to assistive
  technologies through appropriate semantics or a live region

### Requirement: The template capability MUST have narrowly scoped bilingual documentation and complete validation

The system MUST document template selection, public dependencies,
Manifest/Page/Action/Runtime structure, lifecycle commands, isolation
validation, and current limitations in canonical English engineering
documentation and MUST provide a semantically aligned Simplified Chinese mirror
at the same relative path. The documentation MUST state explicitly that the
templates are not a public CLI, Development Mode, a native-authority tutorial, or a
complete plugin development tutorial. The dedicated gate, standard frontend
gates, and Rust gates MUST jointly cover this capability; every introduced
warning or error MUST be fixed before rerunning the failed command and the final
validation set.

#### Scenario: External developer reads the template documentation

- **WHEN** a developer opens the template documentation from the English or
  Simplified Chinese index
- **THEN** both languages describe the same template choice, commands, public
  boundaries, permissionless examples, and Task 6.4 and 6.5 limitations
- **THEN** the documentation does not describe the in-repository reference
  packer, production-component smoke test, or Testkit fake as a published CLI
  or complete GUI end-to-end test

#### Scenario: Template change completes validation

- **WHEN** the change is ready to be marked complete
- **THEN** the template-specific gate, frontend tests, formatting and static
  checks, type-checking and build, Rust formatting, Rust tests, and Rust static
  checks all pass, or an auditable reason is recorded for an area that is
  genuinely unaffected
- **THEN** roadmap Task 6.3 is marked complete only after that validation and the
  bilingual documentation are complete

### Requirement: Maintained templates MUST author and execute only the WebView Runtime
Framework-neutral and React/Semi templates MUST emit Manifest `0.3.0` with `runtime.kind: "webview"`, import `@lensx/plugin-sdk/webview`, initialize one SDK client through `createPluginWebviewTransport`, and dispose it with the Page lifecycle. They MUST contain no iframe bootstrap, parent messaging, MessagePort, Tauri, Host source import or native configuration.

#### Scenario: Either template is generated and packed
- **WHEN** an external consumer builds, tests, validates and packs a fresh template
- **THEN** the canonical `.lxp` is accepted by the current Host and opens through the Child WebView path

#### Scenario: Generated project is run outside lensX
- **WHEN** its page is loaded without the Host bridge
- **THEN** SDK initialization fails safely without probing legacy or native fallbacks
