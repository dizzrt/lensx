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
  cross-language title and keyword matching and an accessible four-column
  keyboard-first result grid;
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
- one current native plugin Child WebView plus a Host-private process-local
  Runtime Session authenticated through source-bound native bridge ingress;
- a unified Host-owned Page Registry and framework-neutral navigation service
  for protected Host Pages and declarative Plugin Page descriptors;
- versioned recent-use and pinned Action collections persisted through a narrow
  Rust/Tauri boundary and resolved against the current registry snapshot;
- a single-window Host settings surface with persisted theme and locale
  preferences, local plugin management, and configurable shortcuts;
- the public `@lensx/plugin-contract@0.4.0` workspace package with bounded
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

The App Shell derives `home`, `search`, `host_page`, or identity-bound
`plugin_page` surface targets from local `activePage`, the resolved provider,
and normalized query state. All targets share one top row and a non-interactive avatar
placeholder. `home` keeps the launcher input and renders Recent followed by
Pinned from accepted Action collections; it never fills either row from
registry order or simulated data. Existing Pinned Actions are currently a
read-only view: each tile exposes only its primary Action, while pin, unpin,
menu, and replacement management entry points remain deferred. The localized
`All` text beside Pinned is a non-interactive placeholder. `search` keeps the
same input and exposes at most
eight real enabled Action results in one four-column grid. `page` replaces the
input with a localized owner/action context bar and accessible close icon while
retaining the avatar placeholder. Closing a page returns to `home` and restores
input focus. A page-level error boundary retains that context bar and close
control when page content fails.

Recent, Pinned, and Search share the Host-private `ActionTile` presentation:
column width determines its square interaction boundary, with a fixed icon and
single title line. A pure title-fitting helper and a DOM measurement hook select
a continuous `12–14px` font size from the complete localized title and available
width. CSS owns final single-line overflow; hidden full-text measurement is
invalidated by title, locale, width, and font changes and safely falls back when
dimensions are unavailable. These measurements only control frontend
presentation and never become native window dimensions.

Home owns one local full-name-tooltip coordinator across both collections;
Search owns another whose keyboard candidate follows the selected result while
the existing input retains focus. Pointer candidates take precedence, and only
actually truncated titles show a controlled body-mounted Semi Tooltip. Instance
identity, measurement, and tooltip state remain temporary React presentation
facts; they add no Registry, Dispatcher, Rust/Tauri, or persistence contract.
The input's active descendant, status association, IME priority, and execution
path remain authoritative. See the
[Action tile guidance](../development/frontend-guidelines.md#action-tile-presentation)
for fitting, focus, lifecycle, and deterministic-test boundaries.

## Launcher Window Lifecycle

On macOS, the packaged bundle declares `LSUIElement=true`, and Rust confirms
`ActivationPolicy::Accessory` before the frame-aware setup creates the first
Host Window. The running Launcher therefore has no Dock tile or ordinary
application menu bar while retaining programmatic activation. Policy
establishment is a startup prerequisite: a setter or confirmation failure
terminates setup before Launcher lifecycle listeners, the global shortcut, or
Plugin services are declared ready; it never falls back to the Regular or
Prohibited policy. Non-macOS startup remains unchanged.

The Tauri Window with stable label `main` starts at `650×320` logical pixels,
is transparent, always on top, undecorated, non-resizable, and non-fullscreen,
and has a `320×180..4096×4096` hard envelope. Home, Search, and Host Pages are
fixed and non-resizable at `650×320`, `650×480`, and `650×600` respectively.
On macOS the Window also uses `visibleOnAllWorkspaces`; after native creation,
Rust preserves its complete AppKit collection behavior and merges
`FullScreenAuxiliary`. The resulting complete parent Window can join the
current Space and coexist above another application's full-screen Window.
These setters remain Host-private and are not available to React, Plugin
Runtime messages, public Host APIs, or DOM measurements.

Manifest `0.4.0` gives every normalized plugin Page a bounded `presentation`.
An omitted author value becomes fixed `650×600`; an explicit value supplies an
initial logical size and may opt the user into native edge/corner resizing.
React sends a strict tagged target with Page and Page-attempt identity. Rust
revalidates it against current Registration, fits the initial size and
constraints to the current monitor work area, and applies resize guard,
constraints, size, and final resizability through one rollback-capable
coordinator. No plugin message, DOM measurement, result count, or Runtime API
can choose native Window presentation.

Surface configuration reads actual native resizability before submitting the
ordered guard, constraints, size, and final-state operations. Fixed-to-fixed
transitions do not submit a resizable setter. Within one operation, successful
submissions update the plan rather than relying on an immediate native re-read;
the next guard also accounts for a previously submitted enable still in flight.
Rollback re-reads the actual state and reasserts the complete previous target,
including final resizability, because delivery can precede native execution or
fail after partial application. Failed rollback invalidates the success cache
so a repeated target can repair configuration. Uncertain resizability survives
that invalidation and forces the next repair guard even if emergency delivery
also failed. Typed safe errors identify the
read, delivery, constraint, size, or rollback stage; a setter return does not
confirm AppKit responder restoration.

The same-version vendored `tao 0.35.3` macOS resizable adapter records internal
state and, on the main thread, skips unchanged style masks. Necessary style
edits retain the actual responder and restore it only if it changed and still
belongs to that Window. It never redirects this setter to the initial Tao
view, activates the Window, or restores a removed Child. Missing or invalid
responders remain untouched; refused restoration emits only bounded developer
diagnostics. Native fullscreen continues to defer style changes and retains
the stored resizable state for exit. Explicit show/page-close focus and genuine
blur hiding remain owned by the existing lifecycle. The patch changes no
public command, plugin authority, other platform, or unrelated Tao setter.
Deterministic policy/fake tests and real adapter compilation establish these
state and call boundaries; real IME candidate-window behavior remains
unverified. Vendored versions, patch paths, and hashes are checked through the
read-only dependency drift Gate and updated only after review through its
explicit Generate target.

Rust owns all native launcher window operations through one action boundary:

- `show` activates the macOS accessory application, restores the window, shows
  it, requests focus, emits a typed activation event, and then restores the
  same current Plugin Child WebView presentation;
- `hide` hides the window without terminating the application process;
- `toggle` reads the current visibility and reuses the corresponding `show` or
  `hide` path.

The action boundary resolves the `main` window through a Tauri adapter and
reports failures with both the requested action and the failing native
operation stage. Native shortcut and window-event handlers route actions
through this boundary rather than calling window APIs independently.

The official Tauri global-shortcut plugin registers the confirmed configuration.
The single Launcher trigger defaults to `Ctrl+Shift+Space` and may instead be a
modifier double tap. The separate Rust shortcut service owns it and Action
bindings; changing the Launcher type stops its previous entry.
One physical press produces at most one invocation. Ordinary activation uses
Toggle; an Action binding uses Show and the current shared Action dispatcher.
Registration generations isolate stale events. Close, blur, and local close
commands may hide only while the selected Launcher trigger is confirmed active.
A recovery failure keeps the window visible with settings and quit available.

On macOS, the undecorated launcher cannot rely on the default Close Window
menu command: its native `performClose:` selector expects a closable window
style and therefore does not produce `CloseRequested` for this borderless
surface. Once the shortcut service and native window listeners initialize, the
Host replaces the default application menu with an application-owned menu that
preserves the standard application, edit, view, window, help, and `Cmd+Q` quit
semantics while removing every predefined Close Window accelerator. Exactly
one custom Close Window item owns the application-local `Cmd+W` accelerator
and routes its stable menu ID through the same Rust `Hide` action boundary used
by native close requests and focus loss. It is not a global shortcut and does
not affect `Cmd+W` in other applications. If shortcut-service or window-listener initialization fails, the custom menu is
not installed. Later recovery availability is checked at the Hide boundary,
while Quit remains independent. If menu installation
itself fails, the Host records the `hide` action and `install_menu` operation
stage without terminating the process; the already registered recovery
shortcut and native lifecycle listeners remain available.

Accessory mode keeps the application menu command graph without a visible menu
bar. Exactly one custom
application-local `Cmd+W` command reuses the unified Hide action, and exactly
one custom application-local `Cmd+Q` command requests the existing application
exit path, whose `RunEvent::Exit` teardown terminates the current Child WebView
and Host resources. Both routes verify that lensX is foreground and are absent
from the global-shortcut plugin. Because the target Accessory runtime does not
reliably dispatch the hidden menu key equivalents, Host setup installs one
idempotent AppKit local event monitor for foreground `Cmd+W/Q`; it
consumes only those matching events before the menu route can duplicate them and is
released during application exit. When the selected Launcher trigger is not active,
all hide-on-close/focus-loss and local Hide paths are disabled while Quit remains
available, so an Accessory process cannot become unreachable.

Standard editing uses the shared native responder path. With Tauri `unstable`,
the Host `main` WebView and plugin WebViews are both created as `WindowChild`.
Wry checks current native focus and delegates the original event; its synchronous
BOOL is not final Web handling. When a visible native descendant owns focus in
the same visible key window, the Tao parent forwards the original command
selector to its NSView superclass. WebKit can then identify unhandled commands
and reenter its normal event route, allowing the existing menu to perform its
standard editing action once. The adapter adds no menu call, pending queue,
delayed target, editing-key table, plugin exception, or clipboard permission.
Tao's own raw-input focus and the reserved W/Q monitor keep their existing roles.
See [Native Editing Shortcuts](plugin-child-webview-runtime.md#native-editing-shortcuts)
for Web cancellation, external-plugin compatibility, and evidence boundaries.

Restoring from an ordinary Space and restoring above another application's
full-screen Space use the same action path. A failure to establish or confirm
Accessory policy, complete native Window identity, collection behavior, or
application activation is reported as a safe setup/action operation and stops
the corresponding transition before a success event or independent Child
restore. The Launcher retains its last position and display; moving it to the
pointer's display or automatically recentering across multiple displays is not
part of this lifecycle.

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
settings, shortcut configuration storage, or plugin business behavior. The
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
locale-independent `toLowerCase()`, trimming, and collapsed Unicode whitespace.
Search reads every explicitly declared title and default keyword in the
supported `en-US` and `zh-CN` maps, independently of the interface language.
Each text remains a separate field; missing text or an empty keyword list in
one language does not hide another language's text. Every query token must
match at least one title or keyword of the same Action, and different tokens
may match different languages or fields. Descriptions are display-only and
never contribute a match or score.

Fixed exact, prefix, and substring weights contribute only the best match per
query token. The complete-query title bonus also contributes only its best
match once. Normalized duplicate translations or hits in multiple fields do
not add extra points, and each Action appears once. Results sort by descending
score and then ascending `action_id`; disabled Actions are filtered before
truncation to the v0 limit of eight. For the same query and snapshot, switching
the interface language preserves Action IDs, scores, and order. The current
language only resolves display titles, optional descriptions, and feedback,
with missing localized Action text falling back to English.

Search results are frozen serializable data containing identity, resolved
display text, optional safe icon metadata, and score. Icons and Action
collections never affect matching, scoring, or sorting, and results never
contain executors or registry internals.

The App Shell treats those results as a combobox/listbox interaction with four
fixed visual columns and at most two rows. The first result is selected by
default. Left and right move to adjacent results; up and down move by four when
the target exists. Composition drafts preserve committed results and selection;
composition, native composing keys, and IME 229 markers take priority over
Escape, Enter, and arrows. Outside IME handling, movement never wraps, Escape
clears the search, and pending
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
successful Action result. The set-pinned typed client and Rust persistence
contract remain available, but Launcher Home currently presents confirmed
Pinned Actions as read-only data and exposes no pin, unpin, or menu control.
Existing IDs are neither migrated nor reordered; a future management entry
point requires a separate accepted change.

Plugin management and explicit permission decisions are delivered through the
trusted Settings surface. Safe plugin icon resolution remains a separate
capability. Scoped resources, lifecycle writes, the isolated Child WebView Runtime,
and its private Session are delivered separately and do not change Action
collection semantics.
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

`lensx.core/settings` renders the trusted Host Page surface. An available
Plugin Page renders one Host-owned slot while Rust creates the current native
Child WebView sibling. The Host-private resolver cross-checks Page,
Registration revision, Resource identity, isolated `entry_url`, route,
generation, native source, and attempt. The closed bridge and Session become
ready only for that current Child WebView. Close, retry, invalidation,
replacement, and App teardown revoke it. Manifest `0.4.0` and Host API `0.4.0`
expose neither native Window methods nor Child WebView identity.

Settings is rendered in the existing `main` Tauri window. A controlled vertical
navigation on the left contains Preferences, Plugins, and Shortcuts, defaults to
Preferences, and the right content pane renders only the selected section. The
resolved `lensx.core/settings` identity enables an edge-to-edge App Shell
modifier: a token-based horizontal boundary separates the shared header from
the body, a vertical boundary separates navigation from content, and the right
pane owns scrolling within the fixed `650×600` Host Page presentation.
Preferences controls the supported `light`/`dark` theme and `en-US`/`zh-CN`
locale. Plugins retains its nested list-detail management surface for
installation, replacement, lifecycle, uninstall, and disabled-only data
clearing through one typed Host-private service. External authors should use the
[Plugin Development hub](../plugin-development/index.md), not this maintainer
overview, for tutorials and public references.

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
general file reader. The macOS Child WebView Runtime consumes this resource-read
foundation through Host-private adapters. Its shipped process-local Session
authenticates a source-bound bridge and compares relevant current facts without
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

## Configurable Shortcuts

Rust owns v2 `shortcuts.json` independently of `AppPreferences` and
collections. Its `launcher` is one chord/double-tap trigger, not a pair of
simultaneously configured entries. Reads return confirmed configuration, revision, per-binding runtime
status, and bounded diagnostics. Writes compare the expected revision, validate
one shared canonical/reserved policy, stage the file, pre-register new chords,
release removed registrations, commit storage, then publish the mapping.
Failure compensates and reconciles actual storage and registrations; uncertain
recovery becomes degraded and disables unrecoverable hiding. An uncertain storage
result stays degraded across automatic target/layout reconciliation until an
explicit save transaction confirms storage again. Invalid startup
files are preserved and never executed; only that invalid/missing case attempts
the default recovery chord. A valid custom recovery failure never repurposes a
default chord assigned to an Action.

Unavailable Actions retain their configuration and internal trigger ownership
while releasing native registrations. Reappearance revalidates current targets
and OS registration. A saved double tap without authorization remains inactive. If this is the
sole Launcher entry, the Host shows even an already-hidden window and disables
unrecoverable hiding until the selected entry is active; it never silently
registers a former/default chord. Healthy monitoring is preserved across gesture
resets so ordinary hiding does not itself interrupt the recovery entry.
Stored chord identities use native physical key codes. The Host supplies current
layout labels, including Command-specific layout semantics; recording checks both
the current semantic key and physical reserved aliases. Layout changes refresh
labels and registration eligibility without rewriting configuration.
The shared policy rejects reserved editing/system combinations and duplicates;
registration errors cannot identify all other applications' shortcuts. Passive
double taps have no exclusive OS reservation.

The macOS listen-only adapter exposes event facts to a pure monotonic state
machine, without storing characters or modifying input. A double tap uses the
same physical modifier, at most 200 ms per press, at most 300 ms between presses,
and 300 ms quiet confirmation. Third presses, other keys/modifiers, mouse buttons
and scrolling cancel; pointer movement does not. Permission loss, Secure Input,
sleep/wake, configuration and recording transitions discard old candidates.
Monitoring permission is requested only by an explicit user action. Resuming
observation samples currently held physical keys/buttons; source event timestamps
and quiet confirmation share a monotonic clock, and queued input drains before
confirmation. Unsupported modifiers interrupt without becoming gestures.

Recording holds a native lease for at most 30 seconds, renewed by visible active
settings. Existing registrations remain but target execution is suspended;
native events can supply candidates even when the WebView does not receive a
registered chord. Blur, hide, Host loss, expiry, cancellation and exit revoke the
lease and wait for releases before accepting new input. Bare Escape cancels;
modified Escape remains a candidate; foreground Cmd+W/Q retain native semantics.

Host invocations carry immutable per-call normal/shortcut provenance. Only a
claimed current native binding creates shortcut provenance; UI and plugin
`actions.open` use normal. Admission is bounded to 32 waiting calls with a
10-second deadline and explicit failures. Outcomes of accepted invocations are
retained within the admission bound until the Host can receive them; unavailable
feedback never silently frees capacity for unlimited accepted calls. ActivePage keeps only owner, Page and
opening Action identity. Same-page invocations reuse the Runtime and input;
activation travels independently to the current attempt. A successful dispatch
updates Recent once, independent of optional plugin callback business success.

### Shortcut Configuration Migration And Rows

The Host reads a valid v1 chord-only file into an equivalent v2 view without
rewriting it; the next successful explicit save commits v2. A valid v1 file with
both Launcher entries retains its original bytes and exposes both choices in
`launcher_migration`. Its v2 chord placeholder is inactive. The window stays
visible while the user chooses one type and saves with explicit migration
resolution. Other writes are rejected until that choice is resolved. An
uncertain commit is reread before clearing migration or claiming persistence.

Settings uses one Launcher row (title, type, key) and Action rows (type, key,
Action, delete), with Add beneath the list. Drafts and inline edits remain local
until complete explicit save. Action reassignment removes and adds IDs in one
candidate without overwriting existing bindings. Native revision/transaction
checks remain authoritative; successful deletion restores focus within the list.
