# Frontend Foundation Specification

## Purpose

Define the accepted frontend foundation for the lensX application shell,
application-level providers, localization, theming, error isolation, styling,
and removal of unused scaffold behavior.

## Requirements

### Requirement: The application must provide a product-owned React root interface

The frontend application MUST render a product-owned, semantic, and accessible
Launcher App Shell. It MUST NOT continue to display build-tool welcome copy,
example interactions, presentation-layer mock features, a standalone product
title, or product-description copy. In a unified top region, the App Shell
MUST display either the search input or page context and MUST display a circular
avatar placeholder at the far right. The avatar MUST be a non-interactive
decorative element and MUST NOT provide account, menu, notification, click,
hover, focus, or accessible-action semantics.

When no page is active, an empty normalized query MUST select the `home`
presentation state, and a non-empty normalized query MUST select the `search`
presentation state. In its shared content region, `home` MUST display the real
Recent and Pinned Action collections in that order and MUST display a
non-interactive All placeholder beside the Pinned heading. It MUST NOT populate
collections with simulated Actions, Registry default order, recommendations, or
marketplace content. `search` MUST display and operate a single Search Results
grid of real registered Actions. The App Shell MUST request the fixed height for
the current presentation state through a typed Host boundary so the shared
content region remains visible. It MUST NOT resize the window from DOM
measurements or Action and search-result counts.

When a validated page is active, the `page` presentation state MUST take
precedence over the query. A non-searchable page-context bar in the same top
slot as the search input MUST replace the editable launcher input, and the
shared content region MUST display the active page. In the current locale, the
context bar MUST identify the owner and the name of the Action that opened the
page and MUST provide an accessible close icon button that returns to `home`.
The App Shell MUST NOT present the avatar, All placeholder, plugin entry points,
or other unimplemented capabilities as actionable features.

#### Scenario: Start the application

- **WHEN** the React application completes its root render with no active page
  and an empty normalized query
- **THEN** the page contains an accessible main content region
- **THEN** the top region displays a launcher input with an accessible name and
  localized placeholder
- **THEN** the far right of the top region displays a non-interactive circular
  avatar placeholder
- **THEN** the shared content region displays the Recent and Pinned sections of
  the home presentation state
- **THEN** All appears beside the Pinned heading but is not a button, link, or
  focusable element
- **THEN** the App Shell requests the fixed `home` presentation height and the
  home content remains visible in the main window
- **THEN** the page does not display a lensX title or description, Rsbuild
  welcome copy, example interactions, search results, or fabricated
  recommendations

#### Scenario: Search from the launcher input

- **WHEN** a user enters or deletes text in the launcher input while no page is
  active
- **THEN** the input reflects the current text through local React state
- **THEN** a non-empty normalized query selects the search presentation state
  and is evaluated against a real immutable Action Registry snapshot
- **THEN** the page displays only the accepted Action Search result grid or
  accepted localized empty state
- **THEN** the App Shell requests the fixed `search` presentation height and
  does not change that height based on the number of results
- **THEN** restoring an empty normalized query selects the home presentation
  state and displays real Action collections

#### Scenario: Operate a real Action result

- **WHEN** the current query matches a registered and enabled Action
- **THEN** the page exposes that result through accessible keyboard and pointer
  interaction
- **THEN** executing the result routes its `action_id` through the Host
  Dispatcher instead of calling an executor from React

#### Scenario: Enter a validated page

- **WHEN** a trusted Host executor successfully opens a validated page
- **THEN** the App Shell clears the query, search results, and search selection
- **THEN** the App Shell selects the page presentation state
- **THEN** the top slot displays a non-editable page-context bar instead of the
  launcher input
- **THEN** the context bar displays the owner name, opening Action name, and a
  close icon button
- **THEN** the circular avatar remains visible and non-interactive
- **THEN** the shared content region displays the active page
- **THEN** the App Shell requests the fixed `page` presentation height so the
  context bar and content region are visible together

#### Scenario: Close the active page

- **WHEN** the user activates the close icon button in the page-context bar
- **THEN** the App Shell clears the active page and returns to the home
  presentation state
- **THEN** the App Shell requests the fixed `home` presentation height
- **THEN** keyboard focus returns to the launcher input

#### Scenario: Page preflight fails

- **WHEN** a Host Action requests a missing or unavailable page before the App
  Shell enters the page state
- **THEN** the current home or search presentation state remains unchanged
- **THEN** the current query and selection remain unchanged
- **THEN** the user receives localized, safe failure feedback

#### Scenario: Inspect non-interactive placeholders

- **WHEN** a user or assistive technology inspects the Launcher App Shell
- **THEN** the avatar and All placeholder have no button, link, menu-trigger, or
  keyboard-focus semantics
- **THEN** the page does not describe either placeholder as providing account,
  navigation, or management capabilities

#### Scenario: Inspect unavailable features

- **WHEN** a user views the Launcher App Shell
- **THEN** the page does not display simulated Actions, recommendations,
  marketplace content, or unimplemented plugin entry points
- **THEN** Recent and Pinned display only real Actions resolved from the
  accepted Launcher Action collections
- **THEN** the page does not describe planned capabilities as implemented

### Requirement: The unified top drag region must preserve App Shell interaction semantics

The App Shell MUST treat the complete top surface shared by the `home`,
`search`, and `page` presentation states as one consistent window drag region
while preserving the existing product semantics, accessibility, and keyboard
behavior of elements within that region. A stationary primary-mouse click on
the search input MUST continue to focus the input and permit caret placement.
A primary-mouse drag MUST initiate window movement and MUST NOT modify the
query. Keyboard input, IME composition, and keyboard text selection MUST NOT
initiate window dragging.

The page close control MUST remain an accessible button and MUST be excluded
from drag gestures. The avatar MUST remain a non-clickable, non-focusable
decorative element hidden from assistive technology; allowing a drag to start
from the avatar MUST NOT give it button, link, menu, or account semantics. This
behavior MUST remain consistent in English and Simplified Chinese and in light
and dark themes, and MUST NOT introduce new user-visible copy or persistent
visual fills.

#### Scenario: Click the search input without moving the pointer

- **WHEN** the user clicks the search input with the primary mouse button and
  does not move the pointer
- **THEN** the search input gains or retains focus
- **THEN** the caret can be placed at the clicked position
- **THEN** the system does not modify the query or execute an Action

#### Scenario: Drag the window from the search input

- **WHEN** the user holds the primary mouse button inside the search input and
  moves the pointer
- **THEN** the App Shell requests native window dragging
- **THEN** the search input remains editable and the current query is unchanged
- **THEN** the gesture is not required to perform mouse text-range selection

#### Scenario: Edit and select the query with the keyboard

- **WHEN** the search input has focus and the user enters text, performs IME
  composition, or selects text with the keyboard
- **THEN** the input continues to follow the existing controlled-search
  behavior
- **THEN** the App Shell does not request window dragging

#### Scenario: Close the active page from the page state

- **WHEN** the user activates the page-context close control with a pointer or
  keyboard
- **THEN** the close control does not request window dragging
- **THEN** the App Shell returns to the `home` state and restores focus to the
  search input

#### Scenario: Inspect avatar semantics

- **WHEN** a user or assistive technology inspects the decorative avatar that
  supports starting a window drag
- **THEN** the avatar has no button, link, menu-trigger, or keyboard-focus
  semantics
- **THEN** dragging from the avatar does not invoke account, navigation, or
  management behavior

#### Scenario: Switch localization and theme

- **WHEN** the App Shell renders the unified top region in English or Simplified
  Chinese and in light or dark theme
- **THEN** the same drag and exclusion rules continue to apply
- **THEN** the top region retains its continuous-surface appearance without a
  persistent drag-indicator fill or new copy

#### Scenario: The window drag boundary rejects a request

- **WHEN** the App Shell requests window dragging and the Host boundary rejects
  the request
- **THEN** the search input, query, Action selection, active page, and focus
  state are not cleared
- **THEN** the App Shell remains usable through its existing keyboard and
  pointer interactions

### Requirement: Active pages must isolate content failures and preserve navigation

The shared content region MUST isolate failures that occur after entering an
active page. Page loading, rendering, or runtime failures MUST preserve the
page presentation state, page-context header, and close control. The failure
view MUST use the current locale and theme and MUST NOT expose error stacks or
internal implementation details.

#### Scenario: Active page content fails

- **WHEN** the active page fails during loading, rendering, or runtime
- **THEN** the shared content region displays a localized and accessible page
  failure view
- **THEN** the page-context header and close control remain available
- **THEN** the App Shell does not automatically return to the home state
- **THEN** the failure view does not display an error stack

#### Scenario: Leave a failed page

- **WHEN** the user activates the close control while the page failure view is
  visible
- **THEN** the App Shell clears the failed active page and returns to the home
  state
- **THEN** keyboard focus returns to the launcher input

### Requirement: The application must provide a unified global provider foundation

The frontend application MUST provide application localization, theme, Semi
Design locale, and error isolation through a single root provider composition.
Subsequent pages MUST reuse the global context supplied by this composition and
MUST NOT create parallel sources of truth for the application locale or theme.

#### Scenario: Render the root application

- **WHEN** the frontend entry point renders the App
- **THEN** the App is inside the unified application localization, theme, and
  Semi Design locale contexts
- **THEN** the App subtree is inside the application error boundary

#### Scenario: A subsequent page consumes global context

- **WHEN** a child page of the App Shell reads the application locale or theme
- **THEN** the page receives the current value from the root provider
- **THEN** the page does not need to create an independent global provider

### Requirement: The application must support light and dark themes

The application MUST support `light` and `dark` theme modes and MUST use
`light` by default. It MUST use the global theming mechanism supported by Semi
Design so that application content and overlays use consistent theme tokens.
Application-owned styles MUST NOT hard-code background, text, or border colors
that only work in one theme.

#### Scenario: Use the default theme

- **WHEN** the application does not receive an explicit theme value
- **THEN** the application renders in `light` mode
- **THEN** the document color scheme is consistent with light mode

#### Scenario: Switch to the dark theme

- **WHEN** the application theme changes to `dark`
- **THEN** the App Shell and Semi Design components use dark theme tokens
- **THEN** Semi Design content mounted in the global overlay container also
  uses the dark theme
- **THEN** the document color scheme is consistent with dark mode

#### Scenario: Restore the light theme

- **WHEN** the application theme changes from `dark` to `light`
- **THEN** the App Shell and Semi Design components resume using light theme
  tokens
- **THEN** no attribute that places global content in dark mode remains

### Requirement: The application must support English and Simplified Chinese localization

The application MUST provide the `en-US` and `zh-CN` locales and MUST use
`en-US` by default. The application locale MUST drive product messages, Semi
Design built-in copy, and the HTML document language together. English messages
MUST be the canonical source, and the Simplified Chinese resource MUST contain
the same semantically aligned message keys.

#### Scenario: Use the default locale

- **WHEN** the application does not receive an explicit locale
- **THEN** product copy uses English messages
- **THEN** Semi Design uses its English locale
- **THEN** the HTML document language is `en-US`

#### Scenario: Switch to Simplified Chinese

- **WHEN** the application locale changes to `zh-CN`
- **THEN** product copy uses Simplified Chinese messages
- **THEN** Semi Design uses its Simplified Chinese locale
- **THEN** the HTML document language is `zh-CN`

#### Scenario: Switch back to English

- **WHEN** the application locale changes from `zh-CN` to `en-US`
- **THEN** product messages, Semi Design built-in copy, and the HTML document
  language all return to English

### Requirement: User-visible product copy must be managed by application localization

All user-visible product titles, descriptions, errors, and action copy MUST
come from the application message resources. React components MUST NOT add
untranslatable product copy. The Semi Design locale MUST only supply built-in
component copy and MUST NOT replace application product messages.

#### Scenario: Render product copy

- **WHEN** the App Shell displays a product description or action copy in
  addition to its title
- **THEN** the copy comes from the application messages for the current locale

#### Scenario: Render Semi Design built-in copy

- **WHEN** a Semi Design component needs to display built-in copy
- **THEN** the copy comes from the Semi Design locale pack corresponding to the
  application locale
- **THEN** application messages are not carried by modifications to a component
  library locale pack

#### Scenario: Validate locale resources

- **WHEN** the project runs frontend tests or static validation
- **THEN** the English and Simplified Chinese resources contain identical
  message-key sets

### Requirement: The root application must isolate rendering failures and provide recovery

The application MUST catch rendering failures in the App Shell subtree. It MUST
display an accessible failure fallback and recovery action in the current
locale, and MUST NOT directly expose error stacks or internal implementation
details to users.

#### Scenario: A child subtree fails to render

- **WHEN** the App Shell subtree throws an error during rendering
- **THEN** the application displays a localized error title, description, and
  recovery action
- **THEN** the fallback continues to use the current theme
- **THEN** the page does not display an error stack

#### Scenario: A user performs the recovery action

- **WHEN** a user activates the recovery action in the error fallback
- **THEN** the application requests a reload of the current window

### Requirement: Frontend styles must follow the UnoCSS and Less division of responsibility

The frontend MUST use UnoCSS for simple, local layout, spacing, sizing, and
alignment. It MUST use Less for global base rules, complex semantic styles,
state combinations, theme-token bridging, and reusable styles. The application
MUST import the Semi Design global styles exactly once at the application entry
point and MUST NOT retain a template CSS entry that conflicts with this
division.

#### Scenario: Implement App Shell layout

- **WHEN** the App Shell only needs flex, sizing, spacing, or alignment styles
- **THEN** the implementation uses UnoCSS utilities or a project shortcut

#### Scenario: Implement global or complex styles

- **WHEN** styles cover root-element resets, theme variables, complex states,
  or reusable semantics
- **THEN** the implementation uses the project Less entry point

#### Scenario: Load global component styles

- **WHEN** the frontend entry point starts
- **THEN** the Semi Design global styles and the project global Less styles are
  each loaded exactly once

### Requirement: The repository must remove unused scaffold behavior

The repository MUST remove the build-tool welcome page, example tests, example
Tauri command, and type declarations for build plugins that lensX does not use.
It MUST preserve the functioning React, Tauri, testing, and styling toolchain.

#### Scenario: Inspect the frontend scaffold

- **WHEN** a developer searches the current frontend source and tests
- **THEN** no Rsbuild welcome copy or template test for that copy exists
- **THEN** no `*.svg?react` declaration exists solely for an uninstalled SVG
  transformation plugin

#### Scenario: Inspect Tauri commands

- **WHEN** a developer inspects the Rust entry point and registered commands
- **THEN** no example `greet` command or handler registration exists
- **THEN** the Tauri application can still build and start through the existing
  run entry point

### Requirement: The shared page context must use a compact segmented control

When the App Shell displays an active page, it MUST present the page context as
a continuous, content-sized segmented capsule constrained by the available
width. In visual order, the capsule MUST contain an Owner segment, the opening
Action segment, and a close icon button adjacent to the Action. The Owner and
Action segments MUST use decorative diagonal separation and theme-aware
hierarchical fills; they MUST NOT use visible `/` text as a substitute for the
segmented structure.

The Owner segment MUST display the Owner name resolved for the current locale
and an Owner icon. If the Owner icon is missing or cannot be resolved, the
system MUST display a stable generic-provider fallback, and the view component
MUST NOT hard-code icon branches based on Owner IDs. The Action segment MUST
display the name of the Action that opened the current page. The system MUST
NOT use an Action icon as the Owner icon.

The Owner and Action segments MUST remain non-interactive and non-focusable and
MUST NOT expose button, link, menu, or breadcrumb-navigation semantics. The
close icon button MUST remain visible, support pointer and keyboard operation,
have an accessible name in the current locale, and remain excluded from native
window dragging. The complete page-context slot outside the segmented capsule
MUST continue to support window dragging.

The segmented capsule MUST use application theme tokens and preserve clear
text, icons, hierarchical fills, hover states, and keyboard-focus states in
English, Simplified Chinese, light theme, and dark theme. When an Owner or
Action name exceeds the available width, the system MUST constrain and elide
the text while preserving the complete close button and the non-interactive
avatar placeholder at the right.

#### Scenario: Display a page context

- **WHEN** the App Shell enters the `page` presentation state with a resolved
  Owner and opening Action
- **THEN** the top slot displays a content-sized continuous segmented capsule
  containing the Owner, Action, and close button
- **THEN** the close button is adjacent to the Action instead of being pushed
  to the far end of the page-context slot
- **THEN** a decorative diagonal separator appears between the Owner and Action
  without visible `/` text

#### Scenario: Resolve a missing Owner icon

- **WHEN** the page context has no Owner icon or has an unrecognized Owner icon
  token
- **THEN** the Owner segment displays the stable generic-provider fallback
- **THEN** the system does not use an Action icon as the Owner icon
- **THEN** the page can still return to Home through the close button

#### Scenario: Constrain long localized context

- **WHEN** the Owner name or Action name exceeds the page-context width in the
  current locale
- **THEN** the corresponding text contracts and is elided within its segment
- **THEN** the close button remains fully visible and operable
- **THEN** the non-interactive avatar placeholder remains visible at the right

#### Scenario: Inspect page-context interaction semantics

- **WHEN** a user or assistive technology inspects the segmented page context
- **THEN** the Owner and Action segments expose no button, link, menu, or
  keyboard-focus semantics
- **THEN** the close button is the only focusable operation in the page context
- **THEN** a primary-mouse drag beginning on a non-interactive segment or the
  surrounding slot still requests native window movement
- **THEN** pointer or keyboard operation beginning on the close button does not
  request window movement

#### Scenario: Render supported themes and locales

- **WHEN** the App Shell displays the segmented page context in English or
  Simplified Chinese and in light or dark theme
- **THEN** the Owner and Action segments use semantic fills and text tokens
  from the current theme
- **THEN** the close button remains distinguishable in its default, hover, and
  keyboard-focus states
- **THEN** the top drag surface outside the capsule gains no persistent fill

### Requirement: Launcher Action tiles must keep a square interaction surface

Action tiles in Recent, Pinned, and Search MUST contain their icon and title
within one interaction surface whose width and height are equal. The complete
surface MUST activate the primary operation, and hover, focus, and selected
states MUST follow the same square boundary and corner radius. Title length
and state changes MUST NOT alter tile dimensions or neighboring tile positions
and MUST NOT scale the icon.

Home MUST retain eight columns per collection and display at most eight valid
Actions in their confirmed order; Search MUST retain four columns, at most
eight results, and at most two rows. Square side lengths MAY differ between
surfaces according to their column widths, but MUST be uniform within the same
grid. Remaining row height MUST NOT stretch tiles into rectangles, and text
or item count MUST NOT change native window dimensions. Idle tiles MUST retain
the continuous surface background; only existing interaction states use theme
fills.

#### Scenario: Home collections contain their maximum number of Actions

- **WHEN** Recent and Pinned each contain eight displayable Actions with titles
  of different lengths
- **THEN** each collection displays eight square Actions in the confirmed
  order within the existing Home window
- **THEN** both collections retain eight columns, and short-title and
  long-title tiles have the same side length
- **THEN** clicking, hovering, and keyboard focus correspond to the complete
  surface containing both icon and title

#### Scenario: Search fills two rows

- **WHEN** Search returns eight results displayed in two rows
- **THEN** results retain four columns, and each Action has equal width and
  height
- **THEN** selected, pending, or error feedback does not stretch tiles into
  rectangles or change native window dimensions
- **THEN** result identity, order, four-column arrow-key offsets, and execution
  continue to follow the existing search contract

#### Scenario: A collection or search result is empty

- **WHEN** a Home collection is empty, or a non-empty query has no results
- **THEN** the interface continues to display the corresponding localized empty
  state
- **THEN** the interface does not fabricate Actions or name tooltips to occupy
  square positions

### Requirement: Launcher Action titles must adapt within a bounded single-line font size

Every Action title MUST remain on one line and MUST use the complete current
localized title as its fitting input. A title that fits completely at `14px`
MUST use `14px`; otherwise, the system MUST use actual text and available
width measurements to select the largest fitting font size in the continuous
`12–14px` range, allowing bounded fractional precision error. The system MUST
NOT choose font sizes solely by character count or restrict output to
predefined integer-size steps.

Only when the complete title still exceeds the available width at `12px` MUST
the system keep `12px` and display trailing ellipsis. The system MUST NOT
automatically rewrite, remove words from, or permanently truncate title data.
The icon, title line height, and alignment MUST remain stable, and the
accessible name MUST always contain the complete current title.

The system MUST recalculate fitting when the title, display language, font
metrics, or effective available width changes, including restoring `14px`
after a smaller size. When valid dimensions are temporarily unavailable, the
interface MUST retain an operable single-line fallback and the complete
accessible name. It MUST recalculate fitting after valid dimensions recover
and MUST NOT retain stale measurement results.

#### Scenario: The title fits at the maximum size

- **WHEN** the complete title does not exceed the available width at `14px`,
  including the exact-fit boundary
- **THEN** the title displays completely at `14px` without ellipsis
- **THEN** no tooltip for completing a truncated name is displayed

#### Scenario: The title fits at an intermediate size

- **WHEN** the complete title exceeds the available width at `14px` but fits
  at an intermediate size above `12px`
- **THEN** the title displays completely at the largest fitting size within
  the range
- **THEN** fitting permits fractional font sizes and does not lose displayable
  characters through premature ellipsis

#### Scenario: The title still overflows at the minimum size

- **WHEN** a complete Chinese, English, or mixed-language title still exceeds
  the available width at `12px`
- **THEN** the title displays on one line at `12px` with trailing ellipsis
- **THEN** the complete title remains the accessible name and full-name
  tooltip content

#### Scenario: Localization or available width changes

- **WHEN** the title, language, font metrics, or container width changes
- **THEN** the system recalculates font size and truncation from the new actual
  text and dimensions
- **THEN** a new title that fits at `14px` restores the maximum size and does
  not retain the old truncation tooltip
- **THEN** a missing Chinese title continues to use the existing English
  fallback without changing Action identity

#### Scenario: Measurement becomes temporarily unavailable

- **WHEN** the title container temporarily has no valid width or text
  measurement is temporarily unavailable
- **THEN** the tile's primary operation remains usable, and its title retains
  one line and the complete accessible name without an invalid font size
- **THEN** invalid dimensions are not permanently classified as truncation
- **THEN** valid dimensions trigger fitting recovery without persistent tile
  movement caused by measurement retries

### Requirement: Truncated Action names must remain available to pointer and keyboard users

When a title is actually elided at the minimum font size, the system MUST
provide a name tooltip showing the complete current title. Home MUST provide
the tooltip when the pointer hovers over an Action or its primary button has
keyboard focus. Search MUST provide it when the pointer hovers over a result
or the input retains focus and that result is selected, including the default
first selection. A fully displayed title MUST NOT trigger a completion tooltip
merely because its font size was reduced.

The same Home or Search surface MUST display at most one name tooltip;
Home's Recent and Pinned collections MUST share this limit. The pointer's
hovered item MUST take precedence over the keyboard-focused or selected item;
leaving it MUST restore a still-valid keyboard tooltip candidate. A tooltip
MUST always correspond to the current triggering tile instance, even when the
same Action appears in both Recent and Pinned.

Tooltips MUST NOT introduce a Tab stop, take focus, modify the query, change
Action selection, or trigger execution. Search input focus, active descendant,
status association, arrow keys, Enter, Escape clearing, and IME priority MUST
retain their existing semantics. Home users MUST be able to dismiss a tooltip
with Escape without executing an Action, and it MUST NOT automatically reopen
until the trigger conditions are re-established.

Tooltips MUST show the complete text, permit long names to wrap, and avoid
clipping by tiles within the current window. They MUST use existing language
resolution and light/dark themes; the overlay itself MUST NOT introduce
operation buttons or new product copy. An invalid trigger, query clearing,
surface transition, or title that is no longer truncated MUST close the old
tooltip; keyboard blur MUST clear the keyboard candidate. Moving the pointer
from a tile into its tooltip MUST keep the name readable until the pointer
leaves both or the tooltip is explicitly dismissed.

#### Scenario: Read a truncated Home title with the pointer

- **WHEN** the user hovers over the Action corresponding to an elided title
- **THEN** its tooltip displays the complete current title, with wrapping
  available even for a continuous long word
- **THEN** the tile does not change size, font size, or position, and no click
  is required to display the name
- **THEN** entering the tooltip with the pointer keeps it readable, and leaving
  updates the tooltip according to the current valid focus candidate

#### Scenario: Read a truncated Home title with the keyboard

- **WHEN** the user focuses the primary button of an Action with an elided
  title through the keyboard
- **THEN** a full-name tooltip appears while the primary button retains focus
  and its complete accessible name
- **THEN** Enter and Space continue to execute the existing primary operation,
  and the tooltip itself does not enter the Tab order
- **THEN** Escape dismisses only that name tooltip, which does not immediately
  reopen before the trigger conditions are re-entered

#### Scenario: Read a selected Search title without moving input focus

- **WHEN** the search input retains focus and the default first or
  arrow-key-selected result has an elided title
- **THEN** the tooltip displays that result's complete title without moving
  focus to the result or tooltip
- **THEN** the input's status association and active descendant remain correct
- **THEN** arrow-key selection updates the tooltip according to the new
  truncation state and removes the old tooltip

#### Scenario: Pointer and keyboard candidates coexist

- **WHEN** keyboard focus or search selection corresponds to a truncated title
  and the pointer enters another Action
- **THEN** only the pointer's Action is eligible to show a tooltip, and no
  tooltip appears if its title is not elided
- **THEN** leaving that Action and its tooltip restores a still-valid keyboard
  candidate
- **THEN** the same Action appearing in Recent and Pinned does not produce two
  overlays or duplicate tooltip identifiers

#### Scenario: Search keyboard handling remains authoritative

- **WHEN** a name tooltip is visible and the user presses Escape, Enter, or an
  arrow key in the search input
- **THEN** the existing IME priority continues to determine behavior during
  composition or candidate confirmation
- **THEN** outside IME handling, one Escape still clears search and closes the
  tooltip, Enter still executes the selected Action, and arrows still move
  according to the existing rules
- **THEN** the tooltip does not consume a key and require an additional search
  exit operation or break pending execution deduplication

#### Scenario: A tooltip candidate becomes stale

- **WHEN** an Action is removed, the query clears, the surface changes, the
  title updates to one that is no longer elided, or its tile unmounts
- **THEN** the old name tooltip closes and does not continue displaying the old
  title
- **THEN** blur of the input or Home primary button clears its keyboard
  candidate while an independently valid pointer candidate still follows the
  arbitration rules

#### Scenario: Localization and theme change while reading a name

- **WHEN** the user reads a name tooltip under `en-US` or `zh-CN` and light or
  dark mode, or changes locale or theme while it is visible
- **THEN** the tooltip displays the complete currently resolved title and uses
  the current theme
- **THEN** the title's newly fitted truncation state determines whether the
  tooltip remains visible
- **THEN** accessible naming, focus, and execution semantics remain usable
