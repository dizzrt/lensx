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
  descriptors, a Host-owned registry, a dispatcher, and one built-in hide
  action routed through a typed Rust command;
- Rstest, Testing Library, TypeScript checks, Biome, and Cargo validation
  commands;
- OpenSpec configuration for capability and architecture changes.

Product capabilities beyond this foundation must not be described as
implemented until their source code and tests exist.

## Frontend Application Foundation

`src/index.tsx` is the only frontend composition entry. It imports the Semi
Design global stylesheet and the project `global.less` entry once, then renders
the product App Shell inside `AppProviders`.

`AppProviders` is the single application-level provider composition:

```text
AppLocaleProvider
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
sets. Locale selection is currently in-memory only and does not follow an
operating-system preference.

The application theme is limited to `light` and `dark` and defaults to
`light`. The theme provider uses `body[theme-mode="dark"]` so Semi Design
content mounted under `body`, including overlays, receives the same token set.
It also synchronizes the document `color-scheme`. Theme selection is currently
in-memory only and does not follow an operating-system preference.

`AppErrorBoundary` isolates render failures below the provider root. Its
localized Semi Design fallback preserves the current theme and offers a window
reload action without displaying exception details. Event-handler and
asynchronous errors require explicit error states and are outside this render
boundary.

The current App Shell exposes the lensX identity, product description, and a
local controlled launcher input. The input accepts text but does not produce
results or actions. It is an observable launcher surface, not evidence that
search, execution, settings, or plugin workflows are implemented.

## Launcher Window Lifecycle

The Tauri webview window with the stable `main` label is configured as a
compact launcher surface. It has a fixed width of 650px, an initial and minimum
height of 180px, and a maximum height of 800px. The window is transparent,
always on top, undecorated, non-resizable, and non-fullscreen. The application
does not currently resize the native window in response to DOM content or the
input value.

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
input focus.

This lifecycle does not itself implement query matching, result lists,
settings, shortcut customization, persistence, or plugin runtime behavior.

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

The default service currently registers only
`lensx.core.hide_launcher`. Its title and description come from the canonical
application message resources. The executor calls a typed desktop adapter,
which invokes the narrow `hide_launcher` Tauri command. Rust maps that command
to the existing managed `LauncherWindowActions` boundary and
`LauncherWindowAction::Hide`; it does not duplicate native window logic or
accept an arbitrary action identifier.

The current React App Shell does not create or consume the default action
service, read the registry snapshot, match the launcher query, or render action
results. Search, ranking, selection, history, settings, dynamic availability,
provider lifecycle, and plugin action projection remain future capabilities.

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
