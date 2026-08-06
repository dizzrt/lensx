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
`Preferences` and `Plugins` sections. `Preferences` MUST contain color-theme
and language settings. `Plugins` MUST provide the Host-owned local plugin
management capability from the `plugin-management-settings` specification and
MUST render only current Registration facts and operations exposed by trusted
typed services. It MUST NOT display fabricated plugin data, expose plugin
management to plugin code, or provide marketplace and remote-distribution
operations.

#### Scenario: View the preferences section

- **WHEN** the user opens the settings page and enters `Preferences`
- **THEN** the page displays the color-theme setting
- **THEN** the page displays the language setting
- **THEN** every setting and control has a localized label and accessible name

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
