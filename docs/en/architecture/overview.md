# Architecture Overview

## Document Status

This document defines the maintained architectural direction for lensX and
records the foundation currently present in the repository. Architectural
direction is not evidence that a capability is shipped; source code, tests, and
stable specs determine implemented behavior.

## Product Purpose

lensX is a lightweight desktop productivity launcher. It is designed around:

- fast global activation;
- keyboard-first interaction;
- low resident resource use;
- local-first workflows;
- explicit, safe extension boundaries;
- predictable behavior across supported desktop platforms.

## Current Foundation

The repository currently provides:

- a Tauri 2 desktop application runtime backed by Rust;
- a React and TypeScript frontend built with Rsbuild and Rspack;
- Semi Design, UnoCSS, and Less as the frontend UI and styling foundation;
- a product-owned React App Shell with unified locale, theme, Semi Design, and
  render-error boundaries;
- a compact native launcher window with unified Rust-owned show, hide, toggle,
  global-shortcut, close, and focus-loss lifecycle behavior;
- a framework-neutral TypeScript launcher action core with validated
  descriptors, a Host-owned registry, a dispatcher, and built-in hide and
  settings actions;
- deterministic launcher action search over immutable registry snapshots, with
  localized matching and an accessible keyboard-first result interface;
- a single-window Host settings surface with persisted theme and locale
  preferences plus a deliberately empty plugin section;
- Rstest, Testing Library, TypeScript checks, Biome, and Cargo validation
  commands;
- OpenSpec configuration for capability and architecture changes.

Product capabilities beyond this foundation must not be described as
implemented until their source code and tests exist.

## Frontend Application Foundation

`src/index.tsx` is the only frontend composition entry. It imports the Semi
Design global stylesheet and the project `global.less` entry once, then renders
`AppBootstrap`. The bootstrap reads preferences before rendering the product
App Shell and falls back to safe defaults without blocking startup when that
read fails.

`AppProviders` is the single application-level provider composition:

```text
AppBootstrap
└── AppLocaleProvider
    └── AppThemeProvider
        └── Semi Design LocaleProvider
            └── AppErrorBoundary
                └── App
```

The application locale is limited to `en-US` and `zh-CN`, defaults to `en-US`,
and drives application messages, the corresponding official Semi Design locale
pack, and the HTML `lang` attribute. English messages are canonical, and both
message resources keep the same nested hierarchy and leaf-key set. Statically
imported resources live in `src/app/i18n/messages/en-US.json` and `zh-CN.json`;
application lookups address their leaves with dot-separated paths. A shared
`messages.schema.json` mirrors the hierarchy, fixes the allowed and required
keys, rejects additional keys, and requires non-empty string values. Frontend
tests validate every locale against that schema and compare complete leaf-key
sets. The confirmed locale is persisted through the Rust preferences boundary;
it does not follow an operating-system preference.

The application theme is limited to `light` and `dark` and defaults to
`light`. The theme provider uses `body[theme-mode="dark"]` so Semi Design
content mounted under `body`, including overlays, receives the same token set.
It also synchronizes the document `color-scheme`. The confirmed theme is
persisted through the same Rust preferences boundary; it does not follow an
operating-system preference.

`AppErrorBoundary` isolates render failures below the provider root. Its
localized Semi Design fallback preserves the current theme and offers a window
reload action without displaying exception details. Event-handler and
asynchronous errors require explicit error states and are outside this render
boundary.

The App Shell derives three presentation states from local `activePage` and
normalized query state. `home` owns the empty-query content area without
implying recommendations, history, or pinned actions. `search` exposes the
controlled launcher input and at most eight real enabled Action results.
`page` replaces the input with a localized page-context header and renders the
validated Host page in the same window. Closing a page returns to `home` and
restores input focus. A page-level error boundary retains that header and close
control when page content fails.

## Launcher Window Lifecycle

The Tauri webview window with the stable `main` label is configured as a
compact launcher surface. It has a fixed width of 650px, an initial height of
240px, a minimum height of 180px, and a maximum height of 800px. The window is
transparent, always on top, undecorated, non-resizable, and non-fullscreen.

The Host maps App Shell presentation state to fixed logical heights through a
typed Rust command: `home` uses 240px, `search` uses 480px, and `page` uses
600px. This keeps the shared content region visible without measuring DOM
content or changing height based on the number of search results. The frontend
cannot submit arbitrary dimensions.

Rust owns all native launcher window operations through one action boundary:

- `show` restores the window, shows it, requests focus, and then emits a typed
  activation event;
- `hide` hides the window without terminating the application process;
- `toggle` reads the current visibility and reuses the corresponding `show` or
  `hide` path.

The action boundary resolves the `main` window through a Tauri adapter and
reports failures with both the requested action and the failing native
operation stage. Native shortcut and window-event handlers route actions
through this boundary rather than calling window APIs independently.

The official Tauri global-shortcut plugin registers one default
`Ctrl+Shift+Space` binding. Only its pressed event routes to `toggle`; release
events and unknown shortcuts do nothing. Lifecycle setup first installs the
action state, then registers the shortcut, and only then attaches the main
window listeners. After registration succeeds, a close request is prevented
and routed to `hide`, and focus loss is also routed to `hide`. If shortcut
registration fails, the application reports the binding failure and leaves
hide-on-close and hide-on-blur disabled, so the visible window keeps ordinary
close behavior instead of becoming unrecoverable.

After a successful `show`, Rust emits `launcher://activated` to the main
webview. Its serializable payload contains a `reason` field with one of
`startup`, `global_shortcut`, or `programmatic`, using snake-case serialized
values. React receives this contract through a typed desktop adapter. The
launcher input focuses itself on initial mount and focuses again after each
activation. Its hook keeps one subscription for the active event source,
releases the listener when the source changes or the component unmounts, and
diagnoses malformed payloads or listener failures without breaking initial
input focus. Each activation also refreshes search from the current query and
latest registry snapshot without filling, clearing, or executing an action.

This lifecycle does not itself implement query matching, result lists,
settings, shortcut customization, persistence, or plugin runtime behavior. The
separate constrained surface-mode command only controls the fixed presentation
height of the same `main` window.

## Launcher Action Core

The launcher action core lives under `src/app/launcher/actions/` in the trusted
TypeScript application and domain layer. It does not depend on React, Semi
Design, or Tauri APIs. Each action has a validated, serializable descriptor
with a stable namespaced `action_id`, an `owner_id`, localized metadata,
localized default keywords, and a static enabled state. English metadata is
canonical, Simplified Chinese is supported, and missing localized text falls
back to English.

`LauncherActionRegistry` is the only running source of truth for registered
launcher actions. Registration validates and normalizes unknown descriptor
input before committing it, rejects duplicate IDs, and applies batches
atomically. Public lookups and snapshots return deeply isolated descriptor
data, never executors. Snapshots are ordered by `action_id` so their default
order does not depend on provider load order.

Executors remain Host-owned and are resolved only by
`LauncherActionDispatcher`. Dispatch returns an explicit success or typed
`action_not_found`, `action_unavailable`, or `action_execution_failed` result.
Thrown, rejected, or invalid executor results are contained and do not expose
native or framework objects through the public contract.

The default service registers `lensx.core.hide_launcher` and
`lensx.core.open_settings`. Their localized metadata comes from canonical
application message resources. The hide executor calls a typed desktop adapter,
which invokes the narrow `hide_launcher` Tauri command. The settings executor
calls the framework-neutral `AppNavigationService` with the fixed
`lensx.core/settings` Host target. Neither public descriptor exposes an
executor or page target.

The production launcher action service is created once outside React rendering
and can be replaced with an isolated service at the App Shell boundary for
tests. Launcher action search is a pure consumer of registry descriptor
snapshots. It normalizes queries and searchable metadata with Unicode NFKC,
locale-aware case folding, and collapsed Unicode whitespace. Every query token
must match the resolved title, one resolved default keyword, or the resolved
description. Fixed exact, prefix, and substring weights produce a descending
score order, with `action_id` as the deterministic tie-breaker. Disabled actions
are filtered before the sorted result set is truncated to the v0 limit of eight.
Search results are frozen serializable data containing identity, resolved
display text, and score; they never contain executors or registry internals.

The App Shell treats those results as a combobox/listbox interaction. The first
result is selected by default, arrow-key movement stops at the list boundaries,
Escape clears the search, and pending dispatch prevents duplicate execution.
Success clears the query; typed dispatcher failures preserve the query and
selection while showing localized safe feedback. Result count, empty, pending,
success, and failure states are announced through a live region. The bounded
result list scrolls inside the existing surface and does not resize the native
window.

History, recent use, pinned actions, dynamic provider subscriptions, plugin
management, and plugin action projection remain future capabilities.

## Host Pages And Preferences

Host pages use a flat `owner_id`, `page_id`, and `opened_by_action_id`
identity. A trusted Host page catalog preflights targets before
`AppNavigationService` sends an `ActivePage` to the single App Shell handler.
This identity shape may be reused by future validated plugin pages, but the
current catalog contains only `lensx.core/settings`; external plugins cannot
provide React components, executors, or direct App Shell mutations.

Settings is rendered in the existing `main` Tauri window. It has first-level
Preferences and Plugins sections. Preferences controls the supported
`light`/`dark` theme and `en-US`/`zh-CN` locale. Plugins is an empty,
non-operational placeholder and does not imply plugin management.

Rust owns the complete `AppPreferences` payload and stores
`preferences.json` in the application config directory. Missing files return
`light` and `en-US`; invalid content and I/O failures return stable,
serializable, safe errors. Writes use a temporary file followed by replacement.
The TypeScript desktop adapter validates both successful payloads and error
payloads.

Settings writes a complete preference snapshot through a serial save chain.
Root theme and locale Providers change only after Rust confirms the write.
Failed writes retain the last confirmed Provider values and display localized
feedback. A startup read failure uses safe defaults and preserves a localized
diagnostic state.

## Layered Model

```text
┌─────────────────────────────────────────────┐
│ React presentation                         │
│ screens, interaction state, view composition│
├─────────────────────────────────────────────┤
│ Application and domain services             │
│ launcher concepts, orchestration, contracts │
├─────────────────────────────────────────────┤
│ Typed desktop adapters                      │
│ serializable Tauri commands and events      │
├─────────────────────────────────────────────┤
│ Rust desktop runtime                        │
│ native integration, persistence, privilege  │
└─────────────────────────────────────────────┘
```

Extension runtimes connect through explicit Host contracts. They do not bypass
application services to access React state, Tauri internals, or privileged
native APIs.

## Responsibility Boundaries

### React Frontend

The frontend owns:

- presentation and view composition;
- transient interaction state;
- keyboard and focus behavior within the application surface;
- theme and locale presentation;
- calls through typed application and desktop adapters.

Business rules should remain independent of React components whenever they can
be expressed as testable domain functions or services.

### Rust Desktop Runtime

Rust owns:

- native window and operating-system integration;
- privileged operations and security-sensitive validation;
- persistence and filesystem boundaries;
- performance-sensitive background work;
- stable Tauri commands and events.

Rust must not leak internal implementation types across the Tauri boundary.

### Cross-Boundary Contracts

Frontend, Rust, and extension boundaries must use payloads that are:

- explicitly typed;
- serializable;
- validated at trust boundaries;
- versioned when external consumers depend on them;
- stable enough to test independently.

Use `snake_case` for serialized cross-language fields unless an accepted
contract specifies otherwise.

## Dependency Direction

- UI components may depend on application services, not directly on Rust
  internals.
- Application services may depend on abstract adapters and domain contracts.
- Tauri adapters translate between application contracts and native commands.
- Native services must not depend on frontend component structure.
- Extension contracts must not depend on private React modules.

Avoid parallel sources of truth for locale, theme, persisted preferences, or
registered capabilities.

## Cross-Cutting Requirements

- English is the default application locale; Simplified Chinese is also
  supported.
- Light and dark modes use the supported Semi Design theming mechanism.
- Keyboard access and visible focus are first-class requirements.
- Errors crossing boundaries must be diagnosable and safe to display or log.
- Planned behavior must pass through OpenSpec before becoming a stable
  capability contract.
