# Host Settings Specification

## Purpose

Define the accepted Host-owned settings page, its initial preferences and
plugins sections, supported theme and locale values, and the Rust/Tauri
persistence boundary for application preferences.

## Requirements

### Requirement: Settings must be provided as a Host-owned capability

The application MUST implement settings as a Host page with owner
`lensx.core` and page ID `settings`. Settings MUST render in the shared content
region of the existing Tauri main window. It MUST NOT create a separate Tauri
settings window and MUST NOT register, label, or execute settings as a plugin.

While settings is active, the App Shell MUST replace the launcher input in the
unified top slot with a non-searchable page-context bar. In the current locale,
the context bar MUST display the Host owner name and the name of the Action that
opened the page, and MUST provide an accessible close icon button. It MUST NOT
display the former standalone settings title, opening-source description, or
text Close button. The avatar placeholder on the right MUST remain visible and
non-interactive. The existing preferences and plugins content and the
PageErrorBoundary MUST remain in the shared content region.

#### Scenario: Open the settings page

- **WHEN** the `lensx.core.open_settings` Action successfully opens settings
- **THEN** the shared content region of the existing main window displays the
  Host settings page
- **THEN** the active page identity has `owner_id` equal to `lensx.core`
- **THEN** the active page identity has `page_id` equal to `settings`
- **THEN** the top context bar displays the localized Host owner name and the
  Action name that opened settings
- **THEN** the context bar displays an accessible close icon button and the
  avatar remains a non-interactive placeholder
- **THEN** the main window uses the fixed `page` presentation height so the
  page-context bar and settings content region are both visible
- **THEN** the application has not created a second Tauri window

#### Scenario: Switch locale while settings is open

- **WHEN** the settings page is active and the user successfully switches the
  application locale
- **THEN** the owner name and Action name in the context bar update to the new
  locale
- **THEN** the context does not depend on stale display strings copied when the
  page opened

#### Scenario: Close settings

- **WHEN** the user activates the context bar's close icon button
- **THEN** the App Shell closes settings and returns to the home presentation
  state
- **THEN** keyboard focus returns to the launcher input
- **THEN** the avatar placeholder receives no focus and triggers no action

#### Scenario: Inspect settings runtime ownership

- **WHEN** the Host registers the settings Action and settings page
- **THEN** settings does not depend on a plugin manifest, plugin lifecycle, or
  plugin runtime
- **THEN** the settings page provider and execution entry point remain inside
  the trusted Host boundary

### Requirement: The first settings version must contain preferences and plugins sections

The settings page MUST provide localized and accessible top-level
`Preferences` and `Plugins` sections in a vertical navigation on the left.
`Preferences` MUST be selected by default when settings opens, and the right
pane MUST display only the currently selected section. The navigation MUST
expose a localized accessible name, the current selection, and visible focus,
and it MUST support keyboard and pointer selection.

`Preferences` MUST contain color-theme and language settings. Each setting
MUST use an accessible single-select control instead of displaying every
option persistently side by side. User-visible descriptions MUST explain only
the observable purpose of each setting and MUST NOT expose the Host, a
component library, or another internal implementation detail. In every
interface locale, the language select MUST display `en-US` as `English` and
`zh-CN` as `简体中文`; language names MUST NOT be translated according to the
current interface locale.

`Plugins` MUST provide the Host-owned local plugin management capability from
the `plugin-management-settings` specification and MUST render only current
Registration facts and operations exposed by trusted typed services. It MUST
NOT display fabricated plugin data, expose plugin management to plugin code,
or provide marketplace and remote-distribution operations.

#### Scenario: View the default Preferences section

- **WHEN** the user opens the settings page
- **THEN** the left navigation exposes Preferences as the current selection
- **THEN** the right pane displays the color-theme and language settings
- **THEN** every setting and control has a localized label and accessible name
- **THEN** each setting displays one current selection and reveals the other
  candidates only when its select is expanded

#### Scenario: View language choices in either interface locale

- **WHEN** the user expands the language select in the `en-US` or `zh-CN`
  interface
- **THEN** the `en-US` option is displayed as `English`
- **THEN** the `zh-CN` option is displayed as `简体中文`

#### Scenario: Read the preference descriptions

- **WHEN** the user reads the color-theme and language descriptions in the
  `en-US` or `zh-CN` interface
- **THEN** the color-theme description explains only that it selects the lensX
  appearance and the language description explains only which language lensX
  uses
- **THEN** neither description mentions the Host, Semi Design, a component
  library, or another internal implementation detail

#### Scenario: Switch top-level sections with the keyboard

- **WHEN** the user selects Plugins from Preferences with the keyboard
- **THEN** the left navigation exposes Plugins as the current selection and
  retains visible focus
- **THEN** the right pane displays the current Plugin Management content
  without creating another Host page or window

#### Scenario: View the plugins section without registrations

- **WHEN** the user enters the `Plugins` section and the current available
  Registration snapshot is empty
- **THEN** the page displays a localized empty state and the trusted local
  installation entry point
- **THEN** the page does not fabricate plugin content or present Manager
  degradation as an ordinary empty state

#### Scenario: View the plugins section with registrations

- **WHEN** the user enters the `Plugins` section and the current available
  Registration snapshot contains entries
- **THEN** the page displays the current plugin list and permits selection of a
  revision-consistent Host-owned detail
- **THEN** lifecycle, replacement and data controls remain inside the trusted
  Host settings boundary and no marketplace operation is displayed

#### Scenario: Switch locale while settings is open

- **WHEN** the user successfully switches the application locale
- **THEN** the left navigation, right-pane section heading, and current
  settings content update together to the new locale
- **THEN** the current section and keyboard-focus semantics remain stable

### Requirement: Settings must separate the shared header, navigation, and content with themed boundaries

When the `lensx.core/settings` Host page is active, the App Shell MUST display
a horizontal boundary across the content width between the shared page-context
header and the settings content. Settings MUST use a left top-level navigation
and a right current-section pane, separated by a vertical boundary that extends
from below the header to the bottom of the content. The boundaries MUST use
supported application theme tokens, remain distinguishable in light and dark
themes, and MUST NOT present the header, navigation, or content as separate
persistent cards.

The layout MUST retain the fixed `650×600` Host page presentation. The right
pane MUST scroll independently within its available height, and long content
MUST NOT enlarge the native window, cover the shared header, or move the left
navigation outside the available area. The settings-specific layout MUST NOT
change Home, Search, another Host page, or a Plugin page.

#### Scenario: Open settings

- **WHEN** `lensx.core/settings` becomes active in the fixed Host page surface
- **THEN** a complete horizontal boundary separates the shared header from the
  settings content
- **THEN** a continuous vertical boundary separates the left navigation from
  the right pane
- **THEN** the right pane displays Preferences by default while the native
  window retains the `650×600` Host page presentation

#### Scenario: Show long content in the fixed viewport

- **WHEN** the current settings section exceeds the height available to the
  right pane
- **THEN** the right pane can scroll independently and remains readable
- **THEN** the shared header, left navigation, horizontal boundary, and vertical
  boundary remain stable

#### Scenario: Switch between light and dark themes

- **WHEN** the application switches between light and dark themes while
  settings is visible
- **THEN** the horizontal boundary, vertical boundary, navigation selection,
  and focus state use the corresponding theme tokens
- **THEN** the boundaries and interaction states do not communicate meaning by
  color alone

#### Scenario: Open another page

- **WHEN** the App Shell displays Home, Search, another Host page, or a Plugin
  page
- **THEN** the settings-specific split-layout modifier is not applied
- **THEN** those surfaces retain their existing layout and presentation
  semantics

### Requirement: Preferences must use supported theme and locale values

The color-theme setting MUST accept only `light` or `dark`, and the language
setting MUST accept only `en-US` or `zh-CN`. The preferences page MUST reuse
the root theme and localization providers and MUST NOT create page-private
global sources for theme or locale.

#### Scenario: Switch the color theme

- **WHEN** the user selects a supported color theme different from the current
  value in settings
- **THEN** the application requests persistence of a complete preference
  snapshot containing the new theme
- **THEN** the root theme provider switches to the selected theme after
  persistence succeeds
- **THEN** the settings page, App Shell, and Semi Design content use the same
  theme

#### Scenario: Switch the application locale

- **WHEN** the user selects a supported locale different from the current
  value in settings
- **THEN** the application requests persistence of a complete preference
  snapshot containing the new locale
- **THEN** the root localization provider, Semi Design locale, and document
  language switch together after persistence succeeds
- **THEN** the settings page and page-context header use product copy in the
  new locale

#### Scenario: Submit an unsupported preference value

- **WHEN** the frontend or persistence boundary receives a theme or locale
  value outside the supported enumerations
- **THEN** the system rejects the value and returns a diagnosable error
- **THEN** the root providers retain the last successfully confirmed values

### Requirement: Application preferences must persist through a Rust/Tauri boundary

Rust MUST own a serializable `AppPreferences` value containing `theme_mode`
and `locale`. The application MUST read and write complete preferences through
typed Tauri commands. If the preferences file is missing, the application MUST
use `light` and `en-US` defaults. Reads and writes MUST validate enumeration
values, and writes MUST avoid leaving a partial file.

#### Scenario: First launch without a preferences file

- **WHEN** the application cannot find a preferences file during startup
- **THEN** Rust returns `theme_mode = light` and `locale = en-US`
- **THEN** AppProviders completes the initial product render with those defaults

#### Scenario: Restore saved preferences during startup

- **WHEN** the application reads valid saved preferences during startup
- **THEN** AppProviders uses the saved theme and locale for the initial product
  App render
- **THEN** the user does not need to reselect the last preferences confirmed as
  saved

#### Scenario: Save preferences successfully

- **WHEN** Rust receives a valid complete preference snapshot and completes an
  atomic write successfully
- **THEN** the command returns the preferences confirmed as saved
- **THEN** subsequent reads return the same theme and locale

#### Scenario: Reading preferences during startup fails

- **WHEN** the preferences file is unreadable, malformed, or contains an
  invalid enumeration value
- **THEN** Rust returns a serializable error with a stable code and safe message
- **THEN** the frontend continues startup with the default theme and locale
- **THEN** the frontend retains the error for localized, diagnosable feedback

#### Scenario: Saving preferences fails

- **WHEN** Rust cannot validate or atomically write new preferences
- **THEN** Rust returns a serializable error with a stable code and safe message
- **THEN** the frontend does not update the root providers
- **THEN** the settings controls retain or restore the last values confirmed as
  saved
- **THEN** the page displays localized failure feedback and does not claim that
  saving succeeded

### Requirement: The Host settings context must use lensX Owner presentation

When the Host settings page is active, the page-context Owner segment MUST
display the lensX Host name for the current locale and the Host-controlled
lensX Owner icon. The Action segment MUST display the name of the Action that
opened settings, and the close icon button MUST be adjacent to the Action. The
system MUST present lensX as the Host Owner of the settings page and MUST NOT
represent settings as a plugin or depend on plugin Manifest presentation data.

The settings page context MUST reuse the shared segmented page context's Owner
icon fallback, theme, localization, text-constraint, accessibility, and window-
dragging rules. The settings-gear Action icon MUST NOT replace the lensX Owner
icon.

#### Scenario: Open Host settings from its Action

- **WHEN** the `lensx.core.open_settings` Action successfully opens
  `lensx.core/settings`
- **THEN** the Owner segment displays the lensX Host name and lensX Owner icon
- **THEN** the Action segment displays the opening settings Action name in the
  current locale
- **THEN** the close icon button is adjacent to the Action and has a localized
  accessible name for returning to Home
- **THEN** the settings page remains in the shared content region of the
  existing main window

#### Scenario: Switch locale while viewing segmented settings context

- **WHEN** the user successfully switches between English and Simplified
  Chinese while settings is open
- **THEN** the lensX Owner name, opening settings Action name, and close-button
  accessible name switch to the current locale
- **THEN** the lensX Owner icon and segmented structure remain stable
- **THEN** the page context does not depend on stale display strings copied
  when the page opened

#### Scenario: Inspect Host ownership of settings context

- **WHEN** a user or assistive technology inspects the Owner segment of the
  settings page
- **THEN** settings is presented as a page owned by the lensX Host rather than
  a plugin page
- **THEN** the Owner segment exposes no plugin navigation, management, or menu
  interaction
- **THEN** the settings-gear Action icon is not presented as the lensX Owner
  icon
