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
- Derive `home`, `search`, and `page` presentation from normalized query and
  flat `ActivePage` state; do not introduce a router or parallel Shell store for
  the current single-page depth.
- Keep one shared top-row geometry: render the launcher input for `home` and
  `search`, the ID-derived page context bar for `page`, and the non-interactive
  avatar placeholder in every state. Do not restore a separate product title or
  description.
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
- Send those presentation states through the typed launcher-surface adapter so
  Rust selects the fixed 320px, 480px, or 600px height. Components must not
  measure DOM content, collection length, or result count to submit arbitrary
  native dimensions.
- Grant `core:window:allow-start-dragging` only in the capability scoped to the
  `main` window. Do not grant position, resize, maximize, or other unrelated
  native window permissions for this interaction.

## Launcher Actions And Collections

- Keep Action descriptors serializable and executor-free. Optional display
  icons use validated Host tokens and the shared Host resolver; never branch on
  `action_id` in a component to choose an icon.
- Resolve recent and pinned IDs against one current immutable registry snapshot,
  preserve persisted order, and filter missing or disabled Actions without
  filling gaps from registry order or mock data.
- Record recent use only after Dispatcher success. Keep Action outcomes separate
  from collection persistence feedback.
- Optimistic pin/unpin UI must restore the last Rust-confirmed snapshot on
  failure. Never evict an existing pin to make room for a ninth item.
- Keep the localized `All` text and avatar visual as non-interactive
  placeholders until dedicated capabilities are accepted.
- Present search as one four-column, at-most-eight-item listbox grid. Left/right
  move by one, up/down move by four only when the target exists, and all pointer
  and keyboard activation must share the Dispatcher path.

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
- Complete native macOS acceptance at the fixed 650px viewport for launcher
  top-region changes. Drag the real window from top blank space, the search
  input, non-interactive page context, and the avatar in `home`, `search`, and
  `page`; then regress caret placement, English and Chinese IME input, keyboard
  selection, page close, hide-on-blur, shortcut restore, and fixed
  320/480/600px heights. Save screenshots and inspect computed styles for the
  continuous surface, rounded corners, transparent background, avatar, and top
  spacing.
- Add focused tests for extracted domain functions.
- Avoid snapshots that obscure meaningful behavioral assertions.
