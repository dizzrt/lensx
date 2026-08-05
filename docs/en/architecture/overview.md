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
  localized matching and an accessible four-column keyboard-first result grid;
- a Host-private Plugin surface projection coordinator with provider-scoped
  atomic Page and Action replacement, revision-aware eligibility, and
  fail-closed lifecycle handling;
- a Rust-owned scoped Plugin Resource Service that serves only the current
  managed payload from a per-generation isolated browser authority through
  strict host/path binding, package-relative paths, fixed MIME and no-store
  responses, and generation-bound revocation;
- a macOS-only frame-aware WKWebView navigation policy with disjoint Host and
  descendant document allowlists, an idle process-local target lease, main-only
  Tauri initialization, and independent new-window/download denial;
- one current isolated Plugin Page iframe plus a Host-private process-local
  Runtime Session that authenticates the actual window and exact origin with a
  single-use nonce and dedicated MessagePort;
- a unified Host-owned Page Registry and framework-neutral navigation service
  for protected Host Pages and declarative Plugin Page descriptors;
- versioned recent-use and pinned Action collections persisted through a narrow
  Rust/Tauri boundary and resolved against the current registry snapshot;
- a single-window Host settings surface with persisted theme and locale
  preferences plus a deliberately empty plugin section;
- the public `@lensx/plugin-contract@0.1.0` workspace package with bounded
  Schema, type, validation, and normalization exports verified from a real
  package tarball;
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
normalized query state. All three share one top row and a non-interactive avatar
placeholder. `home` keeps the launcher input and renders Recent followed by
Pinned from accepted Action collections; it never fills either row from
registry order or simulated data. The localized `All` text beside Pinned is a
non-interactive placeholder. `search` keeps the same input and exposes at most
eight real enabled Action results in one four-column grid. `page` replaces the
input with a localized owner/action context bar and accessible close icon while
retaining the avatar placeholder. Closing a page returns to `home` and restores
input focus. A page-level error boundary retains that context bar and close
control when page content fails.

## Launcher Window Lifecycle

The Tauri webview window with the stable `main` label is configured as a
compact launcher surface. It has a fixed width of 650px, an initial height of
320px, a minimum height of 180px, and a maximum height of 800px. The window is
transparent, always on top, undecorated, non-resizable, and non-fullscreen.

The Host maps App Shell presentation state to fixed logical heights through a
typed Rust command: `home` uses 320px, `search` uses 480px, and `page` uses
600px. This keeps the shared content region visible without measuring DOM
content or changing height based on collection or search-result counts. The
frontend cannot submit arbitrary dimensions.

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

On macOS, the undecorated launcher cannot rely on the default Close Window
menu command: its native `performClose:` selector expects a closable window
style and therefore does not produce `CloseRequested` for this borderless
surface. Once the recovery shortcut and native window listeners are ready, the
Host replaces the default application menu with an application-owned menu that
preserves the standard application, edit, view, window, help, and `Cmd+Q` quit
semantics while removing every predefined Close Window accelerator. Exactly
one custom Close Window item owns the application-local `Cmd+W` accelerator
and routes its stable menu ID through the same Rust `Hide` action boundary used
by native close requests and focus loss. It is not a global shortcut and does
not affect `Cmd+W` in other applications. If the recovery shortcut or window
listener is unavailable, the custom menu is not installed. If menu installation
itself fails, the Host records the `hide` action and `install_menu` operation
stage without terminating the process; the already registered recovery
shortcut and native lifecycle listeners remain available.

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
localized default keywords, a static enabled state, and an optional validated
`{ kind: "host", token }` display icon. Host icon tokens remain plain
serializable data and resolve only through the Host icon resolver; an absent or
unresolved token uses the stable generic Action icon. English metadata is
canonical, Simplified Chinese is supported, and missing localized text falls
back to English.

`LauncherActionRegistry` is the only running source of truth for registered
launcher actions. Registration validates and normalizes unknown descriptor
input before committing it, rejects duplicate IDs, and applies batches
atomically. A trusted provider may also replace or unregister its complete
owner-scoped batch in one transition; invalid, duplicate, or cross-owner input
preserves the complete prior state and cannot touch another provider's
executor. Public lookups and snapshots return deeply isolated descriptor data,
never executors or provider bookkeeping. Snapshots are ordered by `action_id`
so their default order does not depend on provider load order.

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

The Host-private Plugin surface projection coordinator consumes complete snapshots
and same-revision details from the Plugin Registration Desktop Adapter. Only
enabled, registered, non-quarantined plugins compatible with both lensX and the
Host API are eligible. It maps each Manifest Page to the stable
`(owner_id = plugin_id, page_id = local Page ID)` identity and each Manifest
Action to owner `plugin_id` and
global ID `<plugin_id>.<local_action_id>`, preserves normalized Action-local
metadata, and creates a Host-owned Page opener executor. Manifest asset icons,
Action targets, publisher/source claims, and
`default_action_id` ranking do not enter descriptors. Package-local icons are
omitted so the existing generic Action icon is used.

Projection converges serially by Registration revision. Stale detail results
are discarded; disabled, incompatible, quarantined, degraded, disappeared, or
unverifiable providers are unregistered fail closed. One provider's failure is
contained to that owner and produces only bounded diagnostics. For a current
eligible revision, production commits the complete Page batch before publishing
Actions whose targets are currently available; removal performs Action
unregistration before Page unregistration. A Page is available only when all
of its required permission IDs are present in the current Host-owned grant
snapshot. This is a mechanical subset check, not a permission catalog, grant
decision, prompt, or Runtime session authorization.

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
display text, optional safe icon metadata, and score. Icons and Action
collections never affect matching, scoring, or sorting, and results never
contain executors or registry internals.

The App Shell treats those results as a combobox/listbox interaction with four
fixed visual columns and at most two rows. The first result is selected by
default. Left and right move to adjacent results; up and down move by four when
the target exists. Movement never wraps, Escape clears the search, and pending
dispatch prevents duplicate execution.
Success clears the query; typed dispatcher failures preserve the query and
selection while showing localized safe feedback. Result count, empty, pending,
success, and failure states are announced through a live region without
creating a second visible result section. The result grid remains bounded
inside the existing surface and does not resize the native window.

## Launcher Action Collections

Rust owns a versioned `LauncherActionCollections` snapshot in a dedicated
application-config file. `recent_action_ids` is a newest-first MRU list and
`pinned_action_ids` preserves pin order. Both contain unique validated Action
IDs and are capped at eight. Missing files return empty collections; strict
reads reject malformed versions, fields, IDs, duplicates, and over-limit data.
Writes use a synchronized temporary file followed by atomic replacement and
return stable safe errors without paths or file contents.

The TypeScript client exposes only read, record-successful-use, and set-pinned
operations. React resolves stored IDs against the current immutable registry
snapshot, preserves stored order, and hides missing or disabled Actions without
deleting or replacing those IDs. A successful dispatch records recent use;
failed dispatches do not. Recent-use persistence failure does not rewrite a
successful Action result. Pin and unpin use an optimistic view but restore the
last confirmed snapshot after failure, and a ninth pin is rejected without
dropping an existing one.

Complete plugin management, safe plugin icon resolution, and complete
permission decisions remain future capabilities. Scoped resources, lifecycle
writes, the isolated iframe Runtime, and its private Session are delivered
separately and do not change Action collection semantics.
Production Plugin Actions now appear only while their projected target Page is
available. Persisted plugin Action IDs can disappear and reappear naturally
without being removed from recent or pinned storage.

## Host Pages And Preferences

Host and Plugin Pages share a unified Host-owned Page Registry and the flat
`owner_id`, `page_id`, and `opened_by_action_id` `ActivePage` identity. The
Registry protects `lensx.core`, replaces one plugin provider's complete Page
batch atomically, and returns isolated deterministic snapshots. Private routes,
required permission IDs, provider bookkeeping, installation facts, and Runtime
entries never enter `ActivePage` or presentation props.

`AppNavigationService` preflights the current descriptor and availability
before sending `ActivePage` to the single App Shell handler. Registry changes
that remove or make the active Plugin Page unavailable cause a Host-owned close
transition back to `home`; metadata changes that retain the same available
identity do not close the Page. Plugins receive no React setter, navigation
handler, Registry mutation API, renderer, or Tauri object.

The page context resolver derives the current localized owner, Page title, and
opening Action name from the Page resolution and Launcher Registry snapshot.
Missing `zh-CN` owner text falls back to `en-US`, and a missing opening Action
falls back to the current Page title. Host Pages use the protected Host icon
token; Plugin Pages use the generic provider icon until scoped resource
resolution ships. Display strings are not copied into `ActivePage`, so locale
and metadata changes resolve from current facts.

The App Shell still uses one `home` / `search` / `page` presentation state in
the existing main window. `lensx.core/settings` renders the trusted Settings
surface. An available Plugin Page renders one Host-owned isolated iframe inside
the existing page error boundary. The Host-private resolver cross-checks the
current Page, Registration revision, Resource identity, isolated `entry_url`,
and Registry route, then activates the exact native navigation lease before
mounting. The iframe fixes `allow-scripts allow-same-origin`, `no-referrer`, and
a deny-by-default Permissions Policy; close, retry, invalidation, replacement,
and App teardown remove it. Its load event means only `loaded`, not SDK/Session
`ready`. After load, the Host-private Session binds current entry, plugin,
version, Page, resource generation, Runtime attempt, and actual grants to the
real `contentWindow`; only an exact acknowledgement on the newly transferred
Port produces Session `ready`. SDK `ready`, Host API transport, complete CSP,
the Host-private Dispatcher, scoped storage, and the Task 5.5 permission-backed
text clipboard are delivered. Complete CSP and permission prompts/settings/history
remain unimplemented.

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
- scoped plugin resource authorization, safe file opening, and protocol
  responses;
- macOS WKWebView frame classification and pre-commit document navigation,
  new-window, and download enforcement;
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

The Host-private Resource Contract follows this boundary: trusted TypeScript
submits only an entry ID and observed Registration revision, Rust derives the
current plugin identity/version/entry and opaque URL, and every custom-protocol
request revalidates its process-local scope against the current Manager
generation and Installer-owned payload. Neither React presentation props nor
public plugin packages receive installation paths, digests, record keys, or a
general file reader. The macOS iframe Runtime consumes this resource-read
foundation through Host-private adapters. Its shipped process-local Session
authenticates a dedicated Port and compares relevant current facts without
treating unrelated Registration revision changes as identity changes. Session
state is not persisted and does not change Registration's `inactive` read
model; public SDK transport, Host API, and complete CSP remain separate work.

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
