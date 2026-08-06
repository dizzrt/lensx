## MODIFIED Requirements

### Requirement: The settings installation entry point must be accessible, localized, and theme-compatible

The Plugins settings section MUST use the existing application i18n and Semi
Design theme to provide installation guidance, a clearly named accessible
installation button, and asynchronous feedback. While installation is pending,
the UI MUST prevent reentry; cancellation MUST restore idle state without
showing an error; and success and failure MUST use live-status or alert
semantics that do not rely only on color. All product text MUST have canonical
English and a semantically aligned Simplified Chinese translation and MUST
remain readable and focusable in light and dark themes. When this entry point
is composed into the `plugin-management-settings` capability, successful
installation MUST converge through a current Registration snapshot and select
the newly installed plugin without changing the local installation command's
narrow authority.

#### Scenario: User installs with a keyboard

- **WHEN** a keyboard user focuses and activates the local installation button
- **THEN** the native file picker opens and the button cannot be activated again
  while the request is pending
- **THEN** focus and status feedback remain operable and perceivable after the
  dialog returns

#### Scenario: Installation succeeds in plugin management settings

- **WHEN** the adapter returns a valid `installed` result
- **THEN** settings announces success with the plugin ID and version in the
  current locale
- **THEN** the management service refreshes through the shared Registration
  adapter and selects the matching current plugin only after snapshot convergence
- **THEN** the installation capability itself does not fabricate details or
  perform enable, disable, replacement, uninstall, permission or data operations

#### Scenario: Installation fails

- **WHEN** the adapter returns a valid safe error or boundary validation fails
- **THEN** settings displays the corresponding localized failure feedback and
  allows another selection
- **THEN** the UI displays no source path, Host installation path, digest,
  stack, or raw error text

#### Scenario: Locale and theme change

- **WHEN** the installation entry point renders in `en-US` or `zh-CN` with a
  light or dark theme
- **THEN** button, guidance, pending, success, and failure copy follows the
  application locale
- **THEN** controls use supported Semi theme and focus behavior and do not use
  hard-coded color as the only status signal

### Requirement: Local installation must not deliver later plugin capabilities early

This capability MUST deliver only first installation of a local compatible
`.lxp`, its installation entry point, registration notification, and recovery
cleanup. It MUST NOT itself download a remote package, accept a development
directory, upgrade, downgrade, reinstall, enable, disable, uninstall, delete or
clear plugin data, grant permissions, verify signatures or official
provenance, serve plugin resources, create an iframe or Runtime session, invoke
the Host API, or execute plugin code. A trusted Host management page MAY compose
this installation entry point with independently specified lifecycle,
replacement, permission-view and data-management services, but MUST NOT broaden
the installation command or infer those authorities from installation success.

#### Scenario: A plugin finishes installation

- **WHEN** a local `.lxp` has been written and registered successfully
- **THEN** the existing Host metadata projection and management service can
  refresh from the current Registration
- **THEN** this capability does not read the Runtime entry, load resources,
  create an iframe, execute code, grant requested permissions, or perform a
  later lifecycle operation

#### Scenario: User wants to replace or remove an installed plugin

- **WHEN** the user selects replacement or lifecycle controls from the composed
  plugin management page
- **THEN** Task 3.4's replacement service or Task 3.3's lifecycle service owns
  the operation through its independent typed and revision-bound contract
- **THEN** the local installation command neither accepts the request nor gains
  update, uninstall, permission or data-management authority
