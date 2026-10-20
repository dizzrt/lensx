# Frontend Guidelines

## Scope

These rules apply to React components, frontend services, styles, user-visible
copy, and frontend tests.

## Component Selection

Use this order when implementing UI:

1. Reuse an existing project component.
2. Use a Semi Design component or documented composition pattern.
3. Compose a small project component from Semi Design primitives.
4. Create custom behavior only when the existing stack cannot satisfy the
   requirement.

Consult the repository Semi Design skill for non-trivial component selection,
API usage, theming, or accessibility behavior. Do not add another component
library or a narrowly focused UI dependency without an explicit design
justification.

Avoid wrapping every Semi Design component. Introduce a project wrapper only
when it owns stable product semantics, repeated configuration, or a meaningful
accessibility contract.

## Application Root Composition

Keep `src/index.tsx` limited to one-time global style imports, React root
creation, and `AppBootstrap`. The bootstrap must resolve persisted preferences
before composing `AppProviders` and `App`. Do not add parallel application-level
providers in pages or feature modules.

`AppProviders` owns the established root order:

1. `AppLocaleProvider` initializes application messages and owns locale state.
2. `AppThemeProvider` owns theme state and document theme synchronization.
3. Semi Design `LocaleProvider` receives the official locale pack mapped from
   the application locale.
4. `AppErrorBoundary` isolates render failures and keeps its fallback inside
   locale, theme, and Semi Design contexts.

Context values must use stable update callbacks and memoized value objects.
Tests may provide an initial locale or theme through the root providers, but
features must consume `useAppLocale` and `useAppTheme` instead of creating
another global source of truth.

Preference controls must send a complete, runtime-validated snapshot through
the typed desktop adapter. Serialize writes and update the root Providers only
after Rust confirms persistence. A failed write must retain the last confirmed
values and expose localized feedback.

## Styling

Use UnoCSS for simple, local styling:

- layout and display;
- spacing and sizing;
- flex and grid;
- common alignment;
- small responsive utilities.

Use Less for complex or reusable styling:

- semantic component styles;
- pseudo-elements and complex selectors;
- state combinations;
- animations and transitions;
- theme token bridges;
- reusable visual patterns;
- rules that would make utility markup difficult to understand.

Do not introduce a parallel styling system. Avoid hard-coded colors when a Semi
Design token or application semantic variable exists.

Import `@douyinfe/semi-ui/dist/css/semi.min.css` and
`src/styles/global.less` only from `src/index.tsx`. Keep root resets, semantic
token bridges, and cross-component base rules in `global.less`; keep simple App
Shell layout and spacing in UnoCSS utilities.

The shared `.launcher-surface` owns the `18px` outer radius, `overflow: hidden`
content clipping, and `var(--semi-color-bg-0)` theme background across Home,
Search, Host Pages, and plugin Pages. It adds no CSS shadow; the macOS desktop
window retains its existing native shadow. Keep this policy consistent in
`en-US`, `zh-CN`, and both themes, without changing window geometry, page
layout, dragging, keyboard navigation, focus restoration, plugin Page native
resize permissions, or inner component and overlay shadows. Browser previews
show the rounded surface without the macOS native shadow. Deterministic tests,
source review, and builds verify the implementation and existing contracts;
they do not establish the final macOS pixel appearance.

## Theme

- Support both light and dark modes.
- Use the supported Semi Design theme mechanism and tokens.
- Keep one application theme source of truth.
- Use `body[theme-mode="dark"]` for dark mode so body-mounted overlays inherit
  Semi Design dark tokens; light mode must remove the dark theme attribute.
- Synchronize the document `color-scheme` with the current application theme.
- Components must not create independent global theme state.
- Test custom surfaces, focus indicators, disabled states, overlays, and error
  states in both modes.
- Persist theme only through the accepted `AppPreferences` Rust/Tauri boundary.
- Do not optimistically update the root theme before persistence succeeds.

## Internationalization

- Support English and Simplified Chinese.
- English is the default locale and canonical message source.
- All user-visible product copy must come from the application
  internationalization layer.
- Store statically bundled application copy as locale JSON files under
  `src/app/i18n/messages/`; keep TypeScript limited to importing resources and
  exposing key types.
- Organize locale JSON as nested objects and use dot-separated leaf paths in
  application lookups. Keep the same object hierarchy and leaf paths in every
  locale.
- Update `messages.schema.json` whenever the canonical English key set changes.
  Its nested property hierarchy must mirror the locale resources. Every locale
  must pass schema validation and complete leaf-key comparison in frontend
  tests.
- Keep English and Simplified Chinese message keys aligned.
- Integrate Semi Design locale behavior with the same application locale source
  of truth.
- Map `en-US` and `zh-CN` to the official Semi Design `en_US` and `zh_CN`
  locale packs, and synchronize the HTML `lang` attribute.
- Do not use Semi Design built-in locale messages as a substitute for product
  copy.
- Do not concatenate translated fragments when a complete message can express
  the sentence.
- Allow layouts to accommodate different text lengths.
- Persist locale only through the accepted complete preference snapshot, then
  update application messages, Semi Design locale, and HTML `lang` together.

## React Structure

- Keep components focused on presentation and interaction orchestration.
- Extract reusable domain rules from components into testable functions or
  services.
- Prefer deriving render state instead of synchronizing duplicate state with
  effects.
- Keep event-driven work in event handlers when it is caused by a user action.
- Do not create components inside render functions.
- Avoid broad context providers that cause unrelated subtrees to rerender.
- Lazy-load large, optional surfaces at stable boundaries.
- Keep native calls behind typed adapters rather than invoking Tauri throughout
  the component tree.
- Keep `AppNavigationService` independent of React. Host executors may request
  a validated page through it, but must not receive React setters.
- Resolve Host and Plugin targets through the unified Host-owned Page Registry.
  Plugin provider replacement must remain complete-batch and atomic, and an
  active Plugin Page that disappears or becomes unavailable must close through
  the Host navigation invalidation transition rather than a plugin callback.
- Keep private Page routes, registration details, and provider bookkeeping out
  of `ActivePage` and presentation props. Render Plugin Pages only through the
  Host-owned isolated Runtime; never expose a Tauri bridge, Host DOM, another
  plugin origin, or private Host state to plugin presentation code.
- Derive typed `home`, `search`, `host_page`, and `plugin_page` surface targets
  from normalized query, flat `ActivePage`, and the current trusted Page
  resolution; do not introduce a router or parallel Shell store.
- Keep one shared top-row geometry: render the launcher input for `home` and
  `search`, the ID-derived page context bar for `page`, and the non-interactive
  avatar placeholder in every state. Do not restore a separate product title or
  description.
- Resolve page Owner and opening Action presentation before rendering the shared
  page-context view. Keep the view free of Owner-ID and Registry branches, and
  pass it only serializable Owner name/icon and Action name display data.
- Present page context as one content-sized segmented capsule in Owner, opening
  Action, and close-button order. Owner and Action segments remain
  non-interactive; only the adjacent Semi Design borderless close button may
  receive focus or exclude window dragging. Resolve Owner icons through their
  dedicated Host token namespace with a generic provider fallback, never through
  an opening Action icon such as the settings gear.
- Keep the full page-context slot transparent and draggable. Use UnoCSS only for
  its simple flex/min-width composition, and keep the capsule hierarchy,
  decorative diagonal divider, token-based fills, text truncation, and close
  button hover/active/focus states in semantic Less.
- Treat the complete horizontal band from the native window's top edge through
  the spacing below that shared top row as one delegated launcher drag region.
  Route only primary-mouse starts through the typed
  `LauncherWindowDragController`; its desktop adapter may expose only the
  current Tauri window's `startDragging()` operation, while browser and test
  compositions use inert or fake implementations.
- Do not cancel the search input's default mouse behavior when requesting a
  native drag. A stationary click must still focus the input and place the
  caret, while pointer movement prioritizes native window dragging over mouse
  text-range selection. Keyboard editing, keyboard selection, and IME
  composition must remain independent of the drag path.
- Mark every interactive control inside the delegated top region with the
  reusable `data-launcher-drag-exclude` attribute. The page close button and
  its icon descendants must be excluded before the native request; decorative
  avatar and page-context text remain non-actionable even though their surface
  can initiate a window drag.
- Keep the launcher as one continuous surface background. Idle inputs, page
  context, collection empty states, and Action tiles must not become persistent
  cards; reserve fill colors for transient hover, focus, selected, or pending
  states.
- Send those tagged targets through the typed launcher-surface adapter. Home,
  Search, and Host Pages remain fixed `650×320`, `650×480`, and `650×600`.
  A plugin target may carry only validated Manifest initial logical size,
  `resizable`, Page identity, and Page-attempt identity. Components and plugin
  messages must not use DOM content, collection length, result count, or
  arbitrary dimensions as native Window input.
- Grant `core:window:allow-start-dragging` only in the capability scoped to the
  `main` window. Do not grant position, resize, maximize, or other unrelated
  native window permissions for this interaction.
- For resizable plugin layouts, use `min-height: 0` through the flex chain and
  let one content region absorb viewport changes. Keep essential controls in a
  semantic bounded footer, keep diagnostics scrollable, and use
  `ResizeObserver` only to lay out the existing editor rather than recreate its
  model, Worker, or Runtime.
- Bind the Settings split-layout modifier only to the resolved
  `lensx.core/settings` Host Page identity. Make its body edge-to-edge, draw the
  token-based horizontal boundary below the shared header and vertical boundary
  after the approximately `152px` navigation, and restore content padding in the
  independently scrollable right pane. Preserve `min-height: 0` and
  `min-width: 0` through that chain so Plugin Management keeps its own nested
  list-detail split at the fixed `650×600` Host Page size. Do not apply this
  modifier to Home, Search, another Host Page, or a Plugin Page.

## Launcher Actions And Collections

- Use `title` as the primary display name and follow the shared
  [Action naming guide](../plugin-development/public-packages.md#action-display-names).
  Page and tool entries use destination names; operations retain meaningful
  verbs, such as `Hide launcher` / `隐藏启动器`.
- The Host settings entry is `Settings` / `设置`, and ConfigLens is `ConfigLens`
  in both locales. Keep these names in their application messages or plugin
  Manifest. Do not trim prefixes in rendering or synthesize legacy search
  aliases; retain existing functional keywords.
- Preserve stable Action IDs and execution targets when changing titles.
  Search, Recent, Pinned, accessible names, and the opening Action's page
  context resolve the current localized title through the existing metadata
  paths; title changes need no collection migration or alternate Dispatcher.
- Keep Action descriptors serializable and executor-free. Optional display
  icons use validated Host tokens and the shared Host resolver; never branch on
  `action_id` in a component to choose an icon.
- Resolve recent and pinned IDs against one current immutable registry snapshot,
  preserve persisted order, and filter missing or disabled Actions without
  filling gaps from registry order or mock data.
- Record recent use only after Dispatcher success. Keep Action outcomes separate
  from collection persistence feedback.
- Keep the typed set-pinned client and Rust contract while Launcher Home exposes
  existing Pinned Actions as a read-only ordered view. Each Recent or Pinned tile
  has one primary Action only; do not expose pin, unpin, menu, or replacement
  controls until a dedicated capability defines the future entry point.
- Keep the localized `All` text and avatar visual as non-interactive
  placeholders until dedicated capabilities are accepted.
- Present search as one four-column, at-most-eight-item listbox grid. Left/right
  move by one, up/down move by four only when the target exists, and all pointer
  and keyboard activation must share the Dispatcher path.

### Action Tile Presentation

Recent, Pinned, and Search use the shared `ActionTile` presentation. Let the
current grid column width determine each tile's square side through
`aspect-ratio: 1`; align grid content and items to the start so remaining row
height cannot stretch the interaction surface. The primary button fills that
surface, and its pointer, hover, focus, selected, and pending states keep the
same square boundary and `12px` corners. Keep the `28px` icon and fixed `20px`
title line box centered within the tile; title length and feedback must not
resize the tile or move neighboring Actions.

Each Home collection keeps eight equal columns and at most eight resolved
Actions in its confirmed order. Search keeps four equal columns and at most
eight results in two rows. Different grids may therefore have different square
side lengths. Home and Search retain their fixed `650×320` and `650×480`
native window targets, including empty, pending, and error states; do not derive
window dimensions from text or item count. Keep idle tiles transparent on the
continuous launcher surface and use existing theme tokens only for interaction
states. Simple grid composition stays in UnoCSS; square geometry, button
boundaries, and reusable state styling belong in semantic Less.

#### Single-Line Title Fitting

Fit the complete current localized title against the title box's available
inner width. The Host-private `fitActionTileTitle` helper measures at an
independent `14px` baseline and keeps `14px` when the title fits exactly or with
space to spare. Otherwise, it uses a width-proportional candidate and bounded
correction to select the largest fitting size in the continuous `12–14px`
range, within `0.1px` precision. Do not estimate by character count, poll fixed
integer sizes, or progressively shrink an already fitted title. Only a title
that still overflows at `12px` is marked truncated and needs a full-name
tooltip. Preserve the original title and complete accessible name.

`useActionTileTitleFit` owns DOM measurement and invalidation. Its full-text
measurement node is outside normal layout, hidden from assistive technology,
and non-focusable; it shares the visible title's font family, weight, and
letter spacing without participating in button naming. Semantic Less owns the
fixed line height and single-line CSS ellipsis, while the hook supplies the
computed font size. Do not enable Typography's JavaScript ellipsis alongside
this path, rely on `text-fit`, or add a font-fitting library.

Remeasure on title or locale changes, available-width changes through
`ResizeObserver`, initial font readiness, and later font loading completion or
failure. Coalesce repeated notifications into one animation frame and retain
state when the result is unchanged. Disconnect observers, remove font
listeners, cancel queued frames, and ignore old asynchronous callbacks after
replacement or unmount. Invalid, zero, or unavailable measurements fall back to
`14px` with single-line CSS overflow protection and the complete accessible
name, without asserting truncation or showing a misleading tooltip. A later
valid layout or font notification retries measurement and can restore `14px`.

#### Full-Name Tooltips

Each Home or Search surface owns one local `useActionTileTooltip` coordinator;
Home shares it across Recent and Pinned. Give each rendered instance a unique
identity, including separate identities when one Action appears in both Home
collections. Arbitrate candidates before checking truncation: the tile under
the pointer, including its readable tooltip, takes precedence over Home's
focused primary button or Search's selected result while its input is focused.
This includes Search's default first selection. Hovering a fully visible short
title therefore suppresses another keyboard candidate's tooltip; leaving the
tile and its overlay restores a still-valid keyboard candidate. At most one
truncated title has a visible tooltip.

Use a controlled Semi Tooltip mounted under `body`, with current theme tokens,
window-bounded width and height, long-word wrapping, and scrollable overflow for
extreme names. Keep it readable while the pointer moves from tile to overlay.
The content is only the complete resolved title; it adds no product copy,
operation, or Tab stop and never takes or restores focus. Associate it with
the instance's primary button or option without replacing the input's status
`aria-describedby` or `aria-activedescendant` relationship.

Home Escape dismisses the current tooltip until a pointer or focus trigger is
re-established; Enter and Space retain primary activation. Search's input
keyboard handler remains authoritative: IME takes priority, arrows update the
selection, Enter dispatches, and one ordinary Escape clears the query and
tooltip. Results remain active descendants rather than DOM focus targets.
Clear keyboard candidates on blur, release removed or unmounted instances, and
discard obsolete tooltip content when the query clears, the surface changes,
or remeasurement finds that the current title is no longer truncated. Keep
pending execution deduplication and the existing locale fallback unchanged.

### Launcher Composition Input

- Treat App Shell `query` as the committed complete input value. Enable Semi
  Input's `composition` support so its local draft remains visible and editable
  while committed results, selection, live status, and the surface target stay
  unchanged. An independent Registry update still follows the existing search
  rules.
- Use Semi's final `onChange` as the single query commit entry point. Read the
  complete input value rather than `compositionend.data`; deduplicate equal
  notifications before clearing feedback or resetting selection. Cancellation
  back to the prior value preserves the search; an empty final value returns
  home, and unmatched text uses existing localized feedback. Ordinary editing,
  paste, and deletion commit immediately.
- Check the synchronous composition session, native `isComposing`, and IME
  `keyCode === 229` before Escape, Enter, or result navigation. Preserve IME
  default processing even when a marked confirmation key arrives after
  composition end. The next independent ordinary key needs no timer or delay.
- Retire composition sessions on explicit clear, successful dispatch, page
  transitions, and unmount. Reconcile the visible draft with the reset query;
  reject composition-marked input from a retired session, late ends, and their
  equal trailing changes, and ignore events from a detached input. Treat native
  `isComposing` and composition `inputType` values, including
  `insertFromComposition`, as origin markers even before a late end. Fresh
  ordinary editing, paste, or a new composition can continue normally. Keep the
  same native input DOM across home/search and query resets.
- Semi UI/Foundation `2.101.1` retains its draft and composition flag when a
  controlled reset value is unchanged. The typed Semi Input class ref resets
  only these input-local facts through `foundation.setValue` and
  `compositionEnter`; `forwardRef` retains the existing DOM focus handle.
  Revalidate the real component event sequences when upgrading Semi. This
  bounded integration does not create another query store or focus effect.
- Cover Chinese commits, cancellation, reset races, keyboard priority, typed
  failures, combobox/listbox relationships, active descendant, and live status
  in both application locales and themes. Deterministic DOM and call-boundary
  tests do not establish native candidate-window behavior.

## Accessibility And Keyboard Behavior

- Use semantic HTML and accessible names.
- Preserve visible focus.
- Make primary workflows operable without a pointer.
- Define predictable focus movement for opening, closing, and switching
  launcher surfaces.
- Replace the search input with the non-editable owner/action page-context bar
  while a page is active; provide an accessible close icon and restore
  launcher-input focus on close.
- Keep the avatar and `All` placeholders out of button, link, menu, hover,
  pointer, and keyboard-focus semantics.
- Do not use color alone to communicate state.
- Announce asynchronous errors and important state changes appropriately.

### Plugin Management Surface

- Keep Plugins as one continuous list/detail surface. Use Semi Design for
  buttons, banners, tags, empty/loading states, radio choices, and modals; use
  semantic Less only for the shared split-pane, selection, scrolling, and
  focus treatment.
- Drive every rendered fact and operation from `PluginManagementService`.
  Components must not invoke Tauri, cache Registration state, or duplicate
  Manager ownership and lifecycle decisions.
- Keep shared plugin-service creation, initialization, and terminal disposal in
  the root composition owner. Pair one composition generation with one effect
  cleanup; leaf components and `App` must not dispose injected services. Cover
  the production owner with a root `StrictMode` setup-cleanup-setup test.
- Make list selection and every action keyboard reachable. Arrow up/down moves
  between adjacent entries. Closing replacement, uninstall, or clear-data
  confirmation restores the trigger; successful removal focuses the adjacent
  entry or the install button.
- Disable all conflicting operations while a mutation is pending. Require an
  explicit modal for replacement classification, uninstall data policy, and
  permanent clear-data. Uninstall defaults to retaining data and clear-data is
  disabled unless the selected registered plugin is disabled.
- Announce safe status and error summaries through live regions. Never render
  raw native errors, paths, payloads, stack traces, or diagnostic messages.

### Plugin Installation Trust

- Keep installation and replacement confirmation inside the continuous Plugins
  surface. State that installation trusts plugin code to use ordinary open-Web
  capabilities while the Host boundary remains closed.
- Present identity, version, source, Publisher-unverified status, and replacement
  classification as bounded facts. Do not present package digest, source, or
  Publisher metadata as Host authority or endorsement of remote behavior.
- Do not render permission checklists, grant/revoke controls, author-supplied
  permission reasons, or partial-grant states. Native capabilities are not part
  of the current public Host API.
- Keep all copy in the application i18n resources and test English and
  Simplified Chinese in light and dark themes. At fixed `650×600`, verify focus,
  disabled, modal, alert, legacy-recovery, and long-content states without
  relying on color.

## Testing

- Test user-observable behavior instead of component implementation details.
- Prefer accessible queries from Testing Library.
- Cover keyboard and focus behavior for keyboard-first workflows.
- Cover English and Simplified Chinese output when locale behavior changes.
- Cover light and dark mode integration when theme behavior changes.
- Cover App Shell render failures through `AppErrorBoundary`; event-handler and
  asynchronous failures must use explicit error states because React error
  boundaries do not capture them.
- Cover active-page render failures through the page-level boundary so the
  context header and close control remain usable.
- For Launcher top-region changes, cover drag classification, caret and input
  routing, keyboard selection, page close, hide-on-blur, shortcut restoration,
  and the fixed 320/480/600px modes through component, controller, and Rust
  policy tests.
- For segmented page-context changes, test English and Simplified Chinese,
  light and dark semantic tokens, close-button adjacency and keyboard focus,
  retained avatar state, and long-text ellipsis through DOM and state
  assertions.
- For shared Action tiles, cover continuous title fitting and invalid-size
  recovery with controlled width measurements, observer/font invalidation and
  cleanup, square style constraints, and full accessible names. Exercise real
  Semi tooltip interaction across Home collections and Search, including
  pointer precedence, duplicate instances, focus, Escape, IME, localization,
  themes, and pending execution. Deterministic DOM measurements establish the
  calculation and interaction contracts, not platform font layout or final
  pixel appearance; do not add browser, WebView, or screenshot validation.
- Add focused tests for extracted domain functions.
- Avoid snapshots that obscure meaningful behavioral assertions.
- For Plugin management changes, cover every maintained state in English and
  Simplified Chinese, light and dark. Assert split-surface semantics, selection,
  borders and overflow classes, long names and diagnostics, modal behavior,
  disabled state, and focus recovery.
