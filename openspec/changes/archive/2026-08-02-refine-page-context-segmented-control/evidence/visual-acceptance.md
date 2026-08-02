# Segmented page-context visual acceptance

Viewport: `650×600px`. Screenshots were captured from the current Rsbuild page surface. Browser-only Tauri invoke errors affected persistence calls but not the rendered page-context structure or styles. Temporary startup preferences used to reach the required locale and theme states were restored immediately after capture and are not product changes.

## English, light

- Screenshot: `page-context-en-light.png`; keyboard focus: `page-context-en-light-focus.png`.
- The transparent slot is `570×40px`; the capsule is `219.91×36px`, so it shrinks to content instead of filling the slot.
- Owner fill resolves to `rgba(46, 50, 56, 0.09)` and Action fill to `rgba(46, 50, 56, 0.05)`.
- The divider is formed by the segments themselves rather than a pseudo-element: Owner uses `polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)`, while Action uses `polygon(16px 0, 100% 0, 100% 100%, 0 100%)`.
- The parallel `/` edges leave a measured `2px` gap at both the top and bottom. Owner right padding is `26px`; Action left padding is `24px`, so neither label touches the angled edges.
- The close button remains inside the content-sized capsule and the avatar remains `36px` wide at `x=598px`.
- The close button keeps a `32×32px` hit target, while its centered `::before` state layer is `24×24px`, inset by `4px`, and uses `border-radius: 50%`; the `16×16px` icon remains above that layer.
- The button itself stays transparent during hover and active states. Only the smaller circular layer receives `--semi-color-fill-1` (`rgba(46, 50, 56, 0.09)`) on hover and `--semi-color-fill-2` (`rgba(46, 50, 56, 0.13)`) while active.
- Keyboard focus places a circular `2px` `rgb(0, 100, 250)` outline with `-2px` offset on the full button target.

## Simplified Chinese, light

- Screenshot: `page-context-zh-light.png`.
- The capsule is `185.42×36px` inside the same `570×40px` transparent slot.
- The same parallel segment edges retain a `2px` top and bottom gap. The visible `32px` close button begins at `x=167.42px`; the avatar remains at `x=598px`.

## Simplified Chinese, dark

- Screenshot: `page-context-zh-dark.png`.
- `theme-mode=dark` and `color-scheme=dark` are active.
- Owner fill resolves to `rgba(255, 255, 255, 0.16)`, Action fill to `rgba(255, 255, 255, 0.12)`, and text to `rgb(249, 249, 249)`.
- The capsule is `185.42×36px`; the parallel `/` edges retain the measured `2px` gap at both endpoints.
- Close-button and avatar geometry match the light-theme acceptance.

## Long text

- The Action segment retains `min-width: 0` and `max-width: 280px`; its text wrapper resolves to `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`.
- Component and App Shell tests cover the long-text constraint wrapper and the fixed close-button sibling, ensuring truncation cannot consume or obscure the close control.
