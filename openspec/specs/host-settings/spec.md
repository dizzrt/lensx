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
and language settings. `Plugins` MUST display only a localized empty
placeholder and MUST NOT display fabricated plugin data or provide install,
enable, disable, uninstall, permission, or marketplace operations.

#### Scenario: View the preferences section

- **WHEN** the user opens the settings page and enters `Preferences`
- **THEN** the page displays the color-theme setting
- **THEN** the page displays the language setting
- **THEN** every setting and control has a localized label and accessible name

#### Scenario: View the plugins section

- **WHEN** the user enters the `Plugins` section of the settings page
- **THEN** the page displays a localized empty placeholder stating that there
  is currently no manageable content
- **THEN** the page does not display a plugin list, plugin state, or plugin
  management operation

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
