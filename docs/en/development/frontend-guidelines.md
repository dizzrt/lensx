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

## Theme

- Support both light and dark modes.
- Use the supported Semi Design theme mechanism and tokens.
- Keep one application theme source of truth.
- Components must not create independent global theme state.
- Test custom surfaces, focus indicators, disabled states, overlays, and error
  states in both modes.
- Persisted theme behavior requires a stable application boundary and an
  accepted specification.

## Internationalization

- Support English and Simplified Chinese.
- English is the default locale and canonical message source.
- All user-visible product copy must come from the application
  internationalization layer.
- Keep English and Simplified Chinese message keys aligned.
- Integrate Semi Design locale behavior with the same application locale source
  of truth.
- Do not use Semi Design built-in locale messages as a substitute for product
  copy.
- Do not concatenate translated fragments when a complete message can express
  the sentence.
- Allow layouts to accommodate different text lengths.

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

## Accessibility And Keyboard Behavior

- Use semantic HTML and accessible names.
- Preserve visible focus.
- Make primary workflows operable without a pointer.
- Define predictable focus movement for opening, closing, and switching
  launcher surfaces.
- Do not use color alone to communicate state.
- Announce asynchronous errors and important state changes appropriately.

## Testing

- Test user-observable behavior instead of component implementation details.
- Prefer accessible queries from Testing Library.
- Cover keyboard and focus behavior for keyboard-first workflows.
- Cover English and Simplified Chinese output when locale behavior changes.
- Cover light and dark mode integration when theme behavior changes.
- Add focused tests for extracted domain functions.
- Avoid snapshots that obscure meaningful behavioral assertions.
