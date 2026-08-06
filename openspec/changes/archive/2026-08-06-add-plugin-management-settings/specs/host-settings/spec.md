## MODIFIED Requirements

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
