## MODIFIED Requirements

### Requirement: The production-boundary smoke test MUST connect template output to the real Host main path

The template gate MUST use actual built and inspected template payloads to cover the current Host's package acceptance, Registration, Page and Action projection, resource and Runtime resolution, Runtime Session, public SDK WebView transport codec, Host bridge adapter, RPC validation, Dispatcher `runtime.get_context`, and terminal cleanup through deterministic production-composition tests. This smoke test MUST NOT inject `FakePluginSdkTransport` or treat author-side Testkit as the production Host. It MUST NOT depend on an existing browser, WebView, GUI, native harness, or target-environment prerequisite.

#### Scenario: Framework-neutral template passes through the production composition

- **WHEN** the deterministic Host test boundary accepts a compatible framework-neutral template package and opens its contributed Action and Page state
- **THEN** the current transport adapter and Runtime Session complete one authenticated modeled connection, and the SDK obtains a Contract-valid Runtime context through the Dispatcher
- **THEN** after close, the current Session, bridge endpoints, pending requests, subscriptions, Runtime attempt, and Page resources enter terminal cleanup

#### Scenario: React/Semi template passes through the production composition

- **WHEN** the same Host test boundary accepts a compatible React/Semi template package and opens its contributed Action and Page state
- **THEN** it uses the same Session, transport, Dispatcher, RPC, and cleanup paths and receives no privilege from React, Semi, official origin, or the UI package
- **THEN** the Host does not inject a React runtime, Host Context, private styles, or resources that bypass CSP for the template

#### Scenario: Author-side fake is used incorrectly in a production smoke test

- **WHEN** the production-boundary smoke test depends on Testkit, `FakePluginSdkTransport`, or a manually fabricated ready context in place of production adapters and Dispatcher
- **THEN** the dedicated deterministic gate fails
- **THEN** a template cannot be declared connected to production composition solely because it compiles and passes author-side unit tests

## REMOVED Requirements

### Requirement: React/Semi template MUST pass accessibility, locale, theme, and visual validation

**Reason**: This requirement explicitly demands a browser visual Gate, fixed viewports, computed styles, and screenshot acceptance. All of those assets and entry points are retired.

**Migration**: Retain English defaults and fallback, the Simplified Chinese mirror, semantic light and dark themes, loading, error and ready states, long text, keyboard retry, visible focus, and accessibility semantics. Move them into Rstest component, state, and theme-token assertions without visual baselines.

## ADDED Requirements

### Requirement: React/Semi template MUST pass deterministic accessibility, locale, and theme validation

The React/Semi template MUST use locale and theme mechanisms supported by Plugin UI and Semi Design. Rstest component and state tests MUST cover `en-US` and `zh-CN`, light and dark semantic theme state, loading, error and ready states, long text, keyboard-operated retry, visible focus semantics, and key public theme tokens without browser rendering, screenshots, pixel comparison, or computed-style capture. Template-owned user-visible copy MUST be available in English and semantically aligned Simplified Chinese, with English as default and fallback.

#### Scenario: Four locale and theme states are validated

- **WHEN** deterministic component tests render English/light, English/dark, Chinese/light, and Chinese/dark state independently
- **THEN** Page content, feedback, controls, document theme attributes, and public semantic tokens match the selected context
- **THEN** tests depend on public Plugin UI contracts rather than private Host CSS

#### Scenario: User retries from the error state with a keyboard

- **WHEN** the React template is in an initialization error state and retry is operated through keyboard events
- **THEN** the retry control exposes visible-focus state and starts a new attempt
- **THEN** loading, error, and ready states remain understandable through appropriate accessibility semantics or a live region
